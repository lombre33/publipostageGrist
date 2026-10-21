#!/usr/bin/env node
// Choisir plusieurs diapositives dans la bande (extensions/diapositives/slide-strip.js : picked, pick, togglePick, planOf, arrange ; ce que fait tout éditeur de diapositives, absence
// du 21/10), à la vraie souris et au vrai clavier, 700x436 (700x400 + le bouton « Objets » de la bande), français clair puis anglais sombre, hébergé par GFS comme pour de vrai : l'app dans le cadre isolé de GFS, l'extension
// « diapositives » active, « Six » à l'écran (six diapositives, une forme « Devant le texte » sur la deuxième).
//  CHOISIR : Ctrl+clic ajoute une miniature au choix (le curseur y va, le clavier reste dans la bande) et l'en retire ; Maj+clic choisit de la dernière miniature cliquée jusqu'à
//   celle-ci ; la liste se dit à choix multiple, chaque miniature choisie porte l'anneau d'accent.
//  AGIR SUR LE CHOIX, chaque fois en une transaction qu'un seul Ctrl+Z défait : Suppr efface deux diapositives qui ne se suivent pas ; le menu dit « 3 diapositives », « Dupliquer
//   les 3 diapositives » les copie après la dernière (les copies restent choisies), « Monter » est grisé avec sa raison quand elles sont en haut, « Ajouter une diapositive après »
//   ajoute une seule diapositive après celle du menu ; Ctrl+↓ descend deux diapositives d'une place (la forme change de page avec la sienne) ; glisser une miniature du choix les
//   emporte toutes (la copie porte leur nombre, les deux s'estompent) ; Ctrl+C copie les deux, Ctrl+V les colle après la diapositive du curseur.
//  AU CLAVIER : Maj+↓ étend le choix, Échap le défait (le clavier reste dans la bande), un second Échap rend le clavier au document ; Ctrl+A choisit tout.
//  LE CHOIX SE DÉFAIT : un clic simple, une frappe dans le texte. L'extension éteinte, Suppr sur le choix demande l'installation et n'efface rien.
// Lancé par run-headless.mjs (groupe Node "slidesSelect", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-select.mjs
import { start, seedModels, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-select', port: Number(process.env.SLIDES_SELECT_PORT || 8943) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
// Le bouton « Objets » (extensions/diapositives/slide-objects.js) prend 36 px de plus au bas de la bande : à 700x400 sa liste ne montre plus que deux miniatures entières. Ces gestes
// visent trois miniatures, loin des bords qui font défiler la liste : la page a donc 36 px de plus et la liste la hauteur d'avant (verify-free-frame.mjs vérifie la bande à 700x400).
const OBJECTS_BUTTON_PX = 36;

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const FRONT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGOQizoBRwzEcQD9oxQB2jyOrgAAAABJRU5ErkJggg==';
const SHAPE = `<img class="editor-image" src="${FRONT}" alt="" style="width: 60px; height: 40px; position: absolute; left: 120px; top: 0px; z-index: 5" data-layer="front" data-wrap="inline" data-page-index="1" data-page-left-pt="40" data-page-top-pt="30">`;
const NAMES = ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six'];
const BODY = NAMES.map((name, i) => `<p>${name}</p>` + (i === 1 ? `<p>${SHAPE}</p>` : '')).join(BR);
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(9, 'Six', ${JSON.stringify(BODY)}, false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 11;
`;

// L'ordre des diapositives (le texte de chacune), la page de la forme, la diapositive du curseur, les miniatures choisies, la bande, le clavier, le coin d'état.
function state(app) {
  return app.evaluate(() => {
    const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const doc = EditorCore.getEditor().state.doc;
    const order = SlideStrip.slidesOf(doc).map(s => s.nodes.map(e => e.node.textContent).join(' ').trim());
    const shapes = [];
    doc.descendants((node) => { if (node.type.name === 'editorImage') shapes.push(node.attrs.pageIndex); return true; });
    const items = Array.from(document.querySelectorAll('.pp-slide-strip .pp-slide-item'));
    const list = document.querySelector('.pp-slide-list');
    const line = document.querySelector('.pp-slide-drop');
    const ghost = document.querySelector('.pp-slide-ghost');
    const active = document.activeElement;
    return {
      order, shapes,
      current: items.findIndex(i => i.tabIndex === 0),
      selected: items.map((item, i) => (item.getAttribute('aria-selected') === 'true' ? i : -1)).filter(i => i >= 0),
      rings: items.map(item => getComputedStyle(item.querySelector('.pp-slide-thumb')).boxShadow),
      multi: list.getAttribute('aria-multiselectable'),
      sources: Array.from(document.querySelectorAll('.pp-slide-strip .pp-slide-row')).map((r, i) => (r.classList.contains('pp-slide-drag-source') ? i : -1)).filter(i => i >= 0),
      line: line && !line.hidden ? rect(line) : null,
      ghost: ghost ? rect(ghost) : null,
      ghostCount: ghost && ghost.querySelector('.pp-slide-ghost-count') ? ghost.querySelector('.pp-slide-ghost-count').textContent : '',
      focus: active && active.closest('.tiptap') ? 'editor' : active && active.classList.contains('pp-slide-item') ? 'item' + items.indexOf(active) : (active && active.className) || '',
      status: document.getElementById('status-msg').textContent,
      scrollTop: list.scrollTop,
    };
  });
}
const toTop = app => app.evaluate(() => { document.querySelector('.pp-slide-list').scrollTop = 0; });
const gfsCalls = (page, nom) => page.evaluate(n => window.__gfsStub.calls.filter(c => c.nom === n).map(c => c.args), nom);
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
  const itemCenter = index => app.evaluate((i) => {
    const r = document.querySelectorAll('.pp-slide-strip .pp-slide-thumb')[i].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, index);
  const gapPoint = gap => app.evaluate((g) => {
    const rows = Array.from(document.querySelectorAll('.pp-slide-strip .pp-slide-row')).map(r => r.getBoundingClientRect());
    const thumb = document.querySelector('.pp-slide-strip .pp-slide-thumb').getBoundingClientRect();
    const y = g === 0 ? rows[0].top + 2 : g === rows.length ? rows[rows.length - 1].bottom + 2 : (rows[g - 1].bottom + rows[g].top) / 2;
    return { x: thumb.left + thumb.width / 2, y };
  }, gap);
  let at = null;
  const down = async (index) => { at = await inPage(await itemCenter(index)); await page.mouse.move(at.x - 8, at.y); await page.mouse.move(at.x, at.y, { steps: 2 }); await sleep(60); await page.mouse.down(); await sleep(60); };
  const moveTo = async (c, steps = 8) => { at = await inPage(c); await page.mouse.move(at.x, at.y, { steps }); await sleep(120); };
  const up = async (settle = 500) => { await page.mouse.up(); await sleep(settle); };
  const click = async (index, modifier) => {
    if (modifier) await page.keyboard.down(modifier);
    await down(index);
    await up(400);
    if (modifier) await page.keyboard.up(modifier);
  };
  const rightClick = async (index) => { const c = await inPage(await itemCenter(index)); await page.mouse.move(c.x, c.y, { steps: 2 }); await page.mouse.click(c.x, c.y, { button: 'right' }); await sleep(300); };
  const clickAt = async (c) => { const p = await inPage(c); await page.mouse.move(p.x, p.y, { steps: 3 }); await page.mouse.click(p.x, p.y); await sleep(300); };
  const press = async (key, settle = 300) => { await page.keyboard.press(key); await sleep(settle); };
  return { down, moveTo, up, click, rightClick, clickAt, press, gapPoint, itemCenter };
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
// Le menu ouvert : son nom, ses lignes (texte, grisé, raison) ; l'endroit d'une ligne.
const menuOf = app => app.evaluate(() => {
  const panel = document.querySelector('.pp-slide-menu.visible');
  if (!panel) return null;
  return { label: panel.getAttribute('aria-label'), rows: Array.from(panel.querySelectorAll('[data-action]')).map(b => ({ action: b.dataset.action, text: b.textContent, disabled: b.getAttribute('aria-disabled') === 'true', title: b.title })) };
});
const menuRow = (app, action) => app.evaluate((a) => {
  const r = document.querySelector('.pp-slide-menu.visible [data-action="' + a + '"]').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, action);

async function run(lang, colorScheme) {
  const tag = `[${lang} ${colorScheme}] `;
  const en = lang === 'en';
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme, height: HEIGHT + OBJECTS_BUTTON_PX });
  const { page, app } = A;
  const a = toolsOf(A);
  await open(A, 9, NAMES.length);
  await toTop(app);
  await sleep(200);
  await a.click(0);
  let s = await state(app);
  check(tag + 'six diapositives, la forme sur la deuxième ; la liste se dit à choix multiple, seule la première est choisie',
    same(s.order, NAMES) && same(s.shapes, [1]) && s.multi === 'true' && same(s.selected, [0]) && s.current === 0, { order: s.order, shapes: s.shapes, multi: s.multi, selected: s.selected });

  // --- Ctrl+clic : la troisième entre dans le choix ; Suppr efface les deux, un Ctrl+Z les remet.
  await a.click(2, 'Control');
  s = await state(app);
  const ringOn = s.rings[2];
  check(tag + 'Ctrl+clic sur la troisième : la première et la troisième sont choisies, chacune avec l’anneau d’accent, le curseur et le clavier sur la troisième',
    same(s.selected, [0, 2]) && s.current === 2 && s.focus === 'item2' && s.rings[0] === ringOn && ringOn !== s.rings[1] && /rgb/.test(ringOn), { selected: s.selected, current: s.current, focus: s.focus, rings: s.rings.slice(0, 3) });
  await a.click(0, 'Control');
  s = await state(app);
  check(tag + 'un second Ctrl+clic sur la première la retire du choix', same(s.selected, [2]) && s.current === 2, { selected: s.selected, current: s.current });
  await a.click(0, 'Control');
  s = await state(app);
  check(tag + 'Ctrl+clic la remet ; le curseur va sur elle', same(s.selected, [0, 2]) && s.current === 0 && s.focus === 'item0', { selected: s.selected, current: s.current, focus: s.focus });
  await a.press('Delete', 600);
  s = await state(app);
  check(tag + 'Suppr : « Un » et « Trois » partent ensemble, la forme suit « Deux » sur la première page, le curseur sur la première qui reste',
    same(s.order, ['Deux', 'Quatre', 'Cinq', 'Six']) && same(s.shapes, [0]) && s.current === 0 && same(s.selected, [0]), { order: s.order, shapes: s.shapes, current: s.current, selected: s.selected });
  await a.press('Control+z', 700);
  s = await state(app);
  check(tag + 'un seul Ctrl+Z les remet toutes les deux, la forme revient sur la deuxième page ; le choix revient à une seule',
    same(s.order, NAMES) && same(s.shapes, [1]) && s.selected.length === 1, { order: s.order, shapes: s.shapes, selected: s.selected });

  // --- Maj+clic, puis le menu du choix.
  await toTop(app);
  await a.click(0);
  await a.click(2, 'Shift');
  s = await state(app);
  check(tag + 'Maj+clic sur la troisième après un clic sur la première : les trois premières sont choisies', same(s.selected, [0, 1, 2]) && s.current === 2, { selected: s.selected, current: s.current });
  await a.rightClick(1);
  let m = await menuOf(app);
  const row = action => (m ? m.rows.find(r => r.action === action) : null) || {};
  check(tag + 'le menu d’une miniature du choix dit « 3 diapositives » : « Dupliquer les 3 diapositives », « Supprimer les 3 diapositives », « Monter » grisé avec sa raison',
    !!m && m.label === (en ? '3 slides' : '3 diapositives') && row('duplicate').text === (en ? 'Duplicate the 3 slides' : 'Dupliquer les 3 diapositives')
      && row('delete').text === (en ? 'Delete the 3 slides' : 'Supprimer les 3 diapositives') && row('moveUp').disabled
      && row('moveUp').title === (en ? 'The chosen slides are already at the top' : 'Les diapositives choisies sont déjà en haut') && !row('moveDown').disabled, m);
  await a.clickAt(await menuRow(app, 'duplicate'));
  s = await state(app);
  check(tag + '« Dupliquer les 3 diapositives » : les copies arrivent après la troisième, dans l’ordre, choisies, le curseur sur la première copie ; la forme copiée est sur la page de sa copie',
    same(s.order, ['Un', 'Deux', 'Trois', 'Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six']) && same(s.selected, [3, 4, 5]) && s.current === 3 && same(s.shapes.slice().sort(), [1, 4]),
    { order: s.order, selected: s.selected, current: s.current, shapes: s.shapes });
  await a.press('Control+z', 700);
  s = await state(app);
  check(tag + 'un seul Ctrl+Z retire les trois copies', same(s.order, NAMES) && same(s.shapes, [1]), { order: s.order, shapes: s.shapes });

  // Le menu d'une miniature hors du choix : le choix revient à elle.
  await toTop(app);
  await a.click(0);
  await a.click(1, 'Shift');
  await a.rightClick(2);
  m = await menuOf(app);
  s = await state(app);
  check(tag + 'le menu d’une miniature hors du choix : le choix revient à elle seule, le menu dit « Diapositive 3 »',
    !!m && m.label === (en ? 'Slide 3' : 'Diapositive 3') && row('duplicate').text === (en ? 'Duplicate' : 'Dupliquer') && s.selected.length <= 1, { menu: m, selected: s.selected });
  await a.press('Escape', 200);
  // « Ajouter une diapositive après » dans un choix : une seule diapositive, après celle du menu.
  await toTop(app);
  await a.click(0);
  await a.click(1, 'Shift');
  await a.rightClick(0);
  await a.clickAt(await menuRow(app, 'addAfter'));
  s = await state(app);
  check(tag + '« Ajouter une diapositive après » sur la première du choix : une seule diapositive vide, après elle', same(s.order, ['Un', '', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six']) && s.current === 1,
    { order: s.order, current: s.current });
  await a.press('Control+z', 700);

  // --- Ctrl+↓ : deux diapositives descendent d'une place, la forme avec « Deux ».
  await toTop(app);
  await a.click(0);
  await a.click(1, 'Shift');
  await a.press('Control+ArrowDown', 700);
  s = await state(app);
  check(tag + 'Ctrl+↓ sur « Un » et « Deux » : elles passent sous « Trois », toujours choisies, la forme sur la troisième page',
    same(s.order, ['Trois', 'Un', 'Deux', 'Quatre', 'Cinq', 'Six']) && same(s.selected, [1, 2]) && same(s.shapes, [2]) && s.focus.startsWith('item'), { order: s.order, selected: s.selected, shapes: s.shapes, focus: s.focus });
  await a.press('Control+ArrowUp', 700);
  s = await state(app);
  check(tag + 'Ctrl+↑ les remonte', same(s.order, NAMES) && same(s.selected, [0, 1]) && same(s.shapes, [1]), { order: s.order, selected: s.selected, shapes: s.shapes });
  await a.press('Control+z', 500);
  await a.press('Control+z', 700);
  s = await state(app);
  check(tag + 'deux Ctrl+Z ramènent l’ordre d’avant', same(s.order, NAMES), s.order);

  // --- Glisser deux diapositives choisies.
  await toTop(app);
  await a.click(1);
  await a.click(2, 'Shift');
  await a.down(1);
  await a.moveTo(await a.gapPoint(1));
  s = await state(app);
  const still = { line: s.line, ghost: !!s.ghost };
  await a.moveTo(await a.gapPoint(0));
  s = await state(app);
  check(tag + 'glisser une miniature du choix : les deux s’estompent, la copie porte « 2 » ; entre elles, pas de ligne ; au-dessus de la première, la ligne',
    still.ghost && !still.line && same(s.sources, [1, 2]) && s.ghostCount === '2' && !!s.line, { still, sources: s.sources, count: s.ghostCount, line: s.line });
  await a.up();
  s = await state(app);
  check(tag + 'lâchées en tête : « Deux » et « Trois » ouvrent la présentation, toujours choisies, la forme sur la première page',
    same(s.order, ['Deux', 'Trois', 'Un', 'Quatre', 'Cinq', 'Six']) && same(s.selected, [0, 1]) && same(s.shapes, [0]) && !s.ghost && !s.line, { order: s.order, selected: s.selected, shapes: s.shapes });
  await a.press('Control+z', 700);
  s = await state(app);
  check(tag + 'un seul Ctrl+Z les remet', same(s.order, NAMES) && same(s.shapes, [1]), { order: s.order, shapes: s.shapes });

  // --- Ctrl+C sur le choix, Ctrl+V après la troisième.
  await toTop(app);
  await a.click(0);
  await a.click(1, 'Shift');
  // Le coin d'état lu aussitôt : l'enregistrement automatique y écrit ensuite « Enregistré à … ».
  await a.press('Control+c', 30);
  s = await state(app);
  check(tag + 'Ctrl+C sur « Un » et « Deux » : le coin d’état dit « 2 diapositives copiées. »', s.status === (en ? '2 slides copied.' : '2 diapositives copiées.'), s.status);
  await a.click(2);
  await a.click(2, 'Control'); // le clavier va sur la miniature (un Ctrl+clic sur la seule choisie ne change rien)
  await a.press('Control+v', 1500);
  s = await state(app);
  check(tag + 'Ctrl+V sur la troisième : les deux diapositives arrivent après elle, la forme copiée sur la page de sa copie',
    same(s.order, ['Un', 'Deux', 'Trois', 'Un', 'Deux', 'Quatre', 'Cinq', 'Six']) && same(s.shapes.slice().sort(), [1, 4]), { order: s.order, shapes: s.shapes });
  await a.press('Control+z', 800);
  s = await state(app);
  check(tag + 'un seul Ctrl+Z retire le collage', same(s.order, NAMES) && same(s.shapes, [1]), { order: s.order, shapes: s.shapes });

  // --- Au clavier.
  await toTop(app);
  await a.click(0);
  await a.click(0, 'Control');
  await a.press('Shift+ArrowDown');
  await a.press('Shift+ArrowDown');
  s = await state(app);
  check(tag + 'Maj+↓ deux fois : les trois premières choisies, le clavier sur la troisième', same(s.selected, [0, 1, 2]) && s.focus === 'item2', { selected: s.selected, focus: s.focus });
  await a.press('Escape');
  s = await state(app);
  const afterOne = { selected: s.selected, focus: s.focus };
  await a.press('Escape');
  s = await state(app);
  check(tag + 'Échap défait le choix (le clavier reste sur la miniature) ; un second Échap rend le clavier au document',
    same(afterOne.selected, [2]) && afterOne.focus === 'item2' && s.focus === 'editor', { afterOne, focus: s.focus });
  await a.click(2, 'Control');
  await a.press('Control+a');
  s = await state(app);
  check(tag + 'Ctrl+A dans la bande : les six choisies, le curseur reste', same(s.selected, [0, 1, 2, 3, 4, 5]) && s.current === 2, { selected: s.selected, current: s.current });
  await a.rightClick(2);
  m = await menuOf(app);
  check(tag + 'toutes choisies : « Supprimer les 6 diapositives » est grisé (une présentation garde au moins une diapositive)',
    !!m && row('delete').disabled && row('delete').title === (en ? 'A presentation keeps at least one slide' : 'Une présentation garde au moins une diapositive'), m);
  await a.press('Escape', 200);

  // --- Le choix se défait : un clic simple, une frappe.
  await toTop(app);
  await a.click(0);
  await a.click(1, 'Shift');
  await a.click(2);
  s = await state(app);
  check(tag + 'un clic simple : le choix revient à la miniature cliquée, le clavier au document', same(s.selected, [2]) && s.focus === 'editor', { selected: s.selected, focus: s.focus });
  await a.click(0);
  await a.click(1, 'Shift');
  // Un clic au bout de « Deux » dans le document (le curseur reste dans le choix), puis une lettre.
  await a.clickAt(await app.evaluate(() => {
    const p = Array.from(document.querySelectorAll('.tiptap p')).find(x => x.textContent === 'Deux');
    const r = p.getBoundingClientRect();
    return { x: r.left + 60, y: r.top + r.height / 2 };
  }));
  s = await state(app);
  const kept = s.selected;
  await page.keyboard.type('x');
  await sleep(500);
  s = await state(app);
  check(tag + 'un clic dans le texte d’une diapositive du choix le garde ; une frappe le ramène à la diapositive du curseur',
    same(kept, [0, 1]) && s.selected.length === 1 && s.order[1] === 'Deuxx', { kept, selected: s.selected, order: s.order });
  await a.press('Control+z', 600);

  // --- L'extension éteinte : Suppr sur le choix explique et n'efface rien.
  await toTop(app);
  await a.click(0);
  await a.click(1, 'Shift');
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await app.waitForFunction(() => { const b = document.querySelector('.pp-slide-add'); return !!b && b.getAttribute('aria-disabled') === 'true'; }, null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  const before = (await gfsCalls(page, 'installer')).length;
  await a.press('Delete', 600);
  s = await state(app);
  const installs = await gfsCalls(page, 'installer');
  check(tag + 'extension éteinte : Suppr sur le choix demande à GFS d’installer « diapositives » et n’efface rien',
    installs.length === before + 1 && same(s.order, NAMES), { installs, order: s.order });
  await page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);

  check(tag + 'aucune boîte native du navigateur', A.natives.length === 0, A.natives);
  await A.context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
