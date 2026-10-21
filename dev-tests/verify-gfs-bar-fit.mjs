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
  return rect.left < z.x + z.largeur && rect.right > z.x && rect.top < z.y + z.hauteur && rect.bottom > z.y;
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

await t.finish();
