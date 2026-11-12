#!/usr/bin/env node
// « Aller à… » un titre depuis la palette de commandes (js/command-palette.js : readHeadings, goToHeading ; audit « confort d'usage » du 12/11, idée 8) au VRAI clavier et à la vraie souris, à 700x400, en clair,
// en sombre puis en anglais :
//   1) un document de plusieurs titres sur plusieurs pages : sans saisie, la liste de la palette est celle des commandes (aucun titre) ;
//   2) en tapant un mot du titre (« conclusion »), la ligne du titre suit les commandes, avec son niveau (« H2 ») ; Entrée pose le curseur dans ce titre et le fait défiler à l'écran ;
//   3) un clic sur la ligne d'un titre fait de même ; un mot qui ne porte aucun titre n'en liste aucun ; les accents et la casse sont ignorés ;
//   4) en Lecture, la ligne du titre fait défiler la page jusqu'à lui ;
//   5) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « paletteHeadingsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-palette-headings-mouse.mjs
import { open, stopServer, sleep, click, fire } from './load-lib.mjs';

const PORT = Number(process.env.PALETTE_HEADINGS_PORT || 9020);
let failed = 0;
let total = 0;
const check = (label, ok, extra) => {
  total++;
  if (!ok) failed++;
  console.log((ok ? '  ok   - ' : '  FAIL - ') + label + (ok || extra === undefined ? '' : ' (' + JSON.stringify(extra) + ')'));
};
const SPEC = { tables: [{ id: 'PhClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }], models: { count: 1, paragraphs: 1, table: 'PhClients', columns: ['Nom'], firstIsDefault: true } };
const filler = n => Array.from({ length: n }, (_, i) => `<p>Paragraphe de remplissage numéro ${i + 1} pour allonger le document sur plusieurs pages.</p>`).join('');
const DOC = `<h1>Introduction</h1>${filler(25)}<h2>Éléments financiers</h2>${filler(25)}<h2>Conclusion générale</h2>${filler(25)}<p>Fin.</p>`;

const rowsOf = page => page.evaluate(() => Array.from(document.querySelectorAll('#pp-palette-list .pp-palette-row')).map(r => ({ name: r.querySelector('.pp-palette-name').textContent, key: (r.querySelector('.pp-palette-key') || {}).textContent || '', id: r.dataset.command, active: r.classList.contains('is-active') })));
const inHeading = page => page.evaluate(() => {
  const ed = EditorCore.getEditor();
  const $from = ed.state.selection.$from;
  const node = $from.parent;
  const cursor = ed.view.coordsAtPos(ed.state.selection.from);
  const box = document.getElementById('editor-container').getBoundingClientRect();
  return { type: node.type.name, text: node.textContent, visible: cursor.top >= box.top - 2 && cursor.bottom <= box.bottom + 2, focus: ed.view.hasFocus() };
});
async function openPalette(page, text) {
  await page.keyboard.press('Alt+/');
  await sleep(500);
  if (text) { await page.keyboard.type(text, { delay: 10 }); await sleep(350); }
}

async function run(lang, scheme, w) {
  const L = `${scheme}/${lang}`;
  const page = w.page;
  await page.evaluate(html => { Editor.setHTML(html); }, DOC);
  await sleep(1500);
  await page.evaluate(() => { EditorCore.getEditor().commands.focus('start'); });
  await openPalette(page, '');
  let rows = await rowsOf(page);
  check(`${L} : sans saisie, la palette ne liste aucun titre (que des commandes)`, rows.length > 20 && !rows.some(r => /^heading-/.test(r.id)), rows.length);
  await page.keyboard.type('conclusion', { delay: 10 });
  await sleep(350);
  rows = await rowsOf(page);
  const heading = rows.find(r => /^heading-/.test(r.id));
  check(`${L} : « conclusion » liste le titre « Conclusion générale » avec son niveau « H2 »`, !!heading && heading.name === 'Conclusion générale' && heading.key === 'H2', rows);
  check(`${L} : le titre vient en dernier, après les commandes que la recherche retient`, rows.length >= 1 && rows[rows.length - 1].id === heading.id, rows);
  await page.keyboard.press('Enter');
  await sleep(600);
  let at = await inHeading(page);
  check(`${L} : Entrée pose le curseur dans le titre, visible, l'éditeur au premier plan`, at.type === 'heading' && at.text === 'Conclusion générale' && at.visible && at.focus, at);

  await page.evaluate(() => { EditorCore.getEditor().commands.focus('start'); });
  await openPalette(page, 'ELEMENTS FINANCIERS');
  rows = await rowsOf(page);
  const accent = rows.find(r => /^heading-/.test(r.id));
  check(`${L} : accents et casse ignorés (« ELEMENTS FINANCIERS » trouve « Éléments financiers »)`, !!accent && accent.name === 'Éléments financiers', rows);
  const box = await page.evaluate(id => { const r = document.querySelector(`#pp-palette-list .pp-palette-row[data-command="${id}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, accent.id);
  await page.mouse.move(box.x, box.y, { steps: 4 });
  await page.mouse.click(box.x, box.y);
  await sleep(600);
  at = await inHeading(page);
  check(`${L} : un clic sur la ligne mène au titre`, at.type === 'heading' && at.text === 'Éléments financiers' && at.visible, at);

  await openPalette(page, 'zzzzmotabsent');
  rows = await rowsOf(page);
  check(`${L} : un mot qui ne porte aucun titre n'en liste aucun`, rows.length === 0, rows);
  await page.keyboard.press('Escape');
  await sleep(300);

  await fire(page, 'PhClients', 1);
  await click(page, '#btn-mode-read');
  await sleep(1500);
  await page.evaluate(() => { document.getElementById('reader-container').scrollTop = 0; });
  await openPalette(page, 'conclusion');
  rows = await rowsOf(page);
  const readHeading = rows.find(r => /^heading-/.test(r.id));
  check(`${L} : en Lecture aussi, la palette liste le titre`, !!readHeading && readHeading.name === 'Conclusion générale', rows);
  await page.keyboard.press('Enter');
  await sleep(700);
  const scrolled = await page.evaluate(() => {
    const c = document.getElementById('reader-container');
    const h = Array.from(c.querySelectorAll('.reader-content h2')).find(x => x.textContent.includes('Conclusion'));
    const hb = h.getBoundingClientRect(); const cb = c.getBoundingClientRect();
    return { top: c.scrollTop, visible: hb.top >= cb.top - 2 && hb.bottom <= cb.bottom + 2 };
  });
  check(`${L} : la page défile jusqu'au titre`, scrolled.top > 100 && scrolled.visible, scrolled);
  await click(page, '#btn-mode-edit');
  await sleep(800);
}

let w = null;
const errors = [];
try {
  for (const [scheme, lang] of [['light', 'fr'], ['dark', 'fr'], ['light', 'en']]) {
    console.log(`\n[${scheme} / ${lang}]`);
    w = await open({ spec: SPEC, port: PORT, settleMs: 2000, theme: scheme, lang });
    await run(lang, scheme, w);
    errors.push(...w.errors);
    await w.close();
    w = null;
  }
  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
} catch (e) {
  failed++;
  total++;
  console.log('  FAIL - exception : ' + (e && e.stack || e));
} finally {
  if (w) await w.close();
  await stopServer();
}
console.log('\n' + (total - failed) + '/' + total + ' passés');
process.exit(failed ? 1 : 0);
