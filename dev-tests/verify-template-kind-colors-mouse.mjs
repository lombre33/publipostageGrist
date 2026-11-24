#!/usr/bin/env node
// Icônes colorées de la liste des modèles (demande d'Antoine du 21/10 : « dans la drop down de choix des modèles, coloré l'icone comme dans gfs ») à la VRAIE souris, à la taille du panneau Grist
// d'Antoine (700x400), en clair puis en sombre, seul puis hébergé par un GFS simulé (dev-tests/gfs-stub.js). Les scénarios de dev-tests/scenarios-template-tree.js lisent la couleur CALCULÉE dans la
// page ; ici on regarde les pixels d'une vraie capture : une icône peinte en masque n'a de couleur que si le navigateur la peint.
// Demande du 24/11 (« icône macro modèle colorée avec chaque segment de la couleur de l'une des autres ; mail aussi prendre l'une des couleurs non utilisées », version B de la carte) : l'e-mail est
// violet, le macro-modèle a trois feuilles (devant bleue comme un document, milieu verte comme une grille, derrière orange comme une présentation) : chaque feuille se mesure dans sa propre zone de
// l'icône (un bord qui n'appartient qu'à elle).
//  SEUL, français, clair : un clic de souris ouvre la liste. Les icônes du document (bleu), de la grille (vert) sont à la couleur de l'explorateur de GFS ; l'e-mail est violet, les trois feuilles du
//   macro-modèle bleue, verte et orange ; la présentation, grisée (l'extension « diapositives » est éteinte), et le dossier gardent la couleur du texte ; une ligne survolée et la ligne choisie gardent la leur ;
//   le déclencheur suit le modèle ouvert (document bleu, e-mail violet, macro-modèle bleu, vert et orange) ; « Organiser mes documents » reste monochrome, macro-modèle et e-mail compris.
//  HÉBERGÉ, anglais, sombre, extension « diapositives » active : la présentation est orange, ouverte par un clic elle colore le déclencheur ; GFS l'éteint en direct : le déclencheur et la ligne perdent la
//   couleur, rien ne disparaît ; rallumée, l'orange revient.
// Les couleurs attendues sont celles de l'explorateur de GFS (css/gfs.css de GFS : --t-doc, --t-grid, --t-slides) et le violet de l'e-mail (--t-email), écrites ici et non lues dans la feuille.
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
  light: { document: [47, 111, 237], grille: [46, 125, 50], presentation: [199, 96, 10], email: [122, 63, 196] },
  dark: { document: [91, 145, 245], grille: [108, 197, 122], presentation: [240, 147, 62], email: [183, 148, 246] },
};
// Les trois feuilles du macro-modèle, chacune dans une zone où elle est seule (fractions du carré de 14 px ; viewBox de 24) : le bord gauche de la feuille de devant (tracé à x = 2), le bord droit de la
// feuille du milieu (x = 17, entre le bord droit de celle de devant, 14, et celui de celle de derrière, 20,5), le bord droit de la feuille de derrière (x = 20,5).
const SHEET_ZONE = { devant: { x0: 0, x1: 0.17, y0: 0.5, y1: 0.9 }, milieu: { x0: 0.66, x1: 0.75, y0: 0.4, y1: 0.7 }, derriere: { x0: 0.82, x1: 0.9, y0: 0.2, y1: 0.55 } };
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
  const paint = async (selector, expected, zone) => {
    const box = await page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, selector);
    if (!box || !box.w) return null;
    const png = await page.screenshot({ clip: { x: Math.floor(box.x) - 2, y: Math.floor(box.y) - 2, width: Math.ceil(box.w) + 4, height: Math.ceil(box.h) + 4 } });
    return page.evaluate(async ({ b64, fg, zone, w, h }) => {
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
        if (zone) { const px = (i / 4) % c.width, py = Math.floor(i / 4 / c.width); if (px < 2 + zone.x0 * w || px > 2 + zone.x1 * w || py < 2 + zone.y0 * h || py > 2 + zone.y1 * h) continue; }
        const delta = [d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]];
        const dist = Math.hypot(...delta);
        if (!best || dist > best.dist) best = { delta, dist, p: [d[i], d[i + 1], d[i + 2]] };
      }
      const dir = [fg[0] - bg[0], fg[1] - bg[1], fg[2] - bg[2]];
      const len2 = dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2];
      const alpha = (best.delta[0] * dir[0] + best.delta[1] * dir[1] + best.delta[2] * dir[2]) / len2;
      const resid = Math.hypot(best.delta[0] - alpha * dir[0], best.delta[1] - alpha * dir[1], best.delta[2] - alpha * dir[2]);
      return { bg, pixel: best.p, alpha: Math.round(alpha * 100) / 100, resid: Math.round(resid * 10) / 10 };
    }, { b64: png.toString('base64'), fg: expected, zone: zone || null, w: box.w, h: box.h });
  };
  // « Cette icône est peinte dans cette couleur » : assez couverte, sur la droite fond -> couleur. `against` : la contre-épreuve, l'autre couleur que l'icône ne doit PAS avoir (sinon la mesure ne prouverait rien).
  const painted = async (selector, expected, against, zone) => {
    const mine = await paint(selector, expected, zone);
    const other = against ? await paint(selector, against, zone) : null;
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

  // E-mail : violet. Macro-modèle : la feuille de devant bleue (celle du document), la feuille de derrière orange (celle de la présentation), chacune dans sa zone, avec pour contre-épreuve l'autre couleur.
  const emailRowText = rgbOf(await tools.colourOf(rowSel(ID.email)));
  const email = await tools.painted(iconSel(ID.email), want.email, emailRowText);
  check(`${label} : l'icône d'un e-mail est peinte en ${want.email.join(',')} (le violet, que rien d'autre ne porte)`, email.ok, email);
  const macro = {
    devant: await tools.painted(iconSel(ID.macro), want.document, want.presentation, SHEET_ZONE.devant),
    milieu: await tools.painted(iconSel(ID.macro), want.grille, want.document, SHEET_ZONE.milieu),
    derriere: await tools.painted(iconSel(ID.macro), want.presentation, want.grille, SHEET_ZONE.derriere),
  };
  check(`${label} : l'icône d'un macro-modèle a sa feuille de devant bleue (${want.document.join(',')}), celle du milieu verte (${want.grille.join(',')}) et celle de derrière orange (${want.presentation.join(',')})`, macro.devant.ok && macro.milieu.ok && macro.derriere.ok, macro);
  // Le dossier garde la couleur du texte de sa ligne.
  const folderText = rgbOf(await tools.colourOf('.tts-popup .tts-row-folder'));
  const folder = await tools.painted(folderIconSel, folderText, want.document);
  check(`${label} : l'icône d'un dossier garde la couleur du texte (${folderText.join(',')}), pas celle d'un document`, folder.ok, folder);

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

  // Le déclencheur suit le modèle ouvert : le document ouvert au démarrage est bleu ; un clic sur l'e-mail le rend violet, sur le macro-modèle bleu et orange (une feuille chacune) ; un clic sur le document le rend bleu.
  await page.keyboard.press('Escape'); await sleep(150);
  await tools.leave();
  const barIcon = '.tts-trigger .tts-icon';
  const barText = () => tools.colourOf('.tts-trigger').then(rgbOf);
  const trigger = {};
  trigger.start = await tools.painted(barIcon, want.document, await barText());
  await tools.openList(); await tools.click(rowSel(ID.email)); await tools.leave(); await sleep(250);
  trigger.email = await tools.painted(barIcon, want.email, want.document);
  await snap(page, `${label.replace(/\W+/g, '-')}-barre-email`);
  await tools.openList(); await tools.click(rowSel(ID.macro)); await tools.leave(); await sleep(250);
  trigger.macroDevant = await tools.painted(barIcon, want.document, want.presentation, SHEET_ZONE.devant);
  trigger.macroMilieu = await tools.painted(barIcon, want.grille, want.document, SHEET_ZONE.milieu);
  trigger.macroDerriere = await tools.painted(barIcon, want.presentation, want.grille, SHEET_ZONE.derriere);
  await snap(page, `${label.replace(/\W+/g, '-')}-barre-macro`);
  await tools.openList(); await tools.click(rowSel(ID.doc)); await tools.leave(); await sleep(250);
  trigger.doc = await tools.painted(barIcon, want.document, await barText());
  await snap(page, `${label.replace(/\W+/g, '-')}-barre-document`);
  check(`${label} : l'icône du déclencheur est bleue pour le document ouvert, violette pour l'e-mail, bleue, verte et orange (une feuille chacune) pour le macro-modèle, bleue de nouveau pour le document`, trigger.start.ok && trigger.email.ok && trigger.macroDevant.ok && trigger.macroMilieu.ok && trigger.macroDerriere.ok && trigger.doc.ok, trigger);

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

  // « Organiser mes documents » (même brique de ligne) reste monochrome : l'icône du document, celle de l'e-mail et les trois feuilles du macro-modèle y ont la couleur du texte de leur ligne.
  await tools.openList();
  const organize = await tools.centerOf('#btn-organize-templates');
  await page.mouse.move(organize.x - 10, organize.y); await page.mouse.move(organize.x, organize.y, { steps: 3 }); await sleep(80); await page.mouse.click(organize.x, organize.y); await sleep(400);
  const windowRow = id => '#template-organize-list .tts-row-leaf[data-template-id="' + id + '"]';
  // La liste de la fenêtre défile dans 400 px de haut : chaque ligne mesurée est d'abord ramenée en vue (une ligne hors du cadre se capturerait vide).
  const intoView = id => page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center' }), windowRow(id)).then(() => sleep(120));
  await intoView(ID.doc);
  const inWindow = await tools.painted(`${windowRow(ID.doc)} .tts-icon`, rgbOf(await tools.colourOf(windowRow(ID.doc))), want.document);
  await intoView(ID.email);
  const emailInWindow = await tools.painted(`${windowRow(ID.email)} .tts-icon`, rgbOf(await tools.colourOf(windowRow(ID.email))), want.email);
  await intoView(ID.macro);
  const macroText = rgbOf(await tools.colourOf(windowRow(ID.macro)));
  const macroInWindow = [];
  for (const [zone, other] of [['devant', want.document], ['milieu', want.grille], ['derriere', want.presentation]]) macroInWindow.push(await tools.painted(`${windowRow(ID.macro)} .tts-icon`, macroText, other, SHEET_ZONE[zone]));
  await snap(page, `${label.replace(/\W+/g, '-')}-organiser`);
  check(`${label} : dans « Organiser mes documents », les icônes du document, de l'e-mail et du macro-modèle (ses trois feuilles) gardent la couleur du texte (la couleur ne vaut que dans la liste déroulante)`, inWindow.ok && emailInWindow.ok && macroInWindow.every(m => m.ok), { inWindow, emailInWindow, macroInWindow });
  await page.keyboard.press('Escape'); await sleep(200);
}

await run({ label: 'seul, français, clair', hosted: false, extensions: null, lang: 'fr', colorScheme: 'light', theme: 'light' });
await run({ label: 'hébergé, anglais, sombre', hosted: true, extensions: ['graphique', 'diapositives'], lang: 'en', colorScheme: 'dark', theme: 'dark' });
await t.finish();
