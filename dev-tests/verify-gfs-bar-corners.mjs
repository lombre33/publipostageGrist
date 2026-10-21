#!/usr/bin/env node
// Le logo et la sortie de la Lecture épurée laissent libre la zone de la barre de GFS (consigne GFS 025, deuxième lot, « les composants sans fil », dernier sujet ; les fenêtres, les menus, les info-bulles, les listes, les
// bulles et les panneaux flottants sont à dev-tests/verify-gfs-bar-fit.mjs et verify-gfs-bar-popups.mjs). GFS pose sa barre PAR-DESSUS le cadre de l'app, au bord que la personne a choisi, centrée sur lui : le logo (coin
// haut droit de la barre d'outils) et le bouton de sortie de la Lecture épurée (position fixe, coin haut droit) ne la rencontrent que dans un cadre bas (environ 200 px de haut ou moins, barre à droite) ou très étroit (barre en haut).
// Ici, le cadre isolé de GFS que porte une page parente qui joue GFS (dev-tests/gfs-stub.js) ; la barre ne se dessine pas, on mesure ce que l'app laisse libre : l'élément ne recouvre pas la zone, reste dans le cadre, garde
// sa ligne, et sans barre (ou la barre partie) il est où il était. Le clic de sortie se fait à la vraie souris, à la place où le bouton est.
//  1) LE LOGO à 700 × 400, sans barre puis aux quatre bords : jamais déplacé (la zone ne le touche pas), la réserve de la ligne reste celle d'avant.
//  2) LE LOGO dans trois cadres bas (700 × 180, 160 et 140), sans barre puis aux quatre bords : à droite il recule jusqu'au bord de la zone et la ligne réserve ce recul (aucun bouton ne passe dessous, ni sous la zone) ;
//     aux autres bords il reste ; la barre partie, il est où il était.
//  3) LE LOGO dans un cadre très étroit (180 × 300), barre en haut : il sort de la zone sans quitter le cadre ni passer sur un bouton.
//  4) LA SORTIE DE LA LECTURE ÉPURÉE à 700 × 400, puis dans trois cadres bas (700 × 200, 180 et 160) : sans barre puis aux quatre bords, elle ne recouvre jamais la zone ; à droite, dans un cadre bas, elle recule jusqu'au
//     bord de la zone, un vrai clic à sa nouvelle place sort de la Lecture épurée, et elle est à sa place dès son premier affichage (la barre était déjà là).
//  5) LA BARRE CHANGE, LECTURE ÉPURÉE OUVERTE ET LOGO MONTRÉ : droite → gauche → droite → aucune, dans un cadre bas : l'un et l'autre suivent, puis reviennent où ils étaient.
// GFS_BAR_CORNERS_ONLY=1,3 ne joue que ces scénarios (mise au point) ; GFS_BAR_CORNERS_VERBOSE=1 écrit les rectangles mesurés ; rien d'écrit sinon. Lancé par run-headless.mjs (groupe Node « gfsBarCorners », cf. NODE_SCRIPTS),
// ou seul : node dev-tests/verify-gfs-bar-corners.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-gfs-bar-corners', port: Number(process.env.GFS_BAR_CORNERS_PORT || 8965) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SEED = seedModels();
const ONLY = (process.env.GFS_BAR_CORNERS_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const wanted = n => ONLY.length === 0 || ONLY.includes(String(n));
const VERBOSE = !!process.env.GFS_BAR_CORNERS_VERBOSE;

const EDGES = ['gauche', 'haut', 'droite', 'bas'];
const EN = { gauche: 'left', haut: 'top', droite: 'right', bas: 'bottom' };
const FRAME = [700, 400];
const round = n => Math.round(n * 10) / 10;
const showRect = r => [r.left, r.top, r.right, r.bottom].map(round).join(', ');
const where = bord => (bord === null ? 'sans barre' : `barre ${bord}`);
const sameRect = (a, b) => ['left', 'top', 'right', 'bottom'].every(k => Math.abs(a[k] - b[k]) < 0.6);
const inFrame = (r, [w, h]) => r.left >= -0.5 && r.top >= -0.5 && r.right <= w + 0.5 && r.bottom <= h + 0.5;
const crosses = (a, b) => a.left < b.right - 0.02 && a.right > b.left + 0.02 && a.top < b.bottom - 0.02 && a.bottom > b.top + 0.02;

const barOf = (page, bord, width, height) => (bord === null ? null : page.evaluate(([b, w, h]) => window.__gfsStub.zoneDe(b, w, h), [bord, width, height]));
// GFS montre cette barre : l'événement `barre` part, le cadre le recopie dans <html data-gfs-bar> (ou le retire).
async function showBar(page, app, bord, [width, height]) {
  const bar = await barOf(page, bord, width, height);
  await page.evaluate(next => window.__gfsStub.setBarre(next), bar);
  await app.waitForFunction(want => document.documentElement.getAttribute('data-gfs-bar') === want, bord === null ? null : EN[bord], { timeout: 5000 });
  await sleep(200);
  return bar;
}
// La zone de la barre en rectangle { left, top, right, bottom }.
const zoneRect = bar => (bar ? { left: bar.zone.x, top: bar.zone.y, right: bar.zone.x + bar.zone.largeur, bottom: bar.zone.y + bar.zone.hauteur } : null);

const rectOf = (app, selector) => app.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
}, selector);

// Le logo : son rectangle, le déplacement que GfsBar.keepClear lui a posé, la réserve de la ligne (retrait de droite calculé), et les rectangles de tout ce qui est cliquable dans les lignes de la barre d'outils.
const logoState = app => app.evaluate(() => {
  const logo = document.getElementById('v2-brand-logo');
  const top = document.getElementById('toolbar-top');
  const row = top.querySelector('.bar-row');
  const r = logo.getBoundingClientRect();
  const boxes = Array.from(top.querySelectorAll('.bar-row button, .bar-row select, .bar-row input, .bar-row a, .bar-row [role="button"]'))
    .map((el) => { const b = el.getBoundingClientRect(); return { id: el.id || el.className, left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; })
    .filter(b => b.width > 0 && b.height > 0);
  return {
    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
    translate: logo.style.translate, shift: top.style.getPropertyValue('--pp-logo-shift'), padRight: parseFloat(getComputedStyle(row).paddingRight),
    boxes,
  };
});
const underLogo = (s) => s.boxes.filter(b => crosses(b, s.rect)).map(b => b.id);
const underZone = (s, zone) => (zone ? s.boxes.filter(b => crosses(b, zone)).map(b => b.id) : []);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Le contrôle commun du logo dans un cadre : sans barre (le repère), puis aux quatre bords.
async function runLogo(ctx, frame, tag, { expectMove }) {
  const { page, app } = ctx;
  let base = null;
  for (const bord of [null, ...EDGES, null]) {
    const bar = await showBar(page, app, bord, frame);
    const zone = zoneRect(bar);
    const s = await logoState(app);
    const label = `${tag}le logo, ${where(bord)}`;
    if (VERBOSE) console.log('     ', label, showRect(s.rect), `translate="${s.translate}" réserve=${s.padRight}`);
    check(`${label} : ne recouvre pas la zone de la barre`, !zone || !crosses(s.rect, zone), { logo: showRect(s.rect), zone });
    check(`${label} : reste dans le cadre`, inFrame(s.rect, frame), { logo: showRect(s.rect) });
    check(`${label} : aucun bouton de la barre d'outils ne passe dessous`, underLogo(s).length === 0, underLogo(s));
    if (bord === null) {
      check(`${label} : il n'est pas déplacé (aucun décalage posé, la réserve de la ligne est celle d'avant)`, s.translate === '' && s.shift === '' && s.padRight === 34, { translate: s.translate, shift: s.shift, reserve: s.padRight });
      if (base === null) base = s;
      else check(`${label} : la barre partie, le logo est où il était`, sameRect(s.rect, base.rect) && s.padRight === base.padRight, { maintenant: showRect(s.rect), avant: showRect(base.rect) });
      continue;
    }
    const moves = bord === 'droite' && expectMove;
    if (moves) {
      check(`${label} : il recule jusqu'au bord de la zone, sur sa ligne`, Math.abs(s.rect.right - zone.left) < 0.6 && Math.abs(s.rect.top - base.rect.top) < 0.6, { logo: showRect(s.rect), zone, avant: showRect(base.rect) });
      check(`${label} : la ligne réserve ce recul (retrait de droite = 34 px + recul)`, Math.abs(s.padRight - (34 + (base.rect.right - s.rect.right))) < 0.6 && s.shift !== '', { reserve: s.padRight, recul: round(base.rect.right - s.rect.right), variable: s.shift });
      check(`${label} : aucun bouton de la barre d'outils ne passe sous la zone`, underZone(s, zone).length === 0, underZone(s, zone));
    } else {
      check(`${label} : il n'a rien à éviter, il reste où il était`, sameRect(s.rect, base.rect) && s.translate === '', { logo: showRect(s.rect), avant: showRect(base.rect), translate: s.translate });
    }
  }
}

if (wanted(1)) {
  console.log('\n1) Le logo à 700 × 400');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
  await runLogo(ctx, FRAME, '', { expectMove: false });
  await ctx.page.context().close();
}

if (wanted(2)) {
  for (const height of [180, 160, 140]) {
    console.log(`\n2) Le logo dans un cadre bas, 700 × ${height}`);
    const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null }, width: 700, height });
    await runLogo(ctx, [700, height], `cadre 700 × ${height}, `, { expectMove: true });
    await ctx.page.context().close();
  }
}

if (wanted(3)) {
  console.log('\n3) Le logo dans un cadre très étroit, 180 × 300');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null }, width: 180, height: 300 });
  const { page, app } = ctx;
  const frame = [180, 300];
  await showBar(page, app, null, frame);
  const base = await logoState(app);
  const bar = await showBar(page, app, 'haut', frame);
  const zone = zoneRect(bar);
  const s = await logoState(app);
  const label = 'cadre 180 × 300, le logo, barre haut';
  if (VERBOSE) console.log('     ', label, showRect(s.rect), `translate="${s.translate}"`, 'zone', JSON.stringify(zone), 'avant', showRect(base.rect));
  check(`${label} : ne recouvre pas la zone de la barre`, !crosses(s.rect, zone), { logo: showRect(s.rect), zone });
  check(`${label} : reste dans le cadre`, inFrame(s.rect, frame), { logo: showRect(s.rect) });
  check(`${label} : aucun bouton de la barre d'outils ne passe dessous`, underLogo(s).length === 0, underLogo(s));
  check(`${label} : il a bougé (la zone le recouvrait)`, !sameRect(s.rect, base.rect), { logo: showRect(s.rect), avant: showRect(base.rect) });
  const back = await showBar(page, app, null, frame);
  const after = await logoState(app);
  check('cadre 180 × 300, le logo, la barre partie : il est où il était', back === null && sameRect(after.rect, base.rect) && after.translate === '' && after.shift === '', { maintenant: showRect(after.rect), avant: showRect(base.rect) });
  await ctx.page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 4) La sortie de la Lecture épurée.
const EXIT = '#btn-exit-clean-reading';
// Ouvre la Lecture épurée (le clic de la ligne du menu du bouton Mode lecture : le menu s'ouvre au survol, mais un cadre de 160 px de haut n'a pas la place de le montrer entier) et rend le rectangle du bouton de sortie.
async function enterClean({ app }) {
  await app.evaluate(() => { document.getElementById('v2-btn-clean-reading').click(); });
  await app.waitForFunction(() => CleanReading.isActive() && document.body.classList.contains('pp-clean-reading'), null, { timeout: 6000 });
  await sleep(250);
  return rectOf(app, EXIT);
}
const cleanActive = app => app.evaluate(() => CleanReading.isActive());
async function leaveClean(ctx) {
  if (await cleanActive(ctx.app)) await ctx.app.evaluate(() => CleanReading.exit());
  await ctx.app.waitForFunction(() => !CleanReading.isActive(), null, { timeout: 6000 });
  await sleep(200);
}

async function runExit(ctx, frame, tag, { expectMove }) {
  const { page, app } = ctx;
  let base = null;
  for (const bord of [null, ...EDGES, null]) {
    const bar = await showBar(page, app, bord, frame);
    const zone = zoneRect(bar);
    const r = await enterClean(ctx);
    const label = `${tag}la sortie de la Lecture épurée, ${where(bord)}`;
    check(`${label} : le bouton s'affiche`, !!r);
    if (r) {
      if (VERBOSE) console.log('     ', label, showRect(r));
      check(`${label} : ne recouvre pas la zone de la barre`, !zone || !crosses(r, zone), { bouton: showRect(r), zone });
      check(`${label} : reste dans le cadre`, inFrame(r, frame), { bouton: showRect(r) });
      if (bord === null) {
        if (base === null) base = r;
        else check(`${label} : la barre partie, le bouton est où il était`, sameRect(r, base), { maintenant: showRect(r), avant: showRect(base) });
        check(`${label} : il n'est pas déplacé`, (await app.evaluate(sel => document.querySelector(sel).style.translate, EXIT)) === '');
      } else if (bord === 'droite' && expectMove) {
        check(`${label} : il recule jusqu'au bord de la zone, sur sa ligne`, Math.abs(r.right - zone.left) < 0.6 && Math.abs(r.top - base.top) < 0.6, { bouton: showRect(r), zone, avant: showRect(base) });
      } else {
        check(`${label} : il n'a rien à éviter, il reste où il était`, sameRect(r, base), { bouton: showRect(r), avant: showRect(base) });
      }
      // Un vrai clic au centre du bouton sort de la Lecture épurée : le bouton répond là où il est.
      if (bord === 'droite' || bord === null) {
        await page.mouse.move(r.left - 20, r.top + 4, { steps: 2 });
        await page.mouse.move((r.left + r.right) / 2, (r.top + r.bottom) / 2, { steps: 3 });
        await sleep(120);
        const hit = await app.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return !!el && (el.id === 'btn-exit-clean-reading' || !!el.closest('#btn-exit-clean-reading')); }, [(r.left + r.right) / 2, (r.top + r.bottom) / 2]);
        check(`${label} : un vrai pointeur au centre du bouton tombe sur lui`, hit);
        await page.mouse.down();
        await page.mouse.up();
        await sleep(300);
        check(`${label} : un vrai clic dessus sort de la Lecture épurée`, !(await cleanActive(app)));
        await page.mouse.move(5, frame[1] - 20);
      }
    }
    await leaveClean(ctx);
  }
}

if (wanted(4)) {
  console.log('\n4) La sortie de la Lecture épurée à 700 × 400');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
  await runExit(ctx, FRAME, '', { expectMove: false });
  await ctx.page.context().close();
  for (const height of [200, 180, 160]) {
    console.log(`\n4) La sortie de la Lecture épurée dans un cadre bas, 700 × ${height}`);
    const low = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null }, width: 700, height });
    await runExit(low, [700, height], `cadre 700 × ${height}, `, { expectMove: true });
    await low.page.context().close();
  }
  // La barre est déjà à droite quand la Lecture épurée s'ouvre : le bouton, caché jusque-là, a sa bonne place dès qu'il se montre (son premier affichage).
  console.log('\n4) La barre déjà là, la Lecture épurée s\'ouvre ensuite, 700 × 180');
  const first = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null }, width: 700, height: 180 });
  const bar = await showBar(first.page, first.app, 'droite', [700, 180]);
  const r = await enterClean(first);
  check('cadre 700 × 180, barre droite déjà là : à son premier affichage le bouton de sortie est déjà hors de la zone', !!r && !crosses(r, zoneRect(bar)), r && { bouton: showRect(r), zone: bar.zone });
  await first.page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 5) La barre change, Lecture épurée ouverte : le bouton suit puis revient.
if (wanted(5)) {
  console.log('\n5) La barre change, Lecture épurée ouverte, 700 × 180');
  const frame = [700, 180];
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null }, width: frame[0], height: frame[1] });
  const { page, app } = ctx;
  await showBar(page, app, null, frame);
  const base = await enterClean(ctx);
  for (const bord of ['droite', 'gauche', 'droite', 'bas', null]) {
    const bar = await showBar(page, app, bord, frame);
    const r = await rectOf(app, EXIT);
    const label = `la barre passe ${{ droite: 'à droite', gauche: 'à gauche', haut: 'en haut', bas: 'en bas' }[bord] || 'à aucun bord'}, Lecture épurée ouverte`;
    check(`${label} : le bouton de sortie ne recouvre pas la zone`, !!r && (!bar || !crosses(r, zoneRect(bar))), r && { bouton: showRect(r), zone: bar && bar.zone });
    if (bord === 'droite') check(`${label} : il a reculé jusqu'au bord de la zone`, !!r && Math.abs(r.right - bar.zone.x) < 0.6, r && { bouton: showRect(r), zone: bar.zone });
    else check(`${label} : il est où il était sans barre`, !!r && sameRect(r, base), r && { bouton: showRect(r), avant: showRect(base) });
  }
  await ctx.page.context().close();
}

await t.finish();
