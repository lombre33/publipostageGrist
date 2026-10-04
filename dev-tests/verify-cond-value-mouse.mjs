#!/usr/bin/env node
// Valeur conditionnelle (demande d'Antoine du 2026-10-02, point 5 : « une valeur - un ou plusieurs mots, un nombre, etc. - qui s'affiche de manière conditionnelle », choix « Dans la phrase »)
// à la VRAIE souris et au VRAI clavier (page.mouse / page.keyboard, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en thème clair, sombre, puis en anglais.
// dev-tests/scenarios-cond-value.js vérifie la logique DANS la page (dispatchEvent) ; ici, ce que seuls une vraie souris et un vrai clavier prouvent : la liste « # » et son onglet Chips
// atteignables, l'entrée « Valeur conditionnelle » qui se clique et pose une valeur vide encadrée où le curseur est (texte d'attente), la frappe qui va dans la valeur et son cadre qui grandit
// avec elle, Entrée (retour à la ligne dans la valeur), les flèches qui sortent de la valeur et la frappe qui se pose derrière (ou devant) son cadre - Chrome, seul, la rend à la fin de
// l'élément qui précède -, Retour arrière et Suppr aux bords qui ne mangent pas le texte voisin, le texte entièrement effacé qui laisse la valeur (et sa condition), la valeur vide
// retirée par Retour arrière puis rendue par Ctrl+Z, la barre des variables (ses trois icônes sans objet grisées AUX PIXELS) et la fenêtre de condition entières dans le panneau, un
// texte sélectionné à la souris qui est entouré, la Lecture (valeur affichée sans cadre, ou retirée sans toucher à la phrase), « Défaire la valeur » (texte gardé, Ctrl+Z / Ctrl+Maj+Z).
// Lancé par run-headless.mjs (groupe Node "condValueMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-cond-value-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.COND_VALUE_MOUSE_PORT || 8951);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-cond-text-mouse.mjs.
async function regenerateHarness() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const stubbed = html.replace(
    '<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>',
    '<script src="dev-tests/grist-stub.js"></script>'
  );
  await writeFile(join(ROOT, '_test-harness.html'), stubbed);
}
await regenerateHarness();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((ok, ko) => server.listen(PORT, '127.0.0.1', ok).on('error', ko));
const BASE = `http://127.0.0.1:${PORT}`;

const esmMapPath = join(CACHE, 'esm-map.json');
const OFFLINE = existsSync(esmMapPath);
const esmMap = OFFLINE ? JSON.parse(readFileSync(esmMapPath, 'utf8')) : {};
const UMD_ROUTES = OFFLINE ? [
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/vfs_fonts\.min\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-cond-value-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

// COND_VALUE_SHOTS=<dossier> : enregistre des captures aux moments clés, à relire à l'œil (comme COND_TEXT_SHOTS pour le bloc).
const SHOTS = process.env.COND_VALUE_SHOTS || '';
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];

async function openWidget(colorScheme) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => { pageErrors.push('boîte inattendue : ' + d.message()); d.accept().catch(() => {}); });
  if (OFFLINE) {
    await page.route('**://esm.sh/**', async route => {
      const url = route.request().url();
      const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
      if (chunk) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
      const spec = Object.keys(esmMap).find(k => url === `https://esm.sh/${k}` || url === `https://esm.sh/*${k}` || url.startsWith(`https://esm.sh/${k}@`) || url.startsWith(`https://esm.sh/*${k}@`));
      if (!spec) return route.fulfill({ status: 404, body: `// pas de miroir local pour ${url}` });
      route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(ROOT, esmMap[spec].replace(/^\//, '')), 'utf8')) });
    });
    for (const [re, rel] of UMD_ROUTES) {
      await page.route(re, async route => route.fulfill({
        status: 200, contentType: 'text/javascript; charset=utf-8',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: await readFile(join(CACHE, rel), 'utf8'),
      }));
    }
    await page.addInitScript(() => {
      Object.defineProperty(HTMLScriptElement.prototype, 'integrity', { configurable: true, get: () => '', set: () => {} });
    });
    await page.route('**://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route('**://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
  }
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  return { context, page };
}

// Centre d'un élément, entièrement dans le panneau ?, et au premier plan (un contrôle recouvert par autre chose ne recevrait pas le clic) ?
async function hitTest(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height,
      inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}
// Une ligne de liste retrouvée par son texte exact (la liste « # » n'a pas d'identifiant par ligne).
async function hitByText(page, selector, text) {
  return page.evaluate(({ selector, text }) => {
    const el = Array.from(document.querySelectorAll(selector)).find(e => e.textContent.trim() === text);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { found: true, x, y, inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === el || el.contains(top)) };
  }, { selector, text });
}
// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, box) {
  await page.mouse.move(box.x - 6, box.y, { steps: 2 });
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
}
// Souris garée dans la page, loin des menus au survol de la barre d'outils (un geste qui part du coin haut gauche en traverse un et le laisse ouvert sur le texte).
const park = page => page.mouse.move(400, 330);
const pressTimes = async (page, key, n) => { for (let i = 0; i < n; i++) await page.keyboard.press(key); };

// « Encre » d'un contrôle sur une VRAIE capture d'écran : écart moyen entre ses pixels et celui de son coin (le fond) - un contrôle grisé, clair ou sombre, y est
// nettement plus faible (même mesure que dev-tests/verify-read-mode-mouse.mjs).
async function ink(page, selector) {
  const b = await hitTest(page, selector);
  if (!b.found || !b.inViewport) return null;
  const png = await page.screenshot({ clip: { x: Math.ceil(b.left), y: Math.ceil(b.top), width: Math.floor(b.w) - 1, height: Math.floor(b.h) - 1 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]);
    return sum / (d.length / 4);
  }, png.toString('base64'));
}

// Choisit une colonne dans le champ d'une règle comme une personne : clic sur le champ visible (liste avec recherche, js/search-select.js), frappe du nom, clic sur
// la ligne au nom exact.
async function pickColumn(page, scope, name) {
  const field = await hitTest(page, scope + ' .macro-rule-column-wrap .ss-trigger');
  await realClick(page, field);
  await page.waitForTimeout(120);
  await page.keyboard.type(name);
  await page.waitForTimeout(80);
  const row = await page.evaluate(({ scope, name }) => {
    const found = Array.from(document.querySelectorAll(scope + ' .ss-panel:not([hidden]) .ss-option')).find(r => r.querySelector('.ss-name').textContent === name);
    if (!found) return null;
    const r = found.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { scope, name });
  if (row) await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(150);
  return !!row;
}

const BADGE = column => `<span class="var-badge" data-table="CvDossiers" data-column="${column}" data-key="CvDossiers.${column}"></span>`;
const RECORD_URGENT = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200 };
const RECORD_NORMAL = { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 'Martin Anne', Montant: 50 };
const stripConditions = html => html.replace(/ data-condition="[^"]*"/g, ' data-condition=…');

// La ligne de boutons de la fenêtre de condition : où est chaque bouton visible, est-il au premier plan, la ligne déborde-t-elle, sur combien de lignes.
const footerOf = page => page.evaluate(() => {
  const box = document.querySelector('#var-condition-modal .var-modal-content').getBoundingClientRect();
  const actions = document.querySelector('#var-condition-modal .var-modal-actions');
  const buttons = Array.from(actions.querySelectorAll('button')).filter(b => !b.hidden).map(b => {
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { text: b.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, onTop: !!top && (top === b || b.contains(top)), title: b.title };
  });
  return { box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, buttons, rowOverflow: actions.scrollWidth - actions.clientWidth, rows: new Set(buttons.map(b => Math.round(b.top))).size };
});
const inside = f => f.buttons.every(b => b.left >= f.box.left && b.right <= f.box.right && b.top >= f.box.top && b.bottom <= f.box.bottom);
const noOverlap = f => f.buttons.every((b, i) => i === 0 || f.buttons[i - 1].top !== b.top || f.buttons[i - 1].right <= b.left + 0.5);

// Tout ce qu'on veut savoir de la première valeur de la page, d'un coup : le document, la sélection (ProseMirror ET navigateur), le cadre (taille, lignes, contour, texte d'attente).
const valueInfo = page => page.evaluate(() => {
  const ed = EditorCore.getEditor();
  // ProseMirror suit le curseur du navigateur après coup (événement de sélection) ; il le fait de force à chaque touche enfoncée. Ici aussi, avant de mesurer.
  if (ed.view.domObserver && ed.view.domObserver.flush) ed.view.domObserver.flush();
  const spans = Array.from(document.querySelectorAll('.tiptap .conditional-value'));
  const v = spans[0];
  const sel = ed.state.selection;
  const info = {
    count: spans.length, html: ed.getHTML(), paragraphs: ed.state.doc.childCount,
    caretInValue: sel.empty && sel.$from.parent.type.name === 'conditionalValue', caretOffset: sel.$from.parentOffset, selectedText: window.getSelection().toString(),
  };
  if (v) {
    const r = v.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(v);
    const cs = getComputedStyle(v);
    const dom = window.getSelection();
    Object.assign(info, {
      rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }, textWidth: range.getBoundingClientRect().width, lines: v.getClientRects().length,
      outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, hasCondition: v.classList.contains('has-condition'), placeholder: getComputedStyle(v, '::before').content, text: v.textContent,
      domCaretInside: !!dom.anchorNode && v.contains(dom.anchorNode), title: v.title,
    });
  }
  return info;
});
const docHtml = page => page.evaluate(() => EditorCore.getEditor().getHTML());
// Un point DANS le texte de la première valeur (au caractère `index` de son texte), pris au moment du clic : la page a pu bouger depuis la dernière mesure.
const valuePoint = (page, index, selector) => page.evaluate(({ index, selector }) => {
  const v = document.querySelector(selector || '.tiptap .conditional-value');
  v.scrollIntoView({ block: 'center' });
  const t = v.firstChild;
  const r = document.createRange();
  r.setStart(t, index); r.setEnd(t, index + 1);
  const b = r.getBoundingClientRect();
  return { x: b.left + 1, y: b.top + b.height / 2 };
}, { index, selector });
// Flèches gauche du vrai clavier depuis l'intérieur de la valeur, jusqu'à ce que le curseur en sorte : le navigateur ne s'arrête pas au début du contenu, il pose le curseur à la fin du texte
// d'AVANT le cadre (même place à l'écran). Rend la dernière mesure, ou null s'il n'en est pas sorti.
async function walkOutLeft(page) {
  for (let i = 0; i < 60; i++) {
    const s = await valueInfo(page);
    if (!s.caretInValue) return s;
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(60);
  }
  return null;
}
// Le curseur de la valeur au bord voulu, par les flèches du vrai clavier (il part de là où le clic l'a posé) ; faux s'il sort de la valeur en route ou n'arrive pas.
async function walkInValue(page, edge) {
  for (let i = 0; i < 60; i++) {
    const s = await valueInfo(page);
    if (!s.caretInValue) return false;
    if (edge === 'start' ? s.caretOffset === 0 : s.caretOffset === s.text.length) return true;
    await page.keyboard.press(edge === 'start' ? 'ArrowLeft' : 'ArrowRight');
    // ProseMirror suit le curseur du navigateur après coup (événement de sélection) : sans cette pause, la mesure suivante lirait l'ancienne place.
    await page.waitForTimeout(60);
  }
  return false;
}

async function runTheme(theme, lang) {
  const label = (theme === 'dark' ? 'sombre' : 'clair') + (lang === 'en' ? ', anglais' : '');
  console.log(`\n=== Valeur conditionnelle à la vraie souris et au vrai clavier, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);
  const T = lang === 'en'
    ? { entry: 'Conditional value', textEntry: 'Conditional text', placeholder: '"value"', intro: /^This value only appears in read mode/, shown: /condition met, the value is shown/, unwrap: 'Unwrap value', remove: 'Remove condition', cancel: 'Cancel', save: 'Save', unwrapTitle: /the value’s text stays where it is/ }
    : { entry: 'Valeur conditionnelle', textEntry: 'Texte conditionnel', placeholder: '"valeur"', intro: /^Cette valeur n’apparaît en lecture/, shown: /condition remplie, la valeur s’affiche/, unwrap: 'Défaire la valeur', remove: 'Retirer la condition', cancel: 'Annuler', save: 'Enregistrer', unwrapTitle: /le texte de la valeur reste à sa place/ };
  if (lang === 'en') await page.evaluate(() => I18n.setLang('en'));

  // Données : la table de la page et l'annuaire lié par la colonne Référence Responsable ; une ligne « Urgent » courante, un document de quatre paragraphes.
  await page.evaluate(async ({ record, badge }) => {
    const stub = window.__gristStub;
    stub.setVariables('CvAnnuaire', { NomPrenom: 'Text', Telephone: 'Text' });
    stub.setVariables('CvDossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:CvAnnuaire', Montant: 'Numeric' });
    stub.setRows('CvAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44' }, { id: 8, NomPrenom: 'Martin Anne', Telephone: '06 55 66 77 88' }]);
    stub.setRows('CvDossiers', [
      { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7, Montant: 1200 },
      { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 8, Montant: 50 },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.saveLinkRule('CvAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
    stub.fireRecord(record, 'CvDossiers');
    Editor.setHTML('<p>Madame, Monsieur,</p><p>Dossier suivi par ' + badge + '.</p><p>Merci de régler le dossier</p><p>Fin du courrier</p>');
  }, { record: RECORD_URGENT, badge: BADGE('Responsable') });
  await page.waitForTimeout(400);
  await park(page);

  // 1) Une vraie souris à la fin du troisième paragraphe, une espace, le bouton « Insérer une variable », l'onglet Chips, la ligne « Valeur conditionnelle ».
  const endOfThird = await page.evaluate(() => {
    const p = Array.from(document.querySelectorAll('.tiptap > p')).find(x => x.textContent === 'Merci de régler le dossier');
    const r = p.getBoundingClientRect();
    return { x: r.right - 8, y: r.top + r.height / 2 };
  });
  await realClick(page, endOfThird);
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  const insertButton = await hitTest(page, '#v2-btn-insert-variable');
  await realClick(page, insertButton);
  await page.waitForTimeout(250);
  const chipsTab = await hitTest(page, '#autocomplete-box .ac-tab[data-tab="chips"]');
  check(`${label} - la liste « # » s'ouvre entièrement dans le panneau et l'onglet Chips est atteignable à la vraie souris`,
    (await hitTest(page, '#autocomplete-box')).inViewport && chipsTab.found && chipsTab.inViewport && chipsTab.onTop, chipsTab);
  await realClick(page, chipsTab);
  await page.waitForTimeout(150);
  const entries = await page.evaluate(() => Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).map(i => i.textContent.trim()));
  const entry = await hitByText(page, '#autocomplete-box .ac-item', T.entry);
  await shot(page, `${theme}-${lang}-1-liste-chips`);
  check(`${label} - l'entrée « ${T.entry} » est dans l'onglet Chips, juste après « ${T.textEntry} », visible et au premier plan`,
    entry.found && entry.inViewport && entry.onTop && entries.indexOf(T.entry) === entries.indexOf(T.textEntry) + 1 && entries.indexOf(T.entry) > 0, { entry, entries });
  if (entry.found) await realClick(page, entry);
  await page.waitForTimeout(250);
  let info = await valueInfo(page);
  check(`${label} - clic sur l'entrée : une valeur VIDE se pose à la place de « # », au bout de la phrase (même paragraphe), la liste se ferme`,
    info.count === 1 && info.paragraphs === 4 && stripConditions(info.html).includes('<p>Merci de régler le dossier <span class="conditional-value"></span></p>') && !(await hitTest(page, '#autocomplete-box')).inViewport, info);
  check(`${label} - le curseur est DANS la valeur vide (ProseMirror et navigateur), qui est encadrée en pointillés et affiche son texte d'attente`,
    info.caretInValue && info.domCaretInside && info.outlineStyle === 'dashed' && info.placeholder === T.placeholder && info.rect.width >= 25 && info.rect.width < 120, info);
  const placeholderContrast = await page.evaluate(() => {
    const v = document.querySelector('.tiptap .conditional-value');
    const lum = ([r, g, b]) => { const f = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const color = getComputedStyle(v, '::before').color.match(/[\d.]+/g).slice(0, 3).map(Number);
    const bg = getComputedStyle(v).backgroundColor.match(/[\d.]+/g).map(Number);
    // La page est blanche dans les deux thèmes : le voile de la valeur se lit sur du blanc.
    const alpha = bg.length > 3 ? bg[3] : 1;
    const flat = bg.slice(0, 3).map(c => Math.round(c * alpha + 255 * (1 - alpha)));
    const [hi, lo] = [lum(color), lum(flat)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  });
  check(`${label} - le texte d'attente est lisible sur le voile de la valeur (contraste au moins 4,5:1)`, placeholderContrast >= 4.5, placeholderContrast);

  // 2) La barre des variables s'ouvre sur la valeur : trois icônes, celles qui n'ont pas d'objet grisées aux pixels (moins de 60 % de l'encre des mêmes icônes actives sur une bulle).
  const bar = await hitTest(page, '.v2-varfmt-toolbar.visible');
  const barButtons = {
    condition: await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-condition"]'),
    linked: await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-linked"]'),
    loop: await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-loop"]'),
  };
  const barRelation = await page.evaluate(() => {
    const b = document.querySelector('.v2-varfmt-toolbar.visible');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const v = document.querySelector('.tiptap .conditional-value').getBoundingClientRect();
    return { barBottom: r.bottom, barLeft: r.left, barRight: r.right, valueTop: v.top, valueCenter: v.left + v.width / 2 };
  });
  await shot(page, `${theme}-${lang}-2-valeur-vide-barre`);
  check(`${label} - le curseur dans la valeur ouvre la barre des variables, dans le panneau, posée au-dessus du cadre, avec ses trois icônes atteignables`,
    bar.found && bar.inViewport && barRelation && barRelation.barBottom <= barRelation.valueTop + 14 && ['condition', 'linked', 'loop'].every(k => barButtons[k].found && barButtons[k].inViewport && barButtons[k].onTop), { bar, barRelation, barButtons });
  const greyedInk = { linked: await ink(page, '.v2-varfmt-toolbar.visible button[data-action="var-linked"]'), loop: await ink(page, '.v2-varfmt-toolbar.visible button[data-action="var-loop"]') };
  // Pour comparer : l'icône de condition de la même barre (active sur une valeur). Les trois icônes n'ont pas le même dessin : le seuil est large (moins de 60 %), mesuré sur des pixels.
  const activeInk = await ink(page, '.v2-varfmt-toolbar.visible button[data-action="var-condition"]');
  check(`${label} - « Autres attributs » et « Boucle » grisés sur une valeur : moins de 60 % de l'encre de l'icône de condition, active, de la même barre`,
    greyedInk.linked != null && greyedInk.loop != null && activeInk != null && greyedInk.linked < activeInk * 0.6 && greyedInk.loop < activeInk * 0.6, { greyedInk, activeInk });
  await park(page);
  // Retour dans la valeur vide à la vraie souris : un clic sur son texte d'attente y pose le curseur.
  await realClick(page, await hitTest(page, '.tiptap .conditional-value'));
  await page.waitForTimeout(250);
  info = await valueInfo(page);
  check(`${label} - un vrai clic sur la valeur vide y ramène le curseur (ProseMirror et navigateur) et rouvre sa barre`, info.caretInValue && info.domCaretInside && (await hitTest(page, '.v2-varfmt-toolbar.visible')).found, info);
  await realClick(page, await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-linked"]'));
  await realClick(page, await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-loop"]'));
  await page.waitForTimeout(250);
  const greyClick = await page.evaluate(() => ({ modals: Array.from(document.querySelectorAll('.modal-overlay, .var-modal-overlay')).filter(m => getComputedStyle(m).display !== 'none' && m.getClientRects().length).length, barOpen: !!document.querySelector('.v2-varfmt-toolbar.visible') }));
  check(`${label} - un vrai clic sur une icône grisée n'ouvre rien et la barre reste`, greyClick.modals === 0 && greyClick.barOpen, greyClick);
  await realClick(page, await hitTest(page, '.tiptap .conditional-value'));
  await page.waitForTimeout(200);

  // 3) Frappe au vrai clavier : le texte va dans la valeur, son cadre l'épouse et reste sur la ligne de la phrase.
  const lineHeight = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.tiptap > p')).lineHeight) || document.querySelector('.tiptap > p').getBoundingClientRect().height);
  const sentenceTop = await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap > p')).find(x => x.textContent.startsWith('Merci')).getBoundingClientRect().top);
  await page.keyboard.type('avant ce soir');
  await page.waitForTimeout(120);
  info = await valueInfo(page);
  check(`${label} - la frappe va dans la valeur (le curseur y était) et le cadre épouse son texte, sur la ligne de la phrase, à la largeur du texte`,
    stripConditions(info.html).includes('<p>Merci de régler le dossier <span class="conditional-value">avant ce soir</span></p>') && info.caretInValue && info.textWidth > 50
      && Math.abs(info.rect.width - info.textWidth) <= 2 && info.rect.top >= sentenceTop - 2 && info.rect.bottom <= sentenceTop + lineHeight + 4 && info.lines === 1, { info, lineHeight, sentenceTop });
  await shot(page, `${theme}-${lang}-3-valeur-tapee`);

  // Entrée : un retour à la ligne DANS la valeur (le cadre grandit d'une ligne, le paragraphe n'est pas coupé) ; Retour arrière le reprend.
  await page.keyboard.press('Enter');
  await page.keyboard.type('sans faute');
  await page.waitForTimeout(120);
  info = await valueInfo(page);
  await shot(page, `${theme}-${lang}-4-valeur-deux-lignes`);
  check(`${label} - Entrée dans la valeur : un retour à la ligne dedans (le cadre passe sur deux lignes), le paragraphe n'est pas coupé et le curseur reste dans la valeur`,
    stripConditions(info.html).includes('<span class="conditional-value">avant ce soir<br>sans faute</span>') && info.paragraphs === 4 && info.lines >= 2 && info.caretInValue && info.rect.height > lineHeight * 1.5, info);
  await pressTimes(page, 'Backspace', 'sans faute'.length + 1);
  await page.waitForTimeout(120);
  info = await valueInfo(page);
  check(`${label} - Retour arrière efface le texte puis le retour à la ligne : la valeur retrouve sa seule ligne`, stripConditions(info.html).includes('<span class="conditional-value">avant ce soir</span></p>') && info.lines === 1 && info.caretInValue, info);

  // 4) Sortir de la valeur au clavier : flèche droite à la fin (la valeur ferme le paragraphe : la flèche passait au paragraphe suivant), puis un point et la suite de la phrase.
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  info = await valueInfo(page);
  check(`${label} - flèche droite à la fin de la valeur : le curseur sort de la valeur (ProseMirror), sans changer de paragraphe, et la barre des variables se ferme`,
    !info.caretInValue && (await page.evaluate(() => EditorCore.getEditor().state.selection.$from.parent.type.name)) === 'paragraph' && (await page.evaluate(() => EditorCore.getEditor().state.selection.from)) === (await page.evaluate(() => { let pos = -1; EditorCore.getEditor().state.doc.descendants((n, p) => { if (n.type.name === 'conditionalValue') pos = p + n.nodeSize; }); return pos; }))
      && !(await hitTest(page, '.v2-varfmt-toolbar.visible')).found, info);
  await page.keyboard.type('.');
  await page.keyboard.type(' Merci');
  await page.waitForTimeout(120);
  info = await valueInfo(page);
  check(`${label} - la frappe qui suit se pose derrière le cadre, pas dedans : « . Merci » après la valeur, dont le texte n'a pas bougé`,
    stripConditions(info.html).includes('<p>Merci de régler le dossier <span class="conditional-value">avant ce soir</span>. Merci</p>') && info.text === 'avant ce soir', info);
  await shot(page, `${theme}-${lang}-5-suite-de-la-phrase`);

  // Les bords au vrai clavier : un vrai clic dans le texte de la valeur, flèche gauche jusqu'à son début ; Retour arrière efface alors l'espace d'AVANT la valeur (et non son texte,
  // « Avant » entier disparaissait) ; la frappe d'une espace la remet devant le cadre.
  await realClick(page, await valuePoint(page, 6));
  await page.waitForTimeout(150);
  const leftOut = await walkOutLeft(page);
  info = await valueInfo(page);
  const beforeFrame = await page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return s.empty && !!s.$from.nodeAfter && s.$from.nodeAfter.type.name === 'conditionalValue'; });
  check(`${label} - un vrai clic dans le texte de la valeur y pose le curseur, les flèches gauche l'en font sortir par le début : le curseur est devant le cadre, le texte de la valeur n'a pas bougé`,
    leftOut !== null && beforeFrame && info.text === 'avant ce soir', { leftOut: !!leftOut, beforeFrame, info });
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(120);
  info = await valueInfo(page);
  check(`${label} - Retour arrière devant le cadre efface le caractère d'avant (l'espace) sans toucher au texte de la valeur ni à « Merci de régler le dossier »`,
    stripConditions(info.html).includes('<p>Merci de régler le dossier<span class="conditional-value">avant ce soir</span>. Merci</p>') && info.text === 'avant ce soir', info);
  await page.keyboard.type(' ');
  await page.waitForTimeout(120);
  info = await valueInfo(page);
  check(`${label} - la frappe d'une espace se pose devant le cadre (le curseur est sorti de la valeur) : la phrase est rétablie, la valeur n'a pas grossi`,
    stripConditions(info.html).includes('<p>Merci de régler le dossier <span class="conditional-value">avant ce soir</span>. Merci</p>') && info.text === 'avant ce soir', info);
  // Suppr à la fin : efface le point d'APRÈS la valeur ; le point retapé se pose derrière le cadre.
  await realClick(page, await valuePoint(page, 6));
  await page.waitForTimeout(150);
  const reachedEnd = await walkInValue(page, 'end');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(120);
  info = await valueInfo(page);
  check(`${label} - Suppr à la fin de la valeur efface le caractère d'après (le point) sans entamer le texte de la valeur ni la suite`,
    reachedEnd && stripConditions(info.html).includes('<p>Merci de régler le dossier <span class="conditional-value">avant ce soir</span> Merci</p>') && info.text === 'avant ce soir', { reachedEnd, info });
  // Le curseur est resté dans la valeur (c'est là qu'était la personne) : flèche droite en sort, le point retapé se pose alors derrière le cadre.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('.');
  await page.waitForTimeout(120);
  info = await valueInfo(page);
  check(`${label} - flèche droite puis le point retapé : il se pose derrière le cadre, pas dedans`, stripConditions(info.html).includes('<span class="conditional-value">avant ce soir</span>. Merci</p>') && info.text === 'avant ce soir', info);

  // 5) La fenêtre de condition : la même que celle d'une bulle, entière dans 700x400, colonne choisie à la souris, valeur tapée, aperçu, Enregistrer.
  await realClick(page, await valuePoint(page, 6));
  await page.waitForTimeout(250);
  await realClick(page, await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-condition"]'));
  await page.waitForTimeout(250);
  await shot(page, `${theme}-${lang}-6-fenetre-condition-vide`);
  const modalBox = await hitTest(page, '#var-condition-modal .var-modal-content');
  check(`${label} - fenêtre de condition ouverte sur la valeur, entièrement dans le panneau`, modalBox.found && modalBox.inViewport, modalBox);
  const introText = await page.evaluate(() => document.querySelector('#var-condition-modal .var-modal-intro').textContent);
  check(`${label} - son introduction parle de la valeur (pas d'une variable ni d'un bloc)`, T.intro.test(introText), introText);
  check(`${label} - colonne Statut choisie à la vraie souris dans la liste avec recherche`, await pickColumn(page, '#var-condition-modal', 'Statut'));
  await realClick(page, await hitTest(page, '#var-condition-modal .macro-rule-value'));
  await page.keyboard.type('Urgent');
  await page.waitForTimeout(700);
  const debugText = await page.evaluate(() => Array.from(document.querySelectorAll('#var-condition-modal .var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent));
  check(`${label} - l'aperçu dit que la valeur s'affiche pour la ligne sélectionnée`, debugText.length > 0 && T.shown.test(debugText[0]), debugText);
  const saveBtn = await hitTest(page, '#var-condition-modal .var-modal-primary');
  check(`${label} - « ${T.save} » est visible et non recouvert à 700x400`, saveBtn.found && saveBtn.inViewport && saveBtn.onTop, saveBtn);
  await realClick(page, saveBtn);
  await page.waitForTimeout(300);
  info = await valueInfo(page);
  check(`${label} - Enregistrer : la fenêtre se ferme, la valeur porte sa condition (cadre plus marqué, info-bulle « Statut = Urgent »), le curseur reste dedans`,
    !(await hitTest(page, '#var-condition-modal .var-modal-content')).inViewport && info.hasCondition && info.outlineColor === 'rgb(91, 127, 192)' && /Statut/.test(info.title) && info.caretInValue
      && stripConditions(info.html).includes('<span class="conditional-value" data-condition=…>avant ce soir</span>'), info);
  await shot(page, `${theme}-${lang}-7-valeur-avec-condition`);

  // 6) Effacer tout le texte de la valeur au vrai clavier : la valeur RESTE, vide, avec sa condition (le navigateur retirait la balise vide). Retaper dedans ; le dernier caractère
  // effacé la laisse aussi ; Retour arrière dans la valeur vide la retire, Ctrl+Z la rend.
  await realClick(page, await valuePoint(page, 6));
  await page.waitForTimeout(150);
  await walkInValue(page, 'end');
  await page.keyboard.down('Shift');
  await pressTimes(page, 'ArrowLeft', 'avant ce soir'.length);
  await page.keyboard.up('Shift');
  info = await valueInfo(page);
  check(`${label} - Maj+flèche gauche sélectionne tout le texte de la valeur`, info.selectedText === 'avant ce soir', info);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(150);
  info = await valueInfo(page);
  check(`${label} - Retour arrière sur tout le texte : la valeur reste, vide, avec sa condition et son texte d'attente, le curseur dedans (ProseMirror et navigateur)`,
    info.count === 1 && info.text === '' && info.hasCondition && info.placeholder === T.placeholder && info.caretInValue && info.domCaretInside && stripConditions(info.html).includes('<span class="conditional-value" data-condition=…></span>'), info);
  await shot(page, `${theme}-${lang}-8-valeur-videe`);
  await page.keyboard.type('x');
  await page.waitForTimeout(100);
  info = await valueInfo(page);
  check(`${label} - retaper dans la valeur vidée : le texte entre dans la valeur (pas derrière son cadre)`, info.text === 'x' && info.caretInValue && info.hasCondition, info);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(150);
  info = await valueInfo(page);
  check(`${label} - Retour arrière sur le dernier caractère : la valeur reste, vide, avec sa condition`, info.count === 1 && info.text === '' && info.hasCondition && info.caretInValue && info.domCaretInside, info);
  // L'historique regroupe les frappes rapprochées (moins de 500 ms) : la valeur retirée se défait seule si une pause la sépare du reste.
  await page.waitForTimeout(700);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(150);
  info = await valueInfo(page);
  check(`${label} - Retour arrière dans la valeur vide la retire (la phrase reste, le curseur à sa place)`, info.count === 0 && stripConditions(info.html).includes('<p>Merci de régler le dossier . Merci</p>'), info);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  info = await valueInfo(page);
  check(`${label} - Ctrl+Z rend la valeur vide avec sa condition, le curseur dedans`, info.count === 1 && info.text === '' && info.hasCondition && info.caretInValue, info);
  await page.keyboard.type('avant ce soir');
  await page.waitForTimeout(120);
  info = await valueInfo(page);
  check(`${label} - la frappe après Ctrl+Z entre bien dans la valeur rendue (le curseur du navigateur y est aussi)`,
    info.text === 'avant ce soir' && info.hasCondition && stripConditions(info.html).includes('<span class="conditional-value" data-condition=…>avant ce soir</span>. Merci</p>'), info);

  // 7) Entourer un texte : double clic sur « Monsieur », bouton, la liste s'ouvre sur Chips (la ligne « Texte conditionnel » en surbrillance), flèche bas, Entrée.
  const word = await page.evaluate(() => {
    const p = document.querySelector('.tiptap > p');
    p.scrollIntoView({ block: 'center' });
    const t = p.firstChild;
    const i = t.data.indexOf('Monsieur');
    const r = document.createRange();
    r.setStart(t, i + 2); r.setEnd(t, i + 3);
    const b = r.getBoundingClientRect();
    return { x: b.left, y: b.top + b.height / 2 };
  });
  await park(page);
  await page.mouse.dblclick(word.x, word.y);
  await page.waitForTimeout(150);
  const selectedWord = await page.evaluate(() => window.getSelection().toString().trim());
  await realClick(page, await hitTest(page, '#v2-btn-insert-variable'));
  await page.waitForTimeout(250);
  const wrapPanel = await page.evaluate(() => {
    const box = document.getElementById('autocomplete-box');
    const tab = box && box.querySelector('.ac-tab.active');
    const sel = box && box.querySelector('.ac-item.selected');
    return { tab: tab && tab.dataset.tab, selected: sel && sel.textContent, open: !!box && box.style.display !== 'none' };
  });
  check(`${label} - un mot sélectionné à la souris : le bouton ouvre la liste sur Chips, « ${T.textEntry} » en surbrillance`, selectedWord === 'Monsieur' && wrapPanel.open && wrapPanel.tab === 'chips' && wrapPanel.selected === T.textEntry, { selectedWord, wrapPanel });
  await page.keyboard.press('ArrowDown');
  const afterDown = await page.evaluate(() => { const sel = document.querySelector('#autocomplete-box .ac-item.selected'); return sel && sel.textContent; });
  check(`${label} - la flèche bas descend sur « ${T.entry} »`, afterDown === T.entry, afterDown);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const wrapped = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('.tiptap .conditional-value'));
    const mine = spans.find(s => s.textContent === 'Monsieur');
    return { count: spans.length, mine: !!mine, paragraph: mine ? mine.parentElement.textContent : null, selection: window.getSelection().toString().trim(), html: EditorCore.getEditor().getHTML().slice(0, 120) };
  });
  check(`${label} - Entrée : le mot sélectionné est entouré d'une valeur, au fil de la phrase, et reste sélectionné`, wrapped.count === 2 && wrapped.mine && wrapped.paragraph === 'Madame, Monsieur,' && wrapped.selection === 'Monsieur', wrapped);
  await shot(page, `${theme}-${lang}-9-mot-entoure`);

  // 8) Lecture : la ligne « Urgent » remplit la condition de la première valeur (sa phrase s'affiche, sans cadre) ; l'autre valeur n'a pas de condition (toujours affichée) ; la ligne
  // « Normal » retire la première valeur, la phrase autour reste.
  await park(page);
  await realClick(page, await hitTest(page, '#btn-mode-read'));
  await page.waitForTimeout(700);
  const reading = () => page.evaluate(() => {
    const content = document.querySelector('#reader-container .reader-content');
    return { shown: !!content && document.getElementById('reader-container').style.display === 'block', text: content ? content.textContent : '', frames: content ? content.querySelectorAll('.conditional-value').length : -1, barOpen: !!document.querySelector('.v2-varfmt-toolbar.visible') };
  });
  let read = await reading();
  await shot(page, `${theme}-${lang}-10-lecture-urgent`);
  check(`${label} - Lecture, ligne « Urgent » : « avant ce soir » s'affiche au fil de la phrase, sans cadre, et « Monsieur » (sans condition) aussi, la barre des variables est fermée`,
    read.shown && read.text.includes('Merci de régler le dossier avant ce soir. Merci') && read.text.includes('Madame, Monsieur,') && read.frames === 0 && !read.barOpen, read);
  await page.evaluate(record => window.__gristStub.fireRecord(record, 'CvDossiers'), RECORD_NORMAL);
  await page.waitForTimeout(700);
  read = await reading();
  if (read.text.includes('avant ce soir')) {
    // Le rendu ne suit pas la ligne tout seul : un aller-retour Édition / Lecture, comme le ferait une personne.
    await realClick(page, await hitTest(page, '#btn-mode-edit'));
    await page.waitForTimeout(400);
    await realClick(page, await hitTest(page, '#btn-mode-read'));
    await page.waitForTimeout(700);
    read = await reading();
  }
  await shot(page, `${theme}-${lang}-11-lecture-normal`);
  check(`${label} - Lecture, ligne « Normal » : la valeur disparaît avec son texte, la phrase autour reste (« Merci de régler le dossier . Merci »), « Monsieur » reste`,
    read.shown && !read.text.includes('avant ce soir') && read.text.includes('Merci de régler le dossier . Merci') && read.text.includes('Madame, Monsieur,') && read.frames === 0, read);
  await realClick(page, await hitTest(page, '#btn-mode-edit'));
  await page.waitForTimeout(500);
  await page.evaluate(record => window.__gristStub.fireRecord(record, 'CvDossiers'), RECORD_URGENT);
  info = await valueInfo(page);
  check(`${label} - retour en Édition : les valeurs sont de nouveau encadrées, aucune barre ouverte`, info.count === 2 && info.outlineStyle === 'dashed' && !(await hitTest(page, '.v2-varfmt-toolbar.visible')).found, info);

  // 9) « Défaire la valeur » : la fenêtre de la valeur à condition (quatre boutons, le cas le plus large) tient dans 700x400, le bouton est lisible ; un vrai clic défait la valeur : le texte
  // reste, le cadre et la condition partent ; Ctrl+Z rend la valeur et sa condition d'un coup, Ctrl+Maj+Z la défait de nouveau.
  await park(page);
  await realClick(page, await valuePoint(page, 6, '.tiptap .conditional-value.has-condition'));
  await page.waitForTimeout(250);
  await realClick(page, await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-condition"]'));
  await page.waitForTimeout(300);
  const f = await footerOf(page);
  await shot(page, `${theme}-${lang}-12-fenetre-valeur-avec-condition`);
  const rowOf = text => f.buttons.find(b => b.text === text).top;
  check(`${label} - fenêtre d'une valeur à condition : « ${T.remove} », « ${T.unwrap} », « ${T.cancel} », « ${T.save} » entiers dans la fenêtre, sans recouvrement ni débordement, Enregistrer à droite`,
    f.buttons.map(b => b.text).join('|') === [T.remove, T.unwrap, T.cancel, T.save].join('|') && inside(f) && noOverlap(f) && f.rowOverflow <= 0 && f.rows <= 2 && f.buttons.every(b => b.onTop)
      && rowOf(T.remove) === rowOf(T.unwrap) && rowOf(T.cancel) === rowOf(T.save) && Math.abs(f.buttons[3].right - (f.box.right - 20)) <= 1.5, f);
  const unwrapLook = await page.evaluate(text => {
    const b = Array.from(document.querySelectorAll('#var-condition-modal .var-modal-actions button')).find(x => x.textContent === text);
    const box = document.querySelector('#var-condition-modal .var-modal-content');
    const lum = css => { const [r, g, bl] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { const k = v / 255; return k <= 0.03928 ? k / 12.92 : Math.pow((k + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
    const [hi, lo] = [lum(getComputedStyle(b).color), lum(getComputedStyle(box).backgroundColor)].sort((x, y) => y - x);
    const r = b.getBoundingClientRect();
    return { contrast: (hi + 0.05) / (lo + 0.05), height: r.height, title: b.title, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, T.unwrap);
  check(`${label} - « ${T.unwrap} » : texte lisible (contraste au moins 4,5:1), hauteur d'un bouton de la fenêtre (30 px), info-bulle qui dit que le texte reste`,
    unwrapLook.contrast >= 4.5 && Math.abs(unwrapLook.height - 30) <= 1 && T.unwrapTitle.test(unwrapLook.title), unwrapLook);
  await realClick(page, unwrapLook);
  await page.waitForTimeout(300);
  await shot(page, `${theme}-${lang}-13-valeur-defaite`);
  info = await valueInfo(page);
  const unwrapped = await page.evaluate(() => {
    const sel = EditorCore.getEditor().state.selection;
    return { caretText: sel.$from.parent.textContent, barOpen: !!document.querySelector('.v2-varfmt-toolbar.visible'), focus: !!document.activeElement && !!document.activeElement.closest('.tiptap') };
  });
  check(`${label} - vrai clic sur « ${T.unwrap} » : la fenêtre se ferme, le texte reste dans la phrase sans cadre ni condition, l'autre valeur reste, le curseur est dans le texte libéré`,
    !(await hitTest(page, '#var-condition-modal .var-modal-content')).inViewport && info.count === 1 && !info.html.includes('Statut') && info.html.includes('Merci de régler le dossier avant ce soir. Merci')
      && /avant ce soir/.test(unwrapped.caretText) && unwrapped.focus && !unwrapped.barOpen, { info, unwrapped });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  info = await valueInfo(page);
  const undoneValues = await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap .conditional-value')).map(v => ({ text: v.textContent, cond: v.classList.contains('has-condition') })));
  check(`${label} - Ctrl+Z au clavier : la valeur revient avec sa condition, d'un seul coup`, undoneValues.length === 2 && undoneValues.some(v => v.text === 'avant ce soir' && v.cond), undoneValues);
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(250);
  info = await valueInfo(page);
  check(`${label} - Ctrl+Maj+Z au clavier : la valeur est de nouveau défaite`, info.count === 1 && !info.html.includes('Statut'), info);
  await context.close();
}

// Panneau étroit (360 px) : une valeur longue passe à la ligne dans sa phrase, sans faire déborder la page ni sortir sa barre du panneau.
async function runNarrow() {
  console.log(`\n=== Valeur conditionnelle, panneau étroit (360 px) ===`);
  const { context, page } = await openWidget('light');
  await page.setViewportSize({ width: 360, height: HEIGHT });
  const long = { mode: 'any', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }, { column: 'Titre', operator: 'contient', value: 'contentieux' }] };
  await page.evaluate(({ long }) => {
    const stub = window.__gristStub;
    stub.setVariables('CvDossiers', { Titre: 'Text', Statut: 'Text', Montant: 'Numeric' });
    const attr = JSON.stringify(long).replace(/"/g, '&quot;');
    Editor.setHTML('<p>Avant</p><p>Le règlement est attendu <span class="conditional-value" data-condition="' + attr + '">dans un délai de huit jours ouvrés à compter de la réception du présent courrier, sans quoi une majoration s’appliquera</span> merci.</p><p>Après</p>');
  }, { long });
  await page.waitForTimeout(400);
  await park(page);
  const wrapped = await page.evaluate(() => {
    const v = document.querySelector('.tiptap .conditional-value');
    const p = v.parentElement.getBoundingClientRect();
    const rects = Array.from(v.getClientRects());
    return { lines: rects.length, within: rects.every(r => r.left >= p.left - 1 && r.right <= p.right + 1), docOverflowX: document.documentElement.scrollWidth - innerWidth };
  });
  check('panneau de 360 px : une valeur longue passe à la ligne dans sa phrase (plusieurs lignes, toutes dans le paragraphe) et la page ne défile pas de côté', wrapped.lines >= 2 && wrapped.within && wrapped.docOverflowX <= 0, wrapped);
  await realClick(page, await page.evaluate(() => {
    const v = document.querySelector('.tiptap .conditional-value');
    const t = v.firstChild;
    const r = document.createRange();
    r.setStart(t, 20); r.setEnd(t, 21);
    const b = r.getBoundingClientRect();
    return { x: b.left, y: b.top + b.height / 2 };
  }));
  await page.waitForTimeout(300);
  const bar = await hitTest(page, '.v2-varfmt-toolbar.visible');
  check('panneau de 360 px : la barre des variables d\'une valeur de trois lignes s\'ouvre entière dans le panneau', bar.found && bar.inViewport, bar);
  await realClick(page, await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-condition"]'));
  await page.waitForTimeout(300);
  const narrowFooter = await footerOf(page);
  check('panneau de 360 px : la ligne de boutons de la fenêtre d\'une valeur à condition tient dans la fenêtre (retraits au-dessus, Annuler et Enregistrer dessous), sans recouvrement ni débordement',
    narrowFooter.buttons.map(b => b.text).join('|') === 'Retirer la condition|Défaire la valeur|Annuler|Enregistrer' && inside(narrowFooter) && noOverlap(narrowFooter) && narrowFooter.rowOverflow <= 0 && narrowFooter.buttons.every(b => b.onTop), narrowFooter);
  await context.close();
}

await runTheme('light', 'fr');
await runTheme('dark', 'fr');
await runTheme('light', 'en');
await runNarrow();
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
