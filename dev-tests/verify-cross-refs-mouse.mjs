#!/usr/bin/env node
// Le renvoi (js/cross-refs.js, js/cross-ref-dialog.js) à la VRAIE souris et au vrai clavier, à 700x400 (le panneau de Grist), en français clair puis en anglais sombre (20/11, demande d'Antoine :
// « un renvoi qui affiche le nom du titre en direct et qui est en même temps un lien vers la section »). Ce que dev-tests/scenarios-cross-refs.js ne peut pas voir depuis la page : un survol,
// un clic « trusted », la place de la fenêtre dans le panneau, ce qui la recouvre, le clavier rendu à l'éditeur.
//   1) Le menu de la chaîne : la ligne « Renvoi… » est la troisième, sous « Signet… », dans le panneau et au premier plan, lisible.
//   2) La fenêtre par un vrai clic sur la ligne : elle tient dans le panneau (titre, liste, trois choix, note, boutons au premier plan) ; sans numérotation les choix « numéro » sont grisés avec leur raison.
//   3) La liste avec recherche : un vrai clic l'ouvre dans le panneau, le titre y est ; le choisir remplit l'exemple de chaque choix ; Valider pose le renvoi, le clavier revient dans l'éditeur.
//   4) Le renvoi suit le titre : une frappe au vrai clavier dans le titre change le texte du renvoi, plus haut dans le document, tout de suite.
//   5) Le renvoi dans l'éditeur : l'info-bulle au survol nomme le titre, un clic simple ne bouge rien, Ctrl+clic amène le titre en haut de la zone visible, un double clic rouvre la fenêtre.
//   6) La Lecture : un vrai clic sur le renvoi amène le titre en haut de la zone de lecture ; le texte du renvoi est celui du titre renommé.
//   7) La ligne reste disponible dans une case de tableau, grisée dans un bloc de code (raison en info-bulle, un clic n'ouvre rien) ; « Modifier le renvoi… » sur un renvoi sélectionné ; aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « crossRefsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-cross-refs-mouse.mjs
// CROSS_REFS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { open, stopServer, sleep, fire, mode } from './load-lib.mjs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const PORT = Number(process.env.CROSS_REFS_MOUSE_PORT || 9086);
const SHOTS = process.env.CROSS_REFS_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
const MARGIN = 12; // js/toc-links.js : la cible s'arrête 12 px sous le bord haut de la zone qui défile
if (SHOTS) await mkdir(SHOTS, { recursive: true });

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));
const close = (a, b, tolerance = 3) => Math.abs(a - b) <= tolerance;

const MAIN = '#v2-btn-link';
const ROW = '#v2-row-cross-ref';
const XR = '#pp-xref-modal';
const SCROLLER = '#editor-container';
const EDITOR = `${SCROLLER} .ProseMirror`;

const filler = (n, tag = 'Ligne') => Array.from({ length: n }, (_, i) => `<p>${tag} ${i + 1} qui allonge le document.</p>`).join('');
const DOC = '<p>Pour la suite, voir</p>' + filler(30, 'Début')
  + '<h2>Conditions générales</h2><p>Les conditions s\'appliquent.</p>' + filler(30, 'Fin')
  + '<table><tbody><tr><td><p>Case du tableau</p></td><td><p>Autre case</p></td></tr></tbody></table><p>Après le tableau</p><pre><code>Exemple de code</code></pre>';
const HEADING = 'Conditions générales';
const RENAMED = 'Conditions générales bis';

const STR = {
  fr: { row: 'Renvoi…', edit: 'Modifier le renvoi…', title: 'Insérer un renvoi', editTitle: 'Modifier le renvoi', show: 'Le renvoi écrit', modes: ['Le texte du titre', 'Le numéro du titre', 'Le numéro et le texte'], noNumbering: 'Les titres de ce document ne sont pas numérotés.', tip: 'Dans ce document : ' + RENAMED, tipHint: /^(Ctrl|⌘)\+clic pour y aller$/ },
  en: { row: 'Cross-reference…', edit: 'Edit cross-reference…', title: 'Insert a cross-reference', editTitle: 'Edit the cross-reference', show: 'The cross-reference shows', modes: ['The heading text', 'The heading number', 'The number and the text'], noNumbering: 'The headings of this document are not numbered.', tip: 'In this document: ' + RENAMED, tipHint: /^(Ctrl|⌘)\+click to go there$/ },
};

// --- Gestes et mesures, sur la page de `w` ---
function tools(page, tag) {
  const centerOf = selector => page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  }, selector);
  // L'élément, tel que la souris le voit : visible dans le panneau et au premier plan (rien d'autre n'est dessus à son centre).
  const hit = selector => page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { found: true, w: r.width, h: r.height, inPanel: r.width > 0 && r.height > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === el || el.contains(top)), l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) };
  }, selector);
  const seen = box => box.found && box.inPanel && box.onTop;
  const winOpen = id => page.evaluate(i => { const m = document.getElementById(i); return !!m && m.style.display !== 'none'; }, id);
  const html = () => page.evaluate(() => Editor.getHTML());
  const focusIn = () => page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return 'rien';
    if (a.closest('.tiptap')) return 'editor';
    return a.closest('#pp-xref-modal') ? (a.id || a.className || a.tagName) : 'ailleurs : ' + (a.id || a.tagName);
  });
  // Le rapport de contraste WCAG du texte d'un élément sur son fond réel.
  const contrastOf = selector => page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(s => parseFloat(s)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    const layers = [];
    for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (const c of layers.reverse()) base = mix(c, base);
    let fg = parse(getComputedStyle(el).color);
    if (fg.a < 1) fg = mix(fg, base);
    const a = lum(fg), b = lum(base);
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  }, selector);
  // Pointe un texte de l'éditeur (milieu par défaut) pour y cliquer pour de vrai.
  const pointOf = (text, at = 0.5, root = EDITOR) => page.evaluate(({ text, at, root }) => {
    const walker = document.createTreeWalker(document.querySelector(root), NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const i = n.textContent.indexOf(text);
      if (i < 0) continue;
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length);
      const b = r.getBoundingClientRect();
      return { x: b.left + b.width * at, y: b.top + b.height / 2 };
    }
    return null;
  }, { text, at, root });
  // Amène un bloc à `gap` px du bord haut de la zone qui défile (la mise en place d'un essai, pas ce qu'il mesure).
  const reveal = (text, gap = 90, scroller = SCROLLER, root = EDITOR) => page.evaluate(({ text, gap, scroller, root }) => {
    const area = document.querySelector(scroller);
    const block = Array.from(document.querySelectorAll(root + ' > *')).find(n => n.textContent.includes(text));
    area.scrollTop += block.getBoundingClientRect().top - area.getBoundingClientRect().top - gap;
  }, { text, gap, scroller, root });
  const scrollTo = (top, scroller = SCROLLER) => page.evaluate(([t, s]) => { document.querySelector(s).scrollTop = t; }, [top, scroller]);
  const offsetOf = (scroller, selector) => page.evaluate(([s, sel]) => document.querySelector(sel).getBoundingClientRect().top - document.querySelector(s).getBoundingClientRect().top, [scroller, selector]);
  const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${tag}-${name}.png`) }); };
  // Un vrai clic au centre d'un élément (la souris y arrive de quelques pixels à côté).
  const press = async selector => {
    const c = await centerOf(selector);
    await page.mouse.move(c.x - 20, c.y); await page.mouse.move(c.x, c.y, { steps: 3 });
    await page.mouse.click(c.x, c.y);
    await sleep(250);
  };

  // Survol réel de l'icône du menu : la souris arrive depuis le bas du document (jamais par-dessus un autre volet de la barre).
  async function openMenu() {
    const c = await centerOf(MAIN);
    await page.mouse.move(c.x, c.y + 150);
    await page.mouse.move(c.x, c.y, { steps: 4 });
    await sleep(350);
    return c;
  }
  async function closeMenu() {
    // Le volet à onze lignes couvre le bas du milieu du panneau : la souris le quitte par le coin bas droit.
    await page.mouse.move(WIDTH - 30, HEIGHT - 20, { steps: 3 });
    await sleep(250);
  }
  // Une ligne du menu, à la vraie souris : le volet s'ouvre au survol de l'icône, puis la main descend de l'icône sur la ligne et clique.
  async function pressRow(selector, { click = true } = {}) {
    const c = await openMenu();
    const r = await centerOf(selector);
    const x = Math.min(Math.max(c.x, r.l + 8), r.r - 8);
    await page.mouse.move(x, r.y, { steps: 8 });
    await sleep(100);
    if (click) { await page.mouse.click(x, r.y); await sleep(300); }
    return { x, y: r.y };
  }
  return { centerOf, hit, seen, winOpen, html, focusIn, contrastOf, pointOf, reveal, scrollTo, offsetOf, snap, press, openMenu, closeMenu, pressRow };
}

async function pass(lang, theme, tag) {
  const S = STR[lang];
  const w = await open({ spec: { tables: [{ id: 'Clients', rows: 3, columns: [{ id: 'Nom', type: 'Text' }] }] }, port: PORT, settleMs: 1500, theme, lang });
  const { page } = w;
  const t = tools(page, tag);
  const nativeDialogs = [];
  page.on('dialog', d => nativeDialogs.push(d.type() + ' : ' + d.message()));
  const opened = [];
  page.context().on('page', p => opened.push(p.url()));
  try {
    await page.evaluate(d => Editor.setHTML(d), DOC);
    await sleep(500);

    // === 1) Le menu ===
    console.log(`\n[${tag}] Menu : la ligne « ${S.row} »`);
    await t.scrollTo(0);
    await sleep(200);
    const start = await t.pointOf('Pour la suite, voir', 1);
    await page.mouse.move(start.x - 60, start.y); await page.mouse.move(start.x - 2, start.y, { steps: 3 });
    await page.mouse.click(start.x - 2, start.y);
    await page.keyboard.press('End');
    await sleep(250);
    await t.openMenu();
    const flyout = await t.hit('#v2-blocks-flyout');
    const row = await t.hit(ROW);
    const rowLabel = await page.evaluate(sel => document.querySelector(sel).textContent.trim(), ROW);
    const order = await page.evaluate(() => Array.from(document.querySelectorAll('#v2-blocks-flyout .v2-menu-row')).map(r => r.id));
    check(`${tag} : au survol de la chaîne, le volet s'ouvre dans le panneau et la ligne « ${S.row} » y est, troisième (sous « Signet… »), au premier plan`, flyout.found && flyout.inPanel && t.seen(row) && order[2] === 'v2-row-cross-ref' && order[1] === 'v2-row-bookmark' && rowLabel === S.row, { flyout, row, order, rowLabel });
    const rowColor = await t.contrastOf(ROW);
    check(`${tag} : le texte de la ligne se lit (>= 4,5:1)`, rowColor >= 4.5, rowColor);
    await t.snap('1-menu');
    await t.closeMenu();

    // === 2) La fenêtre ===
    console.log(`\n[${tag}] Fenêtre du renvoi`);
    await t.pressRow(ROW);
    const win = await t.hit(`${XR} .modal-content`);
    const modeBoxes = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-xref-modal .pp-xref-mode')).map(l => ({ name: l.querySelector('.pp-xref-mode-name').textContent, disabled: l.querySelector('input').disabled, checked: l.querySelector('input').checked, title: l.title })));
    const parts = { title: await t.hit(`${XR} h3`), trigger: await t.hit(`${XR} .ss-trigger`), modes: await t.hit(`${XR} .pp-xref-modes`), ok: await t.hit(`${XR} .var-modal-primary`), cancel: await t.hit(`${XR} .var-modal-actions button:not(.var-modal-primary)`), note: await t.hit(`${XR} .pp-link-note:last-child`) };
    const title = await page.evaluate(() => document.getElementById('pp-xref-title').textContent);
    check(`${tag} : un vrai clic sur la ligne ouvre la fenêtre « ${S.title} », entière dans ${WIDTH}x${HEIGHT} : titre, liste, choix, note et boutons au premier plan`, (await t.winOpen('pp-xref-modal')) && title === S.title && win.inPanel && Object.values(parts).every(t.seen), { title, win, parts });
    check(`${tag} : la fenêtre propose les trois choix « ${S.modes.join(' / ')} », le texte coché`, JSON.stringify(modeBoxes.map(b => b.name)) === JSON.stringify(S.modes) && modeBoxes[0].checked && !modeBoxes[1].checked && !modeBoxes[2].checked, modeBoxes);
    await t.snap('2-fenetre');

    // Valider sans rien choisir : l'erreur est sous la liste, la fenêtre reste dans le panneau.
    await t.press(`${XR} .var-modal-primary`);
    const noChoice = { error: await t.hit('#pp-xref-error'), ok: await t.hit(`${XR} .var-modal-primary`), win: await t.hit(`${XR} .modal-content`), open: await t.winOpen('pp-xref-modal') };
    const noChoiceColor = await t.contrastOf('#pp-xref-error');
    check(`${tag} : un clic sur le bouton de validation sans rien choisir ne pose rien : l'erreur est sous la liste, au premier plan et lisible (>= 4,5:1), la fenêtre reste dans le panneau`, noChoice.open && t.seen(noChoice.error) && t.seen(noChoice.ok) && noChoice.win.inPanel && noChoiceColor >= 4.5, { noChoice, noChoiceColor });
    await t.snap('3-erreur');

    // === 3) La liste avec recherche ===
    await t.press(`${XR} .ss-trigger`);
    const panel = await page.evaluate(() => {
      const shown = Array.from(document.querySelectorAll('#pp-xref-modal .ss-panel')).find(p => p.getBoundingClientRect().height > 0);
      if (!shown) return { found: false };
      const r = shown.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { found: true, inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && shown.contains(top), options: Array.from(shown.querySelectorAll('.ss-option .ss-name')).map(o => o.textContent) };
    });
    check(`${tag} : un vrai clic sur la liste l'ouvre dans le panneau, au premier plan, avec le titre « ${HEADING} »`, panel.found && panel.inPanel && panel.onTop && JSON.stringify(panel.options) === JSON.stringify([HEADING]), panel);
    await t.snap('4-liste');
    await t.press(`${XR} .ss-option`);
    const picked = await page.evaluate(() => ({ value: document.getElementById('pp-xref-target').value, examples: Array.from(document.querySelectorAll('#pp-xref-modal .pp-xref-mode')).map(l => ({ example: l.querySelector('.pp-xref-mode-example').textContent, disabled: l.querySelector('input').disabled, title: l.title })) }));
    check(`${tag} : choisir le titre remplit l'exemple du premier choix (« ${HEADING} ») ; sans numérotation, les deux choix « numéro » sont grisés avec leur raison`, picked.value === 'h:0' && picked.examples[0].example === '« ' + HEADING + ' »' && !picked.examples[0].disabled && picked.examples[1].disabled && picked.examples[2].disabled && picked.examples[1].title === S.noNumbering, picked);
    const exColor = await t.contrastOf(`${XR} .pp-xref-mode-example`);
    const nameColor = await t.contrastOf(`${XR} .pp-xref-mode-name`);
    check(`${tag} : le texte des choix et leurs exemples se lisent (>= 4,5:1)`, exColor >= 4.5 && nameColor >= 4.5, { exColor, nameColor });
    await t.snap('5-choix');
    await t.press(`${XR} .var-modal-primary`);
    await sleep(200);
    const placed = await page.evaluate(() => { const a = document.querySelector('#editor-container .ProseMirror a.pp-xref'); return a ? { text: a.textContent, href: a.getAttribute('href'), mode: a.dataset.xrefMode } : null; });
    const heading = await page.evaluate(() => { const h = document.querySelector('#editor-container .ProseMirror h2'); return h ? h.getAttribute('data-anchor') : null; });
    check(`${tag} : Valider pose le renvoi « ${HEADING} » à la fin du paragraphe, avec un lien vers le titre, qui a reçu son adresse ; la fenêtre est fermée, le clavier est revenu dans l'éditeur`, !!placed && placed.text === HEADING && placed.href === '#' + heading && !!heading && !(await t.winOpen('pp-xref-modal')) && (await t.focusIn()) === 'editor', { placed, heading, focus: await t.focusIn() });

    // === 4) Le renvoi suit le titre ===
    console.log(`\n[${tag}] Le renvoi suit le titre`);
    await t.reveal('Les conditions s\'appliquent.');
    await sleep(200);
    const end = await t.pointOf(HEADING, 1, `${EDITOR} > h2`);
    await page.mouse.move(end.x + 30, end.y); await page.mouse.move(end.x + 2, end.y, { steps: 3 });
    await page.mouse.click(end.x + 2, end.y);
    await page.keyboard.press('End');
    await page.keyboard.type(' bis', { delay: 40 });
    await sleep(300);
    const followed = await page.evaluate(() => document.querySelector('#editor-container .ProseMirror a.pp-xref').textContent);
    check(`${tag} : une frappe au vrai clavier dans le titre (« ${RENAMED} ») change tout de suite le texte du renvoi, plus haut dans le document`, followed === RENAMED, followed);
    await page.keyboard.press('Control+z');
    await sleep(250);
    const undone = await page.evaluate(() => ({ ref: document.querySelector('#editor-container .ProseMirror a.pp-xref').textContent, heading: document.querySelector('#editor-container .ProseMirror h2').textContent }));
    check(`${tag} : un Ctrl+Z défait la frappe ET le texte du renvoi ensemble`, undone.heading === HEADING && undone.ref === HEADING, undone);
    await page.keyboard.press('Control+y');
    await sleep(250);
    const redone = await page.evaluate(() => ({ ref: document.querySelector('#editor-container .ProseMirror a.pp-xref').textContent, heading: document.querySelector('#editor-container .ProseMirror h2').textContent }));
    check(`${tag} : un Ctrl+Y rend les deux`, redone.ref === RENAMED && redone.heading === RENAMED, redone);

    // === 5) Le renvoi dans l'éditeur ===
    console.log(`\n[${tag}] Éditeur : le renvoi`);
    await t.scrollTo(0);
    await sleep(250);
    const ref = await t.centerOf('#editor-container .ProseMirror a.pp-xref');
    await page.mouse.move(ref.x - 60, ref.y + 40); await page.mouse.move(ref.x, ref.y, { steps: 5 });
    await sleep(1000);
    const tip = await page.evaluate(() => {
      const tipEl = document.querySelector('.pp-link-tip');
      if (!tipEl || tipEl.hidden) return null;
      const r = tipEl.getBoundingClientRect();
      return { lines: Array.from(tipEl.children).map(c => c.textContent), inPanel: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
    });
    const tipColor = await t.contrastOf('.pp-link-tip');
    check(`${tag} : au survol, l'info-bulle nomme le titre (« ${S.tip} ») et invite à Ctrl+clic, dans le panneau, lisible (>= 4,5:1)`, !!tip && tip.lines[0] === S.tip && S.tipHint.test(tip.lines[1] || '') && tip.inPanel && tipColor >= 4.5, { tip, tipColor });
    await t.snap('6-infobulle');

    const topBefore = await page.evaluate(s => document.querySelector(s).scrollTop, SCROLLER);
    await page.mouse.click(ref.x, ref.y);
    await sleep(300);
    const topPlain = await page.evaluate(s => document.querySelector(s).scrollTop, SCROLLER);
    check(`${tag} : un clic simple sur le renvoi ne fait rien défiler et n'ouvre aucun onglet`, topBefore === topPlain && opened.length === 0, { topBefore, topPlain, opened });

    await page.mouse.move(ref.x - 5, ref.y); await page.mouse.move(ref.x, ref.y, { steps: 2 });
    await page.keyboard.down('Control');
    await page.mouse.click(ref.x, ref.y);
    await page.keyboard.up('Control');
    await sleep(500);
    const offset = await t.offsetOf(SCROLLER, `${EDITOR} > h2`);
    check(`${tag} : Ctrl+clic amène le titre à ${MARGIN} px du bord haut de la zone visible (il était hors de l'écran), sans ouvrir d'onglet`, close(offset, MARGIN) && opened.length === 0, { offset, opened });

    // Un double clic rouvre la fenêtre sur ce renvoi.
    await t.scrollTo(0);
    await sleep(250);
    const again = await t.centerOf('#editor-container .ProseMirror a.pp-xref');
    await page.mouse.dblclick(again.x, again.y);
    await sleep(350);
    const edit = await page.evaluate(() => ({ title: document.getElementById('pp-xref-title').textContent, picked: document.getElementById('pp-xref-target').value, ok: document.querySelector('#pp-xref-modal .var-modal-primary').textContent }));
    check(`${tag} : un double clic sur le renvoi rouvre la fenêtre « ${S.editTitle} » sur le titre déjà choisi, entière dans le panneau`, (await t.winOpen('pp-xref-modal')) && edit.title === S.editTitle && edit.picked === 'h:0' && (await t.hit(`${XR} .modal-content`)).inPanel, edit);
    await t.snap('7-modifier');
    await page.keyboard.press('Escape');
    await sleep(250);
    check(`${tag} : Échap ferme la fenêtre et rend le clavier à l'éditeur`, !(await t.winOpen('pp-xref-modal')) && (await t.focusIn()) === 'editor', await t.focusIn());

    // === 6) La Lecture ===
    console.log(`\n[${tag}] Lecture : le renvoi`);
    await t.scrollTo(0);
    await fire(page, 'Clients', 1);
    await mode(page, 'read');
    await page.waitForFunction(() => !!document.querySelector('#reader-container .reader-content a.pp-xref'), null, { timeout: 20000 });
    await sleep(500);
    const R_SCROLLER = '#reader-container';
    const R_ROOT = '#reader-container .reader-content';
    await t.scrollTo(0, R_SCROLLER);
    await sleep(200);
    const rtext = await page.evaluate(sel => document.querySelector(sel).textContent, `${R_ROOT} a.pp-xref`);
    check(`${tag} : en Lecture le renvoi écrit le titre renommé (« ${RENAMED} »)`, rtext === RENAMED, rtext);
    const rlink = await t.centerOf(`${R_ROOT} a.pp-xref`);
    await page.mouse.move(rlink.x - 40, rlink.y); await page.mouse.move(rlink.x, rlink.y, { steps: 3 });
    await page.mouse.click(rlink.x, rlink.y);
    await sleep(500);
    const roffset = await t.offsetOf(R_SCROLLER, `${R_ROOT} > h2`);
    const hash = await page.evaluate(() => location.hash);
    check(`${tag} : un vrai clic sur le renvoi amène le titre à ${MARGIN} px du bord haut de la zone de lecture, sans changer l'adresse de la page ni ouvrir d'onglet`, close(roffset, MARGIN) && hash === '' && opened.length === 0, { roffset, hash, opened });
    await t.snap('8-lecture');
    await mode(page, 'edit');

    // === 7) La ligne dans un tableau (permise) et dans un bloc de code (grisée) ===
    console.log(`\n[${tag}] Menu : la ligne « ${S.row} » dans un tableau et dans un bloc de code`);
    await t.reveal('Case du tableau', 60);
    await sleep(200);
    const cell = await t.pointOf('Case du tableau', 0.5);
    await page.mouse.move(cell.x - 40, cell.y); await page.mouse.move(cell.x, cell.y, { steps: 3 });
    await page.mouse.click(cell.x, cell.y);
    await sleep(300);
    await t.pressRow(ROW, { click: false });
    const inCell = await page.evaluate(sel => { const r = document.querySelector(sel); return { disabled: r.getAttribute('aria-disabled'), grey: r.classList.contains('v2-hover-row-disabled'), tab: r.tabIndex }; }, ROW);
    check(`${tag} : dans une case de tableau la ligne « ${S.row} » reste disponible (un renvoi se pose dans le texte d'une case)`, inCell.disabled === 'false' && !inCell.grey && inCell.tab === 0, inCell);
    await t.closeMenu();

    await t.reveal('Exemple de code', 60);
    await sleep(200);
    const code = await t.pointOf('Exemple de code', 0.5);
    await page.mouse.move(code.x - 40, code.y); await page.mouse.move(code.x, code.y, { steps: 3 });
    await page.mouse.click(code.x, code.y);
    await sleep(300);
    await t.pressRow(ROW, { click: false });
    const grey = await page.evaluate(sel => { const r = document.querySelector(sel); return { disabled: r.getAttribute('aria-disabled'), grey: r.classList.contains('v2-hover-row-disabled'), title: r.title, tab: r.tabIndex, label: r.textContent.trim() }; }, ROW);
    const greyBox = await t.hit(ROW);
    check(`${tag} : dans un bloc de code la ligne « ${S.row} » est grisée (jamais retirée), avec sa raison en info-bulle, hors de l'ordre du clavier, toujours dans le panneau`, grey.disabled === 'true' && grey.grey && grey.title.length > 20 && grey.tab === -1 && grey.label === S.row && greyBox.found && greyBox.inPanel, { grey, greyBox });
    const at = await t.centerOf(ROW);
    await page.mouse.click(at.x, at.y);
    await sleep(300);
    check(`${tag} : un clic sur la ligne grisée n'ouvre aucune fenêtre`, !(await t.winOpen('pp-xref-modal')), null);
    await t.snap('9-grisee');
    await t.closeMenu();

    // La ligne se rallume sur un renvoi sélectionné : « Modifier le renvoi… ».
    await t.scrollTo(0);
    await sleep(250);
    const selectable = await t.centerOf('#editor-container .ProseMirror a.pp-xref');
    await page.mouse.move(selectable.x - 30, selectable.y); await page.mouse.move(selectable.x, selectable.y, { steps: 2 });
    await page.mouse.click(selectable.x, selectable.y);
    await page.evaluate(() => { const ed = EditorCore.getEditor(); let at = -1; ed.state.doc.descendants((n, p) => { if (n.type.name === 'crossRef') at = p; }); ed.chain().focus().setNodeSelection(at).run(); });
    await sleep(250);
    await t.pressRow(ROW, { click: false });
    const named = await page.evaluate(sel => { const r = document.querySelector(sel); return { disabled: r.getAttribute('aria-disabled'), active: r.classList.contains('is-active'), label: r.textContent.trim() }; }, ROW);
    check(`${tag} : sur un renvoi sélectionné, la ligne se lit « ${S.edit} » et s'allume`, named.disabled === 'false' && named.active && named.label === S.edit, named);
    await t.closeMenu();

    check(`${tag} : aucune fenêtre du navigateur (prompt, confirm) et aucune erreur de page`, nativeDialogs.length === 0 && realErrors(w).length === 0, { nativeDialogs, errors: realErrors(w) });
  } finally {
    await w.close();
  }
}

try {
  await pass('fr', 'light', 'français, clair');
  await pass('en', 'dark', 'anglais, sombre');
} catch (e) {
  check('le script va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
} finally {
  await stopServer();
}
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
