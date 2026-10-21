#!/usr/bin/env node
// Copier et coller une diapositive (extensions/diapositives/slide-strip.js : onCopy, slideForClipboard, onPaste, pasteAfter, placePastedLayers ; demande du 21/10 : « avec contrôle C et
// contrôle V entre deux onglets du navigateur »), au vrai clavier et à la vraie souris, 700x400, français clair puis anglais sombre, hébergé par GFS comme pour de vrai : l'app dans le
// cadre isolé de GFS (sans `allow-same-origin`, origine « nulle », stockage refusé) que porte une page parente qui joue GFS (dev-tests/gfs-stub.js), l'extension « diapositives » active,
// dans deux onglets du même navigateur (le presse-papiers du système passe de l'un à l'autre) : « Source » dans l'un, « Cible » dans l'autre.
//  DEPUIS LA BANDE : Ctrl+C sur la miniature 2 de « Source » copie sa diapositive, sans rien changer, et le coin d'état le dit ; Ctrl+V sur la miniature 2 de « Cible », dans l'autre
//   onglet, la colle en troisième : son titre, son texte en gras et sa photo arrivent, le clavier reste sur sa miniature, et l'éditeur ne se pagine qu'une fois. Sa forme « Devant le
//   texte » se pose sur sa page (la 3, pas la 2 qu'elle avait dans « Source »), et la forme de la diapositive d'après la suit en page 4. Ce qui appartient à « Source » y reste : l'image
//   répétée sur toutes ses pages et le commentaire. L'enveloppe qui dit « diapositive » au presse-papiers (data-pp-slide) n'entre ni dans le texte ni dans le modèle qu'Enregistrer écrit
//   dans Grist. Un seul Ctrl+Z, sans quitter la bande, rend « Cible » à l'identique.
//  DEPUIS LE TEXTE : sans rien de sélectionné, Ctrl+C dans le texte de la diapositive 3 la copie (le coin d'état le dit) ; Ctrl+V dans le texte de la diapositive 1 de « Cible » la colle
//   après elle, en deuxième, le curseur au début de son texte. Un mot sélectionné garde le copier de toujours : il se colle au curseur, sans diapositive de plus.
//  EXTENSION ÉTEINTE EN DIRECT : Ctrl+V et Ctrl+C sur une miniature appellent `installer` de GFS, sans fenêtre de l'app, et rien ne change ; dans le texte, Ctrl+V colle la diapositive
//   copiée au curseur, comme un texte, sans diapositive de plus ni enveloppe.
// Lancé par run-headless.mjs (groupe Node "slidesClipboard", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-clipboard.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-clipboard', port: Number(process.env.SLIDES_CLIPBOARD_PORT || 8933) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
// La photo de la diapositive 2 de « Source » (dans son texte), sa forme « Devant le texte » (posée sur sa page, la 2), l'image « Sur toutes les pages » de « Source » (rangée dans sa
// diapositive 2) et la forme « Devant le texte » de la diapositive 3 de « Cible » (posée sur sa page, la 3).
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAG0lEQVR4nGP4z8DwnxLMMGoAw6gBDKMGMAAAJ/wD/fJ9qnkAAAAASUVORK5CYII=';
const FRONT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGOQizoBRwzEcQD9oxQB2jyOrgAAAABJRU5ErkJggg==';
const REPEAT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAD0lEQVR4nGM4gQQYiOMAAM9hJYGWbiP1AAAAAElFTkSuQmCC';
const OWN = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGMQWWADRwzEcQCDww8BPjSCQgAAAABJRU5ErkJggg==';
const NAMES = { [PHOTO]: 'photo', [FRONT]: 'front', [REPEAT]: 'repeat', [OWN]: 'own' };
const layered = (src, layer, pageIndex, extra = '') => `<img class="editor-image" src="${src}" alt="" style="width: 60px; height: 40px; position: absolute; left: 120px; top: 0px; z-index: ${layer === 'front' ? 5 : -1}" data-layer="${layer}" data-wrap="inline" data-page-index="${pageIndex}" data-page-left-pt="40" data-page-top-pt="30"${extra}>`;
// 7 « Source » : trois diapositives, la deuxième avec un titre, un commentaire, du gras, une photo, une forme « Devant le texte » et l'image de toutes les pages ; 8 « Cible » : trois
// diapositives, une forme « Devant le texte » sur la troisième.
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(7, 'Source', '<h2>Titre un</h2><p>Premier texte</p>${BR}<h2>Deux titre</h2><p><span class="comment-mark" data-comment-id="c1" data-resolved="false">Deux texte</span> <strong>gras</strong></p><p><img class="editor-image" src="${PHOTO}" alt="" style="width: 120px; height: 80px" data-layer="normal" data-wrap="inline">${layered(FRONT, 'front', 1)}${layered(REPEAT, 'behind', 0, ' data-repeat="true"')}</p>${BR}<p>Trois</p>', false, 'presentation');
  add(8, 'Cible', '<p>Cible un</p>${BR}<p>Cible deux</p>${BR}<p>Cible trois</p><p>${layered(OWN, 'front', 2)}</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 9;
`;
const TWO = 'Deux titreDeux texte gras';
const TEXTS = {
  fr: { copied: n => `Diapositive ${n} copiée.` },
  en: { copied: n => `Slide ${n} copied.` },
};

// Les gestes à la vraie souris et au vrai clavier dans un onglet `tab` (openPage) : les éléments se lisent dans le cadre de l'app (`app`), la souris et le clavier sont ceux de l'onglet
// (`page`), décalés de la place du cadre dans la page parente.
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
  const rectOf = async (selector, index = 0) => inPage(await app.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [selector, index]));
  // La souris arrive près de la cible, puis glisse dessus : un long trajet passerait sur les menus au survol de la barre d'outils, dont les volets descendent sur la bande.
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const click = async (selector, index = 0) => {
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(250);
  };
  // Le texte `text` d'un bloc de l'éditeur, amené à l'écran : un clic juste avant sa dernière lettre (le curseur au bout du mot), ou un double clic sur son mot `word`.
  const textRect = async (text, word) => inPage(await app.evaluate(([whole, part]) => {
    const block = Array.from(document.querySelectorAll('#editor-container .tiptap > *')).find(el => el.textContent === whole);
    if (!block) return null;
    block.scrollIntoView({ block: 'center' });
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    const range = document.createRange();
    const from = part ? node.textContent.indexOf(part) : 0;
    range.setStart(node, from);
    range.setEnd(node, part ? from + part.length : node.textContent.length);
    const r = range.getBoundingClientRect();
    return { x: part ? r.left + r.width / 2 : r.right - 1, y: r.top + r.height / 2 };
  }, [text, word || null]));
  const clickText = async (text) => {
    const c = await textRect(text);
    if (!c) throw new Error('texte introuvable : ' + text);
    await sleep(200);
    await reach(c);
    await page.mouse.click(c.x, c.y);
    await sleep(250);
  };
  const doubleClickWord = async (text, word) => {
    const c = await textRect(text, word);
    if (!c) throw new Error('texte introuvable : ' + text);
    await sleep(200);
    await reach(c);
    await page.mouse.dblclick(c.x, c.y);
    await sleep(250);
  };
  const press = async (key) => { await page.keyboard.press(key); await sleep(220); };
  // Le clic sur une miniature rend le clavier au document ; Échap puis Tab le ramènent dans la bande, sur la miniature cochée.
  const intoStrip = async () => {
    await press('Escape');
    for (let i = 0; i < 10 && !/^item/.test((await state(app)).focus || ''); i++) await press('Tab');
  };
  return { click, clickText, doubleClickWord, press, intoStrip };
}

// La présentation ouverte : le texte de chaque diapositive, ses blocs et son gras ; ses images (laquelle, son calque, sa page, la diapositive qui la porte et celle sur laquelle l'éditeur
// la dessine : la dernière dont le texte commence au-dessus de son milieu) ; ses commentaires (la diapositive de chacun) ; le curseur (sa diapositive, au début de son bloc ou non) ; où est
// le clavier ; le coin d'état. Lu dans le cadre de l'app (`app`).
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
  const items = Array.from(document.querySelectorAll('.pp-slide-item'));
  const active = document.activeElement;
  let focus = null;
  if (active && active.closest('.ProseMirror')) focus = 'editor';
  else if (active && active.closest('.pp-slide-item')) focus = 'item' + (items.indexOf(active.closest('.pp-slide-item')) + 1);
  else if (active) focus = active.id || active.tagName;
  const selection = editor.state.selection;
  const at = slides.findIndex(s => selection.from <= s.end);
  return {
    count: items.length,
    texts: slides.map(s => s.nodes.map(e => e.node.textContent).join('')),
    kinds: slides.map(s => s.nodes.map(e => e.node.type.name).join(',')),
    bolds, images, comments, focus,
    cursor: at < 0 ? slides.length - 1 : at,
    atStart: selection.empty && selection.$from.parentOffset === 0,
    status: document.getElementById('status-msg').textContent,
    html: editor.getHTML(),
  };
}, NAMES);
const imageOf = (s, name) => s.images.find(image => image.name === name) || null;
// Compte les paginations de l'éditeur à partir de maintenant ; `paginations(page)` rend leur nombre et arrête de compter.
const countPaginations = app => app.evaluate(() => { window.__paginations = 0; window.__stopCounting = HeaderFooterPreview.onPaginated(() => { window.__paginations += 1; }); });
const paginations = app => app.evaluate(() => { window.__stopCounting(); return window.__paginations; });
// GFS vit dans la page parente (`page`) ; les fenêtres de l'app, dans son cadre.
const gfsCalls = (page, nom) => page.evaluate(n => window.__gfsStub.calls.filter(c => c.nom === n).map(c => c.args), nom);
const appDialogOpen = app => app.evaluate(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && m.style.display !== 'none' && m.getBoundingClientRect().height > 0; });
// Le modèle tel qu'Enregistrer l'a écrit dans Grist (le faux Grist du cadre de l'app), et le nombre de ses enregistrements.
const stored = (app, id) => app.evaluate(n => ({ html: (window.__gristStub.getRow('Publipostage_Modeles', n) || {}).Contenu || '', saves: window.__gristStub.countSaves('Publipostage_Modeles') }), id);
// L'enveloppe d'une diapositive copiée (slideForClipboard).
const ENVELOPE = 'data-pp-slide';
// L'appel `ouvrir` de GFS, puis la bande de la présentation et ses `slides` miniatures.
const open = async (tab, id, slides) => {
  await Promise.race([
    tab.page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
    sleep(20000),
  ]);
  await tab.app.waitForFunction(([n, count]) => {
    const strip = document.querySelector('.pp-slide-strip');
    return String(Templates.getCurrentId()) === String(n) && !!strip && !strip.hidden && document.querySelectorAll('.pp-slide-item').length === count;
  }, [id, slides], { timeout: 15000 }).catch(() => {});
  await sleep(800);
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  // La langue est celle de GFS (consigne 019), que son contexte donne au cadre.
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme });
  const B = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme });
  const a = toolsOf(A);
  const b = toolsOf(B);
  const isolated = await A.app.evaluate(() => { let storage = 'ok'; try { window.localStorage.getItem('x'); } catch (e) { storage = e.name; } return { origin: window.origin, storage }; });
  check(tag + 'l’app tourne dans le cadre isolé de GFS : son origine est « null » et le stockage du navigateur lui est refusé', isolated.origin === 'null' && isolated.storage === 'SecurityError', isolated);
  await open(A, 7, 3);
  await open(B, 8, 3);
  let sa = await state(A.app);
  let sb = await state(B.app);
  check(tag + 'deux onglets : « Source » (sa diapositive 2 porte une photo, une forme « Devant le texte » en page 2, l’image de toutes ses pages et un commentaire) et « Cible » (une forme en page 3)',
    sa.count === 3 && sa.texts[1] === TWO && imageOf(sa, 'photo').slide === 1 && imageOf(sa, 'front').pageIndex === 1 && imageOf(sa, 'front').drawnOn === 1 && imageOf(sa, 'repeat').slide === 1
      && sa.comments.length > 0 && sb.count === 3 && imageOf(sb, 'own').pageIndex === 2 && imageOf(sb, 'own').drawnOn === 2, { sa: { texts: sa.texts, images: sa.images, comments: sa.comments }, sb: { texts: sb.texts, images: sb.images } });

  // --- Depuis la bande : Ctrl+C sur la miniature 2 de « Source », Ctrl+V sur la miniature 2 de « Cible », dans l'autre onglet.
  await A.page.bringToFront();
  await a.click('.pp-slide-thumb', 1);
  await a.intoStrip();
  const sourceHtml = (await state(A.app)).html;
  await a.press('Control+c');
  sa = await state(A.app);
  check(tag + 'Ctrl+C sur la miniature 2 de « Source » : le coin d’état dit « ' + T.copied(2) + ' », le clavier reste sur elle, et rien ne change',
    sa.status === T.copied(2) && sa.focus === 'item2' && sa.html === sourceHtml, { status: sa.status, focus: sa.focus, same: sa.html === sourceHtml });
  await B.page.bringToFront();
  await b.click('.pp-slide-thumb', 1);
  await b.intoStrip();
  const targetHtml = (await state(B.app)).html;
  await countPaginations(B.app);
  await B.page.keyboard.press('Control+v');
  await sleep(900);
  const count = await paginations(B.app);
  sb = await state(B.app);
  const photo = imageOf(sb, 'photo');
  check(tag + 'Ctrl+V sur la miniature 2 de « Cible », dans l’autre onglet : la diapositive arrive en troisième, avec son titre, son texte en gras et sa photo ; le clavier reste sur sa miniature',
    sb.count === 4 && JSON.stringify(sb.texts) === JSON.stringify(['Cible un', 'Cible deux', TWO, 'Cible trois']) && sb.kinds[2] === 'heading,paragraph,paragraph' && sb.bolds[2] === 'gras'
      && !!photo && photo.slide === 2 && photo.layer === 'normal' && sb.focus === 'item3' && sb.cursor === 2, { texts: sb.texts, kinds: sb.kinds, bolds: sb.bolds, photo, focus: sb.focus, cursor: sb.cursor });
  const front = imageOf(sb, 'front');
  const own = imageOf(sb, 'own');
  check(tag + 'sa forme « Devant le texte » se pose sur sa page, la 3 (elle était en page 2 dans « Source »), dessinée sur elle ; la forme de la diapositive d’après la suit en page 4 ; une seule pagination',
    !!front && front.slide === 2 && front.pageIndex === 2 && front.drawnOn === 2 && !!own && own.slide === 3 && own.pageIndex === 3 && own.drawnOn === 3 && count === 1, { front, own, count });
  check(tag + 'ce qui appartient à « Source » y reste : ni l’image de toutes ses pages ni son commentaire ne viennent',
    !imageOf(sb, 'repeat') && sb.comments.length === 0 && sb.images.length === 3, { images: sb.images, comments: sb.comments });
  const savesBefore = (await stored(B.app, 8)).saves;
  await b.press('Control+s');
  await B.app.waitForFunction(n => window.__gristStub.countSaves('Publipostage_Modeles') > n, savesBefore, { timeout: 10000 }).catch(() => {});
  const saved = await stored(B.app, 8);
  check(tag + 'l’enveloppe du presse-papiers (' + ENVELOPE + ') n’entre ni dans le texte ni dans le modèle qu’Enregistrer (Ctrl+S) écrit dans Grist, qui porte la diapositive collée',
    !sb.html.includes(ENVELOPE) && saved.saves > savesBefore && saved.html.includes('Deux titre') && !saved.html.includes(ENVELOPE), { inText: sb.html.includes(ENVELOPE), saves: [savesBefore, saved.saves], savedHasSlide: saved.html.includes('Deux titre'), savedHasEnvelope: saved.html.includes(ENVELOPE) });
  await b.press('Control+z');
  await sleep(500);
  sb = await state(B.app);
  check(tag + 'un seul Ctrl+Z, sans quitter la bande, rend « Cible » à l’identique (sa forme revient en page 3)',
    sb.html === targetHtml && sb.count === 3 && imageOf(sb, 'own').pageIndex === 2 && /^item/.test(sb.focus || ''), { same: sb.html === targetHtml, count: sb.count, own: imageOf(sb, 'own'), focus: sb.focus });

  // --- Depuis le texte : la diapositive du curseur, sans rien de sélectionné.
  await A.page.bringToFront();
  await a.clickText('Trois');
  await a.press('Control+c');
  sa = await state(A.app);
  check(tag + 'sans rien de sélectionné, Ctrl+C dans le texte de la diapositive 3 la copie : « ' + T.copied(3) + ' », et rien ne change',
    sa.status === T.copied(3) && sa.focus === 'editor' && sa.html === sourceHtml, { status: sa.status, focus: sa.focus, same: sa.html === sourceHtml });
  await B.page.bringToFront();
  await b.clickText('Cible un');
  await b.press('Control+v');
  await sleep(700);
  sb = await state(B.app);
  check(tag + 'Ctrl+V dans le texte de la diapositive 1 de « Cible » : la diapositive copiée arrive après elle, en deuxième, le curseur au début de son texte ; la forme de « Cible » suit en page 4',
    sb.count === 4 && JSON.stringify(sb.texts) === JSON.stringify(['Cible un', 'Trois', 'Cible deux', 'Cible trois']) && sb.focus === 'editor' && sb.cursor === 1 && sb.atStart
      && imageOf(sb, 'own').pageIndex === 3 && !sb.html.includes(ENVELOPE), { texts: sb.texts, focus: sb.focus, cursor: sb.cursor, atStart: sb.atStart, own: imageOf(sb, 'own'), envelope: sb.html.includes(ENVELOPE) });
  await b.press('Control+z');
  await sleep(500);
  sb = await state(B.app);
  check(tag + 'un Ctrl+Z la retire : « Cible » à l’identique', sb.html === targetHtml, { texts: sb.texts });

  // --- Un mot sélectionné garde le copier de toujours.
  await A.page.bringToFront();
  await a.doubleClickWord('Premier texte', 'Premier');
  await a.press('Control+c');
  sa = await state(A.app);
  await B.page.bringToFront();
  await b.clickText('Cible un');
  await b.press('Control+v');
  await sleep(500);
  sb = await state(B.app);
  check(tag + 'un mot sélectionné (double clic) garde le copier de toujours : le coin d’état ne dit rien de plus, et le mot se colle au curseur, sans diapositive de plus',
    sa.status === T.copied(3) && sb.count === 3 && JSON.stringify(sb.texts) === JSON.stringify(['Cible unPremier', 'Cible deux', 'Cible trois']), { status: sa.status, texts: sb.texts });
  await b.press('Control+z');
  await sleep(500);

  // --- GFS éteint l'extension dans « Cible » : Ctrl+V et Ctrl+C sur une miniature appellent `installer` ; le texte colle comme toujours.
  await A.page.bringToFront();
  await a.clickText('Trois');
  await a.press('Control+c');
  await B.page.bringToFront();
  await B.page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await B.app.waitForFunction(() => { const add = document.querySelector('.pp-slide-add'); return !!add && add.getAttribute('aria-disabled') === 'true'; }, null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  const offHtml = (await state(B.app)).html;
  await b.click('.pp-slide-thumb', 0);
  await b.intoStrip();
  await b.press('Control+v');
  await sleep(500);
  let installs = await gfsCalls(B.page, 'installer');
  sb = await state(B.app);
  check(tag + 'extension éteinte : Ctrl+V sur une miniature demande à GFS d’installer « diapositives » (appel `installer`), sans fenêtre de l’app, et rien ne change',
    JSON.stringify(installs) === JSON.stringify([{ extension: 'diapositives' }]) && !(await appDialogOpen(B.app)) && sb.html === offHtml && sb.count === 3, { installs, count: sb.count });
  await b.press('Control+c');
  await sleep(300);
  installs = await gfsCalls(B.page, 'installer');
  check(tag + 'Ctrl+C sur la miniature aussi (un deuxième appel `installer`)', installs.length === 2 && !(await appDialogOpen(B.app)), { installs });
  await b.clickText('Cible un');
  await b.press('Control+v');
  await sleep(500);
  sb = await state(B.app);
  check(tag + 'dans le texte, Ctrl+V colle la diapositive copiée au curseur, comme un texte, sans diapositive de plus ni enveloppe',
    sb.count === 3 && JSON.stringify(sb.texts) === JSON.stringify(['Cible unTrois', 'Cible deux', 'Cible trois']) && !sb.html.includes(ENVELOPE), { texts: sb.texts, envelope: sb.html.includes(ENVELOPE) });
  await b.press('Control+z');
  await B.page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);
  await sleep(500);

  check(tag + 'aucune boîte native du navigateur dans les deux onglets', A.natives.length === 0 && B.natives.length === 0, { a: A.natives, b: B.natives });
  await A.context.close();
  await B.context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
