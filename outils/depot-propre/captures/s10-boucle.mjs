// La Boucle : une ligne de tableau qui se répète pour chaque ligne liée. A : la ligne du modèle dans l'éditeur (icône Boucle dans la marge) ; B : le même tableau en Lecture, une ligne par donnée.
// Le vrai widget ; un tableau de démonstration dont les lignes viennent d'une table liée du faux Grist, comme une facture et ses lignes.
import { openWidget, sleep, done, click, idle, shot, rectOf } from './kit.mjs';
const W = 1280, H = 800;
const T = 'Lignes', MAIN = 'Factures';
const C = { name: 'Nom', qty: 'Qte', price: 'PU', vat: 'TVA', total: 'Total' };
const ROWS = [['Applique murale laiton brossé', 6, 148, 20], ['Suspension verre soufflé Ø 40 cm', 4, 289.5, 20], ['Ampoule LED filament E27', 24, 4.9, 20], ['Pose et raccordement (h)', 12, 55, 10]];
const esc = (o) => JSON.stringify(o).replace(/"/g, '&quot;');
const badge = (col, extra = '') => `<span class="var-badge" data-table="${T}" data-column="${col}" data-key="${T}.${col}"${extra}></span>`;
const money = esc({ type: 'number', style: 'fr', decimals: 2, currency: '€' });
const num = esc({ type: 'number', style: 'none', decimals: null });
const loop = esc({ repeat: 'row', table: T, empty: 'header' });
const widths = [230, 100, 110, 100, 120];
const head = ['Désignation', 'Qté', 'PU HT', 'TVA %', 'Total HT'];
const th = (t, i) => `<th colwidth="${widths[i]}" style="background-color: #e6edfb"><p><strong>${t}</strong></p></th>`;
const td = (i, inner) => `<td colwidth="${widths[i]}"><p>${inner}</p></td>`;
const HTML = '<h1>Facture F-2026-0187</h1><p>Maison Berthier &amp; Associés — refonte de l’éclairage de la boutique.</p><p></p>'
  + `<table><tbody><tr>${head.map(th).join('')}</tr><tr>`
  + td(0, badge(C.name, ` data-loop="${loop}" data-loop-repeat="row"`))
  + td(1, badge(C.qty, ` data-format="${num}"`)) + td(2, badge(C.price, ` data-format="${money}"`)) + td(3, badge(C.vat, ` data-format="${num}"`)) + td(4, badge(C.total, ` data-format="${money}"`))
  + '</tr></tbody></table><p></p>';
const { page } = await openWidget({ width: W, height: H });
await page.evaluate(async ({ T, MAIN, C, ROWS }) => {
  const stub = window.__gristStub;
  stub.setVariables(MAIN, { Numero: 'Text', Client: 'Text' });
  stub.setRows(MAIN, [{ id: 1, Numero: 'F-2026-0187', Client: 'Maison Berthier' }]);
  const types = { Facture: 'Ref:' + MAIN, gristHelper_Display: 'Text' };
  types[C.name] = 'Text'; types[C.qty] = 'Numeric'; types[C.price] = 'Numeric'; types[C.vat] = 'Numeric'; types[C.total] = 'Numeric';
  stub.setVariables(T, types, {}, { Facture: 'gristHelper_Display' }, { Facture: 'Numero' });
  stub.setRows(T, ROWS.map((r, i) => { const row = { id: i + 1, Facture: 1, gristHelper_Display: 'F-2026-0187' }; row[C.name] = r[0]; row[C.qty] = r[1]; row[C.price] = r[2]; row[C.vat] = r[3]; row[C.total] = Math.round(r[1] * r[2] * 100) / 100; return row; }));
  await GristAPI.refreshSchema();
  await GristAPI.deleteLinkRule(T);
  await GristAPI.saveLinkRule(T, { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
  await GristAPI.refreshSchema();
  stub.fireRecord({ id: 1, Numero: 'F-2026-0187', Client: 'Maison Berthier' }, MAIN);
}, { T, MAIN, C, ROWS });
await sleep(700);
await page.evaluate((h) => Editor.setHTML(h), HTML);
await sleep(1000);
await idle(page, 70, 700);
await page.evaluate(() => { const z = document.getElementById('pp-page-zoom'); if (z) z.style.visibility = 'hidden'; });
const geom = (sel) => page.evaluate((s) => {
  const table = document.querySelector(s);
  table.scrollIntoView({ block: 'center' });
  const rows = Array.from(table.querySelectorAll('tr'));
  const t = table.getBoundingClientRect(), r1 = rows[1].getBoundingClientRect();
  return { rows: rows.length, x: t.left, y: t.top, width: t.width, height: t.height, rowBottom: r1.bottom };
}, sel);
await geom('#editor-container .ProseMirror table');
await page.mouse.move(W - 10, H - 10, { steps: 3 }); await sleep(500);
const A = await geom('#editor-container .ProseMirror table'); await sleep(300);
const A2 = await geom('#editor-container .ProseMirror table');
console.log('A', JSON.stringify(A2));
await shot(page, 'l0-boucle-edition-plein');
await shot(page, 'l1-boucle-edition', { clip: { x: A2.x - 36, y: A2.y - 8, width: A2.width + 56, height: A2.rowBottom - A2.y + 16 } });
await click(page, '#btn-mode-read', 1800, false);
await idle(page, W - 10, H - 10);
await page.evaluate(() => { const z = document.getElementById('pp-page-zoom'); if (z) z.style.visibility = 'hidden'; });
await geom('.reader-content table'); await sleep(300);
const B = await geom('.reader-content table');
console.log('B', JSON.stringify(B));
await shot(page, 'l2-boucle-lecture-plein');
await shot(page, 'l3-boucle-lecture', { clip: { x: B.x - 36, y: B.y - 8, width: B.width + 56, height: B.height + 16 } });
import { execFileSync } from 'node:child_process';
import { OUT } from './kit.mjs';
execFileSync('convert', [OUT + '/l1-boucle-edition.png', '(', '-size', '1x40', 'xc:white', ')', OUT + '/l3-boucle-lecture.png', '-background', 'white', '-gravity', 'west', '-append', '-strip', OUT + '/l4-boucle.png']);
console.log('capture : ' + OUT + '/l4-boucle.png');
await done();
