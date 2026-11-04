#!/usr/bin/env node
// Commenter un PDF dans la Lecture (consigne GFS 045 : extensions/lecture-pdf/pdf-anchor.js, extensions/lecture-pdf/pdf-view.js, css de la couche de texte), 700x400, à la vraie souris et au vrai clavier. Un GFS simulé
// (dev-tests/gfs-stub.js, adresse `?gfs=0`) ouvre un PDF fabriqué ici (pdf-lib) et donne pdf.js, comme dans verify-gfs-read.mjs ; ce script lit ce que la personne voit.
//  LA SÉLECTION : un passage sélectionné à la souris dans la couche de texte de pdf.js devient une ancre (la page, deux positions dans le texte de la page, la citation, un peu de texte autour), jamais des pixels ; une sélection
//   qui déborde de la page est coupée à sa fin ; la dernière sélection se garde quand un clic ailleurs la fait perdre au navigateur, et s'oublie par un clic dans le PDF.
//  LES MARQUES : le passage est surligné DANS la couche de texte (le texte du PDF reste lisible dessous), au même endroit que la sélection qui l'a fait naître ; la marque revient à la même place après qu'une page s'est
//   vidée puis redessinée (défilement), après un zoom, en Lecture épurée ; un clic dessus ouvre le fil, un glissé qui y commence non ; deux marques se chevauchent sans se mêler ; « résolu » change l'aspect.
//  LE TEXTE : un PDF a du texte dès qu'une page dessinée en a ; un scan n'en a pas ; une première page blanche suivie de pages de texte ne dit jamais « sans texte ».
// Lancé par run-headless.mjs (groupe Node "gfsComment", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-comment.mjs
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { start, seedModels, pdfjsLibrary, ROOT } from './gfs-page.mjs';

const t = await start({ name: 'verify-gfs-comment', port: Number(process.env.GFS_COMMENT_PORT || 8922) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = text => String(text).replace(/\s+/g, ' ').trim();

const LIB = pdfjsLibrary();
if (!LIB) {
  check('le fichier « pdfjs » du miroir hors-ligne est là (bash dev-tests/offline-deps.sh)', false);
  await t.finish();
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Les PDF des essais : des lignes de texte (une ligne = un morceau de texte pour pdf.js), des pages sans texte (un scan), de petites pages pour qu'on en voie plusieurs à la fois.
const req = createRequire(join(ROOT, 'dev-tests', '.offline-cache', 'x.js'));
const { PDFDocument, StandardFonts, rgb } = req('pdf-lib');
const A4 = [595.28, 841.89];
async function linesPdf(pages, { size = A4, fontSize = 14, gap = 26, top = 50 } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  pages.forEach((lines) => {
    const page = doc.addPage(size);
    if (!lines.length) page.drawRectangle({ x: 40, y: 40, width: 200, height: 80, color: rgb(0.8, 0.85, 0.9) });
    lines.forEach((line, i) => page.drawText(line, { x: 40, y: page.getHeight() - top - i * gap, size: fontSize, font }));
  });
  return Buffer.from(await doc.save());
}
const P1 = ['Facture n° 2026-117', 'Client : Dupont SA', 'Garantie 12 mois sur tout le matériel', 'Total HT : 1 000 €', 'Total TTC : 1 200 €'];
const P2 = ['Conditions de paiement', 'Paiement à 30 jours', 'Garantie 12 mois sur tout le matériel', 'Total HT : 1 000 €'];
const P3 = ['Annexe', 'Merci de votre confiance'];
const SMALL = [320, 70];
const PDFS = {
  facture: { name: 'facture.pdf', bytes: await linesPdf([P1, P2, P3]) },
  small: { name: 'petites-pages.pdf', bytes: await linesPdf(Array.from({ length: 4 }, (_, i) => ['Page ' + (i + 1) + ' alpha beta gamma', 'Page ' + (i + 1) + ' epsilon zeta eta']), { size: SMALL, fontSize: 12, gap: 22, top: 25 }) },
  long: { name: 'quarante.pdf', bytes: await linesPdf(Array.from({ length: 40 }, (_, i) => ['Page ' + (i + 1) + ' sur 40', 'Garantie de la page ' + (i + 1)])) },
  scan: { name: 'scan.pdf', bytes: await linesPdf([[], []]) },
  blankFirst: { name: 'premiere-blanche.pdf', bytes: await linesPdf([[], P3, P3]) },
};
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
const open = async (key, extra = {}) => {
  const o = await t.openPage(Object.assign({ seed: seedModels(), stub: GFS(), init: INIT + startReading(key), ready: false }, extra));
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
const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
// Fait défiler le panneau pour que le haut de la page `n` soit à `offset` px du haut du panneau (la mesure se fait aux rectangles à l'écran : elle vaut quel que soit le zoom).
const scrollToPage = (page, n, offset = 10) => page.evaluate(({ n, offset }) => {
  const box = document.getElementById('reader-container');
  const frame = box.querySelector('.pp-pdf-page[data-page="' + n + '"]');
  box.scrollTop += frame.getBoundingClientRect().top - box.getBoundingClientRect().top - offset;
}, { n, offset });

// ==================================================================================================================================================================================================
console.log('\n== La sélection d’un passage devient une ancre : la page, deux positions dans le texte de la page, la citation, le texte autour ==');
{
  const o = await open('facture');
  const page = o.page;
  await page.waitForFunction(() => PdfView.hasText() === true, null, { timeout: 20000 });
  check('un PDF à texte : « a du texte »', await page.evaluate(() => PdfView.hasText()) === true);
  check('rien de sélectionné : pas d’ancre', await anchorNow(page) === null);
  const line = await selectOnLine(page, 1, 'Garantie', 0, 0.5);
  const native = await nativeSelection(page);
  const a = await anchorNow(page);
  const text1 = await textOf(page, 1);
  check('la sélection à la souris est la sélection du navigateur : la citation est son texte (« ' + norm(native) + ' »), page 1', !!a && a.page === 1 && a.citation === norm(native) && a.citation.startsWith('Garantie 12 mois'), { a, native });
  check('ses deux positions sont celles du texte de la page (un texte rendu SANS le DOM) : la citation en est le morceau [début, fin[', !!a && text1.slice(a.debut, a.fin) === a.citation && text1.indexOf('Garantie 12 mois sur tout le matériel') === a.debut, { a, text1 });
  check('l’entourage est le texte qui précède et qui suit dans la page (24 signes au plus de chaque côté)', !!a && a.avant === text1.slice(Math.max(0, a.debut - 24), a.debut) && a.apres === text1.slice(a.fin, a.fin + 24) && a.avant.length <= 24 && a.apres.length <= 24, a);
  check('ni coordonnées d’écran ni zoom dans l’ancre : rien que la page, les positions, le texte (et `clipped`, `rect`, de l’app)', await page.evaluate(() => Object.keys(PdfView.selection()).sort().join()) === 'apres,avant,citation,clipped,debut,fin,page,rect', await page.evaluate(() => Object.keys(PdfView.selection()).join()));
  check('une sélection dans la page n’est pas coupée', a.clipped === false && a.rect.w > 20 && a.rect.h > 5, a);

  // Plusieurs lignes d’une page : de la 2e à la 4e ligne.
  const [second, fourth] = await linesOf(page, [[1, 'Client'], [1, 'Total HT']]);
  await drag(page, { x: second.left + 20, y: second.y }, { x: fourth.left + fourth.width * 0.6, y: fourth.y });
  const many = await anchorNow(page);
  const manyNative = await nativeSelection(page);
  check('plusieurs lignes : une seule ancre, la citation les mêle avec une espace pour fin de ligne', !!many && many.page === 1 && many.citation === norm(manyNative) && many.citation.includes('Garantie 12 mois sur tout le matériel Total HT'), { many, manyNative });
  check('… et ses positions sont toujours celles du texte de la page', text1.slice(many.debut, many.fin) === many.citation, many);

  // La deuxième occurrence du même passage, sur la page 2 : une autre page, pas la première occurrence.
  await selectOnLine(page, 2, 'Garantie', 0, 0.5);
  const dup = await anchorNow(page);
  const text2 = await textOf(page, 2);
  check('le même passage sur la page 2 s’ancre à la page 2, dans le texte de la page 2', !!dup && dup.page === 2 && text2.slice(dup.debut, dup.fin) === dup.citation && dup.citation.startsWith('Garantie 12 mois'), dup);

  // La dernière sélection se garde quand le navigateur la perd, et s’oublie par un clic dans le PDF.
  await page.evaluate(() => window.getSelection().removeAllRanges());
  const kept = await anchorNow(page);
  check('la sélection perdue par le navigateur (un clic sur « Commenter » peut la faire perdre) se retrouve : la dernière faite dans le PDF', !!kept && kept.citation === dup.citation && kept.page === 2, kept);
  const frame2 = await frameRect(page, 2);
  await page.mouse.click(frame2.left + 6, frame2.top + 6);
  await sleep(100);
  check('un clic dans le PDF sans rien sélectionner l’oublie', await anchorNow(page) === null);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Une sélection qui déborde est coupée à la fin de la page où elle commence ==');
{
  const o = await open('small');
  const page = o.page;
  await page.waitForFunction(() => PdfView.pagesShown().includes(2), null, { timeout: 20000 });
  const [first, next] = await linesOf(page, [[1, 'Page 1 alpha'], [2, 'Page 2 alpha']]);
  check('les deux petites pages se voient ensemble dans le panneau (la souris va de l’une à l’autre)', next.y > first.y && next.y < 400, { first: first.y, next: next.y });
  await drag(page, { x: first.left + 30, y: first.y }, { x: next.left + next.width * 0.5, y: next.y });
  const a = await anchorNow(page);
  const text1 = await textOf(page, 1);
  check('commencée page 1 et finie page 2 : l’ancre est de la page 1, coupée à la fin de son texte, et le dit (`clipped`)', !!a && a.page === 1 && a.clipped === true && a.fin === text1.length && text1.slice(a.debut, a.fin) === a.citation && a.citation.endsWith('epsilon zeta eta'), { a, text1 });
  check('… et rien de la page 2 n’est dans la citation', !!a && !a.citation.includes('Page 2'), a);
  const [last, third] = await linesOf(page, [[2, 'Page 2 epsilon'], [3, 'Page 3 alpha']]);
  await drag(page, { x: last.left + 40, y: last.y }, { x: third.left + 30, y: third.y });
  const b = await anchorNow(page);
  const text2 = await textOf(page, 2);
  check('commencée page 2 et finie page 3 : de la page 2', !!b && b.page === 2 && b.clipped === true && b.fin === text2.length, b);
  // Du bas vers le haut : la sélection est la même, l’ancre est de la page où elle commence dans le document.
  const [up1, up2] = await linesOf(page, [[1, 'Page 1 epsilon'], [2, 'Page 2 alpha']]);
  await drag(page, { x: up2.left + up2.width * 0.5, y: up2.y }, { x: up1.left + 20, y: up1.y });
  const c = await anchorNow(page);
  check('glissée de bas en haut : la page où elle commence DANS LE DOCUMENT (la 1), coupée à sa fin', !!c && c.page === 1 && c.clipped === true && c.fin === text1.length, c);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== La marque : le passage surligné DANS la couche de texte, au même endroit que la sélection ==');
{
  const o = await open('facture');
  const page = o.page;
  await selectOnLine(page, 1, 'Garantie', 0.05, 0.62);
  const a = await anchorNow(page);
  const native = await page.evaluate(() => { const r = window.getSelection().getRangeAt(0).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
  const layerTextBefore = await page.evaluate(() => document.querySelector('#reader-container .pp-pdf-page[data-page="1"] .pp-pdf-text').textContent);
  await setMarks(page, [{ id: 'c1', page: a.page, debut: a.debut, fin: a.fin, resolved: false }]);
  const marks = await marksOf(page, 'c1');
  check('une marque enveloppe le passage : le texte marqué est la citation', marks.length === 1 && marks[0].text === a.citation && marks[0].page === 1, marks);
  check('… au même endroit que la sélection qui l’a fait naître (à 1,5 px)', marks.length === 1 && near(marks[0].left, native.left) && near(marks[0].right, native.right) && near(marks[0].top, native.top) && near(marks[0].bottom, native.bottom), { marks, native });
  check('le texte de la couche n’a pas changé d’un signe (la marque n’ajoute rien au texte)', await page.evaluate(() => document.querySelector('#reader-container .pp-pdf-page[data-page="1"] .pp-pdf-text').textContent) === layerTextBefore);
  check('l’aspect est celui d’une marque de modèle : fond ambre translucide (le texte du PDF reste lisible dessous), trait ambre de 2 px de feuille dessous (un nombre entier de pixels d’écran, au moins un : comme le trait d’une marque de modèle dans une feuille zoomée), main au survol', marks[0].bg === 'rgba(240, 195, 109, 0.25)' && marks[0].border === 'rgb(240, 195, 109)' && near(parseFloat(marks[0].borderWidth) * marks[0].zoom, Math.max(1, Math.floor(2 * marks[0].zoom + 1e-6)), 0.02) && marks[0].cursor === 'pointer', marks[0]);
  check('… sans sortir du flux du morceau de texte qui la porte (position statique)', marks[0].position === 'static', marks[0].position);
  const shot = await page.evaluate(() => { const c = document.querySelector('#reader-container .pp-pdf-page[data-page="1"] canvas'); return c && c.width; });
  check('la marque est dans la couche de texte, pas dans le canevas (qui n’a pas bougé)', shot > 100 && await page.evaluate(() => document.querySelectorAll('.pp-pdf-text .pp-pdf-mark').length) === 1);

  // « Résolu » : fond clair, trait gris.
  await setMarks(page, [{ id: 'c1', page: a.page, debut: a.debut, fin: a.fin, resolved: true }]);
  const resolved = await marksOf(page, 'c1');
  check('un fil résolu : sans fond, trait gris, `data-resolved`', resolved.length === 1 && resolved[0].resolved === 'true' && resolved[0].bg === 'rgba(0, 0, 0, 0)' && resolved[0].border !== 'rgb(240, 195, 109)' && /pp-pdf-mark-resolved/.test(resolved[0].cls), resolved);
  await setMarks(page, [{ id: 'c1', page: a.page, debut: a.debut, fin: a.fin, resolved: false }]);

  // Plusieurs lignes : une enveloppe par morceau de texte, jamais de texte en trop ni en moins.
  const [second, fourth] = await linesOf(page, [[1, 'Client'], [1, 'Total HT']]);
  await drag(page, { x: second.left + 20, y: second.y }, { x: fourth.left + fourth.width * 0.6, y: fourth.y });
  const many = await anchorNow(page);
  await setMarks(page, [{ id: 'c2', page: many.page, debut: many.debut, fin: many.fin, resolved: false }]);
  const lines = await marksOf(page, 'c2');
  check('un passage sur plusieurs lignes : une marque par ligne, dont le texte mis bout à bout est la citation', lines.length === 3 && norm(lines.map(m => m.text).join(' ')) === many.citation, lines.map(m => m.text));

  // Les marques se retirent et rendent le texte comme avant.
  await setMarks(page, []);
  const clean = await page.evaluate(() => ({ marks: document.querySelectorAll('.pp-pdf-mark').length, split: Array.from(document.querySelectorAll('#reader-container .pp-pdf-page[data-page="1"] .pp-pdf-text > span')).filter(s => s.childNodes.length !== 1).length }));
  check('sans marque, le texte retrouve ses morceaux d’origine (un seul texte par ligne)', clean.marks === 0 && clean.split === 0, clean);

  // Deux marques qui se chevauchent : la plus courte se loge dans la plus longue ; un clic ouvre la plus proche du pointeur.
  const line = await lineOf(page, 1, 'Garantie');
  const text1 = await textOf(page, 1);
  const outerFrom = text1.indexOf('Garantie 12 mois sur tout le matériel');
  const innerFrom = text1.indexOf('12 mois');
  await setMarks(page, [{ id: 'dehors', page: 1, debut: outerFrom, fin: outerFrom + 'Garantie 12 mois sur tout le matériel'.length, resolved: false }, { id: 'dedans', page: 1, debut: innerFrom, fin: innerFrom + '12 mois'.length, resolved: false }]);
  const both = await marksOf(page);
  check('deux marques qui se chevauchent existent toutes deux, chacune avec son texte entier', norm(both.filter(m => m.id === 'dehors').map(m => m.text).join(' ')) === 'Garantie 12 mois sur tout le matériel' && both.filter(m => m.id === 'dedans').map(m => m.text).join('') === '12 mois', both.map(m => [m.id, m.text]));
  // Sans sélection en cours (un clic dans une sélection la défait à la fin du clic, comme dans la Lecture d'un modèle : js/comments.js:wireReader), un clic à la fois.
  await page.evaluate(() => { window.getSelection().removeAllRanges(); window.__clicks = []; PdfView.onMarkClick((id) => window.__clicks.push(id)); });
  const inner = both.find(m => m.id === 'dedans');
  const outer = both.filter(m => m.id === 'dehors').sort((x, y) => x.left - y.left)[0];
  await page.mouse.click((inner.left + inner.right) / 2, line.y);
  await sleep(700);
  const afterInner = await page.evaluate(() => window.__clicks.slice());
  await page.mouse.click(outer.left + 3, line.y);
  await sleep(700);
  const afterOuter = await page.evaluate(() => window.__clicks.slice());
  check('un clic sur le passage commun ouvre le fil de la marque la plus proche (« dedans »)', JSON.stringify(afterInner) === JSON.stringify(['dedans']), afterInner);
  check('… un clic sur le reste du passage le plus long ouvre celui de l’autre (« dehors »)', JSON.stringify(afterOuter) === JSON.stringify(['dedans', 'dehors']), afterOuter);

  // Un glissé qui commence sur une marque sélectionne, il n’ouvre aucun fil.
  await page.evaluate(() => { window.__clicks.length = 0; });
  await drag(page, { x: outer.left + 3, y: line.y }, { x: outer.left + 60, y: line.y });
  check('un glissé qui commence sur un passage commenté sélectionne, il n’ouvre pas son fil', (await page.evaluate(() => window.__clicks.length)) === 0 && (await nativeSelection(page)).length > 3);
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== La marque revient à la même place : page vidée puis redessinée, zoom, Lecture épurée ==');
{
  const o = await open('long');
  const page = o.page;
  await selectOnLine(page, 3, 'Garantie', 0, 0.7);
  const a = await anchorNow(page);
  await setMarks(page, [{ id: 'm3', page: 3, debut: a.debut, fin: a.fin, resolved: false }]);
  const before = (await marksOf(page, 'm3'))[0];
  const f3 = await frameRect(page, 3);
  const rel = { dx: before.left - f3.left, dy: before.top - f3.top, w: before.right - before.left };
  check('la marque est posée sur la page 3', !!before && before.page === 3 && before.text === a.citation, before);

  // Une page ne redevient une feuille blanche que lorsque plus de 8 pages sont dessinées : on s'éloigne à pas de 7 pages (un saut ne dessinerait que les pages du bout).
  for (const far of [10, 17, 24, 31, 38]) {
    await scrollToPage(page, far);
    await page.waitForFunction(n => PdfView.pagesShown().includes(n), far, { timeout: 30000 });
  }
  await page.waitForFunction(() => !PdfView.pagesShown().includes(3) && PdfView.pagesShown().includes(38), null, { timeout: 30000 });
  check('la page 3, trop loin du regard, redevient une feuille blanche : sa marque s’en va avec sa couche de texte', (await marksOf(page, 'm3')).length === 0);
  await scrollToPage(page, 3);
  await page.waitForFunction(() => PdfView.pagesShown().includes(3), null, { timeout: 30000 });
  await sleep(200);
  const back = (await marksOf(page, 'm3'))[0];
  const f3b = await frameRect(page, 3);
  check('… et revient avec la page redessinée, sur le même texte, à la même place de la page', !!back && back.text === a.citation && near(back.left - f3b.left, rel.dx) && near(back.top - f3b.top, rel.dy) && near(back.right - back.left, rel.w), { back, rel });

  // Zoom : Ctrl + plus. La marque garde sa place et sa taille RELATIVES à la page.
  const zoom0 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#reader-container .pp-pdf-page')).zoom));
  await page.mouse.move(300, 250);
  await page.keyboard.press('Control+Equal');
  await sleep(500);
  const zoom1 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#reader-container .pp-pdf-page')).zoom));
  await scrollToPage(page, 3);
  await sleep(300);
  const zoomed = (await marksOf(page, 'm3'))[0];
  const f3z = await frameRect(page, 3);
  check('Ctrl + plus agrandit la page (' + zoom0.toFixed(2) + ' -> ' + zoom1.toFixed(2) + ') ; la marque la suit : même texte, même place et même taille RELATIVES à la page', zoom1 > zoom0 && !!zoomed && zoomed.text === a.citation && near((zoomed.left - f3z.left) / f3z.width, rel.dx / f3b.width, 0.004) && near((zoomed.top - f3z.top) / f3z.height, rel.dy / f3b.height, 0.004) && near((zoomed.right - zoomed.left) / f3z.width, rel.w / f3b.width, 0.004), { zoomed, f3z, rel, f3b });
  await page.keyboard.press('Control+Minus');
  await sleep(400);

  // Lecture épurée.
  await page.evaluate(async () => { CleanReading.choose('clean'); await CleanReading.readButton(); });
  await sleep(600);
  const clean = await page.evaluate(() => CleanReading.isActive());
  await page.evaluate(() => { const frame = document.querySelector('#reader-container .pp-pdf-page[data-page="3"]'); frame.scrollIntoView({ block: 'start' }); });
  await sleep(400);
  const lean = (await marksOf(page, 'm3'))[0];
  const f3c = await frameRect(page, 3);
  check('en Lecture épurée : la marque est toujours là, même texte, même place relative sur la page', clean && !!lean && lean.text === a.citation && near((lean.left - f3c.left) / f3c.width, rel.dx / f3b.width, 0.004) && near((lean.top - f3c.top) / f3c.height, rel.dy / f3b.height, 0.004), { clean, lean, f3c });
  await page.evaluate(() => CleanReading.exit());
  await o.context.close();
}

// ==================================================================================================================================================================================================
console.log('\n== Un PDF sans texte ne se commente pas ; une première page blanche n’est pas un scan ==');
{
  const o = await open('scan');
  const page = o.page;
  await page.evaluate(() => { window.__texts = []; PdfView.onTextKnown(v => window.__texts.push(v)); });
  await page.waitForFunction(() => PdfView.pagesShown().length >= 1, null, { timeout: 20000 });
  await page.waitForFunction(() => PdfView.hasText() === false, null, { timeout: 20000 });
  check('un scan : « sans texte » une fois ses pages dessinées', await page.evaluate(() => PdfView.hasText()) === false);
  const line = await page.evaluate(() => document.querySelectorAll('#reader-container .pp-pdf-text > span').length);
  check('… rien à sélectionner dans sa couche de texte, donc pas d’ancre', line === 0 && await anchorNow(page) === null);
  await o.context.close();
}
{
  const o = await t.openPage({ seed: seedModels(), stub: GFS(), init: INIT + startReading('blankFirst') + `window.__texts = [];
    document.addEventListener('DOMContentLoaded', () => { const poll = setInterval(() => { if (typeof PdfView !== 'undefined') { clearInterval(poll); PdfView.onTextKnown(v => window.__texts.push(v)); } }, 1); });`, ready: false });
  const page = o.page;
  await settled(page);
  await page.waitForFunction(() => PdfView.hasText() === true, null, { timeout: 20000 });
  await sleep(300);
  check('une première page blanche suivie de pages de texte : jamais « sans texte », puis « a du texte »', JSON.stringify(await page.evaluate(() => window.__texts)) === '[true]', await page.evaluate(() => window.__texts));
  await o.context.close();
}

await t.finish();
