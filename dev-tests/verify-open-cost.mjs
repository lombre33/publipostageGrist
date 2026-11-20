#!/usr/bin/env node
// Le COÛT de la pose par morceaux d'un gros texte (js/import-placing.js : un import, l'ouverture d'un gros modèle enregistré ; 20/11, « accélérer l'ouverture d'une grosse présentation » : 79 diapositives, 95 000
// éléments, sous Firefox 5,9 s puis 47,7 s, plus de 200 appels de Editor.appendHTML de 40 à 360 ms, chacun plus long que le précédent). Le travail d'un pas ne bougeait pas ; ce qui grossissait était ce qu'il
// refaisait sur TOUT le texte déjà posé : le sommeil des cadres relisait chaque bloc après chaque pas, et deux greffons (les signets, js/anchors.js ; les valeurs conditionnelles, js/editor-nodes.js) parcouraient
// tous les nœuds du texte à chaque transaction. Ce que les cas vérifient, sans jamais changer ce qu'on voit :
//  1. UN MORCEAU AJOUTÉ À LA FIN n'est plus relu avec tout ce qui le précède : `EditorCore.appendedFrom` dit où il commence (les transactions que TipTap ajoute derrière comprises), et le nombre de nœuds qu'un pas fait
//     parcourir ne dépend plus de la taille du texte (même morceau sur 150 cadres puis sur 2 000 : même nombre) ; un parcours entier, lui, reste entier pour toute autre transaction (une frappe, un collage au
//     milieu) ;
//  2. le texte obtenu est celui d'un chargement d'un bloc, à l'octet près, y compris ce que les signets rangent : une adresse déjà prise plus haut, un nom sans adresse (qui en reçoit une, et une autre au
//     doublon), un signet enfoui dans une case ;
//  3. le SOMMEIL des cadres d'une pose par morceaux se REPREND là où la passe d'avant s'est arrêtée (`FrameSleep.passes`) au lieu de relire tous les blocs, et les cadres endormis à la fin sont ceux d'une ouverture
//     d'un bloc (mêmes rangs) ; une passe entière reste entière quand l'écran, la sélection ou un bloc d'avant a bougé ;
//  4. le PAS GRANDIT avec le texte posé (`ImportPlacing.stepBudgetFor` : STEP_MS au début, jusqu'à STEP_MAX_FACTOR fois plus), `stepsOf` accepte un budget qui change d'un pas à l'autre, sans perdre un octet.
// Lancé par run-headless.mjs (groupe Node « openCost », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-open-cost.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-open-cost', port: Number(process.env.OPEN_COST_PORT || 9215) });
const { check } = t;
const ACTIVE = ['graphique', 'diapositives'];
const SLIDES = 30;
const FRAMES = 24;                 // cadres de texte par diapositive, plus son titre : 750 cadres en tout (MIN_FRAMES vaut 600)
const ID = 7;

// --- Le texte d'un diaporama : fabriqué par l'éditeur (FreeFrame.html), relu par getHTML, puis semé dans le faux Grist ---
async function buildText() {
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: seedModels(), lang: 'fr', colorScheme: 'light' });
  await page.waitForFunction(() => typeof Editor !== 'undefined' && !!EditorCore.getEditor(), null, { timeout: 20000 });
  const html = await page.evaluate(({ slides, frames }) => {
    const MARK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
    let out = '';
    for (let n = 1; n <= slides; n++) {
      if (n > 1) out += MARK;
      out += FreeFrame.html({ x: 40, y: 20, w: 560, h: 60 }, `<h1>Diapositive ${n}</h1>`);
      for (let i = 0; i < frames; i++) out += FreeFrame.html({ x: 20 + (i % 8) * 110, y: 100 + Math.floor(i / 8) * 60, w: 100, h: 50 }, `<p>Texte ${n}.${i} ${'un peu de contenu '.repeat(6)}</p>`);
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
check('le texte fabriqué est un diaporama de ' + SLIDES + ' diapositives et ' + (SLIDES * (FRAMES + 1)) + ' cadres', (text.match(/class="pp-free-frame"/g) || []).length === SLIDES * (FRAMES + 1), { frames: (text.match(/class="pp-free-frame"/g) || []).length });

const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed, lang: 'fr', colorScheme: 'light' });
await page.waitForFunction(() => typeof Editor !== 'undefined' && !!EditorCore.getEditor(), null, { timeout: 20000 });
const evalIn = (fn, arg) => page.evaluate(fn, arg);

// ================= 1) Un morceau ajouté à la fin : ce que les greffons parcourent =================
// Le même morceau (dix cadres) ajouté à un texte de 150 cadres puis à un de 2 000 : combien de nœuds les parcours de ProseMirror (`Node.nodesBetween`, sous `descendants`) visitent-ils, et `appendedFrom` répond-il ?
const walk = await evalIn(async () => {
  const frames = n => Array.from({ length: n }, (_, i) => FreeFrame.html({ x: (i % 24) * 26, y: 10 + Math.floor(i / 24) * 12, w: 24, h: 10 }, `<p>cadre ${i}</p>`)).join('');
  const chunk = frames(10) + '<p>fin du morceau</p>';
  const measure = (size) => {
    Editor.setHTML(frames(size) + '<p>fin</p>');
    const proto = Object.getPrototypeOf(EditorCore.getEditor().state.doc);
    const real = proto.nodesBetween;
    const realFrom = EditorCore.appendedFrom;
    const answers = [];
    let visited = 0;
    proto.nodesBetween = function (from, to, f, start) { return real.call(this, from, to, (...args) => { visited += 1; return f(...args); }, start); };
    if (typeof realFrom === 'function') EditorCore.appendedFrom = (trs) => { const at = realFrom(trs); answers.push(at); return at; };
    const sizeBefore = EditorCore.getEditor().state.doc.content.size;
    try { Editor.appendHTML(chunk); } finally { proto.nodesBetween = real; if (typeof realFrom === 'function') EditorCore.appendedFrom = realFrom; }
    return { visited, answers, sizeBefore, nodes: EditorCore.getEditor().view.dom.getElementsByTagName('*').length };
  };
  const small = measure(150);
  const big = measure(2000);
  // Toute autre transaction : une frappe au milieu du texte. appendedFrom répond null (rien n'est supposé de ce qui précède).
  const typed = EditorCore.getEditor().state.tr.insertText('x', 5);
  return { small, big, typedFrom: typeof EditorCore.appendedFrom === 'function' ? EditorCore.appendedFrom([typed]) : 'absent', has: typeof EditorCore.appendedFrom === 'function' };
});
check('EditorCore.appendedFrom existe', walk.has === true, walk);
check('le morceau ajouté est reconnu : appendedFrom rend la fin du texte d\'avant (pour la transaction du morceau et celle que TipTap ajoute derrière), jamais null', walk.small.answers.length > 0 && walk.small.answers.every(a => a === walk.small.sizeBefore), walk.small);
check('une frappe n\'est pas un morceau ajouté : appendedFrom rend null', walk.typedFrom === null, { typedFrom: walk.typedFrom });
check('le nombre de nœuds parcourus pour un morceau de dix cadres ne dépend pas de la taille du texte (150 cadres : ' + walk.small.visited + ', 2 000 cadres : ' + walk.big.visited + ')', walk.big.visited <= walk.small.visited + 40 && walk.big.visited < walk.big.nodes / 20, { small: walk.small.visited, big: walk.big.visited, bigNodes: walk.big.nodes });

// ================= 2) Le texte est celui d'un chargement d'un bloc =================
const equal = await evalIn(() => {
  const frames = (n, label) => Array.from({ length: n }, (_, i) => FreeFrame.html({ x: (i % 8) * 80, y: 10 + Math.floor(i / 8) * 30, w: 70, h: 24 }, `<p>${label} ${i}</p>`)).join('');
  const first = frames(6, 'A') + '<p data-anchor="intro" data-anchor-name="Intro">Début</p><p data-anchor-name="Zèbre">avant</p>';
  const second = '<p data-anchor="intro" data-anchor-name="Intro bis">doublon de l\'adresse</p>'
    + '<p data-anchor-name="Zèbre">un nom sans adresse, déjà pris</p>'
    + '<p data-anchor-name="Antilope">un nom neuf</p>'
    + '<table><tbody><tr><td><p data-anchor="enfoui" data-anchor-name="Enfoui">dans une case</p></td></tr></tbody></table>'
    + frames(5, 'B') + '<p data-anchor="plus-loin">fin</p>';
  const third = '<p data-anchor="plus-loin">un autre doublon</p><p data-anchor="">sans adresse</p><p>fin du texte</p>';
  Editor.setHTML(first);
  Editor.appendHTML(second);
  Editor.appendHTML(third);
  const byChunks = Editor.getHTML();
  Editor.setHTML(first + second + third);
  const oneBlock = Editor.getHTML();
  const ids = (oneBlock.match(/data-anchor="[^"]*"/g) || []);
  return { same: byChunks === oneBlock, lenChunks: byChunks.length, lenOne: oneBlock.length, ids, buried: /enfoui/.test(oneBlock), firstDiff: (() => { let i = 0; while (i < byChunks.length && byChunks.charCodeAt(i) === oneBlock.charCodeAt(i)) i++; return i; })() };
});
check('trois morceaux ajoutés (adresse déjà prise, nom sans adresse, signet enfoui dans une case) donnent le texte d\'un chargement d\'un bloc, à l\'octet près', equal.same === true, { lenChunks: equal.lenChunks, lenOne: equal.lenOne, firstDiff: equal.firstDiff });
check('et ce texte est bien rangé : une adresse ne revient jamais deux fois, le signet enfoui dans une case est retiré', new Set(equal.ids).size === equal.ids.length && equal.buried === false, { ids: equal.ids, buried: equal.buried });

// ================= 3) Le sommeil des cadres d'une pose par morceaux =================
const plan = await evalIn(() => ({ present: typeof ImportPlacing.planOpen === 'function' }));
check('ImportPlacing est là', plan.present === true, plan);
await evalIn((id) => {
  window.__passesAtStart = FrameSleep.passes ? FrameSleep.passes() : null;
  const sel = document.getElementById('template-select');
  sel.value = String(id);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}, ID);
await page.waitForFunction((id) => !ImportPlacing.isFilling() && Templates.getCurrentId() == id && !(document.getElementById('pp-placing-modal') && getComputedStyle(document.getElementById('pp-placing-modal')).display !== 'none') && document.querySelectorAll('.pp-slide-item').length > 0, ID, { timeout: 120000, polling: 100 });
await page.waitForFunction(() => FrameSleep.asleep() > 0, null, { timeout: 30000, polling: 100 });
await new Promise(r => setTimeout(r, 2500));
const asleepSet = () => page.evaluate(() => {
  const kids = EditorCore.getEditor().view.dom.children;
  const out = [];
  for (let i = 0; i < kids.length; i++) if (kids[i].classList.contains('pp-ff-asleep')) out.push(i);
  return { asleep: out, children: kids.length, on: FrameSleep.isOn() };
});
const progressive = await asleepSet();
const passes = await evalIn(() => ({ now: FrameSleep.passes ? FrameSleep.passes() : null, start: window.__passesAtStart }));
check('FrameSleep.passes existe', !!passes.now && typeof passes.now.full === 'number', passes);
const gained = passes.now ? { full: passes.now.full - (passes.start ? passes.start.full : 0), resumed: passes.now.resumed - (passes.start ? passes.start.resumed : 0) } : null;
check('la pose par morceaux a repris sa passe là où la précédente s\'était arrêtée (' + (gained && gained.resumed) + ' passes reprises, ' + (gained && gained.full) + ' entières)', !!gained && gained.resumed > 0 && gained.resumed >= gained.full, gained);
check('le modèle est ouvert, ses cadres lointains dorment (plus de 80 %)', progressive.on === true && progressive.asleep.length / (SLIDES * (FRAMES + 1)) > 0.8, { asleep: progressive.asleep.length });
// Une passe ENTIÈRE sur le même état (un redimensionnement de la fenêtre relit l'écran à l'image suivante, hors pose : toujours entière) ne change rien : celles qui ont repris leur travail en route ont fini dans
// le même état qu'une passe entière.
const fullBefore = await evalIn(() => FrameSleep.passes ? FrameSleep.passes().full : -1);
await evalIn(() => { window.dispatchEvent(new Event('resize')); });
await page.waitForFunction((before) => FrameSleep.passes && FrameSleep.passes().full > before, fullBefore, { timeout: 20000, polling: 50 });
await new Promise(r => setTimeout(r, 600));
const afterFull = await asleepSet();
check('une passe entière sur l\'état où la pose s\'est arrêtée ne change aucun cadre : ceux qui dorment sont les mêmes rangs (' + progressive.asleep.length + ')', progressive.children === afterFull.children && JSON.stringify(progressive.asleep) === JSON.stringify(afterFull.asleep), { before: progressive.asleep.length, after: afterFull.asleep.length });

// ================= 4) Le pas grandit avec le texte posé =================
const grow = await evalIn(() => {
  const P = ImportPlacing;
  const has = typeof P.stepBudgetFor === 'function';
  if (!has) return { has };
  const base = P.STEP_MS;
  const frames = n => Array.from({ length: n }, (_, i) => FreeFrame.html({ x: (i % 24) * 26, y: 10, w: 24, h: 10 }, `<p>pas ${i}</p>`)).join('');
  const body = frames(1500);
  const all = (budget) => [...P.stepsOf(body, budget)];
  // Un budget qui change : STEP_MS tant que cinq pas ne sont pas sortis, quatre fois plus ensuite (le compte se fait ici, à chaque pas rendu).
  let placed = 0;
  const changing = [];
  for (const step of P.stepsOf(body, () => (placed < 5 ? base : base * 4))) { changing.push(step); placed += 1; }
  const fixed = all(base);
  const lossless = changing.map(s => s.text).join('') === body && fixed.map(s => s.text).join('') === body;
  const sizes = changing.map(s => s.ms);
  return {
    has, base, zero: P.stepBudgetFor(0), twice: P.stepBudgetFor(P.STEP_GROW_BLOCKS), cap: P.stepBudgetFor(1e7), factor: P.STEP_MAX_FACTOR,
    monotonic: [0, 500, 1500, 3000, 6000, 12000, 30000].map(n => P.stepBudgetFor(n)).every((v, i, a) => i === 0 || v >= a[i - 1]),
    lossless, changingSteps: changing.length, fixedSteps: fixed.length, early: sizes.slice(0, 4).reduce((a, b) => a + b, 0) / 4, late: sizes.slice(8, 12).reduce((a, b) => a + b, 0) / 4,
  };
});
check('stepBudgetFor : STEP_MS pour un texte vide, le double à STEP_GROW_BLOCKS blocs, jamais plus de STEP_MAX_FACTOR fois STEP_MS, jamais décroissant', grow.has === true && grow.zero === grow.base && grow.twice === 2 * grow.base && grow.cap === grow.factor * grow.base && grow.monotonic === true, grow);
check('stepsOf avec un budget qui change d\'un pas à l\'autre ne perd pas un octet, et les derniers pas sont plus gros que les premiers (' + Math.round(grow.early) + ' ms puis ' + Math.round(grow.late) + ' ms) pour moins de pas qu\'à budget fixe (' + grow.changingSteps + ' contre ' + grow.fixedSteps + ')', grow.lossless === true && grow.late > 2 * grow.early && grow.changingSteps < grow.fixedSteps, grow);

await t.finish();
