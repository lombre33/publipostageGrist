#!/usr/bin/env node
// Un TABLEAU dans un cadre libre (js/free-frame.js, css/free-frame.css ; lot 10e du plan « Import PowerPoint sans perte » : les tableaux d'un PowerPoint sont posés librement), à la vraie souris et au vrai
// clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active. Ce que dev-tests/scenarios-frame-table.js ne peut pas voir :
//  LA PLACE : le tableau est contre le bord intérieur du cadre (les marges du cadre, sans la marge de 6 px d'un tableau du texte), ses quatre cases sont à l'écran, dans le panneau.
//  LA FRAPPE : un vrai clic dans une case y pose le curseur, une lettre tapée s'y écrit, Tab passe à la case suivante, un Ctrl+Z défait la frappe.
//  LE CADRE : pris par son bord du haut, il est sélectionné et sa barre apparaît, entière dans le panneau ; glissé à la souris, il emporte son tableau (le tableau suit le cadre au pixel près), un Ctrl+Z
//   rend le HTML tel qu'il était.
// Lancé par run-headless.mjs (groupe Node "frameTableMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-frame-table-mouse.mjs
import { start, seedModels, chooseObject, WIDTH, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-frame-table-mouse', port: Number(process.env.FRAME_TABLE_PORT || 9157) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const TABLE = '<table><tbody><tr data-row-height="60"><td colwidth="200"><p>A</p></td><td colwidth="200"><p>B</p></td></tr><tr data-row-height="40"><td colwidth="200"><p>C</p></td><td colwidth="200"><p>D</p></td></tr></tbody></table>';
const FRAME = `<div class="pp-free-frame" role="group" data-ff-x="40" data-ff-y="60" data-ff-w="314.4" data-ff-h="82.2"><div class="pp-free-frame-box"><div class="pp-free-frame-content">${TABLE}</div></div></div>`;
const SLIDES = `<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><p>Texte</p>`;
const POSEE = FRAME + '<p></p>' + BR + '<h2>Deux</h2><p>Texte</p>';
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Formes', '${SLIDES}', false, 'presentation');
  add(8, 'Tableau posé', ${JSON.stringify(POSEE)}, false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;

const rectOf = (page, selector, index = 0) => page.evaluate(([sel, i]) => {
  const el = document.querySelectorAll(sel)[i];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}, [selector, index]);
const htmlOf = page => page.evaluate(() => EditorCore.getEditor().getHTML());
const cellsOf = page => page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .tiptap .pp-free-frame td')).map(td => td.textContent.trim()));
const frameAttrs = page => page.evaluate(() => {
  let found = null;
  EditorCore.getEditor().state.doc.forEach((node) => { if (!found && node.type.name === 'freeFrame') found = { x: node.attrs.x, y: node.attrs.y, w: node.attrs.w, h: node.attrs.h }; });
  return found;
});

async function part(lang, colorScheme) {
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const press = async (key) => { await page.keyboard.press(key); await sleep(260); };
  await Promise.race([
    page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '8', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })),
    sleep(20000),
  ]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '8', null, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === 2; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(900);
  const first = await rectOf(page, '.pp-slide-item', 0);
  if (first) { await page.mouse.click(first.x, first.y); await sleep(300); }

  console.log('\n' + tag + '1) La place du tableau dans son cadre');
  const base = await htmlOf(page);
  const place = await page.evaluate(() => {
    const box = document.querySelector('#editor-container .tiptap .pp-free-frame-box').getBoundingClientRect();
    const table = document.querySelector('#editor-container .tiptap .pp-free-frame table').getBoundingClientRect();
    const cells = Array.from(document.querySelectorAll('#editor-container .tiptap .pp-free-frame td')).map((td) => { const r = td.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width }; });
    const zoom = box.width / (parseFloat(document.querySelector('#editor-container .tiptap .pp-free-frame').getAttribute('data-ff-w')) / 0.75);
    return { box: { left: box.left, top: box.top }, table: { left: table.left, top: table.top, width: table.width, height: table.height }, cells, zoom, inBlockquote: !!document.querySelector('#editor-container .tiptap .pp-free-frame blockquote') };
  });
  const padX = place.table.left - place.box.left;
  const padY = place.table.top - place.box.top;
  check(tag + 'le tableau est dans le cadre, non dans une citation, avec les quatre cases à l\'écran', place.cells.length === 4 && !place.inBlockquote, { cells: place.cells.length, quote: place.inBlockquote });
  check(tag + 'il est contre le bord intérieur du cadre : 7,2 pt à gauche et 3,6 pt en haut (les marges du cadre), sans la marge de 6 px au-dessus d\'un tableau du texte',
    Math.abs(padX - 9.6 * place.zoom) <= 1.5 && Math.abs(padY - 4.8 * place.zoom) <= 1.5, { padX, padY, zoom: place.zoom });
  check(tag + 'la case « B » est à droite de « A » (200 px) et « C » sous « A » (60 px), à l\'échelle de l\'écran',
    Math.abs(place.cells[1].left - place.cells[0].left - 200 * place.zoom) <= 3 && Math.abs(place.cells[2].top - place.cells[0].top - 60 * place.zoom) <= 3 && Math.abs(place.cells[2].left - place.cells[0].left) <= 2, place.cells.map(c => [Math.round(c.left), Math.round(c.top)]));

  console.log('\n' + tag + '2) La frappe dans une case');
  await page.evaluate(() => document.querySelectorAll('#editor-container .tiptap .pp-free-frame td')[2].scrollIntoView({ block: 'center' }));
  await sleep(250);
  const cellC = await rectOf(page, '#editor-container .tiptap .pp-free-frame td', 2);
  check(tag + 'la case « C » est à l\'écran, dans le panneau', inPanel(cellC), cellC);
  await page.mouse.move(cellC.x - 5, cellC.y);
  await page.mouse.click(cellC.x, cellC.y);
  await sleep(250);
  await page.keyboard.press('End');
  await page.keyboard.type('x');
  await sleep(300);
  let cells = await cellsOf(page);
  check(tag + 'un vrai clic dans « C » y pose le curseur : la lettre tapée s\'y écrit', JSON.stringify(cells) === JSON.stringify(['A', 'B', 'Cx', 'D']), cells);
  await press('Tab');
  await page.keyboard.press('End');
  await page.keyboard.type('y');
  await sleep(300);
  cells = await cellsOf(page);
  check(tag + 'Tab passe à la case suivante (« D ») où la lettre s\'écrit', JSON.stringify(cells) === JSON.stringify(['A', 'B', 'Cx', 'Dy']), cells);
  await press('Control+z');
  await press('Control+z');
  cells = await cellsOf(page);
  check(tag + 'Ctrl+Z défait la frappe (le tableau et le cadre comme au départ)', JSON.stringify(cells) === JSON.stringify(['A', 'B', 'C', 'D']) && (await htmlOf(page)) === base, cells);

  console.log('\n' + tag + '3) Le cadre pris par son bord, déplacé à la souris');
  await page.evaluate(() => document.querySelector('#editor-container .tiptap .pp-free-frame').scrollIntoView({ block: 'center' }));
  await sleep(250);
  const box = await rectOf(page, '#editor-container .tiptap .pp-free-frame-box', 0);
  const grab = { x: box.left + box.width * 0.25, y: box.top + 1 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.up();
  await sleep(350);
  const bar = await page.evaluate(() => {
    const el = document.querySelector('.v2-frame-toolbar');
    if (!el || el.getBoundingClientRect().width === 0) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width };
  });
  check(tag + 'pris par le quart gauche de son bord du haut, le cadre est sélectionné : sa barre apparaît, entière dans le panneau de 700x400', inPanel(bar), bar);
  const before = await frameAttrs(page);
  const tableBefore = await rectOf(page, '#editor-container .tiptap .pp-free-frame table', 0);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 40, grab.y + 20, { steps: 6 });
  await page.mouse.move(grab.x + 80, grab.y + 40, { steps: 6 });
  await page.mouse.up();
  await sleep(450);
  const after = await frameAttrs(page);
  const tableAfter = await rectOf(page, '#editor-container .tiptap .pp-free-frame table', 0);
  check(tag + 'glissé de 80 px à droite et 40 px en bas, le cadre s\'est déplacé de ce même écart (à un point près) et garde sa taille', !!before && !!after && after.x > before.x + 20 && after.y > before.y + 10 && after.w === before.w && after.h === before.h, { before, after });
  check(tag + 'le tableau a suivi son cadre : il s\'est déplacé du même écart que lui, au pixel près', Math.abs((tableAfter.left - tableBefore.left) - 80) <= 3 && Math.abs((tableAfter.top - tableBefore.top) - 40) <= 3, { dx: tableAfter.left - tableBefore.left, dy: tableAfter.top - tableBefore.top });
  await press('Control+z');
  check(tag + 'un seul Ctrl+Z rend le HTML tel qu\'il était, au caractère près', (await htmlOf(page)) === base);

  console.log('\n' + tag + '4) Un clic dans un cadre sélectionné y entre');
  // Demande du 02/11 (carte « Régler le clic dans un cadre sélectionné ») : un cadre pris par son bord ou par Échap était une sélection d'objet ; un clic dans son texte envoyait le curseur dans le texte d'en dessous.
  const where = () => page.evaluate(() => {
    const { selection } = EditorCore.getEditor().state;
    let inFrame = false;
    for (let d = selection.$from.depth; d > 0; d--) if (selection.$from.node(d).type.name === 'freeFrame') inFrame = true;
    return { kind: selection.constructor.name.replace(/^_/, ''), inFrame, cell: selection.$from.parent.type.name };
  });
  await page.evaluate(() => document.querySelector('#editor-container .tiptap .pp-free-frame').scrollIntoView({ block: 'center' }));
  await sleep(250);
  const edge = await rectOf(page, '#editor-container .tiptap .pp-free-frame-box', 0);
  await page.mouse.move(edge.left + edge.width * 0.25, edge.top + 1);
  await page.mouse.down();
  await page.mouse.up();
  await sleep(300);
  check(tag + 'le cadre du tableau est sélectionné par son bord (sélection d\'objet)', (await where()).kind === 'NodeSelection', await where());
  const cellD = await rectOf(page, '#editor-container .tiptap .pp-free-frame td', 3);
  await page.mouse.move(cellD.x - 5, cellD.y);
  await page.mouse.click(cellD.x, cellD.y);
  await sleep(300);
  let now = await where();
  check(tag + 'un clic dans la case « D » du cadre sélectionné y pose le curseur (non dans le texte d\'en dessous)', now.kind === 'TextSelection' && now.inFrame && now.cell === 'paragraph', now);
  await page.keyboard.press('End');
  await page.keyboard.type('z');
  await sleep(250);
  check(tag + 'la lettre tapée s\'écrit dans la case « D »', JSON.stringify(await cellsOf(page)) === JSON.stringify(['A', 'B', 'C', 'Dz']), await cellsOf(page));
  await press('Control+z');
  // Un cadre de texte posé par le menu Objets, pris par Échap : un clic dans son texte y pose le curseur.
  await chooseObject(page, 'textFrame');
  await sleep(300);
  await page.keyboard.type('Bonjour');
  await press('Escape');
  check(tag + 'le cadre de texte est sélectionné par Échap', (await where()).kind === 'NodeSelection', await where());
  const textAt = await page.evaluate(() => {
    const frames = document.querySelectorAll('#editor-container .tiptap .pp-free-frame');
    const p = frames[frames.length - 1].querySelector('p');
    p.scrollIntoView({ block: 'center' });
    const r = p.getBoundingClientRect();
    return { x: r.left + 12, y: r.top + r.height / 2 };
  });
  await sleep(250);
  const textNow = await page.evaluate(() => {
    const frames = document.querySelectorAll('#editor-container .tiptap .pp-free-frame');
    const r = frames[frames.length - 1].querySelector('p').getBoundingClientRect();
    return { x: r.left + 12, y: r.top + r.height / 2 };
  });
  await page.mouse.move(textNow.x, textNow.y);
  await page.mouse.click(textNow.x, textNow.y);
  await sleep(300);
  now = await where();
  check(tag + 'un clic dans le texte du cadre sélectionné y pose le curseur', now.kind === 'TextSelection' && now.inFrame, { now, textAt });
  await page.keyboard.type('!');
  await sleep(200);
  check(tag + 'la lettre tapée s\'écrit dans le cadre de texte', await page.evaluate(() => /Bon.*!.*jour|Bonjour!|!Bonjour|Bo!njour/.test(Array.from(document.querySelectorAll('#editor-container .tiptap .pp-free-frame')).pop().textContent)), await page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .tiptap .pp-free-frame')).pop().textContent));

  console.log('\n' + tag + '5) Ctrl+D duplique l\'objet sélectionné');
  // Choix d'Antoine du 02/11 (carte « Ajouter Ctrl+D ? », option « objet sélectionné seulement »).
  const frameCount = () => page.evaluate(() => { let n = 0; EditorCore.getEditor().state.doc.forEach((node) => { if (node.type.name === 'freeFrame') n++; }); return n; });
  const countBefore = await frameCount();
  await press('Control+d');
  check(tag + 'le curseur dans le texte d\'un cadre (rien de sélectionné) : Ctrl+D ne duplique rien', (await frameCount()) === countBefore);
  await press('Escape');
  check(tag + 'le cadre est sélectionné par Échap', (await where()).kind === 'NodeSelection', await where());
  await press('Control+d');
  check(tag + 'Ctrl+D duplique le cadre sélectionné : un cadre de plus, la copie est sélectionnée', (await frameCount()) === countBefore + 1 && (await where()).kind === 'NodeSelection', { n: await frameCount(), where: await where() });
  const copies = await page.evaluate(() => { const out = []; EditorCore.getEditor().state.doc.forEach((node) => { if (node.type.name === 'freeFrame') out.push({ x: node.attrs.x, y: node.attrs.y, text: node.textContent }); }); return out; });
  const last = copies.filter(c => c.text.indexOf('njour') !== -1);
  check(tag + 'la copie a le même texte et est décalée de 12 pt (comme le bouton)', last.length === 2 && Math.abs(Math.abs(last[0].x - last[1].x) - 12) < 0.6 && Math.abs(Math.abs(last[0].y - last[1].y) - 12) < 0.6, copies);
  const duplicateTitle = await page.evaluate(() => { const b = document.querySelector('.v2-frame-toolbar [data-action="duplicate"]'); return b ? b.title : ''; });
  check(tag + 'l\'info-bulle du bouton « Dupliquer » dit le raccourci', /Ctrl\+D/.test(duplicateTitle), duplicateTitle);
  await press('Control+z');
  check(tag + 'un Ctrl+Z retire la copie', (await frameCount()) === countBefore);
}

await part('fr', 'light');
await part('en', 'dark');
await t.finish();
