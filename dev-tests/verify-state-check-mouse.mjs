#!/usr/bin/env node
// Le contrôle du style de l'État (js/state-check-pane.js, lot 4 du mode « Identité de l'État ») à la VRAIE souris et au vrai clavier, dans le panneau de 700x400 de Grist, HÉBERGÉ (GFS simulé, dev-tests/gfs-stub.js),
// en français clair puis en anglais sombre. Ce que scenarios-state-check.js ne voit pas depuis la page :
//   1) mode allumé : la ligne « Contrôle du style de l'État » du menu Édition collaborative (au survol) est atteignable, libre, assez haute ; un vrai clic ouvre le volet à droite du texte ;
//   2) le volet tient dans le panneau 700x400 (son bord droit, sa hauteur, son pied visible en faisant défiler la liste), ne recouvre pas le texte (le texte lui laisse sa place), ses textes sont lisibles (>= 4,5:1),
//      les lignes à revoir passent devant et le résumé les compte ; un vrai clic sur « Voir » sélectionne le paragraphe fautif et le dit (« 1 sur 1 ») ;
//   3) un vrai clic sur « Décrire » ouvre la fenêtre du texte alternatif sur l'image, au premier plan (devant le volet) ; Échap la ferme sans rien écrire ;
//   4) la croix ferme le volet (le texte retrouve sa marge, le focus revient à l'éditeur) ; au clavier, Échap dans le volet le ferme aussi ;
//   5) mode éteint : la ligne est grisée (atteignable, jamais retirée), un vrai clic dit pourquoi dans le coin d'état et le volet ne s'ouvre pas ;
//   6) rien n'est écrit dans le document (le HTML est le même après tout cela) et aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « stateCheckMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-state-check-mouse.mjs
// STATE_CHECK_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, stopServer, sleep, center, click } from './load-lib.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.STATE_CHECK_PORT || 9061);
const SHOTS = process.env.STATE_CHECK_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const SPEC = { tables: [{ id: 'EtatClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const KEY = 'pp_etat_declaration';
const body = text => '<p><span style="font-family: Marianne, arial, sans-serif; color: #161616">' + text + '</span></p>';
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
// Un document à deux défauts : un paragraphe sans police, une image sans texte alternatif.
const SAMPLE = '<h1>Un titre</h1>' + body('Un texte en Marianne.') + '<h2>Un sous-titre</h2><p>Un paragraphe sans police.</p>' + body('Suite') + '<p><img class="editor-image" src="' + PIXEL + '"></p>';

let total = 0;
let failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const WORDS = {
  fr: { title: 'Contrôle du style de l’État', off: 'Allumez d’abord le mode « Identité de l’État » (Réglages, onglet Thème).', summary: '2 à revoir · 6 sans remarque', warns: 'fonts:warn,images:warn', seen: '1 sur 1', see: 'Voir', describe: 'Décrire', note: /droit d’utiliser la marque/ },
  en: { title: 'State style check', off: 'Turn on the “State identity” mode first (Settings, Theme tab).', summary: '3 to review · 5 fine', warns: 'fonts:warn,images:warn,language:warn', seen: '1 of 1', see: 'Show', describe: 'Describe', note: /right to use the brand/ },
};

const PAGE_HELPERS = `
  const opaque = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\\(0, 0, 0, 0\\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
  const lum = c => { const [r, g, b] = (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return Math.round((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) * 100) / 100; };
`;
const setExtensions = async (page, list) => {
  await page.evaluate(l => window.__gfsStub.setExtensions(l), list);
  const want = list.includes('etat');
  for (let i = 0; i < 40; i++) { if ((await page.evaluate(() => Extensions.isActive('etat'))) === want) break; await sleep(60); }
  await sleep(200);
};
const setMode = (page, on) => page.evaluate(({ key, on }) => {
  // La déclaration est gardée (une fois), puis le mode s'allume ou s'éteint comme par le bouton de Réglages : `StateMode.setOn` prévient ses abonnés.
  if (!StateMode.isDeclared()) PersonStore.set(key, JSON.stringify({ v: StateMode.TEXT_VERSION, quality: 'etat', date: '2026-11-01', on: true }));
  StateMode.setOn(on);
  StateCheckPane.syncRow();
}, { key: KEY, on });
const statusOf = page => page.evaluate(() => document.getElementById('status-msg').textContent);
const quiet = page => page.evaluate(() => { document.getElementById('status-msg').textContent = ''; });
const HTML = page => page.evaluate(() => Editor.getHTML());

async function setDocument(page) {
  // Les titres portent le style de l'État (leur configuration dans le modèle) : seuls le paragraphe sans police et l'image sont fautifs.
  await page.evaluate(h => Editor.setHTML('<div class="heading-numbering-config" data-style="none" data-level-styles=\'' + JSON.stringify(StateStyle.headingStyles()) + '\'></div>' + h), SAMPLE);
  await sleep(300);
  await page.evaluate(() => EditorCore.getEditor().chain().focus('end').run());
  await sleep(300);
}
async function openCollabMenu(page) {
  const chip = await center(page, '#v2-btn-collab');
  await page.mouse.move(chip.x - 20, chip.y);
  await page.mouse.move(chip.x, chip.y, { steps: 4 });
  await sleep(450);
  const inside = await page.evaluate(() => { const r = document.getElementById('v2-collab-flyout').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 20 }; });
  await page.mouse.move(chip.x, chip.y + 15, { steps: 3 });
  await page.mouse.move(inside.x, inside.y, { steps: 6 });
  await sleep(250);
}
const rowInfo = page => page.evaluate(`(() => {
  ${PAGE_HELPERS}
  const row = document.getElementById('v2-btn-state-check');
  const flyout = document.getElementById('v2-collab-flyout');
  const f = flyout.getBoundingClientRect();
  const b = row.getBoundingClientRect();
  const under = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return {
    text: row.textContent.trim(), disabled: row.getAttribute('aria-disabled'), title: row.title, pressed: row.getAttribute('aria-pressed'), x: b.left + b.width / 2, y: b.top + b.height / 2, height: Math.round(b.height),
    insideFlyout: b.left >= f.left && b.right <= f.right && b.top >= f.top && b.bottom <= f.bottom, sideScroll: flyout.scrollWidth - flyout.clientWidth,
    underPointerIsRow: !!under && under.closest('#v2-btn-state-check') === row, ratio: ratio(getComputedStyle(row).color, opaque(row)),
  };
})()`);
async function reachRow(page) {
  let info = await rowInfo(page);
  for (let i = 0; i < 8 && !(info.insideFlyout && info.underPointerIsRow); i++) {
    await page.mouse.wheel(0, 120);
    await sleep(250);
    info = await rowInfo(page);
  }
  return info;
}
async function clickRow(page) {
  const before = await reachRow(page);
  await page.mouse.move(before.x, before.y, { steps: 4 });
  await sleep(150);
  await page.mouse.down();
  await sleep(80);
  await page.mouse.up();
  await sleep(500);
  return before;
}
const leaveMenu = async page => { await page.mouse.move(350, 390, { steps: 6 }); await sleep(500); };

const paneInfo = page => page.evaluate(`(() => {
  ${PAGE_HELPERS}
  const pane = document.getElementById('pp-state-pane');
  if (!pane || pane.hidden || getComputedStyle(pane).display === 'none') return null;
  const p = pane.getBoundingClientRect();
  const box = document.getElementById('editor-container').getBoundingClientRect();
  const items = Array.from(pane.querySelectorAll('.pp-statepane-item'));
  const list = pane.querySelector('.pp-statepane-list');
  const note = pane.querySelector('.pp-statepane-note');
  const n = note.getBoundingClientRect();
  const look = (el) => ratio(getComputedStyle(el).color, opaque(el));
  const goes = Array.from(pane.querySelectorAll('.pp-statepane-go')).map((b) => { b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { text: b.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2, height: Math.round(r.height), reachable: !!t && b.contains(t), ratio: look(b) }; });
  return {
    rect: [Math.round(p.left), Math.round(p.top), Math.round(p.right), Math.round(p.bottom)], inWindow: p.right <= innerWidth + 0.5 && p.top >= 0 && p.bottom <= innerHeight + 0.5 && p.width > 100,
    textClear: box.right <= p.left + 0.5, textWidth: Math.round(box.width), summary: pane.querySelector('.pp-statepane-summary').textContent,
    order: items.map(i => i.dataset.check + ':' + (i.classList.contains('is-warn') ? 'warn' : 'ok')), count: items.length,
    summaryRatio: look(pane.querySelector('.pp-statepane-summary')), nameRatios: items.map(i => look(i.querySelector('.pp-statepane-name'))), detailRatios: items.map(i => look(i.querySelector('.pp-statepane-detail'))),
    noteRatio: look(note), noteText: note.textContent, noteSeen: n.bottom <= innerHeight + 0.5, listScrolls: list.scrollHeight > list.clientHeight, sideScroll: pane.scrollWidth - pane.clientWidth,
    goes, title: pane.querySelector('.pp-statepane-title').textContent, closeSeen: (() => { const c = pane.querySelector('.pp-statepane-close').getBoundingClientRect(); return c.width > 0 && c.right <= innerWidth && c.top >= 0; })(),
    icons: items.map(i => !!i.querySelector('.pp-statepane-icon svg')),
  };
})()`);
const selectedText = page => page.evaluate(() => { const ed = EditorCore.getEditor(); const s = ed.state.selection; return s.node ? 'node:' + s.node.type.name : ed.state.doc.textBetween(s.from, s.to, ' '); });
const altOpen = page => page.evaluate(() => { const ov = document.getElementById('pp-alt-modal'); if (!ov || getComputedStyle(ov).display === 'none') return null; const ok = ov.querySelector('.var-modal-primary'); const r = ok.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const box = ov.querySelector('.pp-modal-box').getBoundingClientRect(); return { okOnTop: !!t && ok.contains(t), inPanel: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight }; });
const focusIn = page => page.evaluate(() => { const a = document.activeElement; return a && a.closest ? (a.closest('#pp-state-pane') ? 'pane' : a.closest('.ProseMirror') ? 'editor' : a.tagName) : null; });

async function run(lang, theme) {
  const tag = lang === 'fr' ? 'FR clair' : 'EN sombre';
  const words = WORDS[lang];
  let w = null;
  try {
    w = await open({
      spec: SPEC, port: PORT, settleMs: 1500, theme, lang,
      onPage: async (page) => {
        await page.addInitScript({ path: join(ROOT, 'dev-tests', 'gfs-stub.js') });
        await page.addInitScript(() => { history.replaceState(null, '', location.pathname + '?gfs=0'); });
      },
    });
    const page = w.page;
    await page.evaluate(() => GfsLink.ready.then(() => Extensions.loadAll()));
    await setExtensions(page, ['graphique', 'etat']);
    await setDocument(page);
    await setMode(page, true);
    const original = await HTML(page);

    // ---- 1) Mode allumé : la ligne du menu, puis le volet ----
    await openCollabMenu(page);
    let row = await reachRow(page);
    check(tag + ' : la ligne « ' + words.title + ' » est atteignable dans le menu Édition collaborative (la souris trouve la ligne), dans sa largeur', row.text === words.title && row.insideFlyout && row.underPointerIsRow && row.sideScroll <= 0, row);
    check(tag + ' : mode allumé, la ligne est libre (aria-disabled=false), assez haute (>= 24 px) et lisible (>= 4,5:1)', row.disabled === 'false' && row.height >= 24 && row.ratio >= 4.5, row);
    await shot(page, tag.replace(' ', '-') + '-1-menu');
    await quiet(page);
    await clickRow(page);
    await leaveMenu(page);
    let pane = await paneInfo(page);
    check(tag + ' : un vrai clic sur la ligne ouvre le volet « ' + words.title + ' », dans le panneau 700x400', !!pane && pane.inWindow && pane.title === words.title, pane && pane.rect);
    if (!pane) throw new Error('le volet ne s’ouvre pas');
    check(tag + ' : le texte laisse sa place au volet (rien n’est recouvert) et garde plus de 300 px de large', pane.textClear && pane.textWidth >= 300, { clear: pane.textClear, width: pane.textWidth });
    check(tag + ' : huit lignes, celles à revoir devant (' + words.warns + ' : en anglais la langue de l\'interface est aussi à revoir), le résumé les compte : « ' + words.summary + ' »', pane.count === 8 && pane.order.slice(0, words.warns.split(',').length).join() === words.warns && pane.order.slice(words.warns.split(',').length).every(s => /:ok$/.test(s)) && pane.summary === words.summary, { order: pane.order, summary: pane.summary });
    check(tag + ' : chaque ligne a son pictogramme, aucune ligne ne déborde en largeur', pane.icons.every(Boolean) && pane.sideScroll <= 0, { icons: pane.icons, side: pane.sideScroll });
    check(tag + ' : les textes du volet sont lisibles (>= 4,5:1) : résumé, noms, détails, pied, boutons', pane.summaryRatio >= 4.5 && pane.nameRatios.every(r => r >= 4.5) && pane.detailRatios.every(r => r >= 4.5) && pane.noteRatio >= 4.5 && pane.goes.every(g => g.ratio >= 4.5), { summary: pane.summaryRatio, names: pane.nameRatios, details: pane.detailRatios, note: pane.noteRatio, goes: pane.goes.map(g => g.ratio) });
    check(tag + ' : la croix est visible, le pied dit que le contrôle ne dit rien du droit à la marque (lisible en faisant défiler)', pane.closeSeen && words.note.test(pane.noteText), { close: pane.closeSeen, note: pane.noteText });
    await shot(page, tag.replace(' ', '-') + '-2-volet');

    // « Voir » : un vrai clic sélectionne le paragraphe fautif.
    check(tag + ' : « ' + words.see + ' » et « ' + words.describe + ' » sont atteignables à la souris, assez hauts (>= 24 px)', pane.goes.length === 2 && pane.goes.map(g => g.text).join() === words.see + ',' + words.describe && pane.goes.every(g => g.reachable && g.height >= 24), pane.goes);
    await quiet(page);
    await page.mouse.move(pane.goes[0].x, pane.goes[0].y, { steps: 4 });
    await page.mouse.click(pane.goes[0].x, pane.goes[0].y);
    await sleep(400);
    check(tag + ' : un vrai clic sur « ' + words.see + ' » sélectionne le paragraphe sans police', (await selectedText(page)) === 'Un paragraphe sans police.', await selectedText(page));
    pane = await paneInfo(page);
    const seen = await page.evaluate(() => document.querySelector('[data-check="fonts"] .pp-statepane-seen').textContent);
    check(tag + ' : le volet dit où l\'on en est à côté du bouton : « ' + words.seen + ' », et le résumé reste « ' + words.summary + ' »', seen === words.seen && pane.summary === words.summary, { seen, summary: pane.summary });
    await shot(page, tag.replace(' ', '-') + '-3-voir');

    // ---- 3) « Décrire » ----
    await page.mouse.move(pane.goes[1].x, pane.goes[1].y, { steps: 4 });
    await page.mouse.click(pane.goes[1].x, pane.goes[1].y);
    await sleep(500);
    const alt = await altOpen(page);
    check(tag + ' : un vrai clic sur « ' + words.describe + ' » sélectionne l\'image et ouvre la fenêtre du texte alternatif, au premier plan et dans le panneau', (await selectedText(page)) === 'node:editorImage' && !!alt && alt.okOnTop && alt.inPanel, { selected: await selectedText(page), alt });
    await shot(page, tag.replace(' ', '-') + '-4-decrire');
    await page.keyboard.press('Escape');
    await sleep(350);
    check(tag + ' : Échap ferme la fenêtre sans rien écrire (le HTML est celui d\'avant)', (await altOpen(page)) === null && (await HTML(page)) === original, (await HTML(page)).slice(0, 120));

    // ---- 4) Fermer : la croix à la souris, Échap au clavier ----
    pane = await paneInfo(page);
    const cross = await center(page, '#pp-state-pane .pp-statepane-close');
    await page.mouse.move(cross.x, cross.y, { steps: 4 });
    await page.mouse.click(cross.x, cross.y);
    await sleep(400);
    const closed = await page.evaluate(() => ({ hidden: document.getElementById('pp-state-pane').hidden, margin: document.getElementById('editor-container').style.marginRight }));
    check(tag + ' : la croix ferme le volet, le texte retrouve sa marge, le focus revient à l\'éditeur', closed.hidden && !closed.margin && (await focusIn(page)) === 'editor', { closed, focus: await focusIn(page) });
    await openCollabMenu(page);
    await clickRow(page);
    await leaveMenu(page);
    check(tag + ' : la ligne rouvre le volet, le focus est dans le volet', !!(await paneInfo(page)) && (await focusIn(page)) === 'pane', await focusIn(page));
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await sleep(350);
    check(tag + ' : au vrai clavier, Échap dans le volet le ferme', (await paneInfo(page)) === null && (await focusIn(page)) === 'editor', { pane: await paneInfo(page), focus: await focusIn(page) });

    // ---- 5) Mode éteint ----
    await setMode(page, false);
    await openCollabMenu(page);
    row = await reachRow(page);
    check(tag + ' : mode éteint, la ligne reste là, grisée (aria-disabled), atteignable, sa raison au survol', row.text === words.title && row.disabled === 'true' && row.title === words.off && row.insideFlyout && row.underPointerIsRow, row);
    await shot(page, tag.replace(' ', '-') + '-5-ligne-grisee');
    await quiet(page);
    await clickRow(page);
    await leaveMenu(page);
    check(tag + ' : un vrai clic sur la ligne grisée dit pourquoi dans le coin d\'état et n\'ouvre pas le volet', (await statusOf(page)) === words.off && (await paneInfo(page)) === null, { status: await statusOf(page) });

    // ---- 6) Rien d'écrit ----
    check(tag + ' : le document est le même octet pour octet après tout cela', (await HTML(page)) === original, (await HTML(page)).slice(0, 160));
    check(tag + ' : aucune erreur de page', realErrors(w).length === 0, realErrors(w));
  } catch (e) {
    check(tag + ' : le script va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
  } finally {
    if (w) await w.close();
  }
}

try {
  await run('fr', 'light');
  await run('en', 'dark');
} finally {
  await stopServer();
}
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
