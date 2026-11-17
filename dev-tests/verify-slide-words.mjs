#!/usr/bin/env node
// LES MOTS D'UNE DIAPOSITIVE POSÉE EN BLOC SE SÉLECTIONNENT ET SE COPIENT SUR L'IMAGE (14/11, « on ne pourra pas sélectionner un mot directement sur l'image pour le copier... est-ce que ça ne pourrait pas être le cas ? »).
// Le bloc (extensions/diapositives/slide-raster.js) garde ses mots avec leur place (`slideWords`) ; js/slide-words.js en fait une couche de texte INVISIBLE sur l'image, un <span> par mot à la place du mot, que
// l'éditeur (js/editor-nodes.js, la vue d'image) laisse à la sélection du navigateur : glisser sur des mots, double clic, Ctrl+C écrivent le texte des mots ; un clic simple choisit le bloc comme avant.
// À la vraie souris et au vrai clavier, 700x400, français clair, l'app dans le cadre isolé de GFS : « Devis » à l'écran, la présentation « Support » dont la diapositive 1 dit « Comité innovation » puis « Ordre du jour
// validé » en dessous.
//  - le bloc porte une couche de texte : un <span> par mot (autant que `slideWords`), sans couleur, à la place du mot (à 2 px près) ; la couche ne prend pas la souris hors des mots ;
//  - glisser du premier au deuxième mot sélectionne « Comité innovation » (le texte du navigateur), le clavier est dans la couche ; Ctrl+C écrit « Comité innovation » (une espace entre deux mots d'une ligne) ;
//    sur les deux lignes : un saut de ligne entre elles ; l'image n'est pas copiée à sa place ;
//  - un clic simple sur un mot ne sélectionne aucun texte : il choisit le bloc (poignées), comme un clic sur l'image ; un double clic sélectionne le mot seul ;
//  - tant que la couche a le clavier, une frappe ou Retour arrière ne touche pas le document ; Échap efface la sélection et rend le clavier au texte ;
//  - redimensionné aux poignées, le bloc garde ses mots à leur place ; un quart de tour de l'image vide les mots et la diapositive gardée, pas le texte (Ctrl+F) ;
//  - enregistré puis relu, le bloc retrouve sa couche ; en anglais, thème sombre, la couche est là aussi.
// Lancé par run-headless.mjs (groupe Node « slideWords », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-words.mjs
// `SLIDE_WORDS_SHOTS=<dossier>` enregistre une capture de la sélection sur l'image.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-words', port: Number(process.env.SLIDE_WORDS_PORT || 9143) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SLIDE_WORDS_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (tab, name) => { if (SHOTS) await tab.page.screenshot({ path: join(SHOTS, name + '.png') }); };
const ACTIVE = ['graphique', 'diapositives'];

// Les gestes à la vraie souris et au vrai clavier : les éléments se lisent dans le cadre de l'app (`app`), la souris et le clavier sont ceux de l'onglet (`page`), décalés de la place du
// cadre dans la page parente.
function toolsOf(tab) {
  const { page, app } = tab;
  let shift = null;
  const offset = async () => {
    if (!shift) {
      const frame = app === page ? null : await app.frameElement();
      const box = frame ? await frame.boundingBox() : null;
      shift = box ? { x: box.x, y: box.y } : { x: 0, y: 0 };
    }
    return shift;
  };
  const inPage = async (c) => { if (!c) return c; const o = await offset(); return Object.assign({}, c, { x: c.x + o.x, y: c.y + o.y }); };
  const centerOf = (selector, index = 0) => app.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right };
  }, [selector, index]);
  // La souris arrive près de la cible, puis glisse dessus : un long trajet passerait sur les menus au survol de la barre d'outils.
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const click = async (selector, index = 0, settle = 250) => {
    const c = await inPage(await centerOf(selector, index));
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(settle);
  };
  // Le menu « Lien et blocs de contenu » : il s'ouvre au survol de son icône (la souris arrive d'en dessous), et se quitte par le coin bas droit du panneau.
  const openMenu = async () => {
    const c = await inPage(await centerOf('#v2-btn-link'));
    await page.mouse.move(c.x, c.y + 120);
    await page.mouse.move(c.x, c.y, { steps: 4 });
    await sleep(500);
    return c;
  };
  const leaveMenu = async () => { await page.mouse.move(670, 380, { steps: 3 }); await sleep(300); };
  // Une ligne du menu, à la vraie souris : la main descend de l'icône sur la ligne, sans quitter le volet, et clique.
  const clickRow = async (id, settle = 700) => {
    const c = await openMenu();
    // Le menu a dix lignes et défile à 700x400 (depuis « Vidéo », d2e0656, la dernière - « Diapositive d'une présentation… » - est sous le bas du menu) : la molette, la souris posée sur le menu, amène
    // la ligne voulue dans sa partie visible. Sans cela le clic tombait sous le bas de la fenêtre et le volet ne s'ouvrait pas (« .pp-slide-import .ss-trigger » introuvable).
    for (let i = 0; i < 6; i++) {
      const hidden = await app.evaluate((rowId) => {
        const f = document.getElementById('v2-blocks-flyout').getBoundingClientRect();
        const r = document.getElementById(rowId).getBoundingClientRect();
        return r.bottom > f.bottom - 1 || r.top < f.top;
      }, id);
      if (!hidden) break;
      const spot = await inPage(await centerOf('#v2-row-link'));
      await page.mouse.move(spot.x, spot.y + 40, { steps: 3 });
      await page.mouse.wheel(0, 120);
      await sleep(150);
    }
    const r = await inPage(await centerOf('#' + id));
    const x = Math.min(Math.max(c.x, r.left + 8), r.right - 8);
    await page.mouse.move(x, r.y, { steps: 8 });
    await sleep(100);
    await page.mouse.click(x, r.y);
    await sleep(settle);
  };
  // Une miniature du volet amenée dans la partie visible de sa liste par la molette de la souris, posée sur la liste.
  const showThumb = async (index, selector = '.pp-slide-import') => {
    for (let i = 0; i < 12; i++) {
      const at = await app.evaluate(([k, root]) => {
        const list = document.querySelector(root + ' .pp-slide-import-list, ' + root + ' .pp-slide-strip-list');
        const thumb = document.querySelectorAll(root + ' .pp-slide-thumb')[k];
        if (!list || !thumb) return null;
        const l = list.getBoundingClientRect();
        const r = thumb.getBoundingClientRect();
        return { list: { x: l.left + l.width / 2, y: l.top + l.height / 2 }, dy: r.top < l.top ? r.top - l.top - 8 : r.bottom > l.bottom ? r.bottom - l.bottom + 8 : 0 };
      }, [index, selector]);
      if (!at || !at.dy) return;
      const c = await inPage(at.list);
      await reach(c);
      await page.mouse.wheel(0, at.dy);
      await sleep(250);
    }
  };
  const clickThumb = async (index, settle = 250) => { await showThumb(index); await click('.pp-slide-import .pp-slide-thumb', index, settle); };
  // Le texte `text` d'un bloc de l'éditeur, amené à l'écran : un clic juste avant sa dernière lettre (le curseur au bout du texte).
  const clickText = async (text) => {
    const c = await inPage(await app.evaluate((whole) => {
      const block = Array.from(document.querySelectorAll('#editor-container .tiptap > *')).find(el => el.textContent === whole);
      if (!block) return null;
      block.scrollIntoView({ block: 'center' });
      const node = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, node.textContent.length);
      const r = range.getBoundingClientRect();
      return { x: r.right - 1, y: r.top + r.height / 2 };
    }, text));
    if (!c) throw new Error('texte introuvable : ' + text);
    await sleep(200);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(250);
  };
  const press = async (key) => { await page.keyboard.press(key); await sleep(220); };
  // Le choix d'une source dans la liste avec recherche du volet : un clic, le début du nom, Entrée.
  const pickSource = async (query) => {
    await click('.pp-slide-import .ss-trigger', 0, 400);
    await page.keyboard.type(query);
    await sleep(250);
    await press('Enter');
    await sleep(500);
  };
  return { click, clickRow, openMenu, leaveMenu, clickThumb, showThumb, clickText, press, pickSource, reach, inPage, centerOf };
}


// La présentation : un bandeau bleu, un titre et, dessous, une ligne de texte ; deux diapositives (la seconde, sans rien à dire de plus, pour que le volet ait une liste).
async function buildSlides() {
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: seedModels(), lang: 'fr', colorScheme: 'light' });
  await page.waitForFunction(() => typeof Editor !== 'undefined' && !!EditorCore.getEditor(), null, { timeout: 30000 });
  const html = await page.evaluate(() => {
    const MARK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
    const band = FreeFrame.html({ x: 0, y: 0, w: 60, h: 540, shape: 'rect', fill: '#009de0', layer: 'behind', decorative: '1' }, '');
    const title = FreeFrame.html({ x: 90, y: 120, w: 800, h: 100 }, '<h1><span style="font-size: 44pt">Comité innovation</span></h1>');
    const line = FreeFrame.html({ x: 90, y: 260, w: 800, h: 60 }, '<p><span style="font-size: 28pt">Ordre du jour validé</span></p>');
    return band + title + line + MARK + band + FreeFrame.html({ x: 90, y: 200, w: 800, h: 100 }, '<h1><span style="font-size: 44pt">Deuxième</span></h1>');
  });
  await page.context().close();
  return html;
}

const slides = await buildSlides();
const INTRO = '<p>Helene SCHWALM revient sur les décisions du dernier Comité.</p><p>Merci à toutes et à tous.</p>';
const SEED = seedModels() + `
  m.Contenu[0] = ${JSON.stringify(INTRO)};
  m.id.push(8); m.Nom.push('Support'); m.Contenu.push(window.__SLIDES); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(false); m.TypeModele.push('presentation');
  stub.state.nextRowId.Publipostage_Modeles = 10;
  m.Jeton = m.id.map(() => '');
`;

const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE }, seed: SEED, init: `window.__SLIDES = ${JSON.stringify(slides)};`, lang: 'fr', colorScheme: 'light' });
const { page, app } = A;
const a = toolsOf(A);
await sleep(1500);

const watchStatus = (tab = app) => tab.evaluate(() => {
  const el = document.getElementById('status-msg');
  window.__statusSeen = [];
  if (window.__statusWatch) window.__statusWatch.disconnect();
  window.__statusWatch = new MutationObserver(() => window.__statusSeen.push(el.textContent));
  window.__statusWatch.observe(el, { childList: true, characterData: true, subtree: true });
});
const waitSaid = (pattern, timeout = 60000, tab = app) => tab.waitForFunction(p => window.__statusSeen.some(m => new RegExp(p).test(m)), pattern.source, { timeout }).then(() => true, () => false);
const docHtml = () => app.evaluate(() => Editor.getHTML(EditorCore.getEditor().state.doc));
// Le bloc-diapositive : ses attributs utiles.
const blockAttrs = () => app.evaluate(() => { let out = null; EditorCore.getEditor().state.doc.descendants((n) => { if (!out && n.type.name === 'editorImage' && n.attrs.slideText) out = { words: (n.attrs.slideWords || []).map(w => w.slice()), text: n.attrs.slideText, width: n.attrs.width, hasSource: !!n.attrs.slideSource }; }); return out; });
// Les mots de la couche : leur texte, leur place à l'écran (dans la page de l'app, `img` : la photo) et leur couleur.
const layerState = () => app.evaluate(() => {
  const view = document.querySelector('#editor-container .tiptap .editor-image-view.editor-image-slide');
  if (!view) return null;
  const layer = view.querySelector(':scope > .pp-slide-words');
  if (!layer) return { layer: false };
  const img = view.querySelector('img');
  const r = img.getBoundingClientRect();
  const words = Array.from(layer.children).map((s) => { const b = s.getBoundingClientRect(); return { text: s.textContent, x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height, color: getComputedStyle(s).color }; });
  return { layer: true, aria: layer.getAttribute('aria-hidden'), img: { w: r.width, h: r.height }, words, pointer: getComputedStyle(layer).pointerEvents, wordPointer: layer.firstChild ? getComputedStyle(layer.firstChild).pointerEvents : null };
});
// Les mots que la sélection du navigateur touche, si elle est DANS la couche de texte (la sélection d'un bloc entier, que ProseMirror pose autour de l'image, n'en est pas une).
const selectedText = () => app.evaluate(() => {
  const layer = document.querySelector('#editor-container .tiptap .editor-image-view.editor-image-slide .pp-slide-words');
  const sel = document.getSelection();
  if (!layer || !sel.rangeCount || sel.isCollapsed || !layer.contains(sel.anchorNode)) return '';
  return SlideWords.textOf(layer);
});
const activeIs = () => app.evaluate(() => { const el = document.activeElement; return el ? (el.classList.contains('pp-slide-words') ? 'layer' : el.classList.contains('ProseMirror') ? 'editor' : el.tagName) : ''; });
const nodeSelected = () => app.evaluate(() => { const n = EditorCore.getEditor().state.selection.node; return n ? n.type.name : ''; });
// Un point sur l'image du bloc, en pixels de la page : le centre du mot `at` de la couche.
const wordPoint = (at) => app.evaluate((i) => {
  const view = document.querySelector('#editor-container .tiptap .editor-image-view.editor-image-slide');
  view.scrollIntoView({ block: 'center' });
  const s = view.querySelector('.pp-slide-words').children[i];
  const b = s.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, left: b.left, right: b.right, top: b.top, bottom: b.bottom };
}, at);
// Un clip de copie : écoute la copie (en dernier, après la couche) et garde le texte qu'elle a écrit.
const listenCopy = () => app.evaluate(() => { window.__copied = null; window.__copyListener && window.removeEventListener('copy', window.__copyListener); window.__copyListener = (e) => { window.__copied = { text: e.clipboardData.getData('text/plain'), html: e.clipboardData.getData('text/html'), prevented: e.defaultPrevented }; }; window.addEventListener('copy', window.__copyListener); });
const copied = () => app.evaluate(() => window.__copied);

// --- Le volet : « En bloc » est choisi d'abord ; la diapositive 1 est posée.
await a.clickText('Helene SCHWALM revient sur les décisions du dernier Comité.');
await a.clickRow('v2-btn-slide-text', 900);
await a.leaveMenu();
await a.pickSource('support');
await watchStatus();
await a.clickThumb(0, 0);
check('la diapositive 1 est posée en bloc', await waitSaid(/1 de « Support » posée en bloc\./), null);
await sleep(600);
const attrs = await blockAttrs();
const words = (attrs && attrs.words.map(w => w[4])) || [];
check('le bloc garde ses mots : « Comité », « innovation », « Ordre », « du », « jour », « validé » (6 mots)', words.join(' ') === 'Comité innovation Ordre du jour validé', words);

// --- La couche de texte : un <span> par mot, invisible, à la place du mot.
let L = await layerState();
check('le bloc porte une couche de texte, un mot par <span> (6), sans couleur, cachée aux lecteurs d’écran', !!L && L.layer && L.words.length === 6 && L.words.every(w => /rgba\(0, 0, 0, 0\)|transparent/.test(w.color)) && L.aria === 'true', L && { layer: L.layer, n: L.words && L.words.length, color: L.words && L.words[0] && L.words[0].color });
const place = (w, k) => { const [x, y, ww, h] = attrs.words[k]; return { x: x / 1000 * L.img.w, y: y / 1000 * L.img.h, w: ww / 1000 * L.img.w, h: h / 1000 * L.img.h }; };
const off = L && L.words ? L.words.map((w, k) => { const p = place(w, k); return Math.max(Math.abs(w.x - p.x), Math.abs(w.y - p.y), Math.abs(w.w - p.w), Math.abs(w.h - p.h)); }) : [99];
check('chaque mot est à la place du mot de l’image, à 2 px près (écart le plus grand : ' + Math.max(...off).toFixed(2) + ' px)', Math.max(...off) <= 2, off);
check('la couche ne prend pas la souris (la photo reste cliquable) ; les mots, si', !!L && L.pointer === 'none' && L.wordPointer === 'auto', L && { pointer: L.pointer, word: L.wordPointer });

// --- Glisser du premier mot au deuxième sélectionne « Comité innovation » ; Ctrl+C l'écrit.
await listenCopy();
const w0 = await wordPoint(0);
const w1 = await wordPoint(1);
const from = await a.inPage({ x: w0.left + 2, y: w0.y });
const to = await a.inPage({ x: w1.right - 2, y: w1.y });
await a.reach(from);
await page.mouse.down();
await page.mouse.move(to.x, to.y, { steps: 10 });
await page.mouse.up();
await sleep(400);
check('glisser du premier au deuxième mot sélectionne « Comité innovation » (le texte du navigateur)', (await selectedText()) === 'Comité innovation', await selectedText());
check('le clavier est dans la couche de texte (l’éditeur ne recopie pas la sélection : elle reste)', (await activeIs()) === 'layer', await activeIs());
await shot(A, 'mots-selection');
await page.keyboard.press('Control+c');
await sleep(300);
let clip = await copied();
check('Ctrl+C écrit « Comité innovation » (une espace entre deux mots d’une ligne), sans l’image', !!clip && clip.text === 'Comité innovation' && clip.html === '' && clip.prevented, clip);

// Les deux lignes : du premier mot au dernier (la sélection d'avant s'efface d'abord : un glisser qui part d'un texte choisi le déplacerait).
await page.keyboard.press('Escape');
await sleep(250);
const w5 = await wordPoint(5);
const fromAll = await a.inPage({ x: w0.left + 2, y: (await wordPoint(0)).y });
const toAll = await a.inPage({ x: w5.right - 2, y: w5.y });
await a.reach(fromAll);
await page.mouse.down();
await page.mouse.move(toAll.x, toAll.y, { steps: 14 });
await page.mouse.up();
await sleep(400);
await listenCopy();
await page.keyboard.press('Control+c');
await sleep(300);
clip = await copied();
check('sur les deux lignes : « Comité innovation » puis « Ordre du jour validé », un saut de ligne entre elles', !!clip && clip.text === 'Comité innovation\nOrdre du jour validé', clip);

// --- Une frappe ou Retour arrière, la couche ayant le clavier, ne touche pas le document.
const before = await docHtml();
await page.keyboard.type('x');
await page.keyboard.press('Backspace');
await page.keyboard.press('Delete');
await sleep(300);
check('la couche a le clavier : une frappe, Retour arrière et Suppr ne changent pas le document', (await docHtml()) === before && (await blockAttrs()) !== null, null);

// --- Échap efface la sélection et rend le clavier au texte.
await page.keyboard.press('Escape');
await sleep(300);
check('Échap efface la sélection et le clavier revient dans le texte', (await selectedText()) === '' && (await activeIs()) === 'editor', { sel: await selectedText(), active: await activeIs() });

// --- Un clic simple choisit le bloc ; un double clic sélectionne le mot seul.
const click0 = await a.inPage(await wordPoint(2));
await a.reach(click0);
await page.mouse.click(click0.x, click0.y);
await sleep(400);
check('un clic simple sur un mot choisit le bloc (poignées), aucun texte n’est sélectionné', (await nodeSelected()) === 'editorImage' && (await selectedText()) === '' && (await app.evaluate(() => document.querySelectorAll('.tiptap .editor-image-view.editor-image-selected .editor-image-handle').length)) === 4, { node: await nodeSelected(), sel: await selectedText() });
const click3 = await a.inPage(await wordPoint(3));
await a.reach(click3);
await page.mouse.dblclick(click3.x, click3.y);
await sleep(400);
check('un double clic sélectionne le mot seul (« du »)', (await selectedText()) === 'du', await selectedText());
await page.keyboard.press('Escape');
await sleep(200);

// --- Redimensionné aux poignées, le bloc garde ses mots à leur place.
const imgBox = () => app.evaluate(() => { const r = document.querySelector('#editor-container .tiptap .editor-image-view.editor-image-slide img').getBoundingClientRect(); return { w: r.width, h: r.height }; });
const sizeBefore = await imgBox();
const pointer = await a.inPage(await wordPoint(0));
await a.reach(pointer);
await page.mouse.click(pointer.x, pointer.y);
await sleep(300);
const corner = await a.inPage(await a.centerOf('.tiptap .editor-image-view.editor-image-selected .editor-image-handle-nw'));
await a.reach(corner);
await page.mouse.down();
await page.mouse.move(corner.x + 120, corner.y + 40, { steps: 8 });
await page.mouse.up();
await sleep(600);
const sizeAfter = await imgBox();
L = await layerState();
const offAfter = L && L.words ? L.words.map((w, k) => { const p = place(w, k); return Math.max(Math.abs(w.x - p.x), Math.abs(w.y - p.y), Math.abs(w.w - p.w), Math.abs(w.h - p.h)); }) : [99];
check('redimensionné (' + Math.round(sizeBefore.w) + ' → ' + Math.round(sizeAfter.w) + ' px), le bloc garde ses mots à leur place (écart le plus grand : ' + Math.max(...offAfter).toFixed(2) + ' px)', sizeAfter.w < sizeBefore.w - 60 && Math.max(...offAfter) <= 2, { sizeBefore, sizeAfter, offAfter });

// --- Enregistré puis relu : la couche se refait.
const saved = await app.evaluate(() => {
  const ed = EditorCore.getEditor();
  const html = Editor.getHTML(ed.state.doc);
  const body = HtmlSanitize.parseInert(html);
  const doc = SlideLinks.kit().libs.PMDOMParser.fromSchema(ed.schema).parse(body);
  let back = null;
  doc.descendants((n) => { if (!back && n.type.name === 'editorImage' && n.attrs.slideText) back = (n.attrs.slideWords || []).length; });
  return { words: back };
});
check('enregistré puis relu, le bloc garde ses 6 mots', saved.words === 6, saved);

// --- Un quart de tour : les mots et la diapositive gardée sont vidés, le texte reste.
await app.evaluate(() => { const ed = EditorCore.getEditor(); let at = -1; ed.state.doc.descendants((n, pos) => { if (at < 0 && n.type.name === 'editorImage' && n.attrs.slideText) at = pos; }); ed.commands.setNodeSelection(at); });
await sleep(200);
const turned = await app.evaluate(async () => { const ed = EditorCore.getEditor(); return ImageReshape.run(ed, 'turn-right'); });
await sleep(600);
const after = await blockAttrs();
L = await layerState();
check('un quart de tour de l’image (' + turned + ') vide les mots et la diapositive gardée, et le texte reste pour Ctrl+F ; la couche disparaît', turned === true && !!after && after.words.length === 0 && !after.hasSource && /Comité innovation/.test(after.text) && !!L && L.layer === false, { after, L: L && L.layer });

// --- En anglais, thème sombre : la couche est là aussi.
const B = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: 'en' }, seed: SEED, init: `window.__SLIDES = ${JSON.stringify(slides)};`, lang: 'en', colorScheme: 'dark' });
const b = toolsOf(B);
await sleep(1500);
const appB = B.app;
await b.clickText('Helene SCHWALM revient sur les décisions du dernier Comité.');
await b.clickRow('v2-btn-slide-text', 900);
await b.leaveMenu();
await b.pickSource('support');
await watchStatus(appB);
await b.clickThumb(0, 0);
check('[en dark] la diapositive 1 est posée en bloc', await waitSaid(/Slide 1 from “Support” placed as a block\./, 60000, appB), null);
await sleep(600);
const darkLayer = await appB.evaluate(() => { const l = document.querySelector('#editor-container .tiptap .editor-image-view.editor-image-slide .pp-slide-words'); return l ? { n: l.children.length, color: getComputedStyle(l.firstChild).color } : null; });
check('[en dark] la couche de texte est là (6 mots, sans couleur)', !!darkLayer && darkLayer.n === 6 && /rgba\(0, 0, 0, 0\)|transparent/.test(darkLayer.color), darkLayer);

await t.finish();
