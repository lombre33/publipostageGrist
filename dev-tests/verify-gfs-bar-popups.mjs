#!/usr/bin/env node
// Les listes de choix, les bulles et les panneaux flottants de l'app laissent libre la zone de la barre de GFS (consigne GFS 025, deuxième lot, « les composants sans fil » ; les fenêtres, les menus de la barre d'outils
// et leurs info-bulles sont à dev-tests/verify-gfs-bar-fit.mjs). GFS pose sa barre PAR-DESSUS le cadre de l'app, au bord que la personne a choisi, et la zone à laisser libre fait 42 × 132 px (marge de 4 px comprise).
// Ici, 700x400 (le panneau de Grist) dans le cadre isolé de GFS que porte une page parente qui joue GFS (dev-tests/gfs-stub.js) ; la barre ne se dessine pas, on mesure ce que l'app laisse libre : aucune partie d'un
// composant ne recouvre la zone, il reste dans le cadre et près de ce qui l'ouvre, et sans barre il est où il était.
//  1) LES BARRES FLOTTANTES (EditorCore.createFloatingPanel, floating-ui) : celle d'un tableau et celle d'une image (à gauche puis à droite de la page), ouvertes par un clic, sans barre puis aux quatre bords.
//  2) LES PANNEAUX de la barre d'outils (liste des polices, des tailles, menu de couleur du texte), ouverts au clic sur leur bouton : même contrôle ; un panneau qui défile montre sa dernière ligne à la molette.
//  3) LA LISTE DES MODÈLES du titre (js/template-tree-select.js), ouverte au clic : même contrôle ; sa dernière ligne se rejoint à la molette.
//  4) LES POPUPS POSÉS PAR ViewportFit.placePopup (liste #Variable, commentaires, note de bas de page, image depuis une variable), les barres flottantes de floating-ui et les listes de js/search-select.js, ancrés
//     en des points choisis autour de la zone (dessous, au-dessus, à côté) : aucun ne la recouvre, tous restent dans le cadre et près de leur ancre, un grand défile et se plafonne au-dessus d'une barre en bas.
//  5) LA BARRE CHANGE, COMPOSANT OUVERT : la personne déplace la barre (gauche → haut → droite → bas) puis l'explorateur de GFS l'ôte ; le composant ouvert se recale tout seul et, la barre partie, est où il était.
//  6) L'INFO-BULLE D'UN LIEN (js/link-dialog.js) : un lien au centre, tout en bas de l'écran, puis un lien à droite, à mi-hauteur : l'info-bulle ne recouvre pas la zone (au-dessus du lien sous une barre en bas).
//  7) UN CADRE BAS (700 × 260) : les listes, panneaux et popups posés restent hors de la zone et dans le cadre.
//  8) L'OUTIL COMMUN GfsBar.settle (js/gfs-bar.js) : pour une grille de rectangles dans le cadre, aux quatre bords et dans deux hauteurs de cadre, le déplacement ou le plafond qu'il rend laisse la zone libre sans sortir du cadre ;
//     sans recouvrement ou sans barre, il ne demande rien.
//  9) UN CADRE ÉTROIT (560 × 300) : la barre flottante d'un tableau (552 px) passe sur deux lignes plutôt que sous la barre de GFS, à gauche comme à droite ; à 700 × 400 elle reste sur une ligne.
// 10) LA BULLE DE TAILLE d'un glissé de colonne (js/grid-editor.js) : la souris tire la poignée d'une colonne jusque sur la zone de la barre, la bulle qui la suit ne la recouvre pas ; sans barre, elle est à 14 px de la souris, comme avant.
// GFS_BAR_POPUPS_ONLY=1,3 ne joue que ces scénarios (mise au point) ; GFS_BAR_POPUPS_VERBOSE=1 écrit les rectangles mesurés ; rien d'écrit sinon. Lancé par run-headless.mjs (groupe Node « gfsBarPopups », cf. NODE_SCRIPTS),
// ou seul : node dev-tests/verify-gfs-bar-popups.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-gfs-bar-popups', port: Number(process.env.GFS_BAR_POPUPS_PORT || 8960) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SEED = seedModels();
const ONLY = (process.env.GFS_BAR_POPUPS_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const wanted = n => ONLY.length === 0 || ONLY.includes(String(n));
const VERBOSE = !!process.env.GFS_BAR_POPUPS_VERBOSE;

const EDGES = ['gauche', 'haut', 'droite', 'bas'];
const EN = { gauche: 'left', haut: 'top', droite: 'right', bas: 'bottom' };
const FRAME = [700, 400];
const LOW = [700, 260];
const NARROW = [560, 300];
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC';
const round = n => Math.round(n * 10) / 10;
const sameRect = (a, b) => ['left', 'top', 'right', 'bottom'].every(k => Math.abs(a[k] - b[k]) < 0.6);
const showRect = r => [r.left, r.top, r.right, r.bottom].map(round).join(', ');
const where = bord => (bord === null ? 'sans barre' : `barre ${bord}`);
const inFrame = (r, [w, h]) => r.left >= -0.5 && r.top >= -0.5 && r.right <= w + 0.5 && r.bottom <= h + 0.5;
const gapBetween = (a, b) => Math.max(0, a.left - b.right, b.left - a.right, a.top - b.bottom, b.top - a.bottom);

const barOf = (page, bord, width, height) => (bord === null ? null : page.evaluate(([b, w, h]) => window.__gfsStub.zoneDe(b, w, h), [bord, width, height]));
// GFS montre cette barre : l'événement `barre` part, le cadre le recopie dans <html data-gfs-bar> (ou le retire).
async function showBar(page, app, bord, [width, height]) {
  const bar = await barOf(page, bord, width, height);
  await page.evaluate(next => window.__gfsStub.setBarre(next), bar);
  await app.waitForFunction(want => document.documentElement.getAttribute('data-gfs-bar') === want, bord === null ? null : EN[bord], { timeout: 5000 });
  await sleep(120);
  return bar;
}
// Le rectangle recouvre-t-il la zone ? (un pixel au moins ; au centième de pixel près, la mise en page arrondit au 64e)
function hits(rect, bar) {
  if (!bar) return false;
  const z = bar.zone;
  const E = 0.02;
  return rect.left < z.x + z.largeur - E && rect.right > z.x + E && rect.top < z.y + z.hauteur - E && rect.bottom > z.y + E;
}
const center = (app, selector) => app.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);
const rectOf = (app, selector) => app.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null; }, selector);
const rectsOf = (app, selector) => app.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }).filter(r => r.right > r.left && r.bottom > r.top), selector);
// Referme ce qui est ouvert : Échap, un clic dans la marge grise à gauche de la feuille (hors du texte et des barres), et un document vide.
async function closeAll({ page, app }, [, height]) {
  await page.keyboard.press('Escape');
  await sleep(80);
  await page.mouse.click(5, height - 30);
  await sleep(150);
  await app.evaluate(() => { Editor.setHTML('<p></p>'); });
  await sleep(150);
}
// Le contrôle commun d'un composant posé : hors de la zone, dans le cadre ; `anchor` (facultatif) : près de ce qui l'ouvre ; `base` (facultatif) : où le même composant se posait sans barre - floating-ui ne ramène pas un
// panneau dans le cadre en hauteur (celui de 272 px à mi-hauteur d'un cadre de 400 en sort par le haut, barre ou pas) : s'il en sortait sans barre, il n'en sort pas plus avec elle.
const overflowOf = (r, [w, h]) => Math.max(0, -r.left, -r.top, r.right - w, r.bottom - h);
function judgeBox(label, r, bar, frame, anchor, base) {
  check(`${label} : ne recouvre pas la zone de la barre`, !hits(r, bar), { rect: showRect(r), zone: bar && bar.zone });
  if (!base || inFrame(base, frame)) check(`${label} : reste dans le cadre`, inFrame(r, frame), { rect: showRect(r) });
  else check(`${label} : sortait déjà du cadre sans barre, il n'en sort pas plus avec elle`, overflowOf(r, frame) <= overflowOf(base, frame) + 0.5, { rect: showRect(r), sansBarre: showRect(base) });
  if (anchor) check(`${label} : reste près de ce qui l'ouvre`, gapBetween(r, anchor) <= 90, { rect: showRect(r), ancre: showRect(anchor) });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 1) Les barres flottantes d'un tableau et d'une image.
const TABLE_HTML = '<table><tbody><tr><td><p>A1</p></td><td><p>B1</p></td></tr><tr><td><p>A2</p></td><td><p>B2</p></td></tr></tbody></table><p>suite</p>';
const imageHtml = align => `<p style="text-align:${align}"><img class="editor-image" src="data:image/png;base64,${PNG}" style="width:80px"></p><p>suite</p>`;
const TOOLBARS = [
  { name: 'la barre d\'un tableau', html: TABLE_HTML, target: '.tiptap td', toolbar: '.v2-floating-toolbar.v2-table-toolbar.visible' },
  { name: 'la barre d\'une image à gauche de la page', html: imageHtml('left'), target: '.tiptap img', toolbar: '.v2-floating-toolbar.visible' },
  { name: 'la barre d\'une image à droite de la page', html: imageHtml('right'), target: '.tiptap img', toolbar: '.v2-floating-toolbar.visible' },
];
async function openToolbar(ctx, tool) {
  const { page, app } = ctx;
  await app.evaluate((html) => { Editor.setHTML(html); }, tool.html);
  await sleep(600);
  const at = await center(app, tool.target);
  await page.mouse.click(at.x, at.y);
  await sleep(600);
  return { toolbars: await rectsOf(app, tool.toolbar), target: await rectOf(app, tool.target) };
}

async function runToolbars(ctx, frame, tag) {
  const { page, app } = ctx;
  for (const tool of TOOLBARS) {
    let first = null;
    for (const bord of [null, ...EDGES, null]) {
      const bar = await showBar(page, app, bord, frame);
      const m = await openToolbar(ctx, tool);
      const label = `${tag}${tool.name}, ${where(bord)}`;
      check(`${label} : la barre flottante s'ouvre au clic`, m.toolbars.length >= 1, m.toolbars.length);
      m.toolbars.forEach((r, i) => { if (VERBOSE) console.log('     ', label, i, showRect(r)); judgeBox(`${label} (${i + 1})`, r, bar, frame, m.target); });
      if (bord === null) {
        if (first === null) first = m.toolbars;
        else check(`${label} : la barre retirée, la barre flottante est où elle était`, m.toolbars.length === first.length && m.toolbars.every((r, i) => sameRect(r, first[i])), { maintenant: m.toolbars.map(showRect), avant: first.map(showRect) });
      }
      await closeAll(ctx, frame);
    }
  }
}

if (wanted(1)) {
  console.log('\n1) Les barres flottantes d\'un tableau et d\'une image, 700 × 400');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
  await runToolbars(ctx, FRAME, '');
  await ctx.page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 2) Les panneaux de la barre d'outils.
const PANELS = [
  { name: 'la liste des polices', opener: '#v2-font-chip', panel: '.v2-format-panel.visible' },
  { name: 'la liste des tailles', opener: '#v2-size-chip-val', panel: '.v2-format-panel.visible' },
  { name: 'le menu de couleur du texte', opener: '#v2-btn-text-color-caret', panel: '.v2-color-dropdown.visible' },
];
// L'état d'une liste ouverte (panneau, popup) : son rectangle, de quoi la faire défiler, la dernière ligne qu'elle montre.
const listState = (app, selector) => app.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const rows = Array.from(el.querySelectorAll('button, [role="treeitem"], .tts-row, li')).filter(row => row.getBoundingClientRect().height > 0);
  const last = rows.length ? rows[rows.length - 1] : null;
  const lr = last ? last.getBoundingClientRect() : null;
  return {
    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, scrolls: el.scrollHeight > el.clientHeight + 1, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
    capped: el.classList.contains('pp-bar-capped'), last: lr ? { left: lr.left, top: lr.top, right: lr.right, bottom: lr.bottom } : null,
  };
}, selector);
// Fait défiler la liste à la molette jusqu'en bas et rend l'état d'après : la dernière ligne doit y être entière.
async function wheelToEnd({ page, app }, selector) {
  const s = await listState(app, selector);
  if (!s || !s.scrolls) return s;
  await page.mouse.move((s.rect.left + s.rect.right) / 2, (s.rect.top + s.rect.bottom) / 2);
  for (let i = 0; i < 8; i += 1) { await page.mouse.wheel(0, 400); await sleep(60); }
  await sleep(120);
  return listState(app, selector);
}
function judgeList(label, s, ended, bar, frame, anchor, base) {
  judgeBox(label, s.rect, bar, frame, anchor, base);
  if (s.scrolls && ended && inFrame(s.rect, frame)) check(`${label} : défile à la molette jusqu'à sa dernière ligne, entière et hors de la zone`, ended.last && ended.last.bottom <= ended.rect.bottom + 1 && ended.last.top >= ended.rect.top - 1 && !hits(ended.last, bar), { fin: ended.last && showRect(ended.last), liste: showRect(ended.rect) });
}

async function runPanels(ctx, frame, tag) {
  const { page, app } = ctx;
  for (const panel of PANELS) {
    let first = null;
    for (const bord of [null, ...EDGES, null]) {
      const bar = await showBar(page, app, bord, frame);
      await app.evaluate(() => { Editor.setHTML('<p>Bonjour</p>'); });
      await sleep(300);
      const at = await center(app, panel.opener);
      const opener = await rectOf(app, panel.opener);
      await page.mouse.click(at.x, at.y);
      await sleep(500);
      const s = await listState(app, panel.panel);
      const label = `${tag}${panel.name}, ${where(bord)}`;
      check(`${label} : le panneau s'ouvre au clic`, !!s);
      if (s) {
        if (VERBOSE) console.log('     ', label, showRect(s.rect), s.capped ? 'plafonné' : '');
        const ended = await wheelToEnd(ctx, panel.panel);
        if (bord === null && first === null) first = s.rect;
        judgeList(label, s, ended, bar, frame, opener, first);
        if (bord === null) {
          if (first !== s.rect) check(`${label} : la barre retirée, le panneau est où il était`, sameRect(s.rect, first) && !s.capped, { maintenant: showRect(s.rect), avant: first && showRect(first) });
        }
      }
      await closeAll(ctx, frame);
    }
  }
}

if (wanted(2)) {
  console.log('\n2) Les panneaux de la barre d\'outils, 700 × 400');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
  await runPanels(ctx, FRAME, '');
  await ctx.page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 3) La liste des modèles du titre.
async function runTitleList(ctx, frame, tag) {
  const { page, app } = ctx;
  let first = null;
  for (const bord of [null, ...EDGES, null]) {
    const bar = await showBar(page, app, bord, frame);
    const opener = await rectOf(app, '.tts-trigger');
    const at = await center(app, '.tts-trigger');
    await page.mouse.click(at.x, at.y);
    await sleep(500);
    const s = await listState(app, '.tts-popup.is-open');
    const label = `${tag}la liste des modèles du titre, ${where(bord)}`;
    check(`${label} : la liste s'ouvre au clic`, !!s);
    if (s) {
      if (VERBOSE) console.log('     ', label, showRect(s.rect), s.capped ? 'plafonnée' : '');
      const ended = await wheelToEnd(ctx, '.tts-popup.is-open');
      if (bord === null && first === null) first = s.rect;
      judgeList(label, s, ended, bar, frame, opener, first);
      if (bord === null) {
        if (first !== s.rect) check(`${label} : la barre retirée, la liste est où elle était`, sameRect(s.rect, first) && !s.capped, { maintenant: showRect(s.rect), avant: first && showRect(first) });
      }
    }
    await closeAll(ctx, frame);
  }
}

if (wanted(3)) {
  console.log('\n3) La liste des modèles du titre, 700 × 400');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
  await runTitleList(ctx, FRAME, '');
  await ctx.page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 4) Des composants posés en des points choisis autour de la zone : les popups de placePopup, les barres et panneaux de floating-ui, les listes de SearchSelect.
// Les ancres : (nom, rectangle) autour de la zone, pour chaque bord. Une ancre « sous la barre » n'est pas atteignable chez GFS, mais le composant doit tenir quand même ; les autres sont à côté.
function anchorsFor(bar, [w]) {
  const z = bar.zone;
  const cx = z.x + z.largeur / 2;
  const cy = z.y + z.hauteur / 2;
  const box = (left, top, ww = 60, hh = 24) => ({ left, top, right: left + ww, bottom: top + hh });
  if (bar.bord === 'gauche') return [['sous la barre', box(8, cy - 12)], ['au-dessus de la zone', box(8, z.y - 40)], ['sous la zone', box(8, z.y + z.hauteur + 6)]];
  if (bar.bord === 'droite') return [['sous la barre', box(w - 68, cy - 12)], ['au-dessus de la zone', box(w - 68, z.y - 40)], ['sous la zone', box(w - 68, z.y + z.hauteur + 6)]];
  if (bar.bord === 'haut') return [['sous la barre', box(cx - 30, 8)], ['à gauche de la zone', box(z.x - 70, 8)], ['à droite de la zone', box(z.x + z.largeur + 10, 8)]];
  return [['sur la barre', box(cx - 30, z.y + 6)], ['juste au-dessus', box(cx - 30, z.y - 30)], ['à gauche de la zone', box(z.x - 70, z.y - 30)], ['à droite de la zone', box(z.x + z.largeur + 10, z.y - 30)]];
}
// Les ancres d'un point fixe, quel que soit le bord (pour le scénario où la barre change composant ouvert) : une à gauche, une à droite, une au centre.
// Le champ de SearchSelect (160 px) part de l'ancre ; près du bord droit du cadre, il est ramené dedans pour qu'on puisse cliquer dessus.
const fieldAt = (anchor, [width]) => { const left = Math.min(anchor.left, width - 8 - 160); return { left, top: anchor.top, right: left + 160, bottom: anchor.bottom }; };
const FIXED_ANCHORS = [['à gauche', { left: 8, top: 190, right: 68, bottom: 214 }], ['à droite', { left: 632, top: 190, right: 692, bottom: 214 }], ['au centre, bas', { left: 320, top: 300, right: 380, bottom: 324 }]];

// Installe dans le cadre de l'app de quoi poser des composants de test : une ancre visible, un popup de placePopup, une barre ou un panneau de floating-ui, une liste de SearchSelect.
const installProbe = app => app.evaluate(() => {
  const probe = window.__probe = {};
  const rows = (n, tag) => Array.from({ length: n }, (_, i) => `<button type="button" data-action="x${i}" style="display:block;width:100%;height:26px;box-sizing:border-box">${tag} ${i + 1}</button>`).join('');
  probe.reset = () => {
    if (probe.panel) { probe.panel.hide(); probe.panel.el.remove(); probe.panel = null; }
    document.querySelectorAll('.pp-probe').forEach(el => el.remove());
  };
  probe.anchor = (r) => {
    const a = document.createElement('div');
    a.className = 'pp-probe';
    a.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.right - r.left}px;height:${r.bottom - r.top}px;box-sizing:border-box;border:1px solid #789;background:#cde;z-index:1`;
    document.body.appendChild(a);
    return a;
  };
  const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  probe.popup = (r, h) => {
    probe.reset();
    probe.anchor(r);
    const box = document.createElement('div');
    box.className = 'pp-probe pp-probe-popup';
    box.style.cssText = `width:220px;height:${h}px;background:#fff;border:1px solid #889;box-sizing:border-box;overflow-y:auto`;
    box.innerHTML = rows(30, 'Ligne');
    document.body.appendChild(box);
    ViewportFit.placePopup(box, r, { gap: 4 });
    return rect(box);
  };
  probe.floating = (r, kind) => {
    probe.reset();
    const a = probe.anchor(r);
    probe.panel = kind === 'toolbar'
      ? EditorCore.createFloatingPanel('pp-probe v2-floating-toolbar', rows(5, 'Bouton').replace(/display:block;width:100%/g, 'display:inline-block;width:60px'), () => {})
      : EditorCore.createFloatingPanel('pp-probe v2-format-panel', rows(30, 'Ligne'), () => {});
    probe.panel.show(a);
    return a;
  };
  probe.select = (r) => {
    probe.reset();
    const host = document.createElement('div');
    host.className = 'pp-probe';
    host.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.right - r.left}px;z-index:1`;
    host.innerHTML = '<select>' + Array.from({ length: 30 }, (_, i) => `<option value="v${i}">Colonne ${i + 1}</option>`).join('') + '</select>';
    document.body.appendChild(host);
    SearchSelect.attach(host.querySelector('select'), {});
    const trigger = host.querySelector('.ss-trigger');
    const tr = trigger.getBoundingClientRect();
    return { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2, rect: { left: tr.left, top: tr.top, right: tr.right, bottom: tr.bottom } };
  };
});

// Pose chaque sorte de composant à `anchor`, l'un après l'autre, et rend ce qu'on en mesure : le popup de placePopup (une fois par hauteur), le panneau et la barre de floating-ui, la liste de SearchSelect ouverte à la
// vraie souris ; une liste qui défile est menée à la molette jusqu'à sa dernière ligne (sauf si elle n'est pas toute dans le cadre : la molette ne l'atteint pas).
async function placeAll(ctx, anchor, frame, sizes) {
  const { page, app } = ctx;
  const out = { popups: {} };
  // Le pointeur dans la marge (hors des menus qui s'ouvrent au survol de la barre d'outils : ils recouvriraient le champ qu'on clique) avant de poser quoi que ce soit.
  await page.keyboard.press('Escape');
  await page.mouse.move(5, frame[1] - 30);
  await sleep(250);
  for (const [sizeName, h] of sizes) out.popups[sizeName] = await app.evaluate(([a, height]) => window.__probe.popup(a, height), [anchor, h]);
  await app.evaluate(([a]) => { window.__probe.floating(a, 'panel'); }, [anchor]);
  await sleep(350);
  const panel = await listState(app, '.pp-probe.v2-format-panel.visible');
  out.panel = panel && panel.rect;
  out.panelEnd = panel && panel.scrolls && inFrame(panel.rect, frame) ? await wheelToEnd(ctx, '.pp-probe.v2-format-panel.visible') : null;
  await page.mouse.move(5, frame[1] - 30);
  await app.evaluate(([a]) => { window.__probe.floating(a, 'toolbar'); }, [anchor]);
  await sleep(350);
  out.toolbar = await rectOf(app, '.pp-probe.v2-floating-toolbar.visible');
  const trig = await app.evaluate(([a]) => window.__probe.select(a), [fieldAt(anchor, frame)]);
  out.hit = await app.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName}.${String(el.className).slice(0, 40)}` : null; }, [trig.x, trig.y]);
  await page.mouse.click(trig.x, trig.y);
  await sleep(400);
  out.field = trig.rect;
  const select = await listState(app, '.pp-probe .ss-panel:not([hidden])');
  out.select = select && select.rect;
  out.selectEnd = select && inFrame(select.rect, frame) ? await wheelToEnd(ctx, '.pp-probe .ss-panel:not([hidden]) .ss-list') : null;
  await page.keyboard.press('Escape');
  await sleep(100);
  await app.evaluate(() => window.__probe.reset());
  return out;
}

async function runProbes(ctx, frame, tag, sizes) {
  const { page, app } = ctx;
  await installProbe(app);
  const bars = {};
  for (const bord of EDGES) bars[bord] = await barOf(page, bord, frame[0], frame[1]);
  // Sans barre d'abord, à chaque ancre (la même revient d'un bord à l'autre : une seule mesure) : ni floating-ui pour un panneau de 272 px, ni SearchSelect dont la liste a 120 px au moins ne se ramènent dans un cadre
  // trop bas ; ce qui sortait sans barre ne doit pas sortir davantage avec elle.
  await showBar(page, app, null, frame);
  const base = new Map();
  for (const bord of EDGES) {
    for (const [, anchor] of anchorsFor(bars[bord], frame)) {
      const key = showRect(anchor);
      if (!base.has(key)) base.set(key, await placeAll(ctx, anchor, frame, sizes));
    }
  }
  check(`${tag}sans barre, les ${base.size} ancres ouvrent leur panneau, leur barre flottante et leur liste`, Array.from(base.values()).every(m => m.panel && m.toolbar && m.select), Array.from(base.entries()).filter(([, m]) => !(m.panel && m.toolbar && m.select)).map(([k, m]) => [k, !!m.panel, !!m.toolbar, !!m.select, m.hit]));
  for (const bord of EDGES) {
    const bar = await showBar(page, app, bord, frame);
    for (const [place, anchor] of anchorsFor(bar, frame)) {
      const label = `${tag}${bord === 'gauche' ? 'barre gauche' : `barre ${bord}`}, ancre ${place}`;
      const was = base.get(showRect(anchor));
      const now = await placeAll(ctx, anchor, frame, sizes);
      for (const [sizeName] of sizes) {
        if (VERBOSE) console.log('     ', `${label}, popup ${sizeName}`, showRect(now.popups[sizeName]));
        judgeBox(`placePopup, ${label}, popup ${sizeName}`, now.popups[sizeName], bar, frame, anchor, was.popups[sizeName]);
      }
      check(`floating-ui, ${label} : le panneau est ouvert`, !!now.panel);
      if (now.panel) {
        if (VERBOSE) console.log('     ', `${label}, panneau`, showRect(now.panel));
        judgeBox(`floating-ui (panneau), ${label}`, now.panel, bar, frame, anchor, was.panel);
        if (now.panelEnd) check(`floating-ui (panneau), ${label} : défile à la molette jusqu'à sa dernière ligne, entière et hors de la zone`, now.panelEnd.last && now.panelEnd.last.bottom <= now.panelEnd.rect.bottom + 1 && now.panelEnd.last.top >= now.panelEnd.rect.top - 1 && !hits(now.panelEnd.last, bar), { fin: now.panelEnd.last && showRect(now.panelEnd.last), panneau: showRect(now.panelEnd.rect) });
      }
      check(`floating-ui, ${label} : la barre flottante est ouverte`, !!now.toolbar);
      if (now.toolbar) judgeBox(`floating-ui (barre), ${label}`, now.toolbar, bar, frame, anchor, was.toolbar);
      check(`SearchSelect, ${label} : la liste s'ouvre au clic`, !!now.select, { cliqué: now.hit, champ: showRect(now.field) });
      if (now.select) {
        judgeBox(`SearchSelect, ${label}`, now.select, bar, frame, now.field, was.select);
        // La liste (`ul.ss-list`) est ce qui défile dans le panneau : sa dernière ligne se rejoint à la molette, entière, au-dessus de la zone si la barre est en bas.
        if (now.selectEnd) check(`SearchSelect, ${label} : sa dernière ligne se rejoint à la molette, entière et hors de la zone`, !!now.selectEnd.last && now.selectEnd.last.bottom <= now.select.bottom + 1 && now.selectEnd.last.top >= now.select.top - 1 && !hits(now.selectEnd.last, bar), { fin: now.selectEnd.last && showRect(now.selectEnd.last), panneau: showRect(now.select) });
      }
    }
  }
  await showBar(page, app, null, frame);
}

if (wanted(4)) {
  console.log('\n4) Des composants posés autour de la zone, 700 × 400');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
  await runProbes(ctx, FRAME, '', [['court', 150], ['haut', 300]]);
  await ctx.page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 5) La barre change, composant ouvert.
async function followBar(ctx, frame, label, measure, opts = {}) {
  const { page, app } = ctx;
  await showBar(page, app, null, frame);
  const base = await measure();
  check(`${label} : ouvert sans barre`, !!base);
  if (!base) return;
  for (const bord of EDGES) {
    const bar = await showBar(page, app, bord, frame);
    await sleep(350);
    const r = await measure();
    check(`${label}, la barre passe ${bord} : le composant reste ouvert`, !!r);
    if (r) judgeBox(`${label}, la barre passe ${bord}`, r, bar, frame, opts.anchor, base);
  }
  await showBar(page, app, null, frame);
  await sleep(350);
  const back = await measure();
  check(`${label}, la barre part : le composant est où il était`, !!back && sameRect(back, base), { maintenant: back && showRect(back), avant: showRect(base) });
}

if (wanted(5)) {
  console.log('\n5) La barre change, composant ouvert, 700 × 400');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
  const { page, app } = ctx;
  await installProbe(app);
  // La liste des modèles du titre (recouvre la zone à gauche et en haut), le panneau de taille (en bas), le menu de couleur (à droite), la barre d'une image (à gauche).
  await showBar(page, app, null, FRAME);
  let at = await center(app, '.tts-trigger');
  await page.mouse.click(at.x, at.y);
  await sleep(500);
  await followBar(ctx, FRAME, 'la liste des modèles du titre', async () => (await listState(app, '.tts-popup.is-open') || {}).rect || null);
  await closeAll(ctx, FRAME);
  for (const [name, opener, selector] of [['le panneau des tailles', '#v2-size-chip-val', '.v2-format-panel.visible'], ['le menu de couleur du texte', '#v2-btn-text-color-caret', '.v2-color-dropdown.visible']]) {
    await app.evaluate(() => { Editor.setHTML('<p>Bonjour</p>'); });
    await sleep(300);
    at = await center(app, opener);
    await page.mouse.click(at.x, at.y);
    await sleep(500);
    await followBar(ctx, FRAME, name, () => rectOf(app, selector));
    await closeAll(ctx, FRAME);
  }
  await app.evaluate((html) => { Editor.setHTML(html); }, imageHtml('left'));
  await sleep(600);
  at = await center(app, '.tiptap img');
  await page.mouse.click(at.x, at.y);
  await sleep(600);
  await followBar(ctx, FRAME, 'la barre d\'une image', () => rectOf(app, '.v2-floating-toolbar.visible'));
  await closeAll(ctx, FRAME);
  // Un popup de placePopup, une barre et un panneau de floating-ui, une liste de SearchSelect, posés à gauche : ils suivent la barre et reviennent.
  for (const [anchorName, anchor] of FIXED_ANCHORS) {
    await showBar(page, app, null, FRAME);
    await app.evaluate(([a]) => { window.__probe.popup(a, 300); }, [anchor]);
    await followBar(ctx, FRAME, `un popup de placePopup (ancre ${anchorName})`, () => rectOf(app, '.pp-probe-popup'), { anchor });
    await app.evaluate(([a]) => { window.__probe.floating(a, 'panel'); }, [anchor]);
    await sleep(350);
    await followBar(ctx, FRAME, `un panneau de floating-ui (ancre ${anchorName})`, () => rectOf(app, '.pp-probe.v2-format-panel.visible'), { anchor });
    const trig = await app.evaluate(([a]) => window.__probe.select(a), [fieldAt(anchor, FRAME)]);
    await page.mouse.click(trig.x, trig.y);
    await sleep(400);
    await followBar(ctx, FRAME, `une liste de SearchSelect (ancre ${anchorName})`, () => rectOf(app, '.pp-probe .ss-panel:not([hidden])'), { anchor: trig.rect });
    await page.keyboard.press('Escape');
    await app.evaluate(() => window.__probe.reset());
  }
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 6) L'info-bulle d'un lien.
const LINK_HTML = '<p>ligne</p>'.repeat(18) + '<p style="text-align:center"><a href="https://exemple.org/page">lien au centre</a></p>' + '<p style="text-align:right"><a href="https://exemple.org/droite">lien à droite</a></p>' + '<p>ligne</p>'.repeat(18);
// Fait défiler la feuille pour que le lien `which` (0 : au centre, 1 : à droite) soit à la hauteur `y` du cadre.
const bringLinkTo = (app, which, y) => app.evaluate(([n, want]) => {
  const el = document.querySelectorAll('.tiptap a[href]')[n];
  let box = el.parentElement;
  while (box && !(box.scrollHeight > box.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
  if (box) box.scrollTop += el.getBoundingClientRect().top - want;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}, [which, y]);

async function runLinkTips(ctx, frame, tag) {
  const { page, app } = ctx;
  await app.evaluate((html) => { Editor.setHTML(html); }, LINK_HTML);
  await sleep(600);
  const cases = [['lien au centre, tout en bas', 0, frame[1] - 70], ['lien à droite, à mi-hauteur', 1, Math.round(frame[1] / 2) - 12]];
  const seen = {};
  for (const [name, which, y] of cases) {
    for (const bord of [null, ...EDGES]) {
      const bar = await showBar(page, app, bord, frame);
      const link = await bringLinkTo(app, which, y);
      await sleep(250);
      const fresh = await app.evaluate((n) => { const r = document.querySelectorAll('.tiptap a[href]')[n].getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }, which);
      await page.mouse.move(5, frame[1] - 30);
      await sleep(150);
      await page.mouse.move((fresh.left + fresh.right) / 2, (fresh.top + fresh.bottom) / 2, { steps: 4 });
      await app.waitForFunction(() => { const tip = document.querySelector('.pp-link-tip'); return !!tip && !tip.hidden; }, null, { timeout: 4000 }).catch(() => {});
      await sleep(150);
      const tip = await rectOf(app, '.pp-link-tip:not([hidden])');
      const label = `${tag}l'info-bulle du ${name}, ${where(bord)}`;
      check(`${label} : elle s'affiche au survol`, !!tip);
      if (tip) {
        if (VERBOSE) console.log('     ', label, showRect(tip), 'lien', showRect(fresh));
        judgeBox(label, tip, bar, frame, fresh);
        if (bord === null) seen[name] = tip;
        else if (seen[name] && bord !== 'bas' && bord !== 'haut' && !hits(seen[name], bar)) check(`${label} : elle n'avait rien à éviter, elle est où elle était sans barre`, sameRect(tip, seen[name]), { maintenant: showRect(tip), avant: showRect(seen[name]) });
        if (which === 0 && bord === 'bas') check(`${label} : elle passe au-dessus du lien`, tip.bottom <= fresh.top, { info: showRect(tip), lien: showRect(fresh) });
      }
      await page.mouse.move(5, frame[1] - 30);
      await sleep(150);
    }
  }
}

if (wanted(6)) {
  console.log('\n6) L\'info-bulle d\'un lien, 700 × 400');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
  await runLinkTips(ctx, FRAME, '');
  await ctx.page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 10) La bulle de taille d'un glissé de colonne : un vrai glissé de la poignée de la colonne B d'un tableau du document, la souris posée au centre de la zone de chaque bord.
const SIZED_TABLE = '<p>Avant le tableau</p><table><tbody>' + [1, 2, 3].map(r => '<tr>' + [140, 190, 120].map((w, c) => `<td colwidth="${w}"><p>${'ABC'[c]}${r}</p></td>`).join('') + '</tr>').join('') + '</tbody></table><p>Après le tableau</p>';
const COLUMN_B_HANDLE = '.pp-doc-strips .v2-grid-colhead:nth-child(2) .v2-grid-handle';
// Ramène la poignée dans le plan de travail, comme le ferait la main sur la molette (le bandeau des lettres passe sous la barre d'outils quand le haut du tableau touche le haut du plan).
const reachHandle = (app, selector) => app.evaluate((sel) => {
  const box = document.getElementById('editor-container');
  const handle = document.querySelector(sel);
  if (!box || !handle) return;
  const area = box.getBoundingClientRect();
  const r = handle.getBoundingClientRect();
  const cy = r.top + r.height / 2;
  if (cy < area.top + 6) box.scrollTop -= area.top + 6 - cy;
  if (cy > area.bottom - 6) box.scrollTop += cy - (area.bottom - 6);
}, selector);

async function runGridTips(ctx, frame, tag) {
  const { page, app } = ctx;
  for (const goal of EDGES) {
    const zone = (await barOf(page, goal, frame[0], frame[1])).zone;
    const aim = { x: Math.round(zone.x + zone.largeur / 2), y: Math.round(zone.y + zone.hauteur / 2) };
    const pointer = { left: aim.x, right: aim.x, top: aim.y, bottom: aim.y };
    for (const bord of [null, goal]) {
      const bar = await showBar(page, app, bord, frame);
      await app.evaluate((html) => { Editor.setHTML(html); }, SIZED_TABLE);
      await sleep(600);
      const cell = await center(app, '.tiptap tr:nth-child(2) td:nth-child(2)');
      await page.mouse.click(cell.x, cell.y);
      await sleep(500);
      await reachHandle(app, COLUMN_B_HANDLE);
      await sleep(250);
      const handle = await center(app, COLUMN_B_HANDLE);
      await page.mouse.move(handle.x - 6, handle.y - 5, { steps: 2 });
      await page.mouse.move(handle.x, handle.y, { steps: 3 });
      await sleep(120);
      await page.mouse.down();
      await page.mouse.move(aim.x, aim.y, { steps: 8 });
      await sleep(200);
      const tip = await rectOf(app, '.v2-grid-tip');
      const label = `${tag}la bulle de taille d'un glissé de colonne, souris sur la zone ${EN[goal]}, ${where(bord)}`;
      check(`${label} : elle s'affiche en plein glissé`, !!tip);
      if (tip) {
        if (VERBOSE) console.log('     ', label, showRect(tip), 'souris', aim.x, aim.y);
        judgeBox(label, tip, bar, frame, pointer);
        if (bord === null) check(`${label} : sans barre, elle est à 14 px de la souris, comme avant`, Math.abs(tip.left - Math.min(aim.x + 14, frame[0] - 70)) < 1 && Math.abs(tip.top - Math.min(aim.y + 14, frame[1] - 30)) < 1, { rect: showRect(tip), souris: [aim.x, aim.y] });
      }
      await page.mouse.up();
      await sleep(300);
      await closeAll(ctx, frame);
    }
  }
}

if (wanted(10)) {
  console.log('\n10) La bulle de taille d\'un glissé de colonne, 700 × 400');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
  await runGridTips(ctx, FRAME, '');
  await ctx.page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 7) Un cadre bas.
if (wanted(7)) {
  console.log('\n7) Un cadre bas, 700 × 260');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null }, width: LOW[0], height: LOW[1] });
  await runPanels(ctx, LOW, 'cadre 700 × 260, ');
  await runTitleList(ctx, LOW, 'cadre 700 × 260, ');
  await runProbes(ctx, LOW, 'cadre 700 × 260, ', [['court', 120], ['haut', 220]]);
  await ctx.page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 9) Un cadre étroit (560 × 300) : la barre d'un tableau fait 552 px, la barre de GFS à gauche ou à droite en prend 42 : elle passe sur deux lignes (css/editor-v2.css) au lieu de passer dessous.
if (wanted(9)) {
  console.log('\n9) Un cadre étroit, 560 × 300');
  const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null }, width: NARROW[0], height: NARROW[1] });
  await runToolbars(ctx, NARROW, 'cadre 560 × 300, ');
  // Sans barre, à 700 × 400, la barre du tableau reste sur UNE ligne (la règle ne joue que dans un cadre trop étroit pour elle).
  await ctx.page.context().close();
  const wide = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null } });
  const m = await openToolbar(wide, TOOLBARS[0]);
  check('à 700 × 400, la barre flottante d\'un tableau reste sur une ligne', m.toolbars.length === 1 && m.toolbars[0].bottom - m.toolbars[0].top < 44, m.toolbars.map(showRect));
  await wide.page.context().close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 8) L'outil commun GfsBar.settle : pour une grille de rectangles du cadre, ce qu'il demande laisse la zone libre sans sortir du cadre.
if (wanted(8)) {
  console.log('\n8) GfsBar.settle, une grille de rectangles');
  for (const frame of [FRAME, LOW]) {
    const ctx = await t.openPage({ framed: true, seed: SEED, lang: 'fr', stub: { barre: null }, width: frame[0], height: frame[1] });
    const { page, app } = ctx;
    const sizes = [[60, 24], [180, 150], [180, 300], [554, 34], [320, 90]].filter(([, h]) => h <= frame[1] - 12);
    const none = await app.evaluate(() => GfsBar.settle({ left: 0, top: 0, right: 700, bottom: 400 }, null));
    check(`${frame[1]} px de haut, sans barre : settle ne demande rien`, none.dx === 0 && none.dy === 0 && none.cap === null, none);
    for (const bord of EDGES) {
      const bar = await showBar(page, app, bord, frame);
      const bad = [];
      let overlapping = 0;
      let asked = 0;
      const z = bar.zone;
      for (const [w, h] of sizes) {
        // Des positions au large et, surtout, au ras de la zone : un bord du rectangle un peu en deçà, tout contre, un peu au-delà.
        const lefts = [...new Set([6, 40, 100, 250, 300, 500, z.x - w + 5, z.x - w + 20, z.x + 10, z.x + z.largeur - 10, z.x + z.largeur + 4, frame[0] - 6 - w, frame[0] - 36 - w].map(Math.round))];
        const tops = [...new Set([6, 40, 70, 120, 190, 220, 300, z.y - h + 5, z.y - h + 20, z.y + 10, z.y + z.hauteur - 10, z.y + z.hauteur + 4, frame[1] - 6 - h].map(Math.round))];
        for (const left of lefts) for (const top of tops) {
          const rect = { left, top, right: left + w, bottom: top + h };
          if (left < 6 || top < 6 || left + w > frame[0] - 6 || top + h > frame[1] - 6) continue;
          const anchor = { left, top: Math.max(0, top - 30), right: left + 40, bottom: top };
          for (const [withAnchor, held] of [[false, false], [true, false], [false, true]]) {
            const plan = await app.evaluate(([r, a, use, hd]) => GfsBar.settle(r, use ? a : null, hd), [rect, anchor, withAnchor, held]);
            if (!hits(rect, bar)) { if (plan.dx !== 0 || plan.dy !== 0 || plan.cap !== null) bad.push(['demande sans recouvrement', rect, plan]); continue; }
            if (!withAnchor && !held) overlapping += 1;
            if (!withAnchor && !held && (plan.dx !== 0 || plan.dy !== 0 || plan.cap !== null)) asked += 1;
            // Tenu par le haut, le plafond rogne le bas ; tenu par le bas (`held`, une liste qui s'ouvre vers le haut), il rogne le haut.
            const moved = {
              left: rect.left + plan.dx, right: rect.right + plan.dx,
              top: held && plan.cap !== null ? rect.bottom + plan.dy - plan.cap : rect.top + plan.dy,
              bottom: held || plan.cap === null ? rect.bottom + plan.dy : rect.top + plan.cap + plan.dy,
            };
            // Un rectangle plus large que la place qui reste (554 px à côté d'une barre) ou plus haut ne peut pas tout respecter ; les autres, si.
            const fitsAside = (bord === 'gauche' || bord === 'droite') ? w <= frame[0] - z.largeur - 12 : true;
            const fitsAbove = (bord === 'haut' || bord === 'bas') ? h <= frame[1] - z.hauteur - 12 : true;
            if (!fitsAside || !fitsAbove) continue;
            const what = held ? 'tenu par le bas' : (withAnchor ? 'avec ancre' : 'sans ancre');
            if (hits(moved, bar)) bad.push(['recouvre encore la zone', what, rect, plan]);
            else if (moved.left < 6 - 0.5 || moved.right > frame[0] - 6 + 0.5 || moved.top < 6 - 0.5 || moved.bottom > frame[1] - 6 + 0.5) bad.push(['sort du cadre', what, rect, plan]);
            else if (plan.cap !== null && (plan.cap < 80 || plan.cap > h + 0.5)) bad.push(['plafond hors de 80 px à la hauteur', what, rect, plan]);
          }
        }
      }
      if (VERBOSE && bad.length) console.log('     ', JSON.stringify(bad.slice(0, 6)));
      check(`${frame[1]} px de haut, barre ${bord} : settle laisse la zone libre et dans le cadre (${overlapping} rectangles qui la recouvrent)`, bad.length === 0, bad.slice(0, 4));
      check(`${frame[1]} px de haut, barre ${bord} : des rectangles recouvrent la zone et settle demande quelque chose pour chacun`, overlapping >= 8 && asked >= overlapping, { overlapping, asked });
    }
    await ctx.page.context().close();
  }
}

await t.finish();
