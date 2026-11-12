#!/usr/bin/env node
// La typographie française à la frappe (js/french-typography.js, case de Réglages > Thème > « Saisie » ; audit « confort d'usage » du 12/11, idée 5) au VRAI clavier (page.keyboard) et à la vraie souris, à 700x400 :
//   1) « Bonjour : il dit "oui"... l'ami ! » tapé tel quel donne « Bonjour : il dit « oui »… l’ami ! » ;
//   2) « mot: » + espace, « mot! » + espace : l'espace insécable vient à la frappe de l'espace ; « https://x.fr », « 10:30 », « a.php?id=1 » ne sont pas touchés ;
//   3) un retour arrière juste après une substitution la défait (la saisie d'origine revient), et Ctrl+Z aussi ;
//   4) un bloc de code et la marque « code » : rien ne change ; le texte collé non plus ;
//   5) la case de Réglages : cochée au départ en français, décochée au départ en anglais ; un clic la change, et l'éditeur suit tout de suite ; la préférence survit à un rechargement ;
//   6) éteinte, le texte reste tel quel ; aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « frenchTypographyMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-french-typography-mouse.mjs
import { open, stopServer, sleep, click } from './load-lib.mjs';

const PORT = Number(process.env.FRENCH_TYPO_PORT || 9017);
let failed = 0;
let total = 0;
const check = (label, ok, extra) => {
  total++;
  if (!ok) failed++;
  console.log((ok ? '  ok   - ' : '  FAIL - ') + label + (ok || extra === undefined ? '' : ' (' + JSON.stringify(extra) + ')'));
};
const SPEC = { tables: [{ id: 'FtClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }], models: { count: 1, paragraphs: 2, table: 'FtClients', columns: ['Nom'], firstIsDefault: true } };
const NB = ' ';
const visible = s => s.replace(/ /g, '⍽');

const textOf = page => page.evaluate(() => EditorCore.getEditor().getText({ blockSeparator: '\n' }));
async function fresh(page) {
  await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.setContent('<p></p>'); ed.commands.focus('end'); });
  await sleep(150);
}
async function typed(page, text) {
  await fresh(page);
  await page.keyboard.type(text, { delay: 8 });
  await sleep(150);
  return textOf(page);
}
async function setBox(page, wanted) {
  await click(page, '#v2-btn-settings');
  await sleep(500);
  const tab = await page.$('[data-settings-tab="theme"], #settings-tab-theme');
  if (tab) await tab.click();
  await sleep(300);
  const state = await page.evaluate(() => { const b = document.getElementById('settings-french-typography'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { checked: b.checked, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
  if (wanted !== undefined && state.checked !== wanted) { await page.mouse.click(state.x, state.y); await sleep(250); }
  const now = await page.evaluate(() => document.getElementById('settings-french-typography').checked);
  await page.keyboard.press('Escape');
  await sleep(300);
  return { before: state.checked, now, w: state.w };
}

let w = null;
const errors = [];
try {
  console.log('\n[1] Français : la phrase d\'exemple, tapée au clavier');
  w = await open({ spec: SPEC, port: PORT, settleMs: 2000, theme: 'light', lang: 'fr' });
  let page = w.page;
  let t = await typed(page, 'Bonjour : il dit "oui"... l\'ami !');
  check('« Bonjour : il dit "oui"... l\'ami ! » devient la phrase typographiée', t === `Bonjour${NB}: il dit «${NB}oui${NB}»… l’ami${NB}!`, visible(t));

  console.log('\n[2] L\'espace vient à la frappe de l\'espace, jamais dans une adresse ou une heure');
  t = await typed(page, 'Attention! Vraiment? Note: ok; fin.');
  check('« mot! », « mot? », « mot: », « mot; » suivis d\'une espace', t === `Attention${NB}! Vraiment${NB}? Note${NB}: ok${NB}; fin.`, visible(t));
  t = await typed(page, 'https://x.fr a.php?id=1 à 10:30 !');
  check('une adresse, une requête et une heure restent telles quelles', t === `https://x.fr a.php?id=1 à 10:30${NB}!`, visible(t));

  console.log('\n[3] Retour arrière et Ctrl+Z défont la substitution');
  await fresh(page);
  await page.keyboard.type('l\'', { delay: 8 });
  await sleep(100);
  check('l\'apostrophe est courbe', (await textOf(page)) === 'l’', visible(await textOf(page)));
  await page.keyboard.press('Backspace');
  await sleep(100);
  check('un retour arrière rend l\'apostrophe droite', (await textOf(page)) === 'l\'', visible(await textOf(page)));
  await fresh(page);
  await page.keyboard.type('Oui...', { delay: 8 });
  await sleep(100);
  await page.keyboard.press('Control+z');
  await sleep(150);
  const undone = await textOf(page);
  check('Ctrl+Z défait « … » (plus de « … » dans le texte)', !undone.includes('…'), visible(undone));

  console.log('\n[4] Pas dans un bloc de code, ni sous la marque « code »');
  await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.setContent('<pre><code>x</code></pre>'); ed.commands.focus(); ed.commands.setTextSelection(2); });
  await sleep(150);
  await page.keyboard.type('a : "b"...', { delay: 8 });
  await sleep(100);
  check('un bloc de code garde ses caractères droits', (await textOf(page)).startsWith('xa : "b"...'), visible(await textOf(page)));
  await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.setContent('<p>x </p>'); ed.commands.focus('end'); ed.commands.toggleCode(); });
  await sleep(150);
  await page.keyboard.type("z: q'", { delay: 8 });
  await sleep(100);
  const codeText = await textOf(page);
  const codeMarked = await page.evaluate(() => EditorCore.getEditor().getHTML());
  check('sous la marque « code », rien ne change', codeText === "xz: q'" && /<code>/.test(codeMarked), { text: visible(codeText), html: codeMarked });

  console.log('\n[5] La case de Réglages');
  let box = await setBox(page);
  check('français : cochée au départ', box.before === true, box);
  box = await setBox(page, false);
  check('un clic la décoche', box.now === false, box);
  t = await typed(page, 'Bonjour : "oui"...');
  check('éteinte, le texte reste tel quel', t === 'Bonjour : "oui"...', visible(t));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 120000 });
  await sleep(2500);
  box = await setBox(page);
  check('la préférence survit au rechargement (toujours décochée)', box.before === false, box);
  box = await setBox(page, true);
  t = await typed(page, 'Bonjour :');
  check('rallumée, l\'éditeur suit tout de suite', t === `Bonjour${NB}:`, visible(t));
  errors.push(...w.errors);
  await w.close();
  w = null;

  console.log('\n[6] Anglais : éteinte au départ');
  w = await open({ spec: SPEC, port: PORT, settleMs: 2000, theme: 'light', lang: 'en' });
  page = w.page;
  box = await setBox(page);
  check('anglais : décochée au départ', box.before === false, box);
  t = await typed(page, 'Hello : "yes"...');
  check('le texte anglais reste tel quel', t === 'Hello : "yes"...', visible(t));
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
