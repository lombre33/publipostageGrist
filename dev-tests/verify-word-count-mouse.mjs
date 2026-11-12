#!/usr/bin/env node
// Le compteur « 35 mots · 206 signes · 1 page » (js/word-count.js, case de Réglages > Thème > Saisie ; audit « confort d'usage » du 12/11, idée 10) à la VRAIE souris et au vrai clavier, à 700x400, en clair,
// en sombre puis en anglais :
//   1) au départ, aucun compteur à l'écran, la case est décochée ;
//   2) un vrai clic sur la case l'allume : « N mots · N signes · N pages » en bas à gauche du document, sans toucher la pastille de zoom (en bas à droite) ;
//   3) les chiffres sont justes : un texte connu, une bulle de variable = un mot et aucun signe ; la frappe les met à jour une demi-seconde plus tard ; un document de trois pages dit « 3 pages » ;
//   4) en Lecture, le compteur se cache ; il revient en Édition ; la case décochée le retire ; la préférence survit à un rechargement ;
//   5) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « wordCountMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-word-count-mouse.mjs
import { open, stopServer, sleep, click } from './load-lib.mjs';

const PORT = Number(process.env.WORD_COUNT_PORT || 9021);
let failed = 0;
let total = 0;
const check = (label, ok, extra) => {
  total++;
  if (!ok) failed++;
  console.log((ok ? '  ok   - ' : '  FAIL - ') + label + (ok || extra === undefined ? '' : ' (' + JSON.stringify(extra) + ')'));
};
const T = 'WcClients';
const SPEC = { tables: [{ id: T, rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }], models: { count: 1, paragraphs: 1, table: T, columns: ['Nom'], firstIsDefault: true } };
const badge = `<span class="var-badge" data-table="${T}" data-column="Nom" data-key="${T}.Nom"></span>`;
const filler = n => Array.from({ length: n }, (_, i) => `<p>Ligne de remplissage numéro ${i + 1} pour allonger le document.</p>`).join('');

const chip = page => page.evaluate(() => {
  const el = document.getElementById('pp-word-count');
  const zoom = document.getElementById('pp-page-zoom');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const z = zoom.getBoundingClientRect();
  const c = document.getElementById('editor-container').getBoundingClientRect();
  return { text: el.textContent, shown: !el.hidden && r.width > 0, left: r.left, right: r.right, top: r.top, bottom: r.bottom, zoomLeft: z.left, containerLeft: c.left, containerBottom: c.bottom, height: r.height };
});
async function setBox(page, wanted) {
  await click(page, '#v2-btn-settings');
  await sleep(500);
  const tab = await page.$('[data-settings-tab="theme"]');
  if (tab) await tab.click();
  await sleep(300);
  const state = await page.evaluate(() => { const b = document.getElementById('settings-word-count'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { checked: b.checked, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (wanted !== undefined && state.checked !== wanted) { await page.mouse.click(state.x, state.y); await sleep(250); }
  const now = await page.evaluate(() => document.getElementById('settings-word-count').checked);
  await page.keyboard.press('Escape');
  await sleep(700);
  return { before: state.checked, now };
}

async function run(lang, scheme, w) {
  const L = `${scheme}/${lang}`;
  const fr = lang === 'fr';
  const page = w.page;
  await page.evaluate(() => { Editor.setHTML('<p>Bonjour tout le monde.</p>'); });
  await sleep(1000);
  let c = await chip(page);
  check(`${L} : au départ, aucun compteur à l'écran`, !c || !c.shown, c);
  let box = await setBox(page);
  check(`${L} : la case est décochée au départ`, box.before === false, box);
  box = await setBox(page, true);
  await sleep(900);
  c = await chip(page);
  // « Bonjour tout le monde. » : 4 mots, 22 signes.
  const one = fr ? '4 mots · 22 signes' : '4 words · 22 characters';
  check(`${L} : un clic sur la case allume le compteur : « ${one}… »`, box.now === true && !!c && c.shown && c.text.startsWith(one), c);
  check(`${L} : petit (20 px), en bas à gauche du document, loin de la pastille de zoom`, !!c && c.height <= 22 && c.left - c.containerLeft < 20 && c.right < c.zoomLeft && c.containerBottom - c.bottom < 20, c);

  await page.evaluate(html => { Editor.setHTML(html); }, `<p>Un ${badge} deux</p>`);
  await sleep(1000);
  c = await chip(page);
  // « Un [bulle] deux » : 3 mots, « Un  deux » = 8 signes (les deux espaces gardés, la bulle sans signe).
  check(`${L} : une bulle de variable compte pour un mot et aucun signe`, !!c && c.text.startsWith(fr ? '3 mots · 8 signes' : '3 words · 8 characters'), c);

  await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.setContent('<p>Un</p>'); ed.commands.focus('end'); });
  await sleep(900);
  await page.keyboard.type(' deux trois', { delay: 10 });
  await sleep(900);
  c = await chip(page);
  check(`${L} : la frappe met le compteur à jour (« Un deux trois » : 3 mots, 13 signes)`, !!c && c.text.startsWith(fr ? '3 mots · 13 signes' : '3 words · 13 characters'), c);

  await page.evaluate(html => { Editor.setHTML(html); }, filler(60));
  await sleep(1800);
  c = await chip(page);
  const pages = Number((/(\d+) pages?$/.exec(c ? c.text : '') || [])[1]);
  check(`${L} : un long document dit ses pages (plus d'une)`, pages >= 2, c);

  await click(page, '#btn-mode-read');
  await sleep(1000);
  c = await chip(page);
  check(`${L} : en Lecture, le compteur se cache`, !c || !c.shown, c);
  await click(page, '#btn-mode-edit');
  await sleep(1000);
  c = await chip(page);
  check(`${L} : il revient en Édition`, !!c && c.shown, c);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 120000 });
  await sleep(2500);
  c = await chip(page);
  check(`${L} : la préférence survit au rechargement (compteur allumé)`, !!c && c.shown, c);
  box = await setBox(page, false);
  await sleep(500);
  c = await chip(page);
  check(`${L} : la case décochée retire le compteur`, box.now === false && (!c || !c.shown), { box, c });
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
