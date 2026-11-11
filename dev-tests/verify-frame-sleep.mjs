#!/usr/bin/env node
// Les cadres ENDORMIS d'un très gros diaporama (js/frame-sleep.js, css/free-frame.css ; 11/11, un PowerPoint de 57 diapositives et 2 400 cadres : « une fois load ça reste super laggy, impossible de
// travailler sur les slides »). Un cadre loin de l'écran et de la sélection porte la classe FreeFrame.ASLEEP (`display: none` sur son ancre, dans l'éditeur seulement) : le navigateur ne le met plus en page
// ni ne le dessine, et ProseMirror n'en sait rien. À la vraie souris et au vrai clavier, 700x400, GFS simulé, extension « diapositives » active, un diaporama fabriqué de 30 diapositives et 750 cadres :
//  1. au repos : près de l'écran tout est éveillé, loin tout dort (au moins 80 % des cadres), le texte est le même à l'octet près et ne porte jamais la classe, la hauteur du texte ne change pas ;
//  2. AUCUNE lecture de géométrie (getBoundingClientRect, getClientRects, offsetHeight…) dans un cadre endormi pendant les gestes courants : taper, défiler à la molette, cliquer une miniature, la
//     pagination qui suit (une lecture témoin, faite exprès sur un endormi, est bien comptée : l'essai ne compte pas dans le vide) ;
//  3. une miniature cliquée réveille sa diapositive AVANT que la sélection y soit écrite : la diapositive est éveillée, la sélection y est, le curseur a un rectangle à l'écran ; celle qu'on quitte se rendort ;
//  4. un Ctrl+Z qui ramène loin en arrière (la frappe était sur la première diapositive, la personne est partie à la 25e) remet le curseur à l'écran, dans une diapositive éveillée ;
//  5. la TOURNÉE : un style qui change la hauteur des cadres sans toucher à leur texte (thème, police) change aussi la réponse « ce cadre dépasse de la page » des endormis, que personne ne relit ; après un
//     instant de calme, la tournée les revoit (par morceaux, sans geste) et les points rouges de la bande suivent, dans les deux sens ;
//  6. une diapositive glissée à la fin (la demande « déplacer une diapo ») : le texte est dans le bon ordre, aucun cadre endormi dans une diapositive qui devrait être éveillée, le curseur à l'écran ;
//  7. sous 600 cadres rien ne dort (et un texte qui redevient léger réveille tout) ; la chaîne enregistrée ne porte jamais la classe.
// Lancé par run-headless.mjs (groupe Node « frameSleep », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-frame-sleep.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-frame-sleep', port: Number(process.env.FRAME_SLEEP_PORT || 8897) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const SLIDES = 30;
const FRAMES = 24;                 // cadres de texte par diapositive, plus son titre : 25 cadres, 750 en tout (MIN_FRAMES vaut 600)
const ID = 7;

// --- Le texte : fabriqué dans une première page (FreeFrame.html est celui de l'éditeur), puis semé dans le faux Grist ---
async function buildText() {
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: seedModels(), lang: 'fr', colorScheme: 'light' });
  await page.waitForFunction(() => typeof Editor !== 'undefined' && !!EditorCore.getEditor(), null, { timeout: 20000 });
  const html = await page.evaluate(({ slides, frames }) => {
    const MARK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
    let out = '';
    for (let n = 1; n <= slides; n++) {
      if (n > 1) out += MARK;
      out += FreeFrame.html({ x: 40, y: 20, w: 560, h: 60 }, `<h1>Diapositive ${n}</h1>`);
      for (let i = 0; i < frames; i++) out += FreeFrame.html({ x: 20 + (i % 8) * 110, y: 100 + Math.floor(i / 8) * 60, w: 100, h: 50 }, `<p>Texte ${n}.${i} un peu de contenu</p>`);
    }
    Editor.setHTML(out);
    return Editor.getHTML();
  }, { slides: SLIDES, frames: FRAMES });
  await page.close();
  return html;
}
const text = await buildText();
const seed = seedModels() + `
  const mm = stub.state.rows.Publipostage_Modeles;
  mm.id.push(${ID}); mm.Nom.push('Gros diaporama'); mm.Contenu.push(${JSON.stringify(text)}); mm.NomFichierPDF.push(''); mm.HeaderFooter.push(''); mm.DateModif.push(1790000100); mm.Margins.push(''); mm.EstParDefaut.push(false); mm.TypeModele.push('presentation');
  stub.state.nextRowId.Publipostage_Modeles = 8;
`;
check('le texte fabriqué est un diaporama de ' + SLIDES + ' diapositives et ' + (SLIDES * (FRAMES + 1)) + ' cadres (au-dessus du seuil de 600)', (text.match(/class="pp-free-frame"/g) || []).length === SLIDES * (FRAMES + 1), { frames: (text.match(/class="pp-free-frame"/g) || []).length });

const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed, lang: 'fr', colorScheme: 'light' });
await page.waitForFunction(() => typeof Editor !== 'undefined' && !!EditorCore.getEditor(), null, { timeout: 20000 });
await page.evaluate((id) => {
  const sel = document.getElementById('template-select');
  sel.value = String(id);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}, ID);
const ready = () => page.waitForFunction((id) => !ImportPlacing.isFilling() && Templates.getCurrentId() == id && !(document.getElementById('pp-placing-modal') && getComputedStyle(document.getElementById('pp-placing-modal')).display !== 'none'), ID, { timeout: 120000, polling: 100 });
await ready();
await page.waitForFunction(() => FrameSleep.asleep() > 0, null, { timeout: 20000, polling: 100 });
await sleep(2500);

// --- Les aides de page ---
await page.evaluate(() => {
  // La lecture de géométrie faite dans un cadre endormi (ou dedans) : comptée, par fonction. Posée une fois, active seulement entre `__geo.on = true` et `false`.
  window.__geo = { on: false, count: 0, by: {} };
  const hit = (el, what) => {
    if (!window.__geo.on || !el || typeof el.closest !== 'function' || !el.closest('.pp-ff-asleep')) return;
    window.__geo.count += 1;
    window.__geo.by[what] = (window.__geo.by[what] || 0) + 1;
    if (!window.__geo.node) window.__geo.node = el.tagName + '.' + el.className + ' "' + (el.textContent || '').slice(0, 30) + '" asleepRoot=' + (el.closest('.pp-ff-asleep') === el);
    if (!window.__geo.stack) window.__geo.stack = (new Error().stack || '').split('\n').slice(2, 9).map(l => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\//, '')).join(' < ');
  };
  ['getBoundingClientRect', 'getClientRects'].forEach((name) => {
    const real = Element.prototype[name];
    Element.prototype[name] = function () { hit(this, name); return real.apply(this, arguments); };
  });
  ['offsetHeight', 'offsetWidth', 'offsetTop', 'offsetLeft', 'clientHeight', 'clientWidth', 'scrollHeight', 'scrollWidth'].forEach((name) => {
    [HTMLElement.prototype, Element.prototype].forEach((proto) => {
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (!descriptor || !descriptor.get || proto.__patched_geo_ && proto.__patched_geo_[name]) return;
      const realGet = descriptor.get;
      Object.defineProperty(proto, name, { configurable: true, enumerable: descriptor.enumerable, get() { hit(this, name); return realGet.call(this); } });
      proto.__patched_geo_ = Object.assign(proto.__patched_geo_ || {}, { [name]: true });
    });
  });
});
const geoReset = () => page.evaluate(() => { window.__geo.count = 0; window.__geo.by = {}; window.__geo.stack = ''; window.__geo.node = ''; window.__geo.on = true; });
const geoRead = () => page.evaluate(() => { window.__geo.on = false; return { count: window.__geo.count, by: Object.assign({}, window.__geo.by), firstStack: window.__geo.stack, node: window.__geo.node }; });
// Où en sont les cadres : par diapositive (rang), combien de cadres et combien dorment ; et ce que la dernière passe en dit (FrameSleep.sleeps).
const frameState = () => page.evaluate(() => {
  const kids = EditorCore.getEditor().view.dom.children;
  const slides = [];
  let slide = 0;
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i];
    if (c.classList.contains('page-break-marker')) { slide += 1; continue; }
    if (!c.classList.contains('pp-free-frame')) continue;
    if (!slides[slide]) slides[slide] = { frames: 0, asleep: 0, shouldSleep: FrameSleep.sleeps(slide) };
    slides[slide].frames += 1;
    if (c.classList.contains('pp-ff-asleep')) slides[slide].asleep += 1;
  }
  const frames = slides.reduce((n, s) => n + s.frames, 0);
  const asleep = slides.reduce((n, s) => n + s.asleep, 0);
  // Les cadres qui portent la réserve d'une coupure de page restent éveillés (au plus un par diapositive endormie) ; aucun autre ne s'éveille, aucun ne dort dans une diapositive éveillée.
  const wrongAwake = slides.reduce((n, s) => n + (s.shouldSleep ? Math.max(0, s.frames - s.asleep - 1) : 0), 0);
  const wrongAsleep = slides.reduce((n, s) => n + (!s.shouldSleep ? s.asleep : 0), 0);
  return { slides: slides.length, frames, asleep, wrongAwake, wrongAsleep, on: FrameSleep.isOn(), first: slides[0], last: slides[slides.length - 1], rank: slides.map(s => (s.asleep ? (s.asleep === s.frames ? 'z' : 'p') : 'a')).join('') };
});
const textNow = () => page.evaluate(() => Editor.getHTML());
const editorBox = () => page.evaluate(() => { const r = document.getElementById('editor-container').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
// Le curseur : la sélection est dans un cadre éveillé de la diapositive de rang `slide` (ou n'importe lequel si null), et a un rectangle à l'écran, dans la zone visible de l'éditeur.
const caret = (slideWanted) => page.evaluate((slideWanted) => {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return { ok: false, why: 'pas de sélection' };
  let node = sel.anchorNode;
  const root = EditorCore.getEditor().view.dom;
  while (node && node.parentNode !== root) node = node.parentNode;
  if (!node) return { ok: false, why: 'hors du texte' };
  let slide = 0;
  for (const c of root.children) { if (c === node) break; if (c.classList.contains('page-break-marker')) slide += 1; }
  const asleep = node.classList.contains('pp-ff-asleep');
  const range = sel.getRangeAt(0);
  const rects = range.getClientRects();
  const rect = rects.length ? rects[0] : range.getBoundingClientRect();
  const box = document.getElementById('editor-container').getBoundingClientRect();
  const visible = rect.height > 0 && rect.bottom > box.top && rect.top < box.bottom;
  return { ok: !asleep && visible && (slideWanted === null || slide === slideWanted), slide, asleep, visible, rect: { top: Math.round(rect.top), height: Math.round(rect.height) }, box: { top: Math.round(box.top), bottom: Math.round(box.bottom) } };
}, slideWanted === undefined ? null : slideWanted);
const items = () => page.locator('.pp-slide-item');

// ================= 1) Au repos =================
const rest = await frameState();
check('le texte a ' + (SLIDES * (FRAMES + 1)) + ' cadres, la fonction est en marche (FrameSleep.isOn) et ' + SLIDES + ' diapositives', rest.on === true && rest.frames === SLIDES * (FRAMES + 1) && rest.slides === SLIDES, rest);
check('au repos, le début est éveillé et la fin dort : tous les cadres de la première diapositive sont éveillés, tous ceux de la dernière dorment (sauf la réserve d\'une coupure de page : au plus un)', rest.first.asleep === 0 && rest.last.asleep >= rest.last.frames - 1, { first: rest.first, last: rest.last, rank: rest.rank });
check('plus de 80 % des cadres dorment (' + rest.asleep + ' sur ' + rest.frames + ')', rest.asleep / rest.frames > 0.8, { asleep: rest.asleep, frames: rest.frames, rank: rest.rank });
check('chaque cadre est dans l\'état de sa diapositive (aucun éveillé de trop dans une diapositive endormie, aucun endormi dans une éveillée)', rest.wrongAwake === 0 && rest.wrongAsleep === 0, { wrongAwake: rest.wrongAwake, wrongAsleep: rest.wrongAsleep });
const savedText = await textNow();
check('le texte est le même, à l\'octet près, et ne porte jamais la classe des endormis', savedText === text && !/pp-ff-asleep/.test(savedText), { same: savedText === text, leaked: /pp-ff-asleep/.test(savedText) });
const heights = await page.evaluate(() => {
  const dom = EditorCore.getEditor().view.dom;
  const before = dom.scrollHeight;
  const asleep = Array.from(dom.querySelectorAll(':scope > .pp-ff-asleep'));
  asleep.forEach(el => el.classList.remove('pp-ff-asleep'));
  const awake = dom.scrollHeight;
  asleep.forEach(el => el.classList.add('pp-ff-asleep'));
  return { before, awake, n: asleep.length };
});
check('endormir ne déplace rien : la hauteur du texte est la même avec les ' + heights.n + ' endormis éveillés', heights.n > 0 && heights.before === heights.awake, heights);
const asleepStyle = await page.evaluate(() => { const el = document.querySelector('#editor-container .tiptap > .pp-ff-asleep'); return el ? { display: getComputedStyle(el).display, inside: el.querySelector('.pp-free-frame-box') ? getComputedStyle(el.querySelector('.pp-free-frame-box')).display : null } : null; });
check('un cadre endormi n\'a pas de boîte (display: none)', !!asleepStyle && asleepStyle.display === 'none', asleepStyle);

// ================= 2) Aucune lecture de géométrie dans un endormi =================
// La lecture témoin : une lecture faite exprès sur un endormi doit être comptée (sinon un zéro ne prouverait rien).
await geoReset();
await page.evaluate(() => { const el = document.querySelector('#editor-container .tiptap > .pp-ff-asleep'); el.getBoundingClientRect(); el.querySelector('.pp-free-frame-box').offsetHeight; });
const control = await geoRead();
check('la lecture témoin, faite exprès dans un cadre endormi, est comptée (l\'essai compte pour de vrai)', control.count >= 2 && !!control.by.getBoundingClientRect && !!control.by.offsetHeight, control);

const box0 = await editorBox();
// Taper : un clic dans le texte du premier cadre de la première diapositive, puis trois lettres.
await page.locator('#editor-container .tiptap > .pp-free-frame').nth(1).locator('p').first().click();
await sleep(400);
await geoReset();
await page.keyboard.type('Zyx', { delay: 120 });
await sleep(1500);
const typing = await geoRead();
check('taper trois lettres (et la pagination qui suit) ne lit la géométrie d\'AUCUN cadre endormi', typing.count === 0, typing);
const afterTyping = await frameState();
check('taper ne réveille aucun cadre de plus (la fin dort toujours : ' + afterTyping.asleep + ' endormis)', afterTyping.asleep >= rest.asleep - 2 && afterTyping.wrongAwake === 0 && afterTyping.wrongAsleep === 0, { before: rest.asleep, after: afterTyping.asleep });
const typedAt = await page.evaluate(() => /Zyx/.test(Editor.getHTML()));
check('les trois lettres sont dans le texte (le clavier les a posées)', typedAt === true);

// Défiler à la molette : vers le bas de quelques pages, puis vers le haut.
await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
await geoReset();
for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, 700); await sleep(180); }
await sleep(900);
const wheelDown = await geoRead();
const midState = await frameState();
check('défiler à la molette vers le bas ne lit la géométrie d\'AUCUN cadre endormi', wheelDown.count === 0, wheelDown);
check('en défilant, l\'écran a changé de diapositives : celles du milieu, que la molette amène à l\'écran, sont éveillées ; la 1re et sa voisine (la sélection y est) le restent ; le reste dort, chaque cadre dans l\'état de sa diapositive', midState.rank.slice(4).includes('a') && midState.rank.slice(0, 2) === 'aa' && midState.asleep / midState.frames > 0.6 && midState.wrongAwake === 0 && midState.wrongAsleep === 0, { rank: midState.rank, wrongAwake: midState.wrongAwake, wrongAsleep: midState.wrongAsleep });
await geoReset();
for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, -700); await sleep(180); }
await sleep(900);
const wheelUp = await geoRead();
const backState = await frameState();
check('et vers le haut non plus ; au retour les diapositives du milieu se sont rendormies et la première est éveillée', wheelUp.count === 0 && backState.first.asleep === 0 && !backState.rank.slice(4).includes('a') && backState.wrongAwake === 0 && backState.wrongAsleep === 0, { geo: wheelUp, rank: backState.rank });

// ================= 3) Une miniature cliquée réveille sa diapositive AVANT la sélection =================
const rows = await items().count();
check('la bande a ses ' + SLIDES + ' miniatures', rows === SLIDES, rows);
const FAR = 24;                                  // la 25e diapositive (rang 24)
await items().nth(FAR).scrollIntoViewIfNeeded();
await geoReset();
await items().nth(FAR).click();
await sleep(1200);
const jump = await geoRead();
check('cliquer la miniature de la 25e diapositive ne lit la géométrie d\'AUCUN cadre endormi', jump.count === 0, jump);
const farState = await frameState();
const farCaret = await caret(FAR);
check('la 25e diapositive est éveillée (tous ses cadres) et la première s\'est rendormie', farState.slides === SLIDES && farState.rank[FAR] === 'a' && farState.first.asleep >= farState.first.frames - 1, { rank: farState.rank });
check('la sélection est dans la 25e diapositive, dans un cadre éveillé, et le curseur a un rectangle dans la zone visible de l\'éditeur', farCaret.ok === true, farCaret);

// ================= 4) Ctrl+Z qui ramène loin =================
await page.keyboard.press('Control+z');
await sleep(1400);
const undone = await caret(0);
const afterUndo = await frameState();
const undoneText = await page.evaluate(() => /Zyx/.test(Editor.getHTML()));
check('Ctrl+Z qui ramène de la 25e à la 1re diapositive : la frappe est défaite, le curseur est dans la 1re diapositive, éveillée, à l\'écran', undoneText === false && undone.ok === true && afterUndo.rank[0] === 'a', { undone, undoneText, rank: afterUndo.rank });
check('et la fin dort de nouveau, chaque cadre dans l\'état de sa diapositive', afterUndo.asleep / afterUndo.frames > 0.8 && afterUndo.wrongAwake === 0 && afterUndo.wrongAsleep === 0, { rank: afterUndo.rank, wrongAwake: afterUndo.wrongAwake, wrongAsleep: afterUndo.wrongAsleep });

// ================= 5) La tournée =================
// Les points rouges de la bande avant : aucun. Un style qui grossit le texte de TOUS les cadres change leur hauteur sans toucher à leur nœud.
const dots = () => page.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-item')).map(el => { const d = el.querySelector('.pp-slide-overflow'); return !!d && !d.hidden; }));
const dotsBefore = await dots();
const tourBefore = await page.evaluate(() => ({ tours: FrameSleep.toursDone(), epoch: FrameSleep.answersEpoch() }));
check('avant le style : aucune miniature n\'a de point rouge', dotsBefore.every(d => d === false), dotsBefore.map((d, i) => d ? i : null).filter(i => i !== null));
await page.evaluate(() => { const style = document.createElement('style'); style.id = 'pp-test-grow'; style.textContent = '.pp-free-frame-content p, .pp-free-frame-content h1 { font-size: 96px !important; line-height: 1.2 !important; }'; document.head.appendChild(style); });
// Une frappe fait relire à la bande les cadres éveillés : l'un d'eux voit sa hauteur changer et demande la tournée (FrameSleep.recheck).
await page.keyboard.type('Q', { delay: 50 });
const toured = await page.waitForFunction((before) => FrameSleep.toursDone() > before.tours && FrameSleep.answersEpoch() > before.epoch, tourBefore, { timeout: 30000, polling: 200 }).then(() => true, () => false);
await sleep(800);
const dotsAfter = await dots();
const changedState = await frameState();
check('la tournée a revu les endormis après un instant de calme (le compte des tournées et l\'époque des réponses ont monté)', toured === true, await page.evaluate(() => ({ tours: FrameSleep.toursDone(), epoch: FrameSleep.answersEpoch() })));
check('les points rouges de la bande suivent : les diapositives de la fin, endormies, dépassent maintenant de leur page (au moins la moitié ont un point rouge)', dotsAfter.filter(Boolean).length >= SLIDES / 2 && dotsAfter[SLIDES - 1] === true && dotsAfter[FAR + 2] === true, dotsAfter.map((d, i) => d ? i : null).filter(i => i !== null));
check('la tournée n\'a réveillé personne pour de bon (la fin dort toujours)', changedState.asleep / changedState.frames > 0.8 && changedState.wrongAwake === 0 && changedState.wrongAsleep === 0, { asleep: changedState.asleep, frames: changedState.frames });
const midTour = await page.evaluate(() => ({ tours: FrameSleep.toursDone(), epoch: FrameSleep.answersEpoch() }));
await page.evaluate(() => { document.getElementById('pp-test-grow').remove(); });
await page.keyboard.type('R', { delay: 50 });
const toured2 = await page.waitForFunction((before) => FrameSleep.toursDone() > before.tours && FrameSleep.answersEpoch() > before.epoch, midTour, { timeout: 30000, polling: 200 }).then(() => true, () => false);
await sleep(800);
const dotsBack = await dots();
check('le style retiré, la tournée repasse et les points rouges s\'éteignent (dans les deux sens)', toured2 === true && dotsBack.every(d => d === false), dotsBack.map((d, i) => d ? i : null).filter(i => i !== null));
await page.keyboard.press('Control+z');
await page.keyboard.press('Control+z');
await sleep(600);

// ================= 6) Déplacer une diapositive =================
// Glisser la miniature de la 2e diapositive tout en bas de la bande : elle devient la dernière.
const before6 = await textNow();
// Les cadres de l'éditeur sont marqués : après le déplacement, ceux des diapositives que la déplacée traverse doivent être les MÊMES éléments (la bande enveloppe `updateState` pour que l'éditeur ne
// refasse que ce qui a bougé : slide-strip.js, lightRedraw). Les cadres endormis ne doivent pas l'empêcher : ils mettaient leur propre `updateState` en travers et, avec lui, tout ce qu'une diapositive
// traversait se refaisait (relevé de la passe ciblée du 11/11 : verify-slides-drag.mjs, 21 blocs sur 21 refaits).
const wrapperName = await page.evaluate(() => { const v = EditorCore.getEditor().view; return Object.prototype.hasOwnProperty.call(v, 'updateState') ? v.updateState.name : '(la méthode de ProseMirror)'; });
await page.evaluate(() => { Array.from(EditorCore.getEditor().view.dom.children).forEach((el) => { el.__keep = true; }); });
await items().nth(1).scrollIntoViewIfNeeded();
const center = async (i) => { const r = await items().nth(i).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const from = await center(1);
await page.mouse.move(from.x - 6, from.y);
await page.mouse.move(from.x, from.y, { steps: 2 });
await sleep(80);
await page.mouse.down();
const list = await page.evaluate(() => { const r = document.querySelector('.pp-slide-item').parentNode.parentNode.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
await page.mouse.move(from.x, from.y + 24, { steps: 4 });
await sleep(120);
await page.mouse.move(list.x + list.width / 2, list.y + list.height - 3, { steps: 10 });
// Près du bas, la bande défile : on attend d'être en bas.
for (let k = 0; k < 40; k++) { await sleep(150); const atEnd = await page.evaluate(() => { const l = document.querySelector('.pp-slide-item'); let s = l; while (s && s.scrollHeight <= s.clientHeight + 1) s = s.parentNode; return !s || Math.abs(s.scrollTop + s.clientHeight - s.scrollHeight) < 2; }); if (atEnd) break; await page.mouse.move(list.x + list.width / 2, list.y + list.height - 3, { steps: 2 }); }
await page.mouse.up();
await sleep(1800);
const after6 = await textNow();
const tokens = html => (html.match(/Texte \d+\.\d+|Diapositive \d+|page-break-marker/g) || []).sort().join('|');
const move = await frameState();
const order = await page.evaluate(() => Array.from(EditorCore.getEditor().view.dom.querySelectorAll(':scope > .pp-free-frame h1')).map(h => h.textContent));
check('la 2e diapositive est devenue la dernière : l\'ordre des titres est 1, 3, 4, … 30, 2 et le texte a changé d\'ordre sans rien perdre', order.length === SLIDES && order[0] === 'Diapositive 1' && order[1] === 'Diapositive 3' && order[SLIDES - 1] === 'Diapositive 2' && tokens(after6) === tokens(before6), { order: order.slice(0, 3).concat(order.slice(-2)), sameTokens: tokens(after6) === tokens(before6), lengthDiff: after6.length - before6.length });
const keptFrames = await page.evaluate(() => Array.from(EditorCore.getEditor().view.dom.querySelectorAll(':scope > .pp-free-frame')).filter(el => el.__keep === true).length);
check('la bande des diapositives a gardé son dessin léger : `updateState` est celui qu\'elle enveloppe (updateStateLight), pas un autre', wrapperName === 'updateStateLight', wrapperName);
check('déplacer une diapositive ne refait que ses propres cadres : au moins ' + (SLIDES * (FRAMES + 1) - 2 * (FRAMES + 1)) + ' des ' + (SLIDES * (FRAMES + 1)) + ' éléments sont les mêmes qu\'avant', keptFrames >= SLIDES * (FRAMES + 1) - 2 * (FRAMES + 1), { kept: keptFrames, of: SLIDES * (FRAMES + 1) });
check('après le déplacement, chaque cadre est dans l\'état de sa diapositive et la plupart dorment', move.wrongAwake === 0 && move.wrongAsleep === 0 && move.asleep / move.frames > 0.7, { rank: move.rank, wrongAwake: move.wrongAwake, wrongAsleep: move.wrongAsleep });
const moveCaret = await caret();
check('et le curseur est toujours à l\'écran, dans un cadre éveillé', moveCaret.ok === true, moveCaret);
await page.keyboard.press('Control+z');
await sleep(1500);
const undoMove = await textNow();
check('Ctrl+Z remet la diapositive à sa place : le texte est celui d\'avant le déplacement', undoMove === before6, { same: undoMove === before6, a: undoMove.length, b: before6.length });

// ================= 7) Sous 600 cadres rien ne dort =================
const small = await page.evaluate(({ keep }) => {
  const dom = EditorCore.getEditor().view.dom;
  const html = Editor.getHTML();
  const MARK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  const parts = html.split(/<div class="page-break-marker"[^>]*>Saut de page<\/div>/).slice(0, keep);
  window.__fullHtml = html;
  Editor.setHTML(parts.join(MARK));
  return { frames: dom.querySelectorAll(':scope > .pp-free-frame').length };
}, { keep: 12 });
await sleep(1500);
const smallState = await frameState();
check('un texte de ' + small.frames + ' cadres (sous 600) : rien ne dort, FrameSleep.isOn est faux', small.frames < 600 && smallState.asleep === 0 && smallState.on === false, { frames: small.frames, asleep: smallState.asleep, on: smallState.on });
await page.evaluate(() => { Editor.setHTML(window.__fullHtml); });
await sleep(2500);
const bigAgain = await frameState();
check('et le gros texte remis, les cadres lointains s\'endorment de nouveau', bigAgain.on === true && bigAgain.asleep / bigAgain.frames > 0.8 && bigAgain.wrongAwake === 0, { asleep: bigAgain.asleep, frames: bigAgain.frames });
const saved = await page.evaluate(async () => { const html = Editor.getHTML(); return { leaked: /pp-ff-asleep/.test(html), prepared: /pp-ff-asleep/.test(await Editor.prepareHTML()) }; });
check('la chaîne que l\'enregistrement écrit ne porte jamais la classe des endormis', saved.leaked === false && saved.prepared === false, saved);

await t.finish();
