#!/usr/bin/env node
// Rouvrir dans le dernier mode (audit « confort d'usage » du 12/11, idée 2, GO d'Antoine) : la page s'ouvrait toujours en Édition, même quand la personne vient de lire ses lignes une à une. Au
// VRAI clic, à la vraie touche et à 700x400 (le panneau de Grist), puis par un vrai rechargement de la page (le faux Grist remet son document, le stockage du navigateur reste) :
//   1) sans préférence : l'Édition, comme avant ;
//   2) un clic sur « Mode lecture » retient la Lecture (clé `pp_last_mode`) ; rechargée, la page s'ouvre en Lecture (bouton allumé, éditeur caché, lecteur affiché) ;
//   3) un clic sur « Mode édition » retient l'Édition ; rechargée, la page s'ouvre en Édition ; Alt+L et Alt+E retiennent de même (ils cliquent les boutons) ;
//   4) la Lecture épurée n'est qu'un passage : depuis l'Édition, elle ne change pas le mode que la page rouvrira ;
//   5) rien à lire (aucun modèle ne s'ouvre de lui-même, pas de ★) : l'Édition, même si la Lecture est retenue ;
//   6) une préférence illisible (une autre valeur que « read ») : l'Édition ;
//   7) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « lastMode », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-last-mode.mjs
import { open, stopServer, sleep, click, pickTemplate } from './load-lib.mjs';

const PORT = Number(process.env.LAST_MODE_PORT || 9013);
const KEY = 'pp_last_mode';
let failed = 0;
let total = 0;
const check = (label, ok, extra) => {
  total++;
  if (!ok) failed++;
  console.log((ok ? '  ok   - ' : '  FAIL - ') + label + (ok || extra === undefined ? '' : ' (' + JSON.stringify(extra) + ')'));
};
// Un seul modèle, ★ : il s'ouvre de lui-même ; sans ★, rien ne s'ouvre au démarrage.
const SPEC_STAR = { tables: [{ id: 'LmClients', rows: 3, columns: [{ id: 'Nom', type: 'Text' }] }], models: { count: 1, paragraphs: 2, table: 'LmClients', columns: ['Nom'], firstIsDefault: true } };
const SPEC_NO_STAR = { tables: [{ id: 'LmClients', rows: 3, columns: [{ id: 'Nom', type: 'Text' }] }], models: { count: 1, paragraphs: 2, table: 'LmClients', columns: ['Nom'] } };

const state = page => page.evaluate(key => {
  const shown = id => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0; };
  let stored = null;
  try { stored = localStorage.getItem(key); } catch (e) { stored = 'illisible'; }
  return {
    readActive: document.getElementById('btn-mode-read').classList.contains('active'),
    editActive: document.getElementById('btn-mode-edit').classList.contains('active'),
    reader: shown('reader-container'),
    editor: shown('editor-container'),
    clean: document.body.classList.contains('pp-clean-reading'),
    stored,
  };
}, KEY);
const isEdit = s => s.editActive && !s.readActive && s.editor && !s.reader;
const isRead = s => s.readActive && !s.editActive && s.reader && !s.editor;
async function reloadReady(page) {
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 120000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 180000 });
  await sleep(1500);
}

let w = null;
try {
  console.log('\n[1] Un modèle ★, sans préférence');
  w = await open({ spec: SPEC_STAR, port: PORT, settleMs: 1500, theme: 'light', lang: 'fr' });
  let { page } = w;
  let s = await state(page);
  check('sans préférence, la page s\'ouvre en Édition (bouton allumé, éditeur affiché, lecteur caché)', isEdit(s) && s.stored === null, s);

  console.log('\n[2] Un clic sur « Mode lecture », puis un rechargement');
  await click(page, '#btn-mode-read');
  await sleep(900);
  s = await state(page);
  check('le clic ouvre la Lecture et retient « read »', isRead(s) && s.stored === 'read', s);
  await reloadReady(page);
  s = await state(page);
  check('rechargée, la page s\'ouvre en Lecture (bouton allumé, lecteur affiché, éditeur caché)', isRead(s) && s.stored === 'read', s);
  const rendered = await page.evaluate(() => (document.getElementById('reader-container').textContent || '').trim().length);
  check('la Lecture montre bien le modèle (le lecteur n\'est pas vide)', rendered > 0, rendered);

  console.log('\n[3] Un clic sur « Mode édition », puis un rechargement');
  await click(page, '#btn-mode-edit');
  await sleep(900);
  s = await state(page);
  check('le clic ouvre l\'Édition et retient « edit »', isEdit(s) && s.stored === 'edit', s);
  await reloadReady(page);
  s = await state(page);
  check('rechargée, la page s\'ouvre en Édition', isEdit(s) && s.stored === 'edit', s);

  console.log('\n[3 bis] Les raccourcis Alt+L et Alt+E');
  await page.keyboard.press('Alt+l');
  await sleep(900);
  s = await state(page);
  check('Alt+L ouvre la Lecture et retient « read »', isRead(s) && s.stored === 'read', s);
  await page.keyboard.press('Alt+e');
  await sleep(900);
  s = await state(page);
  check('Alt+E ouvre l\'Édition et retient « edit »', isEdit(s) && s.stored === 'edit', s);

  console.log('\n[4] La Lecture épurée est un passage');
  await page.evaluate(() => CleanReading.choose('clean'));
  await click(page, '#btn-mode-read');
  await sleep(900);
  s = await state(page);
  check('depuis l\'Édition, la Lecture épurée lit sans retenir la Lecture', isRead(s) && s.clean && s.stored === 'edit', s);
  await page.evaluate(() => CleanReading.exit());
  await sleep(900);
  s = await state(page);
  check('on en sort là où l\'on était (Édition) et la préférence reste « edit »', isEdit(s) && !s.clean && s.stored === 'edit', s);
  await reloadReady(page);
  s = await state(page);
  check('rechargée, la page s\'ouvre en Édition', isEdit(s), s);
  const errors = w.errors.slice();
  await w.close();
  w = null;

  console.log('\n[5] Rien ne s\'ouvre de lui-même (pas de ★)');
  w = await open({ spec: SPEC_NO_STAR, port: PORT, settleMs: 1500, theme: 'light', lang: 'fr', onPage: p => p.addInitScript(key => { try { localStorage.setItem(key, 'read'); } catch (e) { /* stockage refusé */ } }, KEY) });
  page = w.page;
  s = await state(page);
  check('la Lecture est retenue mais aucun modèle ne s\'ouvre : l\'Édition', isEdit(s) && s.stored === 'read', s);
  await pickTemplate(page, 'Modèle 0001');
  await click(page, '#btn-mode-read');
  await sleep(900);
  s = await state(page);
  check('un modèle choisi à la main se lit au clic, comme avant', isRead(s), s);
  errors.push(...w.errors);
  await w.close();
  w = null;

  console.log('\n[6] Une préférence illisible');
  w = await open({ spec: SPEC_STAR, port: PORT, settleMs: 1500, theme: 'light', lang: 'fr', onPage: p => p.addInitScript(key => { try { localStorage.setItem(key, 'lecture ??'); } catch (e) { /* stockage refusé */ } }, KEY) });
  page = w.page;
  s = await state(page);
  check('une autre valeur que « read » ouvre l\'Édition', isEdit(s), s);
  errors.push(...w.errors);
  await w.close();
  w = null;

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
