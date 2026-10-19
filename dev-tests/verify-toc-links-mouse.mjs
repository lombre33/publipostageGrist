#!/usr/bin/env node
// Les lignes d'un sommaire sont des liens (js/toc-links.js), à la VRAIE souris et au vrai clavier, à 700x400 (le panneau de Grist), en français clair puis en anglais sombre
// (19/10, demande d'Antoine : « par défaut les titres doivent être cliquables depuis le sommaire »).
//   1) Éditeur : un vrai clic sur le texte d'une ligne de l'aperçu du sommaire amène le titre en haut de la zone visible (12 px sous son bord) et y pose le curseur (une lettre tapée
//      ensuite entre dans CE titre, et un seul Ctrl+Z la retire) ; la page et la barre d'outils ne bougent pas (jamais scrollIntoView : il fait défiler aussi les ancêtres que la
//      personne ne fait pas défiler). Le pointeur dit « lien » (curseur, soulignement au survol) sans le bleu des liens du texte.
//   2) Éditeur : un vrai clic sur le vide à droite d'une ligne, hors du texte, sélectionne toujours le bloc du sommaire (pour le supprimer ou le copier) sans rien faire défiler ni
//      déplacer le curseur : rien de ce que le sommaire permettait ne disparaît.
//   3) Lecture (vrai clic sur « Mode lecture ») : un vrai clic sur une ligne, puis Entrée et Espace sur une ligne atteinte au clavier, amènent le titre en haut de la zone de lecture ;
//      une autre touche ne fait rien ; la page et la barre d'outils ne bougent pas.
//   4) Aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « tocLinksMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-toc-links-mouse.mjs
import { open, stopServer, sleep, center, fire, mode } from './load-lib.mjs';

const PORT = Number(process.env.TOC_LINKS_MOUSE_PORT || 9075);
const EDITOR_ROOT = '#editor-container .ProseMirror';
const READER_ROOT = '#reader-container .reader-content';
const MARGIN = 12; // js/toc-links.js : le titre s'arrête 12 px sous le bord haut de la zone

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

const filler = n => Array.from({ length: n }, (_, i) => `<p>Ligne ${i + 1} qui allonge le document.</p>`).join('');
// Le dernier titre est suivi d'assez de texte pour que la zone puisse défiler jusqu'à lui.
const DOC = '<div class="toc-marker"></div><h1>Alpha</h1>' + filler(30) + '<h2>Beta</h2>' + filler(30) + '<h1>Gamma</h1>' + filler(40);

const close = (a, b) => Math.abs(a - b) <= 3;

// Ce que la page et la barre d'outils ont fait : rien. `ancestors` : les conteneurs, autres que la zone qui défile, dont le défilement a bougé.
const frame = (page, scrollerSel) => page.evaluate(sel => {
  const scroller = document.querySelector(sel);
  const moved = [];
  for (let node = scroller.parentElement; node; node = node.parentElement) if (node.scrollTop || node.scrollLeft) moved.push(node.id || node.tagName);
  return {
    scrollY: window.scrollY, scrollX: window.scrollX, moved,
    toolbarTop: Math.round(document.getElementById('toolbar-top').getBoundingClientRect().top),
    scrollerTop: Math.round(scroller.getBoundingClientRect().top),
  };
}, scrollerSel);
const samePage = (a, b) => a.scrollY === 0 && a.scrollX === 0 && b.scrollY === 0 && b.scrollX === 0 && b.moved.length === 0 && a.toolbarTop === b.toolbarTop && a.scrollerTop === b.scrollerTop;

// Un vrai déplacement jusqu'au centre de `sel`, puis ce que le pointeur y trouve : son élément et son curseur.
async function moveOnto(page, sel) {
  const c = await center(page, sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 30, c.y); await page.mouse.move(c.x, c.y, { steps: 4 }); await sleep(120);
  return c;
}
const underPointer = (page, x, y) => page.evaluate(([px, py]) => {
  const el = document.elementFromPoint(px, py);
  const link = el && el.closest('.toc-link');
  return { onLink: !!link, cursor: el ? getComputedStyle(el).cursor : null, decoration: link ? getComputedStyle(link).textDecorationLine : null, color: link ? getComputedStyle(link).color : null };
}, [x, y]);

const headingOffset = (page, scrollerSel, headingSel) => page.evaluate(([scrollerSelector, headingSelector]) => {
  const scroller = document.querySelector(scrollerSelector);
  const heading = document.querySelector(headingSelector);
  return heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
}, [scrollerSel, headingSel]);

async function inEditor(page, tag) {
  console.log(`\n[${tag}] Éditeur : vrai clic sur une ligne de l'aperçu du sommaire`);
  await page.evaluate(h => Editor.setHTML(h), DOC);
  await sleep(500);
  const SCROLLER = '#editor-container';
  const line = n => `${EDITOR_ROOT} .toc-marker .toc-entry-preview:nth-of-type(${n})`;
  const link = n => `${line(n)} a.toc-link`;
  const gamma = `${EDITOR_ROOT} > h1:nth-of-type(2)`;
  const beta = `${EDITOR_ROOT} > h2`;
  await page.evaluate(s => { document.querySelector(s).scrollTop = 0; }, SCROLLER);
  await sleep(200);
  const setup = await page.evaluate(([scrollerSel, linkSel]) => {
    const scroller = document.querySelector(scrollerSel);
    const links = Array.from(document.querySelectorAll(linkSel));
    const box = links.map(a => a.getBoundingClientRect());
    const area = scroller.getBoundingClientRect();
    return { n: links.length, texts: links.map(a => a.textContent), allVisible: box.every(b => b.top >= area.top && b.bottom <= area.bottom), canScroll: scroller.scrollHeight - scroller.clientHeight, height: Math.round(area.height) };
  }, [SCROLLER, `${EDITOR_ROOT} .toc-marker a.toc-link`]);
  check(`${tag} : le sommaire a trois lignes, toutes dans la zone visible du panneau, et le document défile assez pour qu'un titre en bas soit hors de l'écran`,
    setup.n === 3 && JSON.stringify(setup.texts) === JSON.stringify(['Alpha', 'Beta', 'Gamma']) && setup.allVisible && setup.canScroll > 600, setup);

  // Le pointeur : une main (curseur « pointer ») et un soulignement au survol, la couleur de la ligne (pas le bleu d'un lien du texte).
  const c3 = await moveOnto(page, link(3));
  const hover = await underPointer(page, c3.x, c3.y);
  check(`${tag} : sous le pointeur, la ligne est un lien : curseur « pointer », soulignée au survol, sans le bleu des liens du texte`, hover.onLink && hover.cursor === 'pointer' && hover.decoration === 'underline' && hover.color !== 'rgb(5, 99, 193)', hover);
  await page.mouse.move(c3.x + 250, c3.y + 80, { steps: 3 });
  await sleep(100);
  const away = await page.evaluate(sel => getComputedStyle(document.querySelector(sel)).textDecorationLine, link(3));
  check(`${tag} : le soulignement s'en va avec le pointeur`, away === 'none', away);

  // Le vrai clic sur « Gamma ».
  const before = await frame(page, SCROLLER);
  const topBefore = await page.evaluate(s => document.querySelector(s).scrollTop, SCROLLER);
  await page.mouse.move(c3.x, c3.y, { steps: 3 }); await sleep(80);
  await page.mouse.click(c3.x, c3.y);
  await sleep(350);
  const after = await frame(page, SCROLLER);
  const offset = await headingOffset(page, SCROLLER, gamma);
  const caret = await page.evaluate(() => { const { selection } = EditorCore.getEditor().state; return { parent: selection.$from.parent.type.name + ':' + selection.$from.parent.textContent, atStart: selection.$from.parentOffset === 0, isNode: !!selection.node, focused: document.activeElement === document.querySelector('#editor-container .ProseMirror') }; });
  check(`${tag} : un vrai clic sur « Gamma » amène ce titre à ${MARGIN} px du bord haut de la zone visible (il était hors de l'écran)`, close(offset, MARGIN), { offset, topBefore });
  check(`${tag} : le curseur est au début de « Gamma », dans l'éditeur, sans bloc sélectionné`, caret.parent === 'heading:Gamma' && caret.atStart && !caret.isNode && caret.focused, caret);
  check(`${tag} : la page, la fenêtre et la barre d'outils n'ont pas bougé`, samePage(before, after), { before, after });
  await page.keyboard.type('Z');
  await sleep(150);
  const typed = await page.evaluate(sel => document.querySelector(sel).textContent, gamma);
  check(`${tag} : la lettre tapée entre dans « Gamma » (le curseur y est vraiment)`, typed === 'ZGamma', typed);
  await page.keyboard.press('Control+z');
  await sleep(200);
  const undone = await page.evaluate(([g, t]) => ({ heading: document.querySelector(g).textContent, toc: Array.from(document.querySelectorAll(t)).map(a => a.textContent) }), [gamma, `${EDITOR_ROOT} .toc-marker a.toc-link`]);
  check(`${tag} : un seul Ctrl+Z retire la lettre, le sommaire redit « Gamma »`, undone.heading === 'Gamma' && undone.toc[2] === 'Gamma', undone);

  // Un autre titre : la personne remonte au sommaire (la molette, le sommaire est en haut du document), puis clique « Beta » ; le défilement revient.
  await page.mouse.move(c3.x, c3.y + 60, { steps: 2 });
  await page.mouse.wheel(0, -6000);
  await sleep(500);
  const c2 = await moveOnto(page, link(2));
  await page.mouse.click(c2.x, c2.y);
  await sleep(350);
  const betaOffset = await headingOffset(page, SCROLLER, beta);
  const betaCaret = await page.evaluate(() => { const { $from } = EditorCore.getEditor().state.selection; return $from.parent.type.name + ':' + $from.parent.textContent; });
  check(`${tag} : un vrai clic sur « Beta » ramène ce titre à ${MARGIN} px du bord haut, le curseur dans « Beta »`, close(betaOffset, MARGIN) && betaCaret === 'heading:Beta', { betaOffset, betaCaret });

  // Le vide à droite d'une ligne : le bloc reste sélectionnable.
  await page.evaluate(s => { document.querySelector(s).scrollTop = 0; }, SCROLLER);
  await sleep(200);
  const top0 = await page.evaluate(s => document.querySelector(s).scrollTop, SCROLLER);
  const lineBox = await center(page, line(2));
  const x = lineBox.x + lineBox.w / 2 - 14;
  const hit = await underPointer(page, x, lineBox.y);
  await page.mouse.move(x - 20, lineBox.y); await page.mouse.move(x, lineBox.y, { steps: 3 }); await sleep(100);
  await page.mouse.click(x, lineBox.y);
  await sleep(300);
  const block = await page.evaluate(([sel, s]) => ({ selected: !!document.querySelector(sel + ' .toc-marker.ProseMirror-selectednode'), node: (EditorCore.getEditor().state.selection.node || {}).type ? EditorCore.getEditor().state.selection.node.type.name : null, scrollTop: document.querySelector(s).scrollTop }), [EDITOR_ROOT, SCROLLER]);
  check(`${tag} : un vrai clic dans le vide à droite d'une ligne (hors du texte) sélectionne le bloc du sommaire comme avant, sans rien faire défiler`, !hit.onLink && block.selected && block.node === 'toc' && block.scrollTop === top0, { hit, block, top0 });
}

async function inReader(page, tag) {
  console.log(`\n[${tag}] Lecture : vrai clic, puis clavier, sur une ligne du sommaire`);
  await page.evaluate(h => Editor.setHTML(h), DOC);
  await sleep(400);
  await fire(page, 'Clients', 1);
  await mode(page, 'read');
  await page.waitForFunction(() => !!document.querySelector('#reader-container .reader-content .toc-entry a.toc-link'), null, { timeout: 20000 });
  await sleep(500);
  const SCROLLER = '#reader-container';
  const link = n => `${READER_ROOT} .toc-entry:nth-of-type(${n + 1}) a.toc-link`; // la première ligne est le titre « Sommaire »
  const heading = n => `${READER_ROOT} > ` + { 1: 'h1:nth-of-type(1)', 2: 'h2', 3: 'h1:nth-of-type(2)' }[n];
  const setup = await page.evaluate(([scrollerSel, linkSel]) => {
    const scroller = document.querySelector(scrollerSel);
    scroller.scrollTop = 0;
    const links = Array.from(document.querySelectorAll(linkSel));
    const area = scroller.getBoundingClientRect();
    return { n: links.length, texts: links.map(a => a.textContent), tabbable: links.every(a => a.tabIndex === 0 && a.getAttribute('role') === 'link'), allVisible: links.every(a => { const b = a.getBoundingClientRect(); return b.top >= area.top && b.bottom <= area.bottom; }), canScroll: scroller.scrollHeight - scroller.clientHeight };
  }, [SCROLLER, `${READER_ROOT} .toc-entry a.toc-link`]);
  check(`${tag} : en Lecture le sommaire a trois lignes, des liens que le clavier atteint (Tab), toutes dans la zone visible`, setup.n === 3 && JSON.stringify(setup.texts) === JSON.stringify(['Alpha', 'Beta', 'Gamma']) && setup.tabbable && setup.allVisible && setup.canScroll > 600, setup);
  await sleep(200);

  const c3 = await moveOnto(page, link(3));
  const hover = await underPointer(page, c3.x, c3.y);
  check(`${tag} : sous le pointeur, la ligne est un lien (curseur « pointer », soulignée au survol)`, hover.onLink && hover.cursor === 'pointer' && hover.decoration === 'underline', hover);
  const before = await frame(page, SCROLLER);
  await page.mouse.click(c3.x, c3.y);
  await sleep(350);
  const after = await frame(page, SCROLLER);
  const byClick = await headingOffset(page, SCROLLER, heading(3));
  check(`${tag} : un vrai clic sur « Gamma » amène ce titre à ${MARGIN} px du bord haut de la zone de lecture`, close(byClick, MARGIN), { byClick });
  check(`${tag} : la page, la fenêtre et la barre d'outils n'ont pas bougé`, samePage(before, after), { before, after });

  // Le clavier : le focus sur la ligne (ce que Tab y amène), puis Entrée, Espace, une autre touche.
  await page.focus(link(2));
  await page.keyboard.press('Enter');
  await sleep(350);
  const byEnter = await headingOffset(page, SCROLLER, heading(2));
  check(`${tag} : Entrée sur la ligne « Beta » amène ce titre à ${MARGIN} px du bord haut`, close(byEnter, MARGIN), { byEnter });
  await page.focus(link(3));
  await sleep(200);
  const topBefore = await page.evaluate(s => document.querySelector(s).scrollTop, SCROLLER);
  await page.keyboard.press('a');
  await sleep(200);
  const topAfter = await page.evaluate(s => document.querySelector(s).scrollTop, SCROLLER);
  check(`${tag} : une autre touche (« a ») sur une ligne ne fait rien défiler`, topBefore === topAfter, { topBefore, topAfter });
  await page.focus(link(1));
  await page.keyboard.press('Space');
  await sleep(350);
  const bySpace = await headingOffset(page, SCROLLER, heading(1));
  check(`${tag} : Espace sur la ligne « Alpha » amène ce titre à ${MARGIN} px du bord haut`, close(bySpace, MARGIN), { bySpace });
  await mode(page, 'edit');
}

async function pass(lang, theme, tag) {
  const w = await open({ spec: { tables: [{ id: 'Clients', rows: 3, columns: [{ id: 'Nom', type: 'Text' }] }] }, port: PORT, settleMs: 1500, theme, lang });
  try {
    await inEditor(w.page, tag);
    await inReader(w.page, tag);
    check(`${tag} : aucune erreur de page`, realErrors(w).length === 0, realErrors(w));
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
