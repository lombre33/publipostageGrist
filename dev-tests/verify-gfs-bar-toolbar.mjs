#!/usr/bin/env node
// Le vide que la barre d’outils laisse à la barre de GFS, aux quatre bords du cadre et dans les petits panneaux (consigne GFS 025, choix du porteur « Laisser un vide » : en haut le 21/10, à gauche, à droite, en bas et
// dans les petits panneaux le 22/10 ; js/toolbar-gap.js, css/toolbar-v2.css). Chez GFS la barre de boutons recouvre le cadre au bord choisi, centrée sur lui : en haut, elle tombe sur le milieu de la première ligne
// de la barre d’outils ; à gauche, sur le début des lignes à sa hauteur (à 700 × 400, « Surligner ») ; à droite, sur leur bout. Les trois rangées de la barre du haut (modèle et export, champs du courriel, mise en
// forme) écartent ce qu’elle recouvre : un bouton saute à son bord, ou passe à la ligne, ou recule ; rien n’est caché, aucune bande n’est ajoutée, une ligne de plus est permise si la place manque. Le seul trait qui
// se cache est celui d’un séparateur que la coupure des lignes laisse seul au bord de la sienne, dans la rangée du modèle comme dans celle de mise en forme (choix du porteur, 22/10 : « Le cacher quand il est seul »).
// Les menus et les fenêtres sont la suite de la 025.
// GFS simulé (dev-tests/gfs-stub.js) dans un cadre isolé ; il ne dessine rien : une pastille posée par la page parente tient la place de la barre et prend la souris comme elle.
//  1) 700 × 400 (le panneau de Grist), barre en haut dès le contexte, vraie souris : aucun bouton de la première ligne sous la zone de la barre (ni sous la barre elle-même, toutes lignes comprises) ;
//     rien de caché ni de coupé (mêmes boutons qu’avant, tous dans le cadre, aucun sous le logo) ; l’ordre du document est celui de la lecture ; ce qui est à gauche de la zone n’a pas bougé ; pas de ligne
//     de plus ni de bande (même hauteur de barre d’outils) ; un seul élément porte le décalage ; la mise en page est stable (rien ne bouge après coup) ; le séparateur « Page | Type d’export » que la
//     coupure laisse seul au début de la deuxième ligne a son trait caché, sans que rien ne bouge. La barre « vue » à la souris : un balayage de la
//     première ligne n’arrive jamais sur la pastille là où un bouton se trouve, le survol d’Enregistrer ouvre son menu, un vrai clic sur Mode lecture puis Mode édition passe par le bouton décalé.
//  2) 700 × 400, BARRE À GAUCHE : « Surligner » (début de la dernière ligne de mise en forme, 9 px sous elle sans le vide) saute à son bord droit, seul de toutes les rangées ; ce qui le suit sur sa ligne le suit
//     du même écart, tout le reste est où il était, même hauteur de barre d’outils ; un balayage à la vraie souris le long de la barre ne rencontre aucun bouton (et le même balayage, le vide ôté à la main, rencontre
//     « Surligner » : il voit bien ce qu’il doit voir) ; un vrai clic sur la flèche de « Surligner » l’ouvre sans toucher la barre ; Gras et Italique qui disparaissent font remonter « Surligner » (plus de vide),
//     ils reviennent : le vide aussi ; la barre qui part, tout revient au pixel près.
//  3) LA BARRE PART OU CHANGE : plus de barre (l’explorateur de GFS s’ouvre), à droite, en bas (à 700 × 400, aucun bouton n’est sous elle : rien ne bouge), masquée par l’app (`GfsBar.hide`) : les trois rangées
//     sont telles qu’avant, au pixel près, plus aucun décalage ; elle revient en haut : le vide aussi.
//  4) LA LIGNE CHANGE SOUS LA BARRE : un bouton qui disparaît (Tables liées) puis revient ; le cadre qui change de taille (900 × 500, 560 × 300 où le sélecteur du modèle se raccourcit, 1100 × 600) puis
//     qui revient à 700 × 400 : à chaque taille la zone est libre, rien n’est caché, l’ordre est gardé, au plus une ligne de plus, et chaque séparateur seul au bord d’une ligne a son trait caché (de 400 à
//     800 px de large, avec la barre puis sans) quand ceux qui séparent deux éléments d’une même ligne se voient ; même chose pour la rangée de mise en forme (de 380 à 900 px de large, sans barre puis avec la barre à
//     chaque bord) : à 800 px sa deuxième ligne commence par un trait seul, à 600 px deux traits finissent leur ligne ; tous ont leur trait caché, et le montrer ne bouge rien.
//  5) LES PETITS PANNEAUX ET LES QUATRE BORDS : douze tailles de cadre (de 1100 × 600 à 400 × 230) × haut, gauche, droite, bas : aucun bouton des trois rangées sous la barre (à 2 px près, la marge que GFS
//     garde autour d’elle), rien de caché ni de coupé, l’ordre de lecture gardé dans chaque rangée, au plus une ligne de plus par rangée, un séparateur seul au bord de sa ligne caché (dans les trois rangées), ce qui précède le premier élément décalé n’a pas bougé, rien ne bouge là où la
//     barre ne recouvre rien, un second calcul ne change rien, la barre partie tout revient (aucune marge ni variable ne reste) ; l’histoire ne compte pas (d’un bord à l’autre sans passer par « plus de barre », ou le
//     cadre qui change de taille sous la barre : même résultat que depuis une page sans barre) ; un balayage à la vraie souris le long de la barre, pour les cas qui poussent un bouton à droite, à la ligne ou en bas.
//  6) UN GFS D’AVANT LA CONSIGNE 025 et la page seule : même ligne qu’une page sans barre, rien de décalé ; la page seule cache aussi le trait d’un séparateur resté seul, dans la rangée du modèle (580 px) comme dans celle de mise en forme (800 px) : la règle ne tient pas à la barre.
//  7) Anglais, thème sombre : même vide, en haut et à gauche.
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
// Les séparateurs que la coupure des lignes laisse seuls, au début ou au bout d’une ligne de leur rangée (la mesure de la première ligne seule n’a pas de rangée : un seul groupe).
function edgeSeparators(measured) {
  const edges = new Set();
  [...new Set(measured.units.map(u => u.row))].forEach(row => linesIn(measured.units.filter(u => u.row === row)).forEach((line) => { edges.add(line.items[0].key); edges.add(line.items[line.items.length - 1].key); }));
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
// Les séparateurs seuls de la rangée de mise en forme.
const fmtLone = measured => edgeSeparators(measured).filter(u => u.row === 'forme');
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
// Les trois rangées de la barre d’outils du haut, à n’importe quel bord (le haut n’est plus le seul). Écrit ici à part, pour ne pas croire le code qu’on essaie : la lecture des rangées (ce qui occupe de la
// place, un regroupement par espacement donnant ses boutons un à un), le rectangle de la barre elle-même (la zone moins la marge de 4 px que GFS garde tout autour) et ce que la barre recouvre.
const ROWS = [['modele', '#toolbar-top .bar-row'], ['courriel', '#toolbar-top #v2-email-fields-row'], ['forme', '#toolbar-top #v2-toolbar']];
const measureRows = app => app.evaluate((rows) => {
  const nameOf = el => el.id || String(el.className).split(/\s+/).filter(c => c && !c.startsWith('pp-'))[0] || el.tagName.toLowerCase();
  const out = { units: [], height: document.getElementById('toolbar-top').getBoundingClientRect().height, frame: [window.innerWidth, window.innerHeight], logo: null, leaks: document.querySelectorAll('[style*="--pp-gfs-"]').length };
  rows.forEach(([row, selector]) => {
    const el = document.querySelector(selector);
    if (!el || getComputedStyle(el).display === 'none') return;
    const seen = {};
    const all = [];
    const origin = el.getBoundingClientRect().top;
    Array.from(el.children).forEach((child) => { if (child.matches('.action-cluster')) all.push(...Array.from(child.children)); else all.push(child); });
    all.filter((unit) => { const style = getComputedStyle(unit); return style.display !== 'none' && style.position !== 'absolute' && style.position !== 'fixed'; }).forEach((unit) => {
      const name = nameOf(unit);
      seen[name] = (seen[name] || 0) + 1;
      const r = unit.getBoundingClientRect();
      out.units.push({ key: row + '/' + name + '#' + (seen[name] - 1), row, origin, left: r.left, top: r.top, right: r.right, bottom: r.bottom, gap: unit.classList.contains('pp-gfs-gap'), room: unit.classList.contains('pp-gfs-room'), sep: unit.classList.contains('bar-sep') || unit.classList.contains('v2-sep'), hidden: getComputedStyle(unit).visibility === 'hidden' });
    });
  });
  const logo = document.getElementById('v2-brand-logo');
  if (logo) { const r = logo.getBoundingClientRect(); out.logo = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }
  return out;
}, ROWS);
const SIDES = ['left', 'top', 'right', 'bottom'];
const unitsAtRows = measured => measured.units.map(u => [u.key, round(u.left), round(u.top), round(u.right), round(u.bottom)]);
const markedRows = measured => measured.units.filter(u => u.gap || u.room).map(u => u.key + (u.gap ? ' (marge à gauche)' : ' (marge à droite)'));
const BAR_MARGIN = 4;   // la marge que GFS garde autour de sa barre, dans sa zone
const barOf = zone => ({ left: zone.x + BAR_MARGIN, top: zone.y + BAR_MARGIN, right: zone.x + zone.largeur - BAR_MARGIN, bottom: zone.y + zone.hauteur - BAR_MARGIN });
const zoneOf = zone => ({ left: zone.x, top: zone.y, right: zone.x + zone.largeur, bottom: zone.y + zone.hauteur });
// L’élément entre dans le rectangle de plus de `by` px dans les deux sens ?
const enters = (u, rect, by) => Math.min(u.right, rect.right) - Math.max(u.left, rect.left) > by && Math.min(u.bottom, rect.bottom) - Math.max(u.top, rect.top) > by;
// Sous la barre : de plus de 2 px (un bout d’élément qui n’effleure que la marge de la zone, ou son écart de rangée, ne touche pas la barre).
const under = (u, bar) => enters(u, barOf(bar.zone), 2);
const rowLines = (measured, row) => linesOf(measured.units.filter(u => u.row === row));
const ALL = {
  under: 'aucun bouton des trois rangées sous la barre (à 2 px près, la marge que GFS garde autour d’elle)',
  hidden: 'rien de caché ni de coupé (mêmes boutons, tous dans le cadre, aucun sous le logo ni réduit à rien)',
  order: 'l’ordre du document est celui de la lecture dans chaque rangée (rien ne passe devant son voisin)',
  lines: 'au plus une ligne de plus par rangée',
  before: 'ce qui précède le premier élément décalé de sa rangée n’a pas bougé (même place, sur la même ligne)',
  idle: 'là où la barre ne recouvre rien, rien ne bouge et rien n’est décalé',
  separators: 'un séparateur seul au bord de sa ligne a son trait caché dans les trois rangées (celle de mise en forme comprise), ceux qui séparent deux éléments d’une même ligne se voient',
};
// Ce qui cloche entre les rangées d’une page sans barre (`ref`) et les mêmes avec la barre `bar` (`now`).
function problemsAll(ref, now, bar) {
  const refByKey = Object.fromEntries(ref.units.map(u => [u.key, u]));
  const nowByKey = Object.fromEntries(now.units.map(u => [u.key, u]));
  const problems = { under: [], hidden: [], order: [], lines: [], before: [], idle: [], separators: separatorProblems(now) };
  const outside = (u, frame) => u.left < -0.5 || u.right > frame[0] + 0.5;
  now.units.forEach((u) => {
    const was = refByKey[u.key];
    if (under(u, bar)) problems.under.push(u.key + ' sous la barre ' + [round(u.left), round(u.top), round(u.right), round(u.bottom)]);
    if (outside(u, now.frame) && !(was && outside(was, ref.frame))) problems.hidden.push(u.key + ' hors du cadre (' + round(u.left) + ' à ' + round(u.right) + ')');
    if (now.logo && enters(u, now.logo, 0.5) && !(was && ref.logo && enters(was, ref.logo, 0.5))) problems.hidden.push(u.key + ' sous le logo');
    if (was && u.right - u.left < 0.5 && was.right - was.left >= 0.5) problems.hidden.push(u.key + ' réduit à rien');
  });
  ref.units.forEach((u) => { if (!nowByKey[u.key]) problems.hidden.push(u.key + ' a disparu'); });
  now.units.forEach((u) => { if (!refByKey[u.key]) problems.hidden.push(u.key + ' est apparu'); });
  for (let at = 1; at < now.units.length; at += 1) {
    const a = now.units[at - 1], b = now.units[at];
    if (a.row !== b.row) continue;
    const down = centreY(b) - centreY(a);
    if (down < -10 || (Math.abs(down) <= 10 && b.left < a.right - 0.5)) problems.order.push(a.key + ' puis ' + b.key + ' à rebours');
  }
  ROWS.forEach(([row]) => {
    if (rowLines(now, row) > rowLines(ref, row) + 1) problems.lines.push(row + ' : ' + rowLines(ref, row) + ' → ' + rowLines(now, row) + ' lignes');
    const units = now.units.filter(u => u.row === row);
    const first = units.findIndex(u => u.gap || u.room);
    (first < 0 ? units : units.slice(0, first)).forEach((u) => {
      const was = refByKey[u.key];
      if (was && (Math.abs(u.left - was.left) > 0.5 || Math.abs((u.top - u.origin) - (was.top - was.origin)) > 3)) problems.before.push(u.key + ' a bougé de ' + [round(was.left), round(was.top - was.origin)] + ' à ' + [round(u.left), round(u.top - u.origin)] + ' (dans sa rangée) sans rien de décalé avant lui');
    });
  });
  // La barre ne recouvre rien (aucun élément n’entre dans sa zone de plus de 1 px) : la mise en page est celle d’une page sans barre, au pixel près, sans marge posée.
  if (!ref.units.some(u => enters(u, zoneOf(bar.zone), 1))) {
    const moved = ref.units.filter(u => nowByKey[u.key] && SIDES.some(side => Math.abs(nowByKey[u.key][side] - u[side]) > 0.5)).map(u => u.key);
    if (moved.length || markedRows(now).length) problems.idle.push('bougé : ' + moved.slice(0, 4).join(', ') + ' ; décalé : ' + markedRows(now).join(', '));
  }
  return problems;
}
// Les trois rangées sont celles de la référence : les mêmes éléments aux mêmes places, aucune marge posée, aucune variable restée sur un élément, même hauteur de barre d’outils.
function sameRows(label, measured, reference) {
  const moved = reference.units.filter((u, at) => !measured.units[at] || measured.units[at].key !== u.key || SIDES.some(side => Math.abs(measured.units[at][side] - u[side]) > 0.5)).map(u => u.key);
  check(label, moved.length === 0 && measured.units.length === reference.units.length && markedRows(measured).length === 0 && measured.leaks === 0 && Math.abs(measured.height - reference.height) < 0.5, { moved: moved.slice(0, 6), marked: markedRows(measured), leaks: measured.leaks, height: measured.height });
}

// La pastille de la barre : la page parente la pose au-dessus du cadre (le cadre est à 0, 0 dans la page), elle prend la souris comme la vraie barre ; on compte ce qu’elle en prend.
const placeStandIn = (page, zone) => page.evaluate((z) => {
  const old = document.getElementById('gfs-bar-stand-in');
  if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'gfs-bar-stand-in';
  box.style.cssText = `position:fixed;left:${z.x + 4}px;top:${z.y + 4}px;width:${z.largeur - 8}px;height:${z.hauteur - 8}px;background:rgba(20,20,20,.92);z-index:2147483000`;   // sans coins arrondis : la grille du balayage va jusqu’aux coins du rectangle
  window.__barHits = 0;
  ['mousemove', 'mousedown', 'mouseup', 'click'].forEach(type => box.addEventListener(type, () => { window.__barHits += 1; }));
  document.body.append(box);
}, zone);
const removeStandIn = page => page.evaluate(() => { const box = document.getElementById('gfs-bar-stand-in'); if (box) box.remove(); });
const barHits = page => page.evaluate(() => window.__barHits);
// Le bouton, le champ ou le lien de la barre d’outils sous ce point de l’app (la pastille est dans la page parente : l’app voit ce qui est dessous), ou null.
const interactiveAt = (app, x, y) => app.evaluate(([px, py]) => {
  const el = document.elementFromPoint(px, py);
  const found = el && el.closest('#toolbar-top button, #toolbar-top select, #toolbar-top input, #toolbar-top label, #toolbar-top a, #toolbar-top [role="button"], #toolbar-top [tabindex]');
  return found ? (found.id || String(found.className).split(/\s+/)[0]) : null;
}, [x, y]);
// Un balayage à la vraie souris de toute la barre (une grille de points, de 8 px en 8 px) : là où la pastille prend la souris, quel bouton est dessous ?
async function sweepBar(page, app, bar) {
  await placeStandIn(page, bar.zone);
  const rect = barOf(bar.zone);
  await page.mouse.move(rect.left + 1, rect.top + 1);   // la page parente prend la pastille en compte au premier mouvement : un mouvement à blanc, hors de la grille
  await sleep(60);
  await page.evaluate(() => { window.__barHits = 0; });
  const points = [];
  for (let x = rect.left + 3; x < rect.right; x += 8) {
    for (let y = rect.top + 3; y < rect.bottom; y += 8) {
      const before = await barHits(page);
      await page.mouse.move(x, y);
      points.push({ x, y, bar: (await barHits(page)) > before, under: await interactiveAt(app, x, y) });
    }
  }
  await page.mouse.move(2, 2);
  await removeStandIn(page);
  return { points: points.length, onBar: points.filter(p => p.bar).length, covered: points.filter(p => p.bar && p.under), missed: points.filter(p => !p.bar).slice(0, 3) };
}
const centerOf = (app, id) => app.evaluate((target) => { const r = document.getElementById(target).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
let reference700 = null;   // la première ligne d’une page de 700 × 400 sans barre, mesurée au scénario 1
let referenceRows700 = null;   // et ses trois rangées, mesurées au scénario 2
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
  console.log('\n2) 700 × 400, la barre à gauche : « Surligner » ne passe plus sous elle, le reste ne bouge pas');
  await setBar(page, app, null);
  const bare = await measureRows(app);
  referenceRows700 = bare;
  const leftBar = await barAt(page, 'gauche', 700, 400);
  const sizeLeft = bare.units.filter(u => under(u, leftBar)).map(u => u.key);
  check('la zone de la barre est celle de l’exemple de la consigne (0, 134, 42 × 132), et sans le vide « Surligner » (début de la dernière ligne de mise en forme) serait seul sous elle : la référence l’y met', same(leftBar.zone, { x: 0, y: 134, largeur: 42, hauteur: 132 }) && same(sizeLeft, ['forme/v2-highlight-split#0']), { zone: leftBar.zone, under: sizeLeft });
  await setBar(page, app, leftBar);
  const left = await measureRows(app);
  const problemsLeft = problemsAll(bare, left, leftBar);
  for (const key of Object.keys(ALL)) check(`700 × 400, barre à gauche : ${ALL[key]}`, problemsLeft[key].length === 0, problemsLeft[key]);
  const wasAt = bare.units.find(u => u.key === 'forme/v2-highlight-split#0');
  const shifted = left.units.find(u => u.key === 'forme/v2-highlight-split#0');
  const dx = shifted.left - wasAt.left;
  const index = key => bare.units.findIndex(u => u.key === key);
  const follows = u => u.row === 'forme' && Math.abs(centreY(u) - centreY(wasAt)) < 10 && index(u.key) >= index(wasAt.key);
  const atBare = u => bare.units[index(u.key)];
  check('seul « Surligner » porte le décalage (une marge à gauche) : il saute au bord droit de la zone (x = 42) sans changer de ligne ; ce qui le suit sur sa ligne le suit du même écart, tout le reste est où il était',
    same(markedRows(left), ['forme/v2-highlight-split#0 (marge à gauche)']) && Math.abs(shifted.left - 42) < 0.5 && Math.abs(shifted.top - wasAt.top) < 0.5 && dx > 0
      && left.units.filter(follows).every(u => Math.abs(u.left - atBare(u).left - dx) < 0.5 && Math.abs(u.top - atBare(u).top) < 0.5)
      && left.units.filter(u => !follows(u)).every(u => SIDES.every(side => Math.abs(u[side] - atBare(u)[side]) < 0.5)),
    { marked: markedRows(left), wasAt, shifted, moved: left.units.filter(u => !follows(u) && SIDES.some(side => Math.abs(u[side] - atBare(u)[side]) > 0.5)).map(u => u.key) });
  check('même nombre de lignes et même hauteur de barre d’outils que sans barre (pas de ligne de plus, pas de bande), et la mise en page est stable : une demi-seconde plus tard rien n’a bougé',
    ROWS.every(([row]) => rowLines(left, row) === rowLines(bare, row)) && Math.abs(left.height - bare.height) < 0.5 && (await sleep(500), same(unitsAtRows(await measureRows(app)), unitsAtRows(left))), { bare: bare.height, left: left.height });

  // La barre « vue » à la souris : un balayage de toute la barre ne passe sur aucun bouton ; le même balayage, le décalage ôté à la main, voit « Surligner » sous la barre (il voit bien ce qu’il doit voir).
  const sweptLeft = await sweepBar(page, app, leftBar);
  check(`à la vraie souris : un balayage de toute la barre à gauche (${sweptLeft.points} points, la pastille en prend ${sweptLeft.onBar}) ne passe jamais sur un bouton de la barre d’outils`, sweptLeft.covered.length === 0 && sweptLeft.onBar === sweptLeft.points, { covered: sweptLeft.covered.slice(0, 5), missed: sweptLeft.missed });
  await app.evaluate(() => { document.querySelectorAll('.pp-gfs-gap').forEach(el => el.classList.remove('pp-gfs-gap')); });
  await settle(app);
  const without = await sweepBar(page, app, leftBar);
  check('contrôle : le même balayage, le décalage ôté à la main, rencontre « Surligner » sous la barre (' + without.covered.length + ' points)', without.covered.length >= 2 && without.covered.every(p => /highlight/.test(p.under)), without.covered.slice(0, 5));
  await app.evaluate(() => ToolbarGap.refresh());
  await settle(app);
  check('la mise en page recalculée remet le décalage (mêmes positions qu’avant)', same(unitsAtRows(await measureRows(app)), unitsAtRows(left)), unitsAtRows(await measureRows(app)));

  await placeStandIn(page, leftBar.zone);
  const caret = await centerOf(app, 'v2-btn-highlight-caret');
  const beforeClick = await barHits(page);
  await page.mouse.move(caret.x, caret.y);
  await sleep(100);
  await page.mouse.click(caret.x, caret.y);
  await sleep(150);
  const opened = await app.evaluate(() => document.getElementById('v2-btn-highlight-caret').getAttribute('aria-expanded'));
  const touched = (await barHits(page)) - beforeClick;
  await page.mouse.click(caret.x, caret.y);
  await sleep(100);
  const closed = await app.evaluate(() => document.getElementById('v2-btn-highlight-caret').getAttribute('aria-expanded'));
  check('à la vraie souris : un clic sur la flèche de « Surligner » (décalé au bord de la barre) l’ouvre, un second la referme, la pastille ne prend aucun de ces clics', opened === 'true' && closed === 'false' && touched === 0, { opened, closed, touched });
  await removeStandIn(page);
  await page.mouse.move(350, 250);

  // La ligne change sous la barre : Gras et Italique disparaissent, « Surligner » remonte au bout de la première ligne (il n’est plus sous la barre : plus de vide), puis ils reviennent.
  await setBar(page, app, null);
  await app.evaluate(() => { ['v2-btn-bold', 'v2-btn-italic'].forEach((id) => { document.getElementById(id).style.display = 'none'; }); });
  await settle(app);
  const bareLess = await measureRows(app);
  await setBar(page, app, leftBar);
  const leftLess = await measureRows(app);
  const problemsLess = problemsAll(bareLess, leftLess, leftBar);
  const highlightLess = leftLess.units.find(u => u.key === 'forme/v2-highlight-split#0');
  check('Gras et Italique disparaissent (« Surligner » remonte au bout de la première ligne, hors de la barre, et ne porte plus de décalage ; la ligne d’en dessous commence autrement, et son premier bouton, sous la barre à son tour, saute à sa place) : rien ne passe sous la barre, rien n’est caché',
    Object.values(problemsLess).every(list => list.length === 0) && highlightLess.top < wasAt.top - 20 && !highlightLess.gap && markedRows(leftLess).length === 1 && bareLess.units.some(u => under(u, leftBar)), { problemsLess, marked: markedRows(leftLess), highlightLess });
  await app.evaluate(() => { ['v2-btn-bold', 'v2-btn-italic'].forEach((id) => { document.getElementById(id).style.display = ''; }); });
  await settle(app);
  check('ils reviennent : le vide revient (mêmes positions que lorsque la barre est arrivée)', same(unitsAtRows(await measureRows(app)), unitsAtRows(left)) && same(markedRows(await measureRows(app)), markedRows(left)), unitsAtRows(await measureRows(app)));
  await setBar(page, app, null);
  sameRows('la barre à gauche part : « Surligner » revient à sa place, aucune marge ni variable ne reste, même hauteur', await measureRows(app), bare);

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  console.log('\n3) La barre part ou change : les rangées redeviennent celles d’avant, et le vide revient avec la barre');
  sameRows('plus de barre (l’explorateur de GFS s’ouvre) : les trois rangées sont celles d’une page sans barre, au pixel près, plus aucun élément décalé', await measureRows(app), bare);
  for (const edge of ['droite', 'bas']) {
    await setBar(page, app, await barAt(page, edge, 700, 400));
    sameRows(`barre ${edge === 'droite' ? 'à droite' : 'en bas'} : à 700 × 400 aucun bouton n’est sous elle, rien ne bouge (ni dans la première ligne, ni dans les deux autres rangées)`, await measureRows(app), bare);
  }
  await setBar(page, app, bar);
  const again = await measure(app);
  check('la barre remonte en haut : le même vide qu’avant revient (mêmes positions)', same(unitsAt(again), unitsAt(now)) && again.marked.length === 1, { before: unitsAt(now), after: unitsAt(again) });
  await app.evaluate(() => GfsBar.hide(true));
  await waitEdge(app, null);
  await settle(app);
  sameRows('l’app masque la barre (`GfsBar.hide`, le diaporama) : les trois rangées sont telles qu’avant, sans vide', await measureRows(app), bare);
  await app.evaluate(() => GfsBar.hide(false));
  await waitEdge(app, 'top');
  await settle(app);
  const shown = await measure(app);
  check('la barre est rendue : le vide revient', same(unitsAt(shown), unitsAt(now)) && shown.marked.length === 1, { after: unitsAt(shown) });

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  console.log('\n4) La ligne change sous la barre : un bouton disparaît puis revient, le cadre change de taille');
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

  // Le trait seul de la rangée de mise en forme (choix du porteur, 22/10 : « Le cacher quand il est seul », la règle de la première rangée). À 800 px de large sa deuxième ligne commence par un séparateur, à 600 px un séparateur
  // finit chacune de ses deux premières lignes : le trait de chacun est caché sans que rien ne bouge, et ceux qui séparent deux éléments d’une même ligne se voient.
  for (const [width, expected] of [[800, 1], [600, 2]]) {
    await resizeFrame(page, app, width, 400);
    await setBar(page, app, null);
    const trait = await measureRows(app);
    const lonely = fmtLone(trait);
    const between = trait.units.filter(u => u.row === 'forme' && u.sep && !lonely.includes(u));
    await app.evaluate(() => document.querySelectorAll('.pp-sep-alone').forEach(el => el.classList.remove('pp-sep-alone')));
    const shownTrait = await measureRows(app);
    await app.evaluate(() => ToolbarGap.refresh());
    const hiddenAgain = await measureRows(app);
    check(`${width} × 400, sans barre, rangée de mise en forme : ${expected === 1 ? 'sa deuxième ligne commence par un séparateur seul' : 'un séparateur seul finit chacune de ses deux premières lignes'}, son trait est caché quand ceux des séparateurs entre deux éléments d’une ligne se voient ; le montrer ne bouge rien (même place, même largeur), la mise en page le recache aussitôt`,
      lonely.length === expected && lonely.every(u => u.hidden) && between.length >= 3 && between.every(u => !u.hidden) && !shownTrait.units.some(u => u.hidden) && same(unitsAtRows(shownTrait), unitsAtRows(trait)) && same(hiddenAgain.units.map(u => [u.key, u.hidden]), trait.units.map(u => [u.key, u.hidden])),
      { lonely: lonely.map(u => [u.key, round(u.left), round(u.top), u.hidden]), between: between.map(u => [u.key, u.hidden]), shown: shownTrait.units.filter(u => u.hidden).map(u => u.key) });
  }
  // À toutes les largeurs de 380 à 900 px (de 20 en 20) : sans barre, puis avec la barre à chacun des quatre bords, aucun séparateur des trois rangées ne reste visible seul au bord d’une ligne, aucun ne se cache entre deux éléments.
  const sweptFmt = { problems: [], widths: 0, lone: { sans: 0, haut: 0, gauche: 0, droite: 0, bas: 0 } };
  for (let width = 380; width <= 900; width += 20) {
    await resizeFrame(page, app, width, 400);
    await setBar(page, app, null);
    sweptFmt.widths += 1;
    const plainFmt = await measureRows(app);
    separatorProblems(plainFmt).forEach(text => sweptFmt.problems.push(`${width} px, sans barre : ${text}`));
    if (fmtLone(plainFmt).length) sweptFmt.lone.sans += 1;
    for (const edge of ['haut', 'gauche', 'droite', 'bas']) {
      await setBar(page, app, await barAt(page, edge, width, 400));
      const barredFmt = await measureRows(app);
      separatorProblems(barredFmt).forEach(text => sweptFmt.problems.push(`${width} px, barre ${edge} : ${text}`));
      if (fmtLone(barredFmt).length) sweptFmt.lone[edge] += 1;
    }
    await setBar(page, app, null);
  }
  check('de 380 à 900 px de large, sans barre puis avec la barre à chaque bord : ' + ALL.separators, sweptFmt.problems.length === 0, sweptFmt.problems.slice(0, 6));
  check('et le balayage est sérieux (' + sweptFmt.widths + ' largeurs) : la coupure a laissé un séparateur seul à la rangée de mise en forme à ' + JSON.stringify(sweptFmt.lone) + ' largeurs', sweptFmt.widths === 27 && Object.values(sweptFmt.lone).every(n => n >= 8), sweptFmt);

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  console.log('\n5) Les petits panneaux et les quatre bords : ce que la barre recouvre est écarté, ce qu’elle ne recouvre pas ne bouge pas');
  const SIZES = [[700, 400], [700, 250], [560, 300], [480, 300], [400, 300], [400, 230], [420, 240], [500, 260], [600, 230], [800, 300], [640, 360], [1100, 600]];
  const EDGES = [['haut', 'en haut'], ['gauche', 'à gauche'], ['droite', 'à droite'], ['bas', 'en bas']];
  const busy = { cases: 0, buttons: 0, byEdge: {} };   // les cas où la référence a des boutons sous la barre (sans eux, rien à écarter)
  const grown = { rows: 0, marks: 0 };
  const fromBare = {};   // `${largeur}x${hauteur} ${bord}` → les rangées avec la barre, depuis une page sans barre
  const sweepCases = [[700, 250, 'droite'], [400, 300, 'droite'], [500, 260, 'droite'], [400, 230, 'bas'], [420, 240, 'bas'], [400, 300, 'gauche'], [560, 300, 'gauche']];
  const sweeps = [];
  for (const [width, height] of SIZES) {
    await resizeFrame(page, app, width, height);
    await setBar(page, app, null);
    const plain = await measureRows(app);
    const issues = [];
    for (const [edge, label] of EDGES) {
      const barNow = await barAt(page, edge, width, height);
      await setBar(page, app, barNow);
      const barred = await measureRows(app);
      fromBare[`${width}x${height} ${edge}`] = barred;
      Object.entries(problemsAll(plain, barred, barNow)).forEach(([key, list]) => list.forEach(text => issues.push(`${label} : ${text}`)));
      const covered = plain.units.filter(u => under(u, barNow));
      if (covered.length) { busy.cases += 1; busy.buttons += covered.length; busy.byEdge[edge] = (busy.byEdge[edge] || 0) + 1; }
      grown.marks += markedRows(barred).length;
      ROWS.forEach(([row]) => { if (rowLines(barred, row) > rowLines(plain, row)) grown.rows += 1; });
      if (sweepCases.some(([w, h, e]) => w === width && h === height && e === edge)) {
        const done = await sweepBar(page, app, barNow);
        sweeps.push({ size: `${width} × ${height} ${label}`, points: done.points, onBar: done.onBar, covered: done.covered.slice(0, 3), missed: done.missed });
      }
      await app.evaluate(() => ToolbarGap.refresh());
      if (!same(unitsAtRows(await measureRows(app)), unitsAtRows(barred))) issues.push(`${label} : un second calcul déplace des éléments`);
      await setBar(page, app, null);
      const gone = await measureRows(app);
      if (!same(unitsAtRows(gone), unitsAtRows(plain)) || gone.leaks || markedRows(gone).length || Math.abs(gone.height - plain.height) > 0.5) issues.push(`${label} : la barre partie, les rangées ne reviennent pas à ce qu’elles étaient sans barre (marges : ${markedRows(gone).join(', ') || 'aucune'}, variables restées : ${gone.leaks})`);
    }
    check(`${width} × ${height}, la barre en haut, à gauche, à droite puis en bas : ${Object.keys(ALL).map(key => ALL[key]).join(' ; ')} ; un second calcul ne change rien ; la barre partie tout revient`, issues.length === 0, issues.slice(0, 8));
  }
  check('le parcours est sérieux : sans le vide, des boutons seraient sous la barre dans ' + busy.cases + ' des ' + SIZES.length * EDGES.length + ' cas (' + JSON.stringify(busy.byEdge) + '), le code a posé ' + grown.marks + ' marges, et ' + grown.rows + ' rangées ont pris une ligne de plus',
    busy.cases >= 24 && (busy.byEdge.haut || 0) >= 10 && (busy.byEdge.gauche || 0) >= 8 && (busy.byEdge.droite || 0) >= 7 && (busy.byEdge.bas || 0) >= 2 && grown.marks >= 30, { busy, grown });
  check('à la vraie souris, un balayage de toute la barre ne passe jamais sur un bouton de la barre d’outils, dans sept cas où le vide a poussé des boutons (' + sweeps.map(w => w.size).join(' ; ') + ')',
    sweeps.length === sweepCases.length && sweeps.every(w => w.covered.length === 0 && w.onBar === w.points && w.points >= 15), sweeps);

  // L’histoire ne compte pas : d’un bord à l’autre sans passer par « plus de barre », puis le cadre qui change de taille sous la barre, donnent ce que donne une page sans barre à qui on pose la barre.
  const history = [];
  for (const [width, height] of [[700, 400], [400, 300], [400, 230]]) {
    await resizeFrame(page, app, width, height);
    await setBar(page, app, null);
    for (const edge of ['gauche', 'droite', 'haut', 'bas', 'gauche', 'bas', 'droite', 'haut']) {
      await setBar(page, app, await barAt(page, edge, width, height));
      if (!same(unitsAtRows(await measureRows(app)), unitsAtRows(fromBare[`${width}x${height} ${edge}`]))) history.push(`${width} × ${height}, de bord en bord, arrivé ${edge}`);
    }
    await setBar(page, app, null);
  }
  check('d’un bord à l’autre sans passer par « plus de barre » (gauche, droite, haut, bas, gauche, bas, droite, haut, à trois tailles), chaque bord donne exactement ce qu’il donne depuis une page sans barre', history.length === 0, history);
  await resizeFrame(page, app, 700, 400);
  await setBar(page, app, await barAt(page, 'gauche', 700, 400));
  await resizeFrame(page, app, 400, 300);
  await setBar(page, app, await barAt(page, 'gauche', 400, 300));
  check('le cadre passe de 700 × 400 à 400 × 300 la barre posée à gauche : après la nouvelle zone, mêmes positions que depuis une page de 400 × 300 sans barre', same(unitsAtRows(await measureRows(app)), unitsAtRows(fromBare['400x300 gauche'])), unitsAtRows(await measureRows(app)));
  await setBar(page, app, null);
  await resizeFrame(page, app, 700, 400);
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n6) Un GFS d’avant la consigne 025 et la page seule : même ligne qu’une page sans barre');
{
  const older = await t.openPage({ framed: true, seed: SEED, lang: 'fr' });
  await settle(older.app);
  const before = await measure(older.app);
  check('GFS d’avant la 025 (le contexte n’a pas de `barre`) : aucun élément décalé, la ligne est celle d’une page dont la barre est partie (mêmes éléments, mêmes positions)', before.marked.length === 0 && same(unitsAt(before), unitsAt(reference700)), { marked: before.marked, before: unitsAt(before), reference: unitsAt(reference700) });
  sameRows('et ses trois rangées (champs du courriel, mise en forme comprises) sont celles d’une page dont la barre est partie : aucune marge, aucune variable, même hauteur', await measureRows(older.app), referenceRows700);
  await older.page.context().close();
  const alone = await t.openPage({ hosted: false, seed: SEED, lang: 'fr' });
  await settle(alone.app);
  const aloneRow = await measure(alone.app);
  check('la page seule (adresse sans `gfs=`) : aucun élément décalé, mêmes éléments et mêmes positions', aloneRow.marked.length === 0 && same(unitsAt(aloneRow), unitsAt(reference700)), { marked: aloneRow.marked, alone: unitsAt(aloneRow), reference: unitsAt(reference700) });
  sameRows('et ses trois rangées sont celles d’une page dont la barre est partie : aucune marge, aucune variable, même hauteur', await measureRows(alone.app), referenceRows700);
  await alone.page.context().close();
  const narrow = await t.openPage({ hosted: false, seed: SEED, lang: 'fr', width: 580, height: 300 });
  await settle(narrow.app);
  const narrowRow = await measure(narrow.app);
  check('la page seule, 580 × 300 : la coupure laisse un séparateur seul au bout de la première ligne, et son trait est caché de même (la règle ne tient pas à la barre de GFS)', narrowRow.marked.length === 0 && edgeSeparators(narrowRow).length >= 1 && separatorProblems(narrowRow).length === 0, { lone: edgeSeparators(narrowRow), problems: separatorProblems(narrowRow) });
  await narrow.page.setViewportSize({ width: 800, height: 300 });
  await settle(narrow.app);
  const wide = await measureRows(narrow.app);
  check('la page seule, 800 × 300 : la deuxième ligne de mise en forme commence par un séparateur seul, son trait est caché de même (la règle ne tient pas à la barre de GFS)', fmtLone(wide).length === 1 && fmtLone(wide)[0].hidden && separatorProblems(wide).length === 0, { lone: fmtLone(wide).map(u => [u.key, u.hidden]), problems: separatorProblems(wide) });
  await narrow.page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n7) Anglais, thème sombre : même vide, en haut et à gauche');
{
  const { page, app } = await t.openPage({ framed: true, seed: SEED, lang: 'en', colorScheme: 'dark' });
  await settle(app);
  const { ref, now, bar } = await cycle(page, app, 700, 400);
  const problems = problemsOf(ref, now, bar.zone);
  check('English, dark, 700 × 400, bar on top: ' + Object.keys(SMALL).filter(key => key !== 'lines').map(key => SMALL[key]).join(' ; ') + ' ; même hauteur de barre d’outils', Object.values(problems).every(list => list.length === 0) && linesOf(now.units) === linesOf(ref.units) && Math.abs(now.height - ref.height) < 0.5, problems);
  await setBar(page, app, null);
  const plain = await measureRows(app);
  const leftBar = await barAt(page, 'gauche', 700, 400);
  await setBar(page, app, leftBar);
  const barred = await measureRows(app);
  const problemsLeft = problemsAll(plain, barred, leftBar);
  check('English, dark, 700 × 400, bar on the left: ' + Object.keys(ALL).map(key => ALL[key]).join(' ; ') + ' ; même hauteur de barre d’outils, et sans le vide un bouton serait sous la barre', Object.values(problemsLeft).every(list => list.length === 0) && plain.units.some(u => under(u, leftBar)) && Math.abs(barred.height - plain.height) < 0.5, { problemsLeft, under: plain.units.filter(u => under(u, leftBar)).map(u => u.key) });
  await page.context().close();
}

await t.finish();
