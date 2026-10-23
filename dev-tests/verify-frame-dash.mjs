#!/usr/bin/env node
// Le STYLE du trait d'une forme, d'un cadre ou d'une ligne (js/free-frame.js, js/shape-geometry.js, css/free-frame.css, js/html-sanitize.js ; chantier 3 « Traits et transparence » du plan « Import PowerPoint
// sans perte », demande du 22/10, lot 3b : le tiret et le bout), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js),
// l'extension « diapositives » active. Ce que dev-tests/scenarios-frame-dash.js ne peut pas voir depuis la page :
//  LA BARRE ET SON MENU : le bouton « Style du trait » de la barre flottante, entre l'épaisseur et les extrémités, la barre toujours entière dans le panneau ; son menu (onze tirets en grille, trois bouts) entier dans
//   le panneau, chaque ligne nommée dans la langue de la page et lisible (>= 4,5:1), le trait plein et le bout plat cochés ; le bout est grisé (avec sa raison, jamais retiré) tant que le trait est plein sur une forme ;
//   un choix est UN pas d'historique (Ctrl+Z défait, Ctrl+Maj+Z et Ctrl+Y rétablissent, le menu suit), le menu se ferme, la forme reste sélectionnée ; « Trait plein » rend aussi le bout d'une forme.
//  LE DESSIN : sur les pixels de l'éditeur (page à 100 %), une forme au trait de 6 points en tirets (4:3) alterne 24 points d'encre et 18 de vide, des points ronds (1:1, 6 points) sont des disques de 6 points tous les
//   12 points, la Lecture dessine les mêmes pixels, la miniature de la bande et le diaporama peignent la même image ; un cadre qui grandit avec son texte garde l'épaisseur de son trait (haut et bas) ;
//   une ligne en pointillés ronds (3 points) a ses disques à 6 points d'intervalle.
//  UNE FORME NEUVE : un tiret choisi pour une forme sans trait lui donne le trait d'une forme neuve (un choix doit se voir) ; une ligne garde ses pointes avec son tiret.
// Lancé par run-headless.mjs (groupe Node "frameDashMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-frame-dash.mjs
// FRAME_DASH_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT, chooseObject } from './gfs-page.mjs';

const SHOTS = process.env.FRAME_DASH_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-frame-dash', port: Number(process.env.FRAME_DASH_PORT || 9154) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const SLIDES = `<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}<p>Trois</p>`;
// Un cadre, une forme ou une ligne écrit comme l'enregistrement le fait : les mesures, puis l'aspect quand il y en a un.
const FRAME = (x, y, w, h, look, html = '<p></p>') => {
  const a = Object.assign({ shape: '', fill: '', line: '', lw: '', dash: '', cap: '', flip: '', head: '', tail: '' }, look);
  const extra = ['shape', 'fill', 'line', 'lw', 'dash', 'cap', 'flip', 'head', 'tail'].filter(key => a[key] !== '').map(key => ` data-ff-${key}="${a[key]}"`).join('');
  return `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"${extra}><div class="pp-free-frame-box"><div class="pp-free-frame-content">${html}</div></div></div>`;
};
// « Posées » : la première diapositive porte une forme à tirets (4:3) de 6 points, une à points ronds (1:1, 6 points), une ligne à points ronds de 3 points, un cadre de texte à tirets qui grandira avec son
// texte. Le trait est noir, sans fond, de 6 points (3 pour la ligne) : de l'encre noire sur le papier blanc. La diapositive n'a pas d'autre texte que celui du cadre : aucune lettre sous les traits.
const INK = '#000000';
const POSEES = `${FRAME(40, 40, 200, 90, { shape: 'rect', line: INK, lw: 6, dash: 'dash' })}`
  + `${FRAME(280, 40, 200, 90, { shape: 'rect', line: INK, lw: 6, dash: 'sysDot', cap: 'round' })}`
  + `${FRAME(40, 170, 300, 0, { shape: 'line', line: INK, lw: 3, dash: 'sysDot', cap: 'round' })}`
  + `${FRAME(40, 220, 200, 60, { line: INK, lw: 6, dash: 'dash' }, '<p>Court</p>')}`
  + '<p></p>' + BR + '<h2>Deux</h2><p>Texte</p>';
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Formes', '${SLIDES}', false, 'presentation');
  add(8, 'Posées', ${JSON.stringify(POSEES)}, false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;

const TEXTS = {
  fr: {
    dash: 'Style du trait', cap: 'Bout du trait',
    dashes: ['Trait plein', 'Points', 'Points espacés', 'Tirets courts', 'Tirets', 'Tirets longs', 'Tiret court et point', 'Tiret et point', 'Tiret long et point', 'Tiret court et deux points', 'Tiret long et deux points'],
    caps: ['Bout plat', 'Bout rond', 'Bout carré'], capReason: 'Le bout ne se voit que sur une ligne ou sur un trait en tirets',
  },
  en: {
    dash: 'Line style', cap: 'Line cap',
    dashes: ['Solid line', 'Dots', 'Sparse dots', 'Short dashes', 'Dashes', 'Long dashes', 'Short dash and dot', 'Dash and dot', 'Long dash and dot', 'Short dash and two dots', 'Long dash and two dots'],
    caps: ['Flat cap', 'Round cap', 'Square cap'], capReason: 'The cap only shows on a line or on a dashed outline',
  },
};
const DASH_IDS = ['', 'sysDot', 'dot', 'sysDash', 'dash', 'lgDash', 'sysDashDot', 'dashDot', 'lgDashDot', 'sysDashDotDot', 'lgDashDotDot'];
const near = (a, b, tolerance = 0.6) => typeof a === 'number' && Math.abs(a - b) <= tolerance;
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

// Les outils d'une page ouverte : positions, premier plan, vrais clics (même outillage que dev-tests/verify-frame-transparency.mjs).
function toolsOf(page) {
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const showInList = async (selector, index) => {
    const need = await page.evaluate(([sel, i]) => {
      const el = document.querySelectorAll(sel)[i];
      const list = el && el.closest('.pp-slide-list');
      if (!list) return null;
      const r = el.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      const delta = r.top < l.top ? r.top - l.top - 8 : (r.bottom > l.bottom ? r.bottom - l.bottom + 8 : 0);
      return delta ? { x: l.left + l.width / 2, y: l.top + l.height / 2, delta } : null;
    }, [selector, index]);
    if (!need) return;
    await page.mouse.move(need.x, need.y);
    await page.mouse.wheel(0, need.delta);
    await sleep(250);
  };
  const hover = async (selector, index = 0) => {
    await showInList(selector, index);
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    return c;
  };
  const click = async (selector, index = 0, options = {}) => { const c = await hover(selector, index); await page.mouse.click(c.x, c.y, options); await sleep(250); return c; };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  return { rectOf, hover, click, leave };
}

// Les cadres, formes et lignes du texte avec leur aspect, la sélection.
const docState = page => page.evaluate(() => {
  const editor = EditorCore.getEditor();
  const items = [];
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'freeFrame' || node.type.name === 'freeLine') {
      const a = node.attrs;
      items.push({ pos: offset, kind: node.type.name, x: a.x, y: a.y, w: a.w, h: a.h, shape: a.shape, fill: a.fill, line: a.line, lw: a.lw, dash: a.dash, cap: a.cap, head: a.head, tail: a.tail });
    }
  });
  const sel = editor.state.selection;
  return { items, selection: { selectedFrame: !!(sel.node && /^free/.test(sel.node.type.name)), inFrame: !!FreeFrame.frameAround(sel.$from) && !sel.node } };
});
const htmlOf = page => page.evaluate(() => EditorCore.getEditor().getHTML());

// Le menu du style du trait ouvert : sa boîte, ses lignes, le bout.
const dashMenuState = page => page.evaluate(() => {
  const menu = document.querySelector('.v2-frame-dash-menu.visible');
  const chip = document.getElementById('v2-frame-dash-open');
  if (!menu) return null;
  const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const rows = Array.from(menu.querySelectorAll('[data-action^="dash:"]')).filter(b => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0);
  const caps = Array.from(menu.querySelectorAll('[data-action^="cap:"]'));
  return {
    menu: rect(menu), role: menu.getAttribute('role'), label: menu.getAttribute('aria-label'), expanded: chip ? chip.getAttribute('aria-expanded') : null,
    rows: rows.map(b => ({ id: b.dataset.action.slice(5), name: b.getAttribute('aria-label'), title: b.title, checked: b.getAttribute('aria-checked'), role: b.getAttribute('role'), active: b.classList.contains('is-active'), svg: !!b.querySelector('svg'), rect: rect(b) })),
    caps: caps.map(b => ({ id: b.dataset.action.slice(4), name: b.getAttribute('aria-label'), title: b.title, checked: b.getAttribute('aria-checked'), disabled: b.disabled, ariaDisabled: b.getAttribute('aria-disabled'), active: b.classList.contains('is-active'), rect: rect(b) })),
  };
});
// La barre flottante : ses boutons visibles dans l'ordre, sa boîte.
const barState = page => page.evaluate(() => {
  const bar = document.querySelector('.v2-frame-toolbar');
  if (!bar || bar.getBoundingClientRect().width === 0) return null;
  const r = bar.getBoundingClientRect();
  const buttons = Array.from(bar.querySelectorAll('button')).filter(b => b.getBoundingClientRect().width > 0 && getComputedStyle(b).display !== 'none');
  const dash = document.getElementById('v2-frame-dash-open');
  return {
    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
    ids: buttons.map(b => b.id || b.dataset.action), every: buttons.map((b) => { const q = b.getBoundingClientRect(); return { left: q.left, right: q.right, top: q.top, bottom: q.bottom, width: q.width }; }),
    dash: dash ? { name: dash.getAttribute('aria-label'), title: dash.title, popup: dash.getAttribute('aria-haspopup'), expanded: dash.getAttribute('aria-expanded'), svg: !!dash.querySelector('svg') } : null,
  };
});

// La capture de la boîte `index` d'un conteneur (éditeur ou Lecture), amenée à l'écran : le PNG (8 pixels de papier autour), la boîte dedans et les pixels par point.
async function shotOfBox(page, root, index) {
  const measured = await page.evaluate(([rootSel, i]) => {
    const box = document.querySelector(rootSel).querySelectorAll('.pp-free-frame-box')[i];
    box.scrollIntoView({ block: 'center', inline: 'center' });
    return parseFloat(box.parentElement.getAttribute('data-ff-w'));
  }, [root, index]);
  await sleep(300);
  const rect = await page.evaluate(([rootSel, i]) => { const r = document.querySelector(rootSel).querySelectorAll('.pp-free-frame-box')[i].getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }, [root, index]);
  const margin = 8;
  const x0 = Math.max(0, rect.left - margin);
  const y0 = Math.max(0, rect.top - margin);
  const width = Math.min(WIDTH - x0, rect.width + rect.left - x0 + margin);
  const height = Math.min(HEIGHT - y0, rect.height + rect.top - y0 + margin);
  const png = await page.screenshot({ clip: { x: x0, y: y0, width, height }, type: 'png' });
  return { b64: png.toString('base64'), box: { left: rect.left - x0, top: rect.top - y0, width: rect.width, height: rect.height }, scale: rect.width / measured, visible: rect.left >= 0 && rect.top >= 0 && rect.left + rect.width <= WIDTH && rect.top + rect.height <= HEIGHT };
}
// L'encre le long d'une ligne ou d'une colonne de la capture : chaque pixel est de l'encre (sombre) ou du papier ; les séries en sont rendues, en pixels. `from`, `to` : de x (ou y) à x (ou y), depuis le coin de la boîte.
const trackOf = (page, shot, axis, fixed, from, to) => page.evaluate(async ([b64, box, ax, fix, a, b]) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const flags = [];
  for (let n = Math.floor(a); n < Math.floor(b); n++) {
    const x = Math.floor(box.left + (ax === 'row' ? n : fix));
    const y = Math.floor(box.top + (ax === 'row' ? fix : n));
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) { flags.push(null); continue; }
    const d = ctx.getImageData(x, y, 1, 1).data;
    flags.push(d[0] + d[1] + d[2] < 330);
  }
  const runs = [];
  flags.forEach((flag) => { if (runs.length && runs[runs.length - 1].ink === flag) runs[runs.length - 1].n += 1; else runs.push({ ink: flag, n: 1 }); });
  return { runs, paper: (() => { const d = ctx.getImageData(Math.max(0, Math.floor(box.left - 4)), Math.max(0, Math.floor(box.top - 4)), 1, 1).data; return [d[0], d[1], d[2]]; })() };
}, [shot.b64, shot.box, axis, fixed, from, to]);
// Les séries entières (ni la première ni la dernière, que la fenêtre coupe), en points.
const wholeRuns = (track, scale) => track.runs.slice(1, -1).filter(run => run.ink !== null).map(run => ({ ink: run.ink, pt: run.n / scale }));

// Une page neuve (un document modifié et pas enregistré ferait demander « Modifications non enregistrées » à l'ouverture d'un autre modèle) et ses outils.
async function setup(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { rectOf, hover, click, leave } = toolsOf(page);
  const press = async (key) => { await page.keyboard.press(key); await sleep(260); };
  const gap = () => sleep(700);
  const open = async (id, slides) => {
    await Promise.race([
      page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
      sleep(20000),
    ]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    if (slides) await page.waitForFunction(n => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === n; }, slides, { timeout: 15000 }).catch(() => {});
    await sleep(900);
  };
  const menuOpen = () => page.evaluate(() => !!document.querySelector('.v2-frame-dash-menu.visible'));
  // Comme les menus de fond, de trait, d'épaisseur et d'extrémités à côté de lui : le bouton bascule, un clic ailleurs referme ; Échap n'y est pas câblé.
  const closeDashMenu = async () => { if (await menuOpen()) await click('#v2-frame-dash-open'); };
  const openDashMenu = async () => { await closeDashMenu(); await click('#v2-frame-dash-open'); };
  const chooseDash = async (id) => { await openDashMenu(); await click(`.v2-frame-dash-menu.visible [data-action="dash:${id}"]`); };
  const chooseCap = async (id) => { await openDashMenu(); await click(`.v2-frame-dash-menu.visible [data-action="cap:${id}"]`); };
  const lastFrame = async () => { const s = await docState(page); return s.items[s.items.length - 1]; };
  return { T, tag, page, rectOf, hover, click, leave, press, gap, open, menuOpen, closeDashMenu, openDashMenu, chooseDash, chooseCap, lastFrame };
}

// Le bouton, son menu, les choix et l'historique.
async function menuPart(lang, colorScheme) {
  const { T, tag, page, click, leave, press, open, menuOpen, closeDashMenu, openDashMenu, chooseDash, chooseCap, lastFrame } = await setup(lang, colorScheme);

  // --- 1. Le bouton de la barre et son menu.
  console.log('\n' + tag + '1) Le bouton « ' + T.dash + ' » et son menu');
  await open(7, 3);
  await click('.pp-slide-item', 1);
  await chooseObject(page, 'shape:rect');
  const base = await htmlOf(page);
  const bar = await barState(page);
  const order = bar ? bar.ids : [];
  check(tag + `la barre de la forme a le bouton « ${T.dash} » juste après l'épaisseur du trait (les extrémités ne sont qu'à la ligne), entière dans le panneau de 700x400, chaque bouton visible dans la barre`,
    !!bar && order.indexOf('v2-frame-dash-open') === order.indexOf('v2-frame-width-open') + 1 && order.indexOf('v2-frame-ends-open') < 0 && inPanel(bar.rect)
    && bar.every.every(b => b.left >= bar.rect.left - 0.5 && b.right <= bar.rect.right + 0.5 && b.width > 0), bar);
  check(tag + `le bouton se nomme « ${T.dash} » (nom accessible et info-bulle), annonce son menu et l'icône est là`, !!bar && !!bar.dash && bar.dash.name === T.dash && bar.dash.title === T.dash && bar.dash.popup === 'true' && bar.dash.expanded === 'false' && bar.dash.svg, bar && bar.dash);
  await click('#v2-frame-dash-open');
  let menu = await dashMenuState(page);
  check(tag + `le menu est ouvert, annonce son rôle (« menu ») et son nom (« ${T.dash} »), la pastille dit qu'il est ouvert`, !!menu && menu.role === 'menu' && menu.label === T.dash && menu.expanded === 'true', menu && { role: menu.role, label: menu.label, expanded: menu.expanded });
  check(tag + `onze lignes dans l'ordre (« ${T.dashes[0]} », « ${T.dashes[1]} »... « ${T.dashes[10]} »), chacune une icône nommée dans la langue de la page, « ${T.dashes[0]} » cochée`,
    !!menu && JSON.stringify(menu.rows.map(r => r.id)) === JSON.stringify(DASH_IDS) && JSON.stringify(menu.rows.map(r => r.name)) === JSON.stringify(T.dashes) && menu.rows.every(r => r.title === r.name && r.svg && r.role === 'menuitemradio')
    && menu.rows.map(r => r.checked).join() === ['true'].concat(Array(10).fill('false')).join() && menu.rows[0].active, menu && menu.rows.map(r => [r.id, r.name, r.checked]));
  check(tag + `le bout : trois boutons (« ${T.caps.join(' », « ')} »), « ${T.caps[0]} » coché, tous grisés (le trait est plein) avec leur raison en info-bulle : « ${T.capReason} »`,
    !!menu && JSON.stringify(menu.caps.map(c => c.name)) === JSON.stringify(T.caps) && menu.caps.map(c => c.checked).join() === 'true,false,false' && menu.caps.every(c => c.disabled && c.ariaDisabled === 'true' && c.title === T.capReason), menu && menu.caps);
  check(tag + 'le menu est entier dans le panneau de 700x400 et ses lignes sont toutes dedans', !!menu && inPanel(menu.menu) && menu.rows.every(r => inPanel(r.rect)) && menu.caps.every(c => inPanel(c.rect)), menu && menu.menu);
  const contrasts = [];
  for (const id of ['', 'sysDot', 'lgDashDotDot']) contrasts.push(await contrastOf(page, `.v2-frame-dash-menu.visible [data-action="dash:${id}"]`));
  contrasts.push(await contrastOf(page, '#v2-frame-dash-open'));
  check(tag + 'les icônes du menu et le bouton de la barre sont lisibles (>= 4,5:1)', contrasts.every(c => c >= 4.5), contrasts);
  const samples = await page.evaluate(() => Array.from(document.querySelectorAll('.v2-frame-dash-menu.visible [data-action^="dash:"] svg path')).map(p => p.getAttribute('stroke-dasharray')));
  check(tag + 'les échantillons dessinent leur motif (« Trait plein » : continu ; les dix autres : des tirets, tous différents)', samples.length === 11 && samples[0] === null && new Set(samples.slice(1)).size === 10 && samples.slice(1).every(s => /^[\d. ]+$/.test(s)), samples);
  await snap(page, `${lang}-menu-style`);
  await click('#v2-frame-dash-open');
  menu = await dashMenuState(page);
  const afterToggle = await barState(page);
  check(tag + 'un second clic sur le bouton referme le menu (la pastille le dit) et la forme reste sélectionnée', menu === null && !!afterToggle && afterToggle.dash.expanded === 'false' && (await docState(page)).selection.selectedFrame, afterToggle && afterToggle.dash);

  // --- 2. Un choix est un pas d'historique.
  console.log('\n' + tag + '2) Un choix, un pas d\'historique');
  const before = await lastFrame();
  check(tag + 'la forme posée a le trait d\'une forme neuve, plein, à bouts plats', !!before && before.dash === '' && before.cap === '' && before.line === '#2f5597', before);
  await chooseDash('dash');
  let frame = await lastFrame();
  check(tag + `« ${T.dashes[4]} » donne les tirets à la forme, sans toucher à sa couleur ni à son épaisseur, le menu se ferme, la forme reste sélectionnée`,
    frame.dash === 'dash' && frame.cap === '' && frame.line === before.line && frame.lw === before.lw && frame.x === before.x && frame.y === before.y && !(await menuOpen()) && (await docState(page)).selection.selectedFrame, frame);
  await openDashMenu();
  menu = await dashMenuState(page);
  check(tag + `le menu rouvert coche « ${T.dashes[4]} » (et plus « ${T.dashes[0]} »), le bout n'est plus grisé (les tirets le laissent voir), « ${T.caps[0]} » coché`,
    !!menu && menu.rows.filter(r => r.checked === 'true').map(r => r.id).join() === 'dash' && menu.caps.every(c => !c.disabled && c.ariaDisabled === 'false') && menu.caps.map(c => c.checked).join() === 'true,false,false' && menu.caps[1].title === T.caps[1], menu && [menu.rows.map(r => r.checked), menu.caps]);
  await closeDashMenu();
  await undo(page, press);
  frame = await lastFrame();
  check(tag + 'un seul Ctrl+Z défait ce choix : la forme est comme avant, au caractère près', (await htmlOf(page)) === base && frame.dash === '', frame);
  await press('Control+Shift+z');
  frame = await lastFrame();
  check(tag + 'Ctrl+Maj+Z le rétablit (les tirets reviennent)', frame.dash === 'dash', frame);
  await press('Control+z');
  await press('Control+y');
  frame = await lastFrame();
  check(tag + 'et Ctrl+Y de même, la forme restant sélectionnée', frame.dash === 'dash' && (await docState(page)).selection.selectedFrame, frame);
  await chooseCap('round');
  frame = await lastFrame();
  check(tag + `« ${T.caps[1]} » pose le bout rond, le tiret reste`, frame.cap === 'round' && frame.dash === 'dash', frame);
  await press('Control+z');
  frame = await lastFrame();
  check(tag + 'un Ctrl+Z défait le bout seul, le tiret reste', frame.cap === '' && frame.dash === 'dash', frame);
  await chooseCap('square');
  frame = await lastFrame();
  check(tag + `« ${T.caps[2]} » pose le bout carré`, frame.cap === 'square' && frame.dash === 'dash', frame);
  await chooseDash('');
  frame = await lastFrame();
  check(tag + `« ${T.dashes[0]} » rend le trait plein ET le bout plat d'une forme (un bout sans effet ne reste pas dans le document)`, frame.dash === '' && frame.cap === '', frame);
  await press('Control+z');
  frame = await lastFrame();
  check(tag + 'un seul Ctrl+Z rend les tirets et le bout carré ensemble', frame.dash === 'dash' && frame.cap === 'square', frame);
  await press('Control+z');
  await press('Control+z');
  check(tag + 'deux Ctrl+Z de plus rendent la forme d\'origine, au caractère près', (await htmlOf(page)) === base, await lastFrame());
  await chooseCap('round').catch(() => {});
  frame = await lastFrame();
  check(tag + 'sur un trait plein le bout est grisé : le clic ne change rien', frame.cap === '' && (await htmlOf(page)) === base, frame);
  await closeDashMenu();

  // Une forme sans trait : choisir un tiret lui donne le trait d'une forme neuve.
  await chooseObject(page, 'shape:ellipse');
  await click('#v2-frame-line-open');
  await click('.v2-color-dropdown.visible [data-action="none"]');
  let ellipse = await lastFrame();
  check(tag + 'une ellipse sans trait (« Sans trait »)', ellipse.line === '' && ellipse.shape === 'ellipse', ellipse);
  await chooseDash('sysDash');
  ellipse = await lastFrame();
  check(tag + 'un tiret choisi pour une forme sans trait lui donne le trait d\'une forme neuve (bleu, 1,5 point) : un choix doit se voir', ellipse.dash === 'sysDash' && ellipse.line === '#2f5597' && ellipse.lw === 1.5, ellipse);
  await press('Control+z');
  ellipse = await lastFrame();
  check(tag + 'un seul Ctrl+Z reprend le tiret ET le trait', ellipse.dash === '' && ellipse.line === '', ellipse);
  // La pose de l'ellipse et son « Sans trait » se suivent de moins d'une demi-seconde : l'historique les range ensemble, le nombre de Ctrl+Z qui suit n'est pas celui des gestes.
  for (let i = 0; i < 4 && (await htmlOf(page)) !== base; i++) await press('Control+z');
  check(tag + 'quelques Ctrl+Z de plus rendent le document d\'origine, au caractère près (la forme du début seule)', (await htmlOf(page)) === base, await docState(page));

  // Une ligne : le menu y est, le bout aussi (une ligne a des bouts), ses pointes restent.
  await chooseObject(page, 'line:arrow');
  const lineBar = await barState(page);
  check(tag + `la barre d'une ligne a aussi « ${T.dash} », entre l'épaisseur et les extrémités`, !!lineBar && lineBar.ids.indexOf('v2-frame-dash-open') === lineBar.ids.indexOf('v2-frame-width-open') + 1 && inPanel(lineBar.rect), lineBar && lineBar.ids);
  await openDashMenu();
  menu = await dashMenuState(page);
  check(tag + 'sur une ligne le bout n\'est pas grisé même au trait plein (une ligne a des bouts)', !!menu && menu.caps.every(c => !c.disabled && c.ariaDisabled === 'false') && menu.caps[0].checked === 'true', menu && menu.caps);
  await closeDashMenu();
  await chooseDash('sysDot');
  await chooseCap('round');
  let line = await lastFrame();
  check(tag + 'une ligne en points ronds garde sa pointe, sa couleur et son épaisseur', line.kind === 'freeLine' && line.dash === 'sysDot' && line.cap === 'round' && line.tail === 'triangle' && line.line === '#2f5597' && line.lw === 3, line);
  await chooseDash('');
  line = await lastFrame();
  check(tag + `« ${T.dashes[0]} » sur une ligne rend le tiret mais garde le bout rond (une ligne le voit)`, line.dash === '' && line.cap === 'round', line);
  let presses = 0;
  while (presses < 6 && (await htmlOf(page)) !== base) {
    await press('Control+z');
    presses += 1;
  }
  check(tag + 'quatre Ctrl+Z au plus (le tiret, le bout, le trait plein, la pose) défont la ligne et ses choix : il ne reste que la forme du début, au caractère près', (await htmlOf(page)) === base && presses <= 4, { presses });
  await leave();

}

// Les pixels du dessin, de l'éditeur, de la Lecture, de la miniature et du diaporama.
async function pixelPart(lang, colorScheme) {
  const { tag, page, click, leave, press, open } = await setup(lang, colorScheme);

  // --- 3. Les pixels : éditeur, Lecture, miniature, diaporama.
  console.log('\n' + tag + '3) Les pixels : tirets, points ronds, trait qui grandit');
  await open(8, 2);
  await click('.pp-slide-item', 0);
  await leave();
  // La page agrandie à 100 % : un point de la page fait un pixel et un tiers.
  for (let i = 0; i < 9; i++) {
    const zoom = await page.evaluate(() => EditorCore.layoutZoom(document.querySelector('#editor-container .tiptap')));
    if (zoom >= 0.99) break;
    await press('Control+=');
    await sleep(200);
  }
  const measure = async (root, label) => {
    // La forme à tirets : la rangée du milieu de la bande du haut (3 points sous le bord), entre 12 points et la largeur moins 12.
    const dashed = await shotOfBox(page, root, 0);
    const k = dashed.scale;
    const top = await trackOf(page, dashed, 'row', 3 * k, 12 * k, dashed.box.width - 12 * k);
    const dashRuns = wholeRuns(top, k);
    // Les points ronds : une grille plus fine, la rangée du milieu de la bande du haut.
    const dotted = await shotOfBox(page, root, 1);
    const k2 = dotted.scale;
    const dotsTop = await trackOf(page, dotted, 'row', 3 * k2, 12 * k2, dotted.box.width - 12 * k2);
    const dotRuns = wholeRuns(dotsTop, k2);
    // Une colonne qui coupe le disque en son centre (le centre du premier disque entier) : sa hauteur est le diamètre.
    return { label, k, k2, dashRuns, dotRuns, paper: top.paper, visible: dashed.visible && dotted.visible };
  };
  const within = (list, ink, target, tolerance) => list.length >= 2 && list.filter(run => run.ink === ink).every(run => near(run.pt, target, tolerance));
  const editorLook = await measure('#editor-container', 'éditeur');
  check(tag + `éditeur à 100 % : les tirets (4:3, trait de 6 points) font 24 points d'encre et 18 de vide, ${editorLook.dashRuns.length} séries entières`, editorLook.visible && within(editorLook.dashRuns, true, 24, 2) && within(editorLook.dashRuns, false, 18, 2) && editorLook.dashRuns.length >= 3, editorLook);
  check(tag + 'éditeur : des points ronds de 6 points (1:1) sont des disques de 6 points tous les 12 points (6 points de vide entre deux)', within(editorLook.dotRuns, true, 6, 1.6) && within(editorLook.dotRuns, false, 6, 1.6) && editorLook.dotRuns.length >= 5, editorLook.dotRuns);
  await snap(page, `${lang}-editeur`);
  // Un disque, de haut en bas : la colonne qui passe par son centre est de 6 points d'encre.
  const dotShot = await shotOfBox(page, '#editor-container', 1);
  const kd = dotShot.scale;
  // Le premier disque dont la rangée du haut est de l'encre : on cherche le centre du premier disque entier de la bande du haut.
  const rowTrack = await trackOf(page, dotShot, 'row', 3 * kd, 8 * kd, dotShot.box.width - 8 * kd);
  let cursor = 8 * kd;
  let centre = null;
  for (const run of rowTrack.runs) {
    if (run.ink === true && run.n >= 4 && centre === null && cursor > 8 * kd) centre = cursor + run.n / 2;
    cursor += run.n;
  }
  const column = centre === null ? null : await trackOf(page, dotShot, 'col', centre, 0, 12 * kd);
  const columnRuns = column ? wholeRuns(column, kd).concat(column.runs.slice(0, 1).map(r => ({ ink: r.ink, pt: r.n / kd }))) : [];
  const inkColumn = column ? column.runs.filter(r => r.ink === true).map(r => r.n / kd) : [];
  check(tag + 'éditeur : un disque est rond (la colonne qui passe par son centre a 6 points d\'encre, aussi haut que large)', centre !== null && inkColumn.some(pt => near(pt, 6, 1.4)), { centre, inkColumn, columnRuns });
  // La ligne en pointillés ronds de 3 points : un disque tous les 6 points.
  const lineShot = await shotOfBox(page, '#editor-container', 2);
  const kl = lineShot.scale;
  // Le centre de la ligne : à la moitié de la hauteur de sa boîte (agrandie du tour).
  const lineTrack = await trackOf(page, lineShot, 'row', lineShot.box.height / 2, 14 * kl, lineShot.box.width - 14 * kl);
  const lineRuns = wholeRuns(lineTrack, kl);
  check(tag + 'éditeur : la ligne en points ronds de 3 points a un disque de 3 points tous les 6 points', lineRuns.length >= 8 && within(lineRuns, true, 3, 1) && within(lineRuns, false, 3, 1), lineRuns.slice(0, 8));
  // Le cadre de texte à tirets grandit avec son texte : son trait garde son épaisseur, en haut et en bas.
  const thick = async (root) => {
    const shot = await shotOfBox(page, root, 3);
    const k = shot.scale;
    const w = shot.box.width;
    const h = shot.box.height;
    // Une colonne dans le premier tiret du haut (x = 15 points : le premier tiret couvre de 3 à 27) : son épaisseur ; la même dans le bas (cherchée dans la grille des tirets du bas).
    const topCol = await trackOf(page, shot, 'col', 15 * k, 0, 12 * k);
    let best = null;
    for (let x = 10; x < 60 && !best; x += 2) {
      const col = await trackOf(page, shot, 'col', x * k, h - 12 * k, h + 2);
      const ink = col.runs.filter(r => r.ink === true);
      if (ink.length) best = ink[0].n / k;
    }
    const topInk = topCol.runs.filter(r => r.ink === true).map(r => r.n / k);
    return { height: h / k, width: w / k, top: topInk[0] || 0, bottom: best || 0 };
  };
  const small = await thick('#editor-container');
  check(tag + 'éditeur : le cadre de texte à tirets (trait de 6 points) a 6 points d\'épaisseur en haut et en bas', near(small.top, 6, 1.4) && near(small.bottom, 6, 1.4), small);
  await click('#editor-container .pp-free-frame:nth-of-type(4) .pp-free-frame-content');
  const longText = 'Un texte assez long pour que le cadre grandisse sur plusieurs lignes : le trait garde son épaisseur, ses coins ne se déforment pas. '.repeat(2);
  await page.keyboard.type(longText, { delay: 4 });
  await sleep(500);
  const grown = await thick('#editor-container');
  check(tag + `éditeur : le cadre a grandi avec son texte (de ${Math.round(small.height)} à ${Math.round(grown.height)} points) et son trait a gardé son épaisseur (6 points en haut et en bas, pas étiré)`,
    grown.height > small.height * 1.6 && near(grown.top, 6, 1.4) && near(grown.bottom, 6, 1.4), { small, grown });
  await snap(page, `${lang}-cadre-grandi`);
  await press('Control+z');
  await sleep(200);

  // La Lecture : mêmes pixels.
  await click('.pp-slide-item', 0).catch(() => {});
  await leave();
  await click('#btn-mode-read');
  await page.waitForFunction(() => !!document.querySelector('#reader-container .reader-content .pp-free-frame-box'), null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const readerLook = await measure('#reader-container', 'Lecture');
  check(tag + 'la Lecture dessine les mêmes tirets (24 points d\'encre, 18 de vide) et les mêmes points ronds (disques de 6 points, 6 points de vide)', readerLook.visible && within(readerLook.dashRuns, true, 24, 2) && within(readerLook.dashRuns, false, 18, 2) && readerLook.dashRuns.length >= 3 && within(readerLook.dotRuns, true, 6, 1.6) && within(readerLook.dotRuns, false, 6, 1.6) && readerLook.dotRuns.length >= 5, readerLook);
  await snap(page, `${lang}-lecture`);
  await click('#btn-mode-edit');
  await sleep(900);
  // La miniature de la bande et le diaporama : la même image.
  const art = await page.evaluate(() => {
    const read = box => ({ nine: getComputedStyle(box, '::after').borderImageSource, bg: getComputedStyle(box, '::after').backgroundImage });
    return { editor: read(document.querySelector('#editor-container .pp-free-frame-box')), thumbs: Array.from(document.querySelectorAll('.pp-slide-thumb .pp-free-frame-box')).map(read) };
  });
  const isArt = value => /^url\("data:image\/svg\+xml,/.test(value || '');
  check(tag + 'la miniature de la bande peint la même image que l\'éditeur (bordure image des tirets, points ronds, ligne)', art.thumbs.length >= 3 && isArt(art.thumbs[0].nine) && art.thumbs[0].nine === art.editor.nine && art.thumbs.some(th => isArt(th.bg)), { editor: art.editor.nine.slice(0, 60), thumbs: art.thumbs.map(th => [th.nine.slice(0, 40), th.bg.slice(0, 40)]) });
  await click('.pp-slide-item', 0);
  await leave();
  await click('.pp-slide-show-open');
  await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 30000 }).catch(() => {});
  await sleep(700);
  const showArt = await page.evaluate(() => {
    const host = document.querySelector('.pp-slide-show .pp-slide-show-host');
    const shadow = host && host.shadowRoot;
    const boxes = shadow ? Array.from(shadow.querySelectorAll('.pp-free-frame-box')) : [];
    return boxes.map(box => [getComputedStyle(box, '::after').borderImageSource, getComputedStyle(box, '::after').backgroundImage]);
  });
  check(tag + 'le diaporama peint les mêmes images (tirets, points ronds, ligne)', showArt.length >= 3 && isArt(showArt[0][0]) && showArt[0][0] === art.editor.nine && showArt.some(pair => isArt(pair[1])), showArt.map(pair => [pair[0].slice(0, 40), pair[1].slice(0, 40)]));
  await press('Escape');
  await page.waitForFunction(() => !document.querySelector('.pp-slide-show'), null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  await press('Control+0');
  await leave();
}

// Ctrl+Z, avec le focus où il est : un pas d'historique.
async function undo(page, press) { await press('Control+z'); }

await menuPart('fr', 'light');
await pixelPart('fr', 'light');
await menuPart('en', 'dark');
await t.finish();
