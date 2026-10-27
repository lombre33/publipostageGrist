#!/usr/bin/env node
// Le sommaire du corps montre ses titres dès « Terminer » d'un en-tête ou d'un pied de page, à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard ; Node/Playwright), dans le panneau de 700x400
// d'Antoine, en français clair puis en anglais sombre - sa carte du 27/10, « Corriger le sommaire qui garde son texte d'attente après « Terminer » ».
// Ce que dev-tests/scenarios-pagebreak-toc.js (toc_editor_preview_is_drawn_when_*) ne peut pas voir depuis la page : ce que la feuille MONTRE après un vrai clic dans la bande, du texte tapé, un vrai clic sur
// « Terminer » (ou la touche Échap), et que le corps garde la mise en page qu'il avait avant la zone - un sommaire d'une ligne au lieu de trois remonte la fin du texte de deux lignes, et la pagination avec elle.
//   1) un clic dans la bande du haut, du texte tapé, « Terminer » : le sommaire montre ses trois titres (des liens), pas son texte d'attente, et la fin du texte est où elle était avant la zone ;
//   2) le même parcours au pied de page ;
//   3) « Échap » quitte la zone comme « Terminer » : même résultat ;
//   4) Ctrl + Z puis Ctrl + Y (l'en-tête défait et rendu) ne touchent pas au sommaire ; un clic sur une de ses lignes amène toujours le titre ;
//   5) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « tocAfterDoneMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-toc-after-done-mouse.mjs
import { open, stopServer, sleep, click, center } from './load-lib.mjs';

const PORT = Number(process.env.TOC_AFTER_DONE_MOUSE_PORT || 9149);
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const BODY = '<h1>Introduction</h1><p>Texte du début.</p><h2>Contexte</h2><div class="toc-marker"></div><h1>Conclusion</h1><p>Fin.</p>';
const TITLES = ['Introduction', 'Contexte', 'Conclusion'];

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// Le sommaire tel que la personne le voit : ses lignes (liens), son texte d'attente s'il l'a gardé, sa hauteur, la distance du premier titre à la dernière ligne du corps (la mise en page du corps : le sommaire
// d'une ligne au lieu de trois la raccourcit ; la hauteur de l'éditeur, elle, suit la feuille et l'en-tête), le mode d'écriture.
const snap = page => page.evaluate(() => {
  const toc = document.querySelector('.tiptap .toc-marker');
  const lines = toc ? Array.from(toc.querySelectorAll('.toc-entry-preview')).map(el => el.textContent) : null;
  const first = toc && toc.querySelector('.toc-entry-preview');
  return {
    lines,
    links: toc ? toc.querySelectorAll('.toc-entry-preview .toc-link').length : 0,
    waiting: !!toc && (toc.textContent || '').indexOf(I18n.t('toc.placeholder')) !== -1,
    painted: !!first && first.getBoundingClientRect().height > 0,
    tocHeight: toc ? Math.round(toc.getBoundingClientRect().height) : 0,
    span: Math.round(document.querySelector('.tiptap p:last-of-type').getBoundingClientRect().top - document.querySelector('.tiptap h1').getBoundingClientRect().top),
    editing: Editor.isEditingHeaderFooter(),
  };
});
const sameLines = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

// Un clic de vraie souris dans la bande de la zone (haut ou bas de la feuille).
async function clickZone(page, pos) {
  const sel = '#editor-container .v2-page-edge-' + pos;
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
  await sleep(300);
  const c = await center(page, sel);
  await page.mouse.move(c.x, c.y);
  await sleep(100);
  await page.mouse.click(c.x, c.y);
  await sleep(400);
  return page.evaluate(() => Editor.isEditingHeaderFooter());
}
// « Terminer » de la pastille d'édition, à la vraie souris.
async function clickDone(page) {
  const c = await center(page, '#v2-hf-btn-done');
  await page.mouse.move(c.x, c.y);
  await sleep(100);
  await page.mouse.click(c.x, c.y);
  await sleep(500);
  return page.evaluate(() => !Editor.isEditingHeaderFooter() && !document.getElementById('v2-hf-pill'));
}
// Du texte tapé au vrai clavier dans la zone ouverte.
async function typeIn(page, text) {
  await click(page, '#editor-container .tiptap p');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
  await sleep(250);
}
async function key(page, combo) {
  await page.keyboard.press(combo);
  await sleep(450);
}
async function pass(lang, theme, tag) {
  const w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme, lang });
  try {
    const { page } = w;
    await page.evaluate(html => Editor.setHTML(html), BODY);
    await sleep(500);
    let now = await snap(page);
    const start = { tocHeight: now.tocHeight, span: now.span };
    const sameLayout = s => s.tocHeight === start.tocHeight && s.span === start.span;
    console.log(`\n[${tag}] L'en-tête`);
    check(`${tag} : au départ le sommaire montre ses trois titres`, sameLines(now.lines, TITLES) && !now.waiting && now.painted, now);

    check(`${tag} : un clic dans la bande du haut ouvre l'écriture de l'en-tête`, await clickZone(page, 'top'));
    await typeIn(page, 'Entête client');
    check(`${tag} : « Terminer » à la souris referme la zone`, await clickDone(page));
    now = await snap(page);
    check(`${tag} : le sommaire montre ses trois titres, pas son texte d'attente`, sameLines(now.lines, TITLES) && !now.waiting, now);
    check(`${tag} : ses lignes sont des liens, peintes à l'écran`, now.links === 3 && now.painted, now);
    check(`${tag} : le sommaire et la fin du texte sont où ils étaient avant la zone`, sameLayout(now), { now, start });

    console.log(`\n[${tag}] Le pied`);
    check(`${tag} : un clic dans la bande du bas ouvre l'écriture du pied`, await clickZone(page, 'bottom'));
    await typeIn(page, 'Pied de page');
    check(`${tag} : « Terminer » referme le pied`, await clickDone(page));
    now = await snap(page);
    check(`${tag} : le sommaire montre encore ses trois titres`, sameLines(now.lines, TITLES) && !now.waiting && now.painted && now.links === 3, now);
    check(`${tag} : la mise en page du corps n'a pas bougé`, sameLayout(now), { now, start });

    console.log(`\n[${tag}] Échap`);
    check(`${tag} : un clic dans la bande du haut rouvre l'en-tête`, await clickZone(page, 'top'));
    await typeIn(page, ' bis');
    await key(page, 'Escape');
    now = await snap(page);
    check(`${tag} : Échap quitte la zone et le sommaire montre ses trois titres`, !now.editing && sameLines(now.lines, TITLES) && !now.waiting && now.painted, now);
    check(`${tag} : la mise en page du corps n'a pas bougé après Échap`, sameLayout(now), { now, start });

    console.log(`\n[${tag}] Annuler et Rétablir`);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Z (l'en-tête défait) laisse le sommaire à ses trois titres`, !now.editing && sameLines(now.lines, TITLES) && !now.waiting, now);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : Ctrl + Y le laisse aussi`, !now.editing && sameLines(now.lines, TITLES) && !now.waiting, now);
    await page.evaluate(() => document.querySelector('.tiptap .toc-marker .toc-link').scrollIntoView({ block: 'center' }));
    await sleep(300);
    await click(page, '.tiptap .toc-entry-preview:last-child .toc-link');
    await sleep(500);
    const reached = await page.evaluate(() => {
      const sel = window.getSelection();
      const h = sel && sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement).closest('h1, h2');
      return h ? h.textContent : null;
    });
    check(`${tag} : un clic sur la dernière ligne amène toujours le curseur dans « Conclusion »`, reached === 'Conclusion', reached);

    const errors = realErrors(w);
    check(`${tag} : aucune erreur de page`, errors.length === 0, errors.slice(0, 3));
  } finally { await w.close(); }
}

try {
  await pass('fr', 'light', 'fr clair');
  await pass('en', 'dark', 'en sombre');
} catch (e) { failures++; console.log('ERREUR', e && e.stack || e); }
finally { await stopServer(); }
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
