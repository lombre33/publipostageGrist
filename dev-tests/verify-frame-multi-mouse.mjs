#!/usr/bin/env node
// Plusieurs objets de diapositive à la fois (js/frame-multi.js, js/free-frame.js, css/free-frame.css ; chantier « alignement et sélection multiple » de l'audit Slides+ du 02/11, premier lot : sélection,
// alignement, répartition), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active.
//  LA SÉLECTION : un cadre pris par son bord, Maj + clic sur le bord d'un autre l'ajoute (et un second Maj + clic l'en retire) ; Ctrl + A, un cadre sélectionné, les prend tous ; Échap revient au premier.
//  LA BARRE : à deux cadres ou plus la barre « objets sélectionnés » remplace celle du cadre (entière dans le panneau), « Répartir » est grisé avec sa raison tant qu'ils ne sont pas trois.
//  LES GESTES : aligner (six réglages), répartir à égalité, glisser le bord de l'un les déplace tous, les flèches aussi, Ctrl + D les duplique, Suppr les supprime ; chaque geste est UN pas d'historique.
//  UN CADRE SEUL : le menu « Aligner sur la diapositive » de sa barre le centre sur la page.
//  LES REPÈRES (03/11, « Idem + guides + groupes ») : en glissant, un cadre s'accroche au bord d'un autre et au centre de la page, des traits roses le disent et partent à la souris relâchée ; Alt suspend l'accroche.
//  LES GROUPES : Ctrl + G (ou le bouton), un clic sur l'un prend tout le groupe, il se déplace d'un bloc, Maj + clic ne le coupe pas, Ctrl + Maj + G le défait, Ctrl + D en fait une copie à part, un clic dans le
//  texte d'un membre y pose le curseur, le groupe survit à l'enregistrement du HTML ; chaque geste est UN pas d'historique.
// Lancé par run-headless.mjs (groupe Node "frameMultiMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-frame-multi-mouse.mjs
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-frame-multi-mouse', port: Number(process.env.FRAME_MULTI_PORT || 9185) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const frame = (x, y, w, h, text) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"><div class="pp-free-frame-box"><div class="pp-free-frame-content"><p>${text}</p></div></div></div>`;
const FRAMES = frame(40, 20, 120, 40, 'A') + frame(300, 50, 150, 70, 'B') + frame(560, 30, 100, 50, 'C');
const POSEE = FRAMES + '<p></p>' + BR + '<h2>Deux</h2><p>Texte</p>';
const SEED = seedModels() + `
  add(8, 'Trois cadres', ${JSON.stringify(POSEE)}, false, 'presentation');
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
  EditorCore.getEditor().state.doc.forEach((node) => { if (node.type.name === 'freeFrame') out.push({ x: node.attrs.x, y: node.attrs.y, w: node.attrs.w, h: node.attrs.h, text: node.textContent, group: node.attrs.group }); });
  return out.sort((p, q) => p.text.localeCompare(q.text));
});
const selectedCount = page => page.evaluate(() => FrameMulti.count(EditorCore.getEditor().state));
const near = (a, b, d = 0.05) => Math.abs(a - b) <= d;
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
    page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '8', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })),
    sleep(20000),
  ]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '8', null, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === 2; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(900);
  const first = await rectOf(page, '.pp-slide-item', 0);
  if (first) { await page.mouse.click(first.x, first.y); await sleep(300); }
  await page.evaluate(() => document.querySelector('#editor-container .tiptap .pp-free-frame').scrollIntoView({ block: 'center' }));
  await sleep(250);
  const base = await htmlOf(page);
  // Le bord du haut du cadre qui porte la lettre `letter` (A, B ou C) : l'ordre des cadres dans le document change quand un geste est défait.
  const edgeOf = letter => page.evaluate((l) => {
    const frame = Array.from(document.querySelectorAll('#editor-container .tiptap .pp-free-frame')).find(f => f.textContent.trim() === l);
    frame.scrollIntoView({ block: 'center' });
    const r = frame.querySelector('.pp-ff-edge-n').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, letter);
  const clickEdge = async (letter, shift) => {
    const e = await edgeOf(letter);
    await page.mouse.move(e.x, e.y);
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.up();
    if (shift) await page.keyboard.up('Shift');
    await sleep(300);
  };

  console.log('\n' + tag + '1) La sélection');
  const start3 = await framesOf(page);
  check(tag + 'trois cadres A, B, C au départ', start3.length === 3 && start3.map(f => f.text).join('') === 'ABC', start3);
  await clickEdge('A', false);
  check(tag + 'un clic sur le bord de « A » le sélectionne seul : un cadre choisi', (await selectedCount(page)) === 1);
  check(tag + 'sa barre de cadre est là, pas la barre « objets sélectionnés »', inPanel(await barOf(page, '.v2-frame-toolbar')) && (await barOf(page, '.v2-multi-toolbar')) === null);
  await clickEdge('B', true);
  check(tag + 'Maj + clic sur le bord de « B » l\'ajoute : deux cadres choisis', (await selectedCount(page)) === 2);
  const multiBar = await barOf(page, '.v2-multi-toolbar');
  check(tag + 'la barre « objets sélectionnés » remplace celle du cadre, entière dans le panneau', inPanel(multiBar) && (await barOf(page, '.v2-frame-toolbar')) === null, { multiBar });
  const outlined = await page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .tiptap .pp-free-frame.pp-ff-multi')).length);
  check(tag + 'les deux cadres ont le contour de la sélection', outlined === 2, outlined);
  const distribute = await page.evaluate(() => { const b = document.querySelector('.v2-multi-toolbar [data-action="distribute-h"]'); return { disabled: b.disabled, title: b.title }; });
  check(tag + '« Répartir » est grisé avec sa raison tant qu\'ils ne sont que deux', distribute.disabled && distribute.title.length > 10, distribute);
  await clickEdge('B', true);
  check(tag + 'un second Maj + clic sur « B » l\'en retire : un cadre choisi', (await selectedCount(page)) === 1);
  await clickEdge('B', true);
  await clickEdge('C', true);
  check(tag + 'trois cadres choisis', (await selectedCount(page)) === 3);
  const distribute3 = await page.evaluate(() => { const b = document.querySelector('.v2-multi-toolbar [data-action="distribute-h"]'); return { disabled: b.disabled }; });
  check(tag + '« Répartir » est dégrisé à trois', !distribute3.disabled, distribute3);
  await press('Escape');
  check(tag + 'Échap revient au cadre principal seul', (await selectedCount(page)) === 1);
  await press('Control+a');
  check(tag + 'Ctrl + A, un cadre sélectionné, prend les trois cadres de la diapositive', (await selectedCount(page)) === 3);

  console.log('\n' + tag + '2) Aligner et répartir');
  const bar = '.v2-multi-toolbar';
  const clickBar = async (action) => {
    const b = await rectOf(page, `${bar} [data-action="${action}"]`);
    await page.mouse.move(b.x, b.y);
    await page.mouse.click(b.x, b.y);
    await sleep(350);
  };
  await clickBar('left');
  let now = await framesOf(page);
  check(tag + 'Aligner à gauche : les trois cadres ont le bord gauche de « A » (x = 40)', now.every(f => near(f.x, 40)) && now.map(f => f.y).join() === start3.map(f => f.y).join(), now);
  check(tag + 'les trois restent choisis et la barre reste', (await selectedCount(page)) === 3 && inPanel(await barOf(page, bar)));
  await press('Control+z');
  check(tag + 'un seul Ctrl+Z rend le HTML tel qu\'il était', (await htmlOf(page)) === base);
  check(tag + 'Ctrl+Z rend aussi la sélection : le cadre principal seul (la liste des autres a suivi)', (await selectedCount(page)) >= 1);
  await press('Control+a');
  await clickBar('right');
  now = await framesOf(page);
  const rightEdge = Math.max(...start3.map(f => f.x + f.w));
  check(tag + 'Aligner à droite : le bord droit de chaque cadre est celui de « C » (x + largeur = 660)', now.every(f => near(f.x + f.w, rightEdge)), { now, rightEdge });
  await press('Control+z');
  await press('Control+a');
  await clickBar('center');
  now = await framesOf(page);
  const mid = (Math.min(...start3.map(f => f.x)) + rightEdge) / 2;
  check(tag + 'Centrer horizontalement : le centre de chaque cadre est celui de l\'ensemble', now.every(f => near(f.x + f.w / 2, mid)), { now, mid });
  await press('Control+z');
  await press('Control+a');
  await clickBar('top');
  now = await framesOf(page);
  check(tag + 'Aligner en haut : le haut de chaque cadre est celui de « A » (y = 20)', now.every(f => near(f.y, 20)), now);
  await press('Control+z');
  await press('Control+a');
  await clickBar('bottom');
  now = await framesOf(page);
  const bottom = Math.max(...start3.map(f => f.y + f.h));
  check(tag + 'Aligner en bas : le bas de chaque cadre est celui de « B » (y + hauteur = 120)', now.every(f => near(f.y + Math.max(f.h, 0), bottom, 8)), { now, bottom });
  await press('Control+z');
  await press('Control+a');
  await clickBar('middle');
  now = await framesOf(page);
  const midY = (Math.min(...start3.map(f => f.y)) + bottom) / 2;
  check(tag + 'Centrer verticalement : le milieu de chaque cadre est celui de l\'ensemble', now.every(f => near(f.y + f.h / 2, midY, 8)), { now, midY });
  await press('Control+z');
  await press('Control+a');
  // Répartir : « A » (x 40, 120 de large) et « C » (x 560, 100) restent ; « B » (150) se met au milieu à égale distance des deux.
  await clickBar('distribute-h');
  now = await framesOf(page);
  const gapLeft = now[1].x - (now[0].x + now[0].w);
  const gapRight = now[2].x - (now[1].x + now[1].w);
  check(tag + 'Répartir horizontalement : « A » et « C » restent, les deux vides sont égaux', near(now[0].x, 40) && near(now[2].x, 560) && near(gapLeft, gapRight, 0.1), { now, gapLeft, gapRight });
  await press('Control+z');
  check(tag + 'un Ctrl+Z rend le HTML d\'avant', (await htmlOf(page)) === base);

  console.log('\n' + tag + '3) Déplacer, dupliquer, supprimer');
  await press('Control+a');
  const before = await framesOf(page);
  await press('ArrowRight');
  await press('ArrowDown');
  now = await framesOf(page);
  check(tag + 'les flèches déplacent les trois cadres d\'un point', now.every((f, i) => near(f.x, before[i].x + 1) && near(f.y, before[i].y + 1)), now);
  await press('Shift+ArrowLeft');
  now = await framesOf(page);
  check(tag + 'Maj + flèche les déplace de dix points', now.every((f, i) => near(f.x, before[i].x - 9)), now);
  await press('Control+z');
  await press('Control+z');
  await press('Control+z');
  check(tag + 'trois Ctrl+Z défont les trois pas', (await htmlOf(page)) === base);
  // Glisser le bord de « B » : A et C suivent.
  await press('Control+a');
  const handle = await edgeOf('B');
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 30, handle.y + 12, { steps: 5 });
  await page.mouse.move(handle.x + 60, handle.y + 24, { steps: 5 });
  await page.mouse.up();
  await sleep(450);
  now = await framesOf(page);
  const moved = now.map((f, i) => ({ dx: f.x - start3[i].x, dy: f.y - start3[i].y }));
  check(tag + 'glisser le bord d\'un cadre choisi déplace les trois du même écart (non nul, à 0,3 pt près)', moved.every(m => Math.abs(m.dx - moved[0].dx) < 0.3 && Math.abs(m.dy - moved[0].dy) < 0.3) && Math.abs(moved[0].dx) > 10, moved);
  check(tag + 'les trois restent choisis après le glissé', (await selectedCount(page)) === 3);
  await press('Control+z');
  check(tag + 'UN Ctrl+Z défait le glissé de tous', (await htmlOf(page)) === base);
  await press('Control+a');
  await press('Control+d');
  now = await framesOf(page);
  check(tag + 'Ctrl + D duplique les trois (six cadres), la copie est choisie', now.length === 6 && (await selectedCount(page)) === 3, { n: now.length, c: await selectedCount(page) });
  await press('Control+z');
  check(tag + 'UN Ctrl+Z retire les trois copies', (await htmlOf(page)) === base);
  await press('Control+a');
  await press('Delete');
  now = await framesOf(page);
  check(tag + 'Suppr supprime les trois cadres choisis', now.length === 0, now);
  await press('Control+z');
  check(tag + 'UN Ctrl+Z les rend', (await htmlOf(page)) === base);

  console.log('\n' + tag + '4) Un cadre seul : « Aligner sur la diapositive »');
  await clickEdge('A', false);
  const chip = await rectOf(page, '#v2-frame-align-open');
  check(tag + 'la barre du cadre seul a le menu « Aligner » ; la barre reste entière dans le panneau', !!chip && inPanel(await barOf(page, '.v2-frame-toolbar')), { chip });
  await page.mouse.move(chip.x, chip.y);
  await page.mouse.click(chip.x, chip.y);
  await sleep(350);
  const row = await rectOf(page, '.v2-frame-align-menu [data-action="align:center"]');
  check(tag + 'le menu a ses six lignes, dans le panneau', !!row && inPanel(row) && (await page.evaluate(() => document.querySelectorAll('.v2-frame-align-menu [data-action^="align:"]').length)) === 6, row);
  await page.mouse.move(row.x, row.y);
  await page.mouse.click(row.x, row.y);
  await sleep(350);
  now = await framesOf(page);
  const size = await page.evaluate(() => PageLayout.getPageSizePt());
  const a = now[0];
  check(tag + 'Centrer horizontalement : « A » est centré sur la page (son centre est celui de la page)', near(a.x + a.w / 2, size.width / 2, 0.1), { a, size });
  await clickEdge('A', false);
  const chip2 = await rectOf(page, '#v2-frame-align-open');
  await page.mouse.move(chip2.x, chip2.y);
  await page.mouse.click(chip2.x, chip2.y);
  await sleep(350);
  const bottomRow = await rectOf(page, '.v2-frame-align-menu [data-action="align:bottom"]');
  await page.mouse.move(bottomRow.x, bottomRow.y);
  await page.mouse.click(bottomRow.x, bottomRow.y);
  await sleep(350);
  now = await framesOf(page);
  check(tag + 'Aligner en bas : « A » touche le bas de la page', near(now[0].y + Math.max(now[0].h, 0), size.height, 8), { a: now[0], size });
  await press('Control+z');
  await press('Control+z');
  check(tag + 'deux Ctrl+Z rendent le HTML d\'avant', (await htmlOf(page)) === base);

  console.log('\n' + tag + '5) Les repères');
  const dragEdge = async (letter, dxPt, dyPt, hold) => {
    const zoom = await page.evaluate(() => EditorCore.layoutZoom(document.querySelector('#editor-container .tiptap .pp-free-frame')));
    // Un point du bord du haut à un cinquième de sa longueur : le milieu porte la poignée du haut d'un cadre choisi, qui redimensionnerait au lieu de déplacer.
    const e = await page.evaluate((l) => {
      const frame = Array.from(document.querySelectorAll('#editor-container .tiptap .pp-free-frame')).find(f => f.textContent.trim() === l);
      frame.scrollIntoView({ block: 'center' });
      const r = frame.querySelector('.pp-ff-edge-n').getBoundingClientRect();
      return { x: r.left + r.width * 0.2, y: r.top + r.height / 2 };
    }, letter);
    const px = pt => pt / 0.75 * zoom;
    await page.mouse.move(e.x, e.y);
    await page.mouse.down();
    if (hold) await page.keyboard.down('Alt');
    await page.mouse.move(e.x + px(dxPt) / 2, e.y + px(dyPt) / 2, { steps: 4 });
    await page.mouse.move(e.x + px(dxPt), e.y + px(dyPt), { steps: 4 });
    await sleep(150);
    const guides = await page.evaluate(() => Array.from(document.querySelectorAll('.pp-ff-guide')).map(g => ({ cls: g.className, left: g.getBoundingClientRect().left, top: g.getBoundingClientRect().top, w: g.getBoundingClientRect().width, h: g.getBoundingClientRect().height })));
    if (hold) await page.keyboard.up('Alt');
    await page.mouse.up();
    await sleep(450);
    return guides;
  };
  // « A » (x 40) est glissé à x = 303, trois points du bord gauche de « B » (300) : il s'accroche à 300 exactement, et un trait vertical le montre pendant le geste.
  let seen = await dragEdge('A', 263, 0, false);
  now = await framesOf(page);
  check(tag + 'glisser « A » à 3 pt du bord gauche de « B » : il s\'accroche (x = 300 exactement)', near(now[0].x, 300, 0.01), now[0]);
  check(tag + 'un trait vertical rose le montrait pendant le geste, de la hauteur des deux cadres', seen.some(g => g.cls.indexOf('pp-ff-guide-x') >= 0 && g.h > 20 && g.w <= 2), seen);
  check(tag + 'les traits partent quand la souris est relâchée', (await page.evaluate(() => document.querySelectorAll('.pp-ff-guide, .pp-ff-guides').length)) === 0);
  await press('Control+z');
  check(tag + 'UN Ctrl+Z rend « A » à sa place (le HTML d\'avant)', (await htmlOf(page)) === base);
  // Alt suspend l'accroche : « A » arrive à 303 (aucun trait).
  seen = await dragEdge('A', 263, 0, true);
  now = await framesOf(page);
  check(tag + 'avec Alt, « A » n\'est pas accroché (x = 303 à 1 pt près, pas 300) et aucun trait ne se montre', near(now[0].x, 303, 1) && Math.abs(now[0].x - 300) > 1.5 && seen.length === 0, { a: now[0], seen });
  await press('Control+z');
  // Le centre de « B » (375) à 3 pt du centre de la page (480) : x + largeur / 2 = la moitié de la page.
  const page1 = await page.evaluate(() => PageLayout.getPageSizePt());
  seen = await dragEdge('B', 480 - 375 - 3, 0, false);
  now = await framesOf(page);
  check(tag + '« B » glissé près du centre de la page s\'y accroche (son centre est celui de la page)', near(now[1].x + now[1].w / 2, page1.width / 2, 0.1) && seen.some(g => g.cls.indexOf('pp-ff-guide-x') >= 0), { b: now[1], page1, seen });
  await press('Control+z');
  check(tag + 'rendu : le HTML d\'avant', (await htmlOf(page)) === base);
  // Le groupe en mouvement s'accroche comme un seul objet : « A » et « B » choisis, glissés ensemble, le bord droit de l'ensemble sur celui de « C ».
  await clickEdge('A', false);
  await clickEdge('B', true);
  seen = await dragEdge('A', 560 + 100 - 450 - 3, 0, false);
  now = await framesOf(page);
  check(tag + 'deux cadres choisis glissés : leur ensemble s\'accroche (bord droit de « B » sur celui de « C », 660), « A » suit du même écart', near(now[1].x + now[1].w, 660, 0.01) && near(now[0].x - 40, now[1].x - 300, 0.3), now);
  await press('Control+z');
  check(tag + 'UN Ctrl+Z rend les deux', (await htmlOf(page)) === base);

  console.log('\n' + tag + '6) Les groupes');
  const groupsOf = async () => (await framesOf(page)).map(f => f.group || '');
  await clickEdge('A', false);
  await clickEdge('B', true);
  await clickEdge('C', true);
  const gBtn = await page.evaluate(() => { const g = document.querySelector('.v2-multi-toolbar [data-action="group"]'); const u = document.querySelector('.v2-multi-toolbar [data-action="ungroup"]'); return { gOff: g.disabled, uOff: u.disabled, uTitle: u.title }; });
  check(tag + 'à trois objets libres, « Grouper » est actif et « Dissocier » est grisé avec sa raison', !gBtn.gOff && gBtn.uOff && gBtn.uTitle.length > 10, gBtn);
  await press('Control+g');
  let groups = await groupsOf();
  check(tag + 'Ctrl + G : les trois objets ont le même groupe, non vide', groups.every(g => g && g === groups[0]), groups);
  check(tag + 'le HTML enregistré porte data-ff-group trois fois, le même', ((await htmlOf(page)).match(/data-ff-group="([a-z0-9]+)"/g) || []).length === 3);
  const gBtn2 = await page.evaluate(() => { const g = document.querySelector('.v2-multi-toolbar [data-action="group"]'); const u = document.querySelector('.v2-multi-toolbar [data-action="ungroup"]'); return { gOff: g.disabled, uOff: u.disabled }; });
  check(tag + 'groupés, « Grouper » est grisé (ils forment déjà un groupe) et « Dissocier » est actif', gBtn2.gOff && !gBtn2.uOff, gBtn2);
  await press('Control+z');
  check(tag + 'UN Ctrl+Z défait le groupe (le HTML d\'avant)', (await htmlOf(page)) === base);
  await press('Control+y');
  groups = await groupsOf();
  check(tag + 'Ctrl+Y le refait', groups.every(g => g && g === groups[0]), groups);
  const keepId = groups[0];
  // Un clic sur le bord de « A » : tout le groupe est choisi.
  await clickEdge('A', false);
  check(tag + 'un clic sur le bord de « A » choisit les trois du groupe', (await selectedCount(page)) === 3, await selectedCount(page));
  // Le groupe se déplace d'un bloc.
  seen = await dragEdge('B', 20, 40, false);
  now = await framesOf(page);
  const moved6 = now.map((f, i) => ({ dx: f.x - start3[i].x, dy: f.y - start3[i].y }));
  check(tag + 'glisser le bord de l\'un déplace tout le groupe du même écart, les trois restent choisis', moved6.every(m => Math.abs(m.dx - moved6[0].dx) < 0.3 && Math.abs(m.dy - moved6[0].dy) < 0.3) && Math.abs(moved6[0].dx) > 5 && (await selectedCount(page)) === 3, moved6);
  await press('Control+z');
  // Maj + clic sur un membre ne coupe pas le groupe ; Échap non plus.
  await clickEdge('B', true);
  check(tag + 'Maj + clic sur un membre ne laisse pas un morceau du groupe : les trois restent choisis', (await selectedCount(page)) === 3, await selectedCount(page));
  await press('Escape');
  check(tag + 'Échap ne laisse pas un morceau du groupe non plus', (await selectedCount(page)) === 3);
  // Ctrl + D : la copie est un groupe à part.
  await press('Control+d');
  groups = await groupsOf();
  const kinds = Array.from(new Set(groups));
  check(tag + 'Ctrl + D : six objets, deux groupes distincts de trois (la copie n\'est pas mêlée à l\'original)', groups.length === 6 && kinds.length === 2 && kinds.every(k => k && groups.filter(g => g === k).length === 3) && kinds.indexOf(keepId) >= 0, groups);
  await press('Control+z');
  check(tag + 'UN Ctrl+Z retire la copie', (await groupsOf()).length === 3);
  // Le groupe survit au HTML : on le relit.
  const roundtrip = await page.evaluate(() => { const ed = EditorCore.getEditor(); const html = ed.getHTML(); Editor.setHTML(html); return EditorCore.getEditor().getHTML() === html; });
  groups = await groupsOf();
  check(tag + 'relu depuis le HTML, le groupe est le même (trois objets, même identifiant) et le HTML est identique', roundtrip && groups.length === 3 && groups.every(g => g === keepId), { roundtrip, groups });
  // Un clic dans le texte d'un membre y pose le curseur (et choisit rien).
  await clickEdge('A', false);
  const inB = await page.evaluate(() => { const f = Array.from(document.querySelectorAll('#editor-container .tiptap .pp-free-frame')).find(x => x.textContent.trim() === 'B'); f.scrollIntoView({ block: 'center' }); const r = f.querySelector('.pp-free-frame-content p').getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 }; });
  await page.mouse.move(inB.x, inB.y);
  await page.mouse.click(inB.x, inB.y);
  await sleep(300);
  check(tag + 'un clic dans le texte de « B » (groupé) y pose le curseur : plus de cadre choisi, le groupe reste', (await selectedCount(page)) === 0 && (await groupsOf()).every(g => g === keepId), { c: await selectedCount(page) });
  // Dissocier : Ctrl + Maj + G.
  await clickEdge('A', false);
  await press('Control+Shift+g');
  groups = await groupsOf();
  check(tag + 'Ctrl + Maj + G : plus aucun groupe, les trois restent choisis', groups.every(g => g === '') && (await selectedCount(page)) === 3, { groups, c: await selectedCount(page) });
  check(tag + 'le HTML ne porte plus data-ff-group', (await htmlOf(page)) === base);
  await press('Escape');
  check(tag + 'sans groupe, Échap revient à « A » seul (rien ne le retient plus avec les autres)', (await selectedCount(page)) === 1);
}

await part('fr', 'light');
await part('en', 'dark');
await t.finish();
