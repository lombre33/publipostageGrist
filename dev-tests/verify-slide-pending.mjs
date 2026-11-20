#!/usr/bin/env node
// UNE DIAPOSITIVE D'UN GROS POWERPOINT NE FIGE PLUS L'ÉDITEUR (20/11, « sur un document pour l'ajout d'une diapo venant d'un ppt lourd, l'import fige encore l'éditeur complètement pendant plusieurs
// secondes ... un place holder dans le document et ça charge en fond ? ») : le cadre « chargement » (js/slide-copies.js : startPending), les pauses de la mise en image
// (extensions/diapositives/slide-raster.js) et de la liaison (js/slide-links.js : anchorSource), la source lue une seule fois.
// L'app hébergée par GFS (extension « diapositives »), 700x400, français clair puis anglais sombre. « Devis » (un document : « Bonjour, » et « Cordialement ») est à l'écran ; « Offre » (trois
// diapositives) est la source. La mise en image est ralentie (SLOW ms) pour avoir le temps de voir et d'agir pendant qu'elle se fait.
//  LE CADRE : dès le clic (« En bloc », « Garder liée »), un cadre « Diapositive 1 de « Offre » : chargement… » prend la place de la diapositive, entre les deux paragraphes ; le document, lui, n'a pas
//    changé (le cadre n'est qu'une décoration) ; la frappe pendant ce temps entre dans le texte et le cadre la suit ; la diapositive se pose après le texte tapé, le cadre part, le curseur reste où la
//    personne l'a laissé (dans « Bonjour,!! »), un seul Ctrl+Z défait la diapositive sans toucher à ce qui a été tapé ;
//  SANS RIEN FAIRE : le curseur suit la diapositive (il va dans le paragraphe d'après), comme avant ;
//  LE CURSEUR DÉPLACÉ pendant le dessin : la diapositive se pose à la place du clic, le curseur reste là où la personne l'a mis ;
//  UN DESSIN QUI ÉCHOUE : le cadre part, rien n'est posé, le coin d'état le dit ; « En texte » : le cadre est là aussi pendant la liaison ;
//  LA SOURCE N'EST LUE QU'UNE FOIS : la seconde diapositive liée de la même présentation ne relit ni ne réécrit la table, et ne relit pas la source (le texte numéroté de la première est gardé) ;
//  LA PAGE RESTE LIBRE : la mise en image d'une diapositive de 300 objets ne tient jamais la page plus de 250 ms d'un bloc (avant : plus d'une seconde).
// Lancé par run-headless.mjs (groupe Node « slidePending », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-pending.mjs
import { start, seedModels, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-pending', port: Number(process.env.SLIDE_PENDING_PORT || 9152) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const SLOW = 1200;
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Devis', '<p>Bonjour,</p><p>Cordialement</p>', false, 'document');
  add(8, 'Offre', '<h1>Un</h1><p>Texte un</p>${BR}<h1>Deux</h1><p>Texte deux</p>${BR}<h1>Trois</h1><p>Texte trois</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 9;
`;
const INIT = `try { localStorage.setItem('pp_autosave_enabled', 'false'); } catch (e) {}`;
const TEXTS = {
  fr: { label: n => `Diapositive ${n} de « Offre » : chargement…`, failed: 'dessin' },
  en: { label: n => `Slide ${n} of “Offre”: loading…`, failed: 'draw' },
};

// Le document : ses blocs de premier niveau, résumés.
const doc = page => page.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.forEach((node) => {
    if (node.type.name === 'paragraph' && node.childCount === 1 && node.firstChild.type.name === 'editorImage') out.push('image{' + (node.firstChild.attrs.slideLink ? 'lié' : '-') + '|' + (node.firstChild.attrs.slideText || '').split('\n')[0] + '}');
    else if (node.type.name === 'slideLink') out.push('repère');
    else out.push(node.type.name + ':' + node.textContent);
  });
  return out;
});
// Ce que l'écran montre du texte de l'éditeur, de haut en bas : « cadre » pour le cadre « chargement ».
const screen = page => page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .tiptap > *')).map((el) => {
  if (el.classList.contains('pp-slide-pending')) return 'cadre';
  if (el.querySelector('img.editor-image')) return 'image';
  return el.textContent.trim() || '(vide)';
}));
const frame = page => page.evaluate(() => { const el = document.querySelector('.pp-slide-pending'); return el ? { text: el.textContent.trim(), busy: el.getAttribute('aria-busy') } : null; });
const caretIn = page => page.evaluate(() => { const { $head } = EditorCore.getEditor().state.selection; return $head.parent.textContent; });
const status = page => page.evaluate(() => document.getElementById('status-msg').textContent);
const cursorEnd = (page, text) => page.evaluate((whole) => {
  const editor = EditorCore.getEditor();
  let at = -1;
  editor.state.doc.descendants((node, pos) => { if (at < 0 && node.isTextblock && node.textContent === whole) at = pos + node.nodeSize - 1; });
  editor.chain().focus().setTextSelection(at).run();
}, text);
const openPanel = (page, { block = true, linked = true } = {}) => page.evaluate(async ({ block, linked }) => {
  try { SlideImport.close(false, true); } catch (error) { /* le volet n'était pas ouvert */ }
  await SlidesEntry.openTextImport(false);
  const select = document.getElementById('pp-slide-import-source');
  select.value = '8';
  select.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 500));
  document.querySelectorAll('.pp-slide-import-kind-btn')[block ? 0 : 1].click();
  const keep = document.getElementById('pp-slide-import-keep');
  if (keep.checked !== linked) keep.click();
  await new Promise(r => setTimeout(r, 200));
}, { block, linked });
const click = (page, index) => page.evaluate(i => document.querySelectorAll('.pp-slide-import .pp-slide-item')[i].click(), index);
const waitFrame = (page, shown = true) => page.waitForFunction(on => !!document.querySelector('.pp-slide-pending') === on, shown, { timeout: 30000 });
const undo = async (page) => { await page.evaluate(() => EditorCore.getEditor().commands.focus()); await page.keyboard.press('Control+z'); await sleep(500); };

for (const [lang, scheme] of [['fr', 'light'], ['en', 'dark']]) {
  const X = TEXTS[lang];
  const tag = `[${lang}] `;
  const A = await t.openPage({ hosted: true, stub: { extensions: ['graphique', 'diapositives'] }, seed: SEED, lang, colorScheme: scheme, init: INIT });
  const { page } = A;
  await Promise.race([page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })), sleep(20000)]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '7' && !!EditorCore.getEditor(), null, { timeout: 15000 });
  await sleep(800);
  // La mise en image ralentie (ou en échec), et les lectures comptées : lectures et écritures de la table, lectures du texte de la source par l'éditeur (un texte à sauts de page lu par le lecteur de l'éditeur).
  await page.evaluate((slow) => {
    window.__slow = slow;
    window.__fail = false;
    window.__anchorSlow = 0;
    window.__n = { reads: 0, parses: 0 };
    const origAnchor = SlideLinks.anchorSource;
    SlideLinks.anchorSource = async (...args) => { await new Promise(r => setTimeout(r, window.__anchorSlow)); return origAnchor.apply(SlideLinks, args); };
    const docApi = grist.docApi;
    const fetchTable = docApi.fetchTable.bind(docApi);
    docApi.fetchTable = (table) => { if (table === 'Publipostage_Modeles') window.__n.reads++; return fetchTable(table); };
    const libs = SlideLinks.kit().libs;
    const fromSchema = libs.PMDOMParser.fromSchema.bind(libs.PMDOMParser);
    libs.PMDOMParser.fromSchema = (schema) => { const parser = fromSchema(schema); const parse = parser.parse.bind(parser); parser.parse = (...args) => { if (args[0] && args[0].querySelector && args[0].querySelector('.page-break-marker')) window.__n.parses++; return parse(...args); }; return parser; };
  }, SLOW);
  const counted = () => page.evaluate(() => Object.assign({}, window.__n));
  await cursorEnd(page, 'Bonjour,');
  await openPanel(page, { block: true, linked: true });
  // Le volet a chargé l'extension : sa mise en image se ralentit (ou échoue) à la demande.
  await page.evaluate(() => {
    const origSnapshot = SlideRaster.snapshot;
    SlideRaster.snapshot = async (...args) => {
      await new Promise(r => setTimeout(r, window.__slow));
      if (window.__fail) throw new Error('dessin impossible (essai)');
      return origSnapshot.apply(SlideRaster, args);
    };
  });
  check(tag + 'le document de départ : « Bonjour, » et « Cordialement »', JSON.stringify(await doc(page)) === JSON.stringify(['paragraph:Bonjour,', 'paragraph:Cordialement']), await doc(page));

  // --- Le cadre, la frappe pendant ce temps, le curseur qui reste.
  await click(page, 0);
  await waitFrame(page, true);
  const f = await frame(page);
  check(tag + 'dès le clic, un cadre « chargement » dit la diapositive et sa présentation', !!f && f.text === X.label(1) && f.busy === 'true', f);
  check(tag + 'le cadre est entre « Bonjour, » et « Cordialement » ; le document n’a pas changé (une décoration)', JSON.stringify(await screen(page)) === JSON.stringify(['Bonjour,', 'cadre', 'Cordialement']) && JSON.stringify(await doc(page)) === JSON.stringify(['paragraph:Bonjour,', 'paragraph:Cordialement']), { screen: await screen(page), doc: await doc(page) });
  const ratio = await contrastOf(page, '.pp-slide-pending-label');
  check(tag + 'le texte du cadre est lisible (contraste ≥ 4,5:1)', ratio >= 4.5, ratio);
  await page.evaluate(() => EditorCore.getEditor().commands.focus());
  await page.keyboard.type('!!');
  await sleep(150);
  check(tag + 'la frappe pendant le chargement entre dans le texte, le cadre y est encore et suit', JSON.stringify(await doc(page)) === JSON.stringify(['paragraph:Bonjour,!!', 'paragraph:Cordialement']) && !!(await frame(page)) && JSON.stringify(await screen(page)) === JSON.stringify(['Bonjour,!!', 'cadre', 'Cordialement']), { doc: await doc(page), screen: await screen(page) });
  await waitFrame(page, false);
  await sleep(300);
  let d = await doc(page);
  check(tag + 'la diapositive liée se pose après le texte tapé, le cadre est parti', d.length === 3 && d[0] === 'paragraph:Bonjour,!!' && d[1].startsWith('image{lié|') && d[2] === 'paragraph:Cordialement', d);
  check(tag + 'le curseur reste là où la personne l’a laissé (dans « Bonjour,!! »)', (await caretIn(page)) === 'Bonjour,!!', await caretIn(page));
  const firstReads = await counted();
  check(tag + 'la première liaison a lu la source (au moins un texte lu)', firstReads.parses >= 1, firstReads);
  await undo(page);
  d = await doc(page);
  check(tag + 'UN Ctrl+Z défait la diapositive sans toucher à ce qui a été tapé', d.length === 2 && d[0] === 'paragraph:Bonjour,!!' && d[1] === 'paragraph:Cordialement', d);

  // --- Sans rien faire : le curseur suit la diapositive. Et la seconde liaison ne relit rien.
  await cursorEnd(page, 'Bonjour,!!');
  const before = await counted();
  await click(page, 1);
  await waitFrame(page, true);
  check(tag + 'la diapositive suivante a son cadre aussi (diapositive 2)', ((await frame(page)) || {}).text === X.label(2), await frame(page));
  await waitFrame(page, false);
  await sleep(300);
  d = await doc(page);
  const after = await counted();
  check(tag + 'sans rien faire, la diapositive se pose et le curseur la suit (dans « Cordialement »)', d.length === 3 && d[1].startsWith('image{lié|') && (await caretIn(page)) === 'Cordialement', { d, caret: await caretIn(page) });
  check(tag + 'la seconde diapositive de la même présentation ne relit ni la table ni le texte de la source', after.reads === before.reads && after.parses === before.parses, { before, after });

  // --- Le curseur déplacé pendant le dessin : la diapositive reste à la place du clic, le curseur là où la personne l’a mis.
  await cursorEnd(page, 'Cordialement');
  await click(page, 2);
  await waitFrame(page, true);
  await cursorEnd(page, 'Bonjour,!!');
  await waitFrame(page, false);
  await sleep(300);
  d = await doc(page);
  check(tag + 'le curseur déplacé pendant le dessin : la diapositive 3 se pose à la place du clic (après « Cordialement »)', d.length >= 5 && d[0] === 'paragraph:Bonjour,!!' && d[2] === 'paragraph:Cordialement' && d[3].startsWith('image{lié|'), d);
  check(tag + 'le curseur reste où la personne l’a mis (« Bonjour,!! »)', (await caretIn(page)) === 'Bonjour,!!', await caretIn(page));

  // --- Un dessin qui échoue.
  const countBefore = (await doc(page)).length;
  await page.evaluate(() => { window.__fail = true; });
  await page.evaluate(() => EditorCore.getEditor().commands.focus());
  await cursorEnd(page, 'Cordialement');
  const textBefore = JSON.stringify(await doc(page));
  await click(page, 0);
  await waitFrame(page, true);
  await waitFrame(page, false);
  await sleep(300);
  check(tag + 'un dessin qui échoue : le cadre part, rien n’est posé', JSON.stringify(await doc(page)) === textBefore && (await doc(page)).length === countBefore, await doc(page));
  check(tag + 'le coin d’état dit que le dessin a échoué', new RegExp(X.failed, 'i').test(await status(page)), await status(page));
  await page.evaluate(() => { window.__fail = false; });

  // --- « En texte » : le cadre est là pendant la liaison.
  await openPanel(page, { block: false, linked: true });
  await page.evaluate(() => { window.__anchorSlow = 900; });
  await cursorEnd(page, 'Bonjour,!!');
  await click(page, 0);
  await waitFrame(page, true);
  check(tag + '« En texte », « Garder liée » : le cadre est là pendant la liaison', ((await frame(page)) || {}).text === X.label(1), await frame(page));
  await waitFrame(page, false);
  await sleep(300);
  d = await doc(page);
  check(tag + 'la copie liée en texte est posée avec son repère, le cadre est parti', d.includes('repère') && d.some(line => /Texte un/.test(line)) && !(await frame(page)), d);
  await page.evaluate(() => { window.__anchorSlow = 0; });

  // --- Un clic de plus pendant que la diapositive arrive : le coin d’état le dit, rien ne s’ajoute.
  await page.evaluate(() => { window.__slow = 1500; });
  await openPanel(page, { block: true, linked: true });
  await cursorEnd(page, 'Cordialement');
  const nBefore = (await doc(page)).length;
  await click(page, 1);
  await waitFrame(page, true);
  await click(page, 2);
  const wait = await status(page);
  await waitFrame(page, false);
  await sleep(300);
  check(tag + 'un second clic pendant le chargement ne pose rien de plus et le coin d’état le dit', (await doc(page)).length <= nBefore + 2 && /instant|moment/i.test(wait), { wait, doc: await doc(page) });
  await page.context().close();
}

// --- La page reste libre : la mise en image d'une diapositive de 300 objets ne la tient jamais d'un bloc.
{
  const A = await t.openPage({ hosted: true, stub: { extensions: ['graphique', 'diapositives'] }, seed: SEED, lang: 'fr', colorScheme: 'light', init: INIT });
  const { page } = A;
  await Promise.race([page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })), sleep(20000)]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '7' && !!EditorCore.getEditor(), null, { timeout: 15000 });
  await sleep(800);
  await page.evaluate(async () => { await SlidesEntry.openTextImport(false); });
  await sleep(500);
  const out = await page.evaluate(async () => {
    let html = '';
    for (let i = 0; i < 300; i++) html += FreeFrame.html({ x: (i % 30) * 20, y: 10 + Math.floor(i / 30) * 12, w: 18, h: 10, shape: 'rect', fill: '#0070c0', layer: 'behind', decorative: '1' }, '');
    html += FreeFrame.html({ x: 40, y: 20, w: 560, h: 60 }, '<h1>Titre</h1>');
    let last = performance.now();
    let max = 0;
    const timer = setInterval(() => { const now = performance.now(); max = Math.max(max, now - last - 5); last = now; }, 5);
    const started = performance.now();
    const shot = await SlidesEntry.blockSnapshot(html, Templates.byId(8), { rank: 1, total: 3 });
    clearInterval(timer);
    return { max: Math.round(max), total: Math.round(performance.now() - started), ok: !!(shot && shot.src), words: shot ? shot.words.length : 0 };
  });
  console.log('mise en image de 300 objets : plus long arrêt de la page', out.max, 'ms sur', out.total, 'ms');
  check('la mise en image d’une diapositive de 300 objets rend une image avec ses mots', out.ok && out.words >= 1, out);
  check('la page n’est jamais tenue plus de 250 ms d’un bloc pendant cette mise en image', out.max < 250, out);
  await page.context().close();
}

await t.finish();
