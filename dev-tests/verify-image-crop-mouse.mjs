#!/usr/bin/env node
// « Rogner… » de la barre de l'image (js/image-crop.js, css/image-crop.css, js/image-reshape.js ; demande d'Antoine du 09/11, carte « Import + boutons Pivoter et Rogner ») à la VRAIE souris (page.mouse) et au VRAI
// clavier (Tab, flèches, Entrée, Échap, Ctrl+Z, Ctrl+Y), dans le panneau de 700x400 d'Antoine, en français clair puis en anglais sombre. Les cas du groupe « imageReshape » (dev-tests/scenarios-image-reshape.js)
// vérifient, DANS la page, ce que la fenêtre écrit (cadre, points de l'image, largeur, historique, grisé) ; une page.evaluate ne passe ni par la taille du panneau, ni par le premier plan, ni par un glissé de souris :
// c'est ici qu'on s'assure que
//  - la barre de l'image, avec son bouton de plus, tient entière dans le panneau, que « Rogner… » est au premier plan avec son nom, et que l'image sélectionnée garde sa barre ;
//  - la fenêtre s'ouvre ENTIÈRE dans 700x400 (titre, aperçu, deux lignes de texte, boutons), sans faire défiler son contenu, et lisible (4,5:1 au moins) ; l'aperçu garde les proportions de l'image ;
//  - le cadre couvre toute l'image au départ, « Rogner » est grisé, les huit poignées sont des cibles de 24 px au moins, atteignables (au premier plan) ;
//  - un vrai glissé d'une poignée de bord, d'une poignée de coin et du cadre lui-même règle le cadre, qui ne sort jamais de l'image même quand la souris sort de la fenêtre ;
//  - « Rogner » (un vrai clic) redessine l'image, ferme la fenêtre, laisse l'image sélectionnée à l'échelle de la partie gardée ; Ctrl+Z (la vraie touche) rend l'image d'avant, Ctrl+Y la remet ;
//  - au clavier : Tab fait le tour de la fenêtre (les quatre bords, Annuler, Rogner) sans en sortir, les flèches règlent le bord, Entrée rogne, Échap ferme sans toucher l'image ;
//  - une image vectorielle et une image de colonne grisent « Rogner… » avec leur raison et n'ouvrent rien.
// Lancé par run-headless.mjs (groupe Node « imageCropMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-image-crop-mouse.mjs
// IMAGE_CROP_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans lui, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, contrastOf } from './gfs-page.mjs';

const SHOTS = process.env.IMAGE_CROP_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-image-crop-mouse', port: Number(process.env.IMAGE_CROP_MOUSE_PORT || 8897) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TEXTS = {
  fr: { crop: 'Rogner l’image…', title: 'Rogner l’image', apply: 'Rogner', cancel: 'Annuler', nothing: 'Rien à rogner\u00a0: le cadre couvre toute l’image', vector: 'Une image vectorielle (SVG) ne se tourne ni ne se rogne ici : elle perdrait sa netteté', column: 'Une image de colonne, un QR code, un graphique ou une vidéo ne se tourne ni ne se rogne : elle se règle à sa source' },
  en: { crop: 'Crop image…', title: 'Crop image', apply: 'Crop', cancel: 'Cancel', nothing: 'Nothing to crop: the frame covers the whole image', vector: 'A vector image (SVG) cannot be rotated or cropped here: it would lose its sharpness', column: 'An image from a column, a QR code, a chart or a video cannot be rotated or cropped: it is set at its source' },
};
// Quatre quarts de couleurs (rouge, bleu / vert, jaune), 400 x 200, posés dans un document de deux lignes de texte.
const loadImage = (page) => page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 200;
  const g = canvas.getContext('2d');
  [['#ff0000', 0, 0], ['#0000ff', 200, 0], ['#00ff00', 0, 100], ['#ffff00', 200, 100]].forEach(([color, x, y]) => { g.fillStyle = color; g.fillRect(x, y, 200, 100); });
  Editor.setHTML('<p>Avant</p><p><img class="editor-image" src="' + canvas.toDataURL('image/png') + '" alt="" style="width: 240px"></p><p>Après</p>');
});
const rectOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
}, selector);
const imageBox = (page) => rectOf(page, '.tiptap img.editor-image');
const natural = (page) => page.evaluate(() => { const img = document.querySelector('.tiptap img.editor-image'); return { w: img.naturalWidth, h: img.naturalHeight }; });
const colors = (page) => page.evaluate(async () => {
  const img = document.querySelector('.tiptap img.editor-image');
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const g = canvas.getContext('2d');
  g.drawImage(img, 0, 0);
  const at = (fx, fy) => Array.from(g.getImageData(Math.floor(canvas.width * fx), Math.floor(canvas.height * fy), 1, 1).data).slice(0, 3);
  return { tl: at(0.1, 0.25), tr: at(0.9, 0.25), bl: at(0.1, 0.75), br: at(0.9, 0.75) };
});
const is = (px, rgb) => px.every((v, i) => Math.abs(v - rgb[i]) < 40);
const topAt = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return !!hit && (hit === el || el.contains(hit));
}, selector);
const clickAt = async (page, rect) => { await page.mouse.move(rect.cx, rect.cy); await page.mouse.down(); await page.mouse.up(); await sleep(350); };
const drag = async (page, from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await sleep(150);
};
const OPENER = '.v2-image-toolbar button[data-action="crop"]';
const WINDOW = '#pp-crop-modal';
const HANDLE = name => `${WINDOW} .pp-crop-handle[data-handle="${name}"]`;
const OK = `${WINDOW} .var-modal-primary`;
const CANCEL = `${WINDOW} .pp-modal-actions button:not(.var-modal-primary)`;
const current = (page) => page.evaluate(() => ImageCrop.current());
const windowShown = (page) => page.evaluate(() => { const el = document.getElementById('pp-crop-modal'); return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0; });
const selectedWidth = (page) => page.evaluate(() => { const node = EditorCore.getEditor().state.selection.node; return node && node.type.name === 'editorImage' ? node.attrs.width : null; });
const active = (page) => page.evaluate(() => { const el = document.activeElement; return el ? (el.dataset.handle || (el.classList.contains('var-modal-primary') ? 'ok' : (el.closest('#pp-crop-modal') ? 'cancel' : el.tagName))) : null; });
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function run(lang, scheme) {
  const tag = `[${lang} ${scheme}] `;
  const T = TEXTS[lang];
  const { page, context } = await t.openPage({ hosted: false, lang, colorScheme: scheme });
  await loadImage(page);
  await sleep(400);
  const before = await imageBox(page);
  await clickAt(page, before);
  const bar = await rectOf(page, '.v2-image-toolbar.visible');
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  check(tag + 'un clic sur l\'image ouvre sa barre, qui tient entière dans le panneau avec son bouton de plus', !!bar && bar.x >= 0 && bar.right <= 700 && wide <= 700, { bar, wide });
  const opener = await rectOf(page, OPENER);
  check(tag + 'le bouton « ' + T.crop + ' » est dans la barre, à sa taille, au premier plan', !!opener && opener.w >= 24 && opener.h >= 24 && await topAt(page, OPENER), opener);
  const label = await page.evaluate((sel) => { const b = document.querySelector(sel); return { title: b.title, aria: b.getAttribute('aria-label'), disabled: b.getAttribute('aria-disabled') }; }, OPENER);
  check(tag + 'il porte son nom (infobulle et nom accessible) et n\'est pas grisé', label.title === T.crop && label.aria === T.crop && label.disabled !== 'true', label);

  // La fenêtre.
  await clickAt(page, opener);
  check(tag + 'un vrai clic ouvre la fenêtre « ' + T.title + ' »', await windowShown(page));
  await sleep(300);
  const box = await rectOf(page, `${WINDOW} .pp-modal-box`);
  check(tag + 'la fenêtre tient entière dans le panneau de 700x400', !!box && box.x >= 0 && box.y >= 0 && box.right <= 700 && box.bottom <= 400, box);
  check(tag + 'son titre est « ' + T.title + ' »', (await page.textContent(`${WINDOW} h3`)).trim() === T.title);
  const scroll = await page.evaluate(() => { const body = document.querySelector('#pp-crop-modal .pp-modal-body'); return { scrollH: body.scrollHeight, clientH: body.clientHeight, scrollW: body.scrollWidth, clientW: body.clientWidth }; });
  check(tag + 'le contenu ne défile pas (aperçu, taille et aide tiennent sans barre de défilement)', scroll.scrollH <= scroll.clientH + 1 && scroll.scrollW <= scroll.clientW + 1, scroll);
  const preview = await rectOf(page, `${WINDOW} .pp-crop-preview`);
  check(tag + 'l\'aperçu garde les proportions de l\'image (2 pour 1) et se voit', !!preview && preview.w >= 96 && Math.abs(preview.w / preview.h - 2) < 0.04, preview);
  const stage = await rectOf(page, `${WINDOW} .pp-crop-stage`);
  check(tag + 'la scène colle à l\'aperçu', !!stage && !!preview && near(stage.w, preview.w, 1) && near(stage.h, preview.h, 1), { stage, preview });
  const frame0 = await rectOf(page, `${WINDOW} .pp-crop-frame`);
  check(tag + 'le cadre couvre toute l\'image au départ', !!frame0 && near(frame0.x, stage.x, 1) && near(frame0.w, stage.w, 1) && near(frame0.y, stage.y, 1) && near(frame0.h, stage.h, 1), { frame0, stage });
  const okState = await page.evaluate((sel) => document.querySelector(sel).disabled, OK);
  check(tag + '« ' + T.apply + ' » est grisé et la ligne dit qu\'il n\'y a rien à rogner', okState === true && (await page.textContent(`${WINDOW} .pp-crop-size`)).trim() === T.nothing);
  for (const name of ['n', 'e', 's', 'w', 'nw', 'ne', 'se', 'sw']) {
    const r = await rectOf(page, HANDLE(name));
    check(tag + 'poignée « ' + name + ' » : cible de 24 px au moins, dans le panneau, au premier plan', !!r && r.w >= 24 && r.h >= 24 && r.x >= 0 && r.y >= 0 && r.right <= 700 && r.bottom <= 400 && await topAt(page, HANDLE(name)), r);
  }
  for (const sel of [`${WINDOW} .pp-crop-size`, `${WINDOW} .pp-crop-hint`, CANCEL]) {
    const ratio = await contrastOf(page, sel);
    check(tag + 'se lit (4,5:1 au moins) : ' + sel.replace(WINDOW + ' ', ''), ratio >= 4.5, ratio);
  }
  const dim = await page.evaluate(() => getComputedStyle(document.querySelector('#pp-crop-modal .pp-crop-hole')).boxShadow);
  check(tag + 'ce qui est hors du cadre est assombri (l\'ombre du trou)', dim && dim !== 'none', dim);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `fenetre-${lang}-${scheme}.png`) });

  // Glissés à la vraie souris.
  const w = await rectOf(page, HANDLE('w'));
  await drag(page, { x: w.cx, y: w.cy }, { x: w.cx + stage.w * 0.25, y: w.cy });
  let c = await current(page);
  check(tag + 'glisser le bord de gauche de 25 % de la largeur règle le cadre (gauche ≈ 0,25)', near(c.l, 0.25, 0.02) && c.t === 0 && c.r === 0 && c.b === 0, c);
  const s = await rectOf(page, HANDLE('s'));
  await drag(page, { x: s.cx, y: s.cy }, { x: s.cx, y: s.cy - stage.h * 0.5 });
  c = await current(page);
  check(tag + 'glisser le bord du bas de moitié de la hauteur règle le cadre (bas ≈ 0,5)', near(c.b, 0.5, 0.02) && near(c.l, 0.25, 0.02), c);
  const okAfter = await page.evaluate((sel) => document.querySelector(sel).disabled, OK);
  const sizeLine = (await page.textContent(`${WINDOW} .pp-crop-size`)).trim();
  check(tag + '« ' + T.apply + ' » s\'allume et la ligne dit la taille gardée (300 × 100 environ)', okAfter === false && /\b(29\d|30\d)\b/.test(sizeLine) && /\b(9\d|10\d)\b/.test(sizeLine), sizeLine);
  const frame1 = await rectOf(page, `${WINDOW} .pp-crop-frame`);
  check(tag + 'le cadre à l\'écran suit ses parts (gauche, largeur, hauteur)', near(frame1.x, stage.x + stage.w * 0.25, 4) && near(frame1.w, stage.w * 0.75, 4) && near(frame1.h, stage.h * 0.5, 4), { frame1, stage });
  const se = await rectOf(page, HANDLE('se'));
  await drag(page, { x: se.cx, y: se.cy }, { x: se.cx - stage.w * 0.15, y: se.cy - stage.h * 0.1 });
  c = await current(page);
  check(tag + 'glisser le coin bas droit règle le bord de droite ET celui du bas', near(c.r, 0.15, 0.03) && near(c.b, 0.6, 0.03), c);
  // Le cadre entier se déplace, sans sortir de l'image, même quand la souris sort de la fenêtre.
  const f = await rectOf(page, `${WINDOW} .pp-crop-frame`);
  const keepShare = { w: 1 - c.l - c.r, h: 1 - c.t - c.b };
  await drag(page, { x: f.cx, y: f.cy }, { x: 0, y: 0 });
  c = await current(page);
  check(tag + 'déplacer le cadre jusqu\'au coin de l\'écran le colle en haut à gauche sans l\'agrandir ni le rétrécir', near(c.l, 0, 0.001) && near(c.t, 0, 0.001) && near(1 - c.l - c.r, keepShare.w, 0.001) && near(1 - c.t - c.b, keepShare.h, 0.001), { c, keepShare });
  const f2 = await rectOf(page, `${WINDOW} .pp-crop-frame`);
  check(tag + 'le cadre reste dans l\'image', f2.x >= stage.x - 1 && f2.y >= stage.y - 1 && f2.right <= stage.right + 1 && f2.bottom <= stage.bottom + 1, { f2, stage });
  // Remettre le cadre voulu (gauche 0,25, bas 0,5) : déplacer, puis glisser les bords.
  await drag(page, { x: f2.cx, y: f2.cy }, { x: f2.cx + stage.w, y: f2.cy + stage.h });
  c = await current(page);
  check(tag + 'déplacer le cadre jusqu\'au coin opposé le colle en bas à droite', near(c.r, 0, 0.001) && near(c.b, 0, 0.001), c);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `cadre-${lang}-${scheme}.png`) });

  // Au clavier : on repart d'un cadre réglé exactement (Échap, puis la fenêtre rouverte).
  await page.keyboard.press('Escape');
  await sleep(250);
  check(tag + 'Échap ferme la fenêtre sans toucher l\'image', !(await windowShown(page)) && (await natural(page)).w === 400 && (await selectedWidth(page)) === '240px');
  await clickAt(page, await rectOf(page, OPENER));
  check(tag + 'rouverte, la fenêtre repart d\'un cadre entier', await windowShown(page) && (await current(page)).l === 0);
  await sleep(250);
  check(tag + 'le focus est sur la poignée du haut (premier arrêt de Tab)', (await active(page)) === 'n', await active(page));
  const order = [];
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); order.push(await active(page)); }
  check(tag + 'Tab fait le tour : bord de droite, du bas, de gauche, puis « ' + T.cancel + ' » (« ' + T.apply + ' » grisé est sauté)', order.join(',') === 'e,s,w,cancel', order);
  await page.keyboard.press('Tab');
  check(tag + 'Tab ne sort pas de la fenêtre (retour à la poignée du haut)', (await active(page)) === 'n', await active(page));
  await page.keyboard.press('Shift+Tab');
  check(tag + 'Maj+Tab reboucle de même (de la poignée du haut à « ' + T.cancel + ' »)', (await active(page)) === 'cancel', await active(page));
  await page.keyboard.press('Shift+Tab');
  check(tag + 'Maj+Tab revient à la poignée de gauche', (await active(page)) === 'w', await active(page));
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  c = await current(page);
  check(tag + 'deux Maj+flèche droite sur le bord de gauche : gauche = 0,10', near(c.l, 0.1, 0.0005), c);
  check(tag + '« ' + T.apply + ' » s\'allume', (await page.evaluate((sel) => document.querySelector(sel).disabled, OK)) === false);
  await page.keyboard.press('Enter');
  await sleep(600);
  const crop1 = await natural(page);
  check(tag + 'Entrée rogne : fenêtre fermée, image redessinée (360 de large pour 200), échelle gardée (216 px)', !(await windowShown(page)) && crop1.w === 360 && crop1.h === 200 && (await selectedWidth(page)) === '216px', { crop1, w: await selectedWidth(page) });

  // « Rogner » à la souris, sur l'image d'origine : Ctrl+Z puis un glissé.
  await sleep(700);
  await page.keyboard.press('Control+z');
  await sleep(400);
  const back0 = await natural(page);
  check(tag + 'Ctrl+Z rend l\'image d\'avant, à sa largeur', back0.w === 400 && back0.h === 200 && (await selectedWidth(page)) === '240px', { back0, w: await selectedWidth(page) });
  const img1 = await imageBox(page);
  await clickAt(page, img1);
  await clickAt(page, await rectOf(page, OPENER));
  const stage2 = await rectOf(page, `${WINDOW} .pp-crop-stage`);
  const w2 = await rectOf(page, HANDLE('w'));
  await drag(page, { x: w2.cx, y: w2.cy }, { x: w2.cx + stage2.w * 0.25, y: w2.cy });
  const s2 = await rectOf(page, HANDLE('s'));
  await drag(page, { x: s2.cx, y: s2.cy }, { x: s2.cx, y: s2.cy - stage2.h * 0.5 });
  const wanted = await current(page);
  await clickAt(page, await rectOf(page, OK));
  await sleep(600);
  const cropped = await natural(page);
  const shown = await imageBox(page);
  const q = await colors(page);
  check(tag + 'un vrai clic sur « ' + T.apply + ' » ferme la fenêtre et redessine l\'image sur la partie gardée', !(await windowShown(page)) && near(cropped.w, 400 * (1 - wanted.l - wanted.r), 2) && near(cropped.h, 200 * (1 - wanted.t - wanted.b), 2), { cropped, wanted });
  check(tag + 'les couleurs gardées sont celles de la partie choisie (rouge puis bleu, rien de vert ni de jaune)', is(q.tl, [255, 0, 0]) && is(q.tr, [0, 0, 255]) && is(q.bl, [255, 0, 0]) && is(q.br, [0, 0, 255]), q);
  check(tag + 'à l\'écran l\'image garde l\'échelle de la partie gardée (sa largeur et sa hauteur d\'avant × la part gardée)', near(shown.w, img1.w * (1 - wanted.l - wanted.r), 1.5) && near(shown.h, img1.h * (1 - wanted.t - wanted.b), 1.5), { shown, img1, wanted });
  check(tag + 'l\'image reste sélectionnée, sa barre ouverte', !!(await selectedWidth(page)) && !!(await rectOf(page, '.v2-image-toolbar.visible')));
  await sleep(700);
  await page.keyboard.press('Control+z');
  await sleep(400);
  const back1 = await natural(page);
  check(tag + 'Ctrl+Z rend l\'image d\'avant', back1.w === 400 && back1.h === 200 && (await selectedWidth(page)) === '240px', { back1, w: await selectedWidth(page) });
  await page.keyboard.press('Control+y');
  await sleep(400);
  const again = await natural(page);
  check(tag + 'Ctrl+Y la remet', near(again.w, cropped.w, 1) && near(again.h, cropped.h, 1), again);

  // Les images qui ne se rognent pas : le bouton est grisé, dit pourquoi, n'ouvre rien.
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#c33"/></svg>').toString('base64');
  await page.evaluate((src) => Editor.setHTML('<p>Avant</p><p><img class="editor-image" src="' + src + '" alt="" style="width: 200px"></p><p>Après</p>'), svg);
  await sleep(400);
  await clickAt(page, await imageBox(page));
  const greyed = await page.evaluate((sel) => { const b = document.querySelector(sel); return { title: b.title, disabled: b.getAttribute('aria-disabled') }; }, OPENER);
  check(tag + 'une image vectorielle : « Rogner… » est grisé et dit pourquoi', greyed.disabled === 'true' && greyed.title === T.vector, greyed);
  await clickAt(page, await rectOf(page, OPENER));
  check(tag + 'un clic sur le bouton grisé n\'ouvre rien', !(await windowShown(page)));
  await page.evaluate(() => Editor.setHTML('<p>Avant</p><p><img class="editor-image" data-var-table="Factures" data-var-column="Photo" data-var-key="Factures.Photo" alt=""></p><p>Après</p>'));
  await sleep(400);
  await clickAt(page, await imageBox(page));
  const greyedColumn = await page.evaluate((sel) => { const b = document.querySelector(sel); return b ? { title: b.title, disabled: b.getAttribute('aria-disabled') } : null; }, OPENER);
  check(tag + 'une image de colonne : « Rogner… » est grisé et dit pourquoi', !!greyedColumn && greyedColumn.disabled === 'true' && greyedColumn.title === T.column, greyedColumn);
  await context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
