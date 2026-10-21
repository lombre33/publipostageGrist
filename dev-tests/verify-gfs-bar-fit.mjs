#!/usr/bin/env node
// Les composants de l'app se calent sur ce que la barre de GFS laisse libre (consigne GFS 025, deuxième lot ; le premier, dev-tests/verify-gfs-bar.mjs, LIT la barre et ne déplace rien). GFS pose sa barre
// (quatre boutons à icône seule, 34 × 124 px) PAR-DESSUS le cadre de l'app, au bord que la personne a choisi, centrée sur lui ; la zone à laisser libre fait 42 × 132 px (marge de 4 px comprise). Ici, 700x400 (le
// panneau de Grist) dans le cadre isolé de GFS (sans `allow-same-origin`) que porte une page parente qui joue GFS (dev-tests/gfs-stub.js : `setBarre` change la barre et envoie l'événement `barre`) ; la barre ne se
// dessine pas dans ces pages, on mesure ce que l'app laisse libre : aucune partie d'un composant ne recouvre la zone, et rien ne bouge sans barre.
//  1) LES FENÊTRES (voile `.pp-modal`, css/modal-base.css) : la galerie de modèles (grande, 960 px plafonnés), Réglages (moyenne, haute) et une confirmation (petite) aux quatre bords et sans barre. Le voile couvre
//     TOUT le cadre (le fond sombre passe sous la barre), le cadre de la fenêtre se cale sur ce qui reste libre : il ne touche pas la zone, garde sa marge de 12 px dans ce qui reste, s'y centre, titre et boutons
//     restent dans le cadre (seul le contenu défile) ; sans barre, il est où il était (la référence est celle d'un GFS d'avant la consigne) ; le bouton « Fermer » de la fenêtre se clique à la vraie souris.
//  2) LA BARRE CHANGE, FENÊTRE OUVERTE : la personne déplace la barre (gauche → haut → droite → bas), l'explorateur de GFS s'ouvre (plus de barre) puis se ferme : la fenêtre se recale toute seule, sans rien rouvrir.
//  3) AU DÉPART, la barre est déjà dans le contexte de GFS (bord gauche) : la première fenêtre ouverte la respecte ; et un petit cadre (560 × 300, la zone bouge avec lui) aussi.
//  4) LES MENUS DE LA BARRE D'OUTILS (`.v2-hover-flyout`, `positionFlyout` de js/editor-core.js) : chaque menu, ouvert au survol de son bouton à la vraie souris, sans barre puis aux quatre bords : il ne recouvre pas la
//     zone, reste dans le cadre et sous son bouton (le pont de survol les relie), et se rejoint à la souris (du bouton au menu, il reste ouvert et sous le pointeur) ; sans barre il est où il était, rien de posé en plus ;
//     à gauche ou à droite il glisse sur le côté, en haut il descend (écart du pont de survol agrandi), en bas un menu trop long défile (à la molette jusqu'à sa dernière ligne, entière ; l'info-bulle d'une de ses lignes
//     reste dans sa boîte) ; la barre retirée, les menus reviennent où ils étaient.
//  5) LES INFO-BULLES de la barre d'outils (`fitTooltip` de js/viewport-fit.js) : celles de tous les boutons visibles, sans barre puis aux quatre bords : aucune ne recouvre la zone ni ne sort du cadre, et une qui n'y
//     touchait pas reste où elle était.
//  6) LA BARRE CHANGE, MENU OUVERT AU CLAVIER (focus du bouton) : le menu reste ouvert, se recale à chaque bord, puis rend tout ce qu'il avait posé quand la barre part.
//  7) UN CADRE BAS (700 × 260) : posée une barre, tout menu reste dans le cadre et hors de la zone (un menu plus haut que la place défile, 8 px avant le bas du cadre au moins, descendu sous une barre en haut compris).
// GFS_BAR_FIT_ONLY=1,3 ne joue que ces scénarios (mise au point) ; GFS_BAR_FIT_VERBOSE=1 écrit les rectangles mesurés ; rien d'écrit sinon. Lancé par run-headless.mjs (groupe Node « gfsBarFit », cf. NODE_SCRIPTS),
// ou seul : node dev-tests/verify-gfs-bar-fit.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-gfs-bar-fit', port: Number(process.env.GFS_BAR_FIT_PORT || 8929) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SEED = seedModels();
const ONLY = (process.env.GFS_BAR_FIT_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const wanted = n => ONLY.length === 0 || ONLY.includes(String(n));
const VERBOSE = !!process.env.GFS_BAR_FIT_VERBOSE;

const EDGES = ['gauche', 'haut', 'droite', 'bas'];
const EN = { gauche: 'left', haut: 'top', droite: 'right', bas: 'bottom' };
const GAP = 12;            // la marge entre le cadre d'une fenêtre et le bord de la place libre (--pp-modal-gap)
const round = n => Math.round(n * 10) / 10;
const sameRect = (a, b) => ['left', 'top', 'right', 'bottom'].every(k => Math.abs(a[k] - b[k]) < 0.6);
const showRect = r => [r.left, r.top, r.right, r.bottom].map(round).join(', ');

// La barre telle que GFS la montre pour un cadre de `width` × `height` (la forme que calcule le GFS simulé), ou null : pas de barre.
const barOf = (page, bord, width, height) => (bord === null ? null : page.evaluate(([b, w, h]) => window.__gfsStub.zoneDe(b, w, h), [bord, width, height]));
// GFS montre cette barre : l'événement `barre` part, le cadre le recopie dans <html data-gfs-bar> (ou le retire).
async function showBar(page, app, bord, width, height) {
  const bar = await barOf(page, bord, width, height);
  await page.evaluate(next => window.__gfsStub.setBarre(next), bar);
  await app.waitForFunction(want => document.documentElement.getAttribute('data-gfs-bar') === want, bord === null ? null : EN[bord], { timeout: 5000 });
  await sleep(80);
  return bar;
}
// La place que la barre laisse libre : le cadre moins la profondeur de la barre à son seul bord.
function freeOf(bar, width, height) {
  const free = { left: 0, top: 0, right: width, bottom: height };
  if (!bar) return free;
  if (bar.bord === 'gauche') free.left = bar.epaisseur;
  if (bar.bord === 'haut') free.top = bar.epaisseur;
  if (bar.bord === 'droite') free.right = width - bar.epaisseur;
  if (bar.bord === 'bas') free.bottom = height - bar.epaisseur;
  return free;
}
// Le rectangle recouvre-t-il la zone ? (un pixel au moins : au contact, non)
function hits(rect, bar) {
  if (!bar) return false;
  const z = bar.zone;
  // Au centième de pixel près : la mise en page arrondit les positions au 64e de pixel (0,016), ce qui ne se voit pas et que GFS ne peut pas mesurer.
  const E = 0.02;
  return rect.left < z.x + z.largeur - E && rect.right > z.x + E && rect.top < z.y + z.hauteur - E && rect.bottom > z.y + E;
}

// Les trois fenêtres : comment on les ouvre, où est leur voile, comment on les ferme (à la vraie souris pour les deux premières).
const WINDOWS = [
  { name: 'la galerie de modèles (grande)', overlay: '#template-gallery-modal', size: 'lg', open: ({ app }) => app.evaluate(() => document.getElementById('v2-btn-new-from-template').click()), close: '#tpl-gallery-close' },
  { name: 'Réglages (moyenne, haute)', overlay: '#settings-modal', size: 'md', open: async ({ page, app }) => { const at = await center(app, '#v2-btn-settings'); await page.mouse.click(at.x, at.y); }, close: '#settings-close' },
  { name: 'une confirmation (petite)', overlay: '#pp-dialog-modal', size: 'sm', open: ({ app }) => app.evaluate(() => { window.__asked = Dialogs.confirm({ title: 'Supprimer ce modèle ?', message: 'Cette action ne peut pas être annulée.' }); }), close: '#pp-dialog-modal .pp-modal-actions button' },
];
const center = (app, selector) => app.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);

// Ce que la fenêtre montre : le voile, le cadre, ses trois zones, dans le repère du cadre de l'app.
const measure = (app, overlaySel) => app.evaluate((sel) => {
  const overlay = document.querySelector(sel);
  const box = overlay.querySelector('.pp-modal-box');
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  return { shown: getComputedStyle(overlay).display !== 'none', overlay: rect(overlay), box: rect(box), header: rect(box.querySelector('.pp-modal-header')), body: rect(box.querySelector('.pp-modal-body')), actions: rect(box.querySelector('.pp-modal-actions')), frame: [window.innerWidth, window.innerHeight] };
}, overlaySel);
async function open(win, ctx) {
  await win.open(ctx);
  await ctx.app.waitForFunction(sel => getComputedStyle(document.querySelector(sel)).display !== 'none', win.overlay, { timeout: 8000 });
  await sleep(150);
  return measure(ctx.app, win.overlay);
}
// Ferme la fenêtre à la vraie souris (le bouton est donc atteignable : rien ne le recouvre) et attend qu'elle ait disparu.
async function closeByMouse(win, { page, app }) {
  const at = await center(app, win.close);
  const top = await app.evaluate(([x, y, sel]) => { const el = document.elementFromPoint(x, y); return !!el && !!el.closest(sel); }, [at.x, at.y, win.close]);
  await page.mouse.click(at.x, at.y);
  const gone = await app.waitForFunction(sel => getComputedStyle(document.querySelector(sel)).display === 'none', win.overlay, { timeout: 5000 }).then(() => true, () => false);
  await sleep(80);
  return top && gone;
}

// Ce que doit vérifier une fenêtre ouverte devant `bar` (null : pas de barre), dans un cadre de width × height ; `ref` : la référence sans barre de la même fenêtre.
function judge(label, win, m, bar, [width, height], ref) {
  const free = freeOf(bar, width, height);
  const box = m.box;
  if (VERBOSE) console.log('     ', label, 'cadre', showRect(box), 'libre', JSON.stringify(free));
  check(`${label} : le voile couvre tout le cadre (le fond passe sous la barre) et la fenêtre est ouverte`, m.shown && sameRect(m.overlay, { left: 0, top: 0, right: width, bottom: height }), { overlay: m.overlay });
  check(`${label} : le cadre de la fenêtre est entier dans le cadre de l'app`, box.left >= -0.5 && box.top >= -0.5 && box.right <= width + 0.5 && box.bottom <= height + 0.5, { box: showRect(box) });
  check(`${label} : ni le cadre, ni le titre, ni le contenu, ni les boutons ne recouvrent la zone de la barre`, !hits(box, bar) && !hits(m.header, bar) && !hits(m.body, bar) && !hits(m.actions, bar), { box: showRect(box), zone: bar && bar.zone });
  check(`${label} : la fenêtre garde ses ${GAP} px de marge dans ce qui reste libre et s'y centre`, box.left >= free.left + GAP - 0.5 && box.right <= free.right - GAP + 0.5 && box.top >= free.top + GAP - 0.5 && box.bottom <= free.bottom - GAP + 0.5
    && Math.abs((box.left + box.right) / 2 - (free.left + free.right) / 2) < 1 && Math.abs((box.top + box.bottom) / 2 - (free.top + free.bottom) / 2) < 1, { box: showRect(box), libre: free });
  check(`${label} : titre, contenu et boutons restent dans le cadre de la fenêtre (seul le contenu défile)`, m.header.top >= box.top - 0.5 && m.header.bottom <= box.bottom + 0.5 && m.body.top >= box.top - 0.5 && m.body.bottom <= box.bottom + 0.5 && m.actions.top >= box.top - 0.5 && m.actions.bottom <= box.bottom + 0.5, { header: showRect(m.header), body: showRect(m.body), actions: showRect(m.actions), box: showRect(box) });
  if (bar === null && ref) check(`${label} : sans barre, la fenêtre est où elle était sans la consigne`, sameRect(box, ref.box), { maintenant: showRect(box), avant: showRect(ref.box) });
  if (bar === null) {
    const wide = win.size === 'lg' ? width - 2 * GAP : win.size === 'sm' ? 400 : 480;
    check(`${label} : sans barre, sa largeur est celle de sa taille (${win.size}) plafonnée à ${GAP} px du bord`, Math.abs((box.right - box.left) - Math.min(wide, width - 2 * GAP)) < 1, { largeur: round(box.right - box.left) });
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(1) || wanted(2)) {
  console.log('\n1) Les fenêtres aux quatre bords, 700 × 400');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
  const { page, app } = ctx;
  const frame = [700, 400];
  const reference = {};
  for (const win of WINDOWS) {
    const m = await open(win, ctx);
    reference[win.name] = m;
    judge(win.name + ', sans barre', win, m, null, frame, null);
    check(win.name + ', sans barre : la fenêtre se ferme au clic sur son bouton (vraie souris)', await closeByMouse(win, ctx));
  }
  // Une confirmation encore en attente après sa fermeture par un bouton : rien à nettoyer (la promesse s'est résolue).
  if (wanted(1)) {
    for (const bord of EDGES) {
      const bar = await showBar(page, app, bord, ...frame);
      for (const win of WINDOWS) {
        const m = await open(win, ctx);
        judge(`${win.name}, barre ${bord}`, win, m, bar, frame, null);
        check(`${win.name}, barre ${bord} : la fenêtre se ferme au clic sur son bouton (vraie souris)`, await closeByMouse(win, ctx));
      }
    }
    await showBar(page, app, null, ...frame);
    for (const win of WINDOWS) {
      const m = await open(win, ctx);
      check(`${win.name} : barre retirée (explorateur de GFS ouvert), la fenêtre est où elle était sans barre`, sameRect(m.box, reference[win.name].box), { maintenant: showRect(m.box), avant: showRect(reference[win.name].box) });
      await closeByMouse(win, ctx);
    }
  }

  if (wanted(2)) {
    console.log('\n2) La barre change, fenêtre ouverte');
    for (const win of WINDOWS) {
      await showBar(page, app, 'gauche', ...frame);
      await open(win, ctx);
      for (const bord of ['haut', 'droite', 'bas', null, 'gauche']) {
        const bar = await showBar(page, app, bord, ...frame);
        const m = await measure(app, win.overlay);
        const free = freeOf(bar, ...frame);
        check(`${win.name} ouverte, la barre passe ${bord === null ? 'à « aucune » (explorateur ouvert)' : 'au bord ' + bord} : elle se recale sur la place libre, sans rouvrir`, m.shown && !hits(m.box, bar) && Math.abs((m.box.left + m.box.right) / 2 - (free.left + free.right) / 2) < 1 && Math.abs((m.box.top + m.box.bottom) / 2 - (free.top + free.bottom) / 2) < 1
          && m.box.left >= free.left + GAP - 0.5 && m.box.right <= free.right - GAP + 0.5 && m.box.top >= free.top + GAP - 0.5 && m.box.bottom <= free.bottom - GAP + 0.5, { box: showRect(m.box), libre: free });
        if (bord === null) check(`${win.name} ouverte, plus de barre : elle revient où elle était sans barre`, sameRect(m.box, reference[win.name].box), { maintenant: showRect(m.box), avant: showRect(reference[win.name].box) });
      }
      await closeByMouse(win, ctx);
    }
  }
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (wanted(3)) {
  console.log('\n3) Au départ, la barre est déjà dans le contexte ; un petit cadre (560 × 300)');
  const wide = (await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: { bord: 'gauche', epaisseur: 42, zone: { x: 0, y: 134, largeur: 42, hauteur: 132 } } } }));
  const barAtStart = { bord: 'gauche', epaisseur: 42, zone: { x: 0, y: 134, largeur: 42, hauteur: 132 } };
  for (const win of WINDOWS) {
    const m = await open(win, wide);
    judge(win.name + ', barre gauche dans le contexte de départ', win, m, barAtStart, [700, 400], null);
    await closeByMouse(win, wide);
  }
  await wide.page.context().close();

  const small = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null }, width: 560, height: 300 });
  const size = [560, 300];
  for (const bord of ['gauche', 'haut']) {
    const bar = await showBar(small.page, small.app, bord, ...size);
    for (const win of WINDOWS) {
      const m = await open(win, small);
      judge(`${win.name}, barre ${bord}, cadre 560 × 300`, win, m, bar, size, null);
      await closeByMouse(win, small);
    }
  }
  await small.page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Les menus de la barre d'outils (`.v2-hover-group` : un survol du bouton ouvre `.v2-hover-flyout`) et leurs info-bulles (`[data-tip]`), 700 × 400, à la vraie souris.
const FRAME = [700, 400];
const PARK = { x: 350, y: 396 };    // loin de tout bouton
let parkAt = PARK;     // le scénario du cadre bas range la souris plus haut
const park = async (page) => { await page.mouse.move(parkAt.x, parkAt.y); await sleep(120); };
const menuIds = app => app.evaluate(() => Array.from(document.querySelectorAll('.v2-hover-group > .v2-hover-flyout')).map((el, i) => { if (!el.id) el.id = 'pp-fit-flyout-' + i; return el.id; }));
const menuState = (app, id) => app.evaluate((fid) => {
  const fly = document.getElementById(fid);
  const group = fly.parentElement;
  const trigger = group.querySelector(':scope > button') || group;
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  return {
    id: fid, shown: getComputedStyle(fly).display !== 'none' && fly.getBoundingClientRect().width > 0, expanded: trigger.getAttribute('aria-expanded'),
    group: rect(group), trigger: rect(trigger), flyout: rect(fly), capped: fly.classList.contains('v2-hover-flyout-capped'), scrollable: fly.classList.contains('v2-hover-flyout-scrollable'),
    scrollTop: fly.scrollTop, scrollHeight: fly.scrollHeight, clientHeight: fly.clientHeight, left: fly.style.left, gap: group.style.getPropertyValue('--v2-flyout-gap'), maxHeight: fly.style.maxHeight,
  };
}, id);
// Le survol du bouton du groupe : le menu s'ouvre (null quand le groupe n'est pas montré dans cette disposition de la barre d'outils).
async function hoverMenu(ctx, id) {
  const { page, app } = ctx;
  await park(page);
  const before = await menuState(app, id);
  if (!(before.trigger.right - before.trigger.left > 0 && before.trigger.bottom - before.trigger.top > 0)) return null;
  await page.mouse.move((before.trigger.left + before.trigger.right) / 2, (before.trigger.top + before.trigger.bottom) / 2);
  await app.waitForFunction(fid => getComputedStyle(document.getElementById(fid)).display !== 'none', id, { timeout: 3000 }).catch(() => {});
  await sleep(120);
  return menuState(app, id);
}
// Du bouton au menu, à la souris : tout droit vers le bord haut du menu (au droit du bouton quand le menu le recouvre, au plus près sinon), puis jusqu'à l'intérieur ; le menu doit rester ouvert et sous le pointeur.
async function intoMenu(ctx, m) {
  const { page } = ctx;
  const f = m.flyout;
  const tx = (m.trigger.left + m.trigger.right) / 2;
  const entry = { x: Math.min(Math.max(tx, f.left + 6), f.right - 6), y: f.top + 6 };
  await page.mouse.move(entry.x, entry.y, { steps: 6 });
  const inside = { x: (f.left + f.right) / 2, y: Math.min(f.top + 40, (f.top + f.bottom) / 2) };
  await page.mouse.move(inside.x, inside.y, { steps: 6 });
  await sleep(100);
  return inside;
}
async function reachMenu(ctx, m) {
  const { app } = ctx;
  const inside = await intoMenu(ctx, m);
  return app.evaluate(([fid, x, y]) => { const fly = document.getElementById(fid); const el = document.elementFromPoint(x, y); return { open: getComputedStyle(fly).display !== 'none', under: !!el && fly.contains(el), hover: fly.matches(':hover') }; }, [m.id, inside.x, inside.y]);
}
function judgeMenu(label, m, bar, ref, reached, frame = FRAME) {
  check(`${label} : le menu s'ouvre au survol de son bouton`, m.shown);
  if (!m.shown) return;
  const f = m.flyout;
  check(`${label} : le menu ne recouvre pas la zone de la barre`, !hits(f, bar), { menu: showRect(f), zone: bar && bar.zone });
  check(`${label} : le menu reste dans le cadre`, f.left >= -0.5 && f.right <= frame[0] + 0.5 && f.top >= -0.5 && f.bottom <= frame[1] + 0.5, { menu: showRect(f) });
  check(`${label} : le menu reste sous son bouton (le pont de survol les relie)`, f.left <= m.group.right + 8 && f.right >= m.group.left - 8 && f.top - m.group.bottom <= 12 && f.top >= m.group.bottom - 1, { menu: showRect(f), groupe: showRect(m.group) });
  if (reached) check(`${label} : du bouton au menu à la souris, le menu reste ouvert et sous le pointeur`, reached.open && reached.under && reached.hover, reached);
  if (bar === null && ref) check(`${label} : sans barre, le menu est où il était sans la consigne, sans défilement de plus`, sameRect(f, ref.flyout) && !m.capped && m.left === ref.left && m.gap === '' && m.maxHeight === ref.maxHeight, { maintenant: showRect(f), avant: showRect(ref.flyout), capped: m.capped, left: m.left, gap: m.gap, maxHeight: m.maxHeight });
}

if (wanted(4)) {
  console.log('\n4) Les menus de la barre d\'outils aux quatre bords, 700 × 400');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
  const { page, app } = ctx;
  const ids = await menuIds(app);
  const reference = {};
  const seen = {};
  const bars = {};
  for (const id of ids) {
    const m = await hoverMenu(ctx, id);
    if (!m) continue;
    reference[id] = m;
    judgeMenu(`le menu ${id}, sans barre`, m, null, null, null);
  }
  check('plus de dix menus de la barre d\'outils examinés sans barre', Object.keys(reference).length >= 10, Object.keys(reference).length);
  for (const bord of EDGES) {
    const bar = await showBar(page, app, bord, ...FRAME);
    bars[bord] = bar;
    await sleep(120);
    let examined = 0;
    for (const id of ids) {
      const m = await hoverMenu(ctx, id);
      if (!m) continue;
      examined += 1;
      const reached = m.shown ? await reachMenu(ctx, m) : null;
      judgeMenu(`le menu ${id}, barre ${bord}`, m, bar, null, reached);
      seen[bord + ':' + id] = m;
    }
    check(`barre ${bord} : les mêmes menus qu'avant sont examinés`, examined >= Object.keys(reference).length - 2, examined);
    await park(page);
  }
  // Ce que la barre a déplacé : le menu « Titre » à gauche, ceux du bord droit à droite, « + » sous une barre en haut, le menu « Titre » et « Lien et blocs » défilent au-dessus d'une barre en bas.
  const moved = (bord, id) => seen[bord + ':' + id];
  const slid = (bord, id) => moved(bord, id) && reference[id] && Math.abs(moved(bord, id).flyout.left - reference[id].flyout.left) > 0.5;
  check('barre à gauche : le menu « Titre » a glissé vers la droite (sans barre, il touchait la zone)', slid('gauche', 'v2-heading-flyout') && moved('gauche', 'v2-heading-flyout').flyout.left > reference['v2-heading-flyout'].flyout.left, moved('gauche', 'v2-heading-flyout') && showRect(moved('gauche', 'v2-heading-flyout').flyout));
  check('barre à droite : le menu « Qualité » a glissé vers la gauche (sans barre, il touchait la zone)', slid('droite', 'v2-quality-flyout') && moved('droite', 'v2-quality-flyout').flyout.left < reference['v2-quality-flyout'].flyout.left, moved('droite', 'v2-quality-flyout') && showRect(moved('droite', 'v2-quality-flyout').flyout));
  const plusDown = moved('haut', 'v2-new-template-flyout');
  check('barre en haut : le menu « + » s\'ouvre plus bas (écart du pont de survol agrandi), sans quitter son bouton', plusDown && plusDown.gap !== '' && plusDown.flyout.top >= bars.haut.zone.y + bars.haut.zone.hauteur - 0.5, plusDown && { menu: showRect(plusDown.flyout), ecart: plusDown.gap });
  for (const id of ['v2-heading-flyout', 'v2-blocks-flyout']) {
    const m = moved('bas', id);
    check(`barre en bas : le menu ${id} défile dans la place qui reste (plafonné, contenu plus haut que lui)`, m && m.shown && m.scrollHeight > m.clientHeight + 1 && (id === 'v2-heading-flyout' ? m.scrollable : m.capped), m && { clientHeight: m.clientHeight, scrollHeight: m.scrollHeight, capped: m.capped, scrollable: m.scrollable });
  }
  await showBar(page, app, 'bas', ...FRAME);
  // À la molette, jusqu'à la dernière ligne : elle est entière dans le menu et la souris la touche ; le menu est resté ouvert.
  for (const id of ['v2-heading-flyout', 'v2-blocks-flyout']) {
    const m = await hoverMenu(ctx, id);
    await intoMenu(ctx, m);
    await page.mouse.wheel(0, 900);
    await sleep(250);
    const end = await app.evaluate((fid) => {
      const fly = document.getElementById(fid);
      const last = Array.from(fly.querySelectorAll('button, select, [role="button"]')).filter(el => el.getBoundingClientRect().width > 0).pop();
      const box = fly.getBoundingClientRect();
      const r = last.getBoundingClientRect();
      const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return { open: getComputedStyle(fly).display !== 'none', scrollTop: fly.scrollTop, last: { top: r.top, bottom: r.bottom }, inner: { top: box.top + fly.clientTop, bottom: box.top + fly.clientTop + fly.clientHeight }, touches: !!hit && last.contains(hit) };
    }, id);
    check(`barre en bas : ${id} défile à la molette, sa dernière ligne est entière dans le menu et la souris la touche`, end.open && end.scrollTop > 0 && end.last.bottom <= end.inner.bottom + 1 && end.last.top >= end.inner.top - 1 && end.touches, end);
  }
  // Les deux icônes à info-bulle du menu « Lien et blocs » (Exposant, Indice) : l'info-bulle reste dans la boîte du menu qui défile.
  {
    const m = await hoverMenu(ctx, 'v2-blocks-flyout');
    await intoMenu(ctx, m);
    const at = await center(app, '#v2-btn-superscript');
    await page.mouse.move(at.x, at.y, { steps: 4 });
    await app.waitForFunction(() => Number(getComputedStyle(document.getElementById('v2-btn-superscript'), '::after').opacity) === 1, null, { timeout: 2500 }).catch(() => {});
    const tip = await app.evaluate(() => {
      const host = document.getElementById('v2-btn-superscript');
      const r = host.getBoundingClientRect();
      const cs = getComputedStyle(host, '::after');
      const w = parseFloat(cs.width) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const left = r.left + host.clientLeft + parseFloat(cs.left) - w / 2;
      const fly = document.getElementById('v2-blocks-flyout');
      const box = fly.getBoundingClientRect();
      return { shown: Number(cs.opacity) === 1, left, right: left + w, boxLeft: box.left + fly.clientLeft, boxRight: box.left + fly.clientLeft + fly.clientWidth };
    });
    check('barre en bas : l\'info-bulle d\'« Exposant », dans le menu « Lien et blocs » qui défile, reste dans la boîte du menu (sinon son défilement la rognerait)', tip.shown && tip.left >= tip.boxLeft - 0.5 && tip.right <= tip.boxRight + 0.5, tip);
  }
  await showBar(page, app, null, ...FRAME);
  for (const id of ids) {
    const m = await hoverMenu(ctx, id);
    if (!m || !reference[id]) continue;
    judgeMenu(`le menu ${id}, barre retirée (explorateur de GFS ouvert)`, m, null, reference[id], null);
  }
  await page.context().close();
}

// L'écart de l'info-bulle : lire sa position telle qu'elle est (`actual`) et telle qu'elle serait sans le décalage que la barre a demandé (`natural`).
const tipOf = (app, id) => app.evaluate((hid) => {
  const host = document.getElementById(hid);
  const read = () => {
    const r = host.getBoundingClientRect();
    const cs = getComputedStyle(host, '::after');
    const w = parseFloat(cs.width) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const h = parseFloat(cs.height) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const left = r.left + host.clientLeft + parseFloat(cs.left) - w / 2;
    const top = r.top + host.clientTop + parseFloat(cs.top);
    return { left, top, right: left + w, bottom: top + h, opacity: Number(cs.opacity), text: cs.content.slice(0, 30) };
  };
  const actual = read();
  const kept = ['--pp-tip-shift', '--pp-tip-drop'].map(name => [name, host.style.getPropertyValue(name)]);
  kept.forEach(([name]) => host.style.removeProperty(name));
  const natural = read();
  kept.forEach(([name, value]) => { if (value) host.style.setProperty(name, value); });
  return { actual, natural, shift: kept[0][1], drop: kept[1][1] };
}, id);

if (wanted(5)) {
  console.log('\n5) Les info-bulles de la barre d\'outils aux quatre bords, 700 × 400');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
  const { page, app } = ctx;
  const hostIds = await app.evaluate(() => {
    const out = [];
    document.querySelectorAll('.bar-row [data-tip], #v2-toolbar [data-tip]').forEach((el, i) => {
      if (el.closest('.v2-hover-flyout')) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || getComputedStyle(el).visibility === 'hidden') return;
      if (!el.id) el.id = 'pp-fit-tip-' + i;
      out.push(el.id);
    });
    return out;
  });
  check('au moins vingt boutons à info-bulle examinés', hostIds.length >= 20, hostIds.length);
  let touched = 0;
  for (const bord of [null, ...EDGES]) {
    const bar = bord === null ? await showBar(page, app, null, ...FRAME) : await showBar(page, app, bord, ...FRAME);
    await sleep(150);
    let worse = 0; let moved = 0; let checked = 0; let belowBar = 0;
    for (const id of hostIds) {
      const at = await center(app, '#' + id);
      if (bar && at.x >= bar.zone.x && at.x <= bar.zone.x + bar.zone.largeur && at.y >= bar.zone.y && at.y <= bar.zone.y + bar.zone.hauteur) { belowBar += 1; continue; }
      await page.mouse.move(at.x, at.y);
      await app.waitForFunction(hid => Number(getComputedStyle(document.getElementById(hid), '::after').opacity) === 1, id, { timeout: 2500 }).catch(() => {});
      const tip = await tipOf(app, id);
      if (tip.actual.opacity < 1) { await park(page); continue; }
      checked += 1;
      const a = tip.actual; const n = tip.natural;
      const ok = !hits(a, bar) && a.left >= -0.5 && a.right <= FRAME[0] + 0.5;
      const natural = !hits(n, bar) && n.left >= 5.5 && n.right <= FRAME[0] - 5.5;
      const same = Math.abs(a.left - n.left) < 0.6 && Math.abs(a.top - n.top) < 0.6;
      if (!ok || (natural && !same)) { worse += 1; console.log(`   x ${id} « ${a.text} » barre ${bord}`, 'réel', showRect(a), 'naturel', showRect(n), 'décalage', tip.shift, 'descente', tip.drop); }
      if (!same) moved += 1;
      await page.mouse.move(PARK.x, PARK.y);
    }
    touched += moved;
    check(`barre ${bord === null ? 'aucune' : bord} : aucune des ${checked} info-bulles ne recouvre la zone, reste dans le cadre, et ne bouge que si elle recouvrait la zone`, checked >= 20 - belowBar && worse === 0, { examinees: checked, mauvaises: worse, deplacees: moved, boutonsSousLaBarre: belowBar });
  }
  check('la barre a déplacé au moins une info-bulle (à gauche, en haut ou à droite)', touched >= 3, touched);
  await page.context().close();
}

// Le menu reste ouvert au clavier (focus) pendant que la barre change : il se recale sur la nouvelle zone, et rend tout ce qu'il avait posé quand elle part.
if (wanted(6)) {
  console.log('\n6) La barre change, menu ouvert au clavier');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
  const { page, app } = ctx;
  const ids = await menuIds(app);
  const reference = {};
  for (const id of ['v2-heading-flyout', 'v2-blocks-flyout', 'v2-quality-flyout', 'v2-new-template-flyout']) {
    const m = await hoverMenu(ctx, id);
    reference[id] = m;
  }
  await park(page);
  for (const id of Object.keys(reference)) {
    await app.evaluate(fid => document.getElementById(fid).parentElement.querySelector(':scope > button').focus(), id);
    await sleep(150);
    const open = await menuState(app, id);
    check(`${id} : le focus du bouton ouvre le menu`, open.shown && open.expanded === 'true', open.expanded);
    for (const bord of ['gauche', 'haut', 'droite', 'bas', null, 'gauche']) {
      const bar = await showBar(page, app, bord, ...FRAME);
      await sleep(200);
      const m = await menuState(app, id);
      check(`${id} ouvert au clavier, la barre passe ${bord === null ? 'à « aucune »' : 'au bord ' + bord} : il reste ouvert et ne recouvre pas la zone`, m.shown && m.expanded === 'true' && !hits(m.flyout, bar) && m.flyout.right <= FRAME[0] + 0.5 && m.flyout.bottom <= FRAME[1] + 0.5, { menu: showRect(m.flyout), zone: bar && bar.zone });
      if (bord === null) check(`${id} ouvert au clavier, plus de barre : il revient où il était (rien de posé en plus)`, sameRect(m.flyout, reference[id].flyout) && !m.capped && m.gap === '' && m.left === reference[id].left, { maintenant: showRect(m.flyout), avant: showRect(reference[id].flyout), capped: m.capped, gap: m.gap, left: m.left });
    }
    await app.evaluate(fid => document.activeElement && document.activeElement.blur(), id);
    await sleep(150);
    await showBar(page, app, null, ...FRAME);
  }
  await page.context().close();
}

// Un cadre bas (700 × 260) : posée une barre, tout menu reste dans le cadre (un menu plus haut que la place défile) et hors de la zone ; descendu sous une barre en haut, il garde le recul d'avant sous lui.
// Sans barre, certains menus sortent déjà du cadre, comme avant la consigne : ce n'est pas mesuré ici.
if (wanted(7)) {
  console.log('\n7) Un cadre bas, 700 × 260');
  const size = [700, 260];
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null }, width: size[0], height: size[1] });
  const { page, app } = ctx;
  parkAt = { x: 350, y: size[1] - 4 };
  const ids = await menuIds(app);
  for (const bord of EDGES) {
    const bar = await showBar(page, app, bord, ...size);
    let examined = 0;
    for (const id of ids) {
      const m = await hoverMenu(ctx, id);
      if (!m) continue;
      examined += 1;
      const reached = m.shown ? await reachMenu(ctx, m) : null;
      judgeMenu(`cadre 700 × 260, le menu ${id}, barre ${bord}`, m, bar, null, reached, size);
      if (m.shown && (m.capped || m.scrollable)) check(`cadre 700 × 260, le menu ${id}, barre ${bord} : plafonné, il garde 8 px au moins avant le bas du cadre (descendu sous une barre en haut comme les autres)`, m.flyout.bottom <= size[1] - 8 + 0.5, { menu: showRect(m.flyout), gap: m.gap, maxHeight: m.maxHeight });
    }
    check(`cadre 700 × 260, barre ${bord} : plus de dix menus examinés`, examined >= 10, examined);
    await park(page);
  }
  parkAt = PARK;
  await page.context().close();
}

await t.finish();
