#!/usr/bin/env node
// L'harmonisation de Slides+ (carte du 02/11, « Tout corriger d'un coup » : les écarts de cohérence de l'audit, au sein de Slides+ et avec Document et Grille), à la vraie souris et au vrai
// clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active.
//  LE MOT « DIAPOSITIVE » : dans une présentation, le bouton d'orientation (« Diapositive 16:9 en paysage... »), le titre du menu et la case d'aperçu (js/orientation-toggle.js), le repère de la
//   couture entre deux diapositives dans l'éditeur et dans la Lecture (SlidesEntry.seamLabel : « Diapositive 2 »), disent « diapositive », jamais « page » ; un document garde « Page ».
//  LE BOUTON DU SAUT DE PAGE (js/main-toolbar.js:syncPageBreakButton) : dans une présentation, « Nouvelle diapositive ici » (un vrai clic ouvre une diapositive de plus, un Ctrl+Z la reprend) ;
//   dans un document, « Saut de page » comme avant.
//  LES RAPPORTS DE LA DIAPOSITIVE (PageLayout.getSlideRatios) : le menu de la page d'une présentation a sous son titre 16:9, 4:3, 16:10 et 1:1 (celui de la page est coché, « Format libre... » ne
//   l'est plus) ; un vrai clic sur 4:3 pose la page 25,4 x 19,05 cm (le bouton, la case d'aperçu et la feuille le disent) et un Ctrl+Z rend le 16:9 ; 16:10 et 1:1 se choisissent de même, la
//   diapositive se voit en entier (js/page-zoom.js : le plancher du zoom ne vaut pas pour elle) ; le menu d'un document n'a pas ce choix.
//  LE TEXTE D'ATTENTE : une présentation vierge invite à écrire « votre première diapositive », un document vierge « votre modèle ».
//  LE VOLET « IMPORTER » : à 700x400, deux miniatures au moins se voient en entier sous l'indication, que « Garder liée » allonge.
//  LES NOUVEAUTÉS : l'écran « Slides+ » du carrousel parle des formes, des transitions, des notes et de PowerPoint.
// Lancé par run-headless.mjs (groupe Node "slidesHarmony", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-harmony.mjs
// SLIDES_HARMONY_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';

const SHOTS = process.env.SLIDES_HARMONY_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-slides-harmony', port: Number(process.env.SLIDES_HARMONY_PORT || 8944) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
// 7 « Deux » : une présentation de deux diapositives ; 8 « Vierge » : une présentation vide ; 9 « Doc » : un document de deux pages ; 10 « Doc vide » : un document vide ;
// 11 « Source » : six diapositives, de quoi remplir le volet « Importer ».
const SIX = Array.from({ length: 6 }, (_, i) => `<h2>Titre ${i + 1}</h2><p>Texte de la diapositive ${i + 1}</p>`).join(BR);
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Deux', '<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><p>Second texte</p>', false, 'presentation');
  add(8, 'Vierge', '<p></p>', false, 'presentation');
  add(9, 'Doc', '<p>Page un</p>${BR}<p>Page deux</p>', false, 'document');
  add(10, 'Doc vide', '<p></p>', false, 'document');
  add(11, 'Source', '${SIX}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 12;
`;

const TEXTS = {
  fr: {
    slideButton: ratio => `Diapositive ${ratio} en paysage (passer en portrait)`, docButton: 'Page A4 en portrait (passer en paysage)', slideTitle: 'Diapositive', docTitle: 'Page', seam: 'Diapositive 2', docSeam: 'Page 2',
    preview: ratio => `Aperçu ${ratio}`, previewWord: 'diapositive', pageTip: 'Nouvelle diapositive ici', pageAria: 'Commencer une nouvelle diapositive ici : le texte qui suit passe sur la diapositive suivante',
    docPageTip: 'Saut de page', docPageAria: 'Insérer un saut de page (forcé à l’export PDF)', ratios: ['Grand écran (16:9)', 'Standard (4:3)', 'Écran 16:10', 'Carré (1:1)'], ratioGroup: 'Format de la diapositive',
    custom: 'Format libre…', placeholderSlide: 'Commencez à écrire votre première diapositive ici…', placeholderDoc: 'Commencez à écrire votre modèle ici…',
    news: 'Des présentations : formes, transitions et notes', newsWord: 'PowerPoint', portrait: ratio => `Diapositive ${ratio} en portrait (passer en paysage)`,
  },
  en: {
    slideButton: ratio => `${ratio} slide in landscape (switch to portrait)`, docButton: 'A4 page in portrait (switch to landscape)', slideTitle: 'Slide', docTitle: 'Page', seam: 'Slide 2', docSeam: 'Page 2',
    preview: ratio => `${ratio} preview`, previewWord: 'slide', pageTip: 'New slide here', pageAria: 'Start a new slide here: the text that follows moves to the next slide',
    docPageTip: 'Page break', docPageAria: 'Insert a page break (forced on PDF export)', ratios: ['Widescreen (16:9)', 'Standard (4:3)', '16:10 screen', 'Square (1:1)'], ratioGroup: 'Slide format',
    custom: 'Custom size…', placeholderSlide: 'Start writing your first slide here…', placeholderDoc: 'Start writing your template here…',
    news: 'Presentations: shapes, transitions and notes', newsWord: 'PowerPoint', portrait: ratio => `${ratio} slide in portrait (switch to landscape)`,
  },
};
const RATIO_IDS = ['190.5x338.7', '190.5x254', '190.5x304.8', '190.5x190.5'];
const RATIO_NAMES = ['16:9', '4:3', '16:10', '1:1'];

async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

// Les outils d'une page ouverte : positions et gestes à la vraie souris (la souris arrive près de la cible, puis glisse dessus : un long trajet passerait sur les menus au survol de la barre).
function toolsOf(page) {
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const hover = async (selector, index = 0) => {
    const c = await rectOf(selector, index);
    if (!c || !c.width) throw new Error('introuvable ou masqué : ' + selector + ' #' + index);
    await page.mouse.move(c.x - 10, c.y);
    await page.mouse.move(c.x, c.y, { steps: 2 });
    await sleep(120);
    return c;
  };
  const click = async (selector, index = 0, wait = 300) => { const c = await hover(selector, index); await page.mouse.click(c.x, c.y); await sleep(wait); return c; };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(250); };
  return { rectOf, hover, click, leave };
}

// Ce que dit le bouton d'orientation, le menu de la page et la case d'aperçu.
const pageState = page => page.evaluate(() => {
  const flyout = document.getElementById('v2-page-flyout');
  const block = document.getElementById('v2-page-ratios');
  const choices = block ? Array.from(block.querySelectorAll('[data-page-ratio]')) : [];
  const custom = document.getElementById('v2-btn-page-custom');
  const flyoutRect = flyout.getBoundingClientRect();
  return {
    button: document.getElementById('btn-page-orientation').getAttribute('aria-label'),
    title: document.getElementById('v2-page-flyout-label').textContent,
    flyoutLabel: flyout.getAttribute('aria-label'),
    preview: document.getElementById('v2-a4-toggle').getAttribute('data-tip'),
    previewAria: document.getElementById('v2-a4-toggle').getAttribute('aria-label'),
    ratiosShown: !!block && !block.hidden && block.getBoundingClientRect().width > 0,
    ratioGroup: block ? block.getAttribute('aria-label') : null,
    ratios: choices.map(c => ({ id: c.getAttribute('data-page-ratio'), text: c.textContent, checked: c.getAttribute('aria-checked'), title: c.title, label: c.getAttribute('aria-label'), role: c.getAttribute('role') })),
    customChecked: custom ? custom.getAttribute('aria-checked') : null,
    customSize: custom ? custom.querySelector('.v2-page-row-size').textContent : null,
    format: PageLayout.getFormat(), size: PageLayout.getPageSizeMm(), landscape: PageLayout.isLandscape(),
    flyoutBottom: flyoutRect.bottom, flyoutWidth: flyoutRect.width,
  };
});

async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page, natives, context } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { rectOf, hover, click, leave } = toolsOf(page);
  const open = async (id, slides) => {
    await Promise.race([
      page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
      sleep(20000),
    ]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    if (slides) await page.waitForFunction(n => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === n; }, slides, { timeout: 15000 }).catch(() => {});
    await sleep(900);
  };
  const press = async (key) => { await page.keyboard.press(key); await sleep(260); };
  // Un modèle modifié poserait sa question « Enregistrer / Abandonner / Annuler » à l'appel `ouvrir` de GFS : on enregistre d'abord, au vrai clic ; la souris s'en va ensuite (le menu au survol resterait ouvert).
  const save = async () => { await leave(); await click('#btn-save'); await sleep(1000); await leave(); };
  // Le menu de la page s'ouvre au survol du bouton d'orientation (la souris vient de la barre : un trajet court).
  const openPageMenu = async () => { await hover('#btn-page-orientation'); await sleep(250); };
  const seamLabels = (container) => page.evaluate((sel) => Array.from(document.querySelectorAll(sel + ' .v2-page-break-label')).map(e => e.textContent), container);

  // --- Une présentation : le mot « diapositive » partout où l'on parlait de page.
  await open(7, 2);
  await page.evaluate(() => Editor.refreshPaginationPreview());
  await sleep(500);
  let s = await pageState(page);
  check(tag + 'une présentation : le bouton d\'orientation dit « ' + T.slideButton('16:9') + ' », la case d\'aperçu « ' + T.preview('16:9') + ' » et son nom accessible parle d\'une ' + T.previewWord,
    s.button === T.slideButton('16:9') && s.preview === T.preview('16:9') && s.previewAria.toLowerCase().includes(T.previewWord) && !/\bpage\b/i.test(s.previewAria.replace(/PDF/g, '')), { button: s.button, preview: s.preview, aria: s.previewAria });
  check(tag + 'le menu de la page a pour titre « ' + T.slideTitle + ' » (son nom accessible aussi)', s.title === T.slideTitle && s.flyoutLabel === T.slideTitle, { title: s.title, label: s.flyoutLabel });
  const seams = await seamLabels('#editor-container');
  check(tag + 'la couture entre les deux diapositives de l\'éditeur dit « ' + T.seam + ' », pas « ' + T.docSeam + ' »', seams.includes(T.seam) && !seams.includes(T.docSeam), seams);

  // --- Le bouton du saut de page.
  const tip = await page.evaluate(() => { const b = document.getElementById('v2-btn-page-break'); return { tip: b.getAttribute('data-tip'), aria: b.getAttribute('aria-label') }; });
  check(tag + 'le bouton du saut de page d\'une présentation s\'appelle « ' + T.pageTip + ' » et son nom accessible dit ce qu\'il fait', tip.tip === T.pageTip && tip.aria === T.pageAria, tip);
  await click('.pp-slide-thumb', 0);
  await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.focus(); });
  await sleep(200);
  await page.evaluate(() => document.getElementById('v2-btn-page-break').scrollIntoView({ block: 'nearest', inline: 'center' }));
  await click('#v2-btn-page-break');
  await page.waitForFunction(() => document.querySelectorAll('.pp-slide-item').length === 3, null, { timeout: 5000 }).catch(() => {});
  const afterBreak = await page.evaluate(() => document.querySelectorAll('.pp-slide-item').length);
  check(tag + 'un vrai clic sur « ' + T.pageTip + ' » ouvre une diapositive de plus (trois)', afterBreak === 3, afterBreak);
  await press('Control+z');
  const afterUndo = await page.evaluate(() => document.querySelectorAll('.pp-slide-item').length);
  check(tag + 'UN Ctrl+Z la reprend (deux diapositives)', afterUndo === 2, afterUndo);

  // --- Les rapports de la diapositive.
  await leave();
  await openPageMenu();
  s = await pageState(page);
  check(tag + 'le menu a, sous son titre, les quatre rapports 16:9, 4:3, 16:10 et 1:1, nommés ; celui de la page (16:9) est coché, aucun autre',
    s.ratiosShown && s.ratioGroup === T.ratioGroup && s.ratios.map(r => r.text).join('|') === RATIO_NAMES.join('|') && s.ratios.map(r => r.id).join('|') === RATIO_IDS.join('|')
      && s.ratios.map(r => r.title).join('|') === T.ratios.join('|') && s.ratios.every(r => r.label === r.title && r.role === 'menuitemradio') && s.ratios.map(r => r.checked).join('|') === 'true|false|false|false', s);
  check(tag + '« ' + T.custom + ' » n\'est plus cochée pour le 16:9 (c\'est un rapport du menu, pas un format libre) ; le menu tient dans le panneau',
    s.customChecked === 'false' && s.customSize === '' && s.flyoutBottom <= HEIGHT, { customChecked: s.customChecked, customSize: s.customSize, bottom: s.flyoutBottom });
  await snap(page, `${lang}-menu-page`);
  await click('#v2-page-ratios [data-page-ratio="190.5x254"]');
  await leave();
  s = await pageState(page);
  const sheet = await page.evaluate(() => ({ width: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pp-page-width')), height: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pp-page-height')) }));
  check(tag + 'un vrai clic sur 4:3 pose la page 25,4 x 19,05 cm : le bouton dit « ' + T.slideButton('4:3') + ' », la case « ' + T.preview('4:3') + ' », la feuille est large comme 4 pour 3',
    s.format === '190.5x254' && Math.abs(s.size.width - 254) < 0.05 && Math.abs(s.size.height - 190.5) < 0.05 && s.landscape && s.button === T.slideButton('4:3') && s.preview === T.preview('4:3') && Math.abs(sheet.width / sheet.height - 4 / 3) < 0.01,
    { format: s.format, size: s.size, button: s.button, preview: s.preview, sheet });
  await openPageMenu();
  s = await pageState(page);
  check(tag + 'le menu coche 4:3 seul, et « ' + T.custom + ' » ne l\'est toujours pas', s.ratios.map(r => r.checked).join('|') === 'false|true|false|false' && s.customChecked === 'false', s);
  await leave();
  await press('Control+z');
  s = await pageState(page);
  check(tag + 'UN Ctrl+Z rend le 16:9', s.format === '190.5x338.7' && s.button === T.slideButton('16:9'), { format: s.format, button: s.button });
  await press('Control+Shift+z');
  s = await pageState(page);
  check(tag + 'Ctrl+Maj+Z rend le 4:3', s.format === '190.5x254', s.format);
  // 16:10 : la diapositive se voit en entier même dans le panneau étroit (le plancher du zoom des pages ne vaut pas pour elle).
  await openPageMenu();
  await click('#v2-page-ratios [data-page-ratio="190.5x304.8"]');
  await leave();
  await sleep(600);
  const wide = await page.evaluate(() => {
    const box = document.getElementById('editor-container');
    return { format: PageLayout.getFormat(), factor: PageZoom.factorFor(box), overflowX: box.scrollWidth - box.clientWidth, button: document.getElementById('btn-page-orientation').getAttribute('aria-label') };
  });
  check(tag + 'un vrai clic sur 16:10 : « ' + T.slideButton('16:10') + ' », et la diapositive tient en largeur dans le panneau (aucun défilement de côté, zoom sous le plancher des pages)',
    wide.format === '190.5x304.8' && wide.button === T.slideButton('16:10') && wide.factor < 0.4995 && wide.overflowX <= 1, wide);
  await openPageMenu();
  await click('#v2-page-ratios [data-page-ratio="190.5x190.5"]');
  await leave();
  s = await pageState(page);
  check(tag + 'un vrai clic sur 1:1 pose une diapositive carrée', s.format === '190.5x190.5' && Math.abs(s.size.width - s.size.height) < 0.05 && s.button === T.slideButton('1:1'), { format: s.format, size: s.size, button: s.button });
  await click('#btn-page-orientation');
  await leave();
  s = await pageState(page);
  check(tag + 'le bouton tourne la diapositive carrée sans changer son format (portrait)', s.format === '190.5x190.5' && !s.landscape && s.button === T.portrait('1:1'), { format: s.format, landscape: s.landscape, button: s.button });
  await openPageMenu();
  await click('#v2-page-ratios [data-page-ratio="190.5x254"]');
  await leave();
  s = await pageState(page);
  check(tag + 'en portrait, 4:3 s\'écrit « ' + T.portrait('3:4') + ' » : le rapport suit le sens', s.button === T.portrait('3:4'), s.button);
  await page.evaluate(() => PageLayout.setMarginsMm(Object.assign(PageLayout.getMarginsMm(), { orientation: 'landscape', format: PageLayout.SLIDE_FORMAT })));

  // --- La Lecture : le même repère.
  await click('#btn-mode-read', 0, 1500);
  const readSeams = await seamLabels('#reader-container');
  check(tag + 'la Lecture d\'une présentation dit « ' + T.seam + ' » à la couture', readSeams.includes(T.seam) && !readSeams.includes(T.docSeam), readSeams);
  await click('#btn-mode-edit', 0, 800);

  // --- Un document garde « Page » et son saut de page.
  await save();
  await open(9);
  await page.evaluate(() => Editor.refreshPaginationPreview());
  await sleep(500);
  s = await pageState(page);
  const docTip = await page.evaluate(() => { const b = document.getElementById('v2-btn-page-break'); return { tip: b.getAttribute('data-tip'), aria: b.getAttribute('aria-label') }; });
  const docSeams = await seamLabels('#editor-container');
  check(tag + 'un document garde ses mots : « ' + T.docButton + ' », titre « ' + T.docTitle + ' », couture « ' + T.docSeam + ' », bouton « ' + T.docPageTip + ' »',
    s.button === T.docButton && s.title === T.docTitle && s.flyoutLabel === T.docTitle && docSeams.includes(T.docSeam) && !docSeams.includes(T.seam) && docTip.tip === T.docPageTip && docTip.aria === T.docPageAria, { button: s.button, title: s.title, docSeams, docTip });
  check(tag + 'le menu d\'un document n\'a pas les rapports de la diapositive', !s.ratiosShown, { shown: s.ratiosShown });

  // --- Le texte d'attente.
  await open(8, 1);
  let placeholder = await page.evaluate(() => { const p = document.querySelector('#editor-container .tiptap p.is-editor-empty, #editor-container .tiptap p.is-empty'); return p ? p.getAttribute('data-placeholder') : null; });
  check(tag + 'une présentation vierge invite à écrire « ' + T.placeholderSlide + ' »', placeholder === T.placeholderSlide, placeholder);
  await snap(page, `${lang}-vierge`);
  await open(10);
  placeholder = await page.evaluate(() => { const p = document.querySelector('#editor-container .tiptap p.is-editor-empty, #editor-container .tiptap p.is-empty'); return p ? p.getAttribute('data-placeholder') : null; });
  check(tag + 'un document vierge garde « ' + T.placeholderDoc + ' »', placeholder === T.placeholderDoc, placeholder);

  // --- Le volet « Importer » : deux miniatures au moins sous l'indication.
  await open(7, 2);
  await click('.pp-slide-import-open', 0, 900);
  await click('.pp-slide-import .ss-trigger', 0, 400);
  await page.keyboard.type('sour');
  await sleep(250);
  await press('Enter');
  await sleep(700);
  const density = async () => page.evaluate(() => {
    const list = document.querySelector('.pp-slide-import-list');
    const box = list.getBoundingClientRect();
    const items = Array.from(list.querySelectorAll('.pp-slide-item')).map((item) => { const r = item.getBoundingClientRect(); return r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5; });
    const hint = document.querySelector('.pp-slide-import-hint');
    const lineHeight = parseFloat(getComputedStyle(hint).lineHeight) || 14;
    return { full: items.filter(Boolean).length, total: items.length, hintLines: Math.round((hint.getBoundingClientRect().height - 3) / lineHeight), hint: hint.textContent, listHeight: Math.round(box.height), bottom: Math.round(box.bottom) };
  });
  let d = await density();
  check(tag + 'le volet d\'import montre au moins deux miniatures en entier à ' + WIDTH + 'x' + HEIGHT + ' (une indication de deux lignes au plus)', d.total === 6 && d.full >= 2 && d.hintLines <= 2 && d.bottom <= HEIGHT, d);
  await snap(page, `${lang}-import`);
  await click('.pp-slide-import-keep', 0, 700);
  d = await density();
  check(tag + '« Garder liée » cochée, l\'indication s\'allonge et deux miniatures se voient encore en entier', d.full >= 2 && d.bottom <= HEIGHT, d);
  await click('.pp-slide-import-close', 0, 500);

  // --- Les nouveautés.
  await page.evaluate(() => WhatsNew.open(6)); // index 6 : Boucle, versions, galerie, signets, mise en forme du texte, écriture en direct, puis Slides+
  await sleep(1000);
  const newsText = await page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"]')).map(dialog => dialog.textContent).join(' '));
  check(tag + 'l\'écran « Slides+ » des nouveautés s\'intitule « ' + T.news + ' » et parle de ' + T.newsWord, newsText.includes(T.news) && newsText.includes(T.newsWord), newsText.slice(0, 300));
  await snap(page, `${lang}-nouveautes`);
  check(tag + 'aucune boîte native (alert, confirm, prompt)', natives.length === 0, natives);
  await context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
