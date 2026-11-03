#!/usr/bin/env node
// « Si aucune ligne → Afficher un texte » d'une boucle (demande d'Antoine du 2026-11-02 : « Oui identique partout [...] S'assurer que les variables on peut cliquer dessus et avoir les
// mêmes options que de base ») à la VRAIE souris et au VRAI clavier (page.mouse / page.keyboard, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en thème clair,
// sombre, puis en anglais, puis à 360 px. dev-tests/scenarios-sinon-loop.js vérifie la logique DANS la page (dispatchEvent) ; ici, ce que seuls une vraie souris et un vrai clavier
// prouvent : la fenêtre de la boucle ouverte par un clic sur la bulle puis sur son icône, la ligne « Texte affiché » amenée à la molette (champ à variables de l'aspect des autres champs
// de la fenêtre, contrastes), « # » qui ouvre la liste DEVANT la fenêtre, Échap qui ne ferme que la liste, un clic sur une variable qui la pose en bulle, un clic sur la bulle qui ouvre
// sa barre devant la fenêtre (Boucle grisée avec sa raison, sans seconde fenêtre), le texte tapé derrière la bulle, l'aperçu qui lit la variable, Enregistrer, la fenêtre rouverte, la
// Lecture d'une facture sans ligne (le texte écrit la valeur de sa variable) et d'une facture avec ses lignes (le texte n'apparaît pas).
// Lancé par run-headless.mjs (groupe Node "sinonLoopMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-sinon-loop-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.SINON_LOOP_MOUSE_PORT || 9182);
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
if (!OFFLINE) console.log('[verify-sinon-loop-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

// SINON_LOOP_SHOTS=<dossier> : enregistre des captures aux moments clés, à relire à l'œil (comme COND_VALUE_SHOTS pour la valeur).
const SHOTS = process.env.SINON_LOOP_SHOTS || '';
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

// La ligne `selector` de la fenêtre de la boucle, amenée entière dans la partie visible du corps de la fenêtre à la VRAIE molette (le corps défile, le titre et les boutons restent).
// Rend { fully, ... } à la fin, ou null si la ligne n'existe pas.
async function wheelIntoView(page, selector, scope) {
  let last = null;
  for (let i = 0; i < 14; i++) {
    last = await page.evaluate(({ sel, scope }) => {
      const el = document.querySelector(sel);
      const body = document.querySelector(scope + ' .pp-modal-body');
      if (!el || !body) return null;
      const r = el.getBoundingClientRect();
      const v = body.getBoundingClientRect();
      return { fully: r.top >= v.top - 0.5 && r.bottom <= v.bottom + 0.5, below: r.bottom > v.bottom, x: v.left + v.width / 2, y: v.top + v.height / 2, scrollTop: body.scrollTop, maxScroll: body.scrollHeight - body.clientHeight };
    }, { sel: selector, scope: scope || '#var-loop-modal' });
    if (!last || last.fully) return last;
    await page.mouse.move(last.x, last.y);
    await page.mouse.wheel(0, last.below ? 110 : -110);
    await page.waitForTimeout(120);
  }
  return last;
}

// === Le texte « Si aucune ligne » d'une boucle, à la vraie souris et au vrai clavier ===
const PAGE = 'MsFactures';
const LINES = 'MsLignes';
const RECORD_NONE = { id: 3, Numero: 'F-3', Client: 'Cabinet Morel' };
const RECORD_LINES = { id: 1, Numero: 'F-1', Client: 'Atelier Durand' };
const TYPED = 'Aucune ligne pour ';
const AFTER = ' (dossier)';

// Les mesures de la ligne « Texte affiché » de la fenêtre de la boucle : où sont l'étiquette et le champ (entiers dans la fenêtre ?), son état, ses textes, et si son aspect est
// celui des autres champs de la fenêtre (les séparateurs sont de vrais <input>).
const emptyRowOf = page => page.evaluate(() => {
  const content = document.querySelector('#var-loop-modal .var-modal-content').getBoundingClientRect();
  const body = document.querySelector('#var-loop-modal .pp-modal-body');
  const row = document.querySelector('#var-loop-modal .var-loop-empty-text');
  const input = document.getElementById('var-loop-empty-text');
  const label = document.querySelector('#var-loop-modal label[for="var-loop-empty-text"]');
  const sibling = document.getElementById('var-loop-sep');
  if (!row || !input || !label || !sibling) return { found: false };
  const r = input.getBoundingClientRect();
  const l = label.getBoundingClientRect();
  const v = body.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const lum = css => { const [a, b, c] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => { const k = n / 255; return k <= 0.03928 ? k / 12.92 : Math.pow((k + 0.055) / 1.055, 2.4); }); return 0.2126 * a + 0.7152 * b + 0.0722 * c; };
  const contrast = (fg, bg) => { const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const cs = getComputedStyle(input);
  const sib = getComputedStyle(sibling);
  const labelBg = getComputedStyle(document.querySelector('#var-loop-modal .var-modal-content')).backgroundColor;
  return {
    found: true, hidden: row.hidden, tag: input.tagName, value: input.value, placeholder: input.placeholder, title: input.title, label: label.textContent, focused: input.contains(document.activeElement),
    input: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 },
    insideWindow: l.left >= content.left && r.right <= content.right && r.top >= content.top && r.bottom <= content.bottom,
    inBody: l.left >= v.left - 0.5 && r.right <= v.right + 0.5 && l.top >= v.top - 0.5 && r.top >= v.top - 0.5 && r.bottom <= v.bottom + 0.5 && l.bottom <= v.bottom + 0.5,
    onTop: !!top && input.contains(top),
    bodyOverflowX: body.scrollWidth - body.clientWidth,
    textContrast: contrast(cs.color, cs.backgroundColor), labelContrast: contrast(getComputedStyle(label).color, labelBg),
    placeholderContrast: contrast(getComputedStyle(input, input.classList.contains('is-empty') ? '::before' : null).color, cs.backgroundColor),
    sameLook: cs.borderTopColor === sib.borderTopColor && cs.borderTopWidth === sib.borderTopWidth && cs.borderTopLeftRadius === sib.borderTopLeftRadius
      && cs.backgroundColor === sib.backgroundColor && cs.fontSize === sib.fontSize && cs.fontFamily === sib.fontFamily && Math.abs(r.height - sibling.getBoundingClientRect().height) <= 1.5,
    look: { field: [cs.borderTopColor, cs.borderTopWidth, cs.borderTopLeftRadius, cs.backgroundColor, cs.fontSize, r.height], sibling: [sib.borderTopColor, sib.borderTopWidth, sib.borderTopLeftRadius, sib.backgroundColor, sib.fontSize, sibling.getBoundingClientRect().height] },
  };
});
// Les lignes de l'aperçu de la fenêtre de la boucle qui se lisent (celles qui ne sont pas masquées).
const previewLinesOf = page => page.evaluate(() => Array.from(document.querySelectorAll('#var-loop-modal .var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent));
const windowShown = page => page.evaluate(() => { const m = document.getElementById('var-loop-modal'); return !!m && getComputedStyle(m).display !== 'none' && m.getClientRects().length > 0; });
// La liste « # » : affichée ? devant la fenêtre ? entière dans le panneau ? et où se trouve la ligne qui porte `name`.
const listOf = (page, name) => page.evaluate(wanted => {
  const box = document.getElementById('autocomplete-box');
  if (!box || box.style.display === 'none' || !box.getClientRects().length) return { shown: false };
  const r = box.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 24));
  const items = Array.from(box.querySelectorAll('.ac-item'));
  const found = items.find(i => i.textContent.includes(wanted));
  const t = found && found.getBoundingClientRect();
  return { shown: true, onTop: !!top && box.contains(top), inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, items: items.map(i => i.textContent).slice(0, 6), item: t ? { x: t.left + t.width / 2, y: t.top + t.height / 2 } : null };
}, name);

async function seedPage(page) {
  await page.evaluate(async ({ record, page, lines }) => {
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setVariables(page, { Numero: 'Text', Client: 'Text' });
    stub.setVariables(lines, { Facture: 'Ref:' + page, Designation: 'Text', Qte: 'Numeric' });
    stub.setRows(page, [{ id: 1, Numero: 'F-1', Client: 'Atelier Durand' }, { id: 3, Numero: 'F-3', Client: 'Cabinet Morel' }]);
    stub.setRows(lines, [{ id: 1, Facture: 1, Designation: 'Audit', Qte: 1 }, { id: 2, Facture: 1, Designation: 'Livret', Qte: 12 }]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule(lines);
    await GristAPI.saveLinkRule(lines, { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(record, page);
    const loop = JSON.stringify({ repeat: 'inline', table: lines, empty: 'hide', separator: ', ' }).replace(/"/g, '&quot;');
    Editor.setHTML('<p>Madame, Monsieur,</p><p>Lignes : <span class="var-badge" data-table="' + lines + '" data-column="Designation" data-key="' + lines + '.Designation" data-loop="' + loop + '" data-loop-repeat="inline"></span>.</p><p>Fin du courrier</p>');
  }, { record: RECORD_NONE, page: PAGE, lines: LINES });
  await page.waitForTimeout(400);
}
// Un vrai clic sur la bulle du document, puis sur l'icône Boucle de sa barre : la fenêtre s'ouvre.
async function openLoopWindow(page) {
  await park(page);
  await realClick(page, await hitTest(page, '.tiptap .var-badge'));
  await page.waitForTimeout(300);
  await realClick(page, await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-loop"]'));
  await page.waitForTimeout(400);
}

async function run(theme, lang) {
  const label = (theme === 'dark' ? 'sombre' : 'clair') + (lang === 'en' ? ', anglais' : '');
  console.log(`\n=== « Si aucune ligne » d'une boucle à la vraie souris et au vrai clavier, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);
  const T = lang === 'en'
    ? { label: 'Text shown', placeholder: 'E.g. No rows (#Variable allowed)', title: /Type # to add a variable\.$/, save: 'Save', line: /No rows for F-3/, reason: /No loop|loop cannot|loop window/i }
    : { label: 'Texte affiché', placeholder: 'Ex. Aucune ligne (#Variable autorisée)', title: /Tapez # pour y mettre une variable\.$/, save: 'Enregistrer', line: /Aucune ligne pour F-3/, reason: /boucle/ };
  const typed = lang === 'en' ? 'No rows for ' : TYPED;
  if (lang === 'en') await page.evaluate(() => I18n.setLang('en'));
  await seedPage(page);

  // 1) La fenêtre de la boucle, « Si aucune ligne » sur « Afficher un texte » (le choix se fait comme une personne le ferait dans la liste native) : la ligne du texte est atteinte à la molette.
  await openLoopWindow(page);
  const opened = await hitTest(page, '#var-loop-modal .var-modal-content');
  check(`${label} - un clic sur la bulle puis sur l'icône Boucle ouvre la fenêtre de la boucle, entière dans le panneau`, (await windowShown(page)) && opened.found && opened.inViewport && opened.onTop, opened);
  await page.selectOption('#var-loop-modal #var-loop-empty', 'text');
  await page.waitForTimeout(200);
  const reached = await wheelIntoView(page, '#var-loop-modal .var-loop-empty-text');
  await page.waitForTimeout(100);
  let row = await emptyRowOf(page);
  await shot(page, `${theme}-${lang}-b1-boucle-champ`);
  check(`${label} - « ${T.label} » apparaît, amenée à la molette, étiquette et champ entiers dans la fenêtre et au premier plan, sans défilement de côté`,
    reached && reached.fully && row.found && !row.hidden && row.label === T.label && row.insideWindow && row.inBody && row.onTop && row.bodyOverflowX <= 0, { reached, row });
  check(`${label} - le texte est un champ à variables (pas un <input>), vide, avec son texte d'attente qui cite « #Variable » et son info-bulle qui dit de taper « # »`,
    row.tag === 'DIV' && row.value === '' && row.placeholder === T.placeholder && T.title.test(row.title), row);
  check(`${label} - aux pixels, le champ a l'aspect des autres champs de la fenêtre (bordure, rayon, fond, police, hauteur des séparateurs)`, row.sameLook, row.look);
  check(`${label} - texte d'attente, texte et étiquette lisibles (contraste au moins 4,5:1)`, row.placeholderContrast >= 4.5 && row.textContrast >= 4.5 && row.labelContrast >= 4.5,
    { placeholder: row.placeholderContrast, text: row.textContrast, label: row.labelContrast });

  // 2) Un vrai clic dans le champ, le texte puis « # » au vrai clavier : la liste des variables s'ouvre devant la fenêtre ; un clic sur « Numero » la pose en bulle.
  await realClick(page, row.input);
  await page.keyboard.type(typed + '#');
  await page.waitForTimeout(400);
  let list = await listOf(page, 'Numero');
  await shot(page, `${theme}-${lang}-b2-boucle-liste`);
  check(`${label} - « # » dans le champ ouvre la liste des variables DEVANT la fenêtre, entière dans le panneau, avec « Numero »`, list.shown && list.onTop && list.inViewport && !!list.item, list);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const escaped = await page.evaluate(() => {
    const box = document.getElementById('autocomplete-box');
    const input = document.getElementById('var-loop-empty-text');
    const m = document.getElementById('var-loop-modal');
    return { listOpen: !!box && box.style.display !== 'none' && box.getClientRects().length > 0, windowOpen: getComputedStyle(m).display !== 'none', value: input.value, focused: input.contains(document.activeElement) };
  });
  check(`${label} - Échap avec la liste « # » ouverte ne ferme que la liste : la fenêtre reste ouverte avec son texte, le curseur dans le champ`, !escaped.listOpen && escaped.windowOpen && escaped.value === typed + '#' && escaped.focused, escaped);
  await page.keyboard.press('Backspace');
  await page.keyboard.type('#');
  await page.waitForTimeout(400);
  list = await listOf(page, 'Numero');
  await realClick(page, list.item);
  await page.waitForTimeout(400);
  const placed = await page.evaluate(() => {
    const input = document.getElementById('var-loop-empty-text');
    const box = document.getElementById('autocomplete-box');
    return { value: input.value, bubbles: Array.from(input.querySelectorAll('.var-badge')).map(b => b.dataset.key), listOpen: !!box && box.style.display !== 'none' && box.getClientRects().length > 0, focused: input.contains(document.activeElement) };
  });
  check(`${label} - un clic sur « Numero » pose la variable en bulle dans le champ : le texte avant reste, la liste se ferme, le curseur est dans le champ`,
    placed.value === typed + '#' + PAGE + '.Numero' && JSON.stringify(placed.bubbles) === JSON.stringify([PAGE + '.Numero']) && !placed.listOpen && placed.focused, placed);

  // 3) Un clic sur la bulle du champ : sa barre s'ouvre DEVANT la fenêtre ; Boucle y est grisée (une seule fenêtre de boucle) et la souris dessus ne rouvre rien.
  await realClick(page, await hitTest(page, '#var-loop-empty-text .var-badge'));
  await page.waitForTimeout(400);
  const bar = await hitTest(page, '.v2-varfmt-toolbar.visible');
  const loopButton = await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-loop"]');
  const conditionButton = await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-condition"]');
  const greyed = await page.evaluate(() => {
    const b = document.querySelector('.v2-varfmt-toolbar.visible button[data-action="var-loop"]');
    return b ? { cls: b.classList.contains('is-disabled'), aria: b.getAttribute('aria-disabled'), title: b.title } : null;
  });
  await shot(page, `${theme}-${lang}-b3-boucle-barre`);
  check(`${label} - la barre de la bulle du champ s'ouvre DEVANT la fenêtre, entière dans le panneau, ses boutons « Condition » et « Boucle » au premier plan`,
    bar.found && bar.inViewport && bar.onTop && conditionButton.found && conditionButton.onTop && loopButton.found && loopButton.onTop, { bar, conditionButton, loopButton });
  check(`${label} - le bouton Boucle de cette barre est grisé et son info-bulle dit pourquoi (la fenêtre de la boucle est déjà ouverte)`, !!greyed && greyed.cls && greyed.aria === 'true' && T.reason.test(greyed.title), greyed);
  await realClick(page, loopButton);
  await page.waitForTimeout(350);
  const stillOne = await page.evaluate(() => ({ windows: document.querySelectorAll('#var-loop-modal').length, value: document.getElementById('var-loop-empty-text').value }));
  check(`${label} - un clic sur le bouton Boucle grisé n'ouvre pas une seconde fenêtre et ne touche pas au texte`, stillOne.windows === 1 && stillOne.value === typed + '#' + PAGE + '.Numero', stillOne);

  // 4) Du texte derrière la bulle : un clic dans le champ (à droite de la bulle), la frappe se pose après elle ; l'aperçu de la ligne sélectionnée (n° 3, sans ligne liée) dit le texte lu.
  row = await emptyRowOf(page);
  await realClick(page, { x: row.input.right - 8, y: row.input.y });
  await page.keyboard.press('End');
  await page.keyboard.type(AFTER);
  await page.waitForTimeout(900);
  const lines = await previewLinesOf(page);
  row = await emptyRowOf(page);
  await shot(page, `${theme}-${lang}-b4-boucle-apercu`);
  check(`${label} - le texte tapé derrière la bulle reste dans le champ, la bulle d'abord`, row.value === typed + '#' + PAGE + '.Numero' + AFTER, row);
  check(`${label} - l'aperçu de la ligne sélectionnée cite le texte tel que la Lecture l'écrira, sa variable lue (« ${typed}F-3${AFTER} »)`, lines.length >= 1 && lines.some(l => l.includes(typed + 'F-3' + AFTER)) && !lines.some(l => l.includes('#' + PAGE)), lines);

  // 5) Enregistrer : la fenêtre se ferme, la boucle porte son texte (brut, avec sa clé), rouverte elle montre la bulle.
  const save = await hitTest(page, '#var-loop-modal .var-modal-primary');
  check(`${label} - « ${T.save} » est visible et non recouvert à 700x400`, save.found && save.inViewport && save.onTop, save);
  await realClick(page, save);
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => {
    const el = new DOMParser().parseFromString(EditorCore.getEditor().getHTML(), 'text/html').querySelector('.var-badge[data-loop]');
    return { shown: getComputedStyle(document.getElementById('var-loop-modal')).display !== 'none', loop: el ? JSON.parse(el.getAttribute('data-loop')) : null };
  });
  check(`${label} - Enregistrer : la fenêtre se ferme et la boucle garde son texte brut avec sa clé « #${PAGE}.Numero » et « Afficher un texte »`,
    !saved.shown && !!saved.loop && saved.loop.empty === 'text' && saved.loop.emptyText === typed + '#' + PAGE + '.Numero' + AFTER, saved);
  await openLoopWindow(page);
  await wheelIntoView(page, '#var-loop-modal .var-loop-empty-text');
  row = await emptyRowOf(page);
  const reopened = await page.evaluate(() => ({ bubbles: Array.from(document.querySelectorAll('#var-loop-empty-text .var-badge')).map(b => b.dataset.key), mode: document.getElementById('var-loop-empty').value }));
  check(`${label} - fenêtre rouverte : le texte et sa bulle sont dans le champ, « Afficher un texte » est choisi`, row.value === typed + '#' + PAGE + '.Numero' + AFTER && reopened.mode === 'text' && JSON.stringify(reopened.bubbles) === JSON.stringify([PAGE + '.Numero']), { row, reopened });
  await realClick(page, await hitTest(page, '#var-loop-modal .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)'));
  await page.waitForTimeout(350);

  // 6) Lecture : la facture n° 3 n'a aucune ligne, le texte s'écrit avec la valeur de sa variable ; la facture n° 1 a ses lignes, le texte n'apparaît pas.
  await realClick(page, await hitTest(page, '#btn-mode-read'));
  await page.waitForTimeout(700);
  await page.evaluate(({ record, page }) => window.__gristStub.fireRecord(record, page), { record: RECORD_NONE, page: PAGE });
  await page.waitForTimeout(800);
  const readText = () => page.evaluate(() => { const c = document.querySelector('#reader-container .reader-content'); return { shown: !!c && document.getElementById('reader-container').style.display === 'block', text: c ? Array.from(c.children).filter(e => e.tagName !== 'STYLE').map(e => e.textContent).join('') : '' }; });
  const readNone = await readText();
  await shot(page, `${theme}-${lang}-b5-lecture-sans-ligne`);
  check(`${label} - Lecture, facture n° 3 (aucune ligne) : « Lignes : ${typed}F-3${AFTER}. », sans trace du champ ni de la clé`, readNone.shown && readNone.text.includes(`Lignes : ${typed}F-3${AFTER}.`) && !readNone.text.includes('#'), readNone);
  await page.evaluate(({ record, page }) => window.__gristStub.fireRecord(record, page), { record: RECORD_LINES, page: PAGE });
  await page.waitForTimeout(800);
  const readLines = (await readText()).text;
  check(`${label} - Lecture, facture n° 1 (deux lignes) : « Lignes : Audit, Livret. », le texte « Si aucune ligne » n'apparaît pas`, readLines.includes('Lignes : Audit, Livret.') && !readLines.includes(typed), readLines);
  await context.close();
}

// Panneau étroit (360 px) : la ligne du texte tient dans la fenêtre, sans faire défiler le corps de côté, et la liste « # » reste dans le panneau.
async function runNarrow() {
  console.log(`\n=== « Si aucune ligne » d'une boucle, panneau étroit (360 px) ===`);
  const { context, page } = await openWidget('light');
  await seedPage(page);
  await page.setViewportSize({ width: 360, height: HEIGHT });
  await page.waitForTimeout(300);
  await openLoopWindow(page);
  await page.selectOption('#var-loop-modal #var-loop-empty', 'text');
  await page.waitForTimeout(200);
  const reached = await wheelIntoView(page, '#var-loop-modal .var-loop-empty-text');
  const row = await emptyRowOf(page);
  check('panneau de 360 px : la ligne « Texte affiché » tient dans la fenêtre (étiquette et champ entiers, au premier plan, sans défilement de côté)',
    reached && reached.fully && row.found && row.insideWindow && row.inBody && row.onTop && row.bodyOverflowX <= 0 && row.input.width >= 120, { reached, row });
  await realClick(page, row.input);
  await page.keyboard.type('voir #');
  await page.waitForTimeout(400);
  const list = await listOf(page, 'Numero');
  check('panneau de 360 px : la liste « # » du champ s\'ouvre devant la fenêtre, entière dans le panneau', list.shown && list.onTop && list.inViewport, list);
  await context.close();
}

await run('light', 'fr');
await run('dark', 'fr');
await run('light', 'en');
await runNarrow();
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
