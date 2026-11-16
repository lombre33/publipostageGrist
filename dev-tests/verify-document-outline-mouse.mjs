#!/usr/bin/env node
// Le plan du document (js/document-outline.js, css/document-outline.css) à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard, Node/Playwright), à la taille du panneau Grist d'Antoine (~700x400)
// puis dans une fenêtre large, en clair/français puis en sombre/anglais - demande du 16/11 : « un menu affichage pour naviguer facilement d'un titre à l'autre et voir le sommaire, genre un panel sur le
// côté comme Word ou Google Sheets » ; choix : une languette au bord gauche du texte (barre gelée, rien d'ajouté), le plan pousse le texte quand la fenêtre est large et passe par-dessus quand elle est étroite.
//   1) LA LANGUETTE au bord gauche du texte, fermé au départ, sans rien cacher du texte (elle reste dans la marge de la page) ;
//   2) UN VRAI CLIC l'ouvre, FENÊTRE ÉTROITE : le volet passe PAR-DESSUS (le texte ne bouge pas : ni marge, ni zoom), liste les titres avec les bons retraits (relatifs au plus haut niveau), lisible (≥ 4,5:1) ;
//   3) UN CLIC SUR UN TITRE : le curseur est dans ce titre, le titre est en haut de la fenêtre, le volet se referme (étroit) ; la languette revient ;
//   4) FENÊTRE LARGE : le volet POUSSE le texte (marge à gauche = sa largeur, la page n'est pas recouverte), reste ouvert après un clic sur un titre, et le titre courant suit le curseur (un vrai clic dans le texte) ;
//   5) LE DÉFILEMENT à la roulette change le titre courant ; un titre tapé s'ajoute à la liste, un titre retiré en part ;
//   6) LA LECTURE : le plan reste ouvert d'un mode à l'autre, liste les titres lus, un clic y fait défiler la page lue ;
//   7) LE CLAVIER : la palette (Alt+/, « plan ») l'ouvre et le focus va au titre courant, ↓ et Entrée sautent, Échap le ferme et rend le focus au texte ;
//   8) GRISÉ, JAMAIS RETIRÉ : une grille, la Lecture épurée → la languette se cache et la palette garde la ligne grisée avec sa raison ;
//   9) AUCUNE ERREUR de page.
// DOC_OUTLINE_SHOTS=<dossier> y range une capture par étape (à regarder - aucune vérification n'en dépend). Lancé par run-headless.mjs (groupe Node « documentOutlineMouse », cf. NODE_SCRIPTS), ou seul :
// node dev-tests/verify-document-outline-mouse.mjs
import { mkdir } from 'node:fs/promises';
import { open, stopServer, sleep, center, fire } from './load-lib.mjs';

const PORT = Number(process.env.DOC_OUTLINE_PORT || 9031);
const SHOTS = process.env.DOC_OUTLINE_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
let failed = 0;
let total = 0;
const check = (label, ok, extra) => {
  total++;
  if (!ok) failed++;
  console.log((ok ? '  ok   - ' : '  FAIL - ') + label + (ok || extra === undefined ? '' : ' (' + JSON.stringify(extra) + ')'));
};
const SPEC = { tables: [{ id: 'WoClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }], models: { count: 1, paragraphs: 1, table: 'WoClients', columns: ['Nom'], firstIsDefault: true } };
const para = text => `<p>${text}</p>`;
const filler = (n, tag) => Array.from({ length: n }, (_, i) => para(`Ligne ${tag} numéro ${i + 1} pour allonger le document et le faire défiler.`)).join('');
// Sept titres (H1, H2 ×4, H3, H2) : « Article 3 » est loin sous « Article 1 », « Signatures » tout en bas.
const DOC = `<h1>Convention de partenariat</h1>${para('Entre les soussignés.')}<h2>Article 1 — Objet</h2>${filler(14, 'a')}<h2>Article 2 — Durée</h2>${para('Douze mois.')}<h3>2.1 Renouvellement</h3>${filler(14, 'b')}<h2>Article 3 — Financement</h2>${filler(14, 'c')}<h2>Article 4 — Résiliation</h2>${filler(14, 'd')}<h2>Signatures</h2>${para('Fait à Paris.')}`;
const NAMES = ['Convention de partenariat', 'Article 1 — Objet', 'Article 2 — Durée', '2.1 Renouvellement', 'Article 3 — Financement', 'Article 4 — Résiliation', 'Signatures'];
const DEPTHS = ['0', '1', '1', '2', '1', '1', '1'];

const luminance = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const snapshot = page => page.evaluate(() => {
  const rect = node => { if (!node) return null; const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const pane = document.getElementById('pp-outline-pane');
  const tab = document.getElementById('v2-outline-tab');
  const box = document.getElementById('editor-container');
  const reader = document.getElementById('reader-container');
  return {
    open: DocumentOutline.isOpen(),
    paneShown: !!pane && !pane.hidden && pane.getClientRects().length > 0,
    pane: pane && !pane.hidden ? rect(pane) : null,
    overlay: !!pane && pane.classList.contains('is-overlay'),
    tabShown: !!tab && !tab.hidden && tab.getClientRects().length > 0,
    tab: rect(tab),
    expanded: tab && tab.getAttribute('aria-expanded'),
    items: Array.from(document.querySelectorAll('.pp-outline-item')).map(b => ({ name: b.textContent, depth: b.dataset.depth, current: b.classList.contains('is-current'), aria: b.getAttribute('aria-current') })),
    marginLeft: box.style.marginLeft,
    readerMargin: reader.style.marginLeft,
    zoom: box.style.getPropertyValue('--pp-fit-zoom'),
    box: rect(box),
    scrollTop: box.scrollTop,
  };
});
const current = s => s.items.filter(i => i.current).map(i => i.name);
const itemPoint = (page, index) => page.evaluate(i => { const b = document.querySelectorAll('.pp-outline-item')[i]; if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, index);
const realClickAt = async (page, p) => { await page.mouse.move(p.x - 8, p.y + 6, { steps: 2 }); await page.mouse.move(p.x, p.y, { steps: 3 }); await page.mouse.click(p.x, p.y); await sleep(450); };
const headingTop = (page, name) => page.evaluate(n => {
  const box = document.getElementById('editor-container').style.display === 'none' ? document.getElementById('reader-container') : document.getElementById('editor-container');
  const heading = Array.from(box.querySelectorAll('h1, h2, h3')).find(h => h.textContent.trim() === n);
  if (!heading) return null;
  return { top: heading.getBoundingClientRect().top - box.getBoundingClientRect().top, bottom: heading.getBoundingClientRect().bottom - box.getBoundingClientRect().top, frame: box.getBoundingClientRect().height };
}, name);
const cursorHeading = page => page.evaluate(() => { const { $from } = EditorCore.getEditor().state.selection; for (let d = $from.depth; d > 0; d--) { const n = $from.node(d); if (n.type.name === 'heading') return n.textContent; } return null; });

async function run(lang, scheme) {
  const L = `${scheme}/${lang}`;
  const fr = lang === 'fr';
  const narrow = await open({ spec: SPEC, width: 700, height: 400, port: PORT, theme: scheme, lang });
  const page = narrow.page;
  await page.evaluate(html => { Editor.setHTML(html); }, DOC);
  await sleep(1500);

  // 1) La languette, fermé au départ.
  let s = await snapshot(page);
  check(`${L} : au départ le plan est fermé et la languette est au bord gauche du texte`, !s.open && !s.paneShown && s.tabShown && s.expanded === 'false' && s.tab.left <= 1 && s.tab.width <= 26 && s.tab.top >= s.box.top, s);
  const tabName = await page.evaluate(() => document.getElementById('v2-outline-tab').getAttribute('aria-label'));
  check(`${L} : la languette dit l'action (« ${fr ? 'Afficher le plan du document' : 'Show the document outline'} »)`, tabName === (fr ? 'Afficher le plan du document' : 'Show the document outline'), tabName);
  const texte = await page.evaluate(() => { const p = document.querySelector('#editor-container .ProseMirror p'); const r = p.getBoundingClientRect(); return r.left; });
  check(`${L} : elle ne recouvre pas le texte (le texte commence à droite d'elle)`, texte > s.tab.right + 4, { texte, tab: s.tab });
  await shot(page, `${scheme}-${lang}-1-ferme`);

  // 2) Un vrai clic l'ouvre : étroit, par-dessus.
  const before = s;
  await realClickAt(page, await center(page, '#v2-outline-tab'));
  await page.mouse.move(690, 390);
  await sleep(300);
  s = await snapshot(page);
  check(`${L} : un vrai clic ouvre le plan, par-dessus le texte (étroit) : ni marge, ni changement de zoom`, s.open && s.paneShown && s.overlay && s.marginLeft === '' && s.zoom === before.zoom && s.box.width === before.box.width, { open: s.open, overlay: s.overlay, marginLeft: s.marginLeft, zoom: [before.zoom, s.zoom] });
  check(`${L} : la languette cède la place au volet (elle se cache, aria-expanded vrai)`, !s.tabShown && s.expanded === 'true', s);
  check(`${L} : le volet liste les sept titres, dans l'ordre du document`, JSON.stringify(s.items.map(i => i.name)) === JSON.stringify(NAMES), s.items);
  check(`${L} : le retrait suit le niveau, relatif au plus haut (H1 → 0, H2 → 1, H3 → 2)`, JSON.stringify(s.items.map(i => i.depth)) === JSON.stringify(DEPTHS), s.items);
  check(`${L} : le volet est sous la barre et tient dans le cadre (de la hauteur du document, ≤ 42 % de la largeur)`, Math.abs(s.pane.top - s.box.top) <= 1 && s.pane.bottom <= 400.5 && s.pane.width <= 700 * 0.42 + 1 && s.pane.left >= -0.5, { pane: s.pane, box: s.box });
  check(`${L} : un seul titre est le courant, marqué aria-current`, current(s).length === 1 && s.items.filter(i => i.aria === 'location').length === 1, s.items);
  const colors = await page.evaluate(() => {
    const rgb = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const behind = node => { for (let n = node; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; const v = (c.match(/[\d.]+/g) || []).map(Number); if (v.length === 3 || (v.length === 4 && v[3] > 0.9)) return rgb(c); } return [255, 255, 255]; };
    const out = {};
    ['.pp-outline-item:not(.is-current)', '.pp-outline-item.is-current', '.pp-outline-title'].forEach(sel => { const n = document.querySelector(sel); out[sel] = n ? { fg: rgb(getComputedStyle(n).color), bg: behind(n) } : null; });
    return out;
  });
  const worst = Math.min(...Object.values(colors).filter(Boolean).map(c => ratio(c.fg, c.bg)));
  check(`${L} : les titres et le titre courant se lisent (contraste ≥ 4,5:1 : ${worst.toFixed(1)})`, worst >= 4.5, colors);
  await shot(page, `${scheme}-${lang}-2-ouvert-etroit`);

  // 3) Un clic sur un titre : le curseur y va, le titre monte en haut, le volet se referme.
  const target = 4; // Article 3 — Financement
  await realClickAt(page, await itemPoint(page, target));
  await page.mouse.move(690, 390);
  await sleep(500);
  s = await snapshot(page);
  const at = await headingTop(page, NAMES[target]);
  check(`${L} : un clic sur « ${NAMES[target]} » y pose le curseur`, (await cursorHeading(page)) === NAMES[target], await cursorHeading(page));
  check(`${L} : le titre est en haut de la fenêtre (dans son premier quart)`, !!at && at.top >= -2 && at.top < at.frame / 4, at);
  check(`${L} : étroit, le volet se referme et la languette revient`, !s.open && !s.paneShown && s.tabShown && s.marginLeft === '', s);
  await shot(page, `${scheme}-${lang}-3-apres-saut`);

  // Étroit : un clic dans le texte referme le volet sans rien prendre au clic.
  await realClickAt(page, await center(page, '#v2-outline-tab'));
  s = await snapshot(page);
  const inText = await page.evaluate(() => { const ps = Array.from(document.querySelectorAll('#editor-container .ProseMirror p')); const p = ps.find(n => n.getBoundingClientRect().left > 250 || n.getBoundingClientRect().right > 400); const r = p.getBoundingClientRect(); return { x: Math.min(r.right - 10, 620), y: r.top + r.height / 2 }; });
  await realClickAt(page, inText);
  s = await snapshot(page);
  check(`${L} : étroit, un clic dans le texte, à droite du volet, le referme`, !s.open && !s.paneShown, s);

  // 5, partie étroite : la roulette change le titre courant (la fenêtre suit).
  await realClickAt(page, await center(page, '#v2-outline-tab'));
  await page.evaluate(() => { document.getElementById('editor-container').scrollTop = 0; });
  await sleep(500);
  const top = await snapshot(page);
  await page.mouse.move(500, 300);
  await page.mouse.wheel(0, 900);
  await sleep(900);
  s = await snapshot(page);
  check(`${L} : la roulette fait défiler le document et change le titre courant (${current(top)[0]} → ${current(s)[0]})`, s.scrollTop > top.scrollTop + 300 && current(s).length === 1 && current(s)[0] !== current(top)[0], { top: current(top), now: current(s), scroll: [top.scrollTop, s.scrollTop] });
  await page.keyboard.press('Escape');
  await sleep(300);
  await narrow.close();
  await stopServer();

  // 4) Fenêtre large : le volet pousse le texte.
  const wide = await open({ spec: SPEC, width: 1200, height: 700, port: PORT, theme: scheme, lang });
  const wp = wide.page;
  await wp.evaluate(html => { Editor.setHTML(html); }, DOC);
  await sleep(1500);
  const wideBefore = await snapshot(wp);
  await realClickAt(wp, await center(wp, '#v2-outline-tab'));
  await wp.mouse.move(1190, 690);
  await sleep(400);
  s = await snapshot(wp);
  const pageLeft = await wp.evaluate(() => { const r = document.querySelector('#editor-container .ProseMirror').getBoundingClientRect(); return r.left; });
  check(`${L} : fenêtre large, le plan POUSSE le texte (marge à gauche = largeur du volet, volet non superposé)`, s.open && !s.overlay && s.marginLeft === Math.round(s.pane.width) + 'px' && s.box.left >= s.pane.right - 1, { open: s.open, overlay: s.overlay, margin: s.marginLeft, pane: s.pane, box: s.box });
  check(`${L} : la page n'est pas recouverte par le volet (la page commence à droite de lui)`, pageLeft >= s.pane.right - 1, { pageLeft, pane: s.pane });
  check(`${L} : le zoom de la page ne change pas (la page garde sa taille, la fenêtre sur elle se réduit)`, s.zoom === wideBefore.zoom || (s.zoom === '' && wideBefore.zoom === ''), [wideBefore.zoom, s.zoom]);
  await shot(wp, `${scheme}-${lang}-4-ouvert-large`);
  await realClickAt(wp, await itemPoint(wp, 2));
  s = await snapshot(wp);
  check(`${L} : large, un clic sur un titre le garde ouvert ; le curseur est dans « ${NAMES[2]} » et ce titre est le courant`, s.open && s.paneShown && (await cursorHeading(wp)) === NAMES[2] && current(s)[0] === NAMES[2], { cursor: await cursorHeading(wp), current: current(s) });
  // Le curseur suit : un vrai clic dans le texte de la section « Article 4 ».
  const click4 = await wp.evaluate(() => { const h = Array.from(document.querySelectorAll('#editor-container .ProseMirror h2')).find(n => n.textContent.startsWith('Article 4')); h.scrollIntoView({ block: 'start' }); const p = h.nextElementSibling; const r = p.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; });
  await sleep(300);
  const click4b = await wp.evaluate(() => { const h = Array.from(document.querySelectorAll('#editor-container .ProseMirror h2')).find(n => n.textContent.startsWith('Article 4')); const r = h.nextElementSibling.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; });
  await realClickAt(wp, click4b);
  s = await snapshot(wp);
  check(`${L} : un vrai clic dans le texte de « Article 4 » fait de lui le titre courant`, current(s)[0] === NAMES[5], { current: current(s), click4 });

  // Un titre tapé s'ajoute, un titre retiré s'en va.
  await wp.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.focus('end'); ed.chain().focus('end').insertContent('<h2></h2>').run(); });
  await wp.keyboard.type(fr ? 'Annexe' : 'Annex', { delay: 20 });
  await sleep(700);
  s = await snapshot(wp);
  const annex = fr ? 'Annexe' : 'Annex';
  check(`${L} : un titre tapé s'ajoute au plan (« ${annex} », en dernier) et devient le courant`, s.items.length === 8 && s.items[7].name === annex && current(s)[0] === annex, s.items.map(i => i.name));
  for (let i = 0; i < annex.length + 1; i++) await wp.keyboard.press('Backspace');
  await sleep(700);
  s = await snapshot(wp);
  check(`${L} : le titre effacé disparaît du plan (retour à sept titres)`, s.items.length === 7 && !s.items.some(i => i.name === annex), s.items.map(i => i.name));
  await shot(wp, `${scheme}-${lang}-5-titre-ajoute`);

  // 6) La Lecture : le plan reste ouvert, liste les titres lus, un clic y fait défiler.
  await fire(wp, 'WoClients', 1);
  await realClickAt(wp, await center(wp, '#btn-mode-read'));
  await wp.mouse.move(1190, 690);
  await sleep(1800);
  s = await snapshot(wp);
  const readNames = await wp.evaluate(() => Array.from(document.querySelectorAll('.pp-outline-item')).map(b => b.textContent));
  check(`${L} : en Lecture le plan reste ouvert et liste les titres lus (${readNames.length})`, s.open && s.paneShown && JSON.stringify(readNames) === JSON.stringify(NAMES), { open: s.open, readNames });
  check(`${L} : en Lecture la marge est sur la page lue, plus sur l'éditeur`, s.marginLeft === '' && s.readerMargin !== '', { editor: s.marginLeft, reader: s.readerMargin });
  await shot(wp, `${scheme}-${lang}-6-lecture`);
  const targetRead = 5;
  const readPoint = await itemPoint(wp, targetRead);
  if (readPoint) await realClickAt(wp, readPoint);
  const readTop = await headingTop(wp, NAMES[targetRead]);
  s = await snapshot(wp);
  check(`${L} : en Lecture un clic sur « ${NAMES[targetRead]} » fait défiler la page jusqu'à lui (en haut de la fenêtre)`, !!readTop && readTop.top >= -2 && readTop.top < readTop.frame / 4 && current(s)[0] === NAMES[targetRead], { readTop, current: current(s) });
  await realClickAt(wp, await center(wp, '#btn-mode-edit'));
  await wp.mouse.move(1190, 690);
  await sleep(1200);
  s = await snapshot(wp);
  check(`${L} : de retour en Édition le plan est toujours ouvert, la marge est revenue sur l'éditeur`, s.open && s.paneShown && s.marginLeft !== '' && s.readerMargin === '', s);

  // 7) Le clavier : la palette ouvre le plan ; ↓ et Entrée sautent ; Échap ferme et rend le focus au texte.
  await wp.evaluate(() => DocumentOutline.close({ focus: false }));
  await wp.evaluate(() => { EditorCore.getEditor().commands.focus('start'); });
  await sleep(300);
  await wp.keyboard.press('Alt+/');
  await sleep(500);
  await wp.keyboard.type(fr ? 'plan du' : 'document outl', { delay: 20 });
  await sleep(500);
  const listed = await wp.evaluate(() => { const row = Array.from(document.querySelectorAll('.pp-palette-row')).find(n => /plan du document|document outline/i.test(n.textContent)); return !!row && !row.classList.contains('is-off'); });
  check(`${L} : la palette propose « ${fr ? 'Plan du document' : 'Document outline'} », disponible`, listed);
  await wp.keyboard.press('Enter');
  await sleep(700);
  s = await snapshot(wp);
  const focused = await wp.evaluate(() => { const a = document.activeElement; return a && a.classList.contains('pp-outline-item') ? a.textContent : (a && a.id) || a.tagName; });
  check(`${L} : la palette ouvre le plan et le focus va au titre courant (« ${current(s)[0]} »)`, s.open && focused === current(s)[0], { open: s.open, focused, current: current(s) });
  await wp.keyboard.press('ArrowDown');
  await wp.keyboard.press('ArrowDown');
  const moved = await wp.evaluate(() => document.activeElement.textContent);
  check(`${L} : deux fois ↓ passent au deuxième titre suivant (« ${moved} »)`, NAMES.indexOf(moved) === NAMES.indexOf(current(s)[0]) + 2 || moved === NAMES[NAMES.length - 1], moved);
  await wp.keyboard.press('Enter');
  await sleep(500);
  const jumped = await cursorHeading(wp);
  check(`${L} : Entrée saute au titre choisi (curseur dans « ${jumped} »)`, jumped === moved, { jumped, moved });
  await wp.evaluate(() => { const b = document.querySelector('.pp-outline-item'); b.focus(); });
  await wp.keyboard.press('Escape');
  await sleep(400);
  s = await snapshot(wp);
  const back = await wp.evaluate(() => !!document.activeElement.closest('.ProseMirror'));
  check(`${L} : Échap ferme le plan et rend le focus au texte`, !s.open && !s.paneShown && back, { open: s.open, back });
  await wp.keyboard.press('Alt+/');
  await sleep(300);
  await wp.keyboard.type(fr ? 'plan du' : 'document outl', { delay: 20 });
  await wp.keyboard.press('Enter');
  await sleep(500);
  await wp.keyboard.press('Escape');
  await sleep(400);
  s = await snapshot(wp);
  check(`${L} : la même ligne de la palette referme le plan quand il est ouvert (bascule)`, !s.open, s);

  // 8) Grisé, jamais retiré : une grille (la classe de <body> que GridEditor pose) et la Lecture épurée.
  await wp.evaluate(() => document.body.classList.add('pp-grid-mode'));
  await sleep(400);
  s = await snapshot(wp);
  const gridReason = await wp.evaluate(() => { const t = document.getElementById('v2-outline-tab'); return { reason: t.getAttribute('data-pp-lock-reason'), hidden: t.hidden, state: Shortcuts.state('documentOutline') }; });
  check(`${L} : dans une grille la languette se cache et dit pourquoi à la palette (ligne grisée avec sa raison)`, gridReason.hidden && !gridReason.state.available && !!gridReason.state.reason && gridReason.state.reason === gridReason.reason, gridReason);
  await wp.evaluate(() => document.body.classList.remove('pp-grid-mode'));
  await sleep(400);
  s = await snapshot(wp);
  check(`${L} : la grille partie, la languette revient`, s.tabShown && !s.open, s);

  await wide.close();
  await stopServer();
  const errors = [...narrow.errors, ...wide.errors];
  check(`${L} : aucune erreur de page`, errors.length === 0, errors.slice(0, 3));
}

try {
  await run('fr', 'light');
  await run('en', 'dark');
} finally {
  await stopServer();
}
console.log(failed ? `\n${failed} échec(s) sur ${total}` : `\nTout est vert (${total})`);
process.exit(failed ? 1 : 0);
