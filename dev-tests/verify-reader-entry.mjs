#!/usr/bin/env node
// L'entrée en Lecture d'une présentation de quarante diapositives (demande du 03/11, « bascule en mode lecture qui prend de longues secondes ») : ce qui l'allonge, et que la Lecture
// ne montre pas autrement. js/main.js:switchMode, js/reader-mode.js (render, resolveReaderBody, refitToContent), js/slides-entry.js:outputHtml, js/comments.js:buildReaderHtml et
// js/header-footer-preview.js:recomputeIfShown, hébergé par GFS (simulé par dev-tests/gfs-page.mjs), 700x400, la page jouée par la vraie souris pour les clics.
//  UN SEUL RENDU À LA PREMIÈRE ENTRÉE : le conteneur de la Lecture vient d'être affiché, c'est le moment où l'observateur de taille (js/main.js:wirePageFitZoom) trouvait le facteur d'ajustement changé et
//   redessinait toute la Lecture en plein rendu ; avec des barres de défilement qui prennent de la largeur (chez qui les a classiques), le contenu qui entre le changeait une fois de plus. `ReaderMode.render` n'est
//   appelé qu'une fois, avec ou sans barres, et le facteur final est celui que le conteneur donne maintenant (la page tient dans la largeur qui reste).
//  LE HTML N'EST PAS REFAIT POUR RIEN : le même document, rentré une deuxième fois en Lecture, ne repasse ni par SlideProps.forOutput ni par la sérialisation du modèle (js/slides-entry.js:outputHtml,
//   js/comments.js:buildReaderHtml : numéro de rendu des repères de position inchangé) ; la page lue est la même, au caractère près. Rien n'est servi de périmé : un texte tapé, un autre format de page, un
//   autre réglage des titres, un thème d'une autre couleur ou un lien entre diapositives (qui lit d'autres modèles) refont le calcul.
//  LES LECTURES DE GRIST SE RECOUVRENT : les types de colonnes se lisent avant que le HTML se construise, et les images de variable, les codes QR, les graphiques et les puces se résolvent ensemble (l'une après
//   l'autre, quatre allers-retours de suite avant la première image).
//  L'ÉDITEUR MASQUÉ NE SE REPAGINE PAS : l'observateur de taille le voit tomber à zéro à l'entrée en Lecture et relançait sa minuterie, 0,2 s de calcul sans rien à mesurer juste après la première image ;
//   au retour en Édition, la pagination est celle d'avant (mêmes pages) et le premier clic y mène.
// Lancé par run-headless.mjs (groupe Node "readerEntry", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-reader-entry.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-reader-entry', port: Number(process.env.READER_ENTRY_PORT || 8982) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
// Quarante diapositives d'environ 600 caractères de texte : plus de 20 000 caractères de HTML, de quoi que le calcul vaille d'être gardé (js/slides-entry.js:OUTPUT_CACHE_MIN_CHARS).
const SLIDES = 40;
const DECK = Array.from({ length: SLIDES }, (_, i) => `<h2>Diapositive ${i + 1}</h2><p>${LOREM.repeat(5)}</p>`).join(BR);
const MARGINS = { top: 14, right: 20, bottom: 14, left: 20, orientation: 'landscape', format: '190.5x338.7' };
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Quarante', ${JSON.stringify(DECK)}, false, 'presentation');
  m.Margins[m.Margins.length - 1] = ${JSON.stringify(JSON.stringify(MARGINS))};
  stub.state.nextRowId.Publipostage_Modeles = 8;
  stub.state.lastTableId = 'PpDepart';
`;

// Ouvre la présentation (l'appel `ouvrir` de GFS) et laisse l'éditeur se paginer.
async function openDeck(harness) {
  const tab = await (harness || t).openPage({ hosted: true, stub: { extensions: ['diapositives'] }, seed: SEED, lang: 'fr', colorScheme: 'light' });
  const { page } = tab;
  await Promise.race([page.evaluate(() => window.__gfsStub.ouvrir({ fichier: { id: '7', type: 'modele' }, type: '', dossier: '', raison: 'explorateur' })), sleep(20000)]);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '7' && document.querySelectorAll('.pp-slide-strip .pp-slide-item').length > 0, null, { timeout: 30000 }).catch(() => {});
  await sleep(2500);
  return tab;
}
// Le HTML de la Lecture tel qu'il s'est posé, sans ce qui change d'un rendu à l'autre (adresses d'images fabriquées, numéro de rendu des repères de position).
const readerHtml = page => page.evaluate(() => document.getElementById('reader-container').innerHTML.replace(/blob:[^"')\s]+/g, 'blob:X').replace(/(data-pp-pos="|data-pp-atom=")\d+:/g, '$1V:'));
const enterReading = async page => {
  await page.click('#btn-mode-read');
  await page.waitForFunction(() => !!document.querySelector('#reader-container .reader-content'), null, { timeout: 30000 });
  await sleep(1800);
};
const backToEdit = async page => { await page.click('#btn-mode-edit'); await sleep(1800); };

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 1. Un seul rendu à la première entrée, sans barres de défilement puis avec (le Chromium des essais les cache par défaut : `scrollbars`)
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function firstEntry(label, tab) {
  const { page } = tab;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.evaluate(() => {
    window.__renders = 0;
    const render = ReaderMode.render;
    ReaderMode.render = function (...args) { window.__renders++; return render.apply(this, args); };
    // L'ordre dans lequel le facteur d'ajustement est mesuré (l'écart de hauteur des lignes de tableau : PageZoom.rowGrow) et posé sur le conteneur de la Lecture (`--pp-fit-zoom`).
    window.__fitOrder = [];
    const rowGrow = PageZoom.rowGrow;
    PageZoom.rowGrow = function (zoom) { window.__fitOrder.push('mesure:' + zoom); return rowGrow.apply(this, arguments); };
    const box = document.getElementById('reader-container');
    const setProperty = box.style.setProperty;
    box.style.setProperty = function (name, value) { if (name === '--pp-fit-zoom') window.__fitOrder.push('pose:' + value); return setProperty.apply(this, arguments); };
  });
  await enterReading(page);
  const state = await page.evaluate(() => {
    const c = document.getElementById('reader-container');
    return {
      renders: window.__renders, zoom: parseFloat(c.style.getPropertyValue('--pp-fit-zoom')), fresh: PageZoom.factorFor(c), bar: c.offsetWidth - c.clientWidth,
      sheets: c.querySelectorAll('.reader-content').length, text: c.textContent.length, order: window.__fitOrder,
    };
  });
  check(`${label} : la première entrée en Lecture ne dessine la page qu'une fois`, state.renders === 1, state.renders);
  check(`${label} : la Lecture est là (feuille, ${SLIDES} diapositives de texte)`, state.sheets >= 1 && state.text > SLIDES * 500, state);
  // Le facteur posé est celui que le conteneur donne maintenant : la page tient dans la largeur qui reste (barre de défilement comprise).
  check(`${label} : la page est ajustée à la largeur qui reste (facteur ${state.zoom}, relu ${state.fresh && state.fresh.toFixed(3)})`, Number.isFinite(state.zoom) && Math.abs(state.zoom - state.fresh) < 0.0015, state);
  // Chaque facteur est mesuré avant d'être posé (la sonde de l'écart des lignes, la variable déjà posée, ferait refaire le style de toute la Lecture) : avec des barres, le facteur final n'est celui d'aucune
  // pose d'avant, il vient de la mise en page.
  const unmeasured = state.order.filter((step, i) => step.startsWith('pose:') && step !== 'pose:1' && !state.order.slice(0, i).includes('mesure:' + step.slice(5)));
  check(`${label} : chaque facteur est mesuré avant d'être posé (${state.order.join(' ')})`, state.order.some(step => step.startsWith('pose:')) && unmeasured.length === 0, state.order);
  check(`${label} : aucune erreur de page`, errors.length === 0, errors);
  return state;
}
{
  const tab = await openDeck();
  const state = await firstEntry('sans barres', tab);
  check('sans barres : essai fait sans barre de défilement visible', state.bar === 0, state.bar);
  await tab.context.close();
}
{
  // Un second Chromium, aux barres de défilement visibles : ses cas rendent leurs verdicts par le `check` du premier (un seul compte à la fin), seul son navigateur est refermé ici.
  const bars = await start({ name: 'verify-reader-entry-barres', port: Number(process.env.READER_ENTRY_PORT || 8982) + 1, scrollbars: true });
  const tab = await openDeck(bars);
  const state = await firstEntry('avec barres', tab);
  // Ce cas ne vaut que si la barre existe : sans elle, l'essai ne dit rien de ce qu'elle change.
  check('avec barres : la Lecture a une barre de défilement verticale qui prend de la largeur', state.bar > 5, state.bar);
  await bars.browser.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 2. Le HTML n'est pas refait pour rien, et rien n'est servi de périmé
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
{
  const tab = await openDeck();
  const { page } = tab;
  // Les passes qui refont le HTML d'une présentation à la sortie (SlideProps.forOutput, une par entrée en Lecture si rien n'est gardé), et le numéro de rendu des repères de position (Comments.buildReaderHtml).
  await page.evaluate(() => {
    window.__passes = 0;
    const forOutput = SlideProps.forOutput;
    SlideProps.forOutput = function (...args) { window.__passes++; return forOutput.apply(this, args); };
  });
  await enterReading(page);
  const first = { passes: await page.evaluate(() => window.__passes), html: await readerHtml(page) };
  await backToEdit(page);
  await page.evaluate(() => { window.__passes = 0; });
  await enterReading(page);
  const second = { passes: await page.evaluate(() => window.__passes), html: await readerHtml(page) };
  check('HTML : la première entrée construit le HTML de sortie de la présentation', first.passes >= 1, first.passes);
  check('HTML : la deuxième entrée, le document inchangé, ne le reconstruit pas', second.passes === 0, second.passes);
  check('HTML : la page lue est la même, au caractère près', first.html === second.html && first.html.length > 20000, { first: first.html.length, second: second.html.length });

  const versions = await page.evaluate(async () => {
    const a = await Comments.buildReaderHtml();
    const b = await Comments.buildReaderHtml();
    return { same: a === b, length: a.length, tag: (a.match(/data-pp-pos="(\d+):/) || [])[1] };
  });
  check('HTML : le modèle sérialisé deux fois de suite pour la Lecture donne le même texte (même numéro de rendu)', versions.same && versions.length > 20000, versions);

  // Un texte tapé : le document change, la Lecture le montre.
  await backToEdit(page);
  await page.evaluate(() => { window.__passes = 0; });
  await page.click('.tiptap h2');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Zeppelin');
  await sleep(500);
  await enterReading(page);
  const typed = await page.evaluate(() => ({ passes: window.__passes, seen: document.getElementById('reader-container').textContent.includes('Zeppelin') }));
  check('périmé : un texte tapé dans l\'éditeur est dans la Lecture, le HTML est refait', typed.seen && typed.passes >= 1, typed);

  // Les réglages que le calcul lit hors du document : le format de la page, les styles des titres du document, le thème. Chacun, changé, refait le calcul (le même HTML, deux fois, le fait une seule).
  const settings = await page.evaluate(() => {
    const html = '<h2>Titre</h2><p>' + 'texte '.repeat(4000) + '</p>';
    let passes = 0;
    const forOutput = SlideProps.forOutput;
    SlideProps.forOutput = function (...args) { passes++; return forOutput.apply(this, args); };
    const run = (options) => { const before = passes; SlidesEntry.outputHtml('presentation', html, options); return passes - before; };
    const out = {};
    out.first = run({ anchors: true });
    out.again = run({ anchors: true });
    out.otherOptions = run({ anchors: false });
    out.theme = run({ anchors: true, theme: { name: 'x', colors: { bg: '#102030' } } });
    out.themeAgain = run({ anchors: true, theme: { name: 'x', colors: { bg: '#102030' } } });
    const setting = Templates.getDocumentSetting;
    Templates.getDocumentSetting = function (name) { return name === HeadingStyles.SETTING ? { 1: { color: '#123456' } } : setting.apply(this, arguments); };
    out.headings = run({ anchors: true });
    out.headingsAgain = run({ anchors: true });
    Templates.getDocumentSetting = setting;
    const format = PageLayout.getFormat();
    PageLayout.setFormat('A5');
    out.format = run({ anchors: true });
    PageLayout.setFormat(format);
    out.formatBack = run({ anchors: true });
    out.link = (() => { const linked = html.replace('<h2>', '<h2 data-link-slide="1">'); const a = (() => { const b = passes; SlidesEntry.outputHtml('presentation', linked, { anchors: true }); SlidesEntry.outputHtml('presentation', linked, { anchors: true }); return passes - b; })(); return a; })();
    SlideProps.forOutput = forOutput;
    return out;
  });
  check('périmé : le même HTML, les mêmes options, une seule fois calculé', settings.first >= 1 && settings.again === 0, settings);
  check('périmé : d\'autres options refont le calcul', settings.otherOptions >= 1, settings);
  check('périmé : un thème d\'une autre couleur refait le calcul, le même thème ensuite non', settings.theme >= 1 && settings.themeAgain === 0, settings);
  check('périmé : un autre réglage des titres du document refait le calcul, le même ensuite non', settings.headings >= 1 && settings.headingsAgain === 0, settings);
  check('périmé : un autre format de page refait le calcul, le retour au format d\'avant aussi (un seul résultat par page)', settings.format >= 1 && settings.formatBack >= 1, settings);
  check('périmé : un HTML qui renvoie à d\'autres diapositives (lien entre diapositives) est recalculé à chaque fois', settings.link >= 2, settings);
  await tab.context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 3. Les lectures de Grist se recouvrent
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
{
  const tab = await openDeck();
  const { page } = tab;
  const calls = await page.evaluate(async () => {
    const order = [];
    const gates = [];
    const slow = (name, value) => function () { order.push(name); return new Promise(resolve => gates.push(() => resolve(value))); };
    // Les quatre résolutions et la lecture des types de colonnes, retenues : rien ne les libère avant qu'on regarde qui a commencé.
    const restore = [];
    const swap = (object, key, replacement) => { const old = object[key]; object[key] = replacement; restore.push(() => { object[key] = old; }); };
    swap(Variables, 'resolveAttachmentIds', slow('image', [7]));
    swap(QrCode, 'resolveImage', slow('qr', undefined));
    swap(ChartEntry, 'resolveImage', slow('graphique', undefined));
    swap(GristAPI, 'getCurrentUserEmail', slow('puce', 'a@b.fr'));
    const refresh = GristAPI.refreshColumnTypes;
    swap(GristAPI, 'refreshColumnTypes', function () { order.push('types'); return refresh.apply(this, arguments); });
    const doc = '<p>Texte</p>'
      + '<img class="editor-image" src="" alt="Logo" data-var-table="PpDepart" data-var-column="Logo" data-var-key="PpDepart.Logo">'
      + '<img class="editor-image" alt="QR" data-qr-text="#PpDepart.Nom">'
      + '<img class="editor-image" alt="Graphique" data-chart-spec="{}">'
      + '<p><span class="smart-chip" data-chip-kind="email">Email</span></p>';
    const html = () => { order.push('html'); return doc; };
    const container = document.getElementById('reader-container');
    container.style.display = 'block';
    const rendering = ReaderMode.render(html, 'PpDepart', { id: 1 }, { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
    await new Promise(r => setTimeout(r, 1200));
    const seen = order.slice();
    gates.splice(0).forEach(open => open());
    await Promise.race([rendering, new Promise(r => setTimeout(r, 5000))]);
    restore.forEach(undo => undo());
    return { seen, pending: gates.length };
  });
  check('lectures : les types de colonnes se lisent avant que le HTML se construise', calls.seen.indexOf('types') !== -1 && calls.seen.indexOf('types') < calls.seen.indexOf('html'), calls.seen);
  const resolvers = ['image', 'qr', 'graphique', 'puce'];
  check('lectures : les images de variable, les codes QR, les graphiques et les puces se résolvent ensemble (aucun n\'attend la fin d\'un autre)', resolvers.every(name => calls.seen.indexOf(name) !== -1), calls.seen);
  await tab.context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 4. L'éditeur masqué ne se repagine pas, et revient paginé
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
{
  const tab = await openDeck();
  const { page } = tab;
  const before = await page.evaluate(() => ({ breaks: HeaderFooterPreview.pageBreaks().length, seams: document.querySelectorAll('#editor-container .v2-pagination-overlay > *').length }));
  check(`pagination : l'éditeur a ses pages avant la Lecture (${SLIDES - 1} coupures)`, before.breaks === SLIDES - 1 && before.seams > 0, before);
  // Ce que la pagination de l'éditeur écrit dans son conteneur (la couche des coutures est vidée, puis refaite, à chaque calcul) : rien ne doit y bouger pendant que la Lecture est à l'écran.
  await page.evaluate(() => {
    window.__editorMutations = 0;
    const observer = new MutationObserver(records => { window.__editorMutations += records.length; });
    observer.observe(document.getElementById('editor-container'), { childList: true, subtree: true });
    window.__editorObserver = observer;
  });
  await enterReading(page);
  await sleep(1200);
  const hidden = await page.evaluate(() => { const n = window.__editorMutations; window.__editorObserver.disconnect(); return { mutations: n, shown: document.getElementById('editor-container').getClientRects().length }; });
  check('pagination : l\'éditeur masqué ne repagine pas pendant la Lecture', hidden.shown === 0 && hidden.mutations === 0, hidden);
  await backToEdit(page);
  await sleep(1000);
  const after = await page.evaluate(() => ({ breaks: HeaderFooterPreview.pageBreaks().length, seams: document.querySelectorAll('#editor-container .v2-pagination-overlay > *').length, shown: document.getElementById('editor-container').getClientRects().length }));
  check('pagination : de retour en Édition, les mêmes pages sont là', after.shown > 0 && after.breaks === before.breaks && after.seams > 0, after);
  // Le document modifié PENDANT la Lecture (un autre modèle chargé, par exemple) : la pagination est refaite au retour.
  await enterReading(page);
  await page.evaluate(() => Editor.setHTML(Array.from({ length: 5 }, (_, i) => '<h2>Autre ' + (i + 1) + '</h2><p>Texte</p>').join('<div class="page-break-marker" contenteditable="false">Saut de page</div>')));
  await sleep(600);
  await backToEdit(page);
  await sleep(1000);
  const other = await page.evaluate(() => HeaderFooterPreview.pageBreaks().length);
  check('pagination : un document changé pendant la Lecture est paginé au retour en Édition (cinq pages, quatre coupures)', other === 4, other);
  await tab.context.close();
}

await t.finish();
