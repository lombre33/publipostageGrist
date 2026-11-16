#!/usr/bin/env node
// Le thème prêt « Identité de l'État » de Slides+ (extensions/diapositives/slide-themes.js `etat`, slide-theme-ui.js, lot 5 du mode « Identité de l'État ») à la VRAIE souris et au vrai clavier, dans le panneau de 700x400
// de Grist, HÉBERGÉ (GFS simulé, dev-tests/gfs-stub.js), en français clair puis en anglais sombre :
//   1) sans l'extension de l'État : la ligne « Identité de l'État » est dans la liste du thème (jamais retirée), grisée (aria-disabled), atteignable, lisible (>= 4,5:1), sa raison en info-bulle ; un vrai clic ne coche rien, ne
//      change pas l'aperçu, dit la raison dans la ligne sous les couleurs et ouvre la fenêtre qui renvoie vers GFS (fermée par Échap) ;
//   2) l'extension là, le mode éteint : même ligne grisée, sa raison est « Allumez d'abord le mode » ; un vrai clic la dit et n'ouvre aucune fenêtre ;
//   3) le mode allumé : la ligne est libre ; un vrai clic la coche, l'aperçu prend le Bleu France des titres, le gris #161616 du texte, le fond blanc et Arial, rien n'est écrit dans le modèle avant « Appliquer » ;
//      « Appliquer » pose le thème (le titre du document et son texte à leurs couleurs), la fenêtre rouverte le montre coché ;
//   4) le diaporama (F5) dans le panneau joue le thème posé ; le mode éteint de nouveau, le thème déjà posé reste posé et la ligne cochée reste grisée ;
//   5) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « slideThemeStateMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-theme-state-mouse.mjs
// SLIDE_THEME_STATE_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT } from './gfs-page.mjs';

const SHOTS = process.env.SLIDE_THEME_STATE_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-slide-theme-state', port: Number(process.env.SLIDE_THEME_STATE_PORT || 8971) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = ['graphique', 'diapositives'];
const KEY = 'pp_etat_declaration';
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const DOC = `<h1>Titre un</h1><p>Un texte simple.</p>${BR}<h2>Deux</h2><p>Suite</p>`;
// 7 « Thème de l'État » : une présentation de deux diapositives, sans thème.
const SEED = seedModels({ record: { id: 1, Nom: 'Alice' } }) + `
  add(7, 'Thème de l\\'État', '${DOC}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;

const TEXTS = {
  fr: {
    name: 'Identité de l’État', original: 'Aspect d’origine', off: 'Allumez d’abord le mode « Identité de l’État » (Réglages, onglet Thème).', applied: /^Thème « Identité de l’État » appliqué\.$/,
    missing: /Identité de l’État/, noticeTitle: /./,
  },
  en: {
    name: 'State identity', original: 'Original look', off: 'Turn on the “State identity” mode first (Settings, Theme tab).', applied: /^Theme “State identity” applied\.$/,
    missing: /State identity/, noticeTitle: /./,
  },
};
const BLUE = 'rgb(0, 0, 145)';
const INK = 'rgb(22, 22, 22)';
const WHITE = 'rgb(255, 255, 255)';

const boxOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}, selector);
// Un vrai clic : la souris vient de la gauche sur l'élément, s'y arrête un instant, appuie.
async function realClick(page, selector) {
  const c = await boxOf(page, selector);
  if (!c || !c.width) throw new Error('introuvable ou masqué : ' + selector);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await sleep(80);
  await page.mouse.click(c.x, c.y);
  await sleep(300);
  return c;
}
const away = async (page) => { await page.mouse.move(300, HEIGHT - 70, { steps: 4 }); await sleep(250); };
async function openPageMenu(page) {
  const btn = await boxOf(page, '#btn-page-orientation');
  await page.mouse.move(btn.x - 14, btn.y - 6, { steps: 2 });
  await page.mouse.move(btn.x, btn.y, { steps: 4 });
  await sleep(350);
  return btn;
}
async function clickThemeRow(page) {
  const btn = await openPageMenu(page);
  const row = await boxOf(page, '#v2-btn-slide-theme');
  if (!row || !row.width) throw new Error('ligne « Thème… » masquée');
  await page.mouse.move(btn.x, row.y, { steps: 8 });
  await page.mouse.move(row.x, row.y, { steps: 3 });
  await sleep(120);
  await page.mouse.click(row.x, row.y);
  await sleep(600);
  await away(page);
}
const ROW = '#pp-slide-theme .pp-slide-theme-row[data-value="etat"]';
// La neuvième ligne est sous le pli de la liste (huit lignes se voient) : la molette, la souris sur la liste, l'amène, comme le fait la personne.
async function reachRow(page) {
  const list = await boxOf(page, '#pp-slide-theme .pp-slide-theme-list');
  await page.mouse.move(list.x, list.y, { steps: 3 });
  await page.mouse.wheel(0, 400);
  await sleep(350);
  return list;
}
// La fenêtre : la ligne de l'État (et si la souris la trouve), ce qui est coché, l'aperçu, la ligne sous les couleurs, ce qui est ouvert par-dessus.
const winState = page => page.evaluate((sel) => {
  const overlay = document.getElementById('pp-slide-theme');
  if (!overlay || getComputedStyle(overlay).display === 'none') return null;
  const list = overlay.querySelector('.pp-slide-theme-list');
  const row = overlay.querySelector('.pp-slide-theme-row[data-value="etat"]');
  const r = row ? row.getBoundingClientRect() : null;
  const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
  const style = el => { const cs = getComputedStyle(el); return { color: cs.color, family: cs.fontFamily.split(',')[0].replace(/["']/g, ''), background: cs.backgroundColor }; };
  const paper = overlay.querySelector('.pp-slide-theme-paper');
  const dots = row ? Array.from(row.querySelectorAll('.pp-slide-theme-dots i')).map(i => getComputedStyle(i).backgroundColor) : [];
  const box = overlay.querySelector('.pp-modal-box').getBoundingClientRect();
  return {
    row: row && { text: row.textContent.trim(), disabled: row.getAttribute('aria-disabled'), checked: row.getAttribute('aria-checked'), title: row.title, locked: row.classList.contains('is-locked'), height: r.height, reachable: hit === row || row.contains(hit), dots },
    checked: Array.from(overlay.querySelectorAll('.pp-slide-theme-row[aria-checked="true"]')).map(b => b.dataset.value),
    rows: overlay.querySelectorAll('.pp-slide-theme-row').length,
    listScrolls: list.scrollHeight > list.clientHeight + 1,
    paper: style(paper), previewTitle: style(overlay.querySelector('.pp-slide-theme-sample-title')), previewText: style(overlay.querySelector('.pp-slide-theme-sample-text')),
    caption: overlay.querySelector('.pp-slide-theme-caption').textContent,
    fonts: Array.from(overlay.querySelectorAll('.pp-slide-theme-select')).map(s => s.value),
    chips: Array.from(overlay.querySelectorAll('.pp-slide-theme-chip')).map(c => ({ slot: c.dataset.slot, label: c.getAttribute('aria-label') })),
    inPanel: box.left >= -0.5 && box.top >= -0.5 && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5,
  };
}, ROW);
// La petite fenêtre de messages de l'app (Dialogs : #pp-dialog-modal), celle qui renvoie vers GFS quand l'extension manque.
const noticeOpen = page => page.evaluate(() => { const overlay = document.getElementById('pp-dialog-modal'); return !!overlay && getComputedStyle(overlay).display !== 'none'; });

async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const setExtensions = async (page, list) => {
  await page.evaluate(l => window.__gfsStub.setExtensions(l), list);
  const want = list.includes('etat');
  for (let i = 0; i < 40; i++) { if ((await page.evaluate(() => Extensions.isActive('etat'))) === want) break; await sleep(60); }
  await sleep(250);
};
const setMode = (page, on) => page.evaluate(({ key, on }) => {
  if (!StateMode.isDeclared()) PersonStore.set(key, JSON.stringify({ v: StateMode.TEXT_VERSION, quality: 'etat', date: '2026-11-01', on: true }));
  StateMode.setOn(on);
}, { key: KEY, on });
const hexOf = rgb => '#' + (rgb.match(/\d+/g) || []).slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');

async function run(lang, colorScheme) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page, natives } = await t.openPage({ hosted: true, stub: { extensions: BASE }, seed: SEED, lang, colorScheme });
  // Le journal des messages d'état (l'enregistrement automatique toutes les 2,5 s remplace le message du thème : un message lu plus tard peut déjà être « Enregistré à… »).
  await page.evaluate(() => {
    window.__statusLog = [];
    const el = document.getElementById('status-msg');
    new MutationObserver(() => window.__statusLog.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));
  const open = async (id, slides) => {
    await Promise.race([
      page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
      sleep(20000),
    ]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(n => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === n; }, slides, { timeout: 15000 }).catch(() => {});
    await sleep(900);
    return page.evaluate(n => String(Templates.getCurrentId()) === String(n), id);
  };
  if (!await open(7, 2)) { check(tag + 'la présentation s\'ouvre', false); await page.context().close(); return; }
  const themeNow = () => page.evaluate(() => { const theme = PageLayout.getTheme(); return theme ? { title: theme.colors.title, text: theme.colors.text, bg: theme.colors.bg, fonts: theme.fonts, name: theme.name } : null; });
  const htmlNow = () => page.evaluate(() => Editor.getHTML());
  const before = await htmlNow();

  // --- 1) Sans l'extension de l'État.
  await clickThemeRow(page);
  const list = await reachRow(page);
  let win = await winState(page);
  check(tag + 'la fenêtre « Thème » s\'ouvre, dans le panneau, avec la ligne « ' + T.name + ' » (neuf lignes, la liste défile : la neuvième s\'atteint à la molette)', !!win && win.inPanel && !!win.row && win.row.text === T.name && win.rows === 9 && win.listScrolls && list.height > 150, win);
  const missing = await page.evaluate(() => StateStyle.lock());
  check(tag + 'sans l\'extension : la ligne est grisée (aria-disabled, jamais retirée), sa raison en info-bulle, atteignable à la souris et assez haute', !!win && win.row.disabled === 'true' && win.row.locked && win.row.title === missing.reason && missing.reason.length > 20 && win.row.reachable && win.row.height >= 24 && missing.missing === true, { row: win && win.row, missing });
  check(tag + 'le nom de la ligne grisée se lit (4,5:1 au moins) et les pastilles de couleur du thème y sont', (await contrastOf(page, ROW + ' .pp-slide-theme-name')) >= 4.5 && !!win && win.row.dots.length === 4, [await contrastOf(page, ROW + ' .pp-slide-theme-name'), win && win.row.dots]);
  await snap(page, `${lang}-${colorScheme}-1-grise`);
  await realClick(page, ROW);
  win = await winState(page);
  check(tag + 'un vrai clic sur la ligne grisée ne coche rien, l\'aperçu garde l\'aspect d\'origine et la ligne sous les couleurs dit la raison', !!win && win.checked.join(',') === '' && win.row.checked === 'false' && win.caption === missing.reason && win.paper.background !== BLUE, win && { checked: win.checked, caption: win.caption, paper: win.paper });
  // Hébergé, le clic demande à GFS sa fenêtre d'installation de l'extension (appel `installer`, js/extensions.js : explain) ; seul, la petite fenêtre de messages de l'app le dit.
  const asked = await page.evaluate(() => window.__gfsStub.calls.filter(c => c.nom === 'installer').map(c => c.args));
  check(tag + 'le clic demande à GFS sa fenêtre d\'installation de l\'extension « etat » (l\'extension manque) et la fenêtre du thème reste ouverte', asked.length === 1 && JSON.stringify(asked[0]).indexOf('etat') !== -1 && !!(await winState(page)), asked);
  if (await noticeOpen(page)) { await page.keyboard.press('Escape'); await sleep(400); }
  win = await winState(page);
  check(tag + 'la fenêtre du thème est toujours là, rien n\'est coché, le modèle n\'a pas bougé', !!win && win.checked.join(',') === '' && (await htmlNow()) === before && (await themeNow()) === null, win && win.checked);

  // --- 2) L'extension est là, le mode éteint.
  await page.keyboard.press('Escape');
  await sleep(400);
  await setExtensions(page, BASE.concat('etat'));
  await clickThemeRow(page);
  await reachRow(page);
  win = await winState(page);
  const off = await page.evaluate(() => StateStyle.lock());
  check(tag + 'l\'extension là, le mode éteint : la ligne reste grisée et dit « Allumez d\'abord le mode »', !!win && win.row.disabled === 'true' && win.row.title === T.off && off.reason === T.off && off.missing === false, { row: win && win.row, off });
  await realClick(page, ROW);
  win = await winState(page);
  const noticeNow = await noticeOpen(page);
  check(tag + 'un vrai clic dit la raison dans la ligne sous les couleurs, ne coche rien et n\'ouvre aucune fenêtre', !!win && win.caption === T.off && win.checked.join(',') === '' && !noticeNow, { caption: win && win.caption, checked: win && win.checked, noticeNow });
  await page.keyboard.press('Escape');
  await sleep(400);

  // --- 3) Le mode allumé.
  await setMode(page, true);
  await clickThemeRow(page);
  await reachRow(page);
  win = await winState(page);
  check(tag + 'le mode allumé : la ligne est libre (aria-disabled faux), son info-bulle dit ce qu\'elle pose', !!win && win.row.disabled === null && !win.row.locked && win.row.title.length > 20 && win.row.title !== T.off, win && win.row);
  await realClick(page, ROW);
  win = await winState(page);
  check(tag + 'un vrai clic la coche (seule), l\'aperçu prend le fond blanc, le Bleu France des titres, le gris #161616 du texte et Arial', !!win && win.checked.join(',') === 'etat' && win.paper.background === WHITE && win.previewTitle.color === BLUE && win.previewText.color === INK
    && win.previewTitle.family === 'Arial' && win.previewText.family === 'Arial', win && { checked: win.checked, paper: win.paper, title: win.previewTitle, text: win.previewText });
  check(tag + 'les deux polices de la fenêtre sont Arial et rien n\'est écrit dans le modèle avant « Appliquer »', !!win && win.fonts.join(',') === 'Arial,Arial' && (await themeNow()) === null && (await htmlNow()) === before, win && win.fonts);
  await snap(page, `${lang}-${colorScheme}-2-coche`);
  const apply = '#pp-slide-theme .pp-modal-actions .var-modal-primary';
  await realClick(page, apply);
  await sleep(900);
  await away(page);
  const posed = await themeNow();
  check(tag + '« Appliquer » pose le thème : titres Bleu France, texte #161616, fond blanc, Arial', !!posed && posed.title === '#000091' && posed.text === '#161616' && posed.bg === '#ffffff' && posed.fonts.title === 'Arial' && posed.fonts.body === 'Arial', posed);
  const said = await page.evaluate(() => window.__statusLog.slice());
  check(tag + 'le coin d\'état dit que le thème est appliqué', said.some(line => T.applied.test(line)), said);
  const paint = await page.evaluate(() => {
    const look = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { color: cs.color, family: cs.fontFamily.split(',')[0].replace(/["']/g, '') }; };
    const root = document.querySelector('#editor-container .ProseMirror');
    return { h1: look(root.querySelector('h1')), p: look(root.querySelector('p')) };
  });
  check(tag + 'dans l\'éditeur, le titre est en Bleu France et le texte en gris #161616', !!paint.h1 && paint.h1.color === BLUE && paint.p.color === INK && paint.h1.family === 'Arial', paint);
  await clickThemeRow(page);
  await reachRow(page);
  win = await winState(page);
  check(tag + 'la fenêtre rouverte montre « ' + T.name + ' » cochée (reconnue comme thème prêt)', !!win && win.checked.join(',') === 'etat' && win.row.disabled === null, win && { checked: win.checked, row: win.row });
  await page.keyboard.press('Escape');
  await sleep(500);

  // --- 4) Le diaporama (F5) joue le thème posé.
  await page.evaluate(() => EditorCore.getEditor().commands.focus());
  await sleep(200);
  await page.keyboard.press('F5');
  await sleep(1400);
  const show = await page.evaluate(() => {
    const stage = document.getElementById('pp-slide-show-stage');
    const scope = stage && stage.shadowRoot ? stage.shadowRoot.querySelector('.pp-print-scope') : null;
    const layer = scope && scope.querySelector(':scope > .pp-slide-show-layer:not(.pp-slide-show-ghost)');
    if (!layer) return null;
    const look = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { color: cs.color, family: cs.fontFamily.split(',')[0].replace(/["']/g, '') }; };
    return { title: look(layer.querySelector('h1')), text: look(layer.querySelector('p')) };
  });
  check(tag + 'le diaporama (F5) dans le panneau joue le thème : titre en Bleu France et en Arial, texte en gris #161616', !!show && !!show.title && show.title.color === BLUE && show.title.family === 'Arial' && show.text.color === INK, show);
  await snap(page, `${lang}-${colorScheme}-3-diaporama`);
  await page.keyboard.press('Escape');
  await sleep(500);

  // --- 5) Le mode éteint de nouveau : le thème déjà posé reste posé, la ligne cochée reste grisée.
  await setMode(page, false);
  await clickThemeRow(page);
  await reachRow(page);
  win = await winState(page);
  check(tag + 'le mode éteint, le thème déjà posé reste posé (rien ne bouge dans le modèle), sa ligne reste cochée mais grisée', !!win && win.checked.join(',') === 'etat' && win.row.disabled === 'true' && (await themeNow()).title === '#000091', win && { checked: win.checked, row: win.row });
  await snap(page, `${lang}-${colorScheme}-4-eteint`);
  await page.keyboard.press('Escape');
  await sleep(400);

  check(tag + 'aucune erreur de page ni boîte native pendant tout le parcours', errors.length === 0 && natives.length === 0, { errors, natives });
  await page.context().close();
}

await run('fr', 'light');
await run('en', 'dark');
await t.finish();
