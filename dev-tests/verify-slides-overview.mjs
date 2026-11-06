#!/usr/bin/env node
// La vue d'ensemble des diapositives (extensions/diapositives/slide-overview.js, slide-overview.css, le bouton « Vue d'ensemble » du bas de la bande dans slide-strip.js : overview, guest ; demande du 06/11,
// carte « Plein cadre par-dessus le texte »), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS comme pour de vrai : l'app dans le cadre isolé de GFS,
// l'extension « diapositives » active, « Six » à l'écran (six diapositives ; la deuxième a des notes et une transition, la troisième est masquée).
//  OUVRIR : le troisième bouton carré de la bande (jamais grisé) ouvre la grille par-dessus tout le cadre, barre d'outils comprise ; elle se dit boîte de dialogue modale, sa liste à choix multiple, le nombre
//   de diapositives en tête, une carte par diapositive (numéro, nom accessible, pastilles de la bande, miniature copiée au rendu de l'éditeur) ; la diapositive du curseur est choisie et a le clavier.
//  ALLER : un clic choisit (le curseur du document y va, la grille reste), Ctrl+clic ajoute ou retire, Maj+clic étend ; un double-clic ou Entrée ouvre la diapositive et ferme la grille, le curseur au début
//   de son texte ; Échap défait d'abord le choix, puis ferme et rend le clavier au bouton.
//  AU CLAVIER : ← → ↑ ↓, Début, Fin ; Maj+flèches étendent ; Ctrl+A choisit tout.
//  LES GESTES DE LA BANDE : Ctrl+→ descend, Ctrl+← monte, Suppr efface (le choix entier), le menu ⋯ (clic droit ou bouton) a les mêmes lignes et les mêmes raisons de grisé, « Dupliquer » ; un seul
//   Ctrl+Z défait chaque geste, depuis la grille.
//  GLISSER : une miniature (ou tout le choix) emportée par la souris, une ligne d'accent dit où elle se posera, la lâcher la déplace en une transaction, Échap pendant le glisser n'écrit rien.
//  TAILLE : plus petites / plus grandes (cinq tailles, grisé aux bouts). L'extension éteinte : la grille se lit, Suppr explique et n'efface rien.
// Lancé par run-headless.mjs (groupe Node "slidesOverview", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slides-overview.mjs
import { start, seedModels, HEIGHT } from './gfs-page.mjs';

const t = await start({ name: 'verify-slides-overview', port: Number(process.env.SLIDES_OVERVIEW_PORT || 9201) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];

const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const NAMES = ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six'];
const NOTES = '<div class="pp-slide-props" contenteditable="false" data-trans="fade" data-trans-from="r" data-trans-dur="700" data-notes="Saluer la salle."></div>';
const HIDDEN = '<div class="pp-slide-props" contenteditable="false" data-hidden="1"></div>';
const BODY = NAMES.map((name, i) => (i === 1 ? NOTES : i === 2 ? HIDDEN : '') + `<h2>${name}</h2><p>Texte de ${name.toLowerCase()}</p>`).join(BR);
const SEED = seedModels({ record: { id: 1, Nom: 'Alice', Statut: 'Urgent' } }) + `
  add(9, 'Six', ${JSON.stringify(BODY)}, false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 11;
`;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const gfsCalls = (page, nom) => page.evaluate(n => window.__gfsStub.calls.filter(c => c.nom === n).map(c => c.args), nom);

// L'ordre des diapositives (le titre de chacune), le curseur, le choix de la bande, le clavier du document.
const doc = app => app.evaluate(() => {
  const d = EditorCore.getEditor().state.doc;
  const order = SlideStrip.slidesOf(d).map(s => s.nodes.map(e => e.node.textContent).join(' ').trim().split('Texte')[0].trim());
  const items = Array.from(document.querySelectorAll('.pp-slide-strip .pp-slide-item'));
  const active = document.activeElement;
  return {
    order, current: items.findIndex(i => i.tabIndex === 0),
    stripSelected: items.map((item, i) => (item.getAttribute('aria-selected') === 'true' ? i : -1)).filter(i => i >= 0),
    editorFocus: !!active && !!active.closest('.tiptap'),
    status: document.getElementById('status-msg').textContent,
  };
});
// La vue d'ensemble : null quand elle est fermée.
const ov = app => app.evaluate(() => {
  const root = document.querySelector('.pp-overview');
  if (!root || root.hidden) return null;
  const rect = (node) => { if (!node) return null; const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const cards = Array.from(root.querySelectorAll('.pp-ov-card'));
  const grid = root.querySelector('.pp-ov-grid');
  const active = document.activeElement;
  const drop = root.querySelector('.pp-ov-drop');
  const ghost = document.querySelector('.pp-slide-ghost');
  const buttons = Array.from(root.querySelectorAll('.pp-ov-size'));
  return {
    box: rect(root), role: root.getAttribute('role'), modal: root.getAttribute('aria-modal'), listbox: grid.getAttribute('role'), multi: grid.getAttribute('aria-multiselectable'),
    count: root.querySelector('.pp-ov-count').textContent, title: root.querySelector('.pp-ov-title').textContent,
    cards: cards.map(c => ({
      n: c.querySelector('.pp-ov-num').textContent, selected: c.getAttribute('aria-selected') === 'true', label: c.getAttribute('aria-label'), tab: c.tabIndex,
      text: c.querySelector('.pp-slide-page').textContent.replace(/\s+/g, ' ').trim(), drawn: c.querySelector('.pp-slide-page').childElementCount > 0, hidden: c.classList.contains('pp-slide-is-hidden'),
      badges: Array.from(c.querySelectorAll('.pp-ov-badges > *')).map(b => b.className), thumb: rect(c.querySelector('.pp-ov-thumb')), card: rect(c), current: c.classList.contains('pp-ov-current'),
    })),
    focus: active ? (active.classList && active.classList.contains('pp-ov-card') ? 'card' + cards.indexOf(active) : (active.className || active.tagName)) : '',
    drop: drop && !drop.hidden ? rect(drop) : null, ghost: ghost ? rect(ghost) : null, sources: cards.map((c, i) => (c.classList.contains('pp-ov-drag-source') ? i : -1)).filter(i => i >= 0),
    smaller: buttons[0].getAttribute('aria-disabled'), larger: buttons[1].getAttribute('aria-disabled'), closeText: root.querySelector('.pp-ov-close').textContent,
    scroll: grid.scrollTop, gridRect: rect(grid), scrollHeight: grid.scrollHeight, columns: (() => { const top = cards[0] && cards[0].offsetTop; const n = cards.findIndex(c => c.offsetTop !== top); return n < 0 ? cards.length : n; })(),
  };
});
const stripButtons = app => app.evaluate(() => {
  const strip = document.querySelector('.pp-slide-strip').getBoundingClientRect();
  return Array.from(document.querySelectorAll('.pp-slide-actions .pp-slide-add')).map((b) => { const r = b.getBoundingClientRect(); return { label: b.getAttribute('aria-label'), disabled: b.getAttribute('aria-disabled'), expanded: b.getAttribute('aria-expanded'), inside: r.left >= strip.left && r.right <= strip.right, left: r.left, top: r.top, width: r.width, height: r.height }; });
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
  const centerOf = (selector, i = 0) => app.evaluate(([sel, k]) => { const r = document.querySelectorAll(sel)[k].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [selector, i]);
  const cardCenter = i => centerOf('.pp-overview .pp-ov-thumb', i);
  let at = null;
  const moveTo = async (c, steps = 6) => { at = await inPage(c); await page.mouse.move(at.x, at.y, { steps }); await sleep(100); };
  const click = async (c, modifier, settle = 350) => {
    if (modifier) await page.keyboard.down(modifier);
    const p = await inPage(c);
    await page.mouse.move(p.x - 6, p.y, { steps: 2 });
    await page.mouse.move(p.x, p.y, { steps: 2 });
    await page.mouse.click(p.x, p.y);
    if (modifier) await page.keyboard.up(modifier);
    await sleep(settle);
  };
  const dblclick = async (c) => { const p = await inPage(c); await page.mouse.move(p.x, p.y, { steps: 3 }); await page.mouse.dblclick(p.x, p.y); await sleep(500); };
  const rightClick = async (c) => { const p = await inPage(c); await page.mouse.move(p.x, p.y, { steps: 2 }); await page.mouse.click(p.x, p.y, { button: 'right' }); await sleep(300); };
  const down = async (c) => { at = await inPage(c); await page.mouse.move(at.x - 6, at.y); await page.mouse.move(at.x, at.y, { steps: 2 }); await sleep(60); await page.mouse.down(); await sleep(60); };
  const up = async (settle = 600) => { await page.mouse.up(); await sleep(settle); };
  const press = async (key, settle = 300) => { await page.keyboard.press(key); await sleep(settle); };
  return { click, dblclick, rightClick, down, up, moveTo, press, centerOf, cardCenter };
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
  const A = await t.openPage({ hosted: true, framed: true, stub: { extensions: ACTIVE, langue: lang }, seed: SEED, lang, colorScheme, height: HEIGHT });
  const { page, app } = A;
  const a = toolsOf(A);
  await open(A, 9, NAMES.length);
  await app.evaluate(() => { document.querySelector('.pp-slide-list').scrollTop = 0; EditorCore.getEditor().commands.focus('start'); });
  await sleep(300);

  // --- Le bouton « Vue d'ensemble » : le troisième de la rangée, dans la bande, jamais grisé.
  let buttons = await stripButtons(app);
  const tip = en ? 'Slide overview' : 'Vue d’ensemble des diapositives';
  check(tag + 'la bande a trois boutons carrés sur une ligne, tous dans sa largeur ; le troisième est « Vue d’ensemble », pas grisé',
    buttons.length === 3 && buttons.every(b => b.inside && b.width === 30 && b.height === 30 && b.top === buttons[0].top) && buttons[2].label === tip && buttons[2].disabled === null && buttons[2].expanded === 'false', buttons);

  // --- Ouvrir à la souris.
  await a.click(await a.centerOf('.pp-slide-actions .pp-slide-add', 2), null, 700);
  let o = await ov(app);
  check(tag + 'un clic ouvre la grille par-dessus tout le cadre (barre d’outils comprise), boîte de dialogue modale, liste à choix multiple, son titre et le nombre de diapositives',
    !!o && Math.abs(o.box.width - 700) < 2 && Math.abs(o.box.height - HEIGHT) < 2 && o.role === 'dialog' && o.modal === 'true' && o.listbox === 'listbox' && o.multi === 'true'
      && o.title === (en ? 'Overview' : 'Vue d’ensemble') && o.count === (en ? '6 slides' : '6 diapositives'), o && { box: o.box, role: o.role, modal: o.modal, title: o.title, count: o.count });
  check(tag + 'le bouton se dit ouvert (aria-expanded)', (await stripButtons(app))[2].expanded === 'true');
  const covered = await app.evaluate(() => { const bar = document.getElementById('v2-toolbar') || document.querySelector('.bar-row'); if (!bar) return null; const r = bar.getBoundingClientRect(); const top = document.elementFromPoint(r.left + 20, r.top + 6); return !!top && !!top.closest('.pp-overview'); });
  check(tag + 'la barre d’outils du widget est recouverte', covered === true || covered === null, covered);
  check(tag + 'six cartes numérotées de 1 à 6, une miniature copiée par carte avec le texte de sa diapositive',
    o.cards.length === 6 && o.cards.every((c, i) => c.n === String(i + 1) && c.drawn && c.text.startsWith(NAMES[i])), o.cards.map(c => [c.n, c.drawn, c.text]));
  check(tag + 'la miniature a la largeur choisie (150 px) et la hauteur d’une page 16:9', o.cards.every(c => Math.abs(c.thumb.width - 150) < 1 && Math.abs(c.thumb.height - 84.4) < 2), o.cards.map(c => [c.thumb.width, c.thumb.height]));
  check(tag + 'la diapositive du curseur est choisie et a le clavier ; la carte du curseur est seule dans l’ordre de Tab', same(o.cards.map(c => c.selected), [true, false, false, false, false, false]) && o.focus === 'card0' && same(o.cards.map(c => c.tab), [0, -1, -1, -1, -1, -1]), { sel: o.cards.map(c => c.selected), focus: o.focus });
  const stripLabels = await app.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-strip .pp-slide-item')).map(i => i.getAttribute('aria-label')));
  check(tag + 'chaque carte reprend le nom accessible de sa miniature dans la bande ; « Deux » dit ses notes et sa transition, « Trois » qu’elle est masquée',
    same(o.cards.map(c => c.label), stripLabels) && /Saluer la salle/.test(o.cards[1].label) && o.cards[1].badges.length === 2 && o.cards[2].hidden && o.cards[2].badges.length === 1 && o.cards[0].badges.length === 0,
    { labels: o.cards.map(c => c.label), badges: o.cards.map(c => c.badges), hidden: o.cards.map(c => c.hidden) });

  // --- Un clic choisit, la grille reste ouverte ; Ctrl+clic ajoute ; Maj+clic étend.
  await a.click(await a.cardCenter(2));
  o = await ov(app);
  let d = await doc(app);
  check(tag + 'un clic sur la troisième la choisit, le curseur du document y va, la grille reste ouverte avec le clavier sur elle', !!o && same(o.cards.map(c => c.selected), [false, false, true, false, false, false]) && d.current === 2 && o.focus === 'card2', { sel: o && o.cards.map(c => c.selected), cur: d.current, focus: o && o.focus });
  await a.click(await a.cardCenter(4), 'Control');
  o = await ov(app);
  check(tag + 'Ctrl+clic sur la cinquième l’ajoute au choix', same(o.cards.map((c, i) => (c.selected ? i : -1)).filter(i => i >= 0), [2, 4]), o.cards.map(c => c.selected));
  await a.click(await a.cardCenter(0));
  await a.click(await a.cardCenter(3), 'Shift');
  o = await ov(app);
  check(tag + 'Maj+clic sur la quatrième après un clic sur la première : les quatre premières sont choisies', same(o.cards.map((c, i) => (c.selected ? i : -1)).filter(i => i >= 0), [0, 1, 2, 3]), o.cards.map(c => c.selected));
  await a.press('Escape', 300);
  o = await ov(app);
  check(tag + 'Échap défait d’abord le choix, la grille reste ouverte', !!o && o.cards.filter(c => c.selected).length === 1, o && o.cards.map(c => c.selected));

  // --- Double-clic : la diapositive s'ouvre, la grille se ferme.
  await a.dblclick(await a.cardCenter(3));
  o = await ov(app);
  d = await doc(app);
  check(tag + 'un double-clic sur la quatrième ferme la grille ; le curseur et le clavier sont dans le texte de la quatrième', o === null && d.current === 3 && d.editorFocus, { open: !!o, current: d.current, editorFocus: d.editorFocus });
  check(tag + 'le bouton ne se dit plus ouvert', (await stripButtons(app))[2].expanded === 'false');

  // --- Au clavier : le bouton, Entrée, les flèches.
  await app.evaluate(() => document.querySelectorAll('.pp-slide-actions .pp-slide-add')[2].focus());
  await a.press('Enter', 700);
  o = await ov(app);
  check(tag + 'Entrée sur le bouton ouvre la grille, le clavier sur la carte du curseur (la quatrième)', !!o && o.focus === 'card3', o && o.focus);
  const columns = o.columns;
  check(tag + 'la grille a plusieurs colonnes à 700 px de large', columns >= 2 && columns <= 6, columns);
  await a.press('ArrowRight');
  o = await ov(app);
  d = await doc(app);
  check(tag + '→ passe à la cinquième : choisie, le clavier dessus, le curseur du document avec elle', o.focus === 'card4' && same(o.cards.map(c => c.selected), [false, false, false, false, true, false]) && d.current === 4, { focus: o.focus, current: d.current });
  await a.press('Home');
  o = await ov(app);
  check(tag + 'Début va à la première', o.focus === 'card0', o.focus);
  await a.press('ArrowDown');
  o = await ov(app);
  check(tag + '↓ saute une rangée (' + columns + ' cartes) ou va à la dernière', o.focus === 'card' + Math.min(columns, 5), o.focus);
  await a.press('End');
  o = await ov(app);
  check(tag + 'Fin va à la dernière', o.focus === 'card5', o.focus);
  await a.press('Shift+ArrowLeft');
  await a.press('Shift+ArrowLeft');
  o = await ov(app);
  check(tag + 'Maj+← deux fois étend le choix à trois cartes', same(o.cards.map((c, i) => (c.selected ? i : -1)).filter(i => i >= 0), [3, 4, 5]), o.cards.map(c => c.selected));
  await a.press('Control+a');
  o = await ov(app);
  check(tag + 'Ctrl+A choisit les six', o.cards.every(c => c.selected));
  await a.press('Escape');
  await a.press('Home');

  // --- Les gestes : Ctrl+→ descend, un Ctrl+Z.
  await a.press('Control+ArrowRight', 700);
  o = await ov(app);
  d = await doc(app);
  check(tag + 'Ctrl+→ sur la première la descend d’une place : « Deux » puis « Un », la grille à jour, le clavier suit « Un » sur la deuxième carte, une transaction',
    same(d.order, ['Deux', 'Un', 'Trois', 'Quatre', 'Cinq', 'Six']) && o.focus === 'card1' && o.cards[0].text.startsWith('Deux') && o.cards[1].text.startsWith('Un'), { order: d.order, focus: o.focus, texts: o.cards.map(c => c.text.slice(0, 5)) });
  check(tag + 'les pastilles suivent leur diapositive : les notes de « Deux » sont sur la première carte', /Saluer la salle/.test(o.cards[0].label) && o.cards[0].badges.length === 2 && o.cards[1].badges.length === 0, o.cards.map(c => c.badges.length));
  await a.press('Control+z', 700);
  o = await ov(app);
  d = await doc(app);
  check(tag + 'un seul Ctrl+Z depuis la grille remet l’ordre', same(d.order, NAMES) && !!o && o.cards[0].text.startsWith('Un') && /Saluer/.test(o.cards[1].label), { order: d.order });
  await a.press('Control+ArrowLeft', 500);
  d = await doc(app);
  check(tag + 'Ctrl+← sur la première ne fait rien (déjà en haut)', same(d.order, NAMES), d.order);

  // --- Le menu ⋯ : mêmes lignes que la bande, mêmes raisons de grisé.
  await a.rightClick(await a.cardCenter(0));
  let m = await menuOf(app);
  const row = action => (m ? m.rows.find(r => r.action === action) : null) || {};
  check(tag + 'un clic droit sur la première ouvre le menu de la bande : « Diapositive 1 », « Monter » grisé avec sa raison, « Descendre » actif',
    !!m && m.label === (en ? 'Slide 1' : 'Diapositive 1') && m.rows.length >= 8 && row('moveUp').disabled && row('moveUp').title === (en ? 'This is already the first slide' : 'C’est déjà la première diapositive') && !row('moveDown').disabled, m);
  const menuAbove = await app.evaluate(() => { const p = document.querySelector('.pp-slide-menu.visible'); const r = p.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + 8); return !!top && !!top.closest('.pp-slide-menu'); });
  check(tag + 'le menu est devant la grille', menuAbove);
  await a.click(await menuRow(app, 'duplicate'));
  o = await ov(app);
  d = await doc(app);
  check(tag + '« Dupliquer » : la copie arrive après la première, la grille a sept cartes, la copie est choisie et a le clavier',
    same(d.order, ['Un', 'Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six']) && o.cards.length === 7 && o.count === (en ? '7 slides' : '7 diapositives') && o.cards[1].selected && o.focus === 'card1', { order: d.order, count: o.count, focus: o.focus });
  await a.press('Control+z', 700);
  o = await ov(app);
  check(tag + 'un seul Ctrl+Z retire la copie, la grille revient à six cartes', !!o && o.cards.length === 6, o && o.cards.length);
  // Le bouton ⋯ au survol.
  await a.moveTo(await a.cardCenter(2));
  const more = await app.evaluate(() => { const c = document.querySelectorAll('.pp-ov-card')[2]; const r = c.querySelector('.pp-ov-more').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const moreShown = await app.evaluate(() => getComputedStyle(document.querySelectorAll('.pp-ov-card')[2].querySelector('.pp-ov-more')).display);
  check(tag + 'le bouton ⋯ se montre au survol d’une carte', moreShown !== 'none', moreShown);
  await a.click(more);
  m = await menuOf(app);
  check(tag + 'le bouton ⋯ ouvre le menu de la troisième ; un second clic le referme', !!m && m.label === (en ? 'Slide 3' : 'Diapositive 3'), m);
  await a.click(more);
  check(tag + 'le second clic referme le menu', (await menuOf(app)) === null);

  // --- Supprimer : Suppr sur un choix de deux, un Ctrl+Z.
  await a.click(await a.cardCenter(1));
  await a.click(await a.cardCenter(3), 'Control');
  await a.press('Delete', 700);
  o = await ov(app);
  d = await doc(app);
  check(tag + 'Suppr efface les deux diapositives choisies d’un coup : « Deux » et « Quatre » partent, quatre cartes', same(d.order, ['Un', 'Trois', 'Cinq', 'Six']) && o.cards.length === 4 && o.count === (en ? '4 slides' : '4 diapositives'), { order: d.order, count: o.count });
  await a.press('Control+z', 700);
  d = await doc(app);
  o = await ov(app);
  check(tag + 'un seul Ctrl+Z les remet', same(d.order, NAMES) && o.cards.length === 6, d.order);

  // --- Glisser : la première après la quatrième.
  await a.click(await a.cardCenter(0));
  const target = await app.evaluate(() => { const c = document.querySelectorAll('.pp-ov-card')[3].getBoundingClientRect(); return { x: c.right - 8, y: c.top + c.height / 3 }; });
  await a.down(await a.cardCenter(0));
  await a.moveTo(target, 10);
  o = await ov(app);
  check(tag + 'glisser la première : elle s’estompe, sa copie suit la souris, une ligne d’accent dit où elle se posera (après la quatrième)', !!o && same(o.sources, [0]) && !!o.ghost && !!o.drop && o.drop.height > 40, o && { sources: o.sources, ghost: !!o.ghost, drop: o.drop });
  await a.press('Escape', 300);
  o = await ov(app);
  check(tag + 'Échap pendant le glisser : la miniature revient, la ligne et la copie s’effacent, la grille reste ouverte', !!o && o.sources.length === 0 && !o.ghost && !o.drop, o && { sources: o.sources, ghost: !!o.ghost, drop: o.drop });
  await a.up(500);
  d = await doc(app);
  check(tag + 'et le relâchement qui suit n’écrit rien', same(d.order, NAMES), d.order);
  await a.down(await a.cardCenter(0));
  await a.moveTo(target, 10);
  await a.up(800);
  d = await doc(app);
  o = await ov(app);
  check(tag + 'lâchée après la quatrième, « Un » y va : « Deux Trois Quatre Un Cinq Six », la grille à jour', same(d.order, ['Deux', 'Trois', 'Quatre', 'Un', 'Cinq', 'Six']) && !!o && o.cards[3].text.startsWith('Un') && o.cards[3].selected, { order: d.order });
  await a.press('Control+z', 700);
  d = await doc(app);
  check(tag + 'un seul Ctrl+Z la remet', same(d.order, NAMES), d.order);
  // Glisser sur place ne fait rien.
  await a.down(await a.cardCenter(2));
  await a.moveTo(await a.cardCenter(2), 4);
  await a.moveTo({ x: (await a.cardCenter(2)).x + 12, y: (await a.cardCenter(2)).y }, 4);
  await a.up(500);
  d = await doc(app);
  check(tag + 'lâcher une miniature là où elle est ne change rien', same(d.order, NAMES), d.order);

  // --- La taille.
  const sizeOf = async () => (await ov(app)).cards[0].thumb.width;
  const bigger = await app.evaluate(() => document.querySelectorAll('.pp-ov-size')[1].getBoundingClientRect().toJSON());
  await a.click({ x: bigger.x + bigger.width / 2, y: bigger.y + bigger.height / 2 });
  const w1 = await sizeOf();
  check(tag + '« Miniatures plus grandes » : 210 px', Math.abs(w1 - 210) < 1, w1);
  await a.click({ x: bigger.x + bigger.width / 2, y: bigger.y + bigger.height / 2 });
  o = await ov(app);
  check(tag + 'et 300 px, le bouton grisé au bout', Math.abs(o.cards[0].thumb.width - 300) < 1 && o.larger === 'true' && o.smaller === 'false' && o.cards.every(c => c.thumb.width === o.cards[0].thumb.width), { w: o.cards[0].thumb.width, larger: o.larger });
  const smaller = await app.evaluate(() => document.querySelectorAll('.pp-ov-size')[0].getBoundingClientRect().toJSON());
  for (let k = 0; k < 4; k += 1) await a.click({ x: smaller.x + smaller.width / 2, y: smaller.y + smaller.height / 2 }, null, 250);
  o = await ov(app);
  check(tag + '« Miniatures plus petites » quatre fois : 84 px, le bouton grisé au bout ; les miniatures sont copiées à cette taille', Math.abs(o.cards[0].thumb.width - 84) < 1 && o.smaller === 'true' && o.cards.every(c => c.drawn), { w: o.cards[0].thumb.width, smaller: o.smaller });
  await a.click(await a.centerOf('.pp-ov-size', 1), null, 300);
  await a.click(await a.centerOf('.pp-ov-size', 1), null, 300);

  // --- « Fermer » rend le clavier au bouton.
  await a.click(await a.centerOf('.pp-ov-close'));
  o = await ov(app);
  const back = await app.evaluate(() => document.activeElement && document.activeElement.className);
  check(tag + '« Fermer » referme la grille et rend le clavier au bouton de la bande', o === null && /pp-slide-overview-open/.test(back || ''), { open: !!o, back });
  await app.evaluate(() => document.querySelectorAll('.pp-slide-actions .pp-slide-add')[2].focus());
  await a.press('Enter', 700);
  await a.press('Escape', 500);
  o = await ov(app);
  check(tag + 'Échap referme la grille quand rien n’est choisi à plusieurs', o === null);

  // --- L'extension éteinte : la grille se lit, Suppr explique et n'efface rien.
  await app.evaluate(() => document.querySelectorAll('.pp-slide-actions .pp-slide-add')[2].focus());
  await a.press('Enter', 700);
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await app.waitForFunction(() => { const b = document.querySelector('.pp-slide-add'); return !!b && b.getAttribute('aria-disabled') === 'true'; }, null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  o = await ov(app);
  check(tag + 'extension éteinte pendant que la grille est ouverte : elle reste ouverte et se lit', !!o && o.cards.length === 6, o && o.cards.length);
  const before = (await gfsCalls(page, 'installer')).length;
  await app.evaluate(() => document.querySelector('.pp-ov-card[tabindex="0"]').focus());
  await a.press('Delete', 600);
  d = await doc(app);
  const installs = await gfsCalls(page, 'installer');
  check(tag + 'Suppr demande à GFS d’installer « diapositives » et n’efface rien', installs.length === before + 1 && same(d.order, NAMES), { installs: installs.length - before, order: d.order });
  await page.evaluate(list => window.__gfsStub.setExtensions(list), ACTIVE);
  await sleep(500);
  await a.press('Escape', 500);

  // --- Quitter la présentation avec la grille ouverte la ferme.
  await app.evaluate(() => document.querySelectorAll('.pp-slide-actions .pp-slide-add')[2].focus());
  await a.press('Enter', 700);
  const opened = await ov(app);
  await app.evaluate(() => Editor.setHTML('<p>Un document</p>'));
  await sleep(300);
  await app.evaluate(() => SlideStrip.hide());
  await sleep(300);
  o = await ov(app);
  check(tag + 'quand la bande se retire (on quitte la présentation), la grille se ferme avec elle', !!opened && o === null, { opened: !!opened, open: !!o });

  check(tag + 'aucune boîte native du navigateur', A.natives.length === 0, A.natives);
  await A.context.close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
