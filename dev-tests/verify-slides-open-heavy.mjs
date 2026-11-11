#!/usr/bin/env node
// L'OUVERTURE d'un GROS modèle de présentation déjà enregistré (11/11, « zéro gel à l'ouverture ») : poser tout son texte d'un bloc (Editor.setHTML) tient la page plusieurs secondes ; js/import-placing.js (planOpen,
// stepsOf, fillOpened) coupe le texte en PAS (une quarantaine de millisecondes chacun), entre deux blocs de premier niveau, js/main.js (loadTemplateIntoEditor, fillOpenedPresentation) charge le début par le chemin
// habituel et pose la suite pas après pas sous un voile « Ouverture des diapositives… n / total ». Les modèles sont fabriqués dans la page avec l'éditeur lui-même (des cadres libres et des tableaux, FreeFrame.html),
// enregistrés tels que getHTML() les écrit, puis semés dans le faux Grist : aucun fichier dans le dépôt. L'ajout d'un pas (Editor.appendHTML) est ralenti dans la page : le remplissage dure alors assez pour qu'on y agisse
// (Enregistrer, un autre modèle). Ce que les cas vérifient :
//  - le COÛT et le PLAN (planOpen, profileOf, sans rien ouvrir) : un texte lourd est coupé en un début et une suite sans perdre un octet ; un texte léger, un suivi des modifications, une entrée qui n'est pas un texte :
//    pas de plan, le modèle s'ouvre d'un bloc ; le coût d'un texte de 500 diapositives de texte (que l'ancienne estimation, au signe, jugeait léger) le met au-dessus du seuil ;
//  - les PAS (stepsOf) : mis bout à bout ils redonnent le texte, chacun a ses éléments ouverts et fermés (jamais un saut de page DANS une case de tableau coupé en deux), chacun coûte à peu près un pas, une diapositive
//    de plusieurs centaines de cadres se coupe en plusieurs pas, un bloc plus lourd qu'un pas à lui seul reste entier, un texte léger n'en fait qu'un ;
//  - l'OUVERTURE par la liste : au premier pas le voile est là (titre, « Ouverture des diapositives… n / total », barre) et l'éditeur n'a que le début, la frappe ne passe pas, la page reste fluide (aucun arrêt de plus de
//    300 ms), à la fin le texte est CELUI de l'ouverture d'un bloc (HTML identique à l'octet près, le paragraphe vide que TipTap range sous un pas compris) et le voile est retiré ; rien n'est « à enregistrer » :
//    aucune écriture dans Grist, même après plusieurs passages de l'enregistrement automatique ; une frappe ensuite marque le modèle et l'enregistrement écrit tout le texte ;
//  - une présentation de QUELQUES diapositives de plusieurs centaines de cadres chacune (les « diapositives géantes » : l'ouverture d'un bloc tenait la page 8 s) : le début s'arrête au milieu de la première, la barre
//    avance pas après pas, la page reste fluide, le texte est identique à l'octet près ; la pose d'une diapositive géante à l'import (appendSlides) se coupe aussi en pas, sans perdre un octet ;
//  - les GARDES : un Enregistrer demandé pendant le remplissage attend la fin et écrit le texte ENTIER (jamais le début du modèle) ; un autre modèle choisi pendant le remplissage l'arrête (rien du premier n'est
//    posé dans le second) ; un saut de page DANS une case de tableau (au début, au milieu ou tard) n'empêche rien : le texte est identique ; un pas que l'éditeur ne peut pas poser tel quel (un `<div` dans la valeur
//    d'un attribut) fait recharger le texte d'un bloc (résultat identique) ; un petit modèle s'ouvre d'un bloc, sans voile ;
//  - en anglais : le titre, le texte du pas et le conseil sont ceux de l'anglais.
// Lancé par run-headless.mjs (groupe Node « slidesOpenHeavy », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-open-heavy.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-open-heavy', port: Number(process.env.SLIDES_OPEN_HEAVY_PORT || 9102) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const SLIDES = 50;                 // de quoi dépasser les seuils de planOpen (120 000 signes, ~600 ms d'ouverture estimée) sans alourdir l'essai
const TABLE = [6, 6];              // lignes, colonnes du tableau de chaque diapositive
const CELL_CHARS = 320;
const BIG_SLIDES = 4;              // les « diapositives géantes » : peu de diapositives, des centaines de cadres chacune
const BIG_FRAMES = 600;
const SLOW_MS = 60;                // l'ajout d'un pas est ralenti de tant dans la page quand un cas doit agir pendant le remplissage (Enregistrer, un autre modèle) : il dure alors ~2 s

// --- Les textes : fabriqués par l'éditeur, relus par getHTML (le texte d'un modèle enregistré) ---
async function buildTexts() {
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: seedModels(), lang: 'fr', colorScheme: 'light' });
  await page.waitForFunction(() => typeof Editor !== 'undefined' && !!EditorCore.getEditor(), null, { timeout: 20000 });
  const out = await page.evaluate(({ slides, table, cellChars, bigSlides, bigFrames }) => {
    const MARK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
    const table1 = (label, n) => '<table><tbody>' + Array.from({ length: table[0] }, (_, r) => '<tr>' + Array.from({ length: table[1] }, (__, c) => `<td><p>${label} ${n} case ${r}.${c} ` + 'x'.repeat(cellChars) + '</p></td>').join('') + '</tr>').join('') + '</tbody></table>';
    const NESTED = '<table><tbody><tr><td><p>avant le saut</p>' + MARK + '<p>après le saut</p></td></tr></tbody></table>';
    // Une présentation de `count` diapositives : un titre et un tableau dans un cadre libre chacun ; le saut avant la 7e tourne les pages (paysage) ; `nestedAt` : un saut de page DANS un tableau de cette diapositive.
    const deck = (label, count, nestedAt) => {
      let html = '';
      for (let n = 1; n <= count; n++) {
        if (n > 1) html += n === 7 ? `<div class="page-break-marker" contenteditable="false" ${PageSections.ATTR}="landscape">Saut de page</div>` : MARK;
        html += FreeFrame.html({ x: 40, y: 20, w: 560, h: 60 }, `<h1>${label} ${n}</h1>`) + FreeFrame.html({ x: 40, y: 100, w: 560, h: 220 }, table1(label, n));
        if (n === nestedAt) html += NESTED;
      }
      return html;
    };
    // Des diapositives géantes : `frames` petits cadres chacune.
    const giant = (label, count, frames) => {
      let html = '';
      for (let n = 1; n <= count; n++) {
        if (n > 1) html += MARK;
        for (let i = 0; i < frames; i++) html += FreeFrame.html({ x: (i % 24) * 26, y: 10 + Math.floor(i / 24) * 12, w: 24, h: 10 }, `<p>${label} ${n} cadre ${i}</p>`);
      }
      return html;
    };
    const saved = html => { Editor.setHTML(html); return Editor.getHTML(); };
    const alpha = saved(deck('Alpha', slides));
    return { alpha, beta: saved(deck('Beta', slides)), gamma: saved(deck('Gamma', slides, 40)), delta: saved(deck('Delta', slides, 3)), epsilon: saved(deck('Epsilon', slides, 2)), petit: saved(deck('Petit', 6)),
      giant: saved(giant('Géante', bigSlides, bigFrames)),
      // assez de cadres (5 x 600) pour que le texte soit masqué derrière le voile (LOCK_AFTER_FRAMES : 2 500)
      lock: saved(giant('Verrou', 5, bigFrames)),
      // un `<div` dans la valeur d'un attribut : le texte compte une ouverture de plus qu'il n'a de fermetures, l'éditeur ne le sait pas : le pas qui le porte est refusé
      broke: alpha.replace('Alpha 40</h1>', 'Alpha 40</h1><p title="<div">x</p>') };
  }, { slides: SLIDES, table: TABLE, cellChars: CELL_CHARS, bigSlides: BIG_SLIDES, bigFrames: BIG_FRAMES });
  await page.close();
  return out;
}
const texts = await buildTexts();
const MARKER = 'class="page-break-marker"';
const countMarkers = text => text.split(MARKER).length - 1;
check('les textes fabriqués sont des présentations lourdes de ' + SLIDES + ' diapositives (la petite de 6, la géante de ' + BIG_SLIDES + ' diapositives de ' + BIG_FRAMES + ' cadres)', countMarkers(texts.alpha) === SLIDES - 1 && countMarkers(texts.petit) === 5 && countMarkers(texts.giant) === BIG_SLIDES - 1 && texts.alpha.length > 400000 && texts.giant.split('class="pp-free-frame"').length - 1 === BIG_SLIDES * BIG_FRAMES && /data-page-orientation="landscape"/.test(texts.alpha), { alpha: texts.alpha.length, markers: countMarkers(texts.alpha), petit: countMarkers(texts.petit), giant: texts.giant.length });
check('un saut de page DANS un tableau (Gamma : 40e diapositive, Delta : 3e, Epsilon : 2e) est bien dans le texte enregistré, en plus des sauts de diapositive', ['gamma', 'delta', 'epsilon'].every(k => countMarkers(texts[k]) === SLIDES), ['gamma', 'delta', 'epsilon'].map(k => countMarkers(texts[k])));
const slideTexts = texts.alpha.split(/<div class="page-break-marker"[^>]*>Saut de page<\/div>/);
check('chaque diapositive d\'Alpha (sauf la dernière) finit par un cadre, pas par un paragraphe : TipTap range un paragraphe vide sous chaque pas posé, que l\'ouverture doit retirer pour rendre le texte d\'un bloc', slideTexts.length === SLIDES && slideTexts.slice(0, -1).every(x => /<\/div>$/.test(x)) && /<p><\/p>$/.test(slideTexts[SLIDES - 1]), slideTexts.slice(0, 3).map(x => x.slice(-30)));
check('le texte « Broke » porte un `<div` dans un attribut (une ouverture de plus que de fermetures)', (texts.broke.match(/<div/g) || []).length === (texts.alpha.match(/<div/g) || []).length + 1 && (texts.broke.match(/<\/div>/g) || []).length === (texts.alpha.match(/<\/div>/g) || []).length, { divs: (texts.broke.match(/<div/g) || []).length });

const IDS = { alpha: 7, beta: 8, gamma: 9, delta: 10, petit: 11, epsilon: 12, giant: 13, broke: 14, lock: 15 };
const NAMES = { alpha: 'Alpha lourd', beta: 'Beta lourd', gamma: 'Gamma saut dans un tableau tardif', delta: 'Delta saut dans un tableau au debut', petit: 'Petit', epsilon: 'Epsilon saut dans un tableau tres tot', giant: 'Geante cadres par centaines', broke: 'Broke div dans un attribut' , lock: 'Verrou masque' };
const seedWith = () => seedModels() + `
  const mm = stub.state.rows.Publipostage_Modeles;
  const addPres = (id, nom, html) => { mm.id.push(id); mm.Nom.push(nom); mm.Contenu.push(html); mm.NomFichierPDF.push(''); mm.HeaderFooter.push(''); mm.DateModif.push(1790000100); mm.Margins.push(''); mm.EstParDefaut.push(false); mm.TypeModele.push('presentation'); };
  ${Object.keys(IDS).map(k => `addPres(${IDS[k]}, ${JSON.stringify(NAMES[k])}, ${JSON.stringify(texts[k])});`).join('\n  ')}
  stub.state.nextRowId.Publipostage_Modeles = 16;
`;
const MODELS = Object.keys(IDS).length + 4;      // les quatre modèles de base du faux Grist

// --- Les aides de page ---
const veilOf = page => page.evaluate(() => {
  const el = document.getElementById('pp-placing-modal');
  if (!el || getComputedStyle(el).display === 'none') return { shown: false };
  return { shown: true, title: document.getElementById('pp-placing-title').textContent, line: el.querySelector('.pp-placing-line').textContent, hint: el.querySelector('.pp-placing-hint').textContent, percent: Number(el.querySelector('.pp-placing-bar').getAttribute('aria-valuenow')) };
});
// L'état de l'éditeur à cet instant (le nombre de sauts de page du texte, de cadres, la bande, le modèle courant, les enregistrements).
const stateOf = page => page.evaluate(() => {
  let breaks = 0;
  let frames = 0;
  EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'pageBreak') breaks += 1; if (node.type.name === 'freeFrame') frames += 1; });
  return { filling: ImportPlacing.isFilling(), breaks, frames, strip: document.querySelectorAll('.pp-slide-item').length, current: Templates.getCurrentId(), saves: window.__gristStub.countSaves('Publipostage_Modeles') };
});
// Choisit un modèle dans la liste ET lit l'écran dans le même tour de la page : ce que la personne voit à l'instant où le début est posé, avant qu'aucun pas de plus le soit.
const chooseAndLook = (page, id) => page.evaluate((id) => {
  const sel = document.getElementById('template-select');
  sel.value = String(id);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  const el = document.getElementById('pp-placing-modal');
  let breaks = 0;
  let frames = 0;
  EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'pageBreak') breaks += 1; if (node.type.name === 'freeFrame') frames += 1; });
  const shown = !!el && getComputedStyle(el).display !== 'none';
  return { filling: ImportPlacing.isFilling(), breaks, frames, current: Templates.getCurrentId(), status: document.getElementById('status-msg').textContent, saves: window.__gristStub.countSaves('Publipostage_Modeles'),
    veil: shown ? { title: document.getElementById('pp-placing-title').textContent, line: el.querySelector('.pp-placing-line').textContent, hint: el.querySelector('.pp-placing-hint').textContent, percent: Number(el.querySelector('.pp-placing-bar').getAttribute('aria-valuenow')) } : null };
}, id);
const waitFilled = (page, id) => page.waitForFunction((id) => !ImportPlacing.isFilling() && Templates.getCurrentId() == id && !(document.getElementById('pp-placing-modal') && getComputedStyle(document.getElementById('pp-placing-modal')).display !== 'none'), id, { timeout: 180000, polling: 100 });
const textOf = page => page.evaluate(() => Editor.getHTML());
// Le texte que donne l'ouverture d'un bloc (Editor.setHTML du texte du modèle), pour comparer ; rend aussi sa durée (le gel d'une ouverture d'un bloc).
const classicOf = (page, id) => page.evaluate((id) => { const tpl = Templates.byId(id); const t0 = performance.now(); Editor.setHTML(tpl.contenu, tpl.suiviModifications); const ms = Math.round(performance.now() - t0); return { html: Editor.getHTML(), ms }; }, id);
// Ralentit l'ajout d'un pas (sans toucher à ce qu'il fait) : le remplissage dure assez pour qu'on y agisse. `slowAppends(page, ms)` règle le retard (0 : au rythme naturel).
const slowAppends = (page, ms) => page.evaluate((ms) => {
  if (!window.__appendDelayInstalled) { window.__appendDelayInstalled = true; window.__appendDelay = 0; const real = Editor.appendHTML; Editor.appendHTML = function () { const t0 = performance.now(); while (performance.now() - t0 < window.__appendDelay); return real.apply(this, arguments); }; }
  window.__appendDelay = ms;
}, ms);
// Le battement de la page et ce que le voile a dit, pendant une ouverture.
const watchOpening = (page) => page.evaluate(() => {
  window.__hb = { max: 0, over300: 0, stop: false };
  let last = performance.now();
  const tick = () => { const n = performance.now(); const gap = n - last; if (gap > window.__hb.max) window.__hb.max = gap; if (gap > 300) window.__hb.over300 += 1; last = n; if (!window.__hb.stop) setTimeout(tick, 10); };
  setTimeout(tick, 10);
  window.__veilLines = [];
  window.__veilPercents = [];
  const note = () => {
    const el = document.getElementById('pp-placing-modal'); const line = el && el.querySelector('.pp-placing-line');
    if (!el || !line || getComputedStyle(el).display === 'none') return;
    if (window.__veilLines[window.__veilLines.length - 1] !== line.textContent) window.__veilLines.push(line.textContent);
    const percent = Number(el.querySelector('.pp-placing-bar').getAttribute('aria-valuenow'));
    if (window.__veilPercents[window.__veilPercents.length - 1] !== percent) window.__veilPercents.push(percent);
  };
  new MutationObserver(note).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'aria-valuenow'] });
});
const heartbeat = (page) => page.evaluate(() => { window.__hb.stop = true; return { max: Math.round(window.__hb.max), over300: window.__hb.over300, lines: window.__veilLines.slice(), percents: window.__veilPercents.slice() }; });

const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: seedWith(), lang: 'fr', colorScheme: 'light' });
await page.waitForFunction((n) => typeof ImportPlacing !== 'undefined' && Templates.getCached().length >= n, MODELS, { timeout: 30000 });
await sleep(1500);
await slowAppends(page, 0);

// ================= 1) Le COÛT et le PLAN, sans rien ouvrir =================
const plans = await page.evaluate((ids) => {
  const tplOf = id => Templates.byId(id);
  const out = { alpha: null };
  const plan = ImportPlacing.planOpen(tplOf(ids.alpha));
  if (plan) {
    const text = tplOf(ids.alpha).contenu;
    const count = (s, n) => s.split(n).length - 1;
    out.alpha = { total: plan.total, firstSlides: plan.firstSlides, lossless: plan.first + plan.rest === text, restMs: Math.round(plan.restMs), firstShare: Math.round(plan.firstShare * 100) / 100,
      firstBalanced: ['div', 'table'].every(tag => count(plan.first, '<' + tag) === count(plan.first, '</' + tag + '>')), firstBreaks: count(plan.first, 'class="page-break-marker"'), firstChars: plan.first.length, chars: text.length };
  }
  const base = tplOf(ids.alpha);
  out.light = ImportPlacing.planOpen(tplOf(ids.petit)) === null;
  out.tracking = ImportPlacing.planOpen(Object.assign({}, base, { suiviModifications: { s1: { author: 'A', createdAt: 1 } } })) === null;
  out.emptyTracking = ImportPlacing.planOpen(Object.assign({}, base, { suiviModifications: {} })) !== null;
  out.notText = ImportPlacing.planOpen(null) === null && ImportPlacing.planOpen({ contenu: 12 }) === null;
  out.profileAlpha = ImportPlacing.profileOf(base.contenu);
  // 500 diapositives de texte (deux cadres et 3 500 signes chacune, 1,8 million de signes) : l'ouverture d'un bloc tient la page 5 s ; l'ancienne estimation au signe disait 650 ms
  const slide = n => (n > 1 ? '<div class="page-break-marker" contenteditable="false">Saut de page</div>' : '') + FreeFrame.html({ x: 40, y: 20, w: 560, h: 60 }, '<h1>Texte ' + n + '</h1>') + FreeFrame.html({ x: 40, y: 100, w: 560, h: 220 }, '<p>' + 'mot '.repeat(850) + '</p>');
  let many = '';
  for (let n = 1; n <= 500; n++) many += slide(n);
  const manyPlan = ImportPlacing.planOpen({ contenu: many, suiviModifications: null });
  out.many = { chars: many.length, planned: !!manyPlan, ms: Math.round(ImportPlacing.profileOf(many).ms), total: manyPlan && manyPlan.total, markers: ImportPlacing.profileOf(many).markers };
  // un texte de 40 diapositives légères (6 cadres chacune) : pas de plan
  let small = '';
  for (let n = 1; n <= 40; n++) small += (n > 1 ? '<div class="page-break-marker" contenteditable="false">Saut de page</div>' : '') + FreeFrame.html({ x: 40, y: 20, w: 560, h: 60 }, '<h1>Léger ' + n + '</h1>').repeat(6);
  out.smallDeck = { chars: small.length, planned: ImportPlacing.planOpen({ contenu: small, suiviModifications: null }) !== null, ms: Math.round(ImportPlacing.profileOf(small).ms) };
  return out;
}, IDS);
check('le plan d\'un texte lourd : un début (de quoi voir la présentation) et une suite, ' + SLIDES + ' diapositives en tout, sans perdre un octet, le début aux éléments ouverts et fermés', !!plans.alpha && plans.alpha.total === SLIDES && plans.alpha.lossless === true && plans.alpha.firstBalanced === true && plans.alpha.firstChars < plans.alpha.chars / 2 && plans.alpha.firstSlides === plans.alpha.firstBreaks + 1 && plans.alpha.firstShare > 0 && plans.alpha.firstShare < 0.5, plans.alpha);
check('le coût d\'ouverture compte les cadres, les cases et les sauts de page (Alpha : ' + SLIDES + ' diapositives, ' + (SLIDES * 2) + ' cadres, ' + (SLIDES * TABLE[0] * TABLE[1]) + ' cases)', plans.profileAlpha.frames === SLIDES * 2 && plans.profileAlpha.cells === SLIDES * TABLE[0] * TABLE[1] && plans.profileAlpha.markers === SLIDES - 1, plans.profileAlpha);
check('500 diapositives de texte (1 000 cadres, 1,8 million de signes) ont un plan : le coût compte les sauts de page (l\'ancienne estimation, au signe, les jugeait légères) ; 40 diapositives légères n\'en ont pas', plans.many.planned === true && plans.many.total === 500 && plans.many.ms >= 4000 && plans.smallDeck.planned === false, { many: plans.many, small: plans.smallDeck });
check('pas de plan : un petit modèle, un suivi des modifications, une entrée qui n\'est pas un texte ; un suivi VIDE ne compte pas', plans.light && plans.tracking && plans.notText && plans.emptyTracking, plans);

// ================= 2) Les PAS =================
const steps = await page.evaluate((ids) => {
  const count = (s, n) => s.split(n).length - 1;
  const balanced = text => ['div', 'table', 'ul', 'ol', 'blockquote'].every(tag => count(text, '<' + tag) === count(text, '</' + tag + '>'));
  const run = (text, budget) => { const all = [...ImportPlacing.stepsOf(text, budget)]; return { all, lossless: all.map(s => s.text).join('') === text, balanced: all.every(s => balanced(s.text)), maxMs: Math.max(...all.map(s => s.ms)), n: all.length }; };
  const out = {};
  const alpha = Templates.byId(ids.alpha).contenu;
  const a = run(alpha, ImportPlacing.STEP_MS);
  out.alpha = { n: a.n, lossless: a.lossless, balanced: a.balanced, maxMs: Math.round(a.maxMs) };
  const g = run(Templates.byId(ids.giant).contenu, ImportPlacing.STEP_MS);
  out.giant = { n: g.n, lossless: g.lossless, balanced: g.balanced, maxMs: Math.round(g.maxMs) };
  for (const k of ['gamma', 'delta', 'epsilon']) { const r = run(Templates.byId(ids[k]).contenu, ImportPlacing.STEP_MS); out[k] = { n: r.n, lossless: r.lossless, balanced: r.balanced }; }
  // le saut de page DANS une case n'est jamais une coupure : aucun pas ne finit par « avant le saut » ni ne commence par « après le saut »
  const nested = run(Templates.byId(ids.delta).contenu, ImportPlacing.STEP_MS).all;
  out.nestedWhole = nested.every(s => count(s.text, 'avant le saut') === count(s.text, 'après le saut'));
  // un bloc plus lourd qu'un pas à lui seul reste entier
  const manyFrames = n => Array.from({ length: n }, (_, i) => FreeFrame.html({ x: i, y: 0, w: 5, h: 5 }, '<p>c</p>')).join('');
  const bigTable = FreeFrame.html({ x: 0, y: 0, w: 500, h: 500 }, '<table><tbody>' + '<tr><td><p>a</p></td><td><p>b</p></td></tr>'.repeat(400) + '</tbody></table>');
  const atom = bigTable + manyFrames(40);
  const r = [...ImportPlacing.stepsOf(atom, ImportPlacing.STEP_MS)];
  out.atom = { n: r.length, first: r[0].text.endsWith('</div>') && r[0].text.indexOf('<tbody>') > 0 && r[0].text.split('class="pp-free-frame"').length === 2, lossless: r.map(s => s.text).join('') === atom };
  // le reste d'un bloc lourd, plus léger que la moitié d'un pas, ne fait pas un pas de plus
  out.tinyTail = [...ImportPlacing.stepsOf(bigTable + '<p>fin</p>', ImportPlacing.STEP_MS)].length;
  // un texte léger : un seul pas
  const light = FreeFrame.html({ x: 0, y: 0, w: 5, h: 5 }, '<p>a</p>') + FreeFrame.html({ x: 0, y: 0, w: 5, h: 5 }, '<p>b</p>');
  out.light = [...ImportPlacing.stepsOf(light, ImportPlacing.STEP_MS)].length;
  // une diapositive de 60 cadres (54 ms) n'est pas coupée en deux pas de 27 (moins d'un pas et demi) ; 130 cadres le sont
  out.slack = { sixty: [...ImportPlacing.stepsOf(manyFrames(60), ImportPlacing.STEP_MS)].length, many: [...ImportPlacing.stepsOf(manyFrames(130), ImportPlacing.STEP_MS)].length };
  return out;
}, IDS);
check('les pas redonnent exactement le texte et chacun a tous ses éléments fermés : Alpha, la présentation géante, les trois textes à saut de page dans un tableau', [steps.alpha, steps.giant, steps.gamma, steps.delta, steps.epsilon].every(r => r.lossless && r.balanced), steps);
check('un saut de page dans une case de tableau n\'est jamais une coupure (le tableau reste entier dans son pas)', steps.nestedWhole === true, steps.nestedWhole);
check('chaque pas coûte à peu près le pas (' + 40 + ' ms estimés, au plus 80) : Alpha en ' + steps.alpha.n + ' pas, la présentation géante (' + (BIG_SLIDES * BIG_FRAMES) + ' cadres) en ' + steps.giant.n + ' pas', steps.alpha.maxMs <= 80 && steps.alpha.n >= 8 && steps.giant.maxMs <= 80 && steps.giant.n >= BIG_SLIDES * BIG_FRAMES / 80, { alpha: steps.alpha, giant: steps.giant });
check('un bloc plus lourd qu\'un pas à lui seul reste entier (un pas à lui seul) ; son reste, plus léger que la moitié d\'un pas, n\'en fait pas un de plus ; un texte léger n\'est qu\'un pas ; 60 cadres ne se coupent pas, 130 oui', steps.atom.lossless && steps.atom.first && steps.atom.n >= 2 && steps.tinyTail === 1 && steps.light === 1 && steps.slack.sixty === 1 && steps.slack.many >= 2, { atom: steps.atom, tinyTail: steps.tinyTail, light: steps.light, slack: steps.slack });

// ================= 3) L'OUVERTURE dans la liste : Alpha =================
await watchOpening(page);
const savesBefore = (await stateOf(page)).saves;
const alphaPlan = await page.evaluate((id) => { const p = ImportPlacing.planOpen(Templates.byId(id)); return { firstSlides: p.firstSlides, firstShare: p.firstShare, total: p.total }; }, IDS.alpha);
const early = await chooseAndLook(page, IDS.alpha);
// Le premier tour de pose ne rend pas la main avant le premier pas : le coin d'état dit déjà la diapositive d'après (jusqu'à trois de plus), le voile, lui, montre son premier pas.
const statusN = Number((early.status.match(/… (\d+) \//) || [0, 0])[1]);
const veilN = early.veil ? Number((early.veil.line.match(/… (\d+) \//) || [0, 0])[1]) : 0;
check('au premier pas : le remplissage est en cours, le voile est déjà là avec son titre, « Ouverture des diapositives… ' + alphaPlan.firstSlides + ' / ' + SLIDES + ' » (ou le pas d\'après) et sa barre (à partir de ' + Math.round(100 * alphaPlan.firstShare) + ' %), le coin d\'état dit le même pas ou un des suivants',
  early.filling === true && !!early.veil && early.veil.title === 'Ouverture de la présentation' && /^Ouverture des diapositives… \d+ \/ 50$/.test(early.veil.line) && veilN >= alphaPlan.firstSlides && veilN <= alphaPlan.firstSlides + 4 && early.veil.percent >= Math.round(100 * alphaPlan.firstShare) && early.veil.percent < 100 && statusN >= alphaPlan.firstSlides && statusN <= alphaPlan.firstSlides + 4, { early, alphaPlan });
check('le conseil du voile parle de l\'ouverture (et non de l\'import) et dit que l\'éditeur est verrouillé', !!early.veil && /verrouillé le temps de l’ouverture/.test(early.veil.hint), early.veil && early.veil.hint);
check('au premier pas, seul le début du modèle est dans l\'éditeur : ' + (alphaPlan.firstSlides - 1) + ' sauts de page (le début) et au plus quatre de plus sur ' + (SLIDES - 1) + ', le modèle est le modèle courant', early.breaks >= alphaPlan.firstSlides - 1 && early.breaks <= alphaPlan.firstSlides + 3 && early.breaks < SLIDES - 10 && early.current == IDS.alpha, early);
await page.keyboard.type('qzjxqzjx');
await page.keyboard.press('Enter');
const typed = await page.evaluate(() => EditorCore.getEditor().state.doc.textContent.indexOf('qzjx') >= 0);
check('la frappe pendant le remplissage n\'atteint pas le texte (le voile prend le clavier)', typed === false);
await waitFilled(page, IDS.alpha);
const opened = await heartbeat(page);
const done = await stateOf(page);
const progressiveHtml = await textOf(page);
const classic = await classicOf(page, IDS.alpha);
check('à la fin : les ' + (SLIDES - 1) + ' sauts de page sont là, la bande des diapositives a ses ' + SLIDES + ' vignettes, le remplissage est fini, le voile est retiré', done.breaks === SLIDES - 1 && done.strip === SLIDES && done.filling === false && (await veilOf(page)).shown === false, { done });
check('le texte obtenu par pas est CELUI de l\'ouverture d\'un bloc, à l\'octet près (et celui que le modèle avait enregistré)', progressiveHtml === classic.html && classic.html === texts.alpha, { progressive: progressiveHtml.length, classic: classic.html.length, saved: texts.alpha.length });
check('le voile a dit l\'avancement au fil de l\'ouverture : au moins quatre textes « Ouverture des diapositives… n / ' + SLIDES + ' » différents, en croissant, et une barre qui avance', opened.lines.length >= 4 && opened.lines.every((l, i) => /^Ouverture des diapositives… \d+ \/ 50$/.test(l) && (i === 0 || Number(l.match(/(\d+) \//)[1]) > Number(opened.lines[i - 1].match(/(\d+) \//)[1]))) && opened.percents.length >= 4 && opened.percents.every((p, i) => i === 0 || p >= opened.percents[i - 1]), { lines: opened.lines.slice(0, 6), percents: opened.percents.slice(0, 8) });
check('la page reste fluide : le battement (10 ms) ne s\'arrête jamais plus de 300 ms pendant l\'ouverture par pas (l\'ouverture d\'un bloc de ce texte : ' + classic.ms + ' ms)', opened.max <= 300 && opened.over300 === 0, { maxGapMs: opened.max, over300: opened.over300, classicMs: classic.ms });
// Rien n'est « à enregistrer » : plusieurs passages de l'enregistrement automatique (3 s chacun) n'écrivent rien.
await sleep(7500);
const idle = await stateOf(page);
check('rien n\'est « à enregistrer » à l\'arrivée : aucune écriture dans Grist pendant le remplissage ni après, même après plusieurs passages de l\'enregistrement automatique', idle.saves === savesBefore, { before: savesBefore, after: idle.saves });
const statusIdle = await page.evaluate(() => document.getElementById('status-msg').textContent);
check('le coin d\'état ne parle plus de l\'ouverture (« Ouverture des diapositives »)', !/Ouverture des diapositives/.test(statusIdle), statusIdle);
// Une frappe ensuite : le modèle est « à enregistrer » et l'enregistrement écrit TOUT le texte.
await page.evaluate(() => { EditorCore.getEditor().commands.focus('start'); });
await page.keyboard.type('Z');
await page.waitForFunction((n) => window.__gristStub.countSaves('Publipostage_Modeles') > n, savesBefore, { timeout: 20000, polling: 200 }).catch(() => {});
const afterTyping = await page.evaluate(() => { const log = window.__gristStub.getActionLog().filter(a => a[0] === 'UpdateRecord' && a[1] === 'Publipostage_Modeles' && a[3] && 'Contenu' in a[3]); const last = log[log.length - 1]; return { writes: log.length, markers: last ? last[3].Contenu.split('class="page-break-marker"').length - 1 : 0, id: last ? last[2] : null }; });
check('une frappe après l\'ouverture marque le modèle : l\'enregistrement écrit le texte ENTIER (' + (SLIDES - 1) + ' sauts de page) dans la ligne du modèle', afterTyping.writes === 1 && afterTyping.markers === SLIDES - 1 && afterTyping.id == IDS.alpha, afterTyping);

// ================= 4) Enregistrer demandé pendant le remplissage : il attend et écrit le texte entier =================
await slowAppends(page, SLOW_MS);
await page.evaluate(() => { window.__gristStub.clearActionLog(); });
const during = await page.evaluate((id) => {
  const sel = document.getElementById('template-select');
  sel.value = String(id);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('btn-save').click();              // demandé à l'instant où le début est posé
  return { filling: ImportPlacing.isFilling(), writes: window.__gristStub.countSaves('Publipostage_Modeles') };
}, IDS.beta);
await sleep(700);
const duringLater = await page.evaluate(() => ({ filling: ImportPlacing.isFilling(), writes: window.__gristStub.countSaves('Publipostage_Modeles') }));
check('un Enregistrer demandé pendant le remplissage n\'écrit rien tant que le texte n\'est pas entier', during.filling === true && during.writes === 0 && duringLater.filling === true && duringLater.writes === 0, { during, duringLater });
await waitFilled(page, IDS.beta);
await page.waitForFunction(() => window.__gristStub.countSaves('Publipostage_Modeles') >= 1, null, { timeout: 30000, polling: 200 }).catch(() => {});
const savedWhole = await page.evaluate(() => { const log = window.__gristStub.getActionLog().filter(a => a[0] === 'UpdateRecord' && a[1] === 'Publipostage_Modeles' && a[3] && 'Contenu' in a[3]); const last = log[log.length - 1]; return { writes: log.length, markers: last ? last[3].Contenu.split('class="page-break-marker"').length - 1 : 0, id: last ? last[2] : null, lastSlide: last ? /Beta 50/.test(last[3].Contenu) : false }; });
check('puis il écrit le texte ENTIER du modèle ouvert (' + (SLIDES - 1) + ' sauts de page, la dernière diapositive), jamais son début', savedWhole.writes === 1 && savedWhole.markers === SLIDES - 1 && savedWhole.id == IDS.beta && savedWhole.lastSlide === true, savedWhole);

// ================= 5) Un autre modèle choisi pendant le remplissage l'arrête =================
await page.evaluate(() => { window.__gristStub.clearActionLog(); });
const midway = await page.evaluate(async (ids) => {
  const sel = document.getElementById('template-select');
  sel.value = String(ids.alpha);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  const count = () => { let n = 0; EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'pageBreak') n += 1; }); return n; };
  const first = count();
  const t0 = Date.now();
  while (count() < first + 6 && Date.now() - t0 < 30000) await new Promise(r => setTimeout(r, 10));
  const state = { filling: ImportPlacing.isFilling(), first, breaks: count() };
  sel.value = String(ids.gamma);                       // Gamma : un saut de page DANS un tableau de sa 40e diapositive
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return state;
}, IDS);
await waitFilled(page, IDS.gamma);
const switched = await page.evaluate(() => { const doc = EditorCore.getEditor().state.doc; return { alpha: doc.textContent.indexOf('Alpha ') >= 0, gamma: doc.textContent.indexOf('Gamma 50') >= 0, veil: (() => { const el = document.getElementById('pp-placing-modal'); return !!el && getComputedStyle(el).display !== 'none'; })(), saves: window.__gristStub.countSaves('Publipostage_Modeles') }; });
check('un autre modèle choisi pendant le remplissage l\'arrête : le premier était à moitié posé, rien d\'Alpha dans le second, le second est entier, le voile est retiré, rien n\'est écrit', midway.filling === true && midway.breaks >= midway.first + 6 && midway.breaks < SLIDES - 1 && switched.alpha === false && switched.gamma === true && switched.veil === false && switched.saves === 0, { midway, switched });
const gammaState = await stateOf(page);
const gammaClassic = await classicOf(page, IDS.gamma);
const gammaHtml = await textOf(page);
check('Gamma (un saut de page DANS un tableau de la 40e diapositive) : s\'ouvre par pas (le tableau reste entier) et le texte est IDENTIQUE à l\'ouverture d\'un bloc, ses ' + SLIDES + ' sauts de page y sont', gammaState.breaks === SLIDES && gammaHtml === gammaClassic.html && gammaClassic.html === texts.gamma, { breaks: gammaState.breaks, same: gammaHtml === gammaClassic.html, sameSaved: gammaClassic.html === texts.gamma });

await slowAppends(page, 0);
// ================= 6) Delta, Epsilon (un saut DANS un tableau, au début), Broke (un pas refusé) : textes identiques ; le petit modèle s'ouvre d'un bloc =================
for (const [key, label] of [['delta', 'Delta (un saut de page dans un tableau de la 3e diapositive)'], ['epsilon', 'Epsilon (un saut de page dans un tableau de la 2e diapositive)']]) {
  const opening = await chooseAndLook(page, IDS[key]);
  await waitFilled(page, IDS[key]);
  const html = await textOf(page);
  const reference = await classicOf(page, IDS[key]);
  check(label + ' : s\'ouvre par pas sous le voile, et le texte est IDENTIQUE à l\'ouverture d\'un bloc (et au texte enregistré)', opening.filling === true && !!opening.veil && html === reference.html && reference.html === texts[key], { filling: opening.filling, veil: !!opening.veil, same: html === reference.html, sameSaved: reference.html === texts[key] });
}
const broke = await chooseAndLook(page, IDS.broke);
await waitFilled(page, IDS.broke);
const brokeHtml = await textOf(page);
const brokeReference = await classicOf(page, IDS.broke);
const brokeState = await stateOf(page);
check('Broke (un `<div` dans un attribut : un pas dont les éléments ne se ferment pas) : le remplissage est abandonné, le texte est rechargé d\'un bloc et il est IDENTIQUE à l\'ouverture d\'un bloc, ses ' + (SLIDES - 1) + ' sauts de page y sont, le voile est retiré', broke.filling === true && brokeHtml === brokeReference.html && brokeState.breaks === SLIDES - 1 && brokeState.filling === false && (await veilOf(page)).shown === false, { filling: broke.filling, same: brokeHtml === brokeReference.html, breaks: brokeState.breaks });
await page.evaluate(() => { window.__veilLines.length = 0; });
const little = await chooseAndLook(page, IDS.petit);
await sleep(600);
const seenLittle = await page.evaluate(() => window.__veilLines.length);
const littleHtml = await textOf(page);
check('le petit modèle (6 diapositives) : s\'ouvre d\'un bloc - pas de remplissage, pas de voile, le texte est entier tout de suite', little.filling === false && little.veil === null && seenLittle === 0 && little.current == IDS.petit && littleHtml === texts.petit, { filling: little.filling, veil: little.veil, seen: seenLittle, same: littleHtml === texts.petit });

// ================= 7) Les diapositives GÉANTES : quelques diapositives de centaines de cadres =================
const giantPlan = await page.evaluate((id) => { const p = ImportPlacing.planOpen(Templates.byId(id)); return p && { firstSlides: p.firstSlides, total: p.total, firstShare: p.firstShare, firstChars: p.first.length, chars: Templates.byId(id).contenu.length }; }, IDS.giant);
await watchOpening(page);
const giantEarly = await chooseAndLook(page, IDS.giant);
check('la présentation géante a un plan dont le début s\'arrête AU MILIEU de la première diapositive (un début de quelques dizaines de cadres sur ' + BIG_FRAMES + ')', !!giantPlan && giantPlan.firstSlides === 1 && giantPlan.total === BIG_SLIDES && giantPlan.firstChars < giantPlan.chars / 10 && giantEarly.filling === true && giantEarly.frames > 0 && giantEarly.frames < BIG_FRAMES / 2, { giantPlan, frames: giantEarly.frames });
await waitFilled(page, IDS.giant);
const giantRun = await heartbeat(page);
const giantHtml = await textOf(page);
const giantClassic = await classicOf(page, IDS.giant);
const giantDone = await stateOf(page);
check('la présentation géante : à la fin ses ' + (BIG_SLIDES * BIG_FRAMES) + ' cadres et ' + (BIG_SLIDES - 1) + ' sauts de page sont là, le texte est IDENTIQUE à l\'ouverture d\'un bloc et au texte enregistré', giantDone.frames === BIG_SLIDES * BIG_FRAMES && giantDone.breaks === BIG_SLIDES - 1 && giantHtml === giantClassic.html && giantClassic.html === texts.giant, { frames: giantDone.frames, breaks: giantDone.breaks, same: giantHtml === giantClassic.html });
check('la page reste fluide pendant l\'ouverture de la présentation géante (aucun arrêt de plus de 550 ms, et deux au plus de plus de 300 : la clôture met en page, pagine et relit tout le texte, chacun dans sa tâche ; l\'ouverture d\'un bloc : ' + giantClassic.ms + ' ms) et la barre avance au fil des pas (' + giantRun.percents.length + ' valeurs) alors que le texte dit toujours la diapositive en cours', giantRun.max <= 550 && giantRun.over300 <= 2 && giantRun.percents.length >= 8 && giantRun.percents.every((p, i) => i === 0 || p >= giantRun.percents[i - 1]) && giantRun.lines.length <= BIG_SLIDES, { maxGapMs: giantRun.max, over300: giantRun.over300, classicMs: giantClassic.ms, percents: giantRun.percents.slice(0, 12), lines: giantRun.lines });
// ================= 7b) Un texte assez lourd pour être MASQUÉ derrière le voile : la mise en page finale est annoncée avant =================
await watchOpening(page);
await chooseAndLook(page, IDS.lock);
await waitFilled(page, IDS.lock);
const lockRun = await heartbeat(page);
const lockDone = await stateOf(page);
const lockHtml = await textOf(page);
const closingLines = lockRun.lines.filter(l => /^Mise en page finale/.test(l));
check('une présentation de 3 000 cadres (le texte est masqué derrière le voile) : le dernier mot du voile est « Mise en page finale de toutes les diapositives… » (une seule fois), après les « Ouverture des diapositives… »', closingLines.length === 1 && /^Mise en page finale/.test(lockRun.lines[lockRun.lines.length - 1]) && lockRun.lines.slice(0, -1).length >= 3 && lockRun.lines.slice(0, -1).every(l => /^Ouverture des diapositives… \d+ \/ 5$/.test(l)), { lines: lockRun.lines.slice(-4), closing: closingLines.length });
check('et le texte est entier à la fin (3 000 cadres, 4 sauts de page), identique à ce que le modèle avait enregistré, le voile retiré', lockDone.frames === 5 * BIG_FRAMES && lockDone.breaks === 4 && lockDone.filling === false && lockHtml === texts.lock && (await veilOf(page)).shown === false, { frames: lockDone.frames, breaks: lockDone.breaks, same: lockHtml === texts.lock });

// La copie d'une diapositive pour la bande (SlideStrip.pageCopy, comme ses miniatures : copiesOf) : `view.nodeDOM(pos)` cherche le bloc parmi tous ceux du texte, un à un, et coûtait 3 s pour une diapositive de dix mille
// cadres dans un texte de soixante mille blocs (11/11). Les blocs d'une diapositive se suivent : seul le premier est cherché ainsi, les autres sont des frères. La copie est la même, à l'élément près.
const stripCopy = await page.evaluate(() => {
  const ed = EditorCore.getEditor();
  const view = ed.view;
  // Les diapositives de ce texte n'ont pas de signet : on en réclame un par diapositive (la demande de la personne qui copie le lien), pour pouvoir demander la copie de la dernière.
  for (let k = 0; k < 5; k++) view.dispatch(ed.state.tr.setMeta(SlideProps.CLAIM_META, { index: k, id: 'diapo-' + k }));
  const anchors = SlideProps.anchorsOf(ed.state.doc);
  let calls = 0;
  const real = view.nodeDOM;
  view.nodeDOM = function (pos) { calls += 1; return real.call(this, pos); };
  let copy;
  try { copy = SlideStrip.pageCopy('diapo-4'); } finally { delete view.nodeDOM; }
  const kids = Array.from(view.dom.children);
  let from = 0;
  kids.forEach((child, i) => { if (child.classList.contains('page-break-marker')) from = i + 1; });
  const originals = kids.slice(from).filter(child => child.classList.contains('pp-free-frame'));
  const copies = copy && copy.page ? Array.from(copy.page.children).filter(child => child.classList.contains('pp-free-frame')) : [];
  return { anchors: anchors.length, calls, first: copies.length ? copies[0].textContent : '', originals: originals.length, copies: copies.length,
    sameText: originals.length === copies.length && originals.every((child, i) => child.textContent === copies[i].textContent),
    ids: copy && copy.page ? copy.page.querySelectorAll('[id]').length : -1, placeholders: copy && copy.page ? copy.page.querySelectorAll('[data-placeholder]').length : -1 };
});
check('la copie de la dernière diapositive géante pour la bande (' + BIG_FRAMES + ' cadres, la cinquième) cherche son premier bloc par nodeDOM et en suit les frères (au plus 3 appels de nodeDOM au lieu de ' + BIG_FRAMES + '), et reprend chaque cadre, dans l\'ordre, sans adresse ni texte indicatif', stripCopy.anchors === 5 && stripCopy.first === 'Verrou 5 cadre 0' && stripCopy.calls <= 3 && stripCopy.originals === BIG_FRAMES && stripCopy.copies === BIG_FRAMES && stripCopy.sameText && stripCopy.ids === 0 && stripCopy.placeholders === 0, stripCopy);
// À l'import : une diapositive géante posée par appendSlides se coupe aussi en pas, sans perdre un octet.
const importLike = await page.evaluate(async ({ frames }) => {
  const one = (n) => Array.from({ length: frames }, (_, i) => FreeFrame.html({ x: (i % 24) * 26, y: 10 + Math.floor(i / 24) * 12, w: 24, h: 10 }, `<p>Import ${n} cadre ${i}</p>`)).join('') + '<p></p>';
  const MARK = '<div class="page-break-marker"></div>';
  const first = FreeFrame.html({ x: 40, y: 20, w: 300, h: 60 }, '<h1>Import premier</h1>') + '<p></p>';
  const pieces = [one(2), one(3)];
  const whole = first + MARK + pieces[0] + MARK + pieces[1];
  Editor.setHTML(whole);
  const expected = Editor.getHTML();
  Editor.setHTML(first);
  const calls = [];
  const real = Editor.appendHTML;
  Editor.appendHTML = function (html, options) { calls.push(html.length); return real.call(this, html, options); };
  const t0 = performance.now();
  let maxStep = 0;
  const failed = await ImportPlacing.appendSlides(pieces.slice(), () => {}, { covered: () => false, onStep: () => { maxStep = Math.max(maxStep, performance.now() - t0); } });
  Editor.appendHTML = real;
  return { failed, steps: calls.length, same: Editor.getHTML() === expected, chars: expected.length };
}, { frames: BIG_FRAMES });
check('à l\'import, deux diapositives de ' + BIG_FRAMES + ' cadres posées par appendSlides se coupent en plusieurs pas chacune et le texte est celui d\'un seul bloc, à l\'octet près', importLike.failed === 0 && importLike.steps >= 2 * (BIG_FRAMES / 80) && importLike.same === true, importLike);
// À l'import, le début lui-même : trois diapositives légères restent le début d'avant ; trois diapositives géantes ne donnent qu'un début de la première, le reste de ces trois diapositives se pose par pas.
const firstTake = await page.evaluate(async ({ frames }) => {
  const PB = ImportPlacing.PAGE_BREAK;
  const slide = (n, count) => Array.from({ length: count }, (_, i) => FreeFrame.html({ x: (i % 24) * 26, y: 10 + Math.floor(i / 24) * 12, w: 24, h: 10 }, `<p>Début ${n} cadre ${i}</p>`)).join('') + '<p></p>';
  const out = {};
  const light = [slide(1, 3), slide(2, 3), slide(3, 3), slide(4, 3), slide(5, 3)];
  const lightTake = ImportPlacing.takeFirst(light.slice());
  out.light = { sameAsBefore: lightTake.first === light.slice(0, 3).join(PB) && lightTake.pieces.length === 2 && lightTake.leads.every(x => x === PB) && lightTake.started === 3 };
  const deck = [1, 2, 3, 4, 5].map(n => slide(n, frames));
  const joined = deck.slice(0, 3).join(PB);
  const take = ImportPlacing.takeFirst(deck.slice());
  out.giant = { started: take.started, firstFrames: take.first.split('class="pp-free-frame"').length - 1, pieces: take.pieces.length, lead0: take.leads[0], leads: take.leads.slice(1).every(x => x === PB), lossless: take.first + take.pieces[0] === joined };
  Editor.setHTML(deck.join(PB));
  const expected = Editor.getHTML();
  Editor.setHTML(take.first);
  const t0 = performance.now();
  const failed = await ImportPlacing.appendSlides(take.pieces, () => {}, { covered: () => false, markers: take.leads, tail: take.first });
  out.same = failed === 0 && Editor.getHTML() === expected;
  out.chars = expected.length;
  return out;
}, { frames: BIG_FRAMES });
check('à l\'import, trois diapositives légères restent le début d\'avant ; trois diapositives géantes ne donnent qu\'un début de la première (le reste se pose par pas, sans saut de page en tête) et le texte final est celui d\'un seul bloc, à l\'octet près', firstTake.light.sameAsBefore === true && firstTake.giant.started === 1 && firstTake.giant.firstFrames > 0 && firstTake.giant.firstFrames < BIG_FRAMES / 2 && firstTake.giant.pieces === 3 && firstTake.giant.lead0 === '' && firstTake.giant.leads === true && firstTake.giant.lossless === true && firstTake.same === true, firstTake);

// ================= 8) En anglais =================
const en = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: seedWith(), lang: 'en', colorScheme: 'light' });
await en.page.waitForFunction((n) => typeof ImportPlacing !== 'undefined' && Templates.getCached().length >= n, MODELS, { timeout: 30000 });
await sleep(1200);
const enPlan = await en.page.evaluate((id) => ImportPlacing.planOpen(Templates.byId(id)).firstSlides, IDS.alpha);
const enEarly = await chooseAndLook(en.page, IDS.alpha);
const enN = Number((enEarly.status.match(/… (\d+) \//) || [0, 0])[1]);
const enVeilN = enEarly.veil ? Number((enEarly.veil.line.match(/… (\d+) \//) || [0, 0])[1]) : 0;
check('[en] le voile dit « Opening the presentation », « Opening the slides… ' + enPlan + ' / ' + SLIDES + ' » (ou le pas d\'après) et son conseil en anglais, le coin d\'état aussi', !!enEarly.veil && enEarly.veil.title === 'Opening the presentation' && /^Opening the slides… \d+ \/ 50$/.test(enEarly.veil.line) && enVeilN >= enPlan && enVeilN <= enPlan + 4 && /The editor is locked while the presentation opens/.test(enEarly.veil.hint) && /^Opening the slides… \d+ \/ 50$/.test(enEarly.status) && enN >= enPlan, enEarly);
await waitFilled(en.page, IDS.alpha);
const enDone = await stateOf(en.page);
check('[en] à la fin le texte est entier et le voile est retiré', enDone.breaks === SLIDES - 1 && enDone.filling === false && (await veilOf(en.page)).shown === false, enDone);

await t.finish();
