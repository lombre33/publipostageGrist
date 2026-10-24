#!/usr/bin/env node
// Les COLONNES DE TEXTE d'un cadre (js/free-frame.js, css/free-frame.css, js/icons.js ; lot 9f du chantier 9 « Caractères et puces » du plan « Import PowerPoint sans perte »), à la vraie souris et au vrai
// clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active. Ce que dev-tests/scenarios-frame-columns.js ne peut pas voir
// depuis la page :
//  LA BARRE ET SON MENU : le bouton « Colonnes de texte » de la barre flottante d'un cadre de texte (juste après l'animation), la barre entière dans le panneau ; son menu (une, deux, trois, quatre colonnes,
//   chacune nommée dans la langue de la page, lisible >= 4,5:1, entière dans le panneau), « 1 colonne » cochée pour un cadre neuf ; le nombre d'un fichier PowerPoint qui n'est pas de ceux-là (5) s'ajoute en
//   dernière ligne, cochée ; une ligne n'a pas ce bouton.
//  L'ORIENTATION DU TEXTE (lot 9g) : le bouton « Orientation du texte » juste avant celui des colonnes, son menu de trois lignes (horizontal, 90°, 270°), un choix = un pas d'historique, le texte tourne vraiment sur l'écran.
//  UN CHOIX : UN pas d'historique (Ctrl+Z défait au caractère près, Ctrl+Maj+Z et Ctrl+Y rétablissent), le menu se ferme, le cadre reste sélectionné, l'écart reste celui du cadre (18 points pour un cadre
//   neuf) ; sur l'écran, le texte passe vraiment en colonnes (le dernier paragraphe est à droite du premier), puis revient dessous le premier après « 1 colonne ».
// Lancé par run-headless.mjs (groupe Node "frameColumnsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-frame-columns.mjs
import { start, seedModels, contrastOf, WIDTH, HEIGHT, chooseObject } from './gfs-page.mjs';

const t = await start({ name: 'verify-frame-columns', port: Number(process.env.FRAME_COLUMNS_PORT || 9155) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const SLIDES = `<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><p>Texte</p>`;
const LINES = Array.from({ length: 12 }, (_, i) => `<p>Ligne ${i + 1}</p>`).join('');
const FRAME = (x, y, w, h, extra, html) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"${extra}><div class="pp-free-frame-box"><div class="pp-free-frame-content">${html}</div></div></div>`;
// Un cadre de texte neuf, un cadre à cinq colonnes (le nombre d'un fichier PowerPoint) et une ligne.
const POSEES = FRAME(40, 40, 400, 200, ' data-ff-line="#2f5597" data-ff-lw="2"', LINES)
  + FRAME(40, 280, 400, 120, ' data-ff-cols="5"', LINES)
  + FRAME(500, 60, 160, 0, ' data-ff-shape="line" data-ff-line="#000000" data-ff-lw="3"', '')
  + '<p></p>' + BR + '<h2>Deux</h2><p>Texte</p>';
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Formes', '${SLIDES}', false, 'presentation');
  add(8, 'Posées', ${JSON.stringify(POSEES)}, false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;
const TEXTS = {
  fr: { orient: 'Orientation du texte', orients: ['Horizontal', 'Pivoté de 90° (de haut en bas)', 'Pivoté de 270° (de bas en haut)'], columns: 'Colonnes de texte', rows: ['1 colonne', '2 colonnes', '3 colonnes', '4 colonnes'], five: '5 colonnes' },
  en: { orient: 'Text direction', orients: ['Horizontal', 'Rotated 90° (top to bottom)', 'Rotated 270° (bottom to top)'], columns: 'Text columns', rows: ['1 column', '2 columns', '3 columns', '4 columns'], five: '5 columns' },
};
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;

function toolsOf(page) {
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const hover = async (selector, index = 0) => {
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    return c;
  };
  const click = async (selector, index = 0) => { const c = await hover(selector, index); await page.mouse.click(c.x, c.y); await sleep(250); return c; };
  return { rectOf, hover, click };
}

const frames = page => page.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.forEach((node) => { if (node.type.name === 'freeFrame' || node.type.name === 'freeLine') out.push({ kind: node.type.name, cols: node.attrs.cols, colGap: node.attrs.colGap, vert: node.attrs.vert }); });
  return out;
});
const selectedFrame = page => page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return !!FreeFrame.frameAround(s.$from) || !!(s.node && /^free/.test(s.node.type.name)); });
const htmlOf = page => page.evaluate(() => EditorCore.getEditor().getHTML());
const barIds = page => page.evaluate(() => {
  const bar = document.querySelector('.v2-frame-toolbar');
  if (!bar || bar.getBoundingClientRect().width === 0) return null;
  const r = bar.getBoundingClientRect();
  const buttons = Array.from(bar.querySelectorAll('button')).filter(b => b.getBoundingClientRect().width > 0 && getComputedStyle(b).display !== 'none');
  const chip = document.getElementById('v2-frame-columns-open');
  const orient = document.getElementById('v2-frame-orient-open');
  return {
    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width }, ids: buttons.map(b => b.id || b.dataset.action),
    inside: buttons.every((b) => { const q = b.getBoundingClientRect(); return q.left >= r.left - 0.5 && q.right <= r.right + 0.5 && q.width > 0; }),
    orient: orient ? { name: orient.getAttribute('aria-label'), popup: orient.getAttribute('aria-haspopup'), shown: orient.getBoundingClientRect().width > 0 } : null,
    chip: chip ? { name: chip.getAttribute('aria-label'), title: chip.title, popup: chip.getAttribute('aria-haspopup'), expanded: chip.getAttribute('aria-expanded'), svg: !!chip.querySelector('svg'), shown: chip.getBoundingClientRect().width > 0 } : null,
  };
});
const menuState = (page, which = 'columns') => page.evaluate((name) => {
  const menu = document.querySelector('.v2-frame-' + name + '-menu.visible');
  if (!menu) return null;
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width }; };
  const rows = Array.from(menu.querySelectorAll('[data-action*=":"]')).filter(b => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0);
  return {
    menu: rect(menu), role: menu.getAttribute('role'), label: menu.getAttribute('aria-label'),
    rows: rows.map(b => ({ id: b.dataset.action.split(':')[1], name: b.textContent.trim(), checked: b.getAttribute('aria-checked'), role: b.getAttribute('role'), svg: !!b.querySelector('svg'), rect: rect(b) })),
  };
}, which);
// Les paragraphes du cadre `index` sur l'écran : le dernier est-il à droite du premier ?
const flowOf = (page, index) => page.evaluate((i) => {
  const items = document.querySelectorAll('.pp-free-frame')[i].querySelectorAll('.pp-free-frame-content > p');
  const first = items[0].getBoundingClientRect();
  const last = items[items.length - 1].getBoundingClientRect();
  return { lastRight: last.left > first.left + 30, lastBelow: last.top > first.top + 30, firstLeftOfLast: first.left < last.left - 5, firstTall: first.height > first.width };
}, index);

async function part(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { click, rectOf } = toolsOf(page);
  const press = async (key) => { await page.keyboard.press(key); await sleep(260); };
  await Promise.race([
    page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '8', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })),
    sleep(20000),
  ]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '8', null, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === 2; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(900);
  await click('.pp-slide-item', 0);
  // Un cadre se prend par le quart gauche de son bord du haut : il est sélectionné et sa barre apparaît.
  const takeFrame = async (index) => {
    const box = await rectOf('.pp-free-frame .pp-free-frame-box', index);
    await page.mouse.move(box.left + box.width * 0.25, box.top + 1);
    await page.mouse.down();
    await page.mouse.up();
    await sleep(350);
  };

  console.log('\n' + tag + '1) Le bouton « ' + T.columns + ' » et son menu');
  await takeFrame(0);
  const base = await htmlOf(page);
  const bar = await barIds(page);
  const ids = bar ? bar.ids : [];
  check(tag + `la barre du cadre de texte a le bouton « ${T.columns} » après l'animation et le bouton de l'orientation, entière dans le panneau de 700x400, chaque bouton dans la barre`,
    !!bar && ids.indexOf('v2-frame-orient-open') === ids.indexOf('animate') + 1 && ids.indexOf('v2-frame-columns-open') === ids.indexOf('v2-frame-orient-open') + 1 && bar.inside && inPanel(bar.rect), bar);
  check(tag + `le bouton se nomme « ${T.columns} » (nom accessible et info-bulle), annonce son menu, son icône est là`,
    !!bar && !!bar.chip && bar.chip.name === T.columns && bar.chip.title === T.columns && bar.chip.popup === 'true' && bar.chip.expanded === 'false' && bar.chip.svg, bar && bar.chip);
  await click('#v2-frame-columns-open');
  let menu = await menuState(page);
  check(tag + `le menu est ouvert (rôle « menu », nom « ${T.columns} »), quatre lignes « ${T.rows.join(' », « ')} », chacune avec son icône, « ${T.rows[0]} » cochée, tout dans le panneau de 700x400`,
    !!menu && menu.role === 'menu' && menu.label === T.columns && JSON.stringify(menu.rows.map(r => r.name)) === JSON.stringify(T.rows) && menu.rows.every(r => r.svg && r.role === 'menuitemradio' && inPanel(r.rect))
    && menu.rows.map(r => r.checked).join() === 'true,false,false,false' && inPanel(menu.menu), menu);
  const contrasts = [];
  for (const n of [1, 3]) contrasts.push(await contrastOf(page, `.v2-frame-columns-menu.visible [data-action="columns:${n}"]`));
  contrasts.push(await contrastOf(page, '#v2-frame-columns-open'));
  check(tag + 'les lignes du menu et le bouton sont lisibles (>= 4,5:1)', contrasts.every(c => c >= 4.5), contrasts);
  await click('#v2-frame-columns-open');
  check(tag + 'un second clic sur le bouton referme le menu et le cadre reste sélectionné', (await menuState(page)) === null && (await selectedFrame(page)));

  console.log('\n' + tag + '2) Un choix, un pas d\'historique');
  await click('#v2-frame-columns-open');
  await click('.v2-frame-columns-menu.visible [data-action="columns:3"]');
  let state = (await frames(page))[0];
  let flow = await flowOf(page, 0);
  check(tag + `« ${T.rows[2]} » donne trois colonnes de 18 points au cadre, le menu se ferme, le cadre reste sélectionné`, state.cols === 3 && state.colGap === 18 && (await menuState(page)) === null && (await selectedFrame(page)), state);
  check(tag + 'sur l\'écran, le texte est en colonnes : le dernier paragraphe est à droite du premier', flow.lastRight && !flow.lastBelow, flow);
  await click('#v2-frame-columns-open');
  menu = await menuState(page);
  check(tag + `le menu rouvert coche « ${T.rows[2]} » seule`, !!menu && menu.rows.map(r => r.checked).join() === 'false,false,true,false', menu && menu.rows.map(r => [r.id, r.checked]));
  await click('#v2-frame-columns-open');
  await press('Control+z');
  state = (await frames(page))[0];
  check(tag + 'un seul Ctrl+Z défait ce choix : le cadre est comme avant, au caractère près', (await htmlOf(page)) === base && state.cols === 0, state);
  await press('Control+Shift+z');
  check(tag + 'Ctrl+Maj+Z le rétablit', (await frames(page))[0].cols === 3);
  await press('Control+z');
  await press('Control+y');
  check(tag + 'et Ctrl+Y de même, le cadre restant sélectionné', (await frames(page))[0].cols === 3 && (await selectedFrame(page)));
  await click('#v2-frame-columns-open');
  await click('.v2-frame-columns-menu.visible [data-action="columns:1"]');
  state = (await frames(page))[0];
  flow = await flowOf(page, 0);
  check(tag + `« ${T.rows[0]} » rend le cadre à une colonne (ni colonnes ni écart), le texte revient en une pile`, state.cols === 0 && state.colGap === 0 && flow.lastBelow && !flow.lastRight, { state, flow });

  console.log('\n' + tag + '3) Le nombre d\'un fichier PowerPoint et la ligne');
  await takeFrame(1);
  await click('#v2-frame-columns-open');
  menu = await menuState(page);
  check(tag + `un cadre à cinq colonnes (d'un fichier PowerPoint) a une cinquième ligne « ${T.five} », cochée, seule cochée`,
    !!menu && menu.rows.length === 5 && menu.rows[4].name === T.five && menu.rows.map(r => r.checked).join() === 'false,false,false,false,true' && inPanel(menu.menu), menu && menu.rows.map(r => [r.name, r.checked]));
  await click('#v2-frame-columns-open');
  console.log('\n' + tag + '4) L\'orientation du texte');
  await takeFrame(0);
  const bar2 = await barIds(page);
  const ids2 = bar2 ? bar2.ids : [];
  check(tag + `la barre a le bouton « ${T.orient} » juste avant « ${T.columns} », nommé dans la langue de la page, avec son menu`, !!bar2 && !!bar2.orient && ids2.indexOf('v2-frame-orient-open') === ids2.indexOf('v2-frame-columns-open') - 1 && bar2.orient.name === T.orient && bar2.orient.popup === 'true' && bar2.inside && inPanel(bar2.rect), bar2);
  await click('#v2-frame-orient-open');
  menu = await menuState(page, 'orient');
  check(tag + `le menu (nom « ${T.orient} ») a trois lignes « ${T.orients.join(' », « ')} », « ${T.orients[0]} » cochée, tout dans le panneau`, !!menu && menu.label === T.orient && menu.role === 'menu' && JSON.stringify(menu.rows.map(r => r.name)) === JSON.stringify(T.orients) && menu.rows.map(r => r.checked).join() === 'true,false,false' && menu.rows.every(r => r.svg && inPanel(r.rect)) && inPanel(menu.menu), menu);
  const orientContrast = await contrastOf(page, '.v2-frame-orient-menu.visible [data-action="orient:vert"]');
  check(tag + 'les lignes du menu sont lisibles (>= 4,5:1)', orientContrast >= 4.5, orientContrast);
  await click('.v2-frame-orient-menu.visible [data-action="orient:vert270"]');
  state = (await frames(page))[0];
  flow = await flowOf(page, 0);
  check(tag + `« ${T.orients[2]} » tourne le texte (vert270) : les lignes se suivent de gauche à droite, plus hautes que larges ; le menu se ferme, le cadre reste sélectionné`, state.vert === 'vert270' && flow.firstLeftOfLast && flow.firstTall && (await menuState(page, 'orient')) === null && (await selectedFrame(page)), { state, flow });
  await press('Control+z');
  state = (await frames(page))[0];
  check(tag + 'un seul Ctrl+Z défait ce choix : le cadre est comme avant (à plat)', state.vert === '' && (await flowOf(page, 0)).lastBelow, state);
  await press('Control+Shift+z');
  check(tag + 'Ctrl+Maj+Z le rétablit', (await frames(page))[0].vert === 'vert270');
  await click('#v2-frame-orient-open');
  await click('.v2-frame-orient-menu.visible [data-action="orient:vert"]');
  flow = await flowOf(page, 0);
  check(tag + `« ${T.orients[1]} » : les lignes se suivent de droite à gauche (la première est à droite de la dernière)`, (await frames(page))[0].vert === 'vert' && !flow.firstLeftOfLast && flow.firstTall, flow);
  await click('#v2-frame-orient-open');
  await click('.v2-frame-orient-menu.visible [data-action="orient:horz"]');
  check(tag + `« ${T.orients[0]} » rend le cadre à plat`, (await frames(page))[0].vert === '' && (await flowOf(page, 0)).lastBelow);
  await page.evaluate(() => { const line = document.querySelector('.pp-free-line, .pp-free-frame[data-ff-shape="line"]'); if (line) line.scrollIntoView({ block: 'center' }); });
  await sleep(200);
  await takeFrame(1);
  await chooseObject(page, 'line:plain');
  const lineBar = await barIds(page);
  check(tag + 'une ligne n\'a pas le bouton des colonnes ni celui de l\'orientation', !!lineBar && !!lineBar.chip && !lineBar.chip.shown && !!lineBar.orient && !lineBar.orient.shown, lineBar && [lineBar.chip, lineBar.orient]);
}

await part('fr', 'light');
await part('en', 'dark');
await t.finish();
