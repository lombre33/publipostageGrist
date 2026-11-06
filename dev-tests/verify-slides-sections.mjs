#!/usr/bin/env node
// Les SECTIONS d'une présentation dans la bande et dans la vue d'ensemble (extensions/diapositives/slide-strip.js : makeHead, syncSections, openSectionMenu, runSectionAction, sideAt ; slide-overview.js :
// syncHeads ; js/slide-props.js : sectionMove ; demande du 06/11, carte « Dans la bande et dans la grille »), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS comme
// pour de vrai : l'app dans le cadre isolé de GFS, l'extension « diapositives » active, « Six » à l'écran (six diapositives ; « Un » et « Deux » sans section, « Trois » ouvre « Milieu », « Cinq » ouvre « Fin »).
//  EN-TÊTES : un par section nommée, au-dessus de sa première miniature, dans la bande et dans la grille ; aucun pour les diapositives d'avant la première section ; le nom de chaque miniature dit sa section.
//  REPLIER : la flèche de l'en-tête cache les miniatures de la section (le texte ne bouge pas), les flèches du clavier les sautent, un curseur qui arrive dans la section la déplie ; la bande et la grille
//   partagent le pli.
//  CHOISIR et RENOMMER : un clic sur le nom choisit les diapositives de la section ; un double-clic change le nom sur place (Entrée l'écrit en UN Ctrl+Z, Échap le laisse).
//  LE MENU : « Section… » dans le menu d'une diapositive, un clic droit ou le « ⋯ » d'un en-tête ; « Commencer une section ici », « Renommer », « Replier », « Monter », « Descendre » (la section entière, avec
//   ses diapositives et son nom, un seul Ctrl+Z), « Retirer la section » (les diapositives restent) ; chaque ligne grisée dit pourquoi.
//  GLISSER : une miniature déposée sous le titre d'une section l'ouvre, déposée au-dessus de ce titre elle finit la section d'avant ; la ligne d'accent dit où.
// Lancé par run-headless.mjs (groupe Node "slidesSections", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-sections.mjs
import { start, seedModels, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-sections', port: Number(process.env.SLIDES_SECTIONS_PORT || 9202) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const NAMES = ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six'];
const SECTION = name => `<div class="pp-slide-props" contenteditable="false" data-section="${name}"></div>`;
const BODY = NAMES.map((name, i) => (i === 2 ? SECTION('Milieu') : i === 4 ? SECTION('Fin') : '') + `<h2>${name}</h2><p>Texte de ${name.toLowerCase()}</p>`).join(BR);
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(9, 'Six', ${JSON.stringify(BODY)}, false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 11;
`;
const NO_SECTION = ['', '', '', '', '', ''];
const START = ['', '', 'Milieu', '', 'Fin', ''];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// L'état du texte : l'ordre des diapositives (le titre de chacune), les noms de section, la diapositive du curseur.
const doc = app => app.evaluate(() => {
  const d = EditorCore.getEditor().state.doc;
  return {
    order: SlideStrip.slidesOf(d).map(s => s.nodes.map(e => e.node.textContent).join(' ').trim().split('Texte')[0].trim()),
    names: SlideProps.sectionNamesOf(d),
    current: SlideStrip.current(),
  };
});
// La bande : ses en-têtes, ses rangées (cachées ou non), dans l'ordre du document.
const strip = app => app.evaluate(() => {
  const list = document.querySelector('.pp-slide-list');
  const items = Array.from(list.children).map((node) => {
    if (node.classList.contains('pp-slide-section')) {
      const r = node.getBoundingClientRect();
      return { head: true, name: node.querySelector('.pp-slide-section-name').textContent, count: node.querySelector('.pp-slide-section-count').textContent, folded: node.classList.contains('pp-slide-section-folded'), expanded: node.querySelector('.pp-slide-section-fold').getAttribute('aria-expanded'), label: node.querySelector('.pp-slide-section-fold').getAttribute('aria-label'), renaming: !node.querySelector('.pp-slide-section-input').hidden, input: node.querySelector('.pp-slide-section-input').value, top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    }
    if (node.classList.contains('pp-slide-row')) {
      const item = node.querySelector('.pp-slide-item');
      return { row: true, hidden: node.hidden, shown: node.getBoundingClientRect().height > 0, selected: item.getAttribute('aria-selected') === 'true', label: item.getAttribute('aria-label'), tab: item.tabIndex, focus: document.activeElement === item };
    }
    return { other: node.className };
  });
  return items;
});
const headsOf = items => items.filter(i => i.head);
const rowsOf = items => items.filter(i => i.row);
// La vue d'ensemble : null quand elle est fermée.
const grid = app => app.evaluate(() => {
  const root = document.querySelector('.pp-overview');
  if (!root || root.hidden) return null;
  const g = root.querySelector('.pp-ov-grid');
  const gr = g.getBoundingClientRect();
  const items = Array.from(g.children).map((node) => {
    const r = node.getBoundingClientRect();
    if (node.classList.contains('pp-ov-section')) return { head: true, name: node.querySelector('.pp-slide-section-name').textContent, count: node.querySelector('.pp-slide-section-count').textContent, folded: node.classList.contains('pp-slide-section-folded'), renaming: !node.querySelector('.pp-slide-section-input').hidden, width: r.width, left: r.left, top: r.top, bottom: r.bottom };
    if (node.classList.contains('pp-ov-card')) return { card: true, hidden: node.hidden, shown: r.height > 0, selected: node.getAttribute('aria-selected') === 'true', label: node.getAttribute('aria-label'), focus: document.activeElement === node, left: r.left, top: r.top, width: r.width, height: r.height };
    return { other: node.className };
  });
  return { box: { left: gr.left, top: gr.top, right: gr.right, bottom: gr.bottom, width: gr.width }, items, open: true };
});
const cardsOf = g => g.items.filter(i => i.card);
const menuOf = app => app.evaluate(() => {
  const panel = document.querySelector('.pp-slide-menu.visible');
  if (!panel) return null;
  return { label: panel.getAttribute('aria-label'), rows: Array.from(panel.querySelectorAll('[data-action]')).filter(b => !b.hidden && !b.closest('[hidden]')).map(b => ({ action: b.dataset.action, text: b.textContent, disabled: b.getAttribute('aria-disabled') === 'true', title: b.title })) };
});
const menuRow = (app, action) => app.evaluate((a) => {
  const r = document.querySelector('.pp-slide-menu.visible [data-action="' + a + '"]').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, action);

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
  const pointOf = (selector, i = 0, part = 'center') => app.evaluate(([sel, k, where]) => {
    const node = document.querySelectorAll(sel)[k];
    node.scrollIntoView({ block: 'nearest' });
    const r = node.getBoundingClientRect();
    return { x: where === 'left' ? r.left + 8 : r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [selector, i, part]);
  const click = async (c, modifier, settle = 350) => {
    if (modifier) await page.keyboard.down(modifier);
    const p = await inPage(c);
    await page.mouse.move(p.x - 4, p.y, { steps: 2 });
    await page.mouse.move(p.x, p.y, { steps: 2 });
    await page.mouse.click(p.x, p.y);
    if (modifier) await page.keyboard.up(modifier);
    await sleep(settle);
  };
  const dblclick = async (c) => { const p = await inPage(c); await page.mouse.move(p.x, p.y, { steps: 3 }); await page.mouse.dblclick(p.x, p.y); await sleep(450); };
  const rightClick = async (c) => { const p = await inPage(c); await page.mouse.move(p.x, p.y, { steps: 2 }); await page.mouse.click(p.x, p.y, { button: 'right' }); await sleep(350); };
  const moveTo = async (c, steps = 8) => { const p = await inPage(c); await page.mouse.move(p.x, p.y, { steps }); await sleep(120); };
  const down = async (c) => { const p = await inPage(c); await page.mouse.move(p.x - 5, p.y); await page.mouse.move(p.x, p.y, { steps: 2 }); await sleep(60); await page.mouse.down(); await sleep(60); };
  const up = async (settle = 700) => { await page.mouse.up(); await sleep(settle); };
  const press = async (key, settle = 300) => { await page.keyboard.press(key); await sleep(settle); };
  const type = async (text) => { await page.keyboard.type(text, { delay: 20 }); await sleep(150); };
  return { click, dblclick, rightClick, moveTo, down, up, press, type, pointOf };
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
  const en = lang === 'en';
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme, height: HEIGHT });
  const { page, app } = A;
  const a = toolsOf(A);
  await open(A, 9, NAMES.length);
  await app.evaluate(() => { document.querySelector('.pp-slide-list').scrollTop = 0; EditorCore.getEditor().commands.focus('start'); });
  await sleep(300);
  const T = en
    ? { menu: n => `Slide ${n}`, section: name => `Section “${name}”`, none: 'Sections', first: 'This is already the first section', last: 'This is already the last section', opens: 'This slide already opens a section', fold: 'Collapse section', unfold: 'Expand section', newName: 'New section', slides: n => `${n} slides`, in: name => `section “${name}”` }
    : { menu: n => `Diapositive ${n}`, section: name => `Section « ${name} »`, none: 'Sections', first: 'C’est déjà la première section', last: 'C’est déjà la dernière section', opens: 'Cette diapositive ouvre déjà une section', fold: 'Replier la section', unfold: 'Déplier la section', newName: 'Nouvelle section', slides: n => `${n} diapositives`, in: name => `section « ${name} »` };

  // --- Les en-têtes de la bande.
  let items = await strip(app);
  let heads = headsOf(items);
  let rows = rowsOf(items);
  check(tag + 'la bande a deux en-têtes (« Milieu », « Fin »), chacun juste avant la première miniature de sa section ; aucun pour « Un » et « Deux », qui n\'ont pas de section',
    same(heads.map(h => h.name), ['Milieu', 'Fin']) && same(items.map(i => (i.head ? 'H' : i.row ? 'R' : '?')), ['R', 'R', 'H', 'R', 'R', 'H', 'R', 'R']), items.map(i => (i.head ? 'H:' + i.name : i.row ? 'R' : i.other)));
  check(tag + 'chaque en-tête dit son nombre de diapositives et se lit comme « ' + T.section('Milieu') + ', ' + T.slides(2) + ' » ; la flèche est dépliée',
    heads.every(h => h.count === '2' && h.expanded === 'true' && !h.folded && h.width > 80) && heads[0].label === T.section('Milieu') + ', ' + T.slides(2), heads.map(h => [h.count, h.label]));
  check(tag + 'le nom de chaque miniature dit sa section (« Trois » et « Quatre » : Milieu, « Cinq » et « Six » : Fin) et pas celui de « Un »',
    rows[2].label.includes(T.in('Milieu')) && rows[3].label.includes(T.in('Milieu')) && rows[4].label.includes(T.in('Fin')) && rows[5].label.includes(T.in('Fin')) && !/section/i.test(rows[0].label), rows.map(r => r.label));

  // --- Replier à la flèche : les miniatures se cachent, le texte ne bouge pas.
  const fold0 = await a.pointOf('.pp-slide-section-fold', 0);
  await a.click(fold0);
  items = await strip(app);
  rows = rowsOf(items);
  heads = headsOf(items);
  let d = await doc(app);
  check(tag + 'la flèche de « Milieu » replie la section : ses deux miniatures sont cachées, l\'en-tête garde son nombre et sa flèche se dit repliée ; le texte n\'a pas bougé',
    rows[2].hidden && rows[3].hidden && !rows[2].shown && !rows[3].shown && rows[4].shown && heads[0].folded && heads[0].expanded === 'false' && heads[0].count === '2' && same(d.order, NAMES) && same(d.names, START), { hidden: rows.map(r => r.hidden), folded: heads[0].folded, order: d.order });
  // Le clavier saute la section repliée.
  await app.evaluate(() => document.querySelectorAll('.pp-slide-item')[1].focus());
  await a.press('ArrowDown');
  items = await strip(app);
  rows = rowsOf(items);
  d = await doc(app);
  check(tag + '↓ depuis « Deux » saute la section repliée : le clavier et le curseur vont à « Cinq »', rows[4].focus && d.current === 4, { focus: rows.map(r => r.focus), current: d.current });
  await a.press('ArrowUp');
  d = await doc(app);
  check(tag + '↑ depuis « Cinq » revient à « Deux »', d.current === 1, d.current);
  // Le curseur qui arrive dans la section la déplie.
  await app.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.setTextSelection(SlideStrip.slidesOf(ed.state.doc)[3].nodes[0].pos + 2); });
  await sleep(400);
  items = await strip(app);
  heads = headsOf(items);
  check(tag + 'le curseur qui arrive dans « Quatre » déplie la section', !heads[0].folded && rowsOf(items)[3].shown, heads[0]);

  // --- Un clic sur le nom choisit les diapositives de la section.
  await a.click(await a.pointOf('.pp-slide-section-name', 1));
  items = await strip(app);
  d = await doc(app);
  check(tag + 'un clic sur le nom « Fin » choisit « Cinq » et « Six » (le curseur va à « Cinq »)', same(rowsOf(items).map(r => r.selected), [false, false, false, false, true, true]) && d.current === 4, { sel: rowsOf(items).map(r => r.selected), current: d.current });

  // --- Renommer sur place : Échap laisse, Entrée écrit, un Ctrl+Z défait.
  await a.dblclick(await a.pointOf('.pp-slide-section-name', 0));
  items = await strip(app);
  heads = headsOf(items);
  check(tag + 'un double-clic sur « Milieu » ouvre le champ du nom sur place, rempli du nom', heads[0].renaming && heads[0].input === 'Milieu', heads[0]);
  await page.keyboard.press('Control+a');
  await a.type('Zzz');
  await a.press('Escape', 400);
  items = await strip(app);
  d = await doc(app);
  check(tag + 'Échap laisse le nom comme il était', !headsOf(items)[0].renaming && headsOf(items)[0].name === 'Milieu' && same(d.names, START), { names: d.names });
  await a.dblclick(await a.pointOf('.pp-slide-section-name', 0));
  await page.keyboard.press('Control+a');
  await a.type('Offre');
  await a.press('Enter', 600);
  items = await strip(app);
  d = await doc(app);
  check(tag + 'Entrée écrit « Offre » dans le repère de « Trois » ; l\'en-tête et le nom des miniatures suivent', same(d.names, ['', '', 'Offre', '', 'Fin', '']) && headsOf(items)[0].name === 'Offre' && rowsOf(items)[3].label.includes(T.in('Offre')), { names: d.names });
  await sleep(700);
  await a.press('Control+z', 700);
  d = await doc(app);
  check(tag + 'un seul Ctrl+Z remet « Milieu »', same(d.names, START), d.names);

  // --- Le menu d'un en-tête (clic droit).
  await a.rightClick(await a.pointOf('.pp-slide-section-name', 1));
  let m = await menuOf(app);
  const row = action => (m ? m.rows.find(r => r.action === action) : null) || {};
  check(tag + 'un clic droit sur « Fin » ouvre le menu de la section : ' + T.section('Fin') + ', six lignes ; « Commencer une section ici » est grisée (« Cinq » en ouvre déjà une), « Descendre » aussi (la dernière)',
    !!m && m.label === T.section('Fin') && m.rows.length === 6 && row('sectionNew').disabled && row('sectionNew').title === T.opens && row('sectionDown').disabled && row('sectionDown').title === T.last
      && !row('sectionUp').disabled && !row('sectionRename').disabled && !row('sectionRemove').disabled && !row('sectionFold').disabled && row('sectionFold').text === T.fold, m);
  await a.click(await menuRow(app, 'sectionUp'), null, 800);
  d = await doc(app);
  items = await strip(app);
  check(tag + '« Monter la section » : « Fin » passe au-dessus de « Milieu » avec ses deux diapositives et son nom : Un Deux Cinq Six Trois Quatre',
    same(d.order, ['Un', 'Deux', 'Cinq', 'Six', 'Trois', 'Quatre']) && same(d.names, ['', '', 'Fin', '', 'Milieu', '']) && same(headsOf(items).map(h => h.name), ['Fin', 'Milieu']), { order: d.order, names: d.names });
  check(tag + 'les deux diapositives de la section qui a monté sont choisies, le curseur sur la première', same(rowsOf(items).map(r => r.selected), [false, false, true, true, false, false]) && d.current === 2, { sel: rowsOf(items).map(r => r.selected), current: d.current });
  await a.press('Control+z', 800);
  d = await doc(app);
  check(tag + 'un seul Ctrl+Z remet l\'ordre et les noms', same(d.order, NAMES) && same(d.names, START), { order: d.order, names: d.names });
  // La première section nommée ne passe pas au-dessus des diapositives sans section.
  await a.rightClick(await a.pointOf('.pp-slide-section-name', 0));
  m = await menuOf(app);
  check(tag + 'le menu de « Milieu » : « Monter la section » est grisée (« Un » et « Deux » n\'ont pas de section : rien ne passe au-dessus), « Descendre » est active',
    !!m && row('sectionUp').disabled && row('sectionUp').title === T.first && !row('sectionDown').disabled, m && m.rows.map(r => [r.action, r.disabled, r.title]));
  await a.click(await a.pointOf('.pp-slide-item', 0), null, 500);
  check(tag + 'un clic ailleurs referme le menu', (await menuOf(app)) === null);

  // --- « Section… » dans le menu d'une diapositive : « Commencer une section ici », renommée tout de suite.
  await a.rightClick(await a.pointOf('.pp-slide-item', 3));
  m = await menuOf(app);
  check(tag + 'le menu de « Quatre » a la ligne « Section… », active', !!m && m.label === T.menu(4) && !!row('section').text && !row('section').disabled, m && m.rows.map(r => r.action));
  await a.click(await menuRow(app, 'section'), null, 500);
  m = await menuOf(app);
  check(tag + 'elle ouvre le menu de la section de « Quatre » (' + T.section('Milieu') + ') au même endroit ; « Commencer une section ici » est active (« Quatre » n\'en ouvre pas)',
    !!m && m.label === T.section('Milieu') && m.rows.length === 6 && !row('sectionNew').disabled, m);
  await a.click(await menuRow(app, 'sectionNew'), null, 600);
  items = await strip(app);
  d = await doc(app);
  heads = headsOf(items);
  check(tag + '« Commencer une section ici » ouvre « ' + T.newName + ' » sur « Quatre » et son nom se change tout de suite sur place',
    same(d.names, ['', '', 'Milieu', T.newName, 'Fin', '']) && heads.length === 3 && heads[1].renaming && heads[1].input === T.newName, { names: d.names, heads: heads.map(h => [h.name, h.renaming]) });
  await page.keyboard.press('Control+a');
  await a.type('Annexes');
  await a.press('Enter', 600);
  d = await doc(app);
  check(tag + 'Entrée écrit « Annexes » : Milieu n\'a plus que « Trois »', same(d.names, ['', '', 'Milieu', 'Annexes', 'Fin', '']), d.names);
  await sleep(700);
  await a.press('Control+z', 700);
  await sleep(700);
  await a.press('Control+z', 700);
  d = await doc(app);
  check(tag + 'deux Ctrl+Z remettent les noms d\'avant', same(d.names, START), d.names);

  // --- « Retirer la section » : les diapositives restent, elles rejoignent la section d'avant (ici : aucune).
  await a.rightClick(await a.pointOf('.pp-slide-section-name', 0));
  await a.click(await menuRow(app, 'sectionRemove'), null, 700);
  d = await doc(app);
  items = await strip(app);
  check(tag + '« Retirer la section » sur « Milieu » : ses diapositives restent, elles rejoignent le début ; il ne reste que « Fin »', same(d.order, NAMES) && same(d.names, ['', '', '', '', 'Fin', '']) && same(headsOf(items).map(h => h.name), ['Fin']), { names: d.names });
  await a.press('Control+z', 800);
  d = await doc(app);
  check(tag + 'un seul Ctrl+Z la rend', same(d.names, START), d.names);

  // --- Glisser sous le titre d'une section l'ouvre ; au-dessus du titre, elle finit la section d'avant.
  // L'en-tête « Fin » au milieu de la liste, loin de ses bords (près d'eux, elle défilerait sous la souris).
  const centerHead = async () => { await app.evaluate(() => document.querySelectorAll('.pp-slide-section')[1].scrollIntoView({ block: 'center' })); await sleep(200); };
  const dropAt = async (headIndex, where) => app.evaluate(([k, w]) => {
    const h = document.querySelectorAll('.pp-slide-section')[k].getBoundingClientRect();
    return { x: h.left + h.width / 2, y: w === 'below' ? h.top + h.height * 0.75 : h.top + h.height * 0.25 };
  }, [headIndex, where]);
  await centerHead();
  await a.down(await a.pointOf('.pp-slide-item', 3));
  await a.moveTo(await dropAt(1, 'below'), 10);
  let lineNext = await app.evaluate(() => { const l = document.querySelector('.pp-slide-drop'); return l && !l.hidden ? l.offsetTop : null; });
  const headBottom = await app.evaluate(() => { const l = document.querySelector('.pp-slide-list'); const h = document.querySelectorAll('.pp-slide-section')[1]; return h.offsetTop + h.offsetHeight; });
  const headTop = await app.evaluate(() => document.querySelectorAll('.pp-slide-section')[1].offsetTop);
  check(tag + 'glisser « Quatre » sous le titre « Fin » : la ligne d\'accent est SOUS le titre', lineNext !== null && lineNext >= headBottom - 6, { lineNext, headBottom });
  await a.up(900);
  d = await doc(app);
  check(tag + 'lâchée là, « Quatre » ouvre « Fin » : le nom passe sur elle, l\'ordre ne change pas (Milieu n\'a plus que « Trois »)', same(d.order, NAMES) && same(d.names, ['', '', 'Milieu', 'Fin', '', '']), { order: d.order, names: d.names });
  await a.press('Control+z', 800);
  d = await doc(app);
  check(tag + 'un seul Ctrl+Z la remet à la fin de « Milieu »', same(d.names, START), d.names);
  await centerHead();
  await a.down(await a.pointOf('.pp-slide-item', 4));
  await a.moveTo(await dropAt(1, 'above'), 10);
  const lineAbove = await app.evaluate(() => { const l = document.querySelector('.pp-slide-drop'); return l && !l.hidden ? l.offsetTop : null; });
  check(tag + 'glisser « Cinq » (qui ouvre « Fin ») au-dessus du titre : la ligne d\'accent est AU-DESSUS du titre', lineAbove !== null && lineAbove <= headTop + 2, { lineAbove, headTop });
  await a.up(900);
  d = await doc(app);
  check(tag + 'lâchée là, « Cinq » finit « Milieu » : « Fin » ne garde que « Six » et son nom passe sur elle', same(d.order, NAMES) && same(d.names, ['', '', 'Milieu', '', '', 'Fin']), { names: d.names });
  await a.press('Control+z', 800);
  d = await doc(app);
  check(tag + 'un seul Ctrl+Z la remet', same(d.names, START), d.names);
  await centerHead();
  await a.down(await a.pointOf('.pp-slide-item', 3));
  await a.moveTo(await dropAt(1, 'above'), 10);
  const noLine = await app.evaluate(() => { const l = document.querySelector('.pp-slide-drop'); return !l || l.hidden; });
  await a.press('Escape', 300);
  await a.up(500);
  d = await doc(app);
  check(tag + '« Quatre », déjà la dernière de « Milieu », déposée au-dessus du titre « Fin » : rien ne bougerait, pas de ligne', noLine && same(d.names, START) && same(d.order, NAMES), { noLine, names: d.names });

  // --- La vue d'ensemble : mêmes sections, même pli.
  await app.evaluate(() => document.querySelectorAll('.pp-slide-actions .pp-slide-add')[2].focus());
  await a.press('Enter', 800);
  let g = await grid(app);
  let cards = g ? cardsOf(g) : [];
  check(tag + 'la grille a deux en-têtes pleine largeur (« Milieu », « Fin »), chacun juste avant la première carte de sa section',
    !!g && same(g.items.map(i => (i.head ? 'H' : i.card ? 'C' : '?')), ['C', 'C', 'H', 'C', 'C', 'H', 'C', 'C']) && g.items.filter(i => i.head).every(h => h.width > g.box.width * 0.8) && same(g.items.filter(i => i.head).map(h => h.name), ['Milieu', 'Fin']), g && g.items.map(i => (i.head ? 'H:' + i.name : i.card ? 'C' : i.other)));
  const gridTitles = g.items.filter(i => i.head);
  check(tag + 'chaque en-tête de la grille est sur sa rangée : « Milieu » sous « Un » et « Deux », les cartes de « Milieu » sous lui',
    gridTitles[0].top >= cards[1].top + cards[1].height - 1 && cards[2].top >= gridTitles[0].bottom - 1 && gridTitles[1].top >= cards[3].top + cards[3].height - 1 && cards[4].top >= gridTitles[1].bottom - 1,
    { heads: gridTitles.map(h => [h.top, h.bottom]), cards: cards.map(c => [c.top, c.height]) });
  check(tag + 'les cartes disent leur section (« Trois » : Milieu)', cards[2].label.includes(T.in('Milieu')) && cards[4].label.includes(T.in('Fin')), cards.map(c => c.label));
  // Replier dans la grille : la bande suit.
  await a.click(await a.pointOf('.pp-overview .pp-slide-section-fold', 0));
  g = await grid(app);
  cards = cardsOf(g);
  items = await strip(app);
  check(tag + 'la flèche de « Milieu » dans la grille cache ses deux cartes ; la bande les cache aussi (le pli est partagé)', cards[2].hidden && cards[3].hidden && !cards[2].shown && cards[4].shown && g.items.find(i => i.head).folded && rowsOf(items)[2].hidden && rowsOf(items)[3].hidden, { grid: cards.map(c => c.hidden), strip: rowsOf(items).map(r => r.hidden) });
  await app.evaluate(() => document.querySelectorAll('.pp-ov-card')[1].focus());
  await a.press('ArrowRight');
  g = await grid(app);
  check(tag + '→ depuis « Deux » saute la section repliée : « Cinq »', cardsOf(g)[4].focus, cardsOf(g).map(c => c.focus));
  await a.press('ArrowLeft');
  g = await grid(app);
  check(tag + '← revient à « Deux »', cardsOf(g)[1].focus, cardsOf(g).map(c => c.focus));
  await a.press('End');
  g = await grid(app);
  check(tag + 'Fin va à la dernière carte visible', cardsOf(g)[5].focus);
  await a.press('ArrowUp');
  g = await grid(app);
  check(tag + '↑ depuis « Six » monte à la rangée d\'au-dessus, la plus proche en largeur : « Un » ou « Deux » (la section repliée n\'a pas de place)', cardsOf(g)[0].focus || cardsOf(g)[1].focus, cardsOf(g).map(c => c.focus));
  await a.click(await a.pointOf('.pp-overview .pp-slide-section-fold', 0));
  g = await grid(app);
  cards = cardsOf(g);
  check(tag + 'la flèche une seconde fois déplie : les quatre cartes sont à leur place', cards.every(c => c.shown) && !g.items.find(i => i.head).folded, cards.map(c => c.shown));
  // Renommer dans la grille ; Échap dans le champ ne ferme pas la grille.
  await a.dblclick(await a.pointOf('.pp-overview .pp-slide-section-name', 1));
  g = await grid(app);
  check(tag + 'un double-clic sur « Fin » dans la grille ouvre le champ du nom', g.items.filter(i => i.head)[1].renaming, g.items.filter(i => i.head).map(h => h.renaming));
  await a.press('Escape', 400);
  g = await grid(app);
  check(tag + 'Échap dans le champ ne le garde pas et ne ferme pas la grille', !!g && !g.items.filter(i => i.head)[1].renaming, g && g.items.filter(i => i.head).map(h => h.renaming));
  await a.dblclick(await a.pointOf('.pp-overview .pp-slide-section-name', 1));
  await page.keyboard.press('Control+a');
  await a.type('Fin de série');
  await a.press('Enter', 700);
  g = await grid(app);
  d = await doc(app);
  check(tag + 'Entrée l\'écrit : « Fin de série », dans la grille et dans le texte, la grille reste ouverte', !!g && g.items.filter(i => i.head)[1].name === 'Fin de série' && same(d.names, ['', '', 'Milieu', '', 'Fin de série', '']), { names: d.names });
  await sleep(700);
  await a.press('Control+z', 800);
  d = await doc(app);
  check(tag + 'un Ctrl+Z (la grille a le clavier) remet « Fin »', same(d.names, START), d.names);
  // Le menu d'une section depuis la grille, devant elle.
  await a.rightClick(await a.pointOf('.pp-overview .pp-slide-section-name', 0));
  m = await menuOf(app);
  const front = await app.evaluate(() => { const p = document.querySelector('.pp-slide-menu.visible'); const r = p.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + 8); return !!top && !!top.closest('.pp-slide-menu'); });
  check(tag + 'un clic droit sur un en-tête de la grille ouvre le menu de sa section, devant la grille', !!m && m.label === T.section('Milieu') && front, { label: m && m.label, front });
  await a.click(await menuRow(app, 'sectionDown'), null, 900);
  d = await doc(app);
  g = await grid(app);
  check(tag + '« Descendre la section » depuis la grille : Un Deux Cinq Six Trois Quatre, la grille à jour et ouverte', same(d.order, ['Un', 'Deux', 'Cinq', 'Six', 'Trois', 'Quatre']) && same(d.names, ['', '', 'Fin', '', 'Milieu', '']) && !!g && g.items.filter(i => i.head)[0].name === 'Fin', { order: d.order, names: d.names });
  await a.press('Control+z', 800);
  d = await doc(app);
  check(tag + 'un seul Ctrl+Z la remet', same(d.order, NAMES) && same(d.names, START), { order: d.order, names: d.names });
  // Glisser une carte à gauche de la première carte d'une section : elle l'ouvre.
  for (let k = 0; k < 2; k += 1) await a.click(await a.pointOf('.pp-ov-size', 0), null, 250);
  await app.evaluate(() => document.querySelectorAll('.pp-ov-card')[3].scrollIntoView({ block: 'nearest' }));
  await sleep(300);
  await a.down(await a.pointOf('.pp-ov-thumb', 3));
  await a.moveTo(await a.pointOf('.pp-ov-thumb', 4, 'left'), 10);
  const dropShown = await app.evaluate(() => { const l = document.querySelector('.pp-ov-drop'); return !!l && !l.hidden; });
  await a.up(900);
  d = await doc(app);
  check(tag + 'glisser « Quatre » à gauche de « Cinq » dans la grille : la ligne se montre, « Quatre » ouvre « Fin »', dropShown && same(d.names, ['', '', 'Milieu', 'Fin', '', '']) && same(d.order, NAMES), { dropShown, names: d.names });
  await a.press('Control+z', 800);
  d = await doc(app);
  check(tag + 'un seul Ctrl+Z la remet', same(d.names, START), d.names);
  await a.press('Escape', 500);
  g = await grid(app);
  check(tag + 'Échap referme la grille', g === null);

  // --- L'extension éteinte : replier reste possible (il ne change pas le texte), le reste est grisé avec sa raison.
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await app.waitForFunction(() => { const b = document.querySelector('.pp-slide-add'); return !!b && b.getAttribute('aria-disabled') === 'true'; }, null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  await a.rightClick(await a.pointOf('.pp-slide-section-name', 0));
  m = await menuOf(app);
  check(tag + 'extension éteinte : « Replier la section » reste active, « Renommer », « Monter », « Descendre » et « Retirer » sont grisées avec la raison',
    !!m && !row('sectionFold').disabled && row('sectionRename').disabled && row('sectionUp').disabled && row('sectionDown').disabled && row('sectionRemove').disabled && row('sectionRename').title.length > 0, m && m.rows.map(r => [r.action, r.disabled]));
  await a.click(await menuRow(app, 'sectionFold'), null, 500);
  items = await strip(app);
  check(tag + 'et replier fonctionne : « Milieu » est repliée', headsOf(items)[0].folded && rowsOf(items)[2].hidden, headsOf(items)[0]);
  await a.click(await a.pointOf('.pp-slide-section-fold', 0));
  await page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);
  await sleep(500);

  // --- « Aller à… » du diaporama groupe les diapositives par section.
  const picker = await app.evaluate(() => {
    const slides = SlideShow.speakerSlides();
    const labels = { untitled: 'Diapositive {n}', hiddenSlide: 'masquée' };
    const select = SlideSpeaker.goToSelect(slides, labels);
    return {
      slides: slides.map(s => [s.title, s.section, s.sectionAt]),
      top: Array.from(select.children).map(child => (child.tagName === 'OPTGROUP' ? { group: child.label, options: Array.from(child.children).map(o => o.textContent) } : { option: child.textContent })),
      values: Array.from(select.querySelectorAll('option')).map(o => o.value),
    };
  });
  check(tag + '« Aller à… » du diaporama : les deux diapositives sans section d\'abord (sans intitulé), puis un groupe « Milieu » (3, 4) et un groupe « Fin » (5, 6), les rangs gardés',
    same(picker.top, [{ option: '1. Un' }, { option: '2. Deux' }, { group: 'Milieu', options: ['3. Trois', '4. Quatre'] }, { group: 'Fin', options: ['5. Cinq', '6. Six'] }]) && same(picker.values, ['0', '1', '2', '3', '4', '5']), picker);
  const twin = await app.evaluate(() => {
    const labels = { untitled: 'Diapositive {n}', hiddenSlide: 'masquée' };
    const select = SlideSpeaker.goToSelect([{ title: 'a', section: 'X', sectionAt: 1 }, { title: 'b', section: 'X', sectionAt: 2 }, { title: 'c', section: '', sectionAt: -1, hidden: true }], labels);
    return Array.from(select.children).map(child => (child.tagName === 'OPTGROUP' ? child.label + ':' + child.children.length : child.textContent));
  });
  check(tag + 'deux sections de même nom qui se suivent font deux groupes ; une diapositive masquée sans section reste hors groupe, marquée', same(twin, ['X:1', 'X:1', '3. c (masquée)']), twin);

  check(tag + 'aucune boîte native du navigateur', A.natives.length === 0, A.natives);
  await A.context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
