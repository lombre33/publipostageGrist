#!/usr/bin/env node
// « Pivoter et retourner » et « Rogner… » de la barre de l'image (js/image-reshape.js, js/floating-toolbars.js, css/image-reshape.css ; demande d'Antoine du 09/11, carte « Import + boutons Pivoter et Rogner »)
// à la VRAIE souris (page.mouse) et au VRAI clavier (Ctrl+Z, Ctrl+Y), dans le panneau de 700x400 d'Antoine, en français clair puis en anglais sombre. dev-tests/scenarios-image-reshape.js (groupe « imageReshape »)
// vérifie, DANS la page, ce que l'éditeur garde (points de l'image, largeur, historique, grisé) ; une page.evaluate ne passe ni par le survol, ni par le premier plan, ni par la taille du panneau : c'est ici qu'on
// s'assure que
//  - la barre de l'image, avec son nouveau bouton, tient ENTIÈRE dans le panneau (pas de défilement de la page, rien ne déborde à droite) et que le bouton est au premier plan, avec son nom ;
//  - un vrai clic sur le bouton ouvre le menu : ses trois lignes (à gauche, à droite, retourner) entières dans le panneau, lisibles (4,5:1 au moins), la barre reste ouverte, l'image reste sélectionnée ; un second
//    clic sur le bouton ferme le menu ; un clic ailleurs le ferme aussi, avec la barre ;
//  - un vrai clic sur « Pivoter à droite » redessine l'image (largeur et hauteur à l'écran échangées, les couleurs au bon endroit), ferme le menu et laisse l'image sélectionnée, sa barre ouverte ; Ctrl+Z (la vraie
//    touche) rend l'image d'avant à sa taille, Ctrl+Y la remet ; « Retourner » ne change pas la taille à l'écran ;
//  - un bouton grisé (une image de colonne, un SVG) dit pourquoi à l'infobulle, au premier plan, et n'ouvre rien.
// Lancé par run-headless.mjs (groupe Node « imageReshapeMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-image-reshape-mouse.mjs
// IMAGE_RESHAPE_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans lui, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, contrastOf } from './gfs-page.mjs';

const SHOTS = process.env.IMAGE_RESHAPE_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-image-reshape-mouse', port: Number(process.env.IMAGE_RESHAPE_MOUSE_PORT || 8897) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TEXTS = {
  fr: { opener: 'Pivoter et retourner', left: 'Pivoter à gauche', right: 'Pivoter à droite', flip: 'Retourner (miroir gauche-droite)', vector: 'Une image vectorielle (SVG) ne se tourne ni ne se rogne ici : elle perdrait sa netteté', column: 'Une image de colonne, un QR code, un graphique ou une vidéo ne se tourne ni ne se rogne : elle se règle à sa source' },
  en: { opener: 'Rotate and flip', left: 'Rotate left', right: 'Rotate right', flip: 'Flip (mirror left to right)', vector: 'A vector image (SVG) cannot be rotated or cropped here: it would lose its sharpness', column: 'An image from a column, a QR code, a chart or a video cannot be rotated or cropped: it is set at its source' },
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
const imageBox = (page) => page.evaluate(() => { const r = document.querySelector('.tiptap img.editor-image').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
const natural = (page) => page.evaluate(() => { const img = document.querySelector('.tiptap img.editor-image'); return { w: img.naturalWidth, h: img.naturalHeight }; });
const colors = (page) => page.evaluate(async () => {
  const img = document.querySelector('.tiptap img.editor-image');
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const g = canvas.getContext('2d');
  g.drawImage(img, 0, 0);
  const at = (fx, fy) => Array.from(g.getImageData(Math.floor(canvas.width * fx), Math.floor(canvas.height * fy), 1, 1).data).slice(0, 3);
  return { tl: at(0.25, 0.25), tr: at(0.75, 0.25), bl: at(0.25, 0.75), br: at(0.75, 0.75) };
});
const is = (px, rgb) => px.every((v, i) => Math.abs(v - rgb[i]) < 40);
const rectOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
}, selector);
// L'élément qui reçoit le pointeur au centre du bouton : le bouton lui-même (ou un de ses enfants), jamais autre chose.
const topAt = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return !!hit && (hit === el || el.contains(hit));
}, selector);
const clickAt = async (page, rect) => { await page.mouse.move(rect.cx, rect.cy); await page.mouse.down(); await page.mouse.up(); await sleep(350); };
const OPENER = '.v2-image-toolbar button[data-action="reshape"]';
const ROW = action => `.v2-image-menu button[data-action="${action}"]`;
const selectedImageWidth = (page) => page.evaluate(() => { const node = EditorCore.getEditor().state.selection.node; return node && node.type.name === 'editorImage' ? node.attrs.width : null; });
const menuShown = (page) => page.evaluate(() => [...document.querySelectorAll('.v2-image-menu')].some(el => el.classList.contains('visible') && el.getClientRects().length > 0));

async function run(lang, scheme) {
  const tag = `[${lang} ${scheme}] `;
  const T = TEXTS[lang];
  const { page } = await t.openPage({ hosted: false, lang, colorScheme: scheme });
  await loadImage(page);
  await sleep(400);
  const before = await imageBox(page);
  await clickAt(page, before);
  check(tag + 'un clic sur l\'image ouvre sa barre', !!(await rectOf(page, '.v2-image-toolbar.visible')));
  const bar = await rectOf(page, '.v2-image-toolbar.visible');
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  check(tag + 'la barre tient entière dans le panneau (rien ne déborde à droite ni à gauche, la page ne défile pas)', !!bar && bar.x >= 0 && bar.right <= 700 && wide <= 700, { bar, wide });
  const opener = await rectOf(page, OPENER);
  check(tag + 'le bouton « ' + T.opener + ' » est dans la barre, à sa taille, au premier plan', !!opener && opener.w >= 24 && opener.h >= 24 && await topAt(page, OPENER), opener);
  const label = await page.evaluate((sel) => { const b = document.querySelector(sel); return { title: b.title, aria: b.getAttribute('aria-label'), haspopup: b.getAttribute('aria-haspopup'), expanded: b.getAttribute('aria-expanded') }; }, OPENER);
  check(tag + 'il porte son nom (infobulle et nom accessible) et annonce un menu fermé', label.title === T.opener && label.aria === T.opener && label.haspopup === 'true' && label.expanded === 'false', label);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `barre-${lang}-${scheme}.png`) });

  await clickAt(page, opener);
  check(tag + 'un vrai clic ouvre le menu, le bouton l\'annonce ouvert', await menuShown(page) && (await page.getAttribute(OPENER, 'aria-expanded')) === 'true');
  const menu = await rectOf(page, '.v2-image-menu.visible');
  check(tag + 'le menu tient entier dans le panneau', !!menu && menu.x >= 0 && menu.y >= 0 && menu.right <= 700 && menu.bottom <= 400, menu);
  for (const [action, key] of [['turn-left', 'left'], ['turn-right', 'right'], ['flip', 'flip']]) {
    const row = await rectOf(page, ROW(action));
    check(tag + 'la ligne « ' + T[key] + ' » : son texte, dans le menu, au premier plan', !!row && (await page.textContent(ROW(action))).trim() === T[key] && row.x >= 0 && row.right <= 700 && await topAt(page, ROW(action)), row);
    const ratio = await contrastOf(page, ROW(action));
    check(tag + 'la ligne « ' + T[key] + ' » se lit (4,5:1 au moins)', ratio >= 4.5, ratio);
  }
  check(tag + 'la barre reste ouverte et l\'image sélectionnée', !!(await rectOf(page, '.v2-image-toolbar.visible')) && (await selectedImageWidth(page)) === '240px');
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `menu-${lang}-${scheme}.png`) });
  await clickAt(page, opener);
  check(tag + 'un second clic sur le bouton ferme le menu', !(await menuShown(page)) && (await page.getAttribute(OPENER, 'aria-expanded')) === 'false');

  // Pivoter à droite.
  await clickAt(page, opener);
  await clickAt(page, await rectOf(page, ROW('turn-right')));
  await sleep(300);
  const turned = await imageBox(page);
  const size = await natural(page);
  const q = await colors(page);
  check(tag + 'pivoter à droite : l\'image est redessinée, 200 x 400 points', size.w === 200 && size.h === 400, size);
  check(tag + 'pivoter à droite : le vert en haut à gauche, le rouge à sa droite, le jaune en dessous', is(q.tl, [0, 255, 0]) && is(q.tr, [255, 0, 0]) && is(q.bl, [255, 255, 0]) && is(q.br, [0, 0, 255]), q);
  check(tag + 'pivoter à droite : à l\'écran la largeur et la hauteur sont échangées (l\'ancienne hauteur devient la largeur)', Math.abs(turned.w - before.h) < 2 && Math.abs(turned.h - before.w) < 2, { before, turned });
  check(tag + 'pivoter à droite : le menu est refermé, la barre ouverte, l\'image sélectionnée', !(await menuShown(page)) && !!(await rectOf(page, '.v2-image-toolbar.visible')) && !!(await selectedImageWidth(page)), await selectedImageWidth(page));
  await sleep(700);
  await page.keyboard.press('Control+z');
  await sleep(400);
  const back = await imageBox(page);
  const backSize = await natural(page);
  check(tag + 'Ctrl+Z rend l\'image d\'avant, à sa taille', backSize.w === 400 && backSize.h === 200 && Math.abs(back.w - before.w) < 2 && Math.abs(back.h - before.h) < 2, { backSize, back, before });
  await page.keyboard.press('Control+y');
  await sleep(400);
  const again = await natural(page);
  check(tag + 'Ctrl+Y la remet', again.w === 200 && again.h === 400, again);

  // Retourner : la taille à l'écran ne bouge pas, le bleu et le rouge sont échangés.
  await page.keyboard.press('Control+z');
  await sleep(400);
  const straight = await imageBox(page);
  await clickAt(page, straight);
  await clickAt(page, await rectOf(page, OPENER));
  await clickAt(page, await rectOf(page, ROW('flip')));
  await sleep(300);
  const mirrored = await imageBox(page);
  const m = await colors(page);
  check(tag + 'retourner : le bleu et le rouge échangés, le jaune et le vert aussi', is(m.tl, [0, 0, 255]) && is(m.tr, [255, 0, 0]) && is(m.bl, [255, 255, 0]) && is(m.br, [0, 255, 0]), m);
  check(tag + 'retourner : la taille à l\'écran ne change pas', Math.abs(mirrored.w - straight.w) < 2 && Math.abs(mirrored.h - straight.h) < 2, { straight, mirrored });

  // Un clic ailleurs ferme le menu avec la barre (sous l'image : la barre est posée au-dessus d'elle, sur le paragraphe d'avant).
  await clickAt(page, await rectOf(page, OPENER));
  check(tag + 'le menu est rouvert', await menuShown(page));
  const text = await page.evaluate(() => { const p = [...document.querySelectorAll('.tiptap p')].find(el => /Après/.test(el.textContent)); const r = document.createRange(); r.selectNodeContents(p); const b = r.getBoundingClientRect(); return { cx: b.x + 8, cy: b.y + b.height / 2 }; });
  await clickAt(page, text);
  check(tag + 'un clic dans le texte ferme le menu et la barre', !(await menuShown(page)) && !(await rectOf(page, '.v2-image-toolbar.visible')), await menuShown(page));

  // Les images qui ne se redessinent pas : le bouton est grisé, dit pourquoi, n'ouvre rien.
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#c33"/></svg>').toString('base64');
  await page.evaluate((src) => Editor.setHTML('<p>Avant</p><p><img class="editor-image" src="' + src + '" alt="" style="width: 200px"></p><p>Après</p>'), svg);
  await sleep(400);
  await clickAt(page, await imageBox(page));
  const greyed = await page.evaluate((sel) => { const b = document.querySelector(sel); return { title: b.title, disabled: b.getAttribute('aria-disabled') }; }, OPENER);
  check(tag + 'une image vectorielle : le bouton est grisé et dit pourquoi', greyed.disabled === 'true' && greyed.title === T.vector, greyed);
  check(tag + 'le bouton grisé reste au premier plan (l\'infobulle s\'affiche) et un clic dessus n\'ouvre rien', await topAt(page, OPENER) && (await (async () => { await clickAt(page, await rectOf(page, OPENER)); return !(await menuShown(page)); })()));
  await page.evaluate(() => Editor.setHTML('<p>Avant</p><p><img class="editor-image" data-var-table="Factures" data-var-column="Photo" data-var-key="Factures.Photo" alt=""></p><p>Après</p>'));
  await sleep(400);
  const varBox = await page.evaluate(() => { const r = document.querySelector('.tiptap img.editor-image').getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
  await clickAt(page, varBox);
  const greyedColumn = await page.evaluate((sel) => { const b = document.querySelector(sel); return b ? { title: b.title, disabled: b.getAttribute('aria-disabled') } : null; }, OPENER);
  check(tag + 'une image de colonne : le bouton est grisé et dit pourquoi', !!greyedColumn && greyedColumn.disabled === 'true' && greyedColumn.title === T.column, greyedColumn);
  await page.context().close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
