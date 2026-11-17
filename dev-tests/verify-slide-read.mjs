#!/usr/bin/env node
// LES MOTS D'UNE DIAPOSITIVE POSÉE EN BLOC SE SÉLECTIONNENT À LA LECTURE (17/11, « pour la sélection en mode lecture si c'est possible je suis chaud »).
// À l'éditeur, js/slide-words.js pose une couche de texte invisible sur la photo du bloc (essai slideWords). À la Lecture (js/reader-mode.js, renderRecord → `SlideWords.readIn`), la photo n'a pas de vue d'éditeur :
// elle passe dans un cadre en ligne `.pp-slide-read` (css/style.css) qui porte la même couche. Ce que l'essai vérifie, à la vraie souris :
//  - la Lecture montre la photo dans son cadre, avec une couche de 6 mots (« Comité innovation Ordre du jour validé »), sans couleur, cachée aux lecteurs d'écran, chaque mot à la place du mot de l'image (à 2 px près) ;
//  - glisser du premier au deuxième mot sélectionne « Comité innovation » ; Ctrl+C écrit ce texte (un saut de ligne entre deux lignes de l'image) ; un double clic sélectionne un mot ; un clic simple ne sélectionne rien ;
//  - une sélection qui part du texte voisin et passe sur l'image se copie comme le navigateur le fait (la couche n'écrase pas la copie) ;
//  - le zoom de la page (CSS `zoom` sur la feuille, A4 ou volet étroit) ne déplace ni ne déforme les mots : même place, même largeur (à 2 px près) à 70 % et à 150 % ;
//  - la mise en page de la Lecture n'est PAS changée par le cadre : l'image (et la ligne qui la porte) a la même place et la même taille avec et sans cadre, en ligne dans un paragraphe, centrée, en bloc, dans une case de
//    tableau ; une image habillée (alignée à gauche ou à droite), une image dans un lien ou derrière le texte n'a ni cadre ni couche ;
//  - le HTML de sortie de la Lecture (exports, e-mail) ne garde ni cadre ni couche ; de retour à l'édition, le bloc a sa couche d'éditeur et pas de cadre ;
//  - en anglais, thème sombre, la couche est là aussi.
// Lancé par run-headless.mjs (groupe Node « slideRead », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-read.mjs
// `SLIDE_READ_SHOTS=<dossier>` enregistre une capture de la sélection à la Lecture.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-read', port: Number(process.env.SLIDE_READ_PORT || 9145) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SLIDE_READ_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const ACTIVE = ['graphique', 'diapositives'];
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } });

// Le document : un paragraphe, la diapositive posée en bloc (sa photo dessinée par l'extension, comme le volet « Insérer depuis » la pose), un paragraphe.
async function openDoc(lang, colorScheme) {
  const opened = await t.openPage({ hosted: true, stub: { extensions: ACTIVE, langue: lang === 'en' ? 'en' : undefined }, seed: SEED, lang, colorScheme });
  const { page } = opened;
  await page.waitForFunction(() => typeof Editor !== 'undefined' && !!EditorCore.getEditor(), null, { timeout: 30000 });
  const built = await page.evaluate(async () => {
    const editor = EditorCore.getEditor();
    editor.commands.setContent('<p>Avant la diapositive</p><p>Après la diapositive</p>');
    const band = FreeFrame.html({ x: 0, y: 0, w: 60, h: 540, shape: 'rect', fill: '#009de0', layer: 'behind', decorative: '1' }, '');
    const title = FreeFrame.html({ x: 90, y: 120, w: 800, h: 100 }, '<h1><span style="font-size: 44pt">Comité innovation</span></h1>');
    const line = FreeFrame.html({ x: 90, y: 260, w: 800, h: 60 }, '<p><span style="font-size: 28pt">Ordre du jour validé</span></p>');
    const shot = await SlidesEntry.blockSnapshot(band + title + line, null, { rank: 1, total: 1 });
    if (!shot) return { error: 'photo impossible' };
    editor.commands.setTextSelection(1 + 'Avant la diapositive'.length);
    SlideCopies.insertBlock(editor, { shot, width: 500, link: null, slideSource: null });
    return { words: shot.words };
  });
  return { page, built };
}

const readState = page => page.evaluate(() => {
  const hosts = Array.from(document.querySelectorAll('#reader-container .pp-slide-read'));
  const host = hosts[0];
  if (!host) return { hosts: 0 };
  const img = host.querySelector(':scope > img.editor-image');
  const layer = host.querySelector(':scope > .pp-slide-words');
  const ir = img.getBoundingClientRect();
  const words = layer ? Array.from(layer.children).map((s) => { const b = s.getBoundingClientRect(); return { text: s.textContent, x: b.left - ir.left, y: b.top - ir.top, w: b.width, h: b.height, color: getComputedStyle(s).color }; }) : [];
  return { hosts: hosts.length, layer: !!layer, aria: layer && layer.getAttribute('aria-hidden'), pointer: layer && getComputedStyle(layer).pointerEvents, img: { w: ir.width, h: ir.height, left: ir.left, top: ir.top }, words, wordsAttr: JSON.parse(img.getAttribute('data-slide-words') || '[]') };
});
const placeOff = (state, k) => { const [x, y, w, h] = state.wordsAttr[k]; const p = { x: x / 1000 * state.img.w, y: y / 1000 * state.img.h, w: w / 1000 * state.img.w, h: h / 1000 * state.img.h }; const s = state.words[k]; return Math.max(Math.abs(s.x - p.x), Math.abs(s.y - p.y), Math.abs(s.w - p.w), Math.abs(s.h - p.h)); };
const wordPoint = (page, i) => page.evaluate((k) => { const b = document.querySelectorAll('#reader-container .pp-slide-read .pp-slide-word')[k].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, left: b.left, right: b.right }; }, i);
const selected = page => page.evaluate(() => { const l = document.querySelector('#reader-container .pp-slide-read .pp-slide-words'); return { dom: String(getSelection()), words: SlideWords.textOf(l), collapsed: getSelection().isCollapsed }; });
const listenCopy = page => page.evaluate(() => { window.__copied = null; window.__copyListener && window.removeEventListener('copy', window.__copyListener); window.__copyListener = (e) => { window.__copied = { text: e.clipboardData.getData('text/plain'), prevented: e.defaultPrevented }; }; window.addEventListener('copy', window.__copyListener); });
const copied = page => page.evaluate(() => window.__copied);

// --- La Lecture : la photo dans son cadre, avec sa couche de mots.
const { page, built } = await openDoc('fr', 'light');
check('(préparation) la photo de la diapositive est dessinée, avec ses 6 mots', !built.error && built.words.length === 6, built);
await page.click('#btn-mode-read');
await page.waitForSelector('#reader-container .pp-slide-read .pp-slide-words', { timeout: 30000 });
await page.waitForFunction(() => { const i = document.querySelector('#reader-container .pp-slide-read > img.editor-image'); return !!i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 });
await sleep(400);
let S = await readState(page);
check('la Lecture montre la photo dans son cadre, avec une couche de 6 mots, sans couleur, cachée aux lecteurs d’écran', S.hosts === 1 && S.layer && S.words.length === 6 && S.words.every(w => /rgba\(0, 0, 0, 0\)|transparent/.test(w.color)) && S.aria === 'true', S);
const off = S.words.length ? S.words.map((w, k) => placeOff(S, k)) : [99];
check('chaque mot est à la place du mot de l’image, à 2 px près (écart le plus grand : ' + Math.max(...off).toFixed(2) + ' px)', Math.max(...off) <= 2, off);
check('les mots portent « Comité innovation Ordre du jour validé » ; la couche ne prend pas la souris, les mots, si', S.words.map(w => w.text).join(' ') === 'Comité innovation Ordre du jour validé' && S.pointer === 'none', { pointer: S.pointer, words: S.words.map(w => w.text) });

// --- Glisser du premier au deuxième mot, Ctrl+C, double clic, clic simple.
await listenCopy(page);
const w0 = await wordPoint(page, 0);
const w1 = await wordPoint(page, 1);
await page.mouse.move(w0.left + 2, w0.y);
await page.mouse.down();
await page.mouse.move(w1.right - 2, w1.y, { steps: 10 });
await page.mouse.up();
await sleep(300);
let sel = await selected(page);
check('glisser du premier au deuxième mot sélectionne « Comité innovation » (« ' + sel.dom.replace(/\s+/g, ' ') + ' »)', sel.words === 'Comité innovation', sel);
if (SHOTS) await page.screenshot({ path: join(SHOTS, 'lecture-selection.png') });
await page.keyboard.press('Control+C');
await sleep(300);
const cp = await copied(page);
check('Ctrl+C écrit « Comité innovation » (le texte des mots, une espace entre deux mots d’une ligne)', !!cp && cp.text === 'Comité innovation' && cp.prevented, cp);
// Les deux lignes : un saut de ligne entre elles.
const w2 = await wordPoint(page, 2);
const w5 = await wordPoint(page, 5);
await page.keyboard.press('Escape');   // un glisser qui part de mots déjà choisis les déplacerait : la sélection d'avant s'efface d'abord
await page.mouse.move(w0.left + 2, w0.y);
await page.mouse.down();
await page.mouse.move(w5.right - 2, w5.y, { steps: 12 });
await page.mouse.up();
await sleep(300);
sel = await selected(page);
check('glisser sur les deux lignes sélectionne les 6 mots, un saut de ligne entre elles', sel.words === 'Comité innovation\nOrdre du jour validé', sel);
await page.keyboard.press('Control+C');
await sleep(300);
const both = await copied(page);
check('Ctrl+C écrit les deux lignes', !!both && both.text === 'Comité innovation\nOrdre du jour validé', both);
// Un double clic sélectionne un mot ; un clic simple, rien.
await page.mouse.click(w2.x, w2.y);
await sleep(200);
sel = await selected(page);
check('un clic simple sur un mot ne sélectionne aucun texte', sel.collapsed || sel.words === '', sel);
await page.mouse.dblclick(w1.x, w1.y);
await sleep(300);
sel = await selected(page);
check('un double clic sélectionne le mot seul (« innovation »)', sel.words === 'innovation', sel);

// --- Une sélection qui part du texte voisin et traverse l'image : la copie reste celle du navigateur.
await listenCopy(page);
const crossed = await page.evaluate(() => {
  const paragraphs = Array.from(document.querySelectorAll('#reader-container .reader-content p')).filter(p => /Avant la diapositive/.test(p.textContent));
  const layer = document.querySelector('#reader-container .pp-slide-read .pp-slide-words');
  const range = document.createRange();
  range.setStart(paragraphs[0].firstChild, 0);
  range.setEnd(layer.children[1].firstChild, 3);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  return { text: String(selection) };
});
await page.evaluate(() => { document.querySelector('#reader-container').focus && document.querySelector('#reader-container').focus(); });
await page.keyboard.press('Control+C');
await sleep(300);
const cross = await copied(page);
check('une sélection du texte voisin jusque sur l’image n’est pas écrasée par la couche (copie du navigateur : « ' + (crossed.text || '').replace(/\s+/g, ' ').slice(0, 40) + '… »)', !cross || !cross.prevented, { cross, crossed });
await page.evaluate(() => getSelection().removeAllRanges());

// --- Le zoom de la page ne déplace ni ne déforme les mots.
for (const zoom of [0.7, 1.5]) {
  await page.evaluate((z) => { document.querySelector('#reader-container .reader-content').style.zoom = String(z); }, zoom);
  await sleep(400);
  const Z = await readState(page);
  const offZ = Z.words.length ? Z.words.map((w, k) => placeOff(Z, k)) : [99];
  check('au zoom ' + Math.round(zoom * 100) + ' % de la feuille (la photo mesure ' + Z.img.w.toFixed(0) + ' px à l’écran, ' + S.img.w.toFixed(0) + ' à 100 %), chaque mot est à sa place à 2 px près (écart le plus grand : ' + Math.max(...offZ).toFixed(2) + ' px) et mesure ' + (Z.words[0] ? Z.words[0].w.toFixed(0) : '?') + ' px', Z.layer && Z.words.length === 6 && Math.max(...offZ) <= 2 && Math.abs(Z.img.w - S.img.w) > 20, { img: Z.img, offZ });
}
await page.evaluate(() => { document.querySelector('#reader-container .reader-content').style.zoom = ''; });
await sleep(200);

// --- Une couche posée alors que la feuille est déjà zoomée (la Lecture s'ouvre au zoom d'ajustement du volet) a le même corps de texte et le même étirement qu'à 100 % : le corps ne se mesure pas en pixels de l'écran.
const dressed = await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 600; canvas.height = 338;
  const src = canvas.toDataURL('image/png');
  const words = JSON.stringify([[100, 100, 300, 80, 'Comité'], [420, 100, 400, 80, 'innovation'], [100, 300, 500, 80, 'Ordre']]);
  const out = {};
  for (const zoom of [1, 0.6]) {
    const host = document.createElement('div');
    host.className = 'reader-content';
    host.style.cssText = 'width: 640px; position: relative; zoom: ' + zoom;
    host.innerHTML = `<p><img class="editor-image" src="${src}" alt="" style="width: 400px" data-layer="normal" data-slide-words='${words}'></p>`;
    document.querySelector('#reader-container').appendChild(host);
    const img = host.querySelector('img');
    if (!img.complete) await new Promise(r => { img.onload = r; img.onerror = r; });
    SlideWords.readIn(host);
    await new Promise(r => setTimeout(r, 200));
    out[zoom] = Array.from(host.querySelectorAll('.pp-slide-word')).map(s => ({ size: parseFloat(getComputedStyle(s).fontSize), scale: parseFloat((/scaleX\(([\d.]+)\)/.exec(s.style.transform) || [0, 0])[1]) }));
    host.remove();
  }
  return out;
});
const sizeRatio = dressed['0.6'].map((w, k) => w.size / dressed['1'][k].size);
const scaleRatio = dressed['0.6'].map((w, k) => w.scale / dressed['1'][k].scale);
check('posée sur une feuille à 60 %, la couche a le même corps de texte (' + sizeRatio.map(r => r.toFixed(2)).join(', ') + ') et le même étirement (' + scaleRatio.map(r => r.toFixed(2)).join(', ') + ') qu’à 100 %', sizeRatio.every(r => Math.abs(r - 1) < 0.03) && scaleRatio.every(r => Math.abs(r - 1) < 0.05), dressed);

// --- La mise en page de la Lecture ne change pas : l'image et sa ligne ont la même place et la même taille avec et sans cadre.
const layout = await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 600; canvas.height = 338;
  const g = canvas.getContext('2d'); g.fillStyle = '#9ab'; g.fillRect(0, 0, 600, 338);
  const src = canvas.toDataURL('image/png');
  const words = JSON.stringify([[100, 100, 300, 80, 'Un'], [420, 100, 400, 80, 'deux']]);
  const img = (id, extra = '') => `<img class="editor-image" id="${id}" src="${src}" alt="" style="width: 400px" data-layer="normal" data-slide-words='${words}' ${extra}>`;
  const lorem = 'Texte du paragraphe qui court sur plusieurs lignes pour que la ligne de base et le retour à la ligne se voient bien dans la mise en page de la Lecture. ';
  const host = document.createElement('div');
  host.className = 'reader-content';
  host.id = '__layout';
  host.style.cssText = 'width: 640px; position: relative; background: #fff';
  host.innerHTML = `<p id="p1">${lorem}${img('c1')} ${lorem}</p><p id="p2">${img('c2', 'data-align="center"')}</p><p id="p3">${img('c3', 'data-wrap="block"')}</p>`
    + `<p id="p4">${img('c4', 'data-align="left"')} ${lorem}${lorem}</p><p id="p5">${img('c5', 'data-align="right"')} ${lorem}${lorem}</p>`
    + `<table><tbody><tr><td id="p6">${img('c6')}</td></tr></tbody></table><p id="p7"><a href="#cible">${img('c7')}</a></p><p id="p8">${img('c8', 'data-layer="behind"').replace('data-layer="normal"', '')}</p><p id="p9">${img('c9')}</p>`;
  document.querySelector('#reader-container').appendChild(host);
  await Promise.all(Array.from(host.querySelectorAll('img')).map(i => (i.complete ? Promise.resolve() : new Promise(r => { i.onload = r; i.onerror = r; }))));
  const measure = () => Object.fromEntries(Array.from(host.querySelectorAll('img')).map((i) => {
    const r = i.getBoundingClientRect();
    const block = i.closest('p, td');
    const b = block.getBoundingClientRect();
    return [i.id, { x: r.left, y: r.top, w: r.width, h: r.height, blockH: b.height, blockY: b.top }];
  }));
  const before = measure();
  const count = SlideWords.readIn(host);
  const after = measure();
  const wrapped = Object.fromEntries(Array.from(host.querySelectorAll('img')).map(i => [i.id, !!i.parentElement.classList.contains('pp-slide-read')]));
  const layers = Object.fromEntries(Array.from(host.querySelectorAll('img')).map(i => [i.id, !!i.parentElement.querySelector(':scope > .pp-slide-words')]));
  host.remove();
  return { before, after, count, wrapped, layers };
});
const drift = Object.keys(layout.before).map((id) => { const a = layout.before[id]; const b = layout.after[id]; return { id, d: Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h), Math.abs(a.blockH - b.blockH), Math.abs(a.blockY - b.blockY)) }; });
check('cinq images ont reçu un cadre et une couche (deux en ligne, une centrée, une en bloc, une dans une case de tableau) : ' + layout.count + ' couches', layout.count === 5 && ['c1', 'c2', 'c3', 'c6', 'c9'].every(id => layout.wrapped[id] && layout.layers[id]), layout);
check('une image habillée à gauche ou à droite, dans un lien ou derrière le texte n’a ni cadre ni couche', ['c4', 'c5', 'c7', 'c8'].every(id => !layout.wrapped[id] && !layout.layers[id]), layout.wrapped);
check('la mise en page ne bouge pas : l’image et sa ligne gardent place et taille avec le cadre (écart le plus grand : ' + Math.max(...drift.map(d => d.d)).toFixed(2) + ' px)', Math.max(...drift.map(d => d.d)) <= 0.5, drift);

// --- Le HTML de sortie n'a ni cadre ni couche ; de retour à l'édition, le bloc a sa couche d'éditeur.
const out = await page.evaluate(async () => {
  const html = Editor.getHTML(EditorCore.getEditor().state.doc);
  const resolved = await ReaderMode.preview(html, 'PpDepart', { id: 1, Nom: 'Alice', Statut: 'Urgent' });
  return { cadre: /pp-slide-read/.test(resolved), couche: /pp-slide-words|pp-slide-word/.test(resolved), mots: /data-slide-words/.test(resolved) };
});
check('le HTML de sortie de la Lecture (exports, e-mail) ne garde ni cadre ni couche, mais les mots de l’image', !out.cadre && !out.couche && out.mots, out);
await page.click('#btn-mode-edit');
await sleep(800);
const back = await page.evaluate(() => ({ editorLayer: !!document.querySelector('.tiptap .editor-image-view .pp-slide-words'), readFrames: document.querySelectorAll('.tiptap .pp-slide-read').length }));
check('de retour à l’édition, le bloc a sa couche d’éditeur et pas de cadre de Lecture', back.editorLayer && back.readFrames === 0, back);

// --- En anglais, thème sombre.
const B = await openDoc('en', 'dark');
await B.page.click('#btn-mode-read');
await B.page.waitForSelector('#reader-container .pp-slide-read .pp-slide-words', { timeout: 30000 });
await sleep(500);
const dark = await readState(B.page);
check('en anglais, thème sombre, la Lecture a la même couche de 6 mots', dark.hosts === 1 && dark.layer && dark.words.length === 6 && Math.max(...dark.words.map((w, k) => placeOff(dark, k))) <= 2, dark.words && dark.words.length);

await t.finish();
