#!/usr/bin/env node
// La diapositive où l'on est, gardée d'un mode à l'autre (demande du 11/11 : « quand on passe en mode lecture, aller à la diapo où l'on était et pas au début » ; js/main.js:switchMode, js/main-slides.js:slideToKeep et
// keepSlide, js/reader-mode.js:slideShown et showSlide, extensions/diapositives/slide-strip.js:shownSlide et showSlide). Ce test joue la partie à la vraie souris et au vrai clavier, 700x400, français clair puis anglais
// sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active.
//  DE L'ÉDITION À LA LECTURE : la Lecture s'ouvre sur la diapositive du curseur quand il est à l'écran, sinon sur celle du milieu de la zone qui défile ; sa page est à la même place que celle de la première quand la
//   Lecture s'ouvre en haut ; une diapositive qui déborde sur plusieurs pages (les diapositives d'après sont plus bas) et la Lecture sans Aperçu A4 (ni page ni couture) y mènent aussi.
//  DE LA LECTURE À L'ÉDITION : l'éditeur se pose sur la diapositive qu'on lisait (le curseur y entre, sa miniature est cochée, sa page est en haut) sans marquer le modèle modifié ; sans avoir lu plus loin, le curseur
//   reste où il était (ni au début de la diapositive, ni ailleurs).
//  UN DOCUMENT ne change pas : ni la Lecture ni l'éditeur n'y connaissent de diapositive, le curseur ne bouge pas.
// Lancé par run-headless.mjs (groupe Node "slidesReadingPlace", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-reading-place.mjs
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-reading-place', port: Number(process.env.SLIDES_READING_PLACE_PORT || 9172) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const FILL = (n, count = 6) => Array.from({ length: count }, (_, i) => `<p>Texte ${n}.${i + 1}</p>`).join('');
const SLIDE = (n, count) => `<h1>Titre ${n}</h1>${FILL(n, count)}`;
// Six diapositives courtes ; six dont la 3e déborde sur plusieurs pages ; un document long.
const SIX = [1, 2, 3, 4, 5, 6].map(n => SLIDE(n)).join(BR);
const LONG = [1, 2, 3, 4, 5, 6].map(n => SLIDE(n, n === 3 ? 90 : 6)).join(BR);
const DOCUMENT = '<h1>Document</h1>' + Array.from({ length: 80 }, (_, i) => `<p>Ligne ${i + 1}</p>`).join('');
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Six', '${SIX}', false, 'presentation');
  add(8, 'Longue', '${LONG}', false, 'presentation');
  add(9, 'Document long', '${DOCUMENT}', false, 'document');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;

function toolsOf(page) {
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const click = async (selector, index = 0, options = {}) => {
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    await page.mouse.click(c.x, c.y, options);
    await sleep(250);
    return c;
  };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  return { rectOf, click, leave, reach };
}

// Le titre (h1) qui tient le haut de la zone qui défile : { text, gap } (gap : sa distance au bord haut de la zone), ou null.
const topHeading = (page, scroller) => page.evaluate((scr) => {
  const box = document.querySelector(scr);
  const top = box.getBoundingClientRect().top + box.clientTop;
  const found = Array.from(box.querySelectorAll('h1')).find(h => h.getBoundingClientRect().bottom > top + 2);
  return found ? { text: found.textContent.trim(), gap: Math.round(found.getBoundingClientRect().top - top) } : null;
}, scroller);
const scrollOf = (page, scroller) => page.evaluate(scr => Math.round(document.querySelector(scr).scrollTop), scroller);
const caretOf = page => page.evaluate(() => {
  const ed = EditorCore.getEditor();
  const slides = SlideProps.slidesOf(ed.state.doc);
  const pos = ed.state.selection.from;
  return { slide: slides.findIndex(slide => pos >= slide.start && pos <= slide.end), text: ed.state.selection.$from.parent.textContent };
});

async function run(lang, colorScheme) {
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { rectOf, click, leave, reach } = toolsOf(page);
  const unsaved = () => page.evaluate(() => LiveEntry.hasUnsavedEdits());
  const open = async (id, slides) => {
    if (await unsaved()) { await leave(); await click('#btn-save'); await sleep(1000); await leave(); }
    await Promise.race([
      page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
      sleep(20000),
    ]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    if (slides) await page.waitForFunction(n => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === n; }, slides, { timeout: 15000 }).catch(() => {});
    await sleep(900);
  };
  const toRead = async () => { await leave(); await click('#btn-mode-read'); await sleep(1800); await leave(); };
  const toEdit = async () => { await leave(); await click('#btn-mode-edit'); await sleep(1200); await leave(); };
  // Roule la molette sur la zone qui défile `scroller` : `dy` pixels d'écran.
  const wheel = async (scroller, dy) => {
    const c = await rectOf(scroller);
    await reach({ x: c.left + c.width / 2, y: c.top + c.height / 2 });
    await page.mouse.wheel(0, dy);
    await sleep(500);
  };
  const EDITOR = '#editor-container';
  const READER = '#reader-container';
  // Le placement d'une diapositive en tête de la Lecture n'est pas celui d'un défilement quelconque : la première, ouverte en haut, donne la distance du titre au bord que les autres doivent avoir.
  let baseline = null;
  const isAtTop = (heading, title) => !!heading && heading.text === title && !!baseline && Math.abs(heading.gap - baseline) <= 4;

  // 1) De l'Édition à la Lecture : la diapositive du curseur, cliquée à la vraie souris dans la bande.
  console.log('\n' + tag + '1) La Lecture s\'ouvre sur la diapositive du curseur');
  await open(7, 6);
  await toRead();
  baseline = (await topHeading(page, READER) || {}).gap;
  check(tag + 'la Lecture d\'une présentation dont le curseur n\'est pas à l\'écran s\'ouvre sur la 1re diapositive (en haut, comme avant)', (await scrollOf(page, READER)) === 0 && (await topHeading(page, READER) || {}).text === 'Titre 1' && Number.isFinite(baseline), await topHeading(page, READER));
  await toEdit();
  await click('.pp-slide-item', 3);
  await leave();
  const caretBefore = await caretOf(page);
  check(tag + 'un clic sur la 4e miniature mène le curseur à la 4e diapositive', caretBefore.slide === 3, caretBefore);
  await toRead();
  const four = await topHeading(page, READER);
  check(tag + 'la Lecture s\'ouvre sur la 4e diapositive, sa page à la place de la première (et non en haut)', isAtTop(four, 'Titre 4') && (await scrollOf(page, READER)) > 0, { four, baseline, scroll: await scrollOf(page, READER) });
  check(tag + 'passer à la Lecture ne marque pas le modèle modifié', !(await unsaved()), null);

  // 2) De la Lecture à l'Édition : sans avoir lu plus loin, le curseur reste où il était.
  console.log('\n' + tag + '2) Sans lire plus loin, le curseur reste où il était');
  await toEdit();
  const same = await caretOf(page);
  check(tag + 'revenu à l\'Édition sans avoir fait défiler la Lecture, le curseur est toujours dans la 4e diapositive, au même endroit', same.slide === 3 && same.text === caretBefore.text, { same, caretBefore });
  const kept = await topHeading(page, EDITOR);
  check(tag + 'et la 4e diapositive est à l\'écran', !!kept && kept.text === 'Titre 4' && kept.gap >= -4 && kept.gap < HEIGHT / 2, kept);

  // 3) De la Lecture à l'Édition : la diapositive qu'on a lue en faisant défiler.
  console.log('\n' + tag + '3) L\'Édition se pose sur la diapositive qu\'on lisait');
  await toRead();
  await wheel(READER, 3000);
  const reading = await page.evaluate(() => ReaderMode.slideShown());
  check(tag + 'la molette a mené la Lecture à la fin du texte (6e diapositive)', reading === 5, reading);
  await toEdit();
  const edit6 = await caretOf(page);
  const head6 = await topHeading(page, EDITOR);
  const picked = await page.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-item')).findIndex(item => item.getAttribute('aria-selected') === 'true'));
  check(tag + 'l\'Édition retrouve la 6e diapositive : le curseur y est, sa miniature est cochée, son titre est à l\'écran', edit6.slide === 5 && picked === 5 && !!head6 && head6.text === 'Titre 6' && head6.gap >= -4 && head6.gap < HEIGHT / 2, { edit6, picked, head6 });
  check(tag + 'revenir à l\'Édition ne marque pas le modèle modifié', !(await unsaved()), null);

  // 4) Le curseur hors de l'écran : la diapositive du milieu de la zone qui défile décide.
  console.log('\n' + tag + '4) Le curseur hors de l\'écran');
  await wheel(EDITOR, -6000);
  const shownTop = await page.evaluate(() => SlideStrip.shownSlide());
  check(tag + 'le curseur (6e diapositive) hors de l\'écran, l\'éditeur dit montrer la 1re', shownTop === 0, shownTop);
  const pitch = await page.evaluate(() => {
    const box = document.getElementById('editor-container');
    const heads = Array.from(box.querySelectorAll('h1')).map(h => h.getBoundingClientRect().top + box.scrollTop);
    return heads[1] - heads[0];
  });
  await page.evaluate(p => { document.getElementById('editor-container').scrollTop = p; }, pitch);
  await sleep(400);
  await toRead();
  const two = await topHeading(page, READER);
  check(tag + 'la Lecture s\'ouvre sur la 2e diapositive, celle que l\'éditeur montrait (le curseur étant ailleurs)', isAtTop(two, 'Titre 2'), { two, baseline });
  await toEdit();

  // 5) Le curseur à l'écran passe avant le milieu : sa diapositive est celle qu'on écrivait.
  console.log('\n' + tag + '5) Le curseur à l\'écran passe avant le milieu');
  await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    let target = null;
    ed.state.doc.descendants((node, pos) => { if (!target && node.isTextblock && node.textContent === 'Texte 3.6') target = pos + 1; });
    ed.commands.setTextSelection(target);
    const box = document.getElementById('editor-container');
    const line = Array.from(box.querySelectorAll('.tiptap p')).find(p => p.textContent === 'Texte 3.6');
    box.scrollTop += line.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientTop - 8;
  });
  await sleep(500);
  const mid = await page.evaluate(() => {
    const box = document.getElementById('editor-container');
    const view = box.getBoundingClientRect();
    const heads = Array.from(box.querySelectorAll('h1')).map(h => ({ text: h.textContent, top: Math.round(h.getBoundingClientRect().top - view.top) }));
    return { heads: heads.filter(h => h.top > -50 && h.top < 420), shown: SlideStrip.shownSlide(), current: SlideStrip.current() };
  });
  check(tag + 'le curseur est dans la 3e diapositive, à l\'écran, alors que le milieu de la zone est dans la 4e : l\'éditeur dit montrer la 3e', mid.current === 2 && mid.shown === 2, mid);
  await toRead();
  check(tag + 'la Lecture s\'ouvre sur la 3e diapositive', isAtTop(await topHeading(page, READER), 'Titre 3'), await topHeading(page, READER));
  await toEdit();

  // 6) Une diapositive qui déborde sur plusieurs pages : celles d'après sont plus bas, et la Lecture y mène.
  console.log('\n' + tag + '6) Une diapositive qui déborde');
  await open(8, 6);
  await click('.pp-slide-item', 4);
  await leave();
  await toRead();
  const five = await topHeading(page, READER);
  check(tag + 'la 5e diapositive (après celle qui déborde) arrive en tête de la Lecture', isAtTop(five, 'Titre 5'), { five, baseline });
  const mapped = await page.evaluate(() => ({ reader: ReaderMode.slideShown() }));
  check(tag + 'et la Lecture dit montrer la 5e', mapped.reader === 4, mapped);
  // Une page de plus de la 3e diapositive : le milieu de la zone y tombe, une page après le haut de la 3e.
  const pagePitch = await page.evaluate(() => {
    const box = document.getElementById('reader-container');
    const tops = Array.from(box.querySelectorAll('h1')).map(h => h.getBoundingClientRect().top + box.scrollTop);
    return tops[1] - tops[0];
  });
  await page.evaluate((p) => { ReaderMode.showSlide(2); document.getElementById('reader-container').scrollTop += p + 30; }, pagePitch);
  await sleep(400);
  const insideLong = await page.evaluate(() => ReaderMode.slideShown());
  check(tag + 'une page de la diapositive qui déborde compte pour sa diapositive (la 3e), pas pour la suivante', insideLong === 2 && pagePitch > 100, { insideLong, pagePitch });
  await toEdit();
  const long3 = await caretOf(page);
  check(tag + 'revenu à l\'Édition, le curseur est dans la 3e diapositive', long3.slide === 2, long3);

  // 7) Sans Aperçu A4 (ni page ni couture) : la Lecture et l'éditeur se placent au premier bloc de la diapositive.
  console.log('\n' + tag + '7) Sans Aperçu A4');
  await open(7, 6);
  const a4 = await page.evaluate(() => { const box = document.getElementById('v2-toggle-a4-preview'); return box ? box.checked : null; });
  if (a4) { await page.evaluate(() => { const box = document.getElementById('v2-toggle-a4-preview'); box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(800); }
  await click('.pp-slide-item', 2);
  await leave();
  await toRead();
  const flat = await topHeading(page, READER);
  const flatSlide = await page.evaluate(() => ReaderMode.slideShown());
  check(tag + 'sans Aperçu A4, la Lecture s\'ouvre sur la 3e diapositive', !!flat && flat.text === 'Titre 3' && flat.gap < HEIGHT / 2 && flatSlide === 2, { flat, flatSlide, a4 });
  await wheel(READER, 3000);
  await toEdit();
  const flatBack = await caretOf(page);
  check(tag + 'et revenu à l\'Édition après avoir lu plus loin, le curseur est dans la dernière diapositive', flatBack.slide === 5, flatBack);
  if (a4) { await page.evaluate(() => { const box = document.getElementById('v2-toggle-a4-preview'); box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(800); }

  // 8) Un document ne change pas : rien n'y est gardé, le curseur ne bouge pas.
  console.log('\n' + tag + '8) Un document');
  await open(9, 0);
  const docCaret = await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.setTextSelection(60); document.getElementById('editor-container').scrollTop = 300; return ed.state.selection.from; });
  await sleep(300);
  await toRead();
  check(tag + 'la Lecture d\'un document ne connaît pas de diapositive (rien à garder)', (await page.evaluate(() => ReaderMode.slideShown())) === -1, null);
  await wheel(READER, 600);
  await toEdit();
  check(tag + 'l\'éditeur d\'un document ne connaît pas de diapositive non plus', (await page.evaluate(() => SlidesEntry.shownSlide())) === -1, null);
  check(tag + 'revenu à l\'Édition, le curseur d\'un document n\'a pas bougé', (await page.evaluate(() => EditorCore.getEditor().state.selection.from)) === docCaret, docCaret);

  await page.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
