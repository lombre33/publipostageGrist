#!/usr/bin/env node
// La barre du sommaire (js/floating-toolbars.js:createTocToolbar) à la VRAIE souris et au vrai clavier, à 700x400 (le panneau de Grist), en français clair puis en anglais sombre
// (10/11, demande d'Antoine : « pour l'ajout du sommaire, un petit bandeau de choix au-dessus pour choisir les niveaux de titre à afficher et si on veut afficher le numéro de la page de chaque titre ») :
//   1) un vrai clic sur « Insérer un sommaire » : le sommaire est sélectionné et la barre s'ouvre AU-DESSUS de lui, toute dans le panneau, avec ses textes dans la langue de l'interface (« Titres H1 à H6 »,
//      « N° de page » allumé) ; elle ne prend aucune place dans la feuille (le sommaire et le texte qui le suit ne bougent pas quand elle s'ouvre ou se ferme) ;
//   2) les deux listes se règlent à la vraie souris et au vrai clavier (un clic ouvre la liste, des flèches, Entrée) : l'aperçu ne liste que les niveaux choisis, le sommaire reste sélectionné et la
//      barre ouverte, un niveau qui dépasse l'autre l'emmène avec lui ; un seul Ctrl + Z rend l'état d'avant (la barre le redit) ;
//   3) le bouton « N° de page » (un vrai clic) allume ou éteint le numéro de page de chaque titre dans l'aperçu ; les réglages sont écrits dans le HTML (data-toc-*) et plus rien n'y est écrit quand ils
//      redeviennent ceux d'avant ;
//   4) un clic dans le texte ferme la barre, un clic sur le sommaire la rouvre, le même document en lecture seule n'a pas de barre ;
//   5) Lecture : le sommaire ne liste que les niveaux choisis ; aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « tocBarMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-toc-bar-mouse.mjs
import { open, stopServer, sleep, center, fire, mode } from './load-lib.mjs';

const PORT = Number(process.env.TOC_BAR_MOUSE_PORT || 9185);
const EDITOR_ROOT = '#editor-container .ProseMirror';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

const DOC = '<h1>Alpha</h1><p>Premier texte.</p><h2>Beta</h2><h3>Gamma</h3><h2>Delta</h2><p>Dernier texte.</p>';
const BAR = '.v2-toc-toolbar';
const TEXTS = { fr: { levels: 'Titres', upTo: 'à', pages: 'N° de page' }, en: { levels: 'Headings', upTo: 'to', pages: 'Page no.' } };

const lines = page => page.evaluate(root => Array.from(document.querySelectorAll(root + ' .toc-marker .toc-entry-preview')).map(el => el.textContent), EDITOR_ROOT);
const pagesOf = page => page.evaluate(root => Array.from(document.querySelectorAll(root + ' .toc-marker .toc-entry-preview')).map(el => el.getAttribute('data-page')), EDITOR_ROOT);
const barState = page => page.evaluate(sel => {
  const bar = document.querySelector(sel);
  if (!bar) return null;
  const box = bar.getBoundingClientRect();
  const toc = document.querySelector('#editor-container .ProseMirror .toc-marker');
  const tocBox = toc && toc.getBoundingClientRect();
  const editor = EditorCore.getEditor();
  const pagesBtn = bar.querySelector('button[data-action="toc-pages"]');
  return {
    visible: bar.classList.contains('visible') && box.width > 0,
    box: { left: Math.round(box.left), top: Math.round(box.top), right: Math.round(box.right), bottom: Math.round(box.bottom), width: Math.round(box.width), height: Math.round(box.height) },
    tocBox: tocBox && { top: Math.round(tocBox.top), bottom: Math.round(tocBox.bottom) },
    from: bar.querySelector('select[data-role="toc-from"]').value, to: bar.querySelector('select[data-role="toc-to"]').value,
    pagesOn: pagesBtn.classList.contains('is-active'), pagesPressed: pagesBtn.getAttribute('aria-pressed'),
    label: bar.querySelector('.v2-toc-label').textContent, upTo: bar.querySelector('.v2-toc-to').textContent, pagesText: pagesBtn.textContent,
    selectedToc: !!(editor.state.selection.node && editor.state.selection.node.type.name === 'toc'),
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
}, BAR);
const options = page => page.evaluate(() => { let found = null; EditorCore.getEditor().state.doc.descendants(node => { if (!found && node.type.name === 'toc') found = node.attrs.options; }); return found; });
const tocHtml = page => page.evaluate(() => (Editor.getHTML().match(/<div class="toc-marker"[^>]*>/) || [''])[0]);
// Où sont le sommaire et le texte qui le suit : la barre ne doit rien décaler.
const flow = page => page.evaluate(root => { const toc = document.querySelector(root + ' .toc-marker'); const next = toc.nextElementSibling; return { toc: Math.round(toc.getBoundingClientRect().top), next: Math.round(next.getBoundingClientRect().top), height: Math.round(toc.getBoundingClientRect().height) }; }, EDITOR_ROOT);

async function clickOn(page, selector, label) {
  const c = await center(page, selector);
  if (!c) throw new Error('introuvable : ' + (label || selector));
  await page.mouse.move(c.x - 25, c.y); await page.mouse.move(c.x, c.y, { steps: 4 }); await sleep(100);
  await page.mouse.click(c.x, c.y);
  await sleep(250);
  return c;
}
// Une liste se règle à la vraie souris : un clic l'ouvre, les flèches choisissent, Entrée valide.
async function pickLevel(page, role, steps, key) {
  await clickOn(page, `${BAR} select[data-role="${role}"]`, role);
  for (let i = 0; i < steps; i++) { await page.keyboard.press(key); await sleep(40); }
  await page.keyboard.press('Enter');
  await sleep(300);
}

async function pass(lang, theme, tag) {
  const t = TEXTS[lang];
  const w = await open({ spec: { tables: [{ id: 'Clients', rows: 3, columns: [{ id: 'Nom', type: 'Text' }] }] }, port: PORT, settleMs: 1500, theme, lang });
  const page = w.page;
  try {
    console.log(`\n[${tag}] Insérer le sommaire à la vraie souris`);
    await page.evaluate(h => Editor.setHTML(h), DOC);
    await sleep(500);
    // Le curseur à la fin du premier paragraphe (un vrai clic dans le texte), puis un vrai clic sur le bouton « Insérer un sommaire ».
    const firstP = await center(page, `${EDITOR_ROOT} > p:nth-of-type(1)`);
    await page.mouse.click(firstP.x + 20, firstP.y); await sleep(150);
    await page.keyboard.press('End');
    await clickOn(page, '#v2-btn-toc', 'bouton sommaire');
    await sleep(300);
    const first = await barState(page);
    check(`${tag} : le sommaire est sélectionné et la barre est ouverte`, !!first && first.visible && first.selectedToc, first);
    check(`${tag} : la barre dit « ${t.levels} H1 ${t.upTo} H6 » et « ${t.pages} » est allumé (tous les niveaux, numéros de page : comme avant)`,
      first.label === t.levels && first.upTo === t.upTo && first.pagesText === t.pages && first.from === '1' && first.to === '6' && first.pagesOn && first.pagesPressed === 'true', first);
    check(`${tag} : la barre est AU-DESSUS du sommaire et toute dans le panneau (${first.viewport.w}×${first.viewport.h})`,
      first.box.bottom <= first.tocBox.top + 1 && first.box.left >= 0 && first.box.right <= first.viewport.w && first.box.top >= 0, { box: first.box, tocBox: first.tocBox });
    check(`${tag} : l'aperçu liste les quatre titres, avec le numéro de page de chacun`, (await lines(page)).join('|') === 'Alpha|Beta|Gamma|Delta' && (await pagesOf(page)).every(Boolean), { lines: await lines(page), pages: await pagesOf(page) });

    // La barre ne prend aucune place : le sommaire et le texte qui le suit ne bougent pas quand elle se ferme (un clic dans le texte) puis se rouvre (un clic sur le sommaire).
    console.log(`\n[${tag}] La barre ne décale rien ; elle suit la sélection`);
    const flowOpen = await flow(page);
    const lastP = await center(page, `${EDITOR_ROOT} > p:nth-last-of-type(1)`);
    await page.mouse.click(lastP.x + 20, lastP.y); await sleep(300);
    const closed = await barState(page);
    const flowClosed = await flow(page);
    check(`${tag} : un clic dans le texte ferme la barre`, !closed.visible, closed);
    check(`${tag} : fermée ou ouverte, la barre n'a rien décalé (le sommaire et le texte d'après sont au même endroit)`, JSON.stringify(flowOpen) === JSON.stringify(flowClosed), { flowOpen, flowClosed });
    const marker = await center(page, `${EDITOR_ROOT} .toc-marker`);
    await page.mouse.click(marker.x + marker.w / 2 - 12, marker.y + marker.h / 2 - 2); await sleep(300);
    const reopened = await barState(page);
    check(`${tag} : un clic sur le sommaire (hors d'une ligne) le sélectionne et rouvre la barre`, reopened.visible && reopened.selectedToc, reopened);

    // Les niveaux : « à H3 » (trois flèches vers le haut depuis H6), puis « de H2 » (une flèche vers le bas depuis H1).
    console.log(`\n[${tag}] Les deux listes, à la vraie souris et au vrai clavier`);
    await pickLevel(page, 'toc-to', 3, 'ArrowUp');
    const toH3 = await barState(page);
    check(`${tag} : « ${t.upTo} H3 » : le dernier niveau est H3, l'aperçu liste Alpha, Beta, Gamma, Delta (aucun H4 dans ce document), le sommaire reste sélectionné et la barre ouverte`,
      JSON.stringify(await options(page)) === JSON.stringify({ from: 1, to: 3, pages: true }) && toH3.to === '3' && toH3.visible && toH3.selectedToc && (await lines(page)).join('|') === 'Alpha|Beta|Gamma|Delta', { options: await options(page), toH3, lines: await lines(page) });
    await pickLevel(page, 'toc-from', 1, 'ArrowDown');
    const fromH2 = await barState(page);
    check(`${tag} : « de H2 » : l'aperçu ne liste plus « Alpha » (H1) : Beta, Gamma, Delta, et les retraits suivent le niveau`,
      JSON.stringify(await options(page)) === JSON.stringify({ from: 2, to: 3, pages: true }) && fromH2.from === '2' && fromH2.visible && fromH2.selectedToc && (await lines(page)).join('|') === 'Beta|Gamma|Delta', { options: await options(page), lines: await lines(page) });
    await pickLevel(page, 'toc-to', 1, 'ArrowUp');
    const toH2 = await barState(page);
    check(`${tag} : « ${t.upTo} H2 » : l'aperçu liste Beta et Delta, pas Gamma (H3)`, toH2.to === '2' && (await lines(page)).join('|') === 'Beta|Delta', { options: await options(page), lines: await lines(page) });
    await pickLevel(page, 'toc-to', 1, 'ArrowUp');
    const carried = await barState(page);
    check(`${tag} : un dernier niveau sous le premier emmène le premier (« ${t.upTo} H1 » ramène « de » à H1 : le sommaire liste Alpha seul)`,
      carried.from === '1' && carried.to === '1' && (await lines(page)).join('|') === 'Alpha', { options: await options(page), carried, lines: await lines(page) });

    // Un seul Ctrl + Z rend l'état d'avant, la barre le redit.
    await page.keyboard.press('Control+z'); await sleep(350);
    const undone = await barState(page);
    check(`${tag} : un seul Ctrl + Z rend l'état d'avant : « ${t.upTo} H2 », Beta et Delta, la barre le redit`, undone.to === '2' && undone.from === '2' && (await lines(page)).join('|') === 'Beta|Delta', { options: await options(page), undone, lines: await lines(page) });

    // Le numéro de page : un vrai clic éteint, un vrai clic rallume.
    console.log(`\n[${tag}] Le numéro de page`);
    await clickOn(page, `${BAR} button[data-action="toc-pages"]`, 'N° de page');
    const noPages = await barState(page);
    check(`${tag} : un clic sur « ${t.pages} » l'éteint : plus de numéro dans l'aperçu, le bouton n'est plus allumé, la barre reste ouverte`,
      !noPages.pagesOn && noPages.pagesPressed === 'false' && noPages.visible && (await pagesOf(page)).every(value => value === null) && (await lines(page)).length === 2, { noPages, pages: await pagesOf(page) });
    check(`${tag} : le HTML du modèle écrit les trois réglages (data-toc-from, data-toc-to, data-toc-pages="false")`, (await tocHtml(page)) === '<div class="toc-marker" data-toc-from="2" data-toc-to="2" data-toc-pages="false">', await tocHtml(page));
    await clickOn(page, `${BAR} button[data-action="toc-pages"]`, 'N° de page');
    const pagesAgain = await barState(page);
    check(`${tag} : un second clic le rallume : les numéros reviennent`, pagesAgain.pagesOn && (await pagesOf(page)).every(Boolean), { pagesAgain, pages: await pagesOf(page) });
    // Retour aux valeurs d'avant : plus rien d'écrit dans le HTML.
    await pickLevel(page, 'toc-from', 1, 'ArrowUp');
    await pickLevel(page, 'toc-to', 4, 'ArrowDown');
    check(`${tag} : de retour sur « H1 ${t.upTo} H6 » avec les numéros, le HTML ne garde plus aucun réglage`, (await tocHtml(page)) === '<div class="toc-marker">' && (await options(page)) === null, { html: await tocHtml(page), options: await options(page) });

    // Une ligne de l'aperçu reste un lien (le clic va au titre) et la barre n'a rien changé au clic du vide.
    console.log(`\n[${tag}] Lecture seule, Lecture, erreurs`);
    // Le curseur dans le texte (la barre se ferme), le document en lecture seule, un clic sur le sommaire : il se sélectionne, la barre ne s'ouvre pas.
    // (le dernier paragraphe : le premier est sous la barre quand elle est ouverte)
    const textAgain = await center(page, `${EDITOR_ROOT} > p:nth-last-of-type(1)`);
    await page.mouse.click(textAgain.x + 20, textAgain.y); await sleep(250);
    await page.evaluate(() => { EditorCore.getEditor().setEditable(false); });
    await page.mouse.click(marker.x + marker.w / 2 - 12, marker.y + marker.h / 2 - 2); await sleep(300);
    const readOnly = await barState(page);
    await page.evaluate(() => { EditorCore.getEditor().setEditable(true); });
    check(`${tag} : un document en lecture seule n'a pas de barre (le sommaire se sélectionne, rien ne s'ouvre)`, readOnly.selectedToc && !readOnly.visible, readOnly);
    // Le sommaire sélectionné, barre ouverte : passer en Lecture la ferme (elle ne reste pas posée sur le document lu).
    await page.mouse.click(textAgain.x + 20, textAgain.y); await sleep(200);
    await page.mouse.click(marker.x + marker.w / 2 - 12, marker.y + marker.h / 2 - 2); await sleep(300);
    const beforeRead = await barState(page);
    await fire(page, 'Clients', 1);
    await mode(page, 'read');
    await sleep(500);
    const inRead = await barState(page);
    check(`${tag} : barre ouverte sur le sommaire, passer en Lecture la ferme`, beforeRead.visible && !inRead.visible, { beforeRead: beforeRead.visible, inRead });
    await mode(page, 'edit');
    await sleep(400);

    // Lecture : seuls les niveaux choisis (de H2 à H3).
    await page.evaluate(h => Editor.setHTML(h), '<div class="toc-marker" data-toc-from="2" data-toc-to="3"></div>' + DOC);
    await sleep(400);
    await fire(page, 'Clients', 1);
    await mode(page, 'read');
    await page.waitForFunction(() => !!document.querySelector('#reader-container .reader-content .toc-entry a.toc-link'), null, { timeout: 20000 });
    await sleep(400);
    const reader = await page.evaluate(() => Array.from(document.querySelectorAll('#reader-container .reader-content .toc-entry')).map(el => el.className.replace('toc-entry ', '') + '=' + el.textContent));
    check(`${tag} : en Lecture le sommaire liste de H2 à H3 (Beta, Gamma, Delta), sans numéro de page`, reader.join('|') === 'toc-level-2=Beta|toc-level-3=Gamma|toc-level-2=Delta', reader);
    await mode(page, 'edit');
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
