#!/usr/bin/env node
// Glisser une miniature de la bande des diapositives (extensions/diapositives/slide-strip.js:onDragPress ; ce que fait tout éditeur de diapositives, absence du 21/10), à la vraie
// souris, 700x400, français clair puis anglais sombre, hébergé par GFS comme pour de vrai : l'app dans le cadre isolé de GFS, l'extension « diapositives » active, « Huit » à l'écran
// (huit diapositives, une forme « Devant le texte » sur la première ; la bande déborde et défile).
//  GLISSER : bouton enfoncé sur une miniature, la souris qui bouge emporte sa copie (qui suit la souris), la miniature s'estompe à sa place, une ligne d'accent se pose entre les deux
//   miniatures où elle irait. Lâchée, la diapositive y va (vers le bas comme vers le haut), le curseur la suit ; la forme change de page avec elle ; chaque miniature garde sa rangée
//   (rien ne se recopie) ; un seul Ctrl+Z remet tout.
//  RIEN NE BOUGE : un appui qui bouge à peine est un clic (il va à la diapositive) ; lâchée à sa place, la ligne ne se montre pas ; Échap pendant le glisser, puis le relâchement ; lâchée
//   sur le document, à côté de la bande ; l'extension éteinte, la miniature ne part pas.
//  DÉFILER : glissée près du bas de la bande, la bande défile jusqu'en bas ; lâchée là, la première diapositive devient la dernière, en ne déplaçant que sa rangée (demande du 09/11 : « glisser déposer
//   une slide pour changer l'ordre freeze encore plusieurs secondes quand on relâche la souris » : chaque rangée d'entre-deux passait devant elle, une à une, et le navigateur refaisait leur style).
//  LE TEXTE : une diapositive de sept blocs qui descend jusqu'au bout ne fait recréer que ses propres blocs dans l'éditeur ; ceux des diapositives qu'elle traverse gardent leurs éléments (avant, ProseMirror
//   les recréait tous : plus de la moitié du relâchement) ; le texte est le même, dans le bon ordre, et un Ctrl+Z le remet.
// Lancé par run-headless.mjs (groupe Node "slidesDrag", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-drag.mjs
import { start, seedModels, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-drag', port: Number(process.env.SLIDES_DRAG_PORT || 8940) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const FRONT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGOQizoBRwzEcQD9oxQB2jyOrgAAAABJRU5ErkJggg==';
const SHAPE = `<img class="editor-image" src="${FRONT}" alt="" style="width: 60px; height: 40px; position: absolute; left: 120px; top: 0px; z-index: 5" data-layer="front" data-wrap="inline" data-page-index="0" data-page-left-pt="40" data-page-top-pt="30">`;
const NAMES = ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit'];
const BODY = NAMES.map((name, i) => `<p>${name}</p>` + (i === 0 ? `<p>${SHAPE}</p>` : '')).join(BR);
// Trois diapositives de sept paragraphes : ProseMirror cherche un bloc neuf parmi les cinq premiers anciens, une diapositive de sept blocs qui descend n'y est pas retrouvée à sa place.
const LONG = [1, 2, 3].map(k => [1, 2, 3, 4, 5, 6, 7].map(j => `<p>S${k}-${j}</p>`).join('')).join(BR);
const LONG_TEXTS = [1, 2, 3].map(k => [1, 2, 3, 4, 5, 6, 7].map(j => `S${k}-${j}`));
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(8, 'Huit', ${JSON.stringify(BODY)}, false, 'presentation');
  add(9, 'Longues', ${JSON.stringify(LONG)}, false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 12;
`;

// L'ordre des diapositives (le texte de chacune), la page de la forme, la diapositive du curseur, la bande (ses rangées, sa ligne d'accent, la copie qui suit la souris).
function state(app) {
  return app.evaluate(() => {
    const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const doc = EditorCore.getEditor().state.doc;
    const order = SlideStrip.slidesOf(doc).map(s => s.nodes.map(e => e.node.textContent).join(' ').trim());
    let shapePage = null;
    doc.descendants((node) => { if (node.type.name === 'editorImage') shapePage = node.attrs.pageIndex; return true; });
    const items = Array.from(document.querySelectorAll('.pp-slide-strip .pp-slide-item'));
    const list = document.querySelector('.pp-slide-list');
    const line = document.querySelector('.pp-slide-drop');
    const ghost = document.querySelector('.pp-slide-ghost');
    const shield = document.querySelector('.pp-slide-drag-shield');
    const shieldStyle = shield ? getComputedStyle(shield) : null;
    const copy = document.querySelector('.pp-slide-strip .pp-slide-thumb .pp-slide-page *');
    return {
      order, shapePage,
      // Le voile du curseur « saisi » (couvre la fenêtre, sous la copie), le curseur de la liste et celui d'un élément des copies des miniatures (hérité de la rangée).
      shield: shield ? { rect: rect(shield), position: shieldStyle.position, cursor: shieldStyle.cursor, belowGhost: !!ghost && !!(shield.compareDocumentPosition(ghost) & Node.DOCUMENT_POSITION_FOLLOWING) } : null,
      listCursor: getComputedStyle(list).cursor, copyCursor: copy ? getComputedStyle(copy).cursor : '', view: { w: window.innerWidth, h: window.innerHeight },
      current: items.findIndex(i => i.getAttribute('aria-selected') === 'true'),
      rows: Array.from(document.querySelectorAll('.pp-slide-strip .pp-slide-row')).map(r => ({ rect: rect(r), mark: r.dataset.testMark || '', source: r.classList.contains('pp-slide-drag-source') })),
      list: rect(list), scrollTop: list.scrollTop, scrollMax: list.scrollHeight - list.clientHeight,
      line: line && !line.hidden ? rect(line) : null,
      ghost: ghost ? rect(ghost) : null,
      dragging: list.classList.contains('pp-slide-dragging'),
      focus: document.activeElement && document.activeElement.closest('.tiptap') ? 'editor' : (document.activeElement && document.activeElement.className) || '',
    };
  });
}
const mark = app => app.evaluate(() => document.querySelectorAll('.pp-slide-strip .pp-slide-row').forEach((r, i) => { r.dataset.testMark = String(i); }));
const toTop = app => app.evaluate(() => { document.querySelector('.pp-slide-list').scrollTop = 0; });
// Les rangées que le navigateur reçoit de nouveau dans la liste (une insertion, déplacée ou neuve), repérées par leur marque : de `watchRows` à `rowMoves`.
const watchRows = app => app.evaluate(() => {
  const note = records => records.forEach(r => r.addedNodes.forEach((n) => { if (n.classList && n.classList.contains('pp-slide-row')) window.__rowMoves.push(n.dataset.testMark || '?'); }));
  window.__rowMoves = [];
  window.__rowNote = note;
  window.__rowWatch = new MutationObserver(note);
  window.__rowWatch.observe(document.querySelector('.pp-slide-list'), { childList: true });
});
const rowMoves = app => app.evaluate(() => { window.__rowNote(window.__rowWatch.takeRecords()); window.__rowWatch.disconnect(); return window.__rowMoves.slice(); });
// Les paragraphes « S1-1 »… de l'éditeur, dans l'ordre où le navigateur les montre, et lesquels sont encore l'élément marqué par `tagEditor` avec le texte qu'il avait (un élément gardé tel quel n'a été ni
// recréé ni réécrit avec le texte d'un autre bloc : ProseMirror met à jour sur place le premier bloc qui lui ressemble quand il ne retrouve pas celui qu'il cherche).
const tagEditor = app => app.evaluate(() => { Array.from(EditorCore.getEditor().view.dom.children).forEach((el, i) => { el.__before = i; el.__text = el.textContent; }); });
const editorText = app => app.evaluate(() => {
  const kids = Array.from(EditorCore.getEditor().view.dom.children).filter(el => el.tagName === 'P' && /^S\d-\d$/.test(el.textContent));
  return { texts: kids.map(el => el.textContent), kept: kids.map(el => el.__before !== undefined && el.__text === el.textContent) };
});

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
  const inPage = async (c) => { const o = await offset(); return { x: c.x + o.x, y: c.y + o.y }; };
  const itemCenter = index => app.evaluate((i) => {
    const r = document.querySelectorAll('.pp-slide-strip .pp-slide-thumb')[i].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, index);
  // Le point de la bande entre la rangée `gap - 1` et la rangée `gap` (au-dessus de la première pour 0), à la hauteur de la miniature.
  const gapPoint = gap => app.evaluate((g) => {
    const rows = Array.from(document.querySelectorAll('.pp-slide-strip .pp-slide-row')).map(r => r.getBoundingClientRect());
    const thumb = document.querySelector('.pp-slide-strip .pp-slide-thumb').getBoundingClientRect();
    const y = g === 0 ? rows[0].top + 2 : g === rows.length ? rows[rows.length - 1].bottom + 2 : (rows[g - 1].bottom + rows[g].top) / 2;
    return { x: thumb.left + thumb.width / 2, y };
  }, gap);
  let at = null;
  const down = async (index) => { at = await inPage(await itemCenter(index)); await page.mouse.move(at.x - 8, at.y); await page.mouse.move(at.x, at.y, { steps: 2 }); await sleep(60); await page.mouse.down(); await sleep(60); };
  const moveTo = async (c, steps = 8) => { at = await inPage(c); await page.mouse.move(at.x, at.y, { steps }); await sleep(120); };
  const nudge = async (dx, dy) => { at = { x: at.x + dx, y: at.y + dy }; await page.mouse.move(at.x, at.y, { steps: 2 }); await sleep(100); };
  const up = async (settle = 500) => { await page.mouse.up(); await sleep(settle); };
  const click = async (index) => { await down(index); await up(); };
  const press = async (key, settle = 300) => { await page.keyboard.press(key); await sleep(settle); };
  return { down, moveTo, nudge, up, click, press, gapPoint, itemCenter };
}

const open = async (tab, id, count) => {
  await Promise.race([
    tab.page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
    sleep(20000),
  ]);
  await tab.app.waitForFunction(([n, c]) => {
    const strip = document.querySelector('.pp-slide-strip');
    return String(Templates.getCurrentId()) === String(n) && !!strip && !strip.hidden && document.querySelectorAll('.pp-slide-strip .pp-slide-item').length === c;
  }, [id, count], { timeout: 15000 }).catch(() => {});
  await sleep(800);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const moved = (from, to) => { const list = NAMES.slice(); const [one] = list.splice(from, 1); list.splice(to > from ? to - 1 : to, 0, one); return list; };

async function run(lang, colorScheme) {
  const tag = `[${lang} ${colorScheme}] `;
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme, height: HEIGHT });
  const { page, app } = A;
  const a = toolsOf(A);
  await open(A, 8, NAMES.length);
  // La bande en haut, le curseur sur la première.
  await toTop(app);
  await sleep(200);
  await a.click(0);
  let s = await state(app);
  check(tag + 'huit diapositives, la forme sur la première ; la bande déborde', same(s.order, NAMES) && s.shapePage === 0 && s.scrollMax > 0 && s.current === 0,
    { order: s.order, shapePage: s.shapePage, scrollMax: s.scrollMax, current: s.current });
  const copyCursorBefore = s.copyCursor;

  // La bande, à 700x400 sous la barre d'outils, montre trois miniatures : chaque geste vise celles-là, loin des bords qui la font défiler.
  // --- Vers le bas : la première entre la deuxième et la troisième.
  await mark(app);
  await a.down(0);
  await a.moveTo(await a.gapPoint(2));
  s = await state(app);
  const ghostAt1 = s.ghost;
  const r1 = s.rows[1].rect;
  const r2 = s.rows[2].rect;
  check(tag + 'glissée : la miniature s’estompe à sa place, sa copie suit la souris, la ligne d’accent est entre la deuxième et la troisième',
    s.dragging && s.rows[0].source && !!s.ghost && !!s.line && s.line.top >= r1.bottom - 1 && s.line.bottom <= r2.top + 1 && s.line.width > 60 && s.scrollTop === 0,
    { dragging: s.dragging, source: s.rows[0].source, ghost: s.ghost, line: s.line, r1, r2, scrollTop: s.scrollTop });
  // Demande du 04/11 (« quand on doit supprimer ou déplacer une diapo il y a un freeze de quelques secondes ») : `cursor` est hérité, et le mettre sur chaque rangée refaisait le style de
  // tous les éléments des copies des miniatures (3 500 dans « Présentation commerciale », 60 ms au début du glisser et 40 à la fin). Le curseur « saisi » est donc sur la liste et sur un
  // voile qui couvre la fenêtre ; les copies gardent le leur.
  check(tag + 'glissée : le curseur « saisi » est sur la liste et sur un voile qui couvre la fenêtre, sous la copie ; les copies des miniatures gardent leur curseur (cursor est hérité)',
    !!s.shield && s.shield.position === 'fixed' && s.shield.cursor === 'grabbing' && s.shield.belowGhost && s.shield.rect.width >= s.view.w - 1 && s.shield.rect.height >= s.view.h - 1
      && s.listCursor === 'grabbing' && !!copyCursorBefore && s.copyCursor === copyCursorBefore,
    { shield: s.shield, view: s.view, listCursor: s.listCursor, copyCursorBefore, copyCursor: s.copyCursor });
  await a.nudge(0, -6);
  s = await state(app);
  check(tag + 'la copie suit la souris au pixel près', !!s.ghost && !!ghostAt1 && Math.abs(s.ghost.top - (ghostAt1.top - 6)) <= 1 && Math.abs(s.ghost.left - ghostAt1.left) <= 1, { before: ghostAt1, after: s.ghost });
  await a.moveTo(await a.gapPoint(2), 2);
  await a.up();
  s = await state(app);
  check(tag + 'lâchée : la diapositive est entre « Deux » et « Trois », le curseur la suit, le clavier va au document, la copie et la ligne sont parties',
    same(s.order, moved(0, 2)) && s.current === 1 && s.focus === 'editor' && !s.ghost && !s.line && !s.dragging && !s.shield, { order: s.order, current: s.current, focus: s.focus, shield: s.shield });
  check(tag + 'la forme change de page avec sa diapositive (deuxième page) ; chaque miniature garde sa rangée, rien ne se recopie',
    s.shapePage === 1 && same(s.rows.map(r => r.mark), ['1', '0', '2', '3', '4', '5', '6', '7']), { shapePage: s.shapePage, marks: s.rows.map(r => r.mark) });
  await a.press('Control+z', 600);
  s = await state(app);
  check(tag + 'un seul Ctrl+Z remet l’ordre et la page de la forme', same(s.order, NAMES) && s.shapePage === 0, { order: s.order, shapePage: s.shapePage });

  // --- Vers le haut : la troisième en tête.
  await toTop(app);
  await sleep(200);
  await a.down(2);
  await a.moveTo(await a.gapPoint(0));
  s = await state(app);
  const lineTop = s.line;
  const firstTop = s.rows[0].rect.top;
  await a.up();
  s = await state(app);
  check(tag + 'vers le haut : la troisième, lâchée au-dessus de la première, ouvre la présentation ; la ligne était au-dessus de la première',
    same(s.order, moved(2, 0)) && s.current === 0 && !!lineTop && lineTop.bottom <= firstTop + 1, { order: s.order, current: s.current, line: lineTop, firstTop });
  await a.press('Control+z', 600);
  await toTop(app);
  await sleep(200);

  // --- Un appui qui bouge à peine : un clic.
  await a.down(2);
  await a.nudge(2, 1);
  s = await state(app);
  const ghostSmall = !!s.ghost;
  await a.up();
  s = await state(app);
  check(tag + 'un appui qui bouge de 2 px est un clic : rien ne part, le curseur va à la troisième', !ghostSmall && same(s.order, NAMES) && s.current === 2, { ghost: ghostSmall, order: s.order, current: s.current });

  // --- À sa place : pas de ligne, rien ne bouge, le curseur reste.
  await toTop(app);
  await sleep(200);
  await a.down(1);
  await a.nudge(0, 14);
  s = await state(app);
  const lineOwn = s.line;
  const ghostOwn = !!s.ghost;
  await a.up();
  s = await state(app);
  check(tag + 'lâchée à sa place : la ligne ne se montre pas, rien ne bouge, le curseur reste sur la troisième', ghostOwn && !lineOwn && same(s.order, NAMES) && s.current === 2,
    { ghost: ghostOwn, line: lineOwn, order: s.order, current: s.current });

  // --- Échap pendant le glisser.
  await toTop(app);
  await sleep(200);
  await a.down(0);
  await a.moveTo(await a.gapPoint(2));
  s = await state(app);
  const beforeEsc = !!s.line;
  await a.press('Escape', 200);
  s = await state(app);
  const afterEsc = { ghost: !!s.ghost, line: !!s.line, dragging: s.dragging, shield: !!s.shield };
  await a.nudge(0, 4);
  await a.up();
  s = await state(app);
  check(tag + 'Échap : la copie et la ligne partent tout de suite ; le relâchement ne fait rien (ni ordre ni curseur changés)',
    beforeEsc && !afterEsc.ghost && !afterEsc.line && !afterEsc.dragging && !afterEsc.shield && same(s.order, NAMES) && s.current === 2 && !s.shield, { beforeEsc, afterEsc, order: s.order, current: s.current });

  // --- Lâchée sur le document, à côté de la bande.
  await toTop(app);
  await sleep(200);
  await a.down(0);
  const side = await a.gapPoint(2);
  await a.moveTo({ x: s.list.right + 160, y: side.y });
  s = await state(app);
  const lineSide = s.line;
  await a.up();
  s = await state(app);
  check(tag + 'lâchée sur le document : pas de ligne, rien ne bouge', !lineSide && same(s.order, NAMES) && s.current === 2, { line: lineSide, order: s.order, current: s.current });

  // --- Près du bas : la bande défile ; lâchée tout en bas, la première devient la dernière.
  await toTop(app);
  await sleep(200);
  await a.down(0);
  s = await state(app);
  await a.moveTo({ x: s.list.left + s.list.width / 2, y: s.list.bottom - 6 });
  await sleep(1200);
  s = await state(app);
  const scrolled = { top: s.scrollTop, max: s.scrollMax };
  await mark(app);
  await watchRows(app);
  await a.up();
  const inserted = await rowMoves(app);
  s = await state(app);
  check(tag + 'près du bas, la bande défile jusqu’en bas ; lâchée là, la première diapositive devient la dernière',
    scrolled.max > 0 && scrolled.top >= scrolled.max - 1 && same(s.order, moved(0, 8)) && s.current === 7, { scrolled, order: s.order, current: s.current });
  // Une rangée déplacée est une rangée dont le navigateur refait le style et la mise en page (près de 140 éléments chacune dans une longue présentation) : descendre la première de sept places ne déplace
  // que sa rangée (une insertion), pas les sept d'entre-deux devant elle.
  check(tag + 'la première, descendue de sept places, est la seule rangée déplacée : une insertion dans la bande, pas une par diapositive d’entre-deux ; chacune garde sa rangée',
    same(inserted, ['0']) && same(s.rows.map(r => r.mark), ['1', '2', '3', '4', '5', '6', '7', '0']), { inserted, marks: s.rows.map(r => r.mark) });
  await a.press('Control+z', 600);
  s = await state(app);
  check(tag + 'Ctrl+Z la remet en tête', same(s.order, NAMES), s.order);
  await toTop(app);
  await sleep(200);

  // --- L'extension éteinte : la miniature ne part pas.
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await app.waitForFunction(() => { const b = document.querySelector('.pp-slide-add'); return !!b && b.getAttribute('aria-disabled') === 'true'; }, null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  await a.down(0);
  await a.moveTo(await a.gapPoint(4));
  s = await state(app);
  const ghostOff = !!s.ghost || s.dragging;
  await a.up();
  s = await state(app);
  check(tag + 'extension éteinte : la miniature ne part pas, rien ne bouge', !ghostOff && same(s.order, NAMES), { ghost: ghostOff, order: s.order });
  await page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);

  // --- Le texte de l'éditeur : la première de trois diapositives de sept blocs descend au bout.
  await app.waitForFunction(() => { const b = document.querySelector('.pp-slide-add'); return !!b && b.getAttribute('aria-disabled') === 'false'; }, null, { timeout: 8000 }).catch(() => {});
  await open(A, 9, 3);
  await toTop(app);
  await sleep(200);
  await a.click(0);
  await tagEditor(app);
  await a.down(0);
  await a.moveTo(await a.gapPoint(3));
  await a.up(900);
  s = await state(app);
  let long = await editorText(app);
  check(tag + 'sept blocs par diapositive : la première, lâchée après la dernière, finit en dernier ; le texte de l’éditeur suit, dans le bon ordre, sans bloc en double',
    same(s.order.map(text => text.slice(0, 2)), ['S2', 'S3', 'S1']) && same(long.texts, [...LONG_TEXTS[1], ...LONG_TEXTS[2], ...LONG_TEXTS[0]]), { order: s.order, texts: long.texts });
  // L'éditeur ne refait que ce qui a bougé : les quatorze blocs des deux diapositives traversées gardent leurs éléments, tels quels, ceux de la diapositive déplacée sont neufs. (Avant : ProseMirror ne retrouvait
  // pas la diapositive à sa place, et tout ce qu'elle traversait se refaisait, bloc par bloc, ce qui était plus de la moitié du relâchement dans une longue présentation.)
  check(tag + 'les quatorze blocs des diapositives traversées sont les mêmes éléments, avec le même texte ; seuls les sept de la diapositive déplacée sont neufs',
    same(long.kept, [...Array(14).fill(true), ...Array(7).fill(false)]), long.kept);
  await a.press('Control+z', 700);
  s = await state(app);
  long = await editorText(app);
  check(tag + 'Ctrl+Z remet l’ordre et le texte de l’éditeur', same(s.order.map(text => text.slice(0, 2)), ['S1', 'S2', 'S3']) && same(long.texts, LONG_TEXTS.flat()), { order: s.order, texts: long.texts });
  // Vers le haut, puis Ctrl+Z : défaire la montée de la dernière est, pour l'éditeur, la même descente de la dernière vers sa place d'avant, la diapositive d'au-dessus passant devant ; les deux autres gardent leurs éléments.
  await a.down(2);
  await a.moveTo(await a.gapPoint(0));
  await a.up(900);
  s = await state(app);
  check(tag + 'la dernière, lâchée avant la première, passe en tête', same(s.order.map(text => text.slice(0, 2)), ['S3', 'S1', 'S2']), s.order);
  await tagEditor(app);
  await a.press('Control+z', 900);
  s = await state(app);
  long = await editorText(app);
  check(tag + 'Ctrl+Z la remet en dernier : les quatorze blocs des deux autres diapositives sont les mêmes éléments, avec le même texte ; seuls les sept de la dernière sont neufs',
    same(s.order.map(text => text.slice(0, 2)), ['S1', 'S2', 'S3']) && same(long.texts, LONG_TEXTS.flat()) && same(long.kept, [...Array(14).fill(true), ...Array(7).fill(false)]), { order: s.order, kept: long.kept });

  check(tag + 'aucune boîte native du navigateur', A.natives.length === 0, A.natives);
  await A.context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
