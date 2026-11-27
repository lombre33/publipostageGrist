#!/usr/bin/env node
// Le balayage de la limite de page (campagne « Fiabiliser les exports », 27/11) : la Lecture et le PDF décident-ils PAREIL, à chaque position de la limite, de ce qui reste sur la page et de ce qui passe à la suivante ?
//
// Pourquoi : l'écart du courrier du 27/11 se jouait à moins d'un pixel du bas de la page (le PDF gardait un paragraphe que la Lecture passait à la page suivante). Un essai qui pose un bloc à UNE hauteur ne le voit pas :
// il faut faire glisser la limite, pas à pas, sur toute la hauteur du bloc. Pour chaque sorte de bloc (paragraphe, titre suivi de son paragraphe, liste, tableau, zone à deux colonnes, image, encadré), le banc règle
// la marge du bas pour que la limite de la page traverse le bloc ; la Lecture et le PDF (exporté par le vrai bouton, relu par pdf.js) rendent le même document à chaque position, et on lit pour chacun la
// « décision » : combien de lignes et d'images portent la page 1, la page 2... Une décision est une constante par morceaux de la position de la limite : le banc cherche les positions où elle CHANGE (un balayage
// grossier, puis une dichotomie à 0,1 px) et compare celles de la Lecture et celles du PDF. Elles doivent coïncider : même nombre de changements, chacun à `--tol` px (0,5 par défaut) l'un de l'autre.
//
//   node dev-tests/verify-page-limit-sweep.mjs                     toutes les sortes de blocs (une dizaine de minutes)
//   node dev-tests/verify-page-limit-sweep.mjs --kinds table,zone  seulement celles-là
//   node dev-tests/verify-page-limit-sweep.mjs --tol 0.5 --coarse 4   tolérance et pas du balayage grossier, en px
//   node dev-tests/verify-page-limit-sweep.mjs --report            dit les écarts sans échouer ; --json fichier.json écrit le détail
// Le document : une page A4 de marges 20 mm sans en-tête ni pied, des paragraphes de remplissage d'une ligne puis le bloc ; le nombre de paragraphes est calculé pour que le bloc commence au milieu de sa zone de
// balayage (mesuré avec une marge du bas nulle : aucune coupure de page dans l'éditeur, les positions sont celles de la limite).
// Écarts connus au 27/11 : la liste (la Lecture la garde d'une pièce, le PDF la coupe entre deux éléments) et l'encadré (2 px de limite où le PDF le coupe après sa première ligne). Il faut : Chromium (Playwright) et les bibliothèques des CDN (hors ligne : dev-tests/offline-deps.sh).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createKit, sleep } from './real-widget-kit.mjs';
import { readerSnapshotInPage, readPdf, readerPages, pdfPages } from './export-twin-lib.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i === -1 ? fallback : args[i + 1]; };
const KINDS_ALL = ['paragraph', 'heading', 'list', 'table', 'zone', 'image', 'callout'];
const KINDS = String(option('kinds', KINDS_ALL.join(','))).split(',').map((s) => s.trim()).filter((k) => KINDS_ALL.indexOf(k) !== -1);
const TOL = Number(option('tol', 0.5));
const COARSE = Number(option('coarse', 4));
const FINE = 0.1;
const REPORT = args.includes('--report');
const JSON_OUT = option('json', '');
const PORT = Number(process.env.PAGE_SWEEP_PORT || 8951);

const PX_TO_MM = 25.4 / 96;
const PAGE_H_MM = 297;
const TOP_MM = 20;
const SIDE_MM = 20;

// ---- Les blocs ----
const SENTENCE = 'Le conseil se réunit le douze octobre à neuf heures trente, salle des Tisserands, pour examiner la délibération portant sur l’extension du périmètre et voter le budget.';
const filler = (n) => `<p>Ligne de remplissage ${n}.</p>`;
const BLOCKS = {
  paragraph: () => `<p>Repère. ${SENTENCE} ${SENTENCE} ${SENTENCE}</p>`,
  heading: () => `<h2>Titre du repère</h2><p>Le paragraphe qui suit le titre et qui tient sur une seule ligne.</p>`,
  list: () => `<ul>${Array.from({ length: 6 }, (_, i) => `<li><p>Élément ${i + 1} du repère de la liste à puces</p></li>`).join('')}</ul>`,
  table: () => `<table><tbody>${Array.from({ length: 6 }, (_, r) => `<tr>${Array.from({ length: 3 }, (_, c) => `<td colwidth="${[200, 200, 242][c]}"><p>Case ${r + 1}.${c + 1}</p></td>`).join('')}</tr>`).join('')}</tbody></table>`,
  zone: () => `<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column">${Array.from({ length: 4 }, (_, i) => `<p>Gauche ${i + 1}, une ligne.</p>`).join('')}</div><div class="two-columns-column">${Array.from({ length: 4 }, (_, i) => `<p>Droite ${i + 1}, une ligne.</p>`).join('')}</div></div>`,
  image: () => `<p><img class="editor-image" src="{{img:300x150}}" style="width: 300px" alt="Image du repère"></p>`,
  callout: () => `<div class="callout" data-color="blue" data-icon="info" role="note"><p>Repère de l’encadré. ${SENTENCE}</p></div>`,
};
const TRAILER = '<p>Dernier paragraphe du document.</p>';

const kit = await createKit({ port: PORT, workName: 'page-sweep-' });
const browser = await kit.launch();
const session = await kit.openBlankSession(browser);
const { page, context, main, rowId } = session;

const marginsFor = (limitPx) => ({ orientation: 'portrait', format: 'A4', top: TOP_MM, right: SIDE_MM, left: SIDE_MM, bottom: PAGE_H_MM - TOP_MM - limitPx * PX_TO_MM });
const docOf = (html, limitPx) => ({ html, page: marginsFor(limitPx) });
const pageBodyPx = (PAGE_H_MM - 2 * TOP_MM) / PX_TO_MM;
// La limite la plus basse que le balayage peut atteindre : une marge du bas nulle. Le bloc se mesure dans un document SANS coupure de page (l'éditeur ajoute une bande entre deux pages, et la limite n'en tient pas compte).
const maxLimitPx = (PAGE_H_MM - TOP_MM) / PX_TO_MM;

// Où le bloc se trouve dans le corps de la page, vu de l'éditeur : { top, bottom } depuis le haut du corps, et la hauteur d'un paragraphe de remplissage.
async function measureBlock(count) {
  return page.evaluate((n) => {
    const root = document.querySelector('#editor-container .tiptap');
    const kids = Array.from(root.children).filter((k) => k.getBoundingClientRect().height > 0);
    const origin = kids[0].getBoundingClientRect().top;
    const first = kids[n]; const last = kids[kids.length - 2];
    const unit = kids.length > 2 ? kids[1].getBoundingClientRect().top - kids[0].getBoundingClientRect().top : 0;
    return { top: first.getBoundingClientRect().top - origin, bottom: last.getBoundingClientRect().bottom - origin, unit, count: kids.length };
  }, count);
}

// La « décision » d'un moteur : pour chaque page, le nombre de lignes et d'images (sans les pages vides de la fin).
// Les images ne comptent que pour le bloc « image » : l'icône d'un encadré est un dessin de la feuille de style dans la Lecture et une image dans le PDF.
let countImages = false;
const signatureOf = (pages) => {
  const sig = pages.map((p) => `${p.lines.length}/${countImages ? p.images.length : 0}`);
  while (sig.length > 1 && /^0\/0$/.test(sig[sig.length - 1])) sig.pop();
  return sig.join(' ');
};
const cache = new Map();
async function lectureSignature(limit) {
  const key = 'L' + limit.toFixed(2);
  if (cache.has(key)) return cache.get(key);
  await kit.setMargins(page, marginsFor(limit));
  await kit.click(page, '#btn-mode-edit', 250);
  await kit.click(page, '#btn-mode-read', 900);
  const snap = await page.evaluate(readerSnapshotInPage);
  if (snap.error) throw new Error(snap.error);
  const sig = signatureOf(readerPages(snap));
  cache.set(key, sig);
  return sig;
}
let exportIndex = 0;
async function pdfSignature(limit) {
  const key = 'P' + limit.toFixed(2);
  if (cache.has(key)) return cache.get(key);
  await kit.setMargins(page, marginsFor(limit));
  exportIndex += 1;
  const file = join(kit.work, `sweep-${exportIndex}.pdf`);
  await kit.exportPdf(page, file);
  const snap = await readPdf(context, readFileSync(file).toString('base64'));
  const m = marginsFor(limit);
  const sig = signatureOf(pdfPages(snap, TOP_MM / PX_TO_MM, m.bottom / PX_TO_MM));
  cache.set(key, sig);
  return sig;
}

// Les positions où la décision change entre `lo` et `hi` : un balayage de pas `COARSE`, puis une dichotomie jusqu'à FINE. Rend [{ at, from, to }] : à partir de `at` (px), la décision est `to` au lieu de `from`.
async function flipsOf(signature, lo, hi) {
  const points = [];
  for (let limit = lo; limit < hi + COARSE; limit += COARSE) points.push(Math.min(limit, hi));
  const sigs = [];
  for (const limit of points) sigs.push(await signature(limit));
  const flips = [];
  for (let i = 1; i < points.length; i += 1) {
    if (sigs[i] === sigs[i - 1]) continue;
    let a = points[i - 1]; let b = points[i];
    while (b - a > FINE) {
      const mid = (a + b) / 2;
      if ((await signature(mid)) === sigs[i - 1]) a = mid; else b = mid;
    }
    flips.push({ at: Math.round(b * 100) / 100, from: sigs[i - 1], to: sigs[i] });
  }
  return { flips, first: sigs[0], last: sigs[sigs.length - 1] };
}

const results = [];
for (const kind of KINDS) {
  const started = Date.now();
  countImages = kind === 'image';
  cache.clear();
  try {
    const html = (count) => Array.from({ length: count }, (_, i) => filler(i + 1)).join('') + BLOCKS[kind]() + TRAILER;
    // Le balayage précédent a laissé la Lecture affichée : le calibrage se mesure dans l'éditeur.
    await kit.click(page, '#btn-mode-edit', 250);
    // Calibrage : le bloc commence où ? Un paragraphe de remplissage mesure combien ? Dans un document à la marge du bas nulle : pas de coupure de page, les positions sont celles de la limite.
    await kit.setDocument(page, docOf(html(2), maxLimitPx));
    const probe = await measureBlock(2);
    const height = probe.bottom - probe.top;
    // Le bloc doit commencer à la moitié de sa hauteur avant le bas du corps de la page : la limite balaie alors tout le bloc sans sortir de la page 1 (et sans passer sous la marge du bas nulle).
    const wantedTop = Math.min(pageBodyPx - Math.max(height, 0) * 0.5, maxLimitPx - 8 - Math.max(height, 0));
    const count = Math.max(2, 2 + Math.round((wantedTop - probe.top) / probe.unit));
    await kit.setDocument(page, docOf(html(count), maxLimitPx));
    const block = await measureBlock(count);
    const lo = Math.floor(block.top) - 3; const hi = Math.min(Math.ceil(block.bottom) + 3, Math.floor(maxLimitPx));
    // Le widget a besoin d'une ligne de document : le même modèle, le même enregistrement.
    await kit.fire(page, main, rowId);
    const lecture = await flipsOf(lectureSignature, lo, hi);
    const pdf = await flipsOf(pdfSignature, lo, hi);
    await kit.chooseExportType(page, 'pdf');
    const problems = [];
    if (lecture.flips.length !== pdf.flips.length) problems.push(`la Lecture change de décision ${lecture.flips.length} fois, le PDF ${pdf.flips.length} fois`);
    let maxGap = 0;
    for (let i = 0; i < Math.min(lecture.flips.length, pdf.flips.length); i += 1) {
      const gap = Math.round((pdf.flips[i].at - lecture.flips[i].at) * 100) / 100;
      maxGap = Math.max(maxGap, Math.abs(gap));
      if (Math.abs(gap) > TOL) problems.push(`changement ${i + 1} : la Lecture à ${lecture.flips[i].at} px (${lecture.flips[i].from} → ${lecture.flips[i].to}), le PDF à ${pdf.flips[i].at} px (${pdf.flips[i].from} → ${pdf.flips[i].to}) : ${gap > 0 ? 'le PDF garde le bloc ' : 'le PDF le passe '}${Math.abs(gap)} px plus tard`);
      else if (lecture.flips[i].to !== pdf.flips[i].to) problems.push(`changement ${i + 1} à ${lecture.flips[i].at} px : la même place, pas la même décision (Lecture ${lecture.flips[i].to}, PDF ${pdf.flips[i].to})`);
    }
    if (lecture.first !== pdf.first) problems.push(`en haut du balayage (${lo} px) : Lecture ${lecture.first}, PDF ${pdf.first}`);
    if (lecture.last !== pdf.last) problems.push(`en bas du balayage (${hi} px) : Lecture ${lecture.last}, PDF ${pdf.last}`);
    results.push({ kind, range: [lo, hi], block: { top: Math.round(block.top * 10) / 10, bottom: Math.round(block.bottom * 10) / 10 }, lecture, pdf, maxGap, problems, seconds: Math.round((Date.now() - started) / 1000) });
  } catch (e) {
    results.push({ kind, error: e.message, problems: [], seconds: Math.round((Date.now() - started) / 1000) });
  }
}
await session.context.close();
await browser.close();
kit.close();

let failed = 0;
for (const r of results) {
  if (r.error) { failed += 1; console.log(`ECHEC ${r.kind} : ${r.error}`); continue; }
  const summary = `${r.kind.padEnd(10)} bloc de ${r.block.top} à ${r.block.bottom} px, balayage ${r.range[0]}..${r.range[1]} px : la Lecture change ${r.lecture.flips.length} fois, le PDF ${r.pdf.flips.length} fois, écart max ${r.maxGap} px  (${r.seconds} s)`;
  if (!r.problems.length) { console.log(`OK    ${summary}`); continue; }
  failed += 1;
  console.log(`ECART ${summary}`);
  r.problems.slice(0, 8).forEach((p) => console.log(`        ${p}`));
}
console.log(`\n${results.length} sorte(s) de blocs : ${results.length - failed} d'accord, ${failed} en écart.`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
process.exit(failed && !REPORT ? 1 : 0);
