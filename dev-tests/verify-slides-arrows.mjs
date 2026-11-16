#!/usr/bin/env node
// Les flèches ↑ et ↓ après un clic sur une miniature de la bande des diapositives (extensions/diapositives/slide-strip.js : wireList, onListKey ; ce que font PowerPoint et Google
// Slides, demande du 16/11 : « quand on clique sur une diapo dans le panneau de gauche et qu'on fait flèche du bas ou du haut, ça ne change pas directement de diapo : ça rentre dans
// la diapo et ça saute sur des ancres invisibles »), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS comme pour de vrai : l'app dans
// le cadre isolé de GFS, l'extension « diapositives » active, « Six » à l'écran (six diapositives de deux lignes chacune).
//  LE CLIC : un clic sur une miniature mène à sa diapositive (le curseur y va, le document la montre) ET garde le clavier sur la miniature, sans toucher au texte.
//  LES FLÈCHES : ↓ passe à la diapositive d'après, ↑ à celle d'avant, d'une miniature à l'autre, sans que le curseur ne descende d'une ligne dans le texte de la diapositive ; Début et Fin
//   vont à la première et à la dernière ; ↑ sur la première et ↓ sur la dernière ne bougent pas ; le document montre chaque diapositive au fil des flèches ; le texte n'est jamais modifié.
//  RENDRE LE CLAVIER AU DOCUMENT : Entrée (le curseur au début de la diapositive, on y écrit), Échap, un clic dans le texte ; ↓ dans le texte reste une flèche de texte (le curseur descend
//   d'une ligne dans la même diapositive, la bande ne bouge pas).
// Lancé par run-headless.mjs (groupe Node "slidesArrows", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-arrows.mjs
import { start, seedModels, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-arrows', port: Number(process.env.SLIDES_ARROWS_PORT || 8957) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const NAMES = ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six'];
// Deux lignes par diapositive : sur l'ancien code, ↓ après un clic descendait sur la deuxième ligne de la même diapositive.
const BODY = NAMES.map(name => `<p>${name}</p><p>${name} suite</p>`).join(BR);
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(9, 'Six', ${JSON.stringify(BODY)}, false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 11;
`;

// L'ordre des diapositives, la diapositive du curseur et sa ligne, la miniature du clavier, le clavier, ce que le document montre, le texte entier (pour savoir s'il a bougé).
function state(app) {
  return app.evaluate(() => {
    const ed = EditorCore.getEditor();
    const doc = ed.state.doc;
    const slides = SlideStrip.slidesOf(doc);
    const order = slides.map(s => s.nodes.map(e => e.node.textContent).join(' | ').trim());
    const pos = ed.state.selection.from;
    const cursor = slides.findIndex(s => s.nodes.some(e => pos >= e.pos && pos <= e.pos + e.node.nodeSize));
    const items = Array.from(document.querySelectorAll('.pp-slide-strip .pp-slide-item'));
    const active = document.activeElement;
    const box = document.getElementById('editor-container').getBoundingClientRect();
    // Les diapositives dont la première ligne est entièrement dans la fenêtre du document.
    const seen = Array.from(ed.view.dom.querySelectorAll('p')).filter((p) => {
      const r = p.getBoundingClientRect();
      return r.height > 0 && r.top >= box.top && r.bottom <= box.bottom;
    }).map(p => p.textContent);
    return {
      order, cursor, line: ed.state.selection.$from.parent.textContent,
      current: items.findIndex(i => i.tabIndex === 0),
      selected: items.map((item, i) => (item.getAttribute('aria-selected') === 'true' ? i : -1)).filter(i => i >= 0),
      focus: active && active.closest('.tiptap') ? 'editor' : active && active.classList.contains('pp-slide-item') ? 'item' + items.indexOf(active) : (active && active.className) || '',
      seen,
      json: JSON.stringify(doc.toJSON()),
    };
  });
}
const toTop = app => app.evaluate(() => { document.querySelector('.pp-slide-list').scrollTop = 0; });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
  // La miniature est d'abord amenée dans la bande (à 700x400 elle n'en montre que deux ou trois), puis visée au centre.
  const itemCenter = index => app.evaluate((i) => {
    const thumb = document.querySelectorAll('.pp-slide-strip .pp-slide-thumb')[i];
    thumb.scrollIntoView({ block: 'nearest' });
    const r = thumb.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, index);
  // Un vrai clic sur la miniature : la souris arrive, appuie, lâche.
  const click = async (index) => {
    const at = await inPage(await itemCenter(index));
    await page.mouse.move(at.x - 8, at.y);
    await page.mouse.move(at.x, at.y, { steps: 2 });
    await sleep(60);
    await page.mouse.down();
    await sleep(60);
    await page.mouse.up();
    await sleep(500);
  };
  const clickAt = async (c) => { const p = await inPage(c); await page.mouse.move(p.x, p.y, { steps: 3 }); await page.mouse.click(p.x, p.y); await sleep(300); };
  const press = async (key, settle = 400) => { await page.keyboard.press(key); await sleep(settle); };
  return { click, clickAt, press };
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

async function run(lang, colorScheme) {
  const tag = `[${lang} ${colorScheme}] `;
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme, height: HEIGHT });
  const { page, app } = A;
  const a = toolsOf(A);
  await open(A, 9, NAMES.length);
  await toTop(app);
  await sleep(200);

  // --- Le clic : la diapositive, et le clavier sur la miniature.
  await a.click(1);
  let s = await state(app);
  const text0 = s.json;
  check(tag + 'six diapositives de deux lignes', s.order.length === 6 && s.order[1] === 'Deux | Deux suite', s.order);
  check(tag + 'un clic sur la deuxième miniature : le curseur est dans « Deux », le document la montre, le clavier reste sur la miniature (pas dans le texte)',
    s.cursor === 1 && s.line === 'Deux' && same(s.selected, [1]) && s.current === 1 && s.focus === 'item1' && s.seen.includes('Deux'), { cursor: s.cursor, line: s.line, selected: s.selected, current: s.current, focus: s.focus, seen: s.seen });

  // --- Les flèches : d'une diapositive à l'autre.
  await a.press('ArrowDown');
  s = await state(app);
  check(tag + '↓ passe à la troisième diapositive : le curseur est au début de « Trois », pas sur la deuxième ligne de « Deux »',
    s.cursor === 2 && s.line === 'Trois' && same(s.selected, [2]) && s.current === 2 && s.focus === 'item2', { cursor: s.cursor, line: s.line, selected: s.selected, focus: s.focus });
  check(tag + 'le document montre « Trois » (il défile jusqu’à sa page)', s.seen.includes('Trois') && !s.seen.includes('Deux'), s.seen);
  await a.press('ArrowDown');
  await a.press('ArrowDown');
  s = await state(app);
  check(tag + '↓ deux fois de plus : la cinquième, le clavier la suit', s.cursor === 4 && s.line === 'Cinq' && same(s.selected, [4]) && s.focus === 'item4' && s.seen.includes('Cinq'), { cursor: s.cursor, line: s.line, selected: s.selected, focus: s.focus, seen: s.seen });
  await a.press('ArrowUp');
  s = await state(app);
  check(tag + '↑ revient à la quatrième', s.cursor === 3 && s.line === 'Quatre' && same(s.selected, [3]) && s.focus === 'item3' && s.seen.includes('Quatre'), { cursor: s.cursor, line: s.line, selected: s.selected, focus: s.focus, seen: s.seen });
  await a.press('Home');
  s = await state(app);
  check(tag + 'Début : la première', s.cursor === 0 && s.line === 'Un' && same(s.selected, [0]) && s.focus === 'item0', { cursor: s.cursor, line: s.line, selected: s.selected, focus: s.focus });
  await a.press('ArrowUp');
  s = await state(app);
  check(tag + '↑ sur la première ne bouge pas (le clavier ne sort pas de la bande)', s.cursor === 0 && same(s.selected, [0]) && s.focus === 'item0', { cursor: s.cursor, selected: s.selected, focus: s.focus });
  await a.press('End');
  s = await state(app);
  check(tag + 'Fin : la dernière', s.cursor === 5 && s.line === 'Six' && same(s.selected, [5]) && s.focus === 'item5' && s.seen.includes('Six'), { cursor: s.cursor, line: s.line, selected: s.selected, focus: s.focus, seen: s.seen });
  await a.press('ArrowDown');
  s = await state(app);
  check(tag + '↓ sur la dernière ne bouge pas', s.cursor === 5 && same(s.selected, [5]) && s.focus === 'item5', { cursor: s.cursor, selected: s.selected, focus: s.focus });
  check(tag + 'le texte de la présentation n’a pas bougé d’un signe pendant tout le parcours', s.json === text0);

  // --- Rendre le clavier au document : Entrée, Échap, un clic dans le texte.
  await toTop(app);
  await a.click(2);
  await a.press('Enter');
  s = await state(app);
  check(tag + 'Entrée rend le clavier au document, le curseur au début de « Trois »', s.focus === 'editor' && s.cursor === 2 && s.line === 'Trois', { focus: s.focus, cursor: s.cursor, line: s.line });
  await page.keyboard.type('x');
  await sleep(400);
  s = await state(app);
  check(tag + 'on y écrit : la lettre tombe dans « Trois », nulle part ailleurs', same(s.order, ['Un | Un suite', 'Deux | Deux suite', 'xTrois | Trois suite', 'Quatre | Quatre suite', 'Cinq | Cinq suite', 'Six | Six suite']), s.order);
  await a.press('Control+z', 500);
  await toTop(app);
  await a.click(3);
  await a.press('Escape');
  s = await state(app);
  check(tag + 'Échap rend le clavier au document, la diapositive reste « Quatre »', s.focus === 'editor' && s.cursor === 3 && s.json === text0, { focus: s.focus, cursor: s.cursor });

  // --- Dans le texte, ↓ reste une flèche de texte : la ligne d'après, dans la même diapositive.
  await a.clickAt(await app.evaluate(() => {
    const p = Array.from(EditorCore.getEditor().view.dom.querySelectorAll('p')).find(x => x.textContent === 'Quatre');
    const r = p.getBoundingClientRect();
    return { x: r.left + 40, y: r.top + r.height / 2 };
  }));
  s = await state(app);
  check(tag + 'un clic dans le texte de « Quatre » : le clavier est dans le document', s.focus === 'editor' && s.cursor === 3 && s.line === 'Quatre', { focus: s.focus, cursor: s.cursor, line: s.line });
  await a.press('ArrowDown');
  s = await state(app);
  check(tag + '↓ dans le texte descend d’une ligne dans la même diapositive (la bande ne bouge pas)', s.focus === 'editor' && s.cursor === 3 && s.line === 'Quatre suite' && s.current === 3, { focus: s.focus, cursor: s.cursor, line: s.line, current: s.current });

  check(tag + 'aucune boîte native du navigateur', A.natives.length === 0, A.natives);
  await A.context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
