#!/usr/bin/env node
// Les signets (js/anchors.js, js/bookmark-dialog.js) et le choix « Dans ce document » de la fenêtre « Lien… » (js/link-dialog.js), à la VRAIE souris et au vrai clavier, à 700x400 (le panneau
// de Grist), en français clair puis en anglais sombre (19/10, demande d'Antoine : « feature d'ajout de signet cliquable et référençable »). Ce que dev-tests/scenarios-bookmarks.js ne peut
// pas voir depuis la page : un survol, un clic « trusted », la place des fenêtres dans le panneau, ce qui les recouvre, le clavier rendu à l'éditeur.
//   1) Le menu de la chaîne : la ligne « Signet… » est la deuxième, dans le panneau et au premier plan ; grisée dans un tableau (raison en info-bulle), un clic n'ouvre rien.
//   2) La fenêtre du signet par un vrai clic sur la ligne : elle tient dans le panneau (titre, champ, notes, boutons au premier plan), le focus est dans le champ, un nom vide est refusé
//      avec sa raison, l'adresse se lit sous le champ à mesure de la frappe, Entrée pose le signet, le drapeau apparaît dans la marge du bloc et le clavier revient dans l'éditeur.
//   3) Un vrai clic sur le drapeau rouvre la fenêtre sur ce signet (« Retirer le signet », liens comptés), la plus haute (erreur + notes) tient aussi ; Échap rend le clavier à l'éditeur.
//   4) « Lien… » (Ctrl+K au vrai clavier) > « Dans ce document » : la liste avec recherche s'ouvre dans le panneau, au premier plan ; la frappe la filtre, Entrée choisit, le lien est posé.
//   5) Le lien dans l'éditeur : l'info-bulle au survol nomme le signet et reste dans le panneau ; un clic simple ne bouge rien, Ctrl+clic amène le bloc en haut de la zone visible et y pose le curseur.
//   6) La Lecture : un vrai clic sur le lien (puis Entrée au clavier) amène le bloc en haut de la zone de lecture, sans ouvrir d'onglet ni changer l'adresse de la page.
//   7) Les contrastes (>= 4,5:1 pour les textes, >= 3:1 pour le drapeau) en clair et en sombre ; aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « bookmarksMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-bookmarks-mouse.mjs
// BOOKMARKS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { open, stopServer, sleep, center, fire, mode } from './load-lib.mjs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const PORT = Number(process.env.BOOKMARKS_MOUSE_PORT || 9085);
const SHOTS = process.env.BOOKMARKS_SHOTS || '';
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
const ROW = '#v2-row-bookmark';
const BM = '#pp-bookmark-modal';
const LK = '#pp-link-modal';
const SCROLLER = '#editor-container';
const EDITOR = `${SCROLLER} .ProseMirror`;

const filler = (n, tag = 'Ligne') => Array.from({ length: n }, (_, i) => `<p>${tag} ${i + 1} qui allonge le document.</p>`).join('');
const DOC = '<p>Sommaire des renvois</p>' + filler(30, 'Début')
  + '<h2>Conditions générales</h2><p>Les conditions s\'appliquent.</p>' + filler(30, 'Milieu')
  + '<p>Paragraphe final du contrat</p>' + filler(30, 'Fin')
  + '<table><tbody><tr><td><p>Case du tableau</p></td><td><p>Autre case</p></td></tr></tbody></table><p>Après le tableau</p>';
const NAME = 'Fin du contrat';
const ID = 'fin-du-contrat';

const STR = {
  fr: { link: 'Lien…', add: 'Ajouter', row: 'Signet…', edit: 'Modifier le signet…', addTitle: 'Ajouter un signet', editTitle: 'Modifier le signet', doc: 'Dans ce document', remove: 'Retirer le signet', empty: 'Donnez un nom au signet.', tip: 'Dans ce document : ' + NAME, tipHint: /^(Ctrl|⌘)\+clic pour y aller$/, flag: 'Signet : ' + NAME, address: 'Adresse du signet : ' + ID, links: '1 lien mène à ce signet : le retirer les laisse sans cible.' },
  en: { link: 'Link…', add: 'Add', row: 'Bookmark…', edit: 'Edit bookmark…', addTitle: 'Add a bookmark', editTitle: 'Edit the bookmark', doc: 'In this document', remove: 'Remove bookmark', empty: 'Give the bookmark a name.', tip: 'In this document: ' + NAME, tipHint: /^(Ctrl|⌘)\+click to go there$/, flag: 'Bookmark: ' + NAME, address: 'Bookmark address: ' + ID, links: '1 link points to this bookmark: removing it leaves it without a target.' },
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
    const win = a.closest('#pp-bookmark-modal, #pp-link-modal');
    return win ? (a.id || a.className || a.tagName) : 'ailleurs : ' + (a.id || a.tagName);
  });
  // Le rapport de contraste WCAG du texte d'un élément sur son fond réel (ou, avec `paint`, de la couleur de fond de l'élément lui-même - le drapeau est un masque peint de cette couleur - sur le fond de son parent).
  const contrastOf = (selector, paint = false) => page.evaluate(([sel, asPaint]) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(s => parseFloat(s)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    const layers = [];
    for (let n = asPaint ? el.parentElement : el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (const c of layers.reverse()) base = mix(c, base);
    let fg = parse(asPaint ? getComputedStyle(el).backgroundColor : getComputedStyle(el).color);
    if (fg.a < 1) fg = mix(fg, base);
    const a = lum(fg), b = lum(base);
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  }, [selector, paint]);
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
  // Ce que la page et la barre d'outils ont fait : rien.
  const frame = scroller => page.evaluate(sel => {
    const area = document.querySelector(sel);
    const moved = [];
    for (let node = area.parentElement; node; node = node.parentElement) if (node.scrollTop || node.scrollLeft) moved.push(node.id || node.tagName);
    return { scrollY: window.scrollY, scrollX: window.scrollX, moved, toolbarTop: Math.round(document.getElementById('toolbar-top').getBoundingClientRect().top), areaTop: Math.round(area.getBoundingClientRect().top) };
  }, scroller);
  const samePage = (a, b) => a.scrollY === 0 && a.scrollX === 0 && b.scrollY === 0 && b.scrollX === 0 && b.moved.length === 0 && a.toolbarTop === b.toolbarTop && a.areaTop === b.areaTop;
  const offsetOf = (scroller, selector) => page.evaluate(([s, sel]) => document.querySelector(sel).getBoundingClientRect().top - document.querySelector(s).getBoundingClientRect().top, [scroller, selector]);
  const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${tag}-${name}.png`) }); };

  // Survol réel de l'icône du menu : la souris arrive depuis le bas du document (jamais par-dessus un autre volet de la barre).
  async function openMenu() {
    const c = await centerOf(MAIN);
    await page.mouse.move(c.x, c.y + 150);
    await page.mouse.move(c.x, c.y, { steps: 4 });
    await sleep(350);
    return c;
  }
  async function closeMenu() {
    // Le volet à huit lignes descend à ~395 px et couvre le bas du milieu du panneau : la souris le quitte par le coin bas droit.
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
  return { centerOf, hit, seen, winOpen, html, focusIn, contrastOf, pointOf, reveal, scrollTo, frame, samePage, offsetOf, snap, openMenu, closeMenu, pressRow };
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
    await t.reveal('Paragraphe final du contrat');
    await sleep(150);
    const target = await t.pointOf('Paragraphe final du contrat', 0.3);
    await page.mouse.move(target.x - 40, target.y); await page.mouse.move(target.x, target.y, { steps: 3 });
    await page.mouse.click(target.x, target.y);
    await sleep(250);
    await t.openMenu();
    const flyout = await t.hit('#v2-blocks-flyout');
    const row = await t.hit(ROW);
    const rowLabel = await page.evaluate(sel => document.querySelector(sel).textContent.trim(), ROW);
    const order = await page.evaluate(() => Array.from(document.querySelectorAll('#v2-blocks-flyout .v2-menu-row')).map(r => r.id));
    check(`${tag} : au survol de la chaîne, le volet s'ouvre dans le panneau et la ligne « ${S.row} » y est, deuxième, au premier plan`, flyout.found && flyout.inPanel && t.seen(row) && order[1] === 'v2-row-bookmark' && rowLabel === S.row, { flyout, row, order, rowLabel });
    const rowColor = await t.contrastOf(ROW);
    check(`${tag} : le texte de la ligne se lit (>= 4,5:1)`, rowColor >= 4.5, rowColor);
    await t.snap('1-menu');
    await t.closeMenu();

    // === 2) La fenêtre du signet ===
    console.log(`\n[${tag}] Fenêtre du signet : pose`);
    await t.pressRow(ROW);
    const win = await t.hit(`${BM} .modal-content`);
    const parts = { title: await t.hit(`${BM} h3`), input: await t.hit('#pp-bookmark-name'), ok: await t.hit(`${BM} .var-modal-primary`), cancel: await t.hit(`${BM} .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)`), note: await t.hit('#pp-bookmark-address') };
    const title = await page.evaluate(() => document.getElementById('pp-bookmark-title').textContent);
    check(`${tag} : un vrai clic sur la ligne ouvre la fenêtre « ${S.addTitle} », entière dans ${WIDTH}x${HEIGHT} : titre, champ, note et boutons au premier plan`, (await t.winOpen('pp-bookmark-modal')) && title === S.addTitle && win.inPanel && Object.values(parts).every(t.seen), { title, win, parts });
    check(`${tag} : le focus est dans le champ du nom, qui est vide (un paragraphe)`, (await t.focusIn()) === 'pp-bookmark-name' && (await page.evaluate(() => document.getElementById('pp-bookmark-name').value)) === '', await t.focusIn());
    await t.snap('2-fenetre');

    // Un nom vide : refusé, la raison sous le champ, la fenêtre reste dans le panneau.
    await page.mouse.click((await t.centerOf(`${BM} .var-modal-primary`)).x, (await t.centerOf(`${BM} .var-modal-primary`)).y);
    await sleep(150);
    const empty = { error: await t.hit('#pp-bookmark-error'), ok: await t.hit(`${BM} .var-modal-primary`), win: await t.hit(`${BM} .modal-content`), text: await page.evaluate(() => document.getElementById('pp-bookmark-error').textContent) };
    check(`${tag} : un clic sur « ${S.add} » sans nom ne pose rien : « ${S.empty} » sous le champ, boutons et fenêtre toujours dans le panneau`, (await t.winOpen('pp-bookmark-modal')) && empty.text === S.empty && t.seen(empty.error) && t.seen(empty.ok) && empty.win.inPanel, empty);
    const errColor = await t.contrastOf('#pp-bookmark-error');
    check(`${tag} : le texte de l'erreur se lit (>= 4,5:1)`, errColor >= 4.5, errColor);
    await t.snap('3-erreur');

    // La frappe réelle du nom : l'adresse se lit à mesure, Entrée pose le signet.
    await page.keyboard.type(NAME, { delay: 10 });
    await sleep(150);
    const address = await page.evaluate(() => document.getElementById('pp-bookmark-address').textContent);
    const addressColor = await t.contrastOf('#pp-bookmark-address');
    check(`${tag} : l'adresse tirée du nom se lit sous le champ (« ${S.address} »), l'erreur a disparu, la note se lit (>= 4,5:1)`, address === S.address && (await t.hit('#pp-bookmark-error')).inPanel === false && addressColor >= 4.5, { address, addressColor });
    await page.keyboard.press('Enter');
    await sleep(300);
    const afterAdd = await t.html();
    check(`${tag} : Entrée pose le signet « ${NAME} » sur le paragraphe, la fenêtre se ferme, le clavier est revenu dans l'éditeur`,
      !(await t.winOpen('pp-bookmark-modal')) && new RegExp(`<p data-anchor="${ID}" data-anchor-name="${NAME}">Paragraphe final du contrat</p>`).test(afterAdd) && (await t.focusIn()) === 'editor', { open: await t.winOpen('pp-bookmark-modal'), focus: await t.focusIn(), html: afterAdd.slice(afterAdd.indexOf('Paragraphe final') - 90, afterAdd.indexOf('Paragraphe final') + 40) });

    // Le drapeau : dans la marge du bloc, visible, qui ne décale rien, lisible.
    const flag = await page.evaluate(() => {
      const f = document.querySelector('.tiptap .pp-anchor-flag');
      if (!f) return null;
      const r = f.getBoundingClientRect(), p = f.parentElement.getBoundingClientRect();
      return { title: f.title, hidden: f.getAttribute('aria-hidden'), count: document.querySelectorAll('.pp-anchor-flag').length, left: r.right <= p.left + 0.5, inPanel: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, size: [Math.round(r.width), Math.round(r.height)], parentText: f.parentElement.textContent };
    });
    const flagContrast = await t.contrastOf('.tiptap .pp-anchor-flag', true);
    check(`${tag} : le drapeau du signet est dans la marge du paragraphe, dans le panneau, avec son nom en info-bulle (« ${S.flag} »), caché des lecteurs d'écran`, !!flag && flag.title === S.flag && flag.hidden === 'true' && flag.count === 1 && flag.left && flag.inPanel && flag.parentText === 'Paragraphe final du contrat', flag);
    check(`${tag} : le drapeau se distingue de la feuille (>= 3:1)`, flagContrast >= 3, flagContrast);
    await t.snap('4-drapeau');

    // Le drapeau n'est pas du contenu : rien dans le HTML du document.
    check(`${tag} : le drapeau n'est pas écrit dans le document`, !afterAdd.includes('pp-anchor-flag'), null);

    // === 3) Un vrai clic sur le drapeau ===
    console.log(`\n[${tag}] Fenêtre du signet : un clic sur le drapeau`);
    const flagAt = await t.centerOf('.tiptap .pp-anchor-flag');
    await page.mouse.move(flagAt.x - 30, flagAt.y); await page.mouse.move(flagAt.x, flagAt.y, { steps: 3 }); await sleep(80);
    const pointer = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return { onFlag: !!el && el.classList.contains('pp-anchor-flag'), cursor: el ? getComputedStyle(el).cursor : null }; }, [flagAt.x, flagAt.y]);
    await page.mouse.click(flagAt.x, flagAt.y);
    await sleep(300);
    const edit = { title: await page.evaluate(() => document.getElementById('pp-bookmark-title').textContent), value: await page.evaluate(() => document.getElementById('pp-bookmark-name').value), remove: await t.hit(`${BM} .var-modal-danger`), win: await t.hit(`${BM} .modal-content`), ok: await t.hit(`${BM} .var-modal-primary`) };
    check(`${tag} : le pointeur sur le drapeau est une main ; un vrai clic rouvre la fenêtre « ${S.editTitle} » sur ce signet, avec « ${S.remove} » au premier plan`, pointer.onFlag && pointer.cursor === 'pointer' && (await t.winOpen('pp-bookmark-modal')) && edit.title === S.editTitle && edit.value === NAME && t.seen(edit.remove) && t.seen(edit.ok) && edit.win.inPanel, { pointer, edit });
    await t.snap('5-modifier');
    await page.keyboard.press('Escape');
    await sleep(250);
    check(`${tag} : Échap ferme la fenêtre sans rien changer et rend le clavier à l'éditeur`, !(await t.winOpen('pp-bookmark-modal')) && (await t.html()) === afterAdd && (await t.focusIn()) === 'editor', { open: await t.winOpen('pp-bookmark-modal'), focus: await t.focusIn() });

    // === 4) « Lien… » > « Dans ce document » ===
    console.log(`\n[${tag}] Lien : « ${S.doc} »`);
    await t.scrollTo(0);
    await sleep(200);
    const word = await t.pointOf('Sommaire', 0.5);
    await page.mouse.move(word.x - 30, word.y); await page.mouse.move(word.x, word.y, { steps: 3 });
    await page.mouse.dblclick(word.x, word.y);
    await sleep(250);
    const selected = await page.evaluate(() => window.getSelection().toString());
    await page.keyboard.press('Control+k');
    await sleep(300);
    const linkWin = { win: await t.hit(`${LK} .modal-content`), radios: await page.evaluate(() => Array.from(document.querySelectorAll('#pp-link-modal input[name="pp-link-mode"]')).map(i => ({ value: i.value, checked: i.checked, text: i.parentElement.textContent.trim() }))) };
    check(`${tag} : un double-clic sélectionne « Sommaire », Ctrl+K ouvre « ${S.link} » avec ses deux choix (« ${S.doc} » en second), fenêtre dans le panneau`, selected.trim() === 'Sommaire' && (await t.winOpen('pp-link-modal')) && linkWin.win.inPanel && linkWin.radios.length === 2 && linkWin.radios[1].text === S.doc && linkWin.radios[0].checked, { selected, linkWin });
    // Le vrai clic sur le choix « Dans ce document ».
    const radio = await t.centerOf(`${LK} .pp-link-modes label:nth-of-type(2)`);
    await page.mouse.move(radio.x - 20, radio.y); await page.mouse.move(radio.x, radio.y, { steps: 3 });
    await page.mouse.click(radio.x, radio.y);
    await sleep(250);
    const docMode = await page.evaluate(() => ({ checked: document.querySelector('#pp-link-modal input[value="document"]').checked, webHidden: document.getElementById('pp-link-url').closest('.pp-link-field').hidden, docShown: !document.getElementById('pp-link-target').closest('.pp-link-field').hidden }));
    const trigger = await t.hit(`${LK} .ss-trigger`);
    check(`${tag} : un vrai clic sur « ${S.doc} » montre la liste à la place de l'adresse, le champ de la liste est au premier plan`, docMode.checked && docMode.webHidden && docMode.docShown && t.seen(trigger), { docMode, trigger });
    const hintColor = await t.contrastOf('#pp-link-target-hint');
    const modeColor = await t.contrastOf(`${LK} .pp-link-modes label:nth-of-type(2)`);
    check(`${tag} : la note sous la liste et les choix se lisent (>= 4,5:1)`, hintColor >= 4.5 && modeColor >= 4.5, { hintColor, modeColor });
    await t.snap('6-lien-document');

    // Valider sans choix : l'erreur reste dans le panneau.
    await page.mouse.click((await t.centerOf(`${LK} .var-modal-primary`)).x, (await t.centerOf(`${LK} .var-modal-primary`)).y);
    await sleep(200);
    const noChoice = { error: await t.hit('#pp-link-target-error'), ok: await t.hit(`${LK} .var-modal-primary`), win: await t.hit(`${LK} .modal-content`), open: await t.winOpen('pp-link-modal') };
    const noChoiceColor = await t.contrastOf('#pp-link-target-error');
    check(`${tag} : un clic sur le bouton d'enregistrement sans rien choisir ne pose rien : l'erreur est sous la liste, la fenêtre et ses boutons restent dans le panneau, le texte se lit (>= 4,5:1)`, noChoice.open && t.seen(noChoice.error) && t.seen(noChoice.ok) && noChoice.win.inPanel && noChoiceColor >= 4.5, { noChoice, noChoiceColor });
    await t.snap('7-lien-erreur');

    // La liste avec recherche : un vrai clic ouvre le panneau, la frappe filtre, Entrée choisit.
    const trig = await t.centerOf(`${LK} .ss-trigger`);
    await page.mouse.move(trig.x - 30, trig.y); await page.mouse.move(trig.x, trig.y, { steps: 3 });
    await page.mouse.click(trig.x, trig.y);
    await sleep(300);
    const panel = await page.evaluate(() => {
      const shown = Array.from(document.querySelectorAll('.ss-panel')).find(p => p.getBoundingClientRect().height > 0);
      if (!shown) return { found: false };
      const r = shown.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { found: true, inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && shown.contains(top), box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] };
    });
    const rowsBefore = await page.evaluate(() => {
      const shown = Array.from(document.querySelectorAll('.ss-panel')).find(p => p.getBoundingClientRect().height > 0);
      return { groups: shown ? Array.from(shown.querySelectorAll('.ss-group')).map(g => g.textContent) : [], options: shown ? Array.from(shown.querySelectorAll('.ss-option .ss-name')).map(o => o.textContent) : [] };
    });
    check(`${tag} : un vrai clic ouvre la liste dans le panneau, au premier plan, avec ses deux groupes (titres, signets) et leurs choix`, panel.found && panel.inPanel && panel.onTop && rowsBefore.groups.length === 2 && JSON.stringify(rowsBefore.options) === JSON.stringify(['Conditions générales', NAME]), { panel, rowsBefore });
    await t.snap('8-liste');
    await page.keyboard.type('fin', { delay: 25 });
    await sleep(250);
    const filtered = await page.evaluate(() => { const shown = Array.from(document.querySelectorAll('.ss-panel')).find(p => p.getBoundingClientRect().height > 0); return shown ? Array.from(shown.querySelectorAll('.ss-option .ss-name')).map(o => o.textContent) : null; });
    check(`${tag} : la frappe « fin » ne laisse que « ${NAME} »`, JSON.stringify(filtered) === JSON.stringify([NAME]), filtered);
    await page.keyboard.press('Enter');
    await sleep(250);
    const chosen = await page.evaluate(() => ({ value: document.getElementById('pp-link-target').value, shown: document.querySelector('#pp-link-modal .ss-trigger .ss-name').textContent, panelOpen: Array.from(document.querySelectorAll('.ss-panel')).some(p => p.getBoundingClientRect().height > 0), open: document.getElementById('pp-link-modal').style.display !== 'none' }));
    check(`${tag} : Entrée choisit « ${NAME} » dans le champ ; la liste se ferme, la fenêtre reste ouverte`, chosen.value === 'a:' + ID && chosen.shown === NAME && !chosen.panelOpen && chosen.open, chosen);
    await page.mouse.click((await t.centerOf(`${LK} .var-modal-primary`)).x, (await t.centerOf(`${LK} .var-modal-primary`)).y);
    await sleep(300);
    const linked = await t.html();
    check(`${tag} : le lien est posé : « Sommaire » mène à #${ID} ; la fenêtre est fermée, le clavier est revenu dans l'éditeur`, new RegExp(`<a [^>]*href="#${ID}"[^>]*>Sommaire</a>`).test(linked) && !(await t.winOpen('pp-link-modal')) && (await t.focusIn()) === 'editor', { html: linked.slice(0, 220), focus: await t.focusIn() });

    // === La fenêtre du signet, la plus haute : le lien qui y mène est compté, une erreur par-dessus ===
    await t.reveal('Paragraphe final du contrat');
    await sleep(150);
    const flagAgain = await t.centerOf('.tiptap .pp-anchor-flag');
    await page.mouse.move(flagAgain.x - 30, flagAgain.y); await page.mouse.move(flagAgain.x, flagAgain.y, { steps: 3 });
    await page.mouse.click(flagAgain.x, flagAgain.y);
    await sleep(300);
    const linksNote = await page.evaluate(() => { const n = document.getElementById('pp-bookmark-links'); return { hidden: n.hidden, text: n.textContent }; });
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.mouse.click((await t.centerOf(`${BM} .var-modal-primary`)).x, (await t.centerOf(`${BM} .var-modal-primary`)).y);
    await sleep(200);
    const tall = { win: await t.hit(`${BM} .modal-content`), title: await t.hit(`${BM} h3`), links: await t.hit('#pp-bookmark-links'), error: await t.hit('#pp-bookmark-error'), ok: await t.hit(`${BM} .var-modal-primary`), remove: await t.hit(`${BM} .var-modal-danger`), cancel: await t.hit(`${BM} .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)`) };
    const linksColor = await t.contrastOf('#pp-bookmark-links');
    check(`${tag} : la fenêtre du signet dans son état le plus haut (la note des liens « ${S.links} » et l'erreur) tient entière dans ${WIDTH}x${HEIGHT}, ses trois boutons au premier plan`, !linksNote.hidden && linksNote.text === S.links && tall.win.inPanel && Object.values(tall).every(t.seen), { linksNote, tall });
    check(`${tag} : la note des liens se lit (>= 4,5:1)`, linksColor >= 4.5, linksColor);
    await t.snap('9-fenetre-haute');
    await page.keyboard.press('Escape');
    await sleep(250);

    // === 5) Le lien dans l'éditeur : info-bulle, clic simple, Ctrl+clic ===
    console.log(`\n[${tag}] Éditeur : le lien vers le signet`);
    await t.scrollTo(0);
    await sleep(250);
    const link = await t.pointOf('Sommaire', 0.5);
    await page.mouse.move(link.x - 60, link.y + 40); await page.mouse.move(link.x, link.y, { steps: 5 });
    await sleep(1000);
    const tip = await page.evaluate(() => {
      const tipEl = document.querySelector('.pp-link-tip');
      if (!tipEl || tipEl.hidden) return null;
      const r = tipEl.getBoundingClientRect();
      return { lines: Array.from(tipEl.children).map(c => c.textContent), inPanel: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
    });
    const tipColor = await t.contrastOf('.pp-link-tip');
    check(`${tag} : au survol, l'info-bulle nomme le signet (« ${S.tip} ») et invite à Ctrl+clic, dans le panneau, lisible (>= 4,5:1)`, !!tip && tip.lines[0] === S.tip && S.tipHint.test(tip.lines[1] || '') && tip.inPanel && tipColor >= 4.5, { tip, tipColor });
    await t.snap('10-infobulle');

    // Un clic simple : le curseur se pose dans le lien, rien ne défile.
    const topBefore = await page.evaluate(s => document.querySelector(s).scrollTop, SCROLLER);
    await page.mouse.click(link.x, link.y);
    await sleep(300);
    const topPlain = await page.evaluate(s => document.querySelector(s).scrollTop, SCROLLER);
    check(`${tag} : un clic simple sur le lien ne fait rien défiler et n'ouvre aucun onglet`, topBefore === topPlain && opened.length === 0, { topBefore, topPlain, opened });

    // Ctrl+clic : le paragraphe du signet vient en haut de la zone, le curseur y est ; la page et la barre d'outils n'ont pas bougé.
    const before = await t.frame(SCROLLER);
    await page.mouse.move(link.x - 5, link.y); await page.mouse.move(link.x, link.y, { steps: 2 });
    await page.keyboard.down('Control');
    await page.mouse.click(link.x, link.y);
    await page.keyboard.up('Control');
    await sleep(500);
    const after = await t.frame(SCROLLER);
    const offset = await t.offsetOf(SCROLLER, `${EDITOR} > p[data-anchor="${ID}"]`);
    const caret = await page.evaluate(() => { const { $from } = EditorCore.getEditor().state.selection; return { parent: $from.parent.type.name + ':' + $from.parent.textContent, focused: document.activeElement === document.querySelector('#editor-container .ProseMirror') }; });
    check(`${tag} : Ctrl+clic amène le paragraphe du signet à ${MARGIN} px du bord haut de la zone visible (il était hors de l'écran) et y pose le curseur`, close(offset, MARGIN) && caret.parent === 'paragraph:Paragraphe final du contrat' && caret.focused, { offset, caret });
    check(`${tag} : la page, la fenêtre et la barre d'outils n'ont pas bougé, aucun onglet ouvert`, t.samePage(before, after) && opened.length === 0, { before, after, opened });
    await page.keyboard.type('Z');
    await sleep(150);
    const typed = await page.evaluate(sel => document.querySelector(sel).textContent, `${EDITOR} > p[data-anchor="${ID}"]`);
    check(`${tag} : la lettre tapée ensuite entre dans le paragraphe du signet (le curseur y est vraiment)`, typed.indexOf('Z') >= 0 && typed.length === 'Paragraphe final du contrat'.length + 1, typed);
    await page.keyboard.press('Control+z');
    await sleep(200);

    // === 6) La Lecture ===
    console.log(`\n[${tag}] Lecture : le lien vers le signet`);
    await t.scrollTo(0);
    await fire(page, 'Clients', 1);
    await mode(page, 'read');
    await page.waitForFunction(() => !!document.querySelector('#reader-container .reader-content a[href^="#"]'), null, { timeout: 20000 });
    await sleep(500);
    const R_SCROLLER = '#reader-container';
    const R_ROOT = '#reader-container .reader-content';
    await t.scrollTo(0, R_SCROLLER);
    await sleep(200);
    const rlink = await t.centerOf(`${R_ROOT} a[href="#${ID}"]`);
    const rsetup = await page.evaluate(sel => { const a = document.querySelector(sel); return { target: a.getAttribute('target'), rel: a.getAttribute('rel'), tabIndex: a.tabIndex, cursor: getComputedStyle(a).cursor, flags: document.querySelectorAll('#reader-container .pp-anchor-flag').length, canScroll: document.querySelector('#reader-container').scrollHeight - document.querySelector('#reader-container').clientHeight }; }, `${R_ROOT} a[href="#${ID}"]`);
    check(`${tag} : en Lecture le lien reste dans la page (ni target ni rel), au clavier (Tab), sans drapeau, et le document défile assez pour que le bloc soit hors de l'écran`, rsetup.target === null && rsetup.rel === null && rsetup.tabIndex === 0 && rsetup.flags === 0 && rsetup.canScroll > 600, rsetup);
    const rbefore = await t.frame(R_SCROLLER);
    await page.mouse.move(rlink.x - 40, rlink.y); await page.mouse.move(rlink.x, rlink.y, { steps: 3 });
    await page.mouse.click(rlink.x, rlink.y);
    await sleep(500);
    const rafter = await t.frame(R_SCROLLER);
    const roffset = await t.offsetOf(R_SCROLLER, `${R_ROOT} > p[data-anchor="${ID}"]`);
    const hash = await page.evaluate(() => location.hash);
    check(`${tag} : un vrai clic sur le lien amène le paragraphe du signet à ${MARGIN} px du bord haut de la zone de lecture, sans changer l'adresse de la page ni ouvrir d'onglet`, close(roffset, MARGIN) && hash === '' && opened.length === 0, { roffset, hash, opened });
    check(`${tag} : la page, la fenêtre et la barre d'outils n'ont pas bougé`, t.samePage(rbefore, rafter), { rbefore, rafter });
    // Le clavier : Tab amène le focus sur le lien, Entrée le suit.
    await t.scrollTo(0, R_SCROLLER);
    await sleep(200);
    await page.focus(`${R_ROOT} a[href="#${ID}"]`);
    await page.keyboard.press('Enter');
    await sleep(500);
    const byEnter = await t.offsetOf(R_SCROLLER, `${R_ROOT} > p[data-anchor="${ID}"]`);
    check(`${tag} : Entrée sur le lien amène aussi le paragraphe à ${MARGIN} px du bord haut`, close(byEnter, MARGIN), { byEnter });
    await mode(page, 'edit');

    // === 1 bis) La ligne grisée dans un tableau ===
    console.log(`\n[${tag}] Menu : la ligne « ${S.row} » dans un tableau`);
    await t.reveal('Case du tableau', 60);
    await sleep(200);
    const cell = await t.pointOf('Case du tableau', 0.5);
    await page.mouse.move(cell.x - 40, cell.y); await page.mouse.move(cell.x, cell.y, { steps: 3 });
    await page.mouse.click(cell.x, cell.y);
    await sleep(300);
    await t.pressRow(ROW, { click: false });
    const grey = await page.evaluate(sel => { const r = document.querySelector(sel); return { disabled: r.getAttribute('aria-disabled'), grey: r.classList.contains('v2-hover-row-disabled'), title: r.title, tab: r.tabIndex, label: r.textContent.trim() }; }, ROW);
    const greyBox = await t.hit(ROW);
    check(`${tag} : dans une case de tableau la ligne « ${S.row} » est grisée (jamais retirée), avec sa raison en info-bulle, hors de l'ordre du clavier, toujours dans le panneau`, grey.disabled === 'true' && grey.grey && grey.title.length > 20 && grey.tab === -1 && grey.label === S.row && greyBox.found && greyBox.inPanel, { grey, greyBox });
    const at = await t.centerOf(ROW);
    await page.mouse.click(at.x, at.y);
    await sleep(300);
    check(`${tag} : un clic sur la ligne grisée n'ouvre aucune fenêtre`, !(await t.winOpen('pp-bookmark-modal')) && !(await t.winOpen('pp-link-modal')), null);
    await t.snap('11-grisee');
    await t.closeMenu();

    // La ligne se rallume dans un paragraphe qui porte un signet : « Modifier le signet… ».
    await t.reveal('Paragraphe final du contrat');
    await sleep(200);
    const back = await t.pointOf('Paragraphe final du contrat', 0.3);
    await page.mouse.move(back.x - 40, back.y); await page.mouse.move(back.x, back.y, { steps: 3 });
    await page.mouse.click(back.x, back.y);
    await sleep(300);
    await t.pressRow(ROW, { click: false });
    const named = await page.evaluate(sel => { const r = document.querySelector(sel); return { disabled: r.getAttribute('aria-disabled'), active: r.classList.contains('is-active'), label: r.textContent.trim() }; }, ROW);
    check(`${tag} : dans un paragraphe qui porte un signet, la ligne se lit « ${S.edit} » et s'allume`, named.disabled === 'false' && named.active && named.label === S.edit, named);
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
