#!/usr/bin/env node
// La Lecture SANS ligne sélectionnée (demande d'Antoine du 2026-11-20 : « quand je passe en mode lecture, si GFS avec un document ou des slides est dans une table qui n'a pas de ligne, le mode lecture affiche encore
// "Aucune ligne sélectionnée"... il faudrait pouvoir passer en mode lecture indépendamment des lignes, et juste un warning discret qui indique qu'aucune ligne n'est sélectionnée »), à la vraie souris, au vrai clavier et
// à la molette, à 700x400, hébergé par GFS (dev-tests/gfs-stub.js), la table de la page SANS aucune ligne, en français clair puis en anglais sombre (js/reader-mode.js:render, js/reading-line.js, js/reader-guide.js:openHelp).
//  1) UNE PRÉSENTATION puis UN DOCUMENT : le vrai clic sur Mode lecture montre le document (les six diapositives, le texte du document) - ni « Aucune ligne sélectionnée » ni guide -, et la pastille discrète du coin bas gauche
//     de la zone de lecture dit « Aucune ligne sélectionnée » : sans flèches, entière dans le panneau, loin du texte qu'on lit ; elle s'efface presque pendant le défilement et revient ; la molette lit tout le document.
//  2) L'ÉDITION et la LECTURE ÉPURÉE ne la montrent pas ; une ligne qui arrive (clic dans le tableau relié) la fait disparaître et la Lecture garde le document ; la sélection qui se vide ne la fait pas revenir sur des données lues.
//  3) LE GUIDE reste à un clic : le « ? » de la pastille (widget non relié) ouvre le guide à quatre étapes dans une fenêtre qui tient dans le panneau (titre, quatre captures, bouton Fermer visibles, la molette atteint la fin),
//     se ferme au vrai clic sur Fermer et à Échap ; un widget relié n'a pas de « ? » ; le lien qui change en direct le montre ou le cache.
//  4) Sans l'accès complet, la Lecture sans ligne garde sa carte (le guide) : pas de document à montrer, pas de pastille.
//  5) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « readingNoRowMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-reading-no-row-mouse.mjs
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-reading-no-row-mouse', port: Number(process.env.READING_NO_ROW_PORT || 9176) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const FILL = (n, count = 6) => Array.from({ length: count }, (_, i) => `<p>Texte ${n}.${i + 1}</p>`).join('');
const SLIDE = n => `<h1>Titre ${n}</h1>${FILL(n)}`;
const SIX = [1, 2, 3, 4, 5, 6].map(SLIDE).join(BR);
const DOCUMENT = '<h1>Document de test</h1>' + Array.from({ length: 80 }, (_, i) => `<p>Ligne ${i + 1} du document</p>`).join('');
// Aucune ligne : seedModels({}) ne tire aucune ligne à la table de la page (PpDepart), le faux Grist n'envoie rien à grist.onRecord.
const SEED = seedModels({}) + `
  add(7, 'Six', '${SIX}', false, 'presentation');
  add(9, 'Document long', '${DOCUMENT}', false, 'document');
  stub.state.nextRowId.Publipostage_Modeles = 30;
`;
const LABELS = {
  fr: { noRow: 'Aucune ligne sélectionnée', help: 'Comment relier ce widget à un tableau ?', title: 'Reliez ce widget à votre tableau', close: 'Fermer', hint: /champs de fusion restent vides/, old: 'Aucune ligne sélectionnée' },
  en: { noRow: 'No row selected', help: 'How to link this widget to a table?', title: 'Link this widget to your table', close: 'Close', hint: /merge fields stay empty/, old: 'No row selected' },
};

function toolsOf(page) {
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const click = async (selector, index = 0) => {
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(250);
    return c;
  };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  return { rectOf, click, leave, reach };
}

// Ce que montre la Lecture et la pastille, mesuré dans la page.
const view = page => page.evaluate(() => {
  const reader = document.getElementById('reader-container');
  const content = reader.querySelector('.reader-content');
  const pill = document.getElementById('pp-reading-line');
  const shown = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  const box = pill ? pill.getBoundingClientRect() : null;
  const frame = reader.getBoundingClientRect();
  const help = pill && pill.querySelector('.pp-reading-line-help');
  return {
    doc: content ? content.textContent : '',
    guide: !!reader.querySelector(':scope > .reader-guide'),
    message: !!reader.querySelector(':scope > .reader-empty'),
    noRow: ReaderMode.showsNoRow(),
    slide: ReaderMode.slideShown(),
    pill: shown(pill),
    label: pill ? (pill.querySelector('.pp-reading-line-label') || {}).textContent : null,
    title: pill ? pill.title : '',
    arrows: pill ? Array.from(pill.querySelectorAll('.pp-reading-line-btn')).filter(b => b !== help && shown(b)).length : -1,
    help: shown(help),
    cls: pill ? pill.className : '',
    opacity: pill ? Number(getComputedStyle(pill).opacity) : null,
    pe: pill ? getComputedStyle(pill).pointerEvents : null,
    left: box ? Math.round(box.left) : null, right: box ? Math.round(box.right) : null, top: box ? Math.round(box.top) : null, bottom: box ? Math.round(box.bottom) : null,
    readerLeft: Math.round(frame.left), readerTop: Math.round(frame.top), readerBottom: Math.round(frame.bottom),
    scrollTop: Math.round(reader.scrollTop), scrollH: reader.scrollHeight, clientH: reader.clientHeight,
    pageW: document.documentElement.scrollWidth, innerW: window.innerWidth,
  };
});
const windowView = page => page.evaluate(() => {
  const win = document.getElementById('pp-reader-guide-modal');
  const open = !!win && getComputedStyle(win).display !== 'none';
  if (!open) return { open: false };
  const box = win.querySelector('.pp-modal-box').getBoundingClientRect();
  const body = win.querySelector('.pp-modal-body');
  const close = document.getElementById('pp-reader-guide-modal-close').getBoundingClientRect();
  const shots = Array.from(win.querySelectorAll('.reader-guide-shot img'));
  return {
    open, title: (win.querySelector('h3') || {}).textContent, steps: win.querySelectorAll('.reader-guide-step').length, innerTitle: !!win.querySelector('.reader-guide-title'),
    shots: shots.length, loaded: shots.filter(i => i.complete && i.naturalWidth > 0).length,
    box: { left: Math.round(box.left), top: Math.round(box.top), right: Math.round(box.right), bottom: Math.round(box.bottom) },
    close: { left: Math.round(close.left), top: Math.round(close.top), right: Math.round(close.right), bottom: Math.round(close.bottom) }, closeText: document.getElementById('pp-reader-guide-modal-close').textContent,
    bodyScroll: Math.round(body.scrollTop), bodyH: body.scrollHeight, bodyClientH: body.clientHeight, scrollW: body.scrollWidth, clientW: body.clientWidth,
    focusInside: win.contains(document.activeElement),
  };
});

async function run(lang, colorScheme) {
  const tag = `[${lang} ${colorScheme}] `;
  const L = LABELS[lang];
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { rectOf, click, leave, reach } = toolsOf(page);
  const open = async (id, slides) => {
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
  const wheel = async (dy) => {
    const c = await rectOf('#reader-container');
    await reach({ x: c.left + c.width / 2, y: c.top + c.height / 2 });
    await page.mouse.wheel(0, dy);
    await sleep(250);
  };
  const linking = (linked, access = 'full') => page.evaluate(([l, level]) => {
    const s = window.__gristStub.state;
    s.optionsCallback(s.options, { accessLevel: level, linking: l ? { asTarget: 'Cursor:Same-Table', asSource: false } : { asTarget: null, asSource: false } });
  }, [linked, access]);

  // 1) Une présentation dans une table sans ligne.
  console.log('\n' + tag + '1) Une présentation, la table de la page sans ligne');
  await open(7, 6);
  await toRead();
  let v = await view(page);
  check(tag + 'le vrai clic sur Mode lecture montre la présentation (six diapositives, la 1re en tête), ni « ' + L.old + ' » plein écran ni guide', v.doc.includes('Titre 1') && v.doc.includes('Titre 6') && v.slide === 0 && !v.guide && !v.message && v.noRow, { guide: v.guide, message: v.message, slide: v.slide, noRow: v.noRow, doc: v.doc.slice(0, 40) });
  check(tag + 'la pastille dit « ' + L.noRow + ' », sans flèches, avec son info-bulle', v.pill && v.label === L.noRow && v.arrows === 0 && /is-norow/.test(v.cls) && L.hint.test(v.title), { pill: v.pill, label: v.label, arrows: v.arrows, cls: v.cls, title: v.title });
  check(tag + 'elle est posée dans le coin bas gauche de la zone de lecture, entière dans le panneau, sans élargir la page', v.pill && v.left - v.readerLeft < 30 && v.readerBottom - v.bottom < 30 && v.top > v.readerTop && v.right <= v.innerW && v.pageW <= v.innerW, { v });
  await wheel(3000);
  v = await view(page);
  check(tag + 'la molette lit la présentation jusqu\'à la 6e diapositive, sans que la pastille la gêne ni change', v.slide === 5 && v.pill && v.label === L.noRow, { slide: v.slide, label: v.label });
  check(tag + 'pendant le défilement la pastille devient presque transparente et ne reçoit plus de clic', v.opacity < 0.5 && v.pe === 'none', { opacity: v.opacity, pe: v.pe });
  await sleep(1700);
  v = await view(page);
  check(tag + 'puis elle revient', v.opacity === 1 && v.pe !== 'none', { opacity: v.opacity, pe: v.pe });
  await wheel(-6000);

  // 2) Un document dans une table sans ligne.
  console.log('\n' + tag + '2) Un document, la table de la page sans ligne');
  await toEdit();
  v = await view(page);
  check(tag + 'en Édition, la pastille est cachée', !v.pill, { pill: v.pill });
  await open(9, 0);
  await toRead();
  v = await view(page);
  check(tag + 'la Lecture d\'un document montre son texte, sans guide ni message', v.doc.includes('Document de test') && v.doc.includes('Ligne 1 du document') && !v.guide && !v.message && v.slide === -1, { slide: v.slide, guide: v.guide, message: v.message });
  check(tag + 'la pastille « ' + L.noRow + ' » est là aussi', v.pill && v.label === L.noRow, { pill: v.pill, label: v.label });
  await wheel(30000);
  v = await view(page);
  check(tag + 'la molette atteint la fin du document (la dernière ligne se lit)', v.scrollTop + v.clientH >= v.scrollH - 2 && v.doc.includes('Ligne 80 du document'), { scrollTop: v.scrollTop, clientH: v.clientH, scrollH: v.scrollH });
  await wheel(-60000);

  // Lecture épurée : la pastille n'y est pas.
  await toEdit();
  await page.evaluate(() => CleanReading.choose('clean'));
  await toRead();
  v = await view(page);
  check(tag + 'la Lecture épurée ne la montre pas (le document, lui, y est)', !v.pill && v.doc.includes('Document de test'), { pill: v.pill });
  await page.evaluate(() => CleanReading.exit());
  await sleep(900);
  await page.evaluate(() => CleanReading.choose('simple'));
  await toEdit();

  // 3) Le guide à quatre étapes, à un clic de la pastille.
  console.log('\n' + tag + '3) Le guide reste à un clic');
  await linking(false);
  await toRead();
  v = await view(page);
  check(tag + 'widget non relié : la pastille a son « ? » (« ' + L.help + ' »)', v.pill && v.help, { pill: v.pill, help: v.help, noRow: v.noRow, body: await page.evaluate(() => document.body.className), mode: await page.evaluate(() => document.getElementById('reader-container').style.display) });
  const helpName = await page.evaluate(() => (document.querySelector('.pp-reading-line-help') || {}).title);
  check(tag + 'son info-bulle est « ' + L.help + ' »', helpName === L.help, helpName);
  await click('.pp-reading-line-help');
  await sleep(700);
  let w = await windowView(page);
  check(tag + 'un vrai clic sur le « ? » ouvre le guide à quatre étapes dans une fenêtre : « ' + L.title + ' », quatre captures chargées, pas de second titre dans la carte',
    w.open && w.title === L.title && w.steps === 4 && !w.innerTitle && w.shots === 4 && w.loaded === 4, w);
  check(tag + 'la fenêtre tient dans le panneau de ' + WIDTH + 'x' + HEIGHT + ' (rien ne dépasse, aucun défilement horizontal) et le bouton « ' + L.close + ' » est visible',
    w.open && w.box.left >= 0 && w.box.right <= WIDTH && w.box.top >= 0 && w.box.bottom <= HEIGHT && w.close.bottom <= HEIGHT && w.close.top >= w.box.top && w.closeText === L.close && w.scrollW <= w.clientW, w);
  check(tag + 'le focus est entré dans la fenêtre', w.focusInside, w);
  const bodyBox = await rectOf('#pp-reader-guide-modal .pp-modal-body');
  await reach({ x: bodyBox.left + bodyBox.width / 2, y: bodyBox.top + bodyBox.height / 2 });
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 200); await sleep(40); }
  await sleep(200);
  w = await windowView(page);
  check(tag + 'la molette fait défiler le guide dans la fenêtre jusqu\'à la fin (seul le contenu défile : titre et bouton restent)', w.bodyScroll > 100 && w.bodyScroll + w.bodyClientH >= w.bodyH - 2 && w.close.bottom <= HEIGHT && w.box.top >= 0, w);
  await click('#pp-reader-guide-modal-close');
  await sleep(300);
  w = await windowView(page);
  v = await view(page);
  check(tag + 'un vrai clic sur « ' + L.close + ' » ferme la fenêtre ; le document et la pastille sont là, le focus est revenu au « ? »', !w.open && v.pill && v.doc.includes('Document de test') && (await page.evaluate(() => document.activeElement === document.querySelector('.pp-reading-line-help'))), { w, pill: v.pill });
  await click('.pp-reading-line-help');
  await sleep(500);
  await page.keyboard.press('Escape');
  await sleep(300);
  w = await windowView(page);
  check(tag + 'Échap la ferme aussi', !w.open, w);
  // Au vrai clavier : Tab jusqu'au « ? », Entrée l'ouvre.
  await page.evaluate(() => document.querySelector('.pp-reading-line-help').focus());
  await page.keyboard.press('Enter');
  await sleep(500);
  w = await windowView(page);
  check(tag + 'au vrai clavier, Entrée sur le « ? » ouvre le guide', w.open && w.steps === 4, w);
  await page.keyboard.press('Escape');
  await sleep(300);

  // Le lien change en direct.
  await linking(true);
  await sleep(300);
  v = await view(page);
  check(tag + '« Sélectionner par » choisi dans Grist : la pastille reste, son « ? » s\'en va, le document aussi', v.pill && !v.help && v.doc.includes('Document de test') && !v.guide, { pill: v.pill, help: v.help });
  await linking(false);
  await sleep(300);
  v = await view(page);
  check(tag + '« Sélectionner par » vidé : le « ? » revient', v.pill && v.help, { pill: v.pill, help: v.help });
  await linking(true);
  await sleep(300);

  // 4) Une ligne arrive.
  console.log('\n' + tag + '4) Une ligne arrive');
  await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Alice', Statut: 'Urgent' }, 'PpDepart'));
  await sleep(1500);
  v = await view(page);
  check(tag + 'une ligne arrive (clic dans le tableau relié) : la pastille « sans ligne » disparaît, le document reste', !v.pill && !v.noRow && v.doc.includes('Document de test') && !v.guide && !v.message, { pill: v.pill, noRow: v.noRow });
  await page.evaluate(() => window.__gristStub.fireRecord(null, 'PpDepart'));
  await sleep(1200);
  v = await view(page);
  check(tag + 'la sélection qui se vide ne redessine pas la Lecture (comme avant) : la pastille ne prétend pas qu\'aucune ligne n\'est lue', !v.noRow && v.doc.includes('Document de test'), { pill: v.pill, noRow: v.noRow });

  // De retour en Édition puis en Lecture avec le curseur sans ligne : la pastille revient.
  await toEdit();
  await toRead();
  v = await view(page);
  check(tag + 'une nouvelle entrée en Lecture, sans ligne : la pastille est là de nouveau', v.pill && v.label === L.noRow && v.doc.includes('Document de test'), { pill: v.pill, label: v.label });
  await toEdit();
  await page.close();
}

// 5) Sans l'accès complet : la carte reste, la pastille n'existe pas.
async function runNoAccess(lang) {
  const tag = `[${lang} sans accès complet] `;
  const L = LABELS[lang];
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme: 'light' });
  const { click, leave } = toolsOf(page);
  console.log('\n' + tag + '5) Sans l\'accès complet');
  await page.evaluate(() => {
    const s = window.__gristStub.state;
    s.accessLevel = 'read table';
    s.optionsCallback(s.options, { accessLevel: 'read table', linking: { asTarget: null, asSource: false } });
  });
  await leave();
  await click('#btn-mode-read');
  await sleep(1500);
  const v = await view(page);
  check(tag + 'avec l\'accès à la table seulement, la Lecture sans ligne garde le guide (pas de document à montrer), sans pastille « sans ligne »', v.guide && !v.pill && !v.noRow, { guide: v.guide, pill: v.pill, noRow: v.noRow });
  await page.close();
}

await run('fr', 'light');
await run('en', 'dark');
await runNoAccess('fr');
await t.finish();
