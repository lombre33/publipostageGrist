#!/usr/bin/env node
// Icônes colorées de la liste des modèles (demande d'Antoine du 21/10 : « dans la drop down de choix des modèles, coloré l'icone comme dans gfs ») à la VRAIE souris, à la taille du panneau Grist
// d'Antoine (700x400), en clair puis en sombre, seul puis hébergé par un GFS simulé (dev-tests/gfs-stub.js). Les scénarios de dev-tests/scenarios-template-tree.js lisent la couleur CALCULÉE dans la
// page ; ici on regarde les pixels d'une vraie capture : une icône peinte en masque n'a de couleur que si le navigateur la peint.
//  SEUL, français, clair : un clic de souris ouvre la liste. Les icônes du document (bleu), de la grille (vert) sont à la couleur de l'explorateur de GFS ; la présentation, grisée (l'extension « diapositives »
//   est éteinte), l'e-mail, le macro-modèle et le dossier gardent celle du texte ; une ligne survolée et la ligne choisie gardent la leur ; le déclencheur suit le modèle ouvert (document bleu, e-mail et
//   macro-modèle neutres) ; « Organiser mes modèles » reste monochrome.
//  HÉBERGÉ, anglais, sombre, extension « diapositives » active : la présentation est orange, ouverte par un clic elle colore le déclencheur ; GFS l'éteint en direct : le déclencheur et la ligne perdent la
//   couleur, rien ne disparaît ; rallumée, l'orange revient.
// Les couleurs attendues sont celles de l'explorateur de GFS (css/gfs.css de GFS : --t-doc, --t-grid, --t-slides), écrites ici et non lues dans la feuille.
// Lancé par run-headless.mjs (groupe Node "templateKindColorsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-template-kind-colors-mouse.mjs
// TEMPLATE_KIND_COLORS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels } from './gfs-page.mjs';

const SHOTS = process.env.TEMPLATE_KIND_COLORS_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-template-kind-colors-mouse', port: Number(process.env.TEMPLATE_KIND_COLORS_PORT || 9097) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Les modèles de gfs-page.mjs (1 « Départ A défaut » document ★, 2 B, 3 C, 4 E email, 5 M macro-modèle, 6 « Futur » présentation) et une grille (7), que cette liste n'ouvre pas.
const SEED = seedModels() + `
  add(7, 'Départ G grille', '<p>Contenu G</p>', false, 'grille');
  stub.state.nextRowId.Publipostage_Modeles = 8;
`;
const ID = { doc: 2, email: 4, macro: 5, slides: 6, grid: 7 };
const COLOURS = {
  light: { document: [47, 111, 237], grille: [46, 125, 50], presentation: [199, 96, 10] },
  dark: { document: [91, 145, 245], grille: [108, 197, 122], presentation: [240, 147, 62] },
};
const rowSel = id => `.tts-popup .tts-row-leaf[data-template-id="${id}"]`;
const rgbOf = css => (css.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);

async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

// Les outils d'une page : position réelle, visibilité (dans le panneau, au premier plan), clic et survol à la vraie souris, couleur calculée et pixels d'une vraie capture.
function toolsOf(page) {
  const centerOf = selector => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }, selector);
  const seen = selector => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 && !!top && (top === el || el.contains(top));
  }, selector);
  const move = async (selector) => {
    const c = await centerOf(selector);
    if (!c) throw new Error('introuvable : ' + selector);
    await page.mouse.move(c.x - 18, c.y); await page.mouse.move(c.x, c.y, { steps: 4 }); await sleep(80);
    return c;
  };
  const click = async (selector) => { const c = await move(selector); await page.mouse.click(c.x, c.y); await sleep(250); };
  const leave = async () => { await page.mouse.move(690, 390, { steps: 5 }); await sleep(150); };
  const listOpen = () => page.evaluate(() => !!document.querySelector('.tts-popup.is-open'));
  const openList = async () => { if (!(await listOpen())) await click('.tts-trigger'); await sleep(150); };
  const colourOf = selector => page.evaluate((sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).color : null; }, selector);
  // Une vraie capture du carré de l'icône (2 px de marge) : le pixel le plus éloigné du fond (celui de la marge) doit être sur la droite fond -> couleur attendue (même taux de couverture sur les trois
  // canaux) et assez couvert. `alpha` : la couverture de ce pixel (0 : fond, 1 : la couleur pleine) ; `resid` : l'écart, en niveaux de 0 à 255, entre ce pixel et cette droite.
  const paint = async (selector, expected) => {
    const box = await page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, selector);
    if (!box || !box.w) return null;
    const png = await page.screenshot({ clip: { x: Math.floor(box.x) - 2, y: Math.floor(box.y) - 2, width: Math.ceil(box.w) + 4, height: Math.ceil(box.h) + 4 } });
    return page.evaluate(async ({ b64, fg }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const bg = [d[0], d[1], d[2]];
      let best = null;
      for (let i = 0; i < d.length; i += 4) {
        const delta = [d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]];
        const dist = Math.hypot(...delta);
        if (!best || dist > best.dist) best = { delta, dist, p: [d[i], d[i + 1], d[i + 2]] };
      }
      const dir = [fg[0] - bg[0], fg[1] - bg[1], fg[2] - bg[2]];
      const len2 = dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2];
      const alpha = (best.delta[0] * dir[0] + best.delta[1] * dir[1] + best.delta[2] * dir[2]) / len2;
      const resid = Math.hypot(best.delta[0] - alpha * dir[0], best.delta[1] - alpha * dir[1], best.delta[2] - alpha * dir[2]);
      return { bg, pixel: best.p, alpha: Math.round(alpha * 100) / 100, resid: Math.round(resid * 10) / 10 };
    }, { b64: png.toString('base64'), fg: expected });
  };
  // « Cette icône est peinte dans cette couleur » : assez couverte, sur la droite fond -> couleur. `against` : la contre-épreuve, l'autre couleur que l'icône ne doit PAS avoir (sinon la mesure ne prouverait rien).
  const painted = async (selector, expected, against) => {
    const mine = await paint(selector, expected);
    const other = against ? await paint(selector, against) : null;
    const ok = !!mine && mine.alpha >= 0.4 && mine.resid <= 14 && (!other || other.resid > 28);
    return { ok, mine, other };
  };
  return { centerOf, seen, move, click, leave, listOpen, openList, colourOf, paint, painted };
}

// Les lignes de la liste, dans le panneau et au premier plan : l'icône de chacune, sa classe, la couleur de sa ligne.
const iconSel = id => `${rowSel(id)} .tts-icon`;
const folderIconSel = '.tts-popup .tts-row-folder .tts-icon';

async function run({ label, hosted, extensions, lang, colorScheme, theme }) {
  console.log(`\n== ${label} ==`);
  const { page } = await t.openPage({ hosted, stub: hosted ? { extensions } : null, seed: SEED, lang, colorScheme });
  const tools = toolsOf(page);
  const want = COLOURS[theme];
  // Un dossier pour la contre-épreuve « dossier neutre » : le document 2 y est rangé.
  await page.evaluate(async () => { await TemplatePreferences.setFolder(2, 'Contrats'); TemplateTreeSelect.refresh(); });
  await sleep(200);

  // La liste s'ouvre au vrai clic sur le déclencheur ; toutes les lignes se voient dans le panneau de 700x400.
  await tools.openList();
  const inPanel = {};
  for (const id of Object.values(ID)) inPanel[id] = await tools.seen(rowSel(id));
  check(`${label} : un clic ouvre la liste et ses sept modèles se voient dans le panneau`, (await tools.listOpen()) && Object.values(inPanel).every(Boolean), inPanel);
  await snap(page, `${label.replace(/\W+/g, '-')}-liste`);

  // Document et grille : la couleur de l'explorateur de GFS, peinte.
  const doc = await tools.painted(iconSel(ID.doc), want.document, rgbOf(await tools.colourOf(`${rowSel(ID.doc)}`)));
  check(`${label} : l'icône d'un document est peinte en ${want.document.join(',')} (la couleur de GFS)`, doc.ok, doc);
  const grid = await tools.painted(iconSel(ID.grid), want.grille, rgbOf(await tools.colourOf(`${rowSel(ID.grid)}`)));
  check(`${label} : l'icône d'une grille est peinte en ${want.grille.join(',')} (la couleur de GFS)`, grid.ok, grid);

  // E-mail, macro-modèle et dossier : la couleur du texte de leur ligne.
  for (const [name, selector, rowSelector] of [['un e-mail', iconSel(ID.email), rowSel(ID.email)], ['un macro-modèle', iconSel(ID.macro), rowSel(ID.macro)], ['un dossier', folderIconSel, '.tts-popup .tts-row-folder']]) {
    const text = rgbOf(await tools.colourOf(rowSelector));
    const neutral = await tools.painted(selector, text, want.document);
    check(`${label} : l'icône d'${name} garde la couleur du texte (${text.join(',')}), pas celle d'un document`, neutral.ok, neutral);
  }

  // La présentation : orange quand l'extension est active (hébergé), sans couleur - grisée avec sa raison - quand elle est éteinte (seul).
  const slidesRow = rgbOf(await tools.colourOf(rowSel(ID.slides)));
  if (extensions && extensions.includes('diapositives')) {
    const slides = await tools.painted(iconSel(ID.slides), want.presentation, slidesRow);
    check(`${label} : l'icône d'une présentation est peinte en ${want.presentation.join(',')} (la couleur de GFS), l'extension étant active`, slides.ok, slides);
  } else {
    const grey = await page.evaluate((sel) => { const row = document.querySelector(sel); return { greyed: row.classList.contains('is-unavailable'), reason: !!row.querySelector('.tts-row-reason') }; }, rowSel(ID.slides));
    const slides = await tools.painted(iconSel(ID.slides), slidesRow, want.presentation);
    check(`${label} : la présentation, grisée (extension éteinte) avec sa raison, n'a aucune couleur : l'icône garde celle de sa ligne`, grey.greyed && grey.reason && slides.ok, { grey, slides });
  }

  // Ligne survolée à la vraie souris : fond de survol, la couleur de l'icône ne change pas.
  await tools.move(rowSel(ID.grid));
  const overRow = await page.evaluate((sel) => { const row = document.querySelector(sel); return { hovered: row.matches(':hover'), bg: getComputedStyle(row).backgroundColor }; }, rowSel(ID.grid));
  const hoverGrid = await tools.painted(iconSel(ID.grid), want.grille, rgbOf(await tools.colourOf(rowSel(ID.grid))));
  check(`${label} : sous la souris, la ligne de la grille a son fond de survol et son icône reste verte`, overRow.hovered && hoverGrid.ok, { overRow, hoverGrid });
  await snap(page, `${label.replace(/\W+/g, '-')}-survol`);
  await tools.leave();

  // Le déclencheur suit le modèle ouvert : le document ouvert au démarrage est bleu ; un clic sur l'e-mail, puis sur le macro-modèle, le rend neutre ; un clic sur le document le rend bleu.
  await page.keyboard.press('Escape'); await sleep(150);
  await tools.leave();
  const barIcon = '.tts-trigger .tts-icon';
  const barText = () => tools.colourOf('.tts-trigger').then(rgbOf);
  const trigger = {};
  trigger.start = await tools.painted(barIcon, want.document, await barText());
  await tools.openList(); await tools.click(rowSel(ID.email)); await tools.leave(); await sleep(250);
  trigger.email = await tools.painted(barIcon, await barText(), want.document);
  await tools.openList(); await tools.click(rowSel(ID.macro)); await tools.leave(); await sleep(250);
  trigger.macro = await tools.painted(barIcon, await barText(), want.document);
  await tools.openList(); await tools.click(rowSel(ID.doc)); await tools.leave(); await sleep(250);
  trigger.doc = await tools.painted(barIcon, want.document, await barText());
  await snap(page, `${label.replace(/\W+/g, '-')}-barre-document`);
  check(`${label} : l'icône du déclencheur est bleue pour le document ouvert, neutre pour l'e-mail et le macro-modèle, bleue de nouveau pour le document`, trigger.start.ok && trigger.email.ok && trigger.macro.ok && trigger.doc.ok, trigger);

  if (hosted && extensions.includes('diapositives')) {
    // Une présentation ouverte au clic colore le déclencheur ; GFS éteint l'extension en direct : le déclencheur perd la couleur, la ligne grisée aussi, rien n'est retiré ; rallumée, l'orange revient.
    await tools.openList(); await tools.click(rowSel(ID.slides)); await tools.leave(); await sleep(400);
    const open = await tools.painted(barIcon, want.presentation, await barText());
    check(`${label} : la présentation ouverte au clic colore le déclencheur en ${want.presentation.join(',')}`, open.ok, open);
    await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
    await sleep(500);
    const off = await tools.painted(barIcon, await barText(), want.presentation);
    await tools.openList();
    const offRow = await page.evaluate((sel) => { const row = document.querySelector(sel); return { there: !!row, greyed: !!row && row.classList.contains('is-unavailable'), reason: !!(row && row.querySelector('.tts-row-reason')) }; }, rowSel(ID.slides));
    const offRowIcon = offRow.there ? await tools.painted(iconSel(ID.slides), rgbOf(await tools.colourOf(rowSel(ID.slides))), want.presentation) : null;
    await snap(page, `${label.replace(/\W+/g, '-')}-extension-eteinte`);
    check(`${label} : GFS éteint l'extension en direct : le déclencheur et la ligne grisée perdent la couleur, la ligne reste dans la liste avec sa raison`, off.ok && offRow.greyed && offRow.reason && !!offRowIcon && offRowIcon.ok, { off, offRow, offRowIcon });
    await page.keyboard.press('Escape'); await sleep(150);
    await page.evaluate(() => window.__gfsStub.setExtensions(['graphique', 'diapositives']));
    await sleep(500);
    const back = await tools.painted(barIcon, want.presentation, await barText());
    check(`${label} : l'extension rallumée, le déclencheur redevient orange`, back.ok, back);
  }

  // « Organiser mes modèles » (même brique de ligne) reste monochrome : l'icône du document y a la couleur du texte de sa ligne.
  await tools.openList();
  const organize = await tools.centerOf('#btn-organize-templates');
  await page.mouse.move(organize.x - 10, organize.y); await page.mouse.move(organize.x, organize.y, { steps: 3 }); await sleep(80); await page.mouse.click(organize.x, organize.y); await sleep(400);
  const windowRow = '#template-organize-list .tts-row-leaf[data-template-id="' + ID.doc + '"]';
  const inWindow = await tools.painted(`${windowRow} .tts-icon`, rgbOf(await tools.colourOf(windowRow)), want.document);
  await snap(page, `${label.replace(/\W+/g, '-')}-organiser`);
  check(`${label} : dans « Organiser mes modèles », l'icône du document garde la couleur du texte (la couleur ne vaut que dans la liste déroulante)`, inWindow.ok, inWindow);
  await page.keyboard.press('Escape'); await sleep(200);
}

await run({ label: 'seul, français, clair', hosted: false, extensions: null, lang: 'fr', colorScheme: 'light', theme: 'light' });
await run({ label: 'hébergé, anglais, sombre', hosted: true, extensions: ['graphique', 'diapositives'], lang: 'en', colorScheme: 'dark', theme: 'dark' });
await t.finish();
