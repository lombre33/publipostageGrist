#!/usr/bin/env node
// « Tableau » dans le menu « Objets » (js/objects-menu.js, js/free-frame.js:insertTable, js/linked-table.js ; demande d'Antoine du 02/11 : « pareil que sur un document : soit depuis une grille existante avec
// lien live, soit un tableau local, et quand le curseur est dedans, l'interface de tableau de grille comme pour un document »), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre,
// hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active.
//  LE MENU : les lignes « Tableau » et « Tableau d'un modèle Grille… » sont dans le menu, lisibles, dans le panneau, avec leur info-bulle (numéro de la diapositive) ; le survol ne les grise pas.
//  LE TABLEAU LOCAL : un clic pose un tableau de 2 x 2 cases, vides, DANS un cadre libre au centre de la diapositive du curseur ; le curseur est dans sa première case (une lettre tapée s'y écrit), la barre du
//   tableau s'ouvre (entière dans le panneau, sans le bouton du lien), un seul Ctrl+Z retire le cadre.
//  LE TABLEAU LIÉ : la ligne ouvre la liste avec recherche des modèles Grille (dans le panneau), un clic sur un modèle pose sa copie liée dans un cadre ; le curseur est dans sa première case, la barre du tableau
//   porte le bouton du lien (visible, dans le panneau) et son menu dit le nom du modèle ; le même modèle n'est plus proposé (« déjà lié »), un seul Ctrl+Z retire le cadre.
//  LE CURSEUR DANS UN TABLEAU : le menu Objets pose quand même un second tableau (dans un nouveau cadre) : la ligne du menu du bouton Tableau, elle, reste grisée à cet endroit.
// Lancé par run-headless.mjs (groupe Node "objectsTableMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-objects-table-mouse.mjs
import { start, seedModels, chooseObject, hoverObject, hoverObjectsButton, objectRow, OBJECTS_MENU, WIDTH, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-objects-table-mouse', port: Number(process.env.OBJECTS_TABLE_PORT || 9159) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const GRID = '<table><tbody>' + [1, 2, 3].map(r => '<tr>' + ['A', 'B', 'C'].map(c => `<td><p>${c}${r}</p></td>`).join('') + '</tr>').join('') + '</tbody></table>';
const SLIDES = `<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><p>Texte</p>`;
const SEED = seedModels() + `
  add(7, 'Formes', '${SLIDES}', false, 'presentation');
  add(8, 'Grille des tarifs', ${JSON.stringify(GRID)}, false, 'grille');
  add(9, 'Grille vide', '<p>rien</p>', false, 'grille');
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
const framesOf = page => page.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.forEach((node) => {
    if (node.type.name !== 'freeFrame') return;
    const table = node.firstChild && node.firstChild.type.name === 'table' ? node.firstChild : null;
    out.push({
      x: node.attrs.x, y: node.attrs.y, w: node.attrs.w, h: node.attrs.h, table: !!table,
      rows: table ? table.childCount : 0, cols: table && table.firstChild ? table.firstChild.childCount : 0,
      text: table ? table.textContent : '', linked: table ? !!table.attrs.linkedTemplate : false,
    });
  });
  return out;
});
const cursorCell = page => page.evaluate(() => {
  const { $from } = EditorCore.getEditor().state.selection;
  let cell = -1;
  let inFrame = false;
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name;
    if (name === 'tableCell' || name === 'tableHeader') cell = $from.index(d - 1);
    if (name === 'freeFrame') inFrame = true;
  }
  return { cell, inFrame };
});
const barOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
}, selector);

async function part(lang, colorScheme) {
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const press = async (key) => { await page.keyboard.press(key); await sleep(260); };
  await Promise.race([
    page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })),
    sleep(20000),
  ]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '7', null, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === 2; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(900);
  const second = await rectOf(page, '.pp-slide-item', 1);
  if (second) { await page.mouse.click(second.x, second.y); await sleep(350); }
  const base = await htmlOf(page);

  console.log('\n' + tag + '1) Le menu « Objets »');
  await hoverObjectsButton(page);
  const names = await page.evaluate((menu) => Array.from(document.querySelectorAll(menu + ' .v2-menu-row')).map(b => ({
    id: b.dataset.action, text: b.textContent.trim(), tip: b.getAttribute('data-tip') || '', off: b.getAttribute('aria-disabled') === 'true' || b.disabled,
    rect: (() => { const r = b.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width }; })(),
  })), OBJECTS_MENU);
  const labels = lang === 'fr' ? ['Cadre de texte', 'Tableau', 'Vue…', 'Tableau d’un modèle Grille…'] : ['Text frame', 'Table', 'Slide view…', 'Table from a Grid template…'];
  check(tag + 'le menu a quatre lignes dans l\'ordre : le cadre de texte, le tableau, la vue d\'une diapositive, le tableau d\'un modèle Grille', JSON.stringify(names.map(n => n.text)) === JSON.stringify(labels), names.map(n => n.text));
  check(tag + 'les quatre lignes sont dans le panneau et aucune n\'est grisée', names.length === 4 && names.every(n => inPanel(n.rect) && !n.off), names);
  check(tag + 'l\'info-bulle de « Tableau » et celle de « Tableau d\'un modèle Grille… » disent où le tableau se pose : la diapositive 2', /\b2\b/.test(names[1].tip) && /\b2\b/.test(names[3].tip), names.map(n => n.tip));
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 4 });
  await sleep(300);

  console.log('\n' + tag + '2) Un tableau local');
  await chooseObject(page, 'table');
  await sleep(300);
  let frames = await framesOf(page);
  check(tag + 'un cadre est posé, avec un tableau de 2 lignes et 2 colonnes, vide', frames.length === 1 && frames[0].table && frames[0].rows === 2 && frames[0].cols === 2 && frames[0].text === '', frames);
  const page2 = await page.evaluate(() => ({ w: FreeFrame.CLASS, size: EditorCore.getEditor().state.doc.content.size }));
  check(tag + 'le cadre est au centre de la diapositive : à 1 pt près sur la largeur', frames.length === 1 && Math.abs(frames[0].x * 2 + frames[0].w - 612) < 400 && frames[0].x > 24 && frames[0].y > 24, { frames, page2 });
  let cursor = await cursorCell(page);
  check(tag + 'le curseur est dans la première case du tableau du cadre', cursor.cell === 0 && cursor.inFrame, cursor);
  await page.keyboard.type('x');
  await sleep(250);
  frames = await framesOf(page);
  check(tag + 'une lettre tapée s\'écrit dans cette case', frames[0].text === 'x', frames[0]);
  const bar = await barOf(page, '.v2-table-toolbar');
  check(tag + 'la barre du tableau s\'ouvre, entière dans le panneau', inPanel(bar), bar);
  const linkedBtn = await barOf(page, '#v2-table-linked-btn');
  check(tag + 'le bouton du lien n\'y est pas : le tableau n\'est pas lié', linkedBtn === null);
  check(tag + 'la barre du cadre ne recouvre pas celle du tableau', await page.evaluate(() => {
    const a = document.querySelector('.v2-table-toolbar'); const b = document.querySelector('.v2-frame-toolbar');
    if (!a || !b || !b.getBoundingClientRect().width) return true;
    const r = a.getBoundingClientRect(); const s = b.getBoundingClientRect();
    return r.right <= s.left || s.right <= r.left || r.bottom <= s.top || s.bottom <= r.top;
  }));
  await press('Control+z');
  await press('Control+z');
  check(tag + 'deux Ctrl+Z (la frappe, puis la pose) rendent le HTML tel qu\'il était', (await htmlOf(page)) === base);

  console.log('\n' + tag + '3) Le tableau d\'un modèle Grille');
  await page.click('#editor-container .tiptap p:last-of-type').catch(() => {});
  await sleep(200);
  const before = await framesOf(page);
  await hoverObject(page, 'linkedTable');
  const row = await rectOf(page, objectRow('linkedTable'));
  await page.mouse.click(row.x, row.y);
  await sleep(700);
  const picker = await page.evaluate(() => Array.from(document.querySelectorAll('#v2-linked-table-search .ss-option')).map(li => ({
    name: (li.querySelector('.ss-name') || li).textContent.trim(), disabled: li.getAttribute('aria-disabled') === 'true',
    r: (() => { const b = li.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width }; })(),
  })));
  check(tag + 'la liste avec recherche s\'ouvre dans le panneau avec les deux modèles Grille, « Grille vide » grisé', picker.length === 2 && picker.every(p => inPanel(p.r)) && picker.find(p => p.name.startsWith('Grille des tarifs') && !p.disabled) && picker.find(p => p.name.startsWith('Grille vide') && p.disabled), picker);
  const target = await page.evaluate(() => {
    const li = Array.from(document.querySelectorAll('#v2-linked-table-search .ss-option')).find(e => e.textContent.indexOf('Grille des tarifs') !== -1);
    const r = li.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(target.x, target.y, { steps: 4 });
  await page.mouse.click(target.x, target.y);
  await sleep(900);
  frames = await framesOf(page);
  check(tag + 'un cadre de plus est posé, avec la copie 3 x 3 du modèle, liée', frames.length === before.length + 1 && frames[0].table && frames[0].rows === 3 && frames[0].cols === 3 && frames[0].linked && /A1B1C1A2B2C2A3B3C3/.test(frames[0].text), frames);
  check(tag + 'le tableau lié est bien dans le cadre (LinkedTable le retrouve)', await page.evaluate(() => LinkedTable.liveTables(EditorCore.getEditor().state.doc).length === 1));
  cursor = await cursorCell(page);
  check(tag + 'le curseur est dans la première case', cursor.cell === 0 && cursor.inFrame, cursor);
  const bar2 = await barOf(page, '.v2-table-toolbar');
  const link2 = await barOf(page, '#v2-table-linked-btn');
  check(tag + 'la barre du tableau est dans le panneau et porte le bouton du lien, visible', inPanel(bar2) && inPanel(link2), { bar2, link2 });
  await page.mouse.move(link2.x ?? (link2.left + link2.width / 2), link2.top + link2.height / 2, { steps: 4 });
  await page.mouse.click(link2.left + link2.width / 2, link2.top + link2.height / 2);
  await sleep(400);
  const menu = await page.evaluate(() => {
    const el = document.querySelector('.v2-linked-menu, [data-linked-menu]') || Array.from(document.querySelectorAll('.v2-dropdown-panel, .v2-floating-menu')).find(e => e.textContent.indexOf('Grille des tarifs') !== -1);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { text: el.textContent, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width };
  });
  check(tag + 'le menu du lien dit le nom du modèle, dans le panneau', !!menu && /Grille des tarifs/.test(menu.text) && inPanel(menu), menu);
  await page.mouse.click(link2.left + link2.width / 2, link2.top + link2.height / 2);   // le même bouton referme le menu (Échap sélectionnerait le cadre)
  await sleep(300);

  console.log('\n' + tag + '4) Le curseur dans un tableau, et le même modèle');
  await page.evaluate(() => document.querySelectorAll('#editor-container .tiptap .pp-free-frame td')[1].scrollIntoView({ block: 'center' }));
  await sleep(250);
  const cellB = await rectOf(page, '#editor-container .tiptap .pp-free-frame td', 1);
  await page.mouse.move(cellB.x - 4, cellB.y);
  await page.mouse.click(cellB.x, cellB.y);
  await sleep(300);
  cursor = await cursorCell(page);
  check(tag + 'un vrai clic dans la case « B1 » y pose le curseur', cursor.cell === 1 && cursor.inFrame, cursor);
  const state = await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    return { plain: LinkedTable.placeBlock(ed), frame: LinkedTable.placeBlock(ed, true) };
  });
  check(tag + 'le curseur dans un tableau refuse le lien du bouton Tableau mais pas le cadre du menu Objets', state.plain === 'linkedTable.rowInTable' && state.frame === null, state);
  await hoverObjectsButton(page);
  const linkedRow = await page.evaluate((sel) => { const b = document.querySelector(sel); return { off: b.getAttribute('aria-disabled'), tip: b.getAttribute('data-tip') }; }, objectRow('linkedTable'));
  check(tag + 'la ligne « Tableau d\'un modèle Grille… » du menu Objets n\'est pas grisée', linkedRow.off === 'false', linkedRow);
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 4 });
  await sleep(300);
  await chooseObject(page, 'table');
  await sleep(300);
  frames = await framesOf(page);
  check(tag + 'le menu Objets pose un second tableau, dans un nouveau cadre, même avec le curseur dans un tableau', frames.length === before.length + 2 && frames.filter(f => f.table).length === 2, frames);
  await press('Control+z');
  await press('Control+z');
  frames = await framesOf(page);
  check(tag + 'deux Ctrl+Z retirent le second tableau puis le tableau lié', frames.length === before.length, frames);
  check(tag + 'le HTML est celui d\'avant', (await htmlOf(page)) === base);

  console.log('\n' + tag + '5) Au clavier seul');
  await page.click('#editor-container .tiptap p:last-of-type').catch(() => {});
  await sleep(200);
  const active = () => page.evaluate(() => (document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.action || document.activeElement.id : ''));
  await page.focus('#v2-btn-objects');
  await press('ArrowDown');
  check(tag + '↓ sur le bouton Objets donne le clavier à « Cadre de texte »', (await active()) === 'textFrame', await active());
  await press('ArrowDown');
  check(tag + '↓ mène à « Tableau d\'un modèle Grille… » (sous les trois boutons)', (await active()) === 'linkedTable', await active());
  await press('ArrowUp');
  check(tag + '↑ revient sur « Cadre de texte » (même colonne)', (await active()) === 'textFrame', await active());
  await press('ArrowRight');
  check(tag + '→ passe à « Tableau » dans la rangée', (await active()) === 'table', await active());
  await press('Enter');
  frames = await framesOf(page);
  cursor = await cursorCell(page);
  check(tag + 'Entrée sur « Tableau » pose le tableau et met le curseur dans sa première case', frames.length === before.length + 1 && frames[0].table && frames[0].rows === 2 && cursor.cell === 0 && cursor.inFrame, { frames, cursor });
  await press('Control+z');
  check(tag + 'un Ctrl+Z le retire', (await htmlOf(page)) === base);
}

await part('fr', 'light');
await part('en', 'dark');
await t.finish();
