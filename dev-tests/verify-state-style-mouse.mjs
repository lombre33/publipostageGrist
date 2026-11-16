#!/usr/bin/env node
// Le style de l'État dans le document (js/state-style.js, lot 2 du mode « Identité de l'État ») à la VRAIE souris et au vrai clavier, dans le panneau de 700x400 de Grist, HÉBERGÉ (GFS simulé, dev-tests/gfs-stub.js),
// en français clair puis en anglais sombre. Ce que scenarios-state-style.js ne voit pas depuis la page :
//   1) mode allumé : la ligne « Appliquer le style de l'État » du menu Titre (au survol) est atteignable au bout du menu (la souris trouve la ligne au centre), libre, assez haute, dans la largeur du menu ;
//      un vrai clic peint les titres en Marianne, #161616, aux tailles papier, le coin d'état le dit ; Ctrl+Z défait d'un coup, Ctrl+Y remet ;
//   2) le menu de la couleur de police : les deux rangées de l'État sont là, tiennent dans le panneau, leurs pastilles sont atteignables, leurs intitulés lisibles (>= 4,5:1) ; un vrai clic sur le bleu
//      France clair pose la couleur ET le coin d'état dit pourquoi on la garde pour les filets (lisible >= 4,5:1) ; un clic sur le bleu France ne dit rien ;
//   2 bis) la fenêtre de l'encadré (mode allumé) : la ligne « État » montre ses cinq départs, tient dans le panneau avec ses deux boutons au premier plan, un vrai clic sur « Succès » peint l'aperçu en
//      teinte et barre de l'État (lisible), « Insérer » pose l'encadré, Ctrl+Z le retire d'un coup ; mode éteint la ligne est cachée ;
//   3) mode éteint : la ligne est grisée (atteignable, jamais retirée), un vrai clic dit pourquoi dans le coin d'état sans rien changer, et le menu de couleur n'a plus les rangées de l'État ;
//   4) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « stateStyleMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-state-style-mouse.mjs
// STATE_STYLE_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, stopServer, sleep, center, click } from './load-lib.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.STATE_STYLE_PORT || 9059);
const SHOTS = process.env.STATE_STYLE_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const SPEC = { tables: [{ id: 'EtatClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const KEY = 'pp_etat_declaration';
const SAMPLE = '<h1>Un titre</h1><h2>Un sous-titre</h2><h3>Un troisième</h3><p>Un paragraphe de texte.</p>';

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
  fr: { apply: 'Appliquer le style de l’État', applied: 'Style de l’État appliqué aux titres de ce modèle.', off: 'Allume d’abord le mode « Identité de l’État » (Réglages, onglet Thème).', row: 'Couleurs de l’État', alerts: 'Alertes de l’État', lightBlue: /4,22:1.*filets/, stateRow: 'État', names: ['Mise en avant', 'Information', 'Succès', 'Attention', 'Erreur'] },
  en: { apply: 'Apply the State style', applied: 'State style applied to this template’s headings.', off: 'Turn on the “State identity” mode first (Settings, Theme tab).', row: 'State colors', alerts: 'State alerts', lightBlue: /4\.22:1.*rules/, stateRow: 'State', names: ['Highlight', 'Information', 'Success', 'Warning', 'Error'] },
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
  PersonStore.set(key, JSON.stringify({ v: StateMode.TEXT_VERSION, quality: 'etat', date: '2026-11-01', on }));
  StateStyle.syncRow(document.getElementById('v2-btn-state-style-apply'), EditorCore.getEditor());
}, { key: KEY, on });
const statusOf = page => page.evaluate(() => document.getElementById('status-msg').textContent);
const quiet = page => page.evaluate(() => { document.getElementById('status-msg').textContent = ''; });
const HTML = page => page.evaluate(() => Editor.getHTML());
const paintOf = (page, selector) => page.evaluate(sel => Array.from(document.querySelectorAll(sel)).map((el) => {
  const cs = getComputedStyle(el);
  return { size: Math.round(parseFloat(cs.fontSize) * 72 / 96 * 10) / 10, color: cs.color, family: cs.fontFamily.split(',')[0].replace(/["']/g, '') };
}), selector);

async function setDocument(page) {
  await page.evaluate(h => Editor.setHTML(h), SAMPLE);
  await sleep(300);
  await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    let at = null;
    ed.state.doc.descendants((n, pos) => { if (at === null && n.isText && n.text.indexOf('Un titre') !== -1) at = pos + 1; });
    ed.chain().focus().setTextSelection(at).run();
  });
  await sleep(500);
}
async function openTitleMenu(page) {
  const chip = await center(page, '#v2-heading-chip');
  await page.mouse.move(chip.x - 20, chip.y);
  await page.mouse.move(chip.x, chip.y, { steps: 4 });
  await sleep(450);
  const inside = await page.evaluate(() => { const r = document.getElementById('v2-heading-flyout').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 40 }; });
  await page.mouse.move(chip.x, chip.y + 15, { steps: 3 });
  await page.mouse.move(inside.x, inside.y, { steps: 6 });
  await sleep(250);
}
const rowInfo = page => page.evaluate(`(() => {
  ${PAGE_HELPERS}
  const row = document.getElementById('v2-btn-state-style-apply');
  const flyout = document.getElementById('v2-heading-flyout');
  const f = flyout.getBoundingClientRect();
  const b = row.getBoundingClientRect();
  const under = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return {
    text: row.textContent, disabled: row.getAttribute('aria-disabled'), title: row.title, x: b.left + b.width / 2, y: b.top + b.height / 2, height: Math.round(b.height),
    insideFlyout: b.left >= f.left && b.right <= f.right && b.top >= f.top && b.bottom <= f.bottom, sideScroll: flyout.scrollWidth - flyout.clientWidth,
    underPointerIsRow: !!under && under.closest('#v2-btn-state-style-apply') === row, ratio: ratio(getComputedStyle(row).color, opaque(row)), tab: row.tabIndex,
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
  await sleep(450);
  return before;
}
const leaveMenu = async page => { await page.mouse.move(350, 390, { steps: 6 }); await sleep(500); };
async function selectAllText(page) {
  await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    let from = null, to = null;
    ed.state.doc.descendants((n, pos) => { if (n.isText && n.text.indexOf('Un paragraphe') !== -1) { from = pos; to = pos + n.nodeSize; } });
    ed.chain().focus().setTextSelection({ from, to }).run();
  });
  await sleep(300);
}
async function selectText(page, needle) {
  await page.evaluate((text) => {
    const ed = EditorCore.getEditor();
    let from = null, to = null;
    ed.state.doc.descendants((n, pos) => { if (from === null && n.isText && n.text.indexOf(text) !== -1) { from = pos; to = pos + n.nodeSize; } });
    ed.chain().focus().setTextSelection({ from, to }).run();
  }, needle);
  await sleep(300);
}
async function openColorMenu(page) {
  const c = await center(page, '#v2-btn-text-color-caret');
  await page.mouse.move(c.x - 15, c.y);
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await sleep(60);
  await page.mouse.click(c.x, c.y);
  await sleep(350);
}
const menuState = page => page.evaluate(`(() => {
  ${PAGE_HELPERS}
  const menu = document.querySelector('.v2-color-dropdown.visible');
  if (!menu) return null;
  const m = menu.getBoundingClientRect();
  const rows = Array.from(menu.querySelectorAll('.cp-row')).map((r) => {
    const label = r.querySelector('.cp-row-label');
    return { scope: r.dataset.scope, label: label.textContent, ratio: ratio(getComputedStyle(label).color, opaque(label)), swatches: r.querySelectorAll('.cp-swatch').length, forgets: r.querySelectorAll('.cp-forget').length };
  });
  const light = menu.querySelector('.cp-swatch[data-color="#6a6af4"]');
  const lr = light ? light.getBoundingClientRect() : null;
  const under = lr ? document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2) : null;
  return {
    inWindow: m.left >= 0 && m.top >= 0 && m.right <= innerWidth && m.bottom <= innerHeight, rect: [Math.round(m.left), Math.round(m.top), Math.round(m.right), Math.round(m.bottom)], rows,
    lightReachable: !!under && light.contains(under), light: lr ? { x: lr.left + lr.width / 2, y: lr.top + lr.height / 2 } : null,
    blue: (() => { const b = menu.querySelector('.cp-swatch[data-color="#000091"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })(),
    footerSeen: (() => { const f = menu.querySelector('.cp-custom'); if (!f) return false; const r = f.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; })(),
  };
})()`);

const windowState = page => page.evaluate(`(() => {
  ${PAGE_HELPERS}
  const ov = document.getElementById('pp-callout-modal');
  if (!ov || getComputedStyle(ov).display === 'none') return null;
  const box = ov.querySelector('.pp-modal-box');
  const b = box.getBoundingClientRect();
  const label = document.getElementById('pp-callout-state-label');
  const group = ov.querySelector('[aria-labelledby="pp-callout-state-label"]');
  const shown = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  const onTop = (el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (el === t || el.contains(t)); };
  const ok = ov.querySelector('.pp-modal-actions .var-modal-primary');
  const cancel = Array.from(ov.querySelectorAll('.pp-modal-actions button')).find(x => !x.classList.contains('var-modal-primary') && x.getBoundingClientRect().width > 0);
  const buttons = group ? Array.from(group.querySelectorAll('button')) : [];
  const preview = ov.querySelector('.pp-callout-paper .callout');
  const pc = getComputedStyle(preview);
  return {
    inPanel: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, okSeen: onTop(ok), cancelSeen: onTop(cancel),
    labelShown: shown(label), groupShown: shown(group), label: label ? label.textContent : null, names: buttons.map(x => x.textContent.trim()),
    labelRatio: shown(label) ? ratio(getComputedStyle(label).color, opaque(label)) : null,
    nameRatios: buttons.filter(shown).map(x => ratio(getComputedStyle(x.querySelector('.pp-callout-type-name')).color, opaque(x))),
    iconRatios: buttons.filter(shown).map((x) => { const i = x.querySelector('.pp-callout-type-icon'); return ratio(getComputedStyle(i).color, getComputedStyle(i).backgroundColor); }),
    checked: buttons.filter(x => x.getAttribute('aria-checked') === 'true').map(x => x.dataset.value),
    previewColor: preview.dataset.color, previewIcon: preview.dataset.icon, previewBg: pc.backgroundColor, previewBar: pc.borderLeftColor,
  };
})()`);
async function revealIn(page, selector) {
  await page.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ block: 'nearest' }); }, selector);
  await sleep(150);
}
const calloutAttrs = page => page.evaluate(() => { let found = null; EditorCore.getEditor().state.doc.descendants((n) => { if (!found && n.type.name === 'callout') found = n.attrs; }); return found; });
const closeCallout = async (page) => {
  if (await page.evaluate(() => { const ov = document.getElementById('pp-callout-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; })) { await page.keyboard.press('Escape'); await sleep(250); }
};
const textColorOf = page => page.evaluate(() => ColorMath.parseCss(EditorCore.getEditor().getAttributes('textStyle').color));
const statusLook = page => page.evaluate(`(() => {
  ${PAGE_HELPERS}
  const el = document.getElementById('status-msg');
  return { ratio: ratio(getComputedStyle(el).color, opaque(el)), text: el.textContent };
})()`);

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

    // ---- 1) Mode allumé : « Appliquer le style de l'État » ----
    await setDocument(page);
    await setMode(page, true);
    const original = await HTML(page);
    await openTitleMenu(page);
    let row = await reachRow(page);
    check(tag + ' : la ligne « ' + words.apply + ' » est atteignable au bout du menu Titre (la souris trouve la ligne), dans sa largeur', row.text === words.apply && row.insideFlyout && row.underPointerIsRow && row.sideScroll <= 0, row);
    check(tag + ' : mode allumé, la ligne est libre (aria-disabled=false, au clavier), assez haute (>= 24 px) et lisible (>= 4,5:1)', row.disabled === 'false' && row.tab === 0 && row.height >= 24 && row.ratio >= 4.5, row);
    await shot(page, tag.replace(' ', '-') + '-1-menu-titre');
    await quiet(page);
    await clickRow(page);
    let heads = await paintOf(page, '#editor-container .ProseMirror h1, #editor-container .ProseMirror h2, #editor-container .ProseMirror h3');
    check(tag + ' : un vrai clic peint les titres en Marianne, #161616, 26 / 22 / 18 pt', heads.length === 3 && heads.every(h => h.family === 'Marianne' && h.color === 'rgb(22, 22, 22)') && heads.map(h => h.size).join() === '26,22,18', heads);
    check(tag + ' : le coin d\'état dit « ' + words.applied + ' »', (await statusOf(page)) === words.applied, await statusOf(page));
    const applied = await HTML(page);
    check(tag + ' : le style est écrit dans le modèle (HTML enregistré) et le texte n\'a pas bougé', /data-level-styles/.test(applied) && applied.replace(/<div class="heading-numbering-config"[^>]*><\/div>/, '').includes('<h1>Un titre</h1>'), applied.slice(0, 200));
    await shot(page, tag.replace(' ', '-') + '-2-titres-peints');
    await leaveMenu(page);
    await page.evaluate(() => { EditorCore.getEditor().commands.focus('end'); });
    await sleep(150);
    await page.keyboard.press('Control+z');
    await sleep(500);
    check(tag + ' : au vrai clavier, UN Ctrl+Z défait le style (le HTML revient octet pour octet)', (await HTML(page)) === original, (await HTML(page)).slice(0, 160));
    await page.keyboard.press('Control+y');
    await sleep(500);
    check(tag + ' : Ctrl+Y remet le style', (await HTML(page)) === applied);

    // ---- 2) Le menu de la couleur de police ----
    await selectAllText(page);
    await openColorMenu(page);
    let m = await menuState(page);
    check(tag + ' : le menu de couleur montre « ' + words.row + ' » et « ' + words.alerts + ' » avant les couleurs gardées, sans croix, 10 et 5 pastilles', !!m && m.rows.map(r => r.scope).join() === 'state,state-alerts,model,document' && m.rows[0].label === words.row && m.rows[1].label === words.alerts && m.rows[0].swatches === 10 && m.rows[1].swatches === 5 && m.rows[0].forgets === 0 && m.rows[1].forgets === 0, m);
    check(tag + ' : le menu tient dans le panneau 700x400, son pied « Personnalisé… » reste visible', !!m && m.inWindow && m.footerSeen, m && { rect: m.rect, footer: m.footerSeen });
    check(tag + ' : les intitulés des rangées sont lisibles (>= 4,5:1)', !!m && m.rows.every(r => r.ratio >= 4.5), m && m.rows.map(r => [r.scope, r.ratio]));
    await shot(page, tag.replace(' ', '-') + '-3-menu-couleur');
    check(tag + ' : la pastille du bleu France clair est atteignable à la souris', !!m && m.lightReachable, m && m.light);
    await quiet(page);
    await page.mouse.move(m.blue.x, m.blue.y, { steps: 4 });
    await page.mouse.click(m.blue.x, m.blue.y);
    await sleep(400);
    check(tag + ' : un vrai clic sur le bleu France pose #000091 sans avis', (await textColorOf(page)) === '#000091' && !words.lightBlue.test(await statusOf(page)), { color: await textColorOf(page), status: await statusOf(page) });
    await selectAllText(page);
    await openColorMenu(page);
    m = await menuState(page);
    await page.mouse.move(m.light.x, m.light.y, { steps: 4 });
    await page.mouse.click(m.light.x, m.light.y);
    await sleep(500);
    const look = await statusLook(page);
    check(tag + ' : un vrai clic sur le bleu France clair pose #6a6af4 ET le coin d\'état dit pourquoi le garder pour les filets', (await textColorOf(page)) === '#6a6af4' && words.lightBlue.test(look.text), { color: await textColorOf(page), status: look.text });
    check(tag + ' : l\'avis est lisible (>= 4,5:1)', look.ratio >= 4.5, look);
    await shot(page, tag.replace(' ', '-') + '-4-avis-bleu-clair');


    // ---- 2 bis) La fenêtre de l'encadré, mode allumé ----
    await page.evaluate(() => { EditorCore.closeDropdownPanel(); Editor.setHTML('<p>Du texte à encadrer.</p>'); });
    await sleep(300);
    await selectText(page, 'Du texte');
    const beforeCallout = await HTML(page);
    await page.evaluate(() => Callout.open());
    await sleep(350);
    let cw = await windowState(page);
    check(tag + ' : la fenêtre de l\'encadré, mode allumé, montre la ligne « ' + words.stateRow + ' » et ses cinq départs : ' + words.names.join(', '), !!cw && cw.labelShown && cw.groupShown && cw.label === words.stateRow && JSON.stringify(cw.names) === JSON.stringify(words.names), cw);
    check(tag + ' : la fenêtre tient dans le panneau 700x400, ses deux boutons au premier plan', !!cw && cw.inPanel && cw.okSeen && cw.cancelSeen, cw);
    check(tag + ' : l\'intitulé et les noms de la ligne sont lisibles (>= 4,5:1)', !!cw && cw.labelRatio >= 4.5 && cw.nameRatios.length === 5 && cw.nameRatios.every(r => r >= 4.5), cw && { label: cw.labelRatio, names: cw.nameRatios });
    check(tag + ' : les icônes des cinq départs se lisent (>= 3:1 sur leur pastille blanche), aussi en thème sombre', !!cw && cw.iconRatios.length === 5 && cw.iconRatios.every(r => r >= 3), cw && cw.iconRatios);
    await revealIn(page, '#pp-callout-modal [aria-labelledby="pp-callout-state-label"] button[data-value="state-success"]');
    await click(page, '#pp-callout-modal [aria-labelledby="pp-callout-state-label"] button[data-value="state-success"]');
    await sleep(250);
    cw = await windowState(page);
    check(tag + ' : un vrai clic sur « ' + words.names[2] + ' » peint l\'aperçu en teinte #b8fec9 et barre #18753c, avec l\'icône coche, et le coche', !!cw && cw.previewColor === 'state-success' && cw.previewIcon === 'check' && cw.previewBg === 'rgb(184, 254, 201)' && cw.previewBar === 'rgb(24, 117, 60)' && cw.checked.join() === 'state-success', cw);
    await shot(page, tag.replace(' ', '-') + '-6-fenetre-encadre');
    await revealIn(page, '#pp-callout-modal .pp-modal-actions .var-modal-primary');
    await click(page, '#pp-callout-modal .pp-modal-actions .var-modal-primary');
    await sleep(400);
    const attrs = await calloutAttrs(page);
    check(tag + ' : « Insérer » pose l\'encadré de l\'État (couleur et icône dans le document)', !!attrs && attrs.color === 'state-success' && attrs.icon === 'check', attrs);
    await page.evaluate(() => { EditorCore.getEditor().commands.focus('end'); });
    await sleep(150);
    await page.keyboard.press('Control+z');
    await sleep(500);
    check(tag + ' : au vrai clavier, UN Ctrl+Z retire l\'encadré (le HTML revient octet pour octet)', (await HTML(page)) === beforeCallout, (await HTML(page)).slice(0, 200));
    await setMode(page, false);
    await selectText(page, 'Du texte');
    await page.evaluate(() => Callout.open());
    await sleep(350);
    cw = await windowState(page);
    check(tag + ' : mode éteint, la ligne « ' + words.stateRow + ' » est cachée et la fenêtre reste entière', !!cw && !cw.labelShown && !cw.groupShown && cw.inPanel && cw.okSeen, cw);
    await closeCallout(page);
    await setMode(page, true);

    // ---- 3) Mode éteint ----
    await setMode(page, false);
    await page.evaluate(() => { EditorCore.closeDropdownPanel(); });
    await setDocument(page);
    const start = await HTML(page);
    await openTitleMenu(page);
    row = await reachRow(page);
    check(tag + ' : mode éteint, la ligne reste là, grisée (aria-disabled), atteignable, sa raison au survol', row.text === words.apply && row.disabled === 'true' && row.tab === -1 && row.title === words.off && row.insideFlyout && row.underPointerIsRow, row);
    await shot(page, tag.replace(' ', '-') + '-5-ligne-grisee');
    await quiet(page);
    await clickRow(page);
    check(tag + ' : un vrai clic sur la ligne grisée dit pourquoi dans le coin d\'état et ne change rien', (await statusOf(page)) === words.off && (await HTML(page)) === start, { status: await statusOf(page) });
    await leaveMenu(page);
    await selectAllText(page);
    await openColorMenu(page);
    m = await menuState(page);
    check(tag + ' : mode éteint, le menu de couleur n\'a plus que « Couleurs du modèle » et « Couleurs partagées »', !!m && m.rows.map(r => r.scope).join() === 'model,document', m && m.rows.map(r => r.scope));
    await page.evaluate(() => { EditorCore.closeDropdownPanel(); });
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
