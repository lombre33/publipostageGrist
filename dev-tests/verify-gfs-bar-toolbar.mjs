#!/usr/bin/env node
// Le vide que la barre d’outils laisse à la barre de GFS quand elle est posée en HAUT du cadre (consigne GFS 025, choix du porteur du 21/10 : « Laisser un vide » ; js/toolbar-gap.js, css/toolbar-v2.css).
// Chez GFS la barre de boutons recouvre le cadre au bord choisi, centrée sur lui : en haut, elle tombe sur le milieu de la première ligne de la barre d’outils. Les boutons du milieu de cette ligne se
// décalent pour lui faire place ; rien n’est caché, aucune bande n’est ajoutée, une ligne de plus est permise si la place manque. Le seul trait qui se cache est celui d’un séparateur que la coupure
// des lignes laisse seul au bord de la sienne (carte du 21/10 : « Le cacher quand il est seul »). Seul le haut est traité ici : les autres bords, les menus et les fenêtres sont la suite de la 025.
// GFS simulé (dev-tests/gfs-stub.js) dans un cadre isolé ; il ne dessine rien : une pastille posée par la page parente tient la place de la barre et prend la souris comme elle.
//  1) 700 × 400 (le panneau de Grist), barre en haut dès le contexte, vraie souris : aucun bouton de la première ligne sous la zone de la barre (ni sous la barre elle-même, toutes lignes comprises) ;
//     rien de caché ni de coupé (mêmes boutons qu’avant, tous dans le cadre, aucun sous le logo) ; l’ordre du document est celui de la lecture ; ce qui est à gauche de la zone n’a pas bougé ; pas de ligne
//     de plus ni de bande (même hauteur de barre d’outils) ; un seul élément porte le décalage ; la mise en page est stable (rien ne bouge après coup) ; le séparateur « Page | Type d’export » que la
//     coupure laisse seul au début de la deuxième ligne a son trait caché, sans que rien ne bouge. La barre « vue » à la souris : un balayage de la
//     première ligne n’arrive jamais sur la pastille là où un bouton se trouve, le survol d’Enregistrer ouvre son menu, un vrai clic sur Mode lecture puis Mode édition passe par le bouton décalé.
//  2) LA BARRE PART OU CHANGE : plus de barre (l’explorateur de GFS s’ouvre), à gauche, à droite, en bas, masquée par l’app (`GfsBar.hide`) : la ligne est telle qu’avant, au pixel près, plus aucun
//     décalage ; elle revient en haut : le vide aussi.
//  3) LA LIGNE CHANGE SOUS LA BARRE : un bouton qui disparaît (Tables liées) puis revient ; le cadre qui change de taille (900 × 500, 560 × 300 où le sélecteur du modèle se raccourcit, 1100 × 600) puis
//     qui revient à 700 × 400 : à chaque taille la zone est libre, rien n’est caché, l’ordre est gardé, au plus une ligne de plus, et chaque séparateur seul au bord d’une ligne a son trait caché (de 400 à
//     800 px de large, avec la barre puis sans) quand ceux qui séparent deux éléments d’une même ligne se voient.
//  4) UN GFS D’AVANT LA CONSIGNE 025 et la page seule : même ligne qu’une page sans barre, rien de décalé ; la page seule cache aussi le trait d’un séparateur resté seul (la règle ne tient pas à la barre).
//  5) Anglais, thème sombre : même vide.
// Lancé par run-headless.mjs (groupe Node « gfsBarToolbar », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-bar-toolbar.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-gfs-bar-toolbar', port: Number(process.env.GFS_BAR_TOOLBAR_PORT || 8929) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SEED = seedModels();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// La barre en haut d’un cadre de 700 × 400 (la forme de la consigne : 34 × 124 px à 4 px du bord, centrée, 4 px de marge autour), puis celles que le GFS simulé calcule pour un bord et une taille de cadre.
const TOP_700 = { bord: 'haut', epaisseur: 42, zone: { x: 284, y: 0, largeur: 132, hauteur: 42 } };
const barAt = (page, edge, width, height) => page.evaluate(([e, w, h]) => window.__gfsStub.zoneDe(e, w, h), [edge, width, height]);
const gfsSets = (page, bar) => page.evaluate(next => window.__gfsStub.setBarre(next), bar);
const waitEdge = (app, edge) => app.waitForFunction(wanted => document.documentElement.getAttribute('data-gfs-bar') === wanted, edge, { timeout: 5000 }).then(() => true, () => false);
// Laisse la page se mettre en page : deux images, puis un instant (le décalage se recalcule dans l’image qui suit un changement).
const settle = app => app.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 80)))));
async function setBar(page, app, bar) {
  await gfsSets(page, bar);
  await waitEdge(app, bar ? { gauche: 'left', haut: 'top', droite: 'right', bas: 'bottom' }[bar.bord] : null);
  await settle(app);
}
async function resizeFrame(page, app, width, height) {
  await page.evaluate(([w, h]) => { const frame = document.querySelector('iframe[name="app"]'); frame.style.width = w + 'px'; frame.style.height = h + 'px'; }, [width, height]);
  await app.waitForFunction(([w, h]) => window.innerWidth === w && window.innerHeight === h, [width, height], { timeout: 5000 }).catch(() => {});
  await settle(app);
}

// La première ligne de la barre d’outils : chaque élément qui occupe de la place (un regroupement par espacement donne ses boutons un à un ; ni l’élément caché, ni le logo, sorti du flux), dans
// l’ordre du document, avec son rectangle dans le cadre, s’il est un séparateur et si son trait est caché (visibility) ; les éléments qui portent le décalage ; la hauteur de la barre d’outils ; la taille du cadre ; le logo.
const measure = app => app.evaluate(() => {
  const row = document.querySelector('#toolbar-top .bar-row');
  const nameOf = el => el.id || String(el.className).split(/\s+/).filter(c => c && c !== 'pp-gfs-gap')[0] || el.tagName.toLowerCase();
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const all = [];
  Array.from(row.children).forEach((child) => { if (child.matches('.action-cluster')) all.push(...Array.from(child.children)); else all.push(child); });
  const seen = {};
  const shown = all.filter((el) => { const style = getComputedStyle(el); return style.display !== 'none' && style.position !== 'absolute'; });
  const units = shown.map((el) => {
    const name = nameOf(el);
    seen[name] = (seen[name] || 0) + 1;
    return Object.assign({ key: name + '#' + (seen[name] - 1), sep: el.classList.contains('bar-sep'), hidden: getComputedStyle(el).visibility === 'hidden' }, rectOf(el));
  });
  const logo = document.getElementById('v2-brand-logo');
  return {
    units,
    marked: Array.from(document.querySelectorAll('.pp-gfs-gap')).map(nameOf),
    markedKeys: shown.map((el, at) => (el.classList.contains('pp-gfs-gap') ? units[at].key : null)).filter(Boolean),
    height: document.getElementById('toolbar-top').getBoundingClientRect().height,
    frame: [window.innerWidth, window.innerHeight],
    logo: logo ? rectOf(logo) : null,
  };
});

const centreY = u => (u.top + u.bottom) / 2;
const hits = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
// Le nombre de lignes : les centres verticaux à plus de 10 px les uns des autres font des lignes à part.
function linesOf(units) {
  let lines = 0, last = -1e9;
  units.map(centreY).sort((a, b) => a - b).forEach((y) => { if (y - last > 10) lines += 1; last = y; });
  return lines;
}
const round = n => Math.round(n * 10) / 10;

// Ce qui cloche entre la ligne d’une page sans barre (`ref`) et la ligne avec la barre en haut (`now`, zone `zone` en px du cadre : { x, y, largeur, hauteur }).
function problemsOf(ref, now, zone) {
  const zoneRect = { left: zone.x, top: zone.y, right: zone.x + zone.largeur, bottom: zone.y + zone.hauteur };
  // La barre elle-même : la zone moins la marge de 4 px que GFS garde tout autour.
  const barRect = { left: zone.x + 4, top: zone.y + 4, right: zone.x + zone.largeur - 4, bottom: zone.y + zone.hauteur - 4 };
  const firstEnd = now.units.length ? now.units[0].bottom : 0;
  const refByKey = Object.fromEntries(ref.units.map(u => [u.key, u]));
  const nowByKey = Object.fromEntries(now.units.map(u => [u.key, u]));
  const problems = { zone: [], hidden: [], order: [], left: [], single: [], lines: [], separators: separatorProblems(now) };
  now.units.forEach((u) => {
    if (u.top < firstEnd && hits(u, zoneRect)) problems.zone.push(u.key + ' dans la zone ' + [round(u.left), round(u.top), round(u.right), round(u.bottom)]);
    else if (hits(u, barRect)) problems.zone.push(u.key + ' sous la barre ' + [round(u.left), round(u.top), round(u.right), round(u.bottom)]);
    if (u.left < -0.5 || u.right > now.frame[0] + 0.5) problems.hidden.push(u.key + ' hors du cadre (' + round(u.left) + ' à ' + round(u.right) + ')');
    if (now.logo && hits(u, now.logo)) problems.hidden.push(u.key + ' sous le logo');
    if (u.right - u.left < 0.5 && refByKey[u.key] && refByKey[u.key].right - refByKey[u.key].left >= 0.5) problems.hidden.push(u.key + ' réduit à rien');
  });
  ref.units.forEach((u) => { if (!nowByKey[u.key]) problems.hidden.push(u.key + ' a disparu'); });
  now.units.forEach((u) => { if (!refByKey[u.key]) problems.hidden.push(u.key + ' est apparu'); });
  for (let at = 1; at < now.units.length; at += 1) {
    const a = now.units[at - 1], b = now.units[at];
    const down = centreY(b) - centreY(a);
    if (down < -10 || (Math.abs(down) <= 10 && b.left < a.right - 0.5)) problems.order.push(a.key + ' puis ' + b.key + ' à rebours');
  }
  // À gauche de la zone, sur la première ligne : rien ne bouge, sauf le séparateur qui précède le bouton décalé (il le suit pour que le groupe garde son trait) ; les lignes suivantes se refont à la suite.
  const refFirstEnd = ref.units.length ? ref.units[0].bottom : 0;
  ref.units.forEach((u) => {
    const n = nowByKey[u.key];
    if (u.top < refFirstEnd && u.right <= zone.x && n && !now.markedKeys.includes(u.key) && (Math.abs(n.left - u.left) > 0.5 || Math.abs(n.top - u.top) > 0.5)) problems.left.push(u.key + ' a bougé de ' + [round(u.left), round(u.top)] + ' à ' + [round(n.left), round(n.top)]);
  });
  if (now.marked.length !== 1) problems.single.push('éléments décalés : ' + JSON.stringify(now.marked));
  if (linesOf(now.units) > linesOf(ref.units) + 1) problems.lines.push('lignes : ' + linesOf(ref.units) + ' → ' + linesOf(now.units));
  return problems;
}
// Les lignes comme elles sont tombées : les éléments d’un même milieu vertical, dans l’ordre du document (écrit ici à part, pour ne pas croire le code qu’on essaie).
function linesIn(units) {
  const lines = [];
  units.forEach((u) => {
    const line = lines[lines.length - 1];
    if (line && Math.abs(centreY(u) - line.middle) < line.half) line.items.push(u);
    else lines.push({ middle: centreY(u), half: (u.bottom - u.top) / 2, items: [u] });
  });
  return lines;
}
// Les séparateurs que la coupure des lignes laisse seuls, au début ou au bout d’une ligne.
function edgeSeparators(measured) {
  const edges = new Set();
  linesIn(measured.units).forEach((line) => { edges.add(line.items[0].key); edges.add(line.items[line.items.length - 1].key); });
  return measured.units.filter(u => u.sep && edges.has(u.key));
}
// Un séparateur seul au début ou au bout d’une ligne ne sépare plus rien : son trait est caché ; un séparateur entre deux éléments d’une même ligne se voit.
function separatorProblems(measured) {
  const lone = new Set(edgeSeparators(measured).map(u => u.key));
  const problems = [];
  measured.units.filter(u => u.sep).forEach((u) => {
    if (lone.has(u.key) && !u.hidden) problems.push(u.key + ' reste visible, seul au bord d’une ligne (' + [round(u.left), round(u.top)] + ')');
    if (!lone.has(u.key) && u.hidden) problems.push(u.key + ' est caché alors qu’il sépare deux éléments d’une ligne (' + [round(u.left), round(u.top)] + ')');
  });
  return problems;
}
const unitsAt = measured => measured.units.map(u => [u.key, round(u.left), round(u.top), round(u.right), round(u.bottom)]);
const SMALL = { zone: 'rien de la première ligne sous la zone de la barre, ni rien sous la barre elle-même', hidden: 'rien de caché ni de coupé (mêmes boutons, tous dans le cadre, aucun sous le logo)', order: 'l’ordre du document est celui de la lecture (rien ne passe devant son voisin)', left: 'ce qui est à gauche de la zone, sur la première ligne, n’a pas bougé (le séparateur qui précède le bouton décalé le suit)', single: 'un seul élément porte le décalage', lines: 'au plus une ligne de plus', separators: 'un séparateur seul au bord d’une ligne est caché, ceux qui séparent deux éléments se voient' };

// Un cycle : sans barre pour la référence, puis la barre en haut pour la taille du cadre. Rend la référence, la mesure avec barre et la barre.
async function cycle(page, app, width, height) {
  await setBar(page, app, null);
  const ref = await measure(app);
  const bar = await barAt(page, 'haut', width, height);
  await setBar(page, app, bar);
  const now = await measure(app);
  return { ref, now, bar };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
let reference700 = null;   // la première ligne d’une page de 700 × 400 sans barre, mesurée au scénario 1
console.log('\n1) 700 × 400, la barre en haut dès le contexte : un vide sous la barre, tout le reste de la ligne y est, la vraie souris le confirme');
{
  const { page, app } = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: TOP_700 } });
  await settle(app);
  const first = await measure(app);
  check('la page s’ouvre avec la barre du contexte (en haut, 284, 0, 132 × 42) : sa première ligne la laisse libre dès le départ (rien dans la zone), un élément porte le décalage', first.units.every(u => !(u.top < first.units[0].bottom && hits(u, { left: 284, top: 0, right: 416, bottom: 42 }))) && first.marked.length === 1, { marked: first.marked, units: unitsAt(first) });

  const { ref, now, bar } = await cycle(page, app, 700, 400);
  reference700 = ref;
  check('la zone de la barre est bien celle de l’exemple (284, 0, 132 × 42) : le cadre fait 700 × 400', same(bar.zone, { x: 284, y: 0, largeur: 132, hauteur: 42 }) && same(now.frame, [700, 400]), { zone: bar.zone, frame: now.frame });
  const problems = problemsOf(ref, now, bar.zone);
  for (const key of ['zone', 'hidden', 'order', 'left', 'single', 'separators']) check(`700 × 400, barre en haut : ${SMALL[key]}`, problems[key].length === 0, problems[key]);
  check('700 × 400 : pas de ligne de plus et pas de bande (même nombre de lignes, même hauteur de barre d’outils que sans barre)', linesOf(now.units) === linesOf(ref.units) && Math.abs(now.height - ref.height) < 0.5, { refHeight: ref.height, nowHeight: now.height, refLines: linesOf(ref.units), nowLines: linesOf(now.units) });
  check('le vide est utile : sans lui, Enregistrer, Supprimer et Tables liées seraient sous la barre (la référence les y met), et il les a poussés à son bord droit (416) à la suite', ['v2-save-group#0', 'btn-delete#0', 'btn-link-rules#0'].every(key => ref.units.find(u => u.key === key) && hits(ref.units.find(u => u.key === key), { left: 284, top: 0, right: 416, bottom: 42 })) && Math.abs(now.units.find(u => u.key === 'v2-save-group#0').left - 416) < 0.5, { saved: now.units.find(u => u.key === 'v2-save-group#0') });
  const alone = edgeSeparators(now);
  check('700 × 400 : la coupure de la ligne laisse « Page | Type d’export » seul au début de la deuxième ligne (un trait à cacher), et son trait est caché alors que celui de l’autre séparateur se voit', alone.length === 1 && alone[0].hidden && now.units.filter(u => u.sep && !u.hidden).length >= 1, { alone, separators: now.units.filter(u => u.sep) });
  await app.evaluate(() => document.querySelectorAll('.pp-sep-alone').forEach(el => el.classList.remove('pp-sep-alone')));
  const ticksShown = await measure(app);
  await app.evaluate(() => ToolbarGap.refresh());
  const ticksHidden = await measure(app);
  check('cacher le trait ne bouge rien : trait montré, tous les éléments sont à la même place (le séparateur garde sa largeur, sa place est la sienne) ; la mise en page le recache aussitôt', now.units.some(u => u.hidden) && same(unitsAt(ticksShown), unitsAt(now)) && ticksShown.units.every(u => !u.hidden) && same(ticksHidden.units.map(u => [u.key, u.hidden]), now.units.map(u => [u.key, u.hidden])), { shown: unitsAt(ticksShown), hidden: ticksHidden.units.filter(u => u.hidden).map(u => u.key) });
  const keys = now.units.map(u => u.key);
  check('même nombre d’éléments et mêmes noms dans le même ordre que sans barre (rien de caché, rien d’ajouté, l’ordre de tabulation est celui du document)', same(keys, ref.units.map(u => u.key)) && keys.length >= 12, { keys });
  await sleep(500);
  const later = await measure(app);
  check('la mise en page est stable : une demi-seconde plus tard rien n’a bougé (pas de recalcul qui oscille)', same(unitsAt(now), unitsAt(later)) && same(now.marked, later.marked), { before: unitsAt(now), after: unitsAt(later) });

  // La pastille de la barre, posée par la page parente au-dessus du cadre, prend la souris comme la vraie barre.
  await page.evaluate((zone) => {
    const box = document.createElement('div');
    box.id = 'gfs-bar-stand-in';
    box.style.cssText = `position:fixed;left:${zone.x + 4}px;top:${zone.y + 4}px;width:${zone.largeur - 8}px;height:${zone.hauteur - 8}px;background:rgba(20,20,20,.92);border-radius:8px;z-index:2147483000`;
    window.__barHits = 0;
    ['mousemove', 'mousedown', 'mouseup', 'click'].forEach(type => box.addEventListener(type, () => { window.__barHits += 1; }));
    document.body.append(box);
  }, bar.zone);
  const hitsOf = () => page.evaluate(() => window.__barHits);
  const interactiveAt = (x, y) => app.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    const found = el && el.closest('button, select, input, label, a, .v2-hover-group, .mode-toggle, .title-cluster');
    return found ? (found.id || String(found.className).split(/\s+/)[0]) : null;
  }, [x, y]);
  const sweep = [];
  for (let x = 0; x <= 700; x += 6) {
    const before = await hitsOf();
    await page.mouse.move(x, 21);
    sweep.push({ x, bar: (await hitsOf()) > before, under: await interactiveAt(x, 21) });
  }
  const covered = sweep.filter(p => p.bar && p.under);
  check('à la vraie souris : un balayage de la première ligne (de 0 à 700 px, au milieu des boutons) ne passe jamais sur la barre là où un bouton se trouve', covered.length === 0, covered.slice(0, 5));
  check('et le balayage est sérieux : la pastille a bien pris la souris au-dessus de la zone (' + sweep.filter(p => p.bar).length + ' points) et le balayage a rencontré des boutons (' + sweep.filter(p => !p.bar && p.under).length + ' points)', sweep.filter(p => p.bar).length >= 15 && sweep.filter(p => !p.bar && p.under).length >= 20, { onBar: sweep.filter(p => p.bar).length, onButtons: sweep.filter(p => !p.bar && p.under).length });
  await page.mouse.move(350, 250);
  const rectOfButton = id => app.evaluate((target) => { const r = document.getElementById(target).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
  const save = await rectOfButton('btn-save');
  const before = await hitsOf();
  await page.mouse.move(save.x, save.y);
  await sleep(150);
  const flyout = await app.evaluate(() => { const el = document.getElementById('v2-save-flyout'); const r = el.getBoundingClientRect(); const b = document.getElementById('btn-save').getBoundingClientRect(); return { display: getComputedStyle(el).display, left: r.left, right: r.right, top: r.top, buttonBottom: b.bottom, width: window.innerWidth }; });
  check('à la vraie souris : le survol d’Enregistrer, décalé à droite de la barre, ouvre son menu sous le bouton, dans le cadre, sans toucher la pastille', flyout.display !== 'none' && flyout.top >= flyout.buttonBottom - 1 && flyout.left >= 0 && flyout.right <= flyout.width && (await hitsOf()) === before, { flyout });
  await page.mouse.move(350, 250);
  const read = await rectOfButton('btn-mode-read');
  await page.mouse.click(read.x, read.y);
  await sleep(150);
  const reading = await app.evaluate(() => ({ read: document.getElementById('btn-mode-read').classList.contains('active'), edit: document.getElementById('btn-mode-edit').classList.contains('active') }));
  await page.mouse.move(350, 250);
  const edit = await rectOfButton('btn-mode-edit');
  await page.mouse.click(edit.x, edit.y);
  await sleep(150);
  const editing = await app.evaluate(() => ({ read: document.getElementById('btn-mode-read').classList.contains('active'), edit: document.getElementById('btn-mode-edit').classList.contains('active') }));
  check('à la vraie souris : un clic sur Mode lecture puis sur Mode édition (décalés, au bord de la zone) passe par le bouton à chaque fois', reading.read && !reading.edit && editing.edit && !editing.read, { reading, editing });
  await page.mouse.move(350, 250);
  const control = await hitsOf();
  await page.mouse.move(350, 20);
  check('contrôle : la souris menée au milieu de la zone arrive bien sur la pastille de la barre (et sur aucun bouton)', (await hitsOf()) > control && (await interactiveAt(350, 20)) === null, { control, now: await hitsOf(), under: await interactiveAt(350, 20) });
  await page.evaluate(() => document.getElementById('gfs-bar-stand-in').remove());
  await page.mouse.move(350, 250);

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  console.log('\n2) La barre part ou change : la ligne redevient celle d’avant, et le vide revient avec la barre');
  const sameAsRef = (label, measured) => {
    const moved = ref.units.filter((u, at) => !measured.units[at] || measured.units[at].key !== u.key || Math.abs(measured.units[at].left - u.left) > 0.5 || Math.abs(measured.units[at].top - u.top) > 0.5 || Math.abs(measured.units[at].right - u.right) > 0.5).map(u => u.key);
    check(label, moved.length === 0 && measured.units.length === ref.units.length && measured.marked.length === 0 && Math.abs(measured.height - ref.height) < 0.5, { moved, marked: measured.marked, height: measured.height });
  };
  await setBar(page, app, null);
  sameAsRef('plus de barre (l’explorateur de GFS s’ouvre) : la première ligne est celle d’une page sans barre, au pixel près, plus aucun élément décalé', await measure(app));
  for (const edge of ['gauche', 'droite', 'bas']) {
    await setBar(page, app, await barAt(page, edge, 700, 400));
    sameAsRef(`barre à ${edge === 'gauche' ? 'gauche' : edge === 'droite' ? 'droite' : 'en bas'} : rien ne bouge dans la première ligne (le vide est celui du haut seulement)`, await measure(app));
  }
  await setBar(page, app, bar);
  const again = await measure(app);
  check('la barre remonte en haut : le même vide qu’avant revient (mêmes positions)', same(unitsAt(again), unitsAt(now)) && again.marked.length === 1, { before: unitsAt(now), after: unitsAt(again) });
  await app.evaluate(() => GfsBar.hide(true));
  await waitEdge(app, null);
  await settle(app);
  sameAsRef('l’app masque la barre (`GfsBar.hide`, le diaporama) : la ligne est telle qu’avant, sans vide', await measure(app));
  await app.evaluate(() => GfsBar.hide(false));
  await waitEdge(app, 'top');
  await settle(app);
  const shown = await measure(app);
  check('la barre est rendue : le vide revient', same(unitsAt(shown), unitsAt(now)) && shown.marked.length === 1, { after: unitsAt(shown) });

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  console.log('\n3) La ligne change sous la barre : un bouton disparaît puis revient, le cadre change de taille');
  await app.evaluate(() => { document.getElementById('btn-link-rules').style.display = 'none'; });
  const shortened = await cycle(page, app, 700, 400);
  const problemsShort = problemsOf(shortened.ref, shortened.now, shortened.bar.zone);
  check('Tables liées disparaît (la ligne est plus courte) : la zone reste libre, rien d’autre n’est caché, l’ordre est gardé, un seul décalage', ['zone', 'hidden', 'order', 'single', 'separators'].every(key => problemsShort[key].length === 0) && !shortened.now.units.some(u => u.key === 'btn-link-rules#0'), problemsShort);
  await app.evaluate(() => { document.getElementById('btn-link-rules').style.display = ''; });
  await settle(app);
  const restored = await measure(app);
  check('Tables liées revient : le vide se recalcule (mêmes positions que lorsque la barre est arrivée)', same(unitsAt(restored), unitsAt(now)) && restored.marked.length === 1, { after: unitsAt(restored) });

  for (const [width, height] of [[900, 500], [560, 300], [1100, 600], [700, 400]]) {
    await resizeFrame(page, app, width, height);
    const sized = await cycle(page, app, width, height);
    const p = problemsOf(sized.ref, sized.now, sized.bar.zone);
    const title = sized.now.units.find(u => u.key === 'v2-title-cluster#0');
    check(`${width} × ${height} (zone ${sized.bar.zone.x}, ${sized.bar.zone.y}, ${sized.bar.zone.largeur} × ${sized.bar.zone.hauteur}) : ${Object.keys(SMALL).map(key => SMALL[key]).join(' ; ')}${width === 560 ? ' ; le sélecteur du modèle reste lisible (120 px au moins) mais se raccourcit pour finir avant la zone' : ''}`,
      Object.values(p).every(list => list.length === 0) && (width !== 560 || (title && title.right - title.left >= 120 && title.right <= sized.bar.zone.x + 0.5)), Object.assign({}, p, { title }));
    if (width === 700) check('retour à 700 × 400 : le même vide qu’au départ', same(unitsAt(sized.now), unitsAt(now)), { after: unitsAt(sized.now) });
  }

  // Le trait seul, à toutes les largeurs où la coupure des lignes en laisse un (de 400 à 800 px, de 20 en 20) : avec la barre en haut, puis sans (la règle ne tient pas à la barre).
  const swept = { problems: [], withBar: 0, without: 0, widths: 0 };
  for (let width = 400; width <= 800; width += 20) {
    await resizeFrame(page, app, width, 400);
    const { ref: bare, now: barred } = await cycle(page, app, width, 400);
    swept.widths += 1;
    separatorProblems(barred).forEach(text => swept.problems.push(width + ' px, barre en haut : ' + text));
    separatorProblems(bare).forEach(text => swept.problems.push(width + ' px, sans barre : ' + text));
    if (edgeSeparators(barred).length) swept.withBar += 1;
    if (edgeSeparators(bare).length) swept.without += 1;
  }
  check('de 400 à 800 px de large, avec la barre en haut puis sans : ' + SMALL.separators, swept.problems.length === 0, swept.problems.slice(0, 6));
  check('et le balayage est sérieux (' + swept.widths + ' largeurs) : la coupure a laissé un séparateur seul à ' + swept.withBar + ' largeurs avec la barre et ' + swept.without + ' sans', swept.widths === 21 && swept.withBar >= 5 && swept.without >= 3, swept);
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n4) Un GFS d’avant la consigne 025 et la page seule : même ligne qu’une page sans barre');
{
  const older = await t.openPage({ framed: true, seed: SEED, lang: 'fr' });
  await settle(older.app);
  const before = await measure(older.app);
  check('GFS d’avant la 025 (le contexte n’a pas de `barre`) : aucun élément décalé, la ligne est celle d’une page dont la barre est partie (mêmes éléments, mêmes positions)', before.marked.length === 0 && same(unitsAt(before), unitsAt(reference700)), { marked: before.marked, before: unitsAt(before), reference: unitsAt(reference700) });
  await older.page.context().close();
  const alone = await t.openPage({ hosted: false, seed: SEED, lang: 'fr' });
  await settle(alone.app);
  const aloneRow = await measure(alone.app);
  check('la page seule (adresse sans `gfs=`) : aucun élément décalé, mêmes éléments et mêmes positions', aloneRow.marked.length === 0 && same(unitsAt(aloneRow), unitsAt(reference700)), { marked: aloneRow.marked, alone: unitsAt(aloneRow), reference: unitsAt(reference700) });
  await alone.page.context().close();
  const narrow = await t.openPage({ hosted: false, seed: SEED, lang: 'fr', width: 580, height: 300 });
  await settle(narrow.app);
  const narrowRow = await measure(narrow.app);
  check('la page seule, 580 × 300 : la coupure laisse un séparateur seul au bout de la première ligne, et son trait est caché de même (la règle ne tient pas à la barre de GFS)', narrowRow.marked.length === 0 && edgeSeparators(narrowRow).length >= 1 && separatorProblems(narrowRow).length === 0, { lone: edgeSeparators(narrowRow), problems: separatorProblems(narrowRow) });
  await narrow.page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n5) Anglais, thème sombre : même vide');
{
  const { page, app } = await t.openPage({ framed: true, seed: SEED, lang: 'en', colorScheme: 'dark' });
  await settle(app);
  const { ref, now, bar } = await cycle(page, app, 700, 400);
  const problems = problemsOf(ref, now, bar.zone);
  check('English, dark, 700 × 400, bar on top: ' + Object.keys(SMALL).filter(key => key !== 'lines').map(key => SMALL[key]).join(' ; ') + ' ; même hauteur de barre d’outils', Object.values(problems).every(list => list.length === 0) && linesOf(now.units) === linesOf(ref.units) && Math.abs(now.height - ref.height) < 0.5, problems);
  await page.context().close();
}

await t.finish();
