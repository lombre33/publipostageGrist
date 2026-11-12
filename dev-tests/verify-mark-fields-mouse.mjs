#!/usr/bin/env node
// « Repérer les champs » (js/mark-fields.js, css/mark-fields.css ; audit « confort d'usage » du 12/11, idée 6) à la VRAIE souris et au vrai clavier, à 700x400, en clair, en sombre puis en anglais :
//   1) le menu du bouton Mode lecture a une troisième ligne « Repérer les champs » (anglais : « Highlight fields »), décochée au départ ; la Lecture ne montre aucune teinte ;
//   2) un vrai clic sur la ligne la coche, sans changer de mode ni ce que fait le bouton ; en Lecture, la valeur écrite par une bulle prend un fond, une valeur vide devient un « vide » (« empty ») entouré ;
//   3) la mise en page ne bouge pas : la hauteur du document et la position du texte qui suit sont les mêmes cochée et décochée (le « vide » est en ligne, sans marge) ;
//   4) Entrée sur la ligne focalisée au clavier la décoche, la teinte part ;
//   5) rien n'est écrit dans le document (le HTML du modèle est le même), l'Édition n'est pas teintée, aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « markFieldsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-mark-fields-mouse.mjs
import { open, stopServer, sleep, click, fire, clickHoverRow } from './load-lib.mjs';

const PORT = Number(process.env.MARK_FIELDS_PORT || 9018);
let failed = 0;
let total = 0;
const check = (label, ok, extra) => {
  total++;
  if (!ok) failed++;
  console.log((ok ? '  ok   - ' : '  FAIL - ') + label + (ok || extra === undefined ? '' : ' (' + JSON.stringify(extra) + ')'));
};
const SPEC = { tables: [{ id: 'MfClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }, { id: 'Ville', type: 'Text' }] }], models: { count: 1, paragraphs: 2, table: 'MfClients', columns: ['Nom', 'Ville'], firstIsDefault: true } };
const ROW = '#v2-btn-mark-fields';

const readState = page => page.evaluate(() => {
  const reader = document.getElementById('reader-container');
  const values = Array.from(reader.querySelectorAll('.resolved-var:not(.error-msg)'));
  const filled = values.find(v => v.textContent.trim());
  const empty = values.find(v => !v.textContent.trim());
  const style = (el, pseudo) => el ? getComputedStyle(el, pseudo) : null;
  return {
    body: document.body.classList.contains('pp-mark-fields'),
    mode: document.getElementById('btn-mode-read').classList.contains('active') ? 'read' : 'edit',
    values: values.length,
    filledBg: filled ? style(filled).backgroundColor : null,
    emptyContent: empty ? style(empty, '::before').content : null,
    emptyBorder: empty ? style(empty, '::before').borderTopStyle : null,
    height: reader.scrollHeight,
    lastTop: (() => { const ps = reader.querySelectorAll('.reader-content p'); const p = ps[ps.length - 1]; return p ? Math.round(p.getBoundingClientRect().top) : null; })(),
  };
});
const clickRow = page => clickHoverRow(page, '#btn-mode-read', ROW);
const NOT_TINTED = ['rgba(0, 0, 0, 0)', 'transparent'];

async function run(lang, scheme, w) {
  const T = `${scheme}/${lang}`;
  const page = w.page;
  const label = await page.evaluate(sel => document.querySelector(sel).textContent.trim(), ROW);
  check(`${T} : la troisième ligne du menu Mode lecture s'appelle « ${lang === 'fr' ? 'Repérer les champs' : 'Highlight fields'} »`, label === (lang === 'fr' ? 'Repérer les champs' : 'Highlight fields'), label);
  const startChecked = await page.evaluate(sel => document.querySelector(sel).getAttribute('aria-checked'), ROW);
  check(`${T} : décochée au départ`, startChecked === 'false', startChecked);
  // Une ligne sans valeur : la ville de la ligne 1 est vide.
  await page.evaluate(() => { const stub = window.__gristStub; stub.setRows('MfClients', [{ id: 1, Nom: 'Dupont', Ville: '' }, { id: 2, Nom: 'Martin', Ville: 'Lyon' }]); });
  await fire(page, 'MfClients', 1);
  await click(page, '#btn-mode-read');
  await sleep(1200);
  const before = await readState(page);
  check(`${T} : en Lecture sans la case, aucune teinte et aucun « vide »`, before.mode === 'read' && !before.body && NOT_TINTED.includes(before.filledBg) && (before.emptyContent === null || before.emptyContent === 'none' || before.emptyContent === 'normal'), before);

  await clickRow(page);
  await sleep(500);
  const after = await readState(page);
  const checked = await page.evaluate(sel => document.querySelector(sel).getAttribute('aria-checked'), ROW);
  check(`${T} : un vrai clic coche la ligne et reste en Lecture`, checked === 'true' && after.body && after.mode === 'read', { checked, after });
  check(`${T} : la valeur écrite par une bulle prend un fond`, !NOT_TINTED.includes(after.filledBg), after);
  const word = lang === 'fr' ? 'vide' : 'empty';
  check(`${T} : la valeur vide devient un « ${word} » entouré`, after.emptyContent === `"${word}"` && after.emptyBorder === 'dashed', after);
  check(`${T} : la mise en page ne bouge pas (hauteur du document et position du dernier paragraphe)`, after.height === before.height && after.lastTop === before.lastTop, { before: [before.height, before.lastTop], after: [after.height, after.lastTop] });

  // Au clavier : Tab jusqu'à la ligne, Entrée la décoche.
  await page.evaluate(sel => document.querySelector(sel).focus(), ROW);
  await page.keyboard.press('Enter');
  await sleep(400);
  const off = await readState(page);
  check(`${T} : Entrée sur la ligne la décoche, la teinte part`, !off.body && NOT_TINTED.includes(off.filledBg), off);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
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
