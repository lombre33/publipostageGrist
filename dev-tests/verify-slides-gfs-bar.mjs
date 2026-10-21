#!/usr/bin/env node
// Les éléments de bord d'une présentation se calent sur la barre de GFS (consigne GFS 025, deuxième lot : la bande des diapositives, le volet « Importer », le ▶ « Présenter », la pastille du zoom, et l'appel
// `barre.masquer` du diaporama ; js/gfs-bar.js:bite, extensions/diapositives/slide-strip.js, slide-import.js, slide-show.js, js/page-zoom.js). GFS pose sa barre (34 × 124 px) PAR-DESSUS le cadre de l'app, au bord que la
// personne a choisi, centrée sur lui ; la zone à laisser libre fait 42 × 132 px (4 px de marge). Ici l'app est dans le cadre isolé de GFS (sans `allow-same-origin`) que porte une page parente qui joue GFS
// (dev-tests/gfs-stub.js : `setBarre` change la barre et envoie l'événement `barre`, `barre.masquer` la masque) ; la barre ne se dessine pas, une pastille posée par la page parente tient sa place et prend la souris
// comme elle. 700x400, français clair puis anglais sombre, l'extension « diapositives » active, « Diapos » à l'écran (trois diapositives).
//  1) LA BANDE, barre à gauche (le bord par défaut), dès le contexte : aucune miniature, aucun bouton (« Ajouter », « Importer ») ni aucun numéro de la bande sous la zone ; la barre tient dans la gouttière que la
//     bande lui laisse à gauche ; la page lui laisse la même place et ne passe ni sous la bande ni sous la barre ; à la vraie souris un balayage de la bande ne rencontre jamais la barre là où il y a un bouton, et un
//     clic sur une miniature mène toujours à sa diapositive. Sans barre, la bande est où elle était (la référence est celle d'un GFS d'avant la consigne).
//  2) LA BARRE CHANGE bande ouverte : en haut, à droite, en bas, plus de barre (l'explorateur de GFS), à gauche : la bande est à la place d'avant sans barre au pixel près, la page se réajuste, et rien ne sort du cadre.
//  3) LE VOLET « IMPORTER », barre à droite : rien du volet (en-tête, « Fermer », choix de la source, liste) sous la zone, la barre dans sa gouttière à droite, la pastille du zoom à gauche du volet, la page entre la
//     bande et le volet ; le volet se ferme et rend sa place (sans barre au pixel près).
//  4) LA PASTILLE DU ZOOM ET LE ▶, barre en bas : à 700 × 400 la barre est loin d'eux, rien ne bouge ; dans un cadre plus étroit (460 × 300, la zone bouge avec lui) leur place ouverte (survol) toucherait la zone, ils
//     montent ensemble de sa hauteur, sur la même ligne, sans la recouvrir, ouverts ou non ; à la vraie souris on les atteint (survol de la pastille, clic sur le pourcentage) ; le cadre revient à 700 × 400 : ils
//     redescendent. Barre à droite dans un cadre bas : ils reculent d'autant.
//  5) « PRÉSENTER » : le ▶ à la vraie souris, F5 et Maj+F5 masquent la barre (un appel `barre.masquer { masquee: true }`, la barre disparaît), Échap, « Quitter » (vraie souris) et l'écran de fin la rendent (`masquee: false`) ;
//     pendant le diaporama la bande ne bouge pas, à la sortie non plus (la page ne se réajuste pas pour rien). Un GFS d'avant la consigne et la page seule : le diaporama part et se ferme comme avant, sans barre.
// Lancé par run-headless.mjs (groupe Node « slidesGfsBar », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-gfs-bar.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-gfs-bar', port: Number(process.env.SLIDES_GFS_BAR_PORT || 8959) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const EN = { gauche: 'left', haut: 'top', droite: 'right', bas: 'bottom' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Diapos', '<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}<p>Trois</p>', false, 'presentation');
  add(8, 'Autre', '<h1>Autre un</h1><p>Texte</p>${BR}<p>Autre deux</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 9;
`;
const round = n => Math.round(n * 10) / 10;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameRect = (a, b) => !!a && !!b && ['left', 'top', 'right', 'bottom'].every(k => Math.abs(a[k] - b[k]) < 0.6);
// La même place en largeur (la page défile : sa hauteur n'est pas ce qu'on compare).
const sameX = (a, b) => !!a && !!b && ['left', 'right'].every(k => Math.abs(a[k] - b[k]) < 0.6);
const showRect = r => (r ? [r.left, r.top, r.right, r.bottom].map(round).join(', ') : 'absent');

// La zone en rectangle du cadre, et « ce rectangle recouvre-t-il la zone ? » (un pixel au moins : au contact, non).
const zoneRect = bar => (bar ? { left: bar.zone.x, top: bar.zone.y, right: bar.zone.x + bar.zone.largeur, bottom: bar.zone.y + bar.zone.hauteur } : null);
const hits = (rect, bar) => !!bar && !!rect && rect.width !== 0 && (() => { const z = zoneRect(bar); return rect.left < z.right && rect.right > z.left && rect.top < z.bottom && rect.bottom > z.top; })();

const barAt = (page, edge, width, height) => page.evaluate(([e, w, h]) => window.__gfsStub.zoneDe(e, w, h), [edge, width, height]);
const waitEdge = (app, edge) => app.waitForFunction(wanted => document.documentElement.getAttribute('data-gfs-bar') === wanted, edge, { timeout: 5000 }).then(() => true, () => false);
const settle = app => app.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120)))));
async function setBar(A, bar) {
  await A.page.evaluate(next => window.__gfsStub.setBarre(next), bar);
  await waitEdge(A.app, bar ? EN[bar.bord] : null);
  await sleep(250);
  await settle(A.app);
}
async function resizeFrame(A, width, height) {
  await A.page.evaluate(([w, h]) => { const frame = document.querySelector('iframe[name="app"]'); frame.style.width = w + 'px'; frame.style.height = h + 'px'; }, [width, height]);
  await A.app.waitForFunction(([w, h]) => window.innerWidth === w && window.innerHeight === h, [width, height], { timeout: 5000 }).catch(() => {});
  await sleep(250);
  await settle(A.app);
}
// La pastille de la barre, posée par la page parente au-dessus du cadre : elle prend la souris comme la vraie barre. `place(bar)` la pose (ou la retire), `hits()` compte ce qu'elle a reçu.
async function standIn(A, bar) {
  await A.page.evaluate((zone) => {
    let box = document.getElementById('gfs-bar-stand-in');
    if (!zone) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'gfs-bar-stand-in';
      window.__barHits = 0;
      ['mousemove', 'mousedown', 'mouseup', 'click'].forEach(type => box.addEventListener(type, () => { window.__barHits += 1; }));
      document.body.append(box);
    }
    box.style.cssText = `position:fixed;left:${zone.x + 4}px;top:${zone.y + 4}px;width:${zone.largeur - 8}px;height:${zone.hauteur - 8}px;background:rgba(20,20,20,.92);border-radius:8px;z-index:2147483000`;
  }, bar ? bar.zone : null);
}
const barHits = page => page.evaluate(() => window.__barHits || 0);

function toolsOf(A) {
  const { page, app } = A;
  const centerOf = (selector, index = 0) => app.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const click = async (selector, index = 0, settleMs = 250) => {
    const c = await centerOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(settleMs);
  };
  const moveAt = async (x, y) => { await page.mouse.move(x, y, { steps: 3 }); await sleep(150); };
  const press = async (key, settleMs = 250) => { await page.keyboard.press(key); await sleep(settleMs); };
  return { click, moveAt, press, centerOf };
}

// Ce que la page montre des éléments de bord, dans le repère du cadre : la bande (sa boîte et ses commandes : miniatures, numéros, « Ajouter », « Importer »), le volet (sa boîte et ses commandes),
// la page de l'éditeur, la pastille du zoom et le ▶, les variables que posent les composants.
const measure = app => app.evaluate(() => {
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const visible = (el) => { if (!el || el.hidden) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const all = (root, selector) => (root ? Array.from(root.querySelectorAll(selector)).filter(visible).map(rect) : []);
  const strip = document.querySelector('.pp-slide-strip');
  const panel = document.querySelector('.pp-slide-import');
  const button = document.querySelector('.pp-slide-show-open');
  const container = document.getElementById('editor-container');
  const cs = getComputedStyle(container);
  const body = document.body.style;
  return {
    strip: visible(strip) ? rect(strip) : null,
    stripControls: all(strip, '.pp-slide-item, .pp-slide-num, .pp-slide-add'),
    panel: visible(panel) ? rect(panel) : null,
    panelControls: all(panel, '.pp-slide-import-head, .pp-slide-import-close, .pp-slide-import-field, .ss-trigger, .pp-slide-import-keep, .pp-slide-item'),
    sheet: rect(document.querySelector('#editor-container .v2-page-sheet')),
    container: rect(container),
    padding: { left: parseFloat(cs.paddingLeft), right: parseFloat(cs.paddingRight) },
    pill: rect(document.getElementById('pp-page-zoom')),
    pillShift: { x: document.getElementById('pp-page-zoom').style.getPropertyValue('--pp-gfs-shift-x'), y: document.getElementById('pp-page-zoom').style.getPropertyValue('--pp-gfs-shift-y') },
    play: visible(button) ? rect(button) : null,
    vars: { strip: body.getPropertyValue('--pp-slide-strip-bar'), panel: body.getPropertyValue('--pp-slide-import-bar') },
    frame: [window.innerWidth, window.innerHeight],
    edge: document.documentElement.getAttribute('data-gfs-bar'),
  };
});

const hideCalls = page => page.evaluate(() => window.__gfsStub.calls.filter(c => c.nom === 'barre.masquer').map(c => ({ args: c.args, id: c.id })));
async function open(A, id, slides) {
  await Promise.race([
    A.page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
    sleep(20000),
  ]);
  await A.app.waitForFunction(([n, count]) => {
    const strip = document.querySelector('.pp-slide-strip');
    return String(Templates.getCurrentId()) === String(n) && !!strip && !strip.hidden && document.querySelectorAll('.pp-slide-strip .pp-slide-item').length === count;
  }, [id, slides], { timeout: 15000 }).catch(() => {});
  await sleep(900);
  await settle(A.app);
}

// Ce que les commandes de la bande (`controls`) ont de recouvrant avec la zone de la barre `bar` : la liste des rectangles pris.
const covered = (controls, bar) => controls.filter(r => hits(r, bar)).map(showRect);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme) {
  const tag = `[${lang} ${colorScheme}] `;
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang, barre: null }, seed: SEED, lang, colorScheme });
  const { page, app } = A;
  const tools = toolsOf(A);
  await open(A, 7, 3);

  // La référence : sans barre (un GFS d'avant la consigne se comporte de même).
  const ref = await measure(app);
  check(tag + 'sans barre : la bande est montrée à gauche (à 0, sur la hauteur du document), la page entre elle et le bord droit, aucune variable de la barre posée',
    !!ref.strip && ref.strip.left === 0 && ref.vars.strip === '0px' && ref.edge === null && ref.sheet.left >= ref.strip.right && ref.pillShift.x === '' && ref.pillShift.y === '', ref);

  // 1) La barre à gauche, dès le contexte (le cadre est rechargé avec elle : le bord par défaut de GFS).
  console.log('\n' + tag + '1) La bande, la barre à gauche');
  const left = await barAt(page, 'gauche', 700, 400);
  await setBar(A, left);
  await standIn(A, left);
  const l = await measure(app);
  const depth = left.epaisseur;
  check(tag + 'la zone est celle de la consigne : 42 × 132 px à gauche, centrée (x 0, y 134), le cadre fait 700 × 400', same(left.zone, { x: 0, y: 134, largeur: 42, hauteur: 132 }) && same(l.frame, [700, 400]), { zone: left.zone, frame: l.frame });
  check(tag + 'barre à gauche : aucune miniature, aucun numéro, ni « Ajouter » ni « Importer » de la bande ne touche la zone', covered(l.stripControls, left).length === 0 && l.stripControls.length >= 5, { pris: covered(l.stripControls, left), controles: l.stripControls.length });
  check(tag + 'la barre tient dans la gouttière de la bande : la bande est toujours à 0, plus large de la profondeur de la barre, et la zone est entière dans sa boîte',
    l.strip.left === 0 && Math.abs(l.strip.width - (ref.strip.width + depth)) < 0.6 && zoneRect(left).right <= l.strip.left + depth + 0.1 && l.vars.strip === depth + 'px', { strip: showRect(l.strip), reference: showRect(ref.strip), vars: l.vars });
  check(tag + 'les miniatures sont décalées de la gouttière et gardent leur taille (la même largeur que sans barre)', l.stripControls.slice(0, 3).every((r, i) => Math.abs(r.width - ref.stripControls[i].width) < 0.6 && Math.abs(r.left - (ref.stripControls[i].left + depth)) < 0.6), { avant: ref.stripControls.slice(0, 3).map(showRect), apres: l.stripControls.slice(0, 3).map(showRect) });
  check(tag + 'la page laisse la même place à la bande élargie : le rembourrage gauche du document a grandi de la gouttière, et la feuille ne passe ni sous la bande ni sous la barre',
    Math.abs(l.padding.left - (ref.padding.left + depth)) < 0.6 && l.sheet.left >= l.strip.right - 0.5 && !hits(l.sheet, left), { avant: ref.padding.left, apres: l.padding.left, sheet: showRect(l.sheet), strip: showRect(l.strip) });
  check(tag + 'la pastille du zoom et le ▶ ne bougent pas (la barre est loin d\'eux) : ni décalage, ni zone touchée', l.pillShift.x === '' && l.pillShift.y === '' && !hits(l.pill, left) && !hits(l.play, left), { pill: showRect(l.pill), play: showRect(l.play) });
  // À la vraie souris : un balayage vertical de la bande, au milieu de la zone, ne passe sur la barre que là où il n'y a rien à cliquer.
  const probe = (x, y) => app.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    const found = el && el.closest('.pp-slide-item, .pp-slide-add, .pp-slide-num, .pp-slide-import-head, .pp-slide-import-field, .pp-slide-import-keep, button');
    return found ? String(found.className).split(/\s+/)[0] : null;
  }, [x, y]);
  const sweep = [];
  for (const y of [175, 232]) {
    for (let x = 0; x <= 170; x += 6) {
      const before = await barHits(page);
      await page.mouse.move(x, y);
      sweep.push({ x, y, bar: (await barHits(page)) > before, under: await probe(x, y) });
    }
  }
  const under = sweep.filter(p => p.bar && p.under);
  check(tag + 'à la vraie souris : deux balayages de la bande à hauteur de la barre (de 0 à 170 px, sur deux miniatures) ne passent jamais sur la barre là où se trouve une miniature ou un bouton', under.length === 0, under.slice(0, 5));
  check(tag + 'et les balayages sont sérieux : la barre a pris la souris sur sa largeur (' + sweep.filter(p => p.bar).length + ' points) et ils ont rencontré des miniatures (' + sweep.filter(p => !p.bar && p.under).length + ' points)', sweep.filter(p => p.bar).length >= 8 && sweep.filter(p => !p.bar && p.under).length >= 8, sweep.slice(0, 6));
  await tools.click('.pp-slide-strip .pp-slide-item', 1, 500);
  const at = await app.evaluate(() => { const s = SlideStrip.slidesOf(EditorCore.getEditor().state.doc); const from = EditorCore.getEditor().state.selection.from; return s.findIndex(x => from <= x.end); });
  check(tag + 'un clic (vraie souris) sur la miniature 2 mène à la diapositive 2', at === 1, { at });

  // 2) La barre change, la bande ouverte.
  console.log('\n' + tag + '2) La barre change');
  for (const edge of ['haut', 'droite', 'bas']) {
    const bar = await barAt(page, edge, 700, 400);
    await setBar(A, bar);
    await standIn(A, bar);
    const m = await measure(app);
    check(tag + `barre ${edge} : la bande est où elle était sans barre (au pixel près), la gouttière est rendue, la page aussi, rien de la bande sous la zone`,
      sameRect(m.strip, ref.strip) && m.vars.strip === '0px' && Math.abs(m.padding.left - ref.padding.left) < 0.6 && sameX(m.sheet, ref.sheet) && covered(m.stripControls, bar).length === 0, { strip: showRect(m.strip), reference: showRect(ref.strip), vars: m.vars, pris: covered(m.stripControls, bar) });
  }
  await standIn(A, null);
  await setBar(A, null);
  const none = await measure(app);
  check(tag + 'plus de barre (l\'explorateur de GFS) : la bande, la page et la pastille sont comme sans barre', sameRect(none.strip, ref.strip) && sameX(none.sheet, ref.sheet) && sameRect(none.pill, ref.pill) && sameRect(none.play, ref.play), { strip: showRect(none.strip), sheet: showRect(none.sheet) });
  await setBar(A, left);
  await standIn(A, left);
  const back = await measure(app);
  check(tag + 'la barre revient à gauche : la gouttière aussi, la même mise en page qu\'avant', sameRect(back.strip, l.strip) && sameX(back.sheet, l.sheet) && back.vars.strip === l.vars.strip, { strip: showRect(back.strip), sheet: showRect(back.sheet) });
  await standIn(A, null);

  // 3) Le volet « Importer », la barre à droite.
  console.log('\n' + tag + '3) Le volet « Importer », la barre à droite');
  const right = await barAt(page, 'droite', 700, 400);
  await setBar(A, right);
  await standIn(A, right);
  await tools.click('.pp-slide-import-open', 0, 700);
  await app.waitForFunction(() => { const p = document.querySelector('.pp-slide-import'); return !!p && !p.hidden && document.querySelectorAll('.pp-slide-import .pp-slide-item').length > 0; }, null, { timeout: 8000 }).catch(() => {});
  await sleep(500);
  await settle(app);
  const r = await measure(app);
  check(tag + 'le volet est ouvert (vraie souris) et montre ses miniatures', !!r.panel && r.panelControls.length >= 4, { panel: showRect(r.panel), controles: r.panelControls.length });
  check(tag + 'barre à droite : ni l\'en-tête, ni « Fermer », ni le choix de la source, ni la case, ni une miniature du volet ne touche la zone', covered(r.panelControls, right).length === 0, covered(r.panelControls, right));
  check(tag + 'la barre tient dans la gouttière du volet : le volet est élargi de ce qu\'elle en mord, la bande n\'a pas bougé (elle est à gauche)',
    r.vars.panel !== '0px' && parseFloat(r.vars.panel) > 0 && parseFloat(r.vars.panel) <= right.epaisseur + 0.1 && r.panel.right >= right.zone.x + 1 && sameRect(r.strip, ref.strip), { vars: r.vars, panel: showRect(r.panel), strip: showRect(r.strip) });
  check(tag + 'la page est entre la bande et le volet, sans toucher ni l\'un ni l\'autre ni la barre ; la pastille du zoom est à gauche du volet, hors de la zone',
    r.sheet.left >= r.strip.right - 0.5 && r.sheet.right <= r.panel.left + 0.5 && !hits(r.sheet, right) && r.pill.right <= r.panel.left + 0.5 && !hits(r.pill, right) && !hits(r.play, right), { sheet: showRect(r.sheet), panel: showRect(r.panel), pill: showRect(r.pill) });
  const sweepRight = [];
  for (const y of [175, 232]) {
    for (let x = 480; x <= 700; x += 6) {
      const before = await barHits(page);
      await page.mouse.move(x, y);
      sweepRight.push({ x, y, bar: (await barHits(page)) > before, under: await probe(x, y) });
    }
  }
  const underRight = sweepRight.filter(p => p.bar && p.under);
  check(tag + 'à la vraie souris : un balayage du volet à hauteur de la barre ne passe jamais sur la barre là où il y a une miniature ou un bouton', underRight.length === 0 && sweepRight.filter(p => p.bar).length >= 8 && sweepRight.filter(p => !p.bar && p.under).length >= 4, { sur: underRight.slice(0, 5), pris: sweepRight.filter(p => p.bar).length, miniatures: sweepRight.filter(p => !p.bar && p.under).length });
  await tools.click('.pp-slide-import-close', 0, 600);
  const closed = await measure(app);
  check(tag + '« Fermer » (vraie souris) : le volet part, sa gouttière aussi, la page revient où elle était', !closed.panel && closed.vars.panel === '' && closed.padding.right === ref.padding.right, { vars: closed.vars, padding: closed.padding, reference: ref.padding });
  await standIn(A, null);

  // 4) La pastille du zoom et le ▶, la barre en bas.
  console.log('\n' + tag + '4) La pastille du zoom et le ▶');
  await setBar(A, null);
  const open0 = async () => {
    const c = await tools.centerOf('#pp-page-zoom');
    await tools.moveAt(c.x, c.y);
    await sleep(200);
    const m = await measure(app);
    await tools.moveAt(300, 150);
    return m;
  };
  const bottom700 = await barAt(page, 'bas', 700, 400);
  await setBar(A, bottom700);
  await standIn(A, bottom700);
  const b = await measure(app);
  const bOpen = await open0();
  check(tag + 'barre en bas à 700 × 400 : la pastille et le ▶, au repos et ouverts, sont loin de la zone ; rien ne bouge (ni décalage, ni écart avec la référence sans barre)',
    !hits(b.pill, bottom700) && !hits(b.play, bottom700) && !hits(bOpen.pill, bottom700) && !hits(bOpen.play, bottom700) && b.pillShift.y === '' && sameRect(b.pill, ref.pill) && sameRect(b.play, ref.play), { pill: showRect(b.pill), open: showRect(bOpen.pill), zone: showRect(zoneRect(bottom700)) });
  await standIn(A, null);
  await resizeFrame(A, 460, 300);
  const bottom500 = await barAt(page, 'bas', 460, 300);
  await setBar(A, bottom500);
  await standIn(A, bottom500);
  const n = await measure(app);
  const nOpen = await open0();
  check(tag + '460 × 300, barre en bas : la pastille ouverte (survol) et le ▶ toucheraient la zone, ils montent ensemble : ni au repos ni ouverts ils ne la touchent',
    n.pillShift.y !== '' && !hits(n.pill, bottom500) && !hits(n.play, bottom500) && !hits(nOpen.pill, bottom500) && !hits(nOpen.play, bottom500), { pill: showRect(n.pill), open: showRect(nOpen.pill), play: showRect(nOpen.play), shift: n.pillShift, zone: showRect(zoneRect(bottom500)) });
  check(tag + 'ils restent ensemble, le ▶ à gauche de la pastille et sur sa ligne, dans le cadre, et la pastille n\'a pas bougé de côté (seulement montée)',
    n.play.right <= n.pill.left + 0.5 && n.pill.left - n.play.right <= 6 && Math.abs(n.play.bottom - n.pill.bottom) <= 1.5 && n.pill.bottom <= 300.5 && n.pill.top >= 0 && Math.abs(n.pill.right - nOpen.pill.right) < 0.6, { pill: showRect(n.pill), play: showRect(n.play) });
  check(tag + 'la pastille ne saute pas sous la souris : la même place au repos et ouverte (son bord droit et son bas ne bougent pas)', Math.abs(n.pill.bottom - nOpen.pill.bottom) < 0.6 && Math.abs(n.pill.right - nOpen.pill.right) < 0.6, { repos: showRect(n.pill), ouverte: showRect(nOpen.pill) });
  // Elle s'atteint à la vraie souris : le survol l'ouvre, un clic sur le pourcentage rend l'affichage d'origine.
  const hitsBefore = await barHits(page);
  const pc = await tools.centerOf('#pp-page-zoom');
  await tools.moveAt(pc.x, pc.y);
  const opened = await app.evaluate(() => document.getElementById('pp-page-zoom').getBoundingClientRect().width);
  await page.mouse.click(pc.x, pc.y);
  await sleep(200);
  check(tag + 'à la vraie souris : le survol de la pastille la déploie, un clic sur le pourcentage fonctionne, la barre n\'a rien reçu', opened > 60 && (await barHits(page)) === hitsBefore, { opened });
  await tools.moveAt(300, 120);
  await standIn(A, null);
  await resizeFrame(A, 700, 400);
  await setBar(A, bottom700);
  const again = await measure(app);
  check(tag + 'le cadre revient à 700 × 400 : la pastille et le ▶ redescendent à leur place d\'avant', again.pillShift.y === '' && sameRect(again.pill, ref.pill) && sameRect(again.play, ref.play), { pill: showRect(again.pill), reference: showRect(ref.pill) });
  // Barre à droite dans un cadre bas : la zone (y 24 à 156 à 180 de haut) touche la pastille d'un cadre de cette hauteur ; ils reculent d'autant.
  await resizeFrame(A, 700, 180);
  const right180 = await barAt(page, 'droite', 700, 180);
  await setBar(A, right180);
  await standIn(A, right180);
  const s = await measure(app);
  const sOpen = await open0();
  check(tag + '700 × 180, barre à droite : la pastille (au repos, ouverte) et le ▶ ne touchent pas la zone ; ils ont reculé vers la gauche de sa profondeur',
    !hits(s.pill, right180) && !hits(s.play, right180) && !hits(sOpen.pill, right180) && !hits(sOpen.play, right180) && s.pillShift.x !== '' && s.pillShift.y === '', { pill: showRect(s.pill), play: showRect(s.play), zone: showRect(zoneRect(right180)), shift: s.pillShift });
  await standIn(A, null);
  await resizeFrame(A, 700, 400);
  await setBar(A, left);
  await standIn(A, left);

  // 5) « Présenter ».
  console.log('\n' + tag + '5) « Présenter »');
  const calls0 = (await hideCalls(page)).length;
  const stripBefore = await measure(app);
  await tools.click('.pp-slide-show-open', 0, 300);
  await app.waitForFunction(() => { const c = document.querySelector('.pp-slide-show .pp-slide-show-counter'); return !!c && c.textContent !== ''; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(500);
  let calls = await hideCalls(page);
  const during = await measure(app);
  const barDuring = await app.evaluate(() => document.documentElement.getAttribute('data-gfs-bar'));
  check(tag + 'le ▶ (vraie souris) lance le diaporama et demande à GFS de masquer sa barre : un appel `barre.masquer { masquee: true }`, sans `id`, et la barre disparaît pour l\'app',
    calls.length === calls0 + 1 && same(calls[calls0].args, { masquee: true }) && calls[calls0].id === undefined && barDuring === null, { calls: calls.slice(calls0), barDuring });
  check(tag + 'pendant le diaporama la bande et la page ne bougent pas (pas de réajustement pour une barre masquée)', sameRect(during.strip, stripBefore.strip) && sameX(during.sheet, stripBefore.sheet) && during.vars.strip === stripBefore.vars.strip, { avant: showRect(stripBefore.strip), pendant: showRect(during.strip) });
  await tools.press('Escape', 500);
  calls = await hideCalls(page);
  const afterEsc = await measure(app);
  check(tag + 'Échap quitte le diaporama et rend la barre : un appel `barre.masquer { masquee: false }`, la barre est de retour, la bande est où elle était', calls.length === calls0 + 2 && same(calls[calls0 + 1].args, { masquee: false }) && afterEsc.edge === 'left' && sameRect(afterEsc.strip, stripBefore.strip) && sameX(afterEsc.sheet, stripBefore.sheet), { calls: calls.slice(calls0), edge: afterEsc.edge, strip: showRect(afterEsc.strip) });
  // F5 (depuis la première) et Maj+F5 (depuis la diapositive du curseur), puis « Quitter » à la vraie souris.
  await app.evaluate(() => { EditorCore.getEditor().commands.focus(); });
  await tools.press('F5', 400);
  await app.waitForFunction(() => { const c = document.querySelector('.pp-slide-show .pp-slide-show-counter'); return !!c && c.textContent !== ''; }, null, { timeout: 15000 }).catch(() => {});
  calls = await hideCalls(page);
  check(tag + 'F5 masque la barre aussi', calls.length === calls0 + 3 && same(calls[calls0 + 2].args, { masquee: true }), { calls: calls.slice(calls0) });
  await tools.moveAt(300, 300);
  await tools.moveAt(310, 310);
  await sleep(300);
  await tools.click('.pp-slide-show-exit', 0, 500);
  calls = await hideCalls(page);
  const gone = await app.evaluate(() => !document.querySelector('.pp-slide-show'));
  check(tag + '« Quitter » (vraie souris) rend la barre : le diaporama est fermé, un appel `masquee: false`, la barre est de retour', gone && calls.length === calls0 + 4 && same(calls[calls0 + 3].args, { masquee: false }) && (await app.evaluate(() => document.documentElement.getAttribute('data-gfs-bar'))) === 'left', { gone, calls: calls.slice(calls0) });
  // Jusqu'à l'écran de fin : le geste suivant quitte, la barre revient.
  await tools.press('Shift+F5', 400);
  await app.waitForFunction(() => { const c = document.querySelector('.pp-slide-show .pp-slide-show-counter'); return !!c && c.textContent !== ''; }, null, { timeout: 15000 }).catch(() => {});
  for (let i = 0; i < 6; i++) await tools.press('ArrowRight', 150);
  await sleep(300);
  const goneAtEnd = await app.evaluate(() => !document.querySelector('.pp-slide-show'));
  calls = await hideCalls(page);
  check(tag + 'après la dernière diapositive, l\'écran de fin puis le geste qui quitte rendent la barre aussi', goneAtEnd && calls.length === calls0 + 6 && same(calls[calls0 + 4].args, { masquee: true }) && same(calls[calls0 + 5].args, { masquee: false }), { goneAtEnd, calls: calls.slice(calls0) });
  const final = await measure(app);
  check(tag + 'à la sortie de chaque diaporama la bande et la page sont où elles étaient avec la barre à gauche', sameRect(final.strip, l.strip) && sameX(final.sheet, l.sheet), { strip: showRect(final.strip), sheet: showRect(final.sheet) });
  await standIn(A, null);
  check(tag + 'aucune boîte native', A.natives.length === 0, A.natives);
  await A.context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function runOld() {
  console.log('\nUn GFS d\'avant la consigne 025');
  // Un GFS d'avant : le contexte n'a pas de `barre`, l'appel `barre.masquer` lui est inconnu (le diaporama part et se ferme comme avant). La page seule n'a pas de présentation à montrer.
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE }, seed: SEED, lang: 'fr', colorScheme: 'light' });
  const tools = toolsOf(A);
  await open(A, 7, 3);
  const m = await measure(A.app);
  check('un GFS d\'avant la consigne : la bande et la pastille sont à leur place d\'origine (aucune gouttière, aucun décalage)', !!m.strip && m.strip.left === 0 && m.vars.strip === '0px' && m.edge === null && m.pillShift.x === '' && m.pillShift.y === '', m);
  await tools.click('.pp-slide-show-open', 0, 300);
  await A.app.waitForFunction(() => { const c = document.querySelector('.pp-slide-show .pp-slide-show-counter'); return !!c && c.textContent !== ''; }, null, { timeout: 15000 }).catch(() => {});
  const running = await A.app.evaluate(() => !!document.querySelector('.pp-slide-show'));
  await tools.press('Escape', 500);
  const stopped = await A.app.evaluate(() => !document.querySelector('.pp-slide-show'));
  const calls = await hideCalls(A.page);
  check('un GFS d\'avant la consigne : le diaporama part et se ferme comme avant ; les appels `barre.masquer` partent (sans `id`) et il les ignore, sans erreur', running && stopped && calls.length === 2 && calls.every(c => c.id === undefined), { running, stopped, calls });
  await A.context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await runOld();
await t.finish();
