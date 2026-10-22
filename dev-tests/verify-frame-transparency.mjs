#!/usr/bin/env node
// La transparence du fond et du trait d'une forme ou d'une ligne (js/free-frame.js, css/free-frame.css, js/shape-geometry.js ; chantier 3 « Traits et transparence » du plan « Import PowerPoint sans perte »),
// à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active. Ce que
// dev-tests/scenarios-frame-look.js ne peut pas voir depuis la page :
//  LA GLISSIÈRE : sous la palette du fond et sous celle du trait, une ligne « Transparence » (nom, glissière de 0 à 100, valeur dans la langue de la page) entière dans le panneau, lisible (>= 4,5:1) ;
//   un vrai glissé redessine le cadre pendant le geste SANS toucher au document, puis écrit à la fin : un seul pas d'historique ; le menu reste ouvert ; les flèches, Début et Fin règlent au clavier sans
//   déplacer le cadre ; Ctrl+Z et Ctrl+Maj+Z (le focus est sur la glissière) défont et refont le geste, et la glissière reprend la valeur du document ; « Sans remplissage » / « Sans trait » remet la
//   transparence à zéro et grise la glissière, avec sa raison en info-bulle.
//  LE DESSIN : sur les pixels de l'éditeur (page agrandie à 100 % pour que chaque moitié du trait ait quatre pixels), le fond translucide se mêle à la page, la moitié extérieure d'un trait translucide
//   se mêle à la page et sa moitié intérieure au fond (le fond s'arrête au milieu du trait), la Lecture dessine les mêmes pixels, la miniature de la bande et le diaporama les mêmes calques ; un fond
//   transparent à 100 % laisse le cadre sélectionnable d'un clic en son centre ; une ligne translucide est plus claire sur la page.
// Lancé par run-headless.mjs (groupe Node "frameTransparencyMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-frame-transparency.mjs
// FRAME_TRANSPARENCY_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT, chooseObject } from './gfs-page.mjs';

const SHOTS = process.env.FRAME_TRANSPARENCY_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-frame-transparency', port: Number(process.env.FRAME_TRANSPARENCY_PORT || 9152) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const SLIDES = `<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}<p>Trois</p>`;
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Formes', '${SLIDES}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;
// Le fond et le trait que le script pose par la palette (des pastilles de la palette : #ef4444 est le rouge vif, #000000 le noir) et l'épaisseur du plus gros trait de la liste.
const FILL = '#ef4444';
const FILL_RGB = [239, 68, 68];
const LINE = '#000000';
const LINE_RGB = [0, 0, 0];
const LINE_WIDTH = 6;

const TEXTS = {
  fr: {
    name: 'Transparence', fillAria: 'Transparence du fond', lineAria: 'Transparence du trait', value: n => `${n} %`,
    noFillReason: 'Aucun fond à rendre transparent : choisir d\'abord une couleur de fond', noLineReason: 'Aucun trait à rendre transparent : choisir d\'abord une couleur de trait',
    noFill: 'Sans remplissage', noLine: 'Sans trait',
  },
  en: {
    name: 'Transparency', fillAria: 'Fill transparency', lineAria: 'Line transparency', value: n => `${n}%`,
    noFillReason: 'No fill to make transparent: pick a fill color first', noLineReason: 'No line to make transparent: pick a line color first',
    noFill: 'No fill', noLine: 'No line',
  },
};
const near = (a, b, tolerance = 0.6) => typeof a === 'number' && Math.abs(a - b) <= tolerance;
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;
const inside = (inner, outer) => !!inner && !!outer && inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5;
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
// Ce que donne une couleur `src` posée à l'opacité `alpha` sur `under` (huit bits par canal, comme l'écran).
const blend = (src, alpha, under) => src.map((c, i) => Math.round(c * alpha + under[i] * (1 - alpha)));
const closeTo = (rgb, want, tolerance = 7) => Array.isArray(rgb) && rgb.length === 3 && rgb.every((c, i) => Math.abs(c - want[i]) <= tolerance);

// Les outils d'une page ouverte : positions, premier plan, vrais clics (même outillage que dev-tests/verify-shapes.mjs).
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

// Les cadres du texte avec leur aspect, la sélection.
const docState = page => page.evaluate(() => {
  const editor = EditorCore.getEditor();
  const frames = [];
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'freeFrame' || node.type.name === 'freeLine') {
      const a = node.attrs;
      frames.push({ pos: offset, x: a.x, y: a.y, w: a.w, h: a.h, shape: a.shape, fill: a.fill, line: a.line, lw: a.lw, fillTr: a.fillTr, lineTr: a.lineTr });
    }
  });
  const sel = editor.state.selection;
  return { frames, selection: { selectedFrame: !!(sel.node && /^free/.test(sel.node.type.name)), inFrame: !!FreeFrame.frameAround(sel.$from) && !sel.node } };
});

// Le menu de couleur ouvert : son cadre, la ligne « Transparence » et ses parties.
const menuState = (page, key) => page.evaluate((which) => {
  const panel = document.querySelector('.v2-color-dropdown.visible');
  if (!panel) return null;
  const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const row = panel.querySelector('.v2-frame-tr');
  const input = panel.querySelector('[data-role="' + which + '-tr"]');
  const output = row && row.querySelector('output');
  const label = row && row.querySelector('label');
  return {
    panel: rect(panel), row: row ? rect(row) : null, slider: input ? rect(input) : null,
    name: label ? label.textContent.trim() : null, labelFor: label ? label.getAttribute('for') : null, id: input ? input.id : null,
    aria: input ? input.getAttribute('aria-label') : null, valueText: input ? input.getAttribute('aria-valuetext') : null, output: output ? output.textContent : null,
    type: input ? input.type : null, min: input ? input.min : null, max: input ? input.max : null, step: input ? input.step : null,
    value: input ? Number(input.value) : null, disabled: input ? input.disabled : null, title: row ? row.title : null,
    open: panel.classList.contains('visible'),
  };
}, key);
// L'état du cadre sélectionné tel que l'écran le dessine : les variables et l'opacité de ses deux calques.
const drawnState = page => page.evaluate(() => {
  const box = document.querySelector('#editor-container .pp-free-frame-box');
  const own = getComputedStyle(box);
  return { fillOp: own.getPropertyValue('--ff-fill-op').trim(), lineOp: own.getPropertyValue('--ff-line-op').trim(), before: getComputedStyle(box, '::before').opacity, after: getComputedStyle(box, '::after').opacity };
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
// Les couleurs de la capture aux points demandés (pixels depuis le coin haut-gauche de la boîte ; le papier : quatre pixels hors de la boîte).
const pixelsOf = (page, shot, points) => page.evaluate(async ([b64, box, pts]) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const colorAt = (x, y) => { const d = ctx.getImageData(Math.floor(box.left + x), Math.floor(box.top + y), 1, 1).data; return [d[0], d[1], d[2]]; };
  return { paper: colorAt(-4, -4), points: pts.map(([x, y]) => colorAt(x, y)) };
}, [shot.b64, shot.box, points]);

async function run(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { rectOf, hover, click, leave } = toolsOf(page);
  const press = async (key) => { await page.keyboard.press(key); await sleep(260); };
  const open = async (id, slides) => {
    await Promise.race([
      page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
      sleep(20000),
    ]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    if (slides) await page.waitForFunction(n => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === n; }, slides, { timeout: 15000 }).catch(() => {});
    await sleep(900);
  };
  // Les menus de couleur de la barre du cadre : on n'en rouvre un que fermé (le bouton bascule), Échap le ferme quand le focus est au bouton, sinon un clic sur son bouton.
  const menuOpen = () => page.evaluate(() => !!document.querySelector('.v2-color-dropdown.visible'));
  const closeMenu = async () => {
    if (!(await menuOpen())) return;
    await press('Escape');
    if (await menuOpen()) await click('#v2-frame-fill-open[aria-expanded="true"], #v2-frame-line-open[aria-expanded="true"]');
  };
  const openMenu = async (which) => { await closeMenu(); await click(`#v2-frame-${which}-open`); };
  // Une pastille de couleur, le trait ou la liste des épaisseurs de la barre du cadre sélectionné : vrais clics.
  const setFill = async (color) => { await openMenu('fill'); await click(`.v2-color-dropdown.visible [data-color="${color}"]`); };
  const setLine = async (color, width) => {
    await openMenu('line');
    await click(`.v2-color-dropdown.visible [data-color="${color}"]`);
    if (width) { await click('#v2-frame-width-open'); await click(`.v2-frame-width-menu.visible [data-action="width:${width}"]`); }
  };

  // --- 1. La ligne « Transparence » des deux menus de couleur.
  console.log('\n' + tag + '1) La ligne « Transparence » des menus de fond et de trait');
  await open(7, 3);
  await click('.pp-slide-item', 1);
  await chooseObject(page, 'shape:rect');
  await openMenu('fill');
  const fillMenu = await menuState(page, 'fill');
  check(tag + `le menu du fond a, sous la palette, la ligne « ${T.name} » : une glissière de 0 à 100 (pas de 1) à 0, la valeur « ${T.value(0)} », nommée « ${T.fillAria} »`,
    !!fillMenu && fillMenu.name === T.name && fillMenu.type === 'range' && fillMenu.min === '0' && fillMenu.max === '100' && fillMenu.step === '1' && fillMenu.value === 0 && fillMenu.output === T.value(0)
    && fillMenu.aria === T.fillAria && fillMenu.valueText === T.value(0) && fillMenu.labelFor === fillMenu.id && !fillMenu.disabled && !fillMenu.title, fillMenu);
  check(tag + 'le menu et sa ligne sont entiers dans le panneau de 700x400, la ligne sous les pastilles, la glissière assez large pour être saisie (80 pixels au moins)',
    !!fillMenu && inPanel(fillMenu.panel) && inside(fillMenu.row, fillMenu.panel) && fillMenu.row.top > fillMenu.panel.top + 60 && fillMenu.slider.width >= 80, fillMenu);
  const contrast = { name: await contrastOf(page, '.v2-color-dropdown.visible .v2-frame-tr-name'), value: await contrastOf(page, '.v2-color-dropdown.visible .v2-frame-tr-value') };
  check(tag + 'le nom et la valeur de la ligne sont lisibles (contraste de 4,5 au moins sur le fond du menu)', contrast.name >= 4.5 && contrast.value >= 4.5, contrast);
  await snap(page, `${lang}-menu-fond`);
  await closeMenu();
  await openMenu('line');
  const lineMenu = await menuState(page, 'line');
  check(tag + `le menu du trait a la même ligne, nommée « ${T.lineAria} », à 0`, !!lineMenu && lineMenu.name === T.name && lineMenu.type === 'range' && lineMenu.value === 0 && lineMenu.aria === T.lineAria && lineMenu.output === T.value(0) && !lineMenu.disabled && inPanel(lineMenu.panel), lineMenu);
  await closeMenu();
  // Le fond et le trait que le script voile ensuite.
  await setFill(FILL);
  await setLine(LINE, LINE_WIDTH);
  let state = await docState(page);
  check(tag + 'le fond, le trait et son épaisseur sont posés (rouge vif, noir, 6 points), sans transparence', state.frames.length === 1 && state.frames[0].fill === FILL && state.frames[0].line === LINE && state.frames[0].lw === LINE_WIDTH && state.frames[0].fillTr === 0 && state.frames[0].lineTr === 0, state.frames);
  const baseX = state.frames[0].x;
  const baseY = state.frames[0].y;

  // --- 2. Un vrai glissé.
  console.log('\n' + tag + '2) Le glissé, les flèches, Annuler');
  await openMenu('fill');
  const slider = '.v2-color-dropdown.visible [data-role="fill-tr"]';
  const geo = await rectOf(slider);
  const THUMB = 16;
  const xAt = (rect, value) => rect.left + THUMB / 2 + (rect.width - THUMB) * value / 100;
  await page.mouse.move(xAt(geo, 0) - 12, geo.y);
  await page.mouse.move(xAt(geo, 0), geo.y, { steps: 2 });
  await page.mouse.down();
  await page.mouse.move(xAt(geo, 25), geo.y, { steps: 5 });
  await page.mouse.move(xAt(geo, 40), geo.y, { steps: 5 });
  await sleep(250);
  const during = { menu: await menuState(page, 'fill'), drawn: await drawnState(page), doc: (await docState(page)).frames[0] };
  const live = during.menu ? during.menu.value : -1;
  check(tag + 'PENDANT le glissé (souris tenue), la glissière suit la souris (autour de 40), sa valeur s\'écrit à côté, le cadre est redessiné à l\'opacité correspondante', near(live, 40, 3) && during.menu.output === T.value(live) && during.drawn.fillOp === String((100 - live) / 100) && during.drawn.before === String((100 - live) / 100), during);
  check(tag + 'mais le document ne change pas pendant le geste (transparence du fond toujours à 0)', during.doc.fillTr === 0 && during.doc.fill === FILL, during.doc);
  await page.mouse.up();
  await sleep(300);
  state = await docState(page);
  const afterDrag = await menuState(page, 'fill');
  const dragged = afterDrag ? afterDrag.value : -1;
  check(tag + 'au relâchement le document porte la valeur de la glissière (fond à ' + dragged + ' % de transparence), le cadre ne bouge pas, le menu reste ouvert pour ajuster encore',
    state.frames[0].fillTr === dragged && near(dragged, 40, 3) && state.frames[0].x === baseX && state.frames[0].y === baseY && !!afterDrag && afterDrag.open && afterDrag.output === T.value(dragged) && state.selection.selectedFrame, { state: state.frames[0], afterDrag });
  await snap(page, `${lang}-glisse-fond`);
  // Au clavier, le focus étant sur la glissière : une flèche d'un point, Fin = invisible, Début = opaque, sans déplacer le cadre. Plus d'une demi-seconde entre deux gestes : l'historique range ensemble
  // les modifications qui se suivent de plus près (comme les lettres d'un mot), un geste à part n'est un pas à lui que s'il est espacé.
  const gap = () => sleep(700);
  await gap();
  await press('ArrowRight');
  state = await docState(page);
  check(tag + 'la flèche droite ajoute un point (' + (dragged + 1) + ' %), écrit au document, sans déplacer le cadre (le clavier est à la glissière, pas au cadre)', state.frames[0].fillTr === dragged + 1 && state.frames[0].x === baseX && state.frames[0].y === baseY, state.frames[0]);
  await gap();
  await press('End');
  state = await docState(page);
  let drawn = await drawnState(page);
  check(tag + 'Fin règle 100 % : le fond est invisible (opacité 0) mais le trait reste dessiné', state.frames[0].fillTr === 100 && drawn.fillOp === '0' && drawn.before === '0' && drawn.after === '1', { frame: state.frames[0], drawn });
  await gap();
  await press('Home');
  state = await docState(page);
  drawn = await drawnState(page);
  check(tag + 'Début rend le fond opaque (0 %, plus aucune variable de transparence sur le cadre)', state.frames[0].fillTr === 0 && drawn.fillOp === '' && drawn.before === '1', { frame: state.frames[0], drawn });
  // Annuler et Rétablir : un pas d'historique par geste. Le premier Ctrl+Z part avec le focus sur la glissière (js/free-frame.js le confie au bouton Annuler) ; la glissière suit le document.
  await press('Control+z');
  state = await docState(page);
  let synced = await menuState(page, 'fill');
  check(tag + 'Ctrl+Z (le focus est sur la glissière) défait Début d\'un seul coup : le fond revient à 100 %, la glissière reprend la valeur du document', state.frames[0].fillTr === 100 && !!synced && synced.value === 100 && synced.output === T.value(100), { frame: state.frames[0], synced });
  await press('Control+z');
  state = await docState(page);
  synced = await menuState(page, 'fill');
  check(tag + 'le Ctrl+Z suivant défait Fin (' + (dragged + 1) + ' %), la glissière toujours ouverte suit le document', state.frames[0].fillTr === dragged + 1 && !!synced && synced.value === dragged + 1, { frame: state.frames[0], synced });
  await press('Control+z');
  await press('Control+z');
  state = await docState(page);
  synced = await menuState(page, 'fill');
  check(tag + 'puis la flèche, puis le glissé : on revient au fond rouge sans transparence (un pas par geste), le fond lui-même reste, la glissière est à 0', state.frames[0].fillTr === 0 && state.frames[0].fill === FILL && !!synced && synced.value === 0, { frame: state.frames[0], synced });
  await press('Control+Shift+z');
  state = await docState(page);
  synced = await menuState(page, 'fill');
  check(tag + 'Ctrl+Maj+Z rétablit le glissé (' + dragged + ' %), Ctrl+Y la flèche (' + (dragged + 1) + ' %), la glissière suit', state.frames[0].fillTr === dragged && !!synced && synced.value === dragged, { frame: state.frames[0], synced });
  await press('Control+y');
  state = await docState(page);
  synced = await menuState(page, 'fill');
  check(tag + 'Ctrl+Y rétablit la flèche, la glissière suit', state.frames[0].fillTr === dragged + 1 && !!synced && synced.value === dragged + 1, { frame: state.frames[0], synced });
  await closeMenu();

  // --- 3. Le trait translucide : les pixels de l'éditeur, de la Lecture, de la miniature et du diaporama.
  console.log('\n' + tag + '3) Les pixels : fond à 40 %, trait à 50 %');
  // Fond à 40 % : un geste réel (clic sur la glissière à 40) ; trait à 50 % : le clavier (flèche jusqu'à 50 depuis le milieu).
  await openMenu('fill');
  const g2 = await rectOf(slider);
  await page.mouse.click(xAt(g2, 40), g2.y);
  await sleep(300);
  const fillTr = (await docState(page)).frames[0].fillTr;
  await closeMenu();
  await openMenu('line');
  const lineSlider = '.v2-color-dropdown.visible [data-role="line-tr"]';
  const g3 = await rectOf(lineSlider);
  await page.mouse.click(xAt(g3, 50), g3.y);
  await sleep(300);
  state = await docState(page);
  const lineTr = state.frames[0].lineTr;
  check(tag + `un clic sur la glissière du fond (40) et sur celle du trait (50) posent les deux transparences (${fillTr} et ${lineTr}), séparément`, near(fillTr, 40, 3) && near(lineTr, 50, 3) && state.frames[0].fillTr === fillTr, state.frames[0]);
  await closeMenu();
  await snap(page, `${lang}-fond-et-trait`);
  // Le cadre n'est plus sélectionné (sa poignée ne couvre plus le papier) : un clic dans le titre de la diapositive.
  await click('#editor-container .tiptap h2');
  // La page agrandie à 100 % : chaque moitié du trait de 6 points a quatre pixels.
  for (let i = 0; i < 9; i++) {
    const zoom = await page.evaluate(() => EditorCore.layoutZoom(document.querySelector('#editor-container .tiptap')));
    if (zoom >= 0.99) break;
    await press('Control+=');
    await sleep(200);
  }
  const alphaFill = (100 - fillTr) / 100;
  const alphaLine = (100 - lineTr) / 100;
  const sample = async (root, label) => {
    const shot = await shotOfBox(page, root, 0);
    const k = shot.scale;
    const band = LINE_WIDTH * k;
    const half = band / 2;
    const w = shot.box.width;
    const h = shot.box.height;
    const points = [[w / 2, h / 2], [w / 2, half / 2], [w / 2, half + half / 2], [half / 2, h / 2], [half + half / 2, h / 2], [w / 2, h - half / 2], [w / 2, h - half - half / 2]];
    const got = await pixelsOf(page, shot, points);
    const fillOver = blend(FILL_RGB, alphaFill, got.paper);
    const want = {
      centre: fillOver,
      outerTop: blend(LINE_RGB, alphaLine, got.paper), innerTop: blend(LINE_RGB, alphaLine, fillOver),
      outerLeft: blend(LINE_RGB, alphaLine, got.paper), innerLeft: blend(LINE_RGB, alphaLine, fillOver),
      outerBottom: blend(LINE_RGB, alphaLine, got.paper), innerBottom: blend(LINE_RGB, alphaLine, fillOver),
    };
    const names = ['centre', 'outerTop', 'innerTop', 'outerLeft', 'innerLeft', 'outerBottom', 'innerBottom'];
    const gotBy = Object.fromEntries(names.map((n, i) => [n, got.points[i]]));
    return { label, scale: k, band, paper: got.paper, got: gotBy, want, ok: names.every(n => closeTo(gotBy[n], want[n === 'outerBottom' || n === 'innerBottom' ? n : n])), visible: shot.visible };
  };
  const edit = await sample('#editor-container', 'éditeur');
  check(tag + `éditeur à 100 % : le fond rouge à ${fillTr} % de transparence se mêle au papier au centre ; la moitié EXTÉRIEURE du trait noir (${lineTr} %) se mêle au papier, la moitié INTÉRIEURE au fond (il s'arrête au milieu du trait)`, edit.ok && edit.scale >= 1.2, edit);
  // Les mêmes pixels après le passage dans la Lecture.
  await leave();
  await click('#btn-mode-read');
  await page.waitForFunction(() => !!document.querySelector('#reader-container .reader-content .pp-free-frame-box'), null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const readerZoomed = await page.evaluate(() => { const c = document.querySelector('#reader-container .reader-content'); return parseFloat(getComputedStyle(c).zoom) || 1; });
  const reader = await sample('#reader-container', 'Lecture');
  check(tag + 'la Lecture dessine les mêmes pixels que l\'éditeur (fond au centre, moitiés extérieure et intérieure du trait)', reader.ok && reader.scale >= 1.2, { reader, readerZoomed });
  await snap(page, `${lang}-lecture`);
  await click('#btn-mode-edit');
  await sleep(900);
  // La miniature de la bande et le diaporama : mêmes variables, mêmes calques que l'éditeur.
  const looks = await page.evaluate(() => {
    const read = (box) => {
      const own = getComputedStyle(box);
      const before = getComputedStyle(box, '::before');
      const after = getComputedStyle(box, '::after');
      return { fillOp: own.getPropertyValue('--ff-fill-op').trim(), lineOp: own.getPropertyValue('--ff-line-op').trim(), inset: own.getPropertyValue('--ff-fill-inset').trim(), before: before.opacity, after: after.opacity, top: before.top };
    };
    const editor = read(document.querySelector('#editor-container .pp-free-frame-box'));
    const thumbs = Array.from(document.querySelectorAll('.pp-slide-thumb .pp-free-frame-box')).map(read);
    return { editor, thumbs };
  });
  check(tag + `la miniature de la bande a les mêmes calques que l'éditeur : fond à ${alphaFill}, trait à ${alphaLine}, fond rentré d'un demi-trait`,
    looks.thumbs.length === 1 && looks.thumbs[0].before === String(alphaFill) && looks.thumbs[0].after === String(alphaLine) && looks.thumbs[0].fillOp === looks.editor.fillOp && looks.thumbs[0].lineOp === looks.editor.lineOp && looks.thumbs[0].inset === looks.editor.inset && looks.editor.inset !== '', looks);
  await click('.pp-slide-item', 1);
  await leave();
  await click('.pp-slide-show-open');
  await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 30000 }).catch(() => {});
  await sleep(700);
  const showLook = await page.evaluate(() => {
    const host = document.querySelector('.pp-slide-show .pp-slide-show-host');
    const shadow = host && host.shadowRoot;
    const box = shadow && shadow.querySelector('.pp-free-frame-box');
    if (!box) return null;
    return { before: getComputedStyle(box, '::before').opacity, after: getComputedStyle(box, '::after').opacity };
  });
  check(tag + 'le diaporama dessine le fond et le trait aux mêmes opacités', !!showLook && showLook.before === String(alphaFill) && showLook.after === String(alphaLine), showLook);
  await press('Escape');
  await page.waitForFunction(() => !document.querySelector('.pp-slide-show'), null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  await press('Control+0');

  // --- 4. Sans fond, sans trait : la glissière se grise, la transparence retombe à zéro.
  console.log('\n' + tag + '4) Sans remplissage, sans trait');
  await click('.pp-slide-item', 1);
  await chooseObject(page, 'shape:ellipse');
  await setFill(FILL);
  await setLine(LINE, LINE_WIDTH);
  await openMenu('fill');
  const g4 = await rectOf(slider);
  await page.mouse.click(xAt(g4, 60), g4.y);
  await sleep(300);
  await closeMenu();
  state = await docState(page);
  const ellipse = state.frames.find(f => f.shape === 'ellipse');
  check(tag + 'une ellipse reçoit un fond à ' + (ellipse ? ellipse.fillTr : '?') + ' % de transparence', !!ellipse && near(ellipse.fillTr, 60, 3) && ellipse.fill === FILL, ellipse);
  await openMenu('fill');
  await click(`.v2-color-dropdown.visible [data-action="none"]`);
  state = await docState(page);
  const bare = state.frames.find(f => f.shape === 'ellipse');
  check(tag + `« ${T.noFill} » retire le fond ET sa transparence (un fond absent n'est pas voilé)`, !!bare && bare.fill === '' && bare.fillTr === 0 && bare.line === LINE, bare);
  await openMenu('fill');
  const greyed = await menuState(page, 'fill');
  check(tag + `sans fond, la glissière du fond est grisée, à 0, avec sa raison en info-bulle (« ${T.noFillReason} »)`, !!greyed && greyed.disabled === true && greyed.value === 0 && greyed.title === T.noFillReason && greyed.output === T.value(0), greyed);
  await snap(page, `${lang}-grise`);
  // Un clic sur la glissière grisée ne change rien.
  await page.mouse.click(xAt(greyed.slider, 70), greyed.slider.y);
  await sleep(250);
  state = await docState(page);
  check(tag + 'un clic sur la glissière grisée ne change rien', state.frames.find(f => f.shape === 'ellipse').fillTr === 0, state.frames);
  await closeMenu();
  await press('Control+z');
  state = await docState(page);
  const back = state.frames.find(f => f.shape === 'ellipse');
  check(tag + 'un Ctrl+Z rend le fond ET sa transparence (une seule étape)', !!back && back.fill === FILL && near(back.fillTr, 60, 3), back);
  await openMenu('line');
  await click(`.v2-color-dropdown.visible [data-action="none"]`);
  await openMenu('line');
  const noLine = await menuState(page, 'line');
  state = await docState(page);
  const bareLine = state.frames.find(f => f.shape === 'ellipse');
  check(tag + `« ${T.noLine} » : la glissière du trait est grisée à 0 avec sa raison (« ${T.noLineReason} »), la transparence du trait est retombée à 0`, !!noLine && noLine.disabled === true && noLine.value === 0 && noLine.title === T.noLineReason && !!bareLine && bareLine.lineTr === 0 && bareLine.line === '', { noLine, bareLine });
  await closeMenu();
  await press('Control+z');

  // --- 5. Un fond invisible reste un objet qu'on peut saisir ; une ligne translucide.
  console.log('\n' + tag + '5) Un fond à 100 %, une ligne');
  await openMenu('fill');
  const g5 = await rectOf(slider);
  await page.mouse.click(xAt(g5, 100), g5.y);
  await sleep(300);
  await closeMenu();
  state = await docState(page);
  const invisible = state.frames.find(f => f.shape === 'ellipse');
  check(tag + 'l\'ellipse à 100 % de transparence a un fond invisible et un trait dessiné', !!invisible && invisible.fillTr === 100 && invisible.line === LINE, invisible);
  // On clique ailleurs (le titre de la diapositive), puis au centre de l'ellipse : un clic la saisit encore.
  await click('#editor-container .tiptap h2');
  const away = await docState(page);
  const centre = await page.evaluate(() => { const frames = Array.from(document.querySelectorAll('#editor-container .pp-free-frame')); const el = frames.find(f => f.getAttribute('data-ff-shape') === 'ellipse'); const r = el.querySelector('.pp-free-frame-box').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(centre.x - 6, centre.y);
  await page.mouse.click(centre.x, centre.y);
  await sleep(300);
  const grabbed = await docState(page);
  check(tag + 'avec un fond invisible, un clic au centre de la forme la sélectionne ou y place le curseur (on ne perd pas la forme)', !away.selection.selectedFrame && (grabbed.selection.selectedFrame || grabbed.selection.inFrame), { away: away.selection, grabbed: grabbed.selection });
  await closeMenu();
  await click('.pp-slide-item', 1);
  await chooseObject(page, 'line:plain');
  await openMenu('line');
  const lineOnly = await menuState(page, 'line');
  check(tag + 'une ligne a la glissière du trait, active (une ligne a toujours un trait)', !!lineOnly && lineOnly.disabled === false && lineOnly.aria === T.lineAria && inPanel(lineOnly.panel), lineOnly);
  const g6 = await rectOf(lineSlider);
  await page.mouse.click(xAt(g6, 60), g6.y);
  await sleep(300);
  await closeMenu();
  state = await docState(page);
  const theLine = state.frames.find(f => f.shape === 'line');
  const lineDrawn = await page.evaluate(() => { const el = Array.from(document.querySelectorAll('#editor-container .pp-free-frame')).find(f => f.getAttribute('data-ff-shape') === 'line'); const box = el.querySelector('.pp-free-frame-box'); return { before: getComputedStyle(box, '::before').opacity, vars: getComputedStyle(box).getPropertyValue('--ff-fill-op').trim() }; });
  check(tag + 'la ligne à ' + (theLine ? theLine.lineTr : '?') + ' % de transparence est dessinée à l\'opacité du trait (son encre est le premier calque)', !!theLine && near(theLine.lineTr, 60, 3) && lineDrawn.before === String((100 - theLine.lineTr) / 100), { theLine, lineDrawn });
  await leave();
}

await run('fr', 'light', true);
await run('en', 'dark', false);
await t.finish();
