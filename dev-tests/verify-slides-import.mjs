#!/usr/bin/env node
// Le volet « Importer » d'une présentation (extensions/diapositives/slide-import.js ; demande du 21/10, « un bouton pour importer une copie », carte « Volet »), à la vraie souris et au vrai
// clavier, 700x400, français clair puis anglais sombre, hébergé par GFS comme pour de vrai : l'app dans le cadre isolé de GFS (sans `allow-same-origin`), l'extension « diapositives »
// active, « Cible » à l'écran.
//  LE BOUTON ET LE VOLET : « Importer », sous « Ajouter » au bas de la bande, ouvre à droite du document un volet qui ne recouvre ni la page (elle se réduit à la largeur qui reste) ni
//   la pastille du zoom (elle passe à sa gauche) ; le clavier reste dans le document. La liste avec recherche y propose les autres présentations du document, par nom, et rien d'autre ;
//   ouverte, elle passe au-dessus de l'existant (le volet monte au niveau des menus). « sour » puis Entrée choisit « Source ».
//  LES MINIATURES : une par diapositive de « Source », sans l'image répétée sur toutes ses pages ni son commentaire, sa forme « Devant le texte » posée sur la page de sa miniature ; sur
//   une présentation de 70 diapositives, seules celles que le volet montre (et un peu au-delà) sont dessinées, les autres quand la liste défile jusqu'à elles. L'indication dit après
//   quelle diapositive l'import se pose : celle du curseur.
//  IMPORTER À LA SOURIS : un clic sur la miniature 2 la copie après la diapositive du curseur (la 2) : son titre, son gras et sa photo arrivent, sa forme se pose sur sa nouvelle page (la
//   3), la forme de la diapositive d'après la suit en page 4, et l'éditeur ne se pagine qu'une fois ; le coin d'état le dit, le volet reste ouvert et le clavier dans le document. Un
//   second import aussitôt après se pose après le premier ; chaque Ctrl+Z n'en défait qu'un. Un double-clic n'importe qu'une fois.
//  AU CLAVIER : Tab mène à « Importer » ; Entrée ferme le volet ouvert, puis le rouvre avec le clavier sur sa miniature ; ↓ Fin Début s'y déplacent, Entrée et Espace importent, Ctrl+Z
//   et Ctrl+Y défont et refont sans quitter le volet ; Échap le ferme, rend le clavier à « Importer » et sa place à la page.
//  ENREGISTRER : le modèle écrit dans Grist (Ctrl+S) porte les diapositives importées, sans l'image répétée ni le commentaire de « Source ».
//  ROUVRIR : le volet garde « Source » ; « Fermer » (×) le ferme.
//  EXTENSION ÉTEINTE EN DIRECT : « Importer » et les miniatures du volet ouvert sont grisés avec leur raison, et leur clic appelle `installer` de GFS, sans rien changer.
// Lancé par run-headless.mjs (groupe Node "slidesImport", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-import.mjs
import { start, seedModels, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-import', port: Number(process.env.SLIDES_IMPORT_PORT || 8938) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
// La photo de la diapositive 2 de « Source » (dans son texte), sa forme « Devant le texte » (sur sa page, la 2), l'image « Sur toutes les pages » de « Source » (rangée dans sa diapositive
// 2) et la forme « Devant le texte » de la diapositive 3 de « Cible » (sur sa page, la 3).
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAG0lEQVR4nGP4z8DwnxLMMGoAw6gBDKMGMAAAJ/wD/fJ9qnkAAAAASUVORK5CYII=';
const FRONT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGOQizoBRwzEcQD9oxQB2jyOrgAAAABJRU5ErkJggg==';
const REPEAT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAD0lEQVR4nGM4gQQYiOMAAM9hJYGWbiP1AAAAAElFTkSuQmCC';
const OWN = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGMQWWADRwzEcQCDww8BPjSCQgAAAABJRU5ErkJggg==';
const NAMES = { [PHOTO]: 'photo', [FRONT]: 'front', [REPEAT]: 'repeat', [OWN]: 'own' };
const LEFT_PT = 40;
const TOP_PT = 30;
const layered = (src, layer, pageIndex, extra = '') => `<img class="editor-image" src="${src}" alt="" style="width: 60px; height: 40px; position: absolute; left: 120px; top: 0px; z-index: ${layer === 'front' ? 5 : -1}" data-layer="${layer}" data-wrap="inline" data-page-index="${pageIndex}" data-page-left-pt="${LEFT_PT}" data-page-top-pt="${TOP_PT}"${extra}>`;
// 7 « Source » : trois diapositives, la deuxième avec un titre, un commentaire, du gras, une photo, une forme « Devant le texte » et l'image de toutes les pages ; 8 « Cible » : trois
// diapositives, une forme « Devant le texte » sur la troisième ; 9 « Autre présentation » ; 10 « Longue », 70 diapositives. Les modèles de départ (seedModels) : des documents, un e-mail, un
// macro-modèle et une présentation, « Futur ».
const LONG = 70;
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Source', '<h2>Titre un</h2><p>Premier texte</p>${BR}<h2>Deux titre</h2><p><span class="comment-mark" data-comment-id="c1" data-resolved="false">Deux texte</span> <strong>gras</strong></p><p><img class="editor-image" src="${PHOTO}" alt="" style="width: 120px; height: 80px" data-layer="normal" data-wrap="inline">${layered(FRONT, 'front', 1)}${layered(REPEAT, 'behind', 0, ' data-repeat="true"')}</p>${BR}<p>Trois</p>', false, 'presentation');
  add(8, 'Cible', '<p>Cible un</p>${BR}<p>Cible deux</p>${BR}<p>Cible trois</p><p>${layered(OWN, 'front', 2)}</p>', false, 'presentation');
  add(9, 'Autre présentation', '<p>Autre</p>', false, 'presentation');
  add(10, 'Longue', Array.from({ length: ${LONG} }, (_, i) => '<p>Longue ' + (i + 1) + '</p>').join('${BR}'), false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 11;
`;
const TWO = 'Deux titreDeux texte gras';
const TEXTS = {
  fr: {
    button: 'Importer', buttonTip: 'Importer une diapositive d’une autre présentation', title: 'Importer depuis', choose: '— Choisir une présentation —',
    hint: n => `Un clic sur une diapositive l’importe après la diapositive ${n}.`, done: (n, name) => `Diapositive ${n} de « ${name} » importée.`, item: (n, total) => `Diapositive ${n} sur ${total}`,
    sources: ['Autre présentation', 'Futur', 'Longue', 'Source'], sourcesFromSource: ['Autre présentation', 'Cible', 'Futur', 'Longue'],
  },
  en: {
    button: 'Import', buttonTip: 'Import a slide from another presentation', title: 'Import from', choose: '— Choose a presentation —',
    hint: n => `Click a slide to import it after slide ${n}.`, done: (n, name) => `Slide ${n} from “${name}” imported.`, item: (n, total) => `Slide ${n} of ${total}`,
    sources: ['Autre présentation', 'Futur', 'Longue', 'Source'], sourcesFromSource: ['Autre présentation', 'Cible', 'Futur', 'Longue'],
  },
};

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
  const inPage = async (c) => { if (!c) return c; const o = await offset(); return { x: c.x + o.x, y: c.y + o.y }; };
  const centerOf = (selector, index = 0) => app.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
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
  // Une miniature du volet amenée dans la partie visible de sa liste par la molette de la souris, posée sur la liste.
  const showThumb = async (index) => {
    for (let i = 0; i < 12; i++) {
      const at = await app.evaluate((k) => {
        const list = document.querySelector('.pp-slide-import-list');
        const thumb = document.querySelectorAll('.pp-slide-import .pp-slide-thumb')[k];
        if (!list || !thumb) return null;
        const l = list.getBoundingClientRect();
        const r = thumb.getBoundingClientRect();
        return { list: { x: l.left + l.width / 2, y: l.top + l.height / 2 }, dy: r.top < l.top ? r.top - l.top - 8 : r.bottom > l.bottom ? r.bottom - l.bottom + 8 : 0 };
      }, index);
      if (!at || !at.dy) return;
      const c = await inPage(at.list);
      await reach(c);
      await page.mouse.wheel(0, at.dy);
      await sleep(250);
    }
  };
  const clickThumb = async (index, settle = 250) => { await showThumb(index); await click('.pp-slide-import .pp-slide-thumb', index, settle); };
  const doubleClickThumb = async (index) => {
    await showThumb(index);
    const c = await inPage(await centerOf('.pp-slide-import .pp-slide-thumb', index));
    await reach(c);
    await page.mouse.dblclick(c.x, c.y);
    await sleep(400);
  };
  // Le texte `text` d'un bloc de l'éditeur, amené à l'écran : un clic juste avant sa dernière lettre.
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
  return { click, clickThumb, doubleClickThumb, showThumb, clickText, press };
}

// La présentation ouverte : le texte de chaque diapositive, ses blocs et son gras ; ses images (laquelle, son calque, sa page, la diapositive qui la porte et celle sur laquelle l'éditeur
// la dessine) ; ses commentaires ; le curseur ; où est le clavier ; le coin d'état. Puis le volet : ouvert ou non, sa place, celle de la page et de la pastille du zoom, la source
// choisie, l'indication, ses miniatures (dessinées ou non). Lu dans le cadre de l'app.
const state = app => app.evaluate((names) => {
  const editor = EditorCore.getEditor();
  const doc = editor.state.doc;
  const slides = SlideStrip.slidesOf(doc);
  const slideOf = pos => slides.findIndex(s => pos <= s.end);
  const tops = slides.map((s) => { const dom = s.nodes.length ? editor.view.nodeDOM(s.nodes[0].pos) : null; return dom ? dom.getBoundingClientRect().top : Infinity; });
  const images = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'editorImage') return true;
    const dom = editor.view.nodeDOM(pos);
    const img = dom && (dom.tagName === 'IMG' ? dom : dom.querySelector('img'));
    const r = img ? img.getBoundingClientRect() : null;
    let drawnOn = -1;
    if (r) tops.forEach((top, k) => { if (top <= r.top + r.height / 2) drawnOn = k; });
    images.push({ name: names[node.attrs.src] || '?', layer: node.attrs.layer, pageIndex: node.attrs.pageIndex, slide: slideOf(pos), drawnOn });
    return false;
  });
  const comments = [];
  doc.descendants((node, pos) => { if (node.isText && node.marks.some(m => m.type.name === 'commentMark')) comments.push(slideOf(pos)); });
  const bolds = slides.map((s) => {
    let text = '';
    if (s.end > s.start) doc.nodesBetween(s.start, s.end, (node) => { if (node.isText && node.marks.some(m => m.type.name === 'bold')) text += node.text; });
    return text;
  });
  const stripItems = Array.from(document.querySelectorAll('.pp-slide-strip .pp-slide-item'));
  const importItems = Array.from(document.querySelectorAll('.pp-slide-import .pp-slide-item'));
  const active = document.activeElement;
  let focus = null;
  if (active && active.closest('.ProseMirror')) focus = 'editor';
  else if (active && active.closest('.pp-slide-strip .pp-slide-item')) focus = 'item' + (stripItems.indexOf(active.closest('.pp-slide-item')) + 1);
  else if (active && active.closest('.pp-slide-import .pp-slide-item')) focus = 'importItem' + (importItems.indexOf(active.closest('.pp-slide-item')) + 1);
  else if (active && active.classList.contains('pp-slide-import-open')) focus = 'importButton';
  else if (active && active.classList.contains('pp-slide-add')) focus = 'addButton';
  else if (active) focus = active.id || active.className || active.tagName;
  const selection = editor.state.selection;
  const at = slides.findIndex(s => selection.from <= s.end);
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
  const panel = document.querySelector('.pp-slide-import');
  const box = document.getElementById('editor-container');
  const boxRect = box.getBoundingClientRect();
  const trigger = document.querySelector('.pp-slide-import .ss-trigger');
  const hint = document.querySelector('.pp-slide-import-hint');
  return {
    count: stripItems.length,
    texts: slides.map(s => s.nodes.map(e => e.node.textContent).join('')),
    kinds: slides.map(s => s.nodes.map(e => e.node.type.name).join(',')),
    bolds, images, comments, focus,
    cursor: at < 0 ? slides.length - 1 : at,
    atStart: selection.empty && selection.$from.parentOffset === 0,
    status: document.getElementById('status-msg').textContent,
    html: editor.getHTML(),
    open: !!panel && !panel.hidden,
    bodyOn: document.body.classList.contains('pp-slide-import-on'),
    panel: rect(panel && !panel.hidden ? panel : null),
    inner: { left: boxRect.left + box.clientLeft, right: boxRect.left + box.clientLeft + box.clientWidth, top: boxRect.top + box.clientTop, height: box.clientHeight },
    paddingRight: getComputedStyle(box).paddingRight,
    sheet: rect(document.querySelector('#editor-container .tiptap')),
    zoom: rect(document.querySelector('.pp-page-zoom')),
    zIndex: panel ? getComputedStyle(panel).zIndex : null,
    title: panel ? (panel.querySelector('.pp-slide-import-title') || {}).textContent : null,
    field: trigger ? trigger.textContent.trim() : null,
    hint: hint && !hint.hidden ? hint.textContent : '',
    rows: importItems.map(item => ({ label: item.getAttribute('aria-label'), drawn: item.querySelector('.pp-slide-page').childNodes.length > 0, tab: item.tabIndex })),
    listDisabled: (document.querySelector('.pp-slide-import-list') || { getAttribute: () => null }).getAttribute('aria-disabled'),
    button: (() => { const b = document.querySelector('.pp-slide-import-open'); return b ? { text: b.textContent.trim(), title: b.title, label: b.getAttribute('aria-label'), expanded: b.getAttribute('aria-expanded'), disabled: b.getAttribute('aria-disabled'), rect: rect(b), add: rect(document.querySelector('.pp-slide-strip .pp-slide-add')) } : null; })(),
  };
}, NAMES);
const imageOf = (s, name) => s.images.find(image => image.name === name) || null;
// La miniature `index` du volet : son texte, ses images (laquelle, sa place dans la page de la miniature, en px de la page), ses commentaires ; la page des miniatures (marges).
const thumbOf = (app, index) => app.evaluate(([k, names]) => {
  const page = document.querySelectorAll('.pp-slide-import .pp-slide-page')[k];
  const margins = PageLayout.getMarginsPx();
  return {
    text: page.textContent,
    images: Array.from(page.querySelectorAll('img')).map(img => ({ name: names[img.getAttribute('src')] || '?', left: parseFloat(img.style.left), top: parseFloat(img.style.top), flat: img.offsetParent === page })),
    comments: page.querySelectorAll('.comment-mark').length,
    margins: { left: margins.left, top: margins.top },
  };
}, [index, NAMES]);
// Compte les paginations de l'éditeur à partir de maintenant ; `paginations(app)` rend leur nombre et arrête de compter.
const countPaginations = app => app.evaluate(() => { window.__paginations = 0; window.__stopCounting = HeaderFooterPreview.onPaginated(() => { window.__paginations += 1; }); });
const paginations = app => app.evaluate(() => { window.__stopCounting(); return window.__paginations; });
// Ce que le coin d'état a dit depuis `watchStatus` : l'enregistrement automatique peut le remplacer peu après par « Enregistré à … ».
const watchStatus = app => app.evaluate(() => {
  const el = document.getElementById('status-msg');
  window.__statusSeen = [];
  if (window.__statusWatch) window.__statusWatch.disconnect();
  window.__statusWatch = new MutationObserver(() => window.__statusSeen.push(el.textContent));
  window.__statusWatch.observe(el, { childList: true, characterData: true, subtree: true });
});
const statusSeen = app => app.evaluate(() => window.__statusSeen.slice());
// GFS vit dans la page parente ; les fenêtres de l'app, dans son cadre.
const gfsCalls = (page, nom) => page.evaluate(n => window.__gfsStub.calls.filter(c => c.nom === n).map(c => c.args), nom);
const appDialogOpen = app => app.evaluate(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && m.style.display !== 'none' && m.getBoundingClientRect().height > 0; });
// Le modèle tel qu'Enregistrer l'a écrit dans Grist (le faux Grist du cadre de l'app), et le nombre de ses enregistrements.
const stored = (app, id) => app.evaluate(n => ({ html: (window.__gristStub.getRow('Publipostage_Modeles', n) || {}).Contenu || '', saves: window.__gristStub.countSaves('Publipostage_Modeles') }), id);
// Les lignes de la liste avec recherche ouverte.
const ssOptions = app => app.evaluate(() => { const panel = Array.from(document.querySelectorAll('.ss-panel')).find(p => !p.hidden); return panel ? Array.from(panel.querySelectorAll('.ss-list [role="option"]')).map(o => o.textContent.trim()) : null; });
// L'appel `ouvrir` de GFS, puis la bande de la présentation et ses `slides` miniatures.
const open = async (tab, id, slides) => {
  await Promise.race([
    tab.page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
    sleep(20000),
  ]);
  await tab.app.waitForFunction(([n, count]) => {
    const strip = document.querySelector('.pp-slide-strip');
    return String(Templates.getCurrentId()) === String(n) && !!strip && !strip.hidden && document.querySelectorAll('.pp-slide-strip .pp-slide-item').length === count;
  }, [id, slides], { timeout: 15000 }).catch(() => {});
  await sleep(800);
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  // La langue est celle de GFS (consigne 019), que son contexte donne au cadre.
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme });
  const { page, app } = A;
  const a = toolsOf(A);
  await open(A, 8, 3);
  await a.clickText('Cible deux');
  let s = await state(app);
  check(tag + '« ' + T.button + ' » est à droite d’« Ajouter », sur la même ligne au bas de la bande : une icône sans texte, son info-bulle et son nom accessible disent « ' + T.buttonTip + ' » ; son icône se lit (contraste ≥ 4,5:1)',
    !!s.button && s.button.text === '' && s.button.title === T.buttonTip && s.button.label === T.buttonTip && s.button.expanded === 'false' && Math.abs(s.button.rect.top - s.button.add.top) < 0.6
      && s.button.rect.left >= s.button.add.right && s.button.rect.left - s.button.add.right < 10 && (await contrastOf(app, '.pp-slide-import-open')) >= 4.5, s.button);

  // --- Le volet s'ouvre à droite ; la page et la pastille du zoom lui laissent sa place.
  await a.click('.pp-slide-import-open', 0, 800);
  s = await state(app);
  check(tag + 'un clic sur « ' + T.button + ' » ouvre le volet à droite du document, sur sa hauteur visible ; le clavier reste dans le document',
    s.open && s.bodyOn && s.button.expanded === 'true' && Math.abs(s.panel.right - s.inner.right) < 1 && Math.abs(s.panel.top - s.inner.top) < 1 && Math.abs(s.panel.height - s.inner.height) < 1
      && s.focus === 'editor', { panel: s.panel, inner: s.inner, focus: s.focus });
  check(tag + 'la page se réduit à la largeur qui reste (rembourrage 214 px) sans passer sous le volet, et la pastille du zoom passe à sa gauche',
    s.paddingRight === '214px' && s.sheet.right <= s.panel.left - 10 && !!s.zoom && s.zoom.right <= s.panel.left, { paddingRight: s.paddingRight, sheet: s.sheet, zoom: s.zoom, panel: s.panel });
  check(tag + 'sans source choisie : « ' + T.title + ' », le champ dit « ' + T.choose + ' », ni indication ni miniature',
    s.title === T.title && s.field === T.choose && s.hint === '' && s.rows.length === 0, { title: s.title, field: s.field, hint: s.hint, rows: s.rows.length });
  await a.click('.pp-slide-import .ss-trigger', 0, 400);
  const options = await ssOptions(app);
  s = await state(app);
  check(tag + 'la liste avec recherche propose les autres présentations du document, par nom, et rien d’autre (ni « Cible », à l’écran, ni un document, un e-mail ou un macro-modèle) ; ouverte, le volet monte au niveau des menus',
    JSON.stringify(options) === JSON.stringify(T.sources) && Number(s.zIndex) >= 1600, { options, zIndex: s.zIndex });
  await page.keyboard.type('sour');
  await sleep(250);
  await a.press('Enter');
  await sleep(500);
  s = await state(app);
  check(tag + '« sour » puis Entrée choisit « Source » : une miniature par diapositive, nommée ; l’indication dit l’import après la diapositive du curseur (la 2) ; la liste refermée, le volet redescend',
    s.field === 'Source' && JSON.stringify(s.rows.map(r => r.label)) === JSON.stringify([T.item(1, 3), T.item(2, 3), T.item(3, 3)]) && s.hint === T.hint(2) && Number(s.zIndex) === 20,
    { field: s.field, rows: s.rows, hint: s.hint, zIndex: s.zIndex });
  const thumb = await thumbOf(app, 1);
  const front = thumb.images.find(image => image.name === 'front');
  check(tag + 'la miniature 2 montre la diapositive sans l’image répétée sur toutes les pages de « Source » ni son commentaire ; sa forme est posée sur la page de la miniature, à sa place',
    thumb.text === TWO && JSON.stringify(thumb.images.map(image => image.name).sort()) === JSON.stringify(['front', 'photo']) && thumb.comments === 0 && !!front && front.flat
      && Math.abs(front.left - (thumb.margins.left + LEFT_PT * 96 / 72)) < 0.5 && Math.abs(front.top - (thumb.margins.top + TOP_PT * 96 / 72)) < 0.5, thumb);
  await a.clickText('Cible un');
  s = await state(app);
  check(tag + 'le curseur passe à la diapositive 1 : l’indication le suit', s.hint === T.hint(1), s.hint);
  await a.clickText('Cible deux');

  // --- Importer à la souris : la miniature 2, après la diapositive 2.
  const targetHtml = (await state(app)).html;
  await countPaginations(app);
  await watchStatus(app);
  await a.clickThumb(1, 1800);
  const count = await paginations(app);
  s = await state(app);
  const saidOne = await statusSeen(app);
  const photo = imageOf(s, 'photo');
  check(tag + 'un clic sur la miniature 2 la copie après la diapositive 2 : son titre, son gras et sa photo arrivent en troisième ; le curseur y va, le clavier reste dans le document',
    s.count === 4 && JSON.stringify(s.texts) === JSON.stringify(['Cible un', 'Cible deux', TWO, 'Cible trois']) && s.kinds[2] === 'heading,paragraph,paragraph' && s.bolds[2] === 'gras'
      && !!photo && photo.slide === 2 && photo.layer === 'normal' && s.cursor === 2 && s.atStart && s.focus === 'editor', { texts: s.texts, kinds: s.kinds, bolds: s.bolds, photo, cursor: s.cursor, focus: s.focus });
  const pastedFront = imageOf(s, 'front');
  const own = imageOf(s, 'own');
  check(tag + 'sa forme se pose sur sa nouvelle page (la 3), la forme de la diapositive d’après la suit en page 4 ; une seule pagination ; ni l’image répétée ni le commentaire de « Source »',
    !!pastedFront && pastedFront.slide === 2 && pastedFront.pageIndex === 2 && pastedFront.drawnOn === 2 && !!own && own.pageIndex === 3 && own.drawnOn === 3 && count === 1
      && !imageOf(s, 'repeat') && s.comments.length === 0, { front: pastedFront, own, count, images: s.images, comments: s.comments });
  check(tag + 'le coin d’état dit « ' + T.done(2, 'Source') + ' » ; le volet reste ouvert, l’indication dit maintenant la diapositive 3',
    saidOne.includes(T.done(2, 'Source')) && s.open && s.hint === T.hint(3), { said: saidOne, open: s.open, hint: s.hint });
  const afterOne = s.html;
  await watchStatus(app);
  await a.clickThumb(2, 1200);
  s = await state(app);
  const saidTwo = await statusSeen(app);
  check(tag + 'un second import, aussitôt après (la miniature 3), se pose après le premier, en quatrième',
    JSON.stringify(s.texts) === JSON.stringify(['Cible un', 'Cible deux', TWO, 'Trois', 'Cible trois']) && saidTwo.includes(T.done(3, 'Source')), { texts: s.texts, said: saidTwo });
  await a.press('Control+z');
  await sleep(400);
  s = await state(app);
  check(tag + 'un Ctrl+Z ne défait que le second import', s.html === afterOne, { texts: s.texts });
  await a.press('Control+z');
  await sleep(400);
  s = await state(app);
  check(tag + 'un second Ctrl+Z défait le premier : « Cible » à l’identique', s.html === targetHtml && imageOf(s, 'own').pageIndex === 2, { texts: s.texts, own: imageOf(s, 'own') });
  await a.doubleClickThumb(0);
  await sleep(800);
  s = await state(app);
  check(tag + 'un double-clic sur la miniature 1 ne l’importe qu’une fois', JSON.stringify(s.texts) === JSON.stringify(['Cible un', 'Cible deux', 'Titre unPremier texte', 'Cible trois']), s.texts);
  await a.press('Control+z');
  await sleep(400);

  // --- Au clavier : Tab mène à « Importer » ; Entrée le ferme, puis le rouvre, le clavier dans le volet.
  await a.press('Escape');
  for (let i = 0; i < 14 && (await state(app)).focus !== 'importButton'; i++) await a.press('Tab');
  await a.press('Enter');
  s = await state(app);
  check(tag + 'au clavier, Tab mène à « ' + T.button + ' » ; Entrée ferme le volet ouvert, et la page reprend sa place', !s.open && !s.bodyOn && s.paddingRight === '14px' && s.focus === 'importButton', { open: s.open, paddingRight: s.paddingRight, focus: s.focus });
  await a.press('Enter');
  await sleep(400);
  s = await state(app);
  check(tag + 'Entrée le rouvre, avec « Source » et ses miniatures, le clavier sur la première', s.open && s.field === 'Source' && s.rows.length === 3 && s.focus === 'importItem1', { open: s.open, field: s.field, focus: s.focus });
  await a.press('ArrowDown');
  const down = (await state(app)).focus;
  await a.press('End');
  const end = (await state(app)).focus;
  await a.press('Home');
  s = await state(app);
  check(tag + '↓, Fin et Début vont d’une miniature à l’autre (un seul arrêt de Tab)', down === 'importItem2' && end === 'importItem3' && s.focus === 'importItem1' && s.rows.filter(r => r.tab === 0).length === 1, { down, end, focus: s.focus });
  await a.press('ArrowDown');
  await a.press('Enter');
  await sleep(900);
  s = await state(app);
  check(tag + 'Entrée importe la miniature 2 après la diapositive du curseur (la 2), le clavier reste sur elle',
    JSON.stringify(s.texts) === JSON.stringify(['Cible un', 'Cible deux', TWO, 'Cible trois']) && s.focus === 'importItem2', { texts: s.texts, focus: s.focus });
  await a.press('End');
  await a.press('Space');
  await sleep(900);
  s = await state(app);
  check(tag + 'Espace importe la miniature 3 après elle', JSON.stringify(s.texts) === JSON.stringify(['Cible un', 'Cible deux', TWO, 'Trois', 'Cible trois']) && s.focus === 'importItem3', { texts: s.texts, focus: s.focus });
  const twoImports = s.html;
  await a.press('Control+z');
  await sleep(400);
  s = await state(app);
  check(tag + 'Ctrl+Z dans le volet défait le dernier import, sans quitter le volet', JSON.stringify(s.texts) === JSON.stringify(['Cible un', 'Cible deux', TWO, 'Cible trois']) && s.focus === 'importItem3', { texts: s.texts, focus: s.focus });
  await a.press('Control+y');
  await sleep(400);
  s = await state(app);
  check(tag + 'Ctrl+Y le refait', s.html === twoImports && s.focus === 'importItem3', { texts: s.texts, focus: s.focus });

  // --- Enregistrer : le modèle écrit dans Grist porte les diapositives importées, sans ce qui appartient à « Source ».
  const savesBefore = (await stored(app, 8)).saves;
  await a.press('Control+s');
  await app.waitForFunction(n => window.__gristStub.countSaves('Publipostage_Modeles') > n, savesBefore, { timeout: 10000 }).catch(() => {});
  const saved = await stored(app, 8);
  check(tag + 'Ctrl+S écrit dans Grist les diapositives importées, sans l’image répétée ni le commentaire de « Source »',
    saved.saves > savesBefore && saved.html.includes('Deux titre') && saved.html.includes('<p>Trois</p>') && !saved.html.includes(REPEAT) && !saved.html.includes('data-comment-id'),
    { saves: [savesBefore, saved.saves], slide: saved.html.includes('Deux titre'), repeat: saved.html.includes(REPEAT), comment: saved.html.includes('data-comment-id') });

  // --- Échap ferme le volet et rend le clavier à « Importer » ; rouvert, il garde « Source » ; « Fermer » le ferme.
  await a.press('Escape');
  s = await state(app);
  check(tag + 'Échap ferme le volet : le clavier revient à « ' + T.button + ' », la page reprend sa place', !s.open && !s.bodyOn && s.focus === 'importButton' && s.paddingRight === '14px' && s.button.expanded === 'false',
    { open: s.open, focus: s.focus, paddingRight: s.paddingRight });
  await a.click('.pp-slide-import-open', 0, 800);
  s = await state(app);
  check(tag + 'rouvert, le volet garde « Source »', s.open && s.field === 'Source' && s.rows.length === 3, { open: s.open, field: s.field, rows: s.rows.length });
  await a.click('.pp-slide-import-close', 0, 400);
  s = await state(app);
  check(tag + '« Fermer » (×) le ferme', !s.open && !s.bodyOn && s.button.expanded === 'false', { open: s.open });

  // --- Une présentation de 70 diapositives : seules les miniatures que le volet montre sont dessinées.
  await a.click('.pp-slide-import-open', 0, 800);
  await a.click('.pp-slide-import .ss-trigger', 0, 400);
  await page.keyboard.type('longue');
  await sleep(250);
  await a.press('Enter');
  await sleep(600);
  s = await state(app);
  const drawnFirst = s.rows.filter(r => r.drawn).length;
  check(tag + '« Longue » (70 diapositives) : 70 miniatures, dont seules celles que le volet montre, et un peu au-delà, sont dessinées',
    s.rows.length === LONG && drawnFirst >= 1 && drawnFirst <= 8 && s.rows[0].drawn && !s.rows[LONG - 1].drawn, { rows: s.rows.length, drawn: drawnFirst });
  await a.showThumb(LONG - 1);
  await sleep(400);
  s = await state(app);
  const drawnEnd = s.rows.filter(r => r.drawn).length;
  check(tag + 'la liste défilée jusqu’au bout (molette) : la dernière se dessine, pas celles du milieu qu’elle a passées vite', s.rows[LONG - 1].drawn && drawnEnd < LONG, { drawn: drawnEnd });

  // --- Une autre présentation à l'écran : le volet relit ses sources ; celle à l'écran n'y est plus.
  await a.click('.pp-slide-import .ss-trigger', 0, 400);
  await page.keyboard.type('sour');
  await sleep(250);
  await a.press('Enter');
  await sleep(400);
  await open(A, 7, 3);
  s = await state(app);
  let sourceOptions = null;
  if (s.open) {
    await a.click('.pp-slide-import .ss-trigger', 0, 400);
    sourceOptions = await ssOptions(app);
    await a.press('Escape');
  }
  check(tag + '« Source » à l’écran, le volet ouvert : il propose les autres présentations (« Cible » comprise, plus « Source ») et revient à « ' + T.choose + ' »',
    s.open && s.field === T.choose && s.rows.length === 0 && JSON.stringify(sourceOptions) === JSON.stringify(T.sourcesFromSource), { open: s.open, field: s.field, rows: s.rows.length, sourceOptions });
  await open(A, 8, 3);

  // --- GFS éteint l'extension : « Importer » et les miniatures du volet ouvert sont grisés, et leur clic appelle `installer`.
  s = await state(app);
  if (!s.open) await a.click('.pp-slide-import-open', 0, 800);
  await a.click('.pp-slide-import .ss-trigger', 0, 400);
  await page.keyboard.type('sour');
  await sleep(250);
  await a.press('Enter');
  await sleep(400);
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await app.waitForFunction(() => { const b = document.querySelector('.pp-slide-import-open'); return !!b && b.getAttribute('aria-disabled') === 'true'; }, null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  const offHtml = (await state(app)).html;
  s = await state(app);
  const reason = s.button.title;
  check(tag + 'extension éteinte : « ' + T.button + ' » est grisé avec sa raison ; le volet ouvert garde ses miniatures, grisées, et l’indication dit la raison',
    s.button.disabled === 'true' && !!reason && reason !== T.buttonTip && s.open && s.listDisabled === 'true' && s.hint === reason && s.rows.length === 3, { button: s.button, hint: s.hint, list: s.listDisabled });
  await a.clickThumb(1, 600);
  let installs = await gfsCalls(page, 'installer');
  s = await state(app);
  check(tag + 'un clic sur une miniature grisée demande à GFS d’installer « diapositives », sans fenêtre de l’app, et rien ne change',
    JSON.stringify(installs) === JSON.stringify([{ extension: 'diapositives' }]) && !(await appDialogOpen(app)) && s.html === offHtml, { installs, same: s.html === offHtml });
  await a.click('.pp-slide-import-open', 0, 600);
  installs = await gfsCalls(page, 'installer');
  s = await state(app);
  check(tag + 'le clic sur « ' + T.button + ' » grisé aussi (un deuxième appel), et le volet reste tel quel', installs.length === 2 && s.open && s.html === offHtml, { installs, open: s.open });
  await page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);
  await app.waitForFunction(() => { const b = document.querySelector('.pp-slide-import-open'); return !!b && b.getAttribute('aria-disabled') === 'false'; }, null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  s = await state(app);
  check(tag + 'extension rallumée : le volet se dégrise, l’indication revient', s.listDisabled === 'false' && /\d\.$/.test(s.hint) && s.hint !== reason, { list: s.listDisabled, hint: s.hint });

  check(tag + 'aucune boîte native du navigateur', A.natives.length === 0, A.natives);
  await A.context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
