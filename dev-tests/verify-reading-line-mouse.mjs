#!/usr/bin/env node
// « Quelle ligne je lis ? » (js/reading-line.js ; audit « confort d'usage » du 12/11, idée 4), à la vraie souris et à 700x400, en clair, en sombre puis en anglais :
//   1) en Lecture, avec plusieurs lignes dans la vue, la pastille dit « Martin · ligne 2 sur 3 » (le nom = la première valeur de la ligne) ; en Édition elle est cachée ;
//   2) la flèche « suivante » (vrai clic) demande le déplacement du curseur de Grist (grist.setCursorPos), la Lecture montre la ligne suivante, la pastille la suit ; la flèche « précédente » revient ;
//      aux deux bouts, la flèche qui n'a plus rien à rejoindre est grisée ;
//   3) un filtre posé dans Grist (la vue n'a plus que deux lignes) met le compte à jour ; une vue d'une seule ligne, ou qui ne montre pas la ligne lue, cache la pastille ;
//   4) elle ne gêne pas la lecture : posée dans le coin bas gauche de la zone de lecture, elle devient presque transparente et ne reçoit plus de clic pendant le défilement, puis revient ;
//   5) la Lecture épurée ne la montre pas ;
//   6) un refus de Grist le dit dans le coin d'état, la ligne lue ne change pas ;
//   7) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « readingLineMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-reading-line-mouse.mjs
import { open, stopServer, sleep, click, fire } from './load-lib.mjs';

const PORT = Number(process.env.READING_LINE_PORT || 9023);
let failed = 0;
let total = 0;
const check = (label, ok, extra) => {
  total++;
  if (!ok) failed++;
  console.log((ok ? '  ok   - ' : '  FAIL - ') + label + (ok || extra === undefined ? '' : ' (' + JSON.stringify(extra) + ')'));
};
const SPEC = { tables: [{ id: 'RlClients', rows: 3, columns: [{ id: 'Nom', type: 'Text' }] }], models: { count: 1, paragraphs: 2, table: 'RlClients', columns: ['Nom'], firstIsDefault: true } };
const NAMES = ['Dupont', 'Martin', 'Durand'];

const chip = page => page.evaluate(() => {
  const el = document.getElementById('pp-reading-line');
  if (!el) return null;
  const shown = !el.hidden && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  const buttons = Array.from(el.querySelectorAll('button'));
  const box = el.getBoundingClientRect();
  const reader = document.getElementById('reader-container').getBoundingClientRect();
  return { shown, text: el.textContent, prevOff: buttons[0].disabled, nextOff: buttons[1].disabled, opacity: Number(getComputedStyle(el).opacity), pe: getComputedStyle(el).pointerEvents, left: box.left, bottom: box.bottom, readerLeft: reader.left, readerBottom: reader.bottom, top: box.top, readerTop: reader.top };
});
const status = page => page.evaluate(() => ({ text: document.getElementById('status-msg').textContent, error: document.getElementById('status-msg').classList.contains('error-msg') }));
const readerText = page => page.evaluate(() => (document.getElementById('reader-container').textContent || ''));
const cursorCalls = page => page.evaluate(() => window.__gristStub.state.cursorCalls.slice());
async function clickArrow(page, which) {
  const r = await page.evaluate(index => {
    const b = document.querySelectorAll('#pp-reading-line button')[index].getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, which === 'next' ? 1 : 0);
  await page.mouse.move(r.x, r.y, { steps: 3 });
  await page.mouse.click(r.x, r.y);
  await sleep(900);
}

async function run(lang, scheme, w) {
  const L = `${scheme}/${lang}`;
  const fr = lang === 'fr';
  const page = w.page;
  const pos = (n, total) => (fr ? `ligne ${n} sur ${total}` : `row ${n} of ${total}`);
  await page.evaluate(names => { window.__gristStub.setRows('RlClients', names.map((Nom, i) => ({ id: i + 1, Nom }))); }, NAMES);
  await fire(page, 'RlClients', 1);

  let c = await chip(page);
  check(`${L} : en Édition, la pastille est cachée`, !c || !c.shown, c);

  await click(page, '#btn-mode-read');
  await sleep(1200);
  c = await chip(page);
  check(`${L} : en Lecture, la pastille dit « ${NAMES[0]} · ${pos(1, 3)} », « précédente » grisée, « suivante » active`, !!c && c.shown && c.text === `${NAMES[0]} · ${pos(1, 3)}` && c.prevOff && !c.nextOff, c);
  check(`${L} : elle est posée dans le coin bas gauche de la zone de lecture`, !!c && c.shown && c.left - c.readerLeft < 30 && c.readerBottom - c.bottom < 30 && c.top > c.readerTop, c);

  await clickArrow(page, 'next');
  c = await chip(page);
  let calls = await cursorCalls(page);
  check(`${L} : « suivante » déplace le curseur de Grist sur la ligne 2 et la pastille dit « ${NAMES[1]} · ${pos(2, 3)} »`, calls.length === 1 && calls[0] === 2 && !!c && c.text === `${NAMES[1]} · ${pos(2, 3)}` && !c.prevOff && !c.nextOff, { calls, c });
  const text2 = await readerText(page);
  check(`${L} : la Lecture montre la ligne 2`, text2.includes(NAMES[1]) && !text2.includes(NAMES[0]), text2.slice(0, 120));

  await clickArrow(page, 'next');
  c = await chip(page);
  check(`${L} : à la dernière ligne, « suivante » est grisée`, !!c && c.text === `${NAMES[2]} · ${pos(3, 3)}` && c.nextOff && !c.prevOff, c);
  await clickArrow(page, 'prev');
  c = await chip(page);
  calls = await cursorCalls(page);
  check(`${L} : « précédente » revient à la ligne 2`, !!c && c.text === `${NAMES[1]} · ${pos(2, 3)}` && calls.join() === '2,3,2', { calls, c });

  // Un filtre posé dans Grist.
  await page.evaluate(() => { window.__gristStub.setViewRows([2, 3]); window.__gristStub.fireViewChange('RlClients'); });
  await sleep(800);
  c = await chip(page);
  check(`${L} : un filtre qui laisse deux lignes met le compte à jour (« ${pos(1, 2)} »)`, !!c && c.shown && c.text === `${NAMES[1]} · ${pos(1, 2)}`, c);
  await page.evaluate(() => { window.__gristStub.setViewRows([1, 3]); window.__gristStub.fireViewChange('RlClients'); });
  await sleep(800);
  c = await chip(page);
  check(`${L} : une vue qui ne montre pas la ligne lue cache la pastille`, !c || !c.shown, c);
  await page.evaluate(() => { window.__gristStub.setViewRows([2]); window.__gristStub.fireViewChange('RlClients'); });
  await sleep(800);
  c = await chip(page);
  check(`${L} : une vue d'une seule ligne cache la pastille`, !c || !c.shown, c);
  await page.evaluate(() => { window.__gristStub.setViewRows(null); window.__gristStub.fireViewChange('RlClients'); });
  await sleep(800);
  c = await chip(page);
  check(`${L} : la vue entière rend la pastille`, !!c && c.shown && c.text === `${NAMES[1]} · ${pos(2, 3)}`, c);

  // Le défilement.
  await page.evaluate(() => { const r = document.getElementById('reader-container'); const filler = document.createElement('div'); filler.id = 'rl-filler'; filler.style.height = '2000px'; r.appendChild(filler); r.scrollTop = 0; });
  await sleep(300);
  await page.mouse.move(350, 200);
  await page.mouse.wheel(0, 300);
  await sleep(250);
  c = await chip(page);
  check(`${L} : pendant le défilement, la pastille devient presque transparente et ne reçoit plus de clic`, !!c && c.opacity < 0.5 && c.pe === 'none', c);
  await sleep(1700);
  c = await chip(page);
  check(`${L} : puis elle revient`, !!c && c.opacity === 1 && c.pe !== 'none', c);
  await page.evaluate(() => { const f = document.getElementById('rl-filler'); if (f) f.remove(); });

  // Un refus de Grist.
  await page.evaluate(() => { window.__gristStub.state.cursorFailure = 'refusé'; });
  await clickArrow(page, 'next');
  const s = await status(page);
  c = await chip(page);
  check(`${L} : si Grist refuse, le coin d'état le dit et la ligne lue ne change pas`, s.error && /Grist/.test(s.text) && !!c && c.text === `${NAMES[1]} · ${pos(2, 3)}`, { s, c });
  await page.evaluate(() => { window.__gristStub.state.cursorFailure = null; });

  // Lecture épurée.
  await page.evaluate(() => CleanReading.exit && CleanReading.exit());
  await click(page, '#btn-mode-edit');
  await sleep(900);
  await page.evaluate(() => CleanReading.choose('clean'));
  await click(page, '#btn-mode-read');
  await sleep(1200);
  c = await chip(page);
  check(`${L} : la Lecture épurée ne la montre pas`, !c || !c.shown, c);
  await page.evaluate(() => CleanReading.exit());
  await sleep(900);
  await page.evaluate(() => CleanReading.choose('read'));
  await click(page, '#btn-mode-edit');
  await sleep(900);
  c = await chip(page);
  check(`${L} : de retour en Édition, la pastille est cachée`, !c || !c.shown, c);
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
  check('aucune erreur de page', errors.filter(e => !/setCursorPos a échoué|refusé/.test(String(e))).length === 0, errors.slice(0, 3));
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
