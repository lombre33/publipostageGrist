#!/usr/bin/env node
// « Mettre dans la phrase » / « Mettre sur sa ligne » (demande d'Antoine du 2026-11-26 : « un bloc de texte conditionnel qui puisse commencer en cours de ligne », sans bloquer le texte
// JUSTIFIÉ - carte « Comment faire commencer ton texte conditionnel en cours de ligne ? », réponse « Bouton « Mettre dans la phrase » ») à la VRAIE souris et au VRAI clavier
// (page.mouse / page.keyboard, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en thème clair, sombre, puis en anglais ; la fenêtre de condition à 360 px aussi.
// dev-tests/scenarios-cond-inline.js vérifie la logique DANS la page (dispatchEvent) ; ici, ce que seuls une vraie souris, un vrai clavier et de vraies mesures de pixels prouvent : l'étiquette du
// bloc cliquée, l'icône de condition de la barre, le bouton dans la fenêtre (au premier plan, dans la fenêtre, sans chevauchement, sur une ou deux lignes), le texte JUSTIFIÉ mesuré - avec le bloc la
// ligne d'avant est la dernière de son paragraphe et reste courte, une fois dans la phrase toutes les lignes sauf la dernière vont jusqu'au bord -, Ctrl+Z qui rend le bloc, le chemin inverse depuis
// la valeur, et le bouton grisé (aux pixels : opacité) avec sa raison quand le bloc ne tient pas dans une ligne.
// Lancé par run-headless.mjs (groupe Node "condInlineMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-cond-inline-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.COND_INLINE_MOUSE_PORT || 9740);
const WIDTH = 700;
const HEIGHT = 400;

async function regenerateHarness() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const stubbed = html.replace('<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>', '<script src="dev-tests/grist-stub.js"></script>');
  await writeFile(join(ROOT, '_test-harness.html'), stubbed);
}
await regenerateHarness();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(target));
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((ok, ko) => server.listen(PORT, '127.0.0.1', ok).on('error', ko));
const BASE = `http://127.0.0.1:${PORT}`;

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

// COND_INLINE_SHOTS=<dossier> : enregistre des captures aux moments clés, à relire à l'œil.
const SHOTS = process.env.COND_INLINE_SHOTS || '';
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];

async function openWidget(colorScheme, width) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => { pageErrors.push('boîte inattendue : ' + d.message()); d.accept().catch(() => {}); });
  await page.route('**://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => /prêt|ready/i.test((document.getElementById('status-msg') || {}).textContent || ''), null, { timeout: 90000 });
  return { context, page };
}

// Centre d'un élément, entièrement dans le panneau ?, et au premier plan (un contrôle recouvert par autre chose ne recevrait pas le clic) ?
async function hitTest(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, w: r.width, h: r.height,
      inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}
async function realClick(page, box) {
  await page.mouse.move(box.x - 6, box.y, { steps: 2 });
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
}
const park = page => page.mouse.move(400, 330);

// La ligne de boutons de la fenêtre de condition : où est chaque bouton visible, au premier plan ?, la ligne déborde-t-elle, sur combien de lignes.
const footerOf = page => page.evaluate(() => {
  const box = document.querySelector('#var-condition-modal .var-modal-content').getBoundingClientRect();
  const actions = document.querySelector('#var-condition-modal .var-modal-actions');
  const buttons = Array.from(actions.querySelectorAll('button')).filter(b => !b.hidden).map(b => {
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { text: b.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: !!top && (top === b || b.contains(top)), title: b.title,
      disabled: b.disabled, opacity: Number(getComputedStyle(b).opacity), cls: b.className };
  });
  return { box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, buttons, rowOverflow: actions.scrollWidth - actions.clientWidth, rows: new Set(buttons.map(b => Math.round(b.top))).size };
});
const inside = f => f.buttons.every(b => b.left >= f.box.left && b.right <= f.box.right && b.top >= f.box.top && b.bottom <= f.box.bottom);
const noOverlap = f => f.buttons.every((b, i) => i === 0 || f.buttons[i - 1].top !== b.top || f.buttons[i - 1].right <= b.left + 0.5);

// Les lignes du premier paragraphe du document, mesurées : chaque ligne (les rectangles de ses morceaux groupés par hauteur) avec le bord droit de son dernier morceau, et le bord droit du
// contenu du paragraphe. Un texte justifié étire chaque ligne - sauf la dernière - jusqu'à ce bord ; la dernière reste courte.
const linesOf = page => page.evaluate(() => {
  const p = document.querySelector('.tiptap > p');
  const cs = getComputedStyle(p);
  const box = p.getBoundingClientRect();
  const contentRight = box.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
  const range = document.createRange();
  range.selectNodeContents(p);
  const lines = [];
  for (const r of Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 4)) {
    const centre = r.top + r.height / 2;
    const line = lines.find(l => Math.abs(l.centre - centre) < r.height / 2);
    if (line) line.right = Math.max(line.right, r.right); else lines.push({ centre, right: r.right });
  }
  lines.sort((a, b) => a.centre - b.centre);
  return { align: cs.textAlign, contentRight, lines: lines.map(l => Math.round(l.right * 10) / 10), text: p.textContent.slice(-20) };
});
// Les lignes d'un paragraphe justifié, sauf la dernière, vont jusqu'au bord du contenu (à 3 px près : une bulle de variable fait un morceau entier).
const stretched = m => m.lines.length >= 2 && m.lines.slice(0, -1).every(right => Math.abs(right - m.contentRight) <= 3);
const lastGap = m => m.contentRight - m.lines[m.lines.length - 1];

const state = page => page.evaluate(() => {
  const ed = EditorCore.getEditor();
  if (ed.view.domObserver && ed.view.domObserver.flush) ed.view.domObserver.flush();
  const sel = ed.state.selection;
  const values = Array.from(document.querySelectorAll('.tiptap .conditional-value'));
  return {
    html: ed.getHTML(), blocks: document.querySelectorAll('.tiptap .conditional-text').length, values: values.length, tops: ed.state.doc.childCount,
    caretParent: sel.$from.parent.type.name, caretAtEnd: sel.empty && sel.$from.parentOffset === sel.$from.parent.content.size,
    windowOpen: !!document.getElementById('var-condition-modal') && getComputedStyle(document.getElementById('var-condition-modal')).display !== 'none' && document.getElementById('var-condition-modal').getClientRects().length > 0,
    focusInEditor: !!document.activeElement && !!document.activeElement.closest('.tiptap'),
  };
});

const COND = JSON.stringify({ mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] }).replace(/"/g, '&quot;');
const BADGE = column => `<span class="var-badge" data-table="CiDossiers" data-column="${column}" data-key="CiDossiers.${column}"></span>`;
const INTRO = 'Je vous informe de la décision de l’université suite au Comité Thématique Opérationnel Innovation du 16/11/2026 de ';
const BODY = `financer dans le cadre de ses investissements d’avenir, via le programme ${BADGE('Titre')}, le poste « ${BADGE('Statut')} » à hauteur de ${BADGE('Montant')} euros correspondant à un support de poste pour ${BADGE('Responsable')} mois.`;
const DOC = `<p style="text-align: justify">${INTRO}</p><div class="conditional-text" data-condition="${COND}"><p style="text-align: justify">${BODY}</p></div><p>Fin du courrier</p>`;

// Ouvre la fenêtre de condition du nœud désigné à la vraie souris : un clic sur `target` (l'étiquette du bloc, ou le texte de la valeur), puis l'icône de condition de la barre.
// Le texte d'une valeur s'étend sur plusieurs lignes et contient des pastilles : le centre de son rectangle tombe sur une pastille. On vise donc un caractère du premier texte.
async function textHit(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && node.textContent.trim().length < 3) node = walker.nextNode();
    if (!node) return { found: false };
    const start = node.textContent.search(/\S/) + 1;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + 1);
    node.parentElement.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = range.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, w: r.width, h: r.height,
      inViewport: r.width > 0 && r.height > 0 && x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight,
      onTop: !!top && el.contains(top) && !top.closest('.var-badge'),
    };
  }, selector);
}

async function openWindow(page, target) {
  const hit = target.includes('conditional-value') ? await textHit(page, target) : await hitTest(page, target);
  if (!hit.found || !hit.inViewport || !hit.onTop) return { opened: false, hit };
  await realClick(page, hit);
  await page.waitForTimeout(200);
  const icon = await hitTest(page, '.v2-varfmt-toolbar button[data-action="var-condition"]');
  if (!icon.found || !icon.inViewport || !icon.onTop) return { opened: false, hit, icon };
  await realClick(page, icon);
  await page.waitForTimeout(300);
  return { opened: (await state(page)).windowOpen, hit, icon };
}

async function seedData(page, doc) {
  await page.evaluate(async ({ doc }) => {
    const stub = window.__gristStub;
    stub.setVariables('CiDossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Text', Montant: 'Numeric' });
    stub.setRows('CiDossiers', [
      { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200 },
      { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 'Martin Anne', Montant: 50 },
    ]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200 }, 'CiDossiers');
    Editor.setHTML(doc);
  }, { doc });
  await page.waitForTimeout(500);
  await park(page);
}

async function runTheme(theme, lang, width) {
  const label = (theme === 'dark' ? 'sombre' : 'clair') + (lang === 'en' ? ', anglais' : '') + `, ${width} px`;
  console.log(`\n=== « Mettre dans la phrase » à la vraie souris et au vrai clavier, ${width}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme, width);
  const T = lang === 'en'
    ? { toValue: 'Put in the sentence', toBlock: 'Put on its own line', unwrapBlock: 'Unwrap block', cancel: 'Cancel', save: 'Save', remove: 'Remove condition', notOne: /^Only a block made of a single paragraph/ }
    : { toValue: 'Mettre dans la phrase', toBlock: 'Mettre sur sa ligne', unwrapBlock: 'Défaire le bloc', cancel: 'Annuler', save: 'Enregistrer', remove: 'Retirer la condition', notOne: /^Seul un bloc d’un seul paragraphe/ };
  if (lang === 'en') await page.evaluate(() => I18n.setLang('en'));
  await seedData(page, DOC);

  // 1) Avant : le bloc coupe le paragraphe justifié, sa dernière ligne reste courte.
  const before = await linesOf(page);
  check('avec le bloc, le premier paragraphe est justifié et sa dernière ligne reste courte (le problème de départ)', before.align === 'justify' && before.lines.length >= 1 && lastGap(before) > 25, before);
  await shot(page, `1-bloc-${theme}-${lang}-${width}`);

  // 2) Étiquette du bloc, icône de condition, fenêtre : le bouton y est, au premier plan, dans la fenêtre, sans chevauchement.
  const opened = await openWindow(page, '.tiptap .conditional-text-tag');
  check('un vrai clic sur l’étiquette du bloc puis sur l’icône de condition ouvre la fenêtre', opened.opened, opened);
  const footer = await footerOf(page);
  const labels = footer.buttons.map(b => b.text);
  const switchButton = footer.buttons.find(b => b.cls.includes('var-modal-switch'));
  check('la fenêtre du bloc montre « ' + T.toValue + ' » après « ' + T.unwrapBlock + ' »', JSON.stringify(labels) === JSON.stringify([T.remove, T.unwrapBlock, T.toValue, T.cancel, T.save]), labels);
  check('tous les boutons sont dans la fenêtre, au premier plan, sans chevauchement ni débordement de côté', inside(footer) && noOverlap(footer) && footer.buttons.every(b => b.onTop) && footer.rowOverflow <= 1, { box: footer.box, rows: footer.rows, overflow: footer.rowOverflow });
  check('le bouton est actif (opacité pleine) et son info-bulle dit ce qu’il fait', !!switchButton && !switchButton.disabled && switchButton.opacity === 1 && /justifi/i.test(switchButton.title), switchButton);
  await shot(page, `2-fenetre-${theme}-${lang}-${width}`);
  if (width < 500) {
    // À 360 px on ne mesure que la fenêtre : « Annuler » d'un vrai clic, rien n'a changé.
    const cancel = footer.buttons.find(b => b.text === T.cancel);
    await realClick(page, cancel);
    await page.waitForTimeout(150);
    const after = await state(page);
    check('« ' + T.cancel + ' » ferme la fenêtre sans toucher au document', !after.windowOpen && after.blocks === 1 && after.values === 0, after);
    await context.close();
    return;
  }

  // 3) Un vrai clic sur le bouton : le bloc devient une valeur au bout de la ligne, le texte justifié va d'un bout à l'autre.
  await realClick(page, switchButton);
  await page.waitForTimeout(300);
  const placed = await state(page);
  check('le clic met le bloc dans la phrase : une valeur, plus de bloc, un paragraphe de moins, fenêtre fermée', placed.values === 1 && placed.blocks === 0 && placed.tops === 2 && !placed.windowOpen, placed);
  check('le curseur est au bout du texte, dans la valeur, et l’éditeur a le focus', placed.caretParent === 'conditionalValue' && placed.caretAtEnd && placed.focusInEditor, placed);
  await park(page);
  const merged = await linesOf(page);
  check('le texte est justifié d’un bout à l’autre : toutes les lignes sauf la dernière vont jusqu’au bord, sur plus de lignes qu’avant', stretched(merged) && merged.lines.length > before.lines.length, { before, merged });
  await shot(page, `3-dans-la-phrase-${theme}-${lang}-${width}`);

  // 4) Ctrl+Z du vrai clavier rend le bloc et le problème d'avant.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  const undone = await state(page);
  const again = await linesOf(page);
  check('Ctrl+Z rend le bloc (et sa condition) : un bloc, plus de valeur, la dernière ligne d’avant de nouveau courte', undone.blocks === 1 && undone.values === 0 && /data-condition/.test(undone.html) && lastGap(again) > 25, { undone: { blocks: undone.blocks, values: undone.values }, again });
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(300);
  const redone = await state(page);
  check('Ctrl+Maj+Z la remet dans la phrase', redone.values === 1 && redone.blocks === 0, redone);

  // 5) Le chemin inverse : un vrai clic dans le texte de la valeur, l'icône de condition, « Mettre sur sa ligne ».
  const reverse = await openWindow(page, '.tiptap .conditional-value');
  check('un vrai clic dans la valeur puis sur l’icône de condition ouvre sa fenêtre', reverse.opened, reverse);
  const footer2 = await footerOf(page);
  const toBlock = footer2.buttons.find(b => b.cls.includes('var-modal-switch'));
  check('la fenêtre de la valeur montre « ' + T.toBlock + ' », actif, dans la fenêtre et au premier plan', !!toBlock && toBlock.text === T.toBlock && !toBlock.disabled && inside(footer2) && noOverlap(footer2) && footer2.buttons.every(b => b.onTop), footer2.buttons.map(b => b.text));
  await realClick(page, toBlock);
  await page.waitForTimeout(300);
  const back = await state(page);
  const backLines = await linesOf(page);
  check('le clic remet le texte dans un bloc sur sa ligne : un bloc, plus de valeur, le paragraphe d’avant de nouveau coupé, fenêtre fermée', back.blocks === 1 && back.values === 0 && !back.windowOpen && lastGap(backLines) > 25, { back: { blocks: back.blocks, values: back.values, open: back.windowOpen }, backLines });
  check('le curseur est au bout du texte du bloc et l’éditeur a le focus', back.caretParent === 'paragraph' && back.caretAtEnd && back.focusInEditor, back);
  await shot(page, `4-retour-au-bloc-${theme}-${lang}-${width}`);

  // 6) Un bloc qui ne tient pas dans une ligne : bouton grisé (opacité), raison en info-bulle, un clic dessus ne fait rien.
  await page.evaluate(({ cond }) => Editor.setHTML('<p>Avant </p><div class="conditional-text" data-condition="' + cond + '"><ul><li><p>Un</p></li><li><p>Deux</p></li></ul></div><p>Fin</p>'), { cond: COND });
  await page.waitForTimeout(300);
  await park(page);
  const grey = await openWindow(page, '.tiptap .conditional-text-tag');
  const footer3 = await footerOf(page);
  const greyed = footer3.buttons.find(b => b.cls.includes('var-modal-switch'));
  check('la fenêtre d’un bloc qui contient une liste s’ouvre', grey.opened, grey);
  check('le bouton est grisé aux pixels (opacité < 0,6), sa raison est en info-bulle', !!greyed && greyed.disabled && greyed.opacity < 0.6 && T.notOne.test(greyed.title), greyed);
  const htmlBefore = (await state(page)).html;
  if (greyed) await realClick(page, greyed);
  await page.waitForTimeout(200);
  const stay = await state(page);
  check('un vrai clic sur le bouton grisé ne change rien et laisse la fenêtre ouverte', stay.html === htmlBefore && stay.windowOpen, { same: stay.html === htmlBefore, open: stay.windowOpen });
  await shot(page, `5-grise-${theme}-${lang}-${width}`);
  await context.close();
}

await runTheme('light', 'fr', WIDTH);
await runTheme('dark', 'en', WIDTH);
await runTheme('light', 'fr', 360);

check('aucune erreur de page ni boîte inattendue', pageErrors.length === 0, pageErrors);
await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
