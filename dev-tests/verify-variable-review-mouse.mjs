#!/usr/bin/env node
// « Variables à revoir » (js/variable-review.js ; audit « confort d'usage » du 12/11, idée 7) à la VRAIE souris et au vrai clavier, à 700x400, en clair, en sombre puis en anglais :
//   1) un modèle de trois bulles dont deux cassées (une colonne qui n'existe plus, rouge) : le coin d'état dit « 2 variables à revoir » (« 2 variables to review ») ;
//   2) un vrai clic sur ce message sélectionne la première bulle à revoir (la bulle saine est sautée) et le message dit « 1/2 » avec la raison ; un second clic mène à la seconde, un troisième revient à la première ;
//   3) Entrée sur le message focalisé fait de même ; la palette (Alt+/, « Aller à la variable à revoir suivante ») aussi ;
//   4) quand toutes les bulles sont refaites, le message s'efface ; un autre message du coin d'état (« Enregistré ») garde sa place ;
//   5) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « variableReviewMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-variable-review-mouse.mjs
import { open, stopServer, sleep, click } from './load-lib.mjs';

const PORT = Number(process.env.VARIABLE_REVIEW_PORT || 9019);
let failed = 0;
let total = 0;
const check = (label, ok, extra) => {
  total++;
  if (!ok) failed++;
  console.log((ok ? '  ok   - ' : '  FAIL - ') + label + (ok || extra === undefined ? '' : ' (' + JSON.stringify(extra) + ')'));
};
const T = 'VrClients';
const SPEC = { tables: [{ id: T, rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }], models: { count: 1, paragraphs: 1, table: T, columns: ['Nom'], firstIsDefault: true } };
const badge = column => `<span class="var-badge" data-table="${T}" data-column="${column}" data-key="${T}.${column}"></span>`;
const DOC = `<p>Début ${badge('Fantome')} milieu ${badge('Nom')} puis ${badge('Absente')} fin.</p>` + '<p>suite</p>'.repeat(3);

const status = page => page.evaluate(() => { const el = document.getElementById('status-msg'); return { text: el.textContent, ours: el.classList.contains('pp-status-review'), role: el.getAttribute('role') }; });
const selected = page => page.evaluate(() => {
  const ed = EditorCore.getEditor();
  const sel = ed.state.selection;
  return { isNode: !!sel.node, column: sel.node && sel.node.attrs ? (sel.node.attrs.column || sel.node.attrs['data-column'] || null) : null, hasFocus: ed.view.hasFocus() };
});
async function clickStatus(page) {
  const r = await page.evaluate(() => { const b = document.getElementById('status-msg').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.mouse.move(r.x, r.y, { steps: 3 });
  await page.mouse.click(r.x, r.y);
  await sleep(300);
}

async function run(lang, scheme, w) {
  const L = `${scheme}/${lang}`;
  const page = w.page;
  await page.evaluate(html => { Editor.setHTML(html); }, DOC);
  await sleep(1200);
  let s = await status(page);
  const many = lang === 'fr' ? '2 variables à revoir' : '2 variables to review';
  check(`${L} : le coin d'état dit « ${many} » (deux bulles cassées, la saine ne compte pas)`, s.text === many && s.ours && s.role === 'button', s);

  await clickStatus(page);
  s = await status(page);
  let sel = await selected(page);
  check(`${L} : un vrai clic mène à la première bulle à revoir (sélectionnée, éditeur au premier plan)`, sel.isNode && sel.column === 'Fantome' && sel.hasFocus, sel);
  check(`${L} : le message dit « 1/2 » avec la raison de la bulle`, /1\/2/.test(s.text) && s.text.length > 12, s);
  await clickStatus(page);
  sel = await selected(page);
  check(`${L} : un second clic mène à la seconde (la bulle saine est sautée)`, sel.isNode && sel.column === 'Absente', sel);
  await clickStatus(page);
  sel = await selected(page);
  check(`${L} : un troisième clic revient à la première`, sel.isNode && sel.column === 'Fantome', sel);

  await page.evaluate(() => { document.getElementById('status-msg').focus(); });
  await page.keyboard.press('Enter');
  await sleep(300);
  sel = await selected(page);
  check(`${L} : Entrée sur le message focalisé mène à la suivante`, sel.isNode && sel.column === 'Absente', sel);

  await page.keyboard.press('Alt+/');
  await sleep(500);
  await page.keyboard.type(lang === 'fr' ? 'variable à revoir' : 'variable to review', { delay: 10 });
  await sleep(400);
  await page.keyboard.press('Enter');
  await sleep(500);
  sel = await selected(page);
  check(`${L} : la commande de la palette mène à la suivante (retour à la première)`, sel.isNode && sel.column === 'Fantome', sel);

  await page.evaluate(html => { Editor.setHTML(html); }, `<p>Tout est ${badge('Nom')}.</p>`);
  await sleep(1200);
  s = await status(page);
  check(`${L} : plus de bulle à revoir, le message s'efface`, s.text === '' && !s.ours, s);

  await page.evaluate(html => { Editor.setHTML(html); }, DOC);
  await sleep(1000);
  await page.evaluate(() => { const el = document.getElementById('status-msg'); el.className = ''; el.textContent = 'Enregistré'; });
  await page.evaluate(() => { Editor.setHTML(document.querySelector('#editor-container .tiptap').innerHTML); });
  await sleep(1000);
  s = await status(page);
  check(`${L} : un autre message du coin d'état garde sa place`, s.text === 'Enregistré' && !s.ours, s);
  await page.evaluate(() => { const el = document.getElementById('status-msg'); el.textContent = ''; });
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
