#!/usr/bin/env node
// Assemblage avant impression (js/sheet-assembly-dialog.js, js/sheet-layout.js, css/sheet-assembly.css, ligne « Assemblage avant impression… » du menu Exporter en PDF) : le panneau de 700x400
// d'Antoine, à la VRAIE souris (page.mouse) et au VRAI clavier (Tab, flèches, Entrée, Échap), en clair, en sombre et en anglais. Ce que scenarios-sheet-assembly.js ne peut pas voir depuis la page :
//  - le survol du bouton « Exporter en PDF » ouvre son menu ; la ligne est la troisième, dans le panneau et au premier plan, son texte se lit (4,5:1) ;
//  - un clic sur la ligne ouvre la fenêtre ; elle tient dans 700x400 SANS défiler dans ses états les plus hauts (A3 paysage, traits de coupe, note d'échelle), titre et boutons au premier plan ;
//  - un vrai clic sur A3, Paysage, Avec... change l'aperçu (autant d'emplacements numérotés et de repères que le fichier en portera, papier blanc dans les deux thèmes) ; les flèches du clavier
//    changent la feuille et les nombres ; Tab tourne dans la fenêtre sans en sortir ;
//  - un choix qui ne tient pas est grisé (texte à 4,5:1, info-bulle), un clic dessus ne change rien ;
//  - « Générer » à la souris télécharge « <table>-assemblage.pdf », relu par pdf.js (feuilles A4, nombre de feuilles) ; Annuler et Échap ne lancent rien ; Entrée valide ;
//  - l'interface en anglais.
// Lancé par run-headless.mjs (groupe Node "sheetAssemblyMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-sheet-assembly-mouse.mjs
// SHEET_ASSEMBLY_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.SHEET_ASSEMBLY_MOUSE_PORT || 8945);
const SHOTS = process.env.SHEET_ASSEMBLY_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-watermark-mouse.mjs.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/html2pdf\.bundle\.min\.js$/, 'umd/html2pdf.bundle.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-sheet-assembly-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, acceptDownloads: true });
const page = await context.newPage();
const pageErrors = [];
const consoleProblems = [];
page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
// Un avertissement de ProseMirror ou de TipTap (sélection invalide, contenu refusé) trahit un geste qui n'a pas la forme attendue : aucun ne doit sortir pendant le parcours.
page.on('console', m => { if ((m.type() === 'warning' || m.type() === 'error') && /TextSelection|Invalid content|RangeError|sheet/i.test(m.text())) consoleProblems.push(m.text()); });
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
const nativeDialogs = [];
page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });

const TABLE = 'SaClients';
const NAMES = ['Alpha Durand', 'Bravo Martin', 'Charlie Petit', 'Delta Moreau', 'Echo Laurent', 'Foxtrot Blanc'];
const EXPORT_BTN = '#btn-export-pdf';
const FLYOUT = '#v2-export-pdf-flyout';
const ROW = '#v2-btn-export-pdf-sheets';
const WIN = '#pp-sheets-modal';
const BOX = `${WIN} .modal-content`;
const OK = `${WIN} .var-modal-primary`;
const CANCEL = `${WIN} .var-modal-actions button:not(.var-modal-primary)`;
const radio = (name, value) => `${WIN} input[name="${name}"][value="${value}"]`;
const optionLabel = (name, value) => `${WIN} label.pp-sheets-option:has(input[name="${name}"][value="${value}"])`;

async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const centerOf = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
}, selector);
// L'élément, tel que la souris le voit : visible dans le panneau et au premier plan (rien d'autre n'est dessus à son centre).
const hit = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { found: true, w: Math.round(r.width), h: Math.round(r.height), inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === el || el.contains(top)), l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) };
}, selector);
const seen = box => box.found && box.inPanel && box.onTop;
const winOpen = () => page.evaluate(() => { const m = document.getElementById('pp-sheets-modal'); return !!m && m.style.display !== 'none'; });
// Aucun défilement dans la fenêtre, et aucun texte qui déborde de sa colonne.
const fits = () => page.evaluate(() => {
  const b = document.querySelector('#pp-sheets-modal .pp-modal-body');
  const box = document.querySelector('#pp-sheets-modal .modal-content').getBoundingClientRect();
  const overflowing = Array.from(document.querySelectorAll('#pp-sheets-modal .pp-sheets-note, #pp-sheets-modal .pp-sheets-summary, #pp-sheets-modal .pp-sheets-option, #pp-sheets-modal .pp-sheets-slots')).filter(e => !e.hidden && e.scrollWidth > e.clientWidth + 1).map(e => e.className);
  return { scrollH: b.scrollHeight, clientH: b.clientHeight, ok: b.scrollHeight <= b.clientHeight + 1 && box.top >= 0 && box.bottom <= innerHeight && overflowing.length === 0, top: Math.round(box.top), bottom: Math.round(box.bottom), overflowing };
});
const focusIn = () => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return 'body';
  if (a.closest('.tiptap')) return 'editor';
  if (a.closest('#pp-sheets-modal')) return a.type === 'radio' ? a.name.replace('pp-sheets-', '') + '=' + a.value : (a.id || a.textContent || a.tagName);
  return a.id || a.tagName;
});
// Ce que la fenêtre montre : réglages, résumé, notes visibles, dessin de la feuille d'aperçu.
const dialogState = () => page.evaluate(() => {
  const q = s => document.querySelector('#pp-sheets-modal ' + s);
  const checked = name => { const r = document.querySelector(`#pp-sheets-modal input[name="${name}"]:checked`); return r ? r.value : null; };
  return {
    sheet: checked('pp-sheets-sheet'), orientation: checked('pp-sheets-orientation'), marks: checked('pp-sheets-marks'),
    cols: Number(q('#pp-sheets-cols').value), rows: Number(q('#pp-sheets-rows').value),
    summary: q('.pp-sheets-summary').textContent,
    scaled: document.getElementById('pp-sheets-scaled').hidden ? '' : document.getElementById('pp-sheets-scaled').textContent,
    hint: document.getElementById('pp-sheets-hint').textContent,
    slots: document.querySelectorAll('#pp-sheets-modal .pp-sheets-slot').length, marksDrawn: document.querySelectorAll('#pp-sheets-modal .pp-sheets-mark').length,
    numbers: Array.from(document.querySelectorAll('#pp-sheets-modal .pp-sheets-slot-number')).map(t => t.textContent).join(),
    labels: Array.from(document.querySelectorAll('#pp-sheets-modal .pp-sheets-label')).map(l => l.textContent).join(),
    options: Array.from(document.querySelectorAll('#pp-sheets-modal .pp-sheets-option span')).map(l => l.textContent).join(),
    buttons: Array.from(document.querySelectorAll('#pp-sheets-modal .var-modal-actions button')).map(b => b.textContent).join(),
    title: q('h3').textContent,
  };
});
const statusText = () => page.evaluate(() => document.getElementById('status-msg').textContent);
async function clickCenter(selector) {
  const c = await centerOf(selector);
  await page.mouse.move(c.x - 10, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(150);
}
// Survol réel du bouton « Exporter en PDF » : la souris arrive de côté, le volet s'ouvre.
async function openExportMenu() {
  const c = await centerOf(EXPORT_BTN);
  await page.mouse.move(c.x - 30, c.y + 5, { steps: 3 });
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.waitForTimeout(450);
  return c;
}
async function closeMenu() {
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(250);
}
// Clic réel sur « Assemblage avant impression… », puis attente de la fenêtre (les lignes de la table sont lues d'abord).
async function clickSheetsRow() {
  await openExportMenu();
  await clickCenter(ROW);
  await page.waitForFunction(() => { const m = document.getElementById('pp-sheets-modal'); return !!m && m.style.display !== 'none'; }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(200);
}
async function closeWindowWithEscape() {
  if (await winOpen()) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
}
// Contraste (WCAG) du texte d'un élément contre le premier fond opaque qu'il traverse en remontant.
const contrastOf = selector => page.evaluate((sel) => {
  const nums = c => (c.match(/-?[\d.]+/g) || []).map(Number);
  const rgba = c => { const n = nums(c); return c.indexOf('color(') === 0 ? { r: n[0] * 255, g: n[1] * 255, b: n[2] * 255, a: n.length > 3 ? n[3] : 1 } : { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const el = document.querySelector(sel);
  if (!el) return null;
  const fg = rgba(getComputedStyle(el).color);
  let node = el; let bg = { r: 255, g: 255, b: 255, a: 1 };
  while (node) { const c = rgba(getComputedStyle(node).backgroundColor); if (c.a > .99) { bg = c; break; } node = node.parentElement; }
  const a = lum(fg), b = lum(bg);
  return Math.round((Math.max(a, b) + .05) / (Math.min(a, b) + .05) * 100) / 100;
}, selector);

// Le document de départ : une table de six lignes, la page au format voulu (le menu Page est testé ailleurs).
async function seed(format) {
  await page.evaluate(async ({ format, names, table }) => {
    const stub = window.__gristStub;
    stub.setVariables(table, { Nom: 'Text' });
    stub.setRows(table, names.map((Nom, i) => ({ id: i + 1, Nom })));
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: names[0] }, table);
    Editor.setHTML(`<p>Bonjour <span class="var-badge" data-table="${table}" data-column="Nom" data-key="${table}.Nom"></span></p>`);
    PageLayout.setOrientation('portrait');
    PageLayout.setFormat(format);
  }, { format, names: NAMES, table: TABLE });
  await page.waitForTimeout(500);
}

// Un vrai clic sur « Générer » (ou Entrée) : le fichier téléchargé est relu par pdf.js dans la page.
async function readDownload(download) {
  const path = await download.path();
  const bytes = readFileSync(path);
  const info = await page.evaluate(async (b64) => {
    if (!window.pdfjsLib) {
      await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const raw = atob(b64);
    const data = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
    const doc = await window.pdfjsLib.getDocument({ data }).promise;
    const sizes = [];
    const texts = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n);
      const v = p.getViewport({ scale: 1 });
      sizes.push([Math.round(v.width * 100) / 100, Math.round(v.height * 100) / 100]);
      const content = await p.getTextContent();
      texts.push(content.items.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim());
    }
    return { pages: doc.numPages, sizes, texts };
  }, bytes.toString('base64'));
  return { header: bytes.subarray(0, 5).toString('latin1'), name: download.suggestedFilename(), ...info };
}

const FIXED = { paper: 'rgb(255, 255, 255)', slot: 'rgb(232, 238, 247)', mark: 'rgb(17, 24, 39)' };

async function run(theme, full) {
  const T = theme;
  await seed('A6');

  // 1) Le menu : un survol réel du bouton l'ouvre ; la ligne est la troisième, atteignable à la souris, son texte se lit.
  await openExportMenu();
  const flyout = await hit(FLYOUT), row = await hit(ROW);
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#v2-export-pdf-flyout .v2-hover-row')).map(r => ({ id: r.id, text: r.textContent.trim() })));
  check(`${T}, menu : au survol, le volet « Exporter en PDF » s'ouvre dans le panneau`, flyout.found && flyout.inPanel, flyout);
  check(`${T}, menu : « Assemblage avant impression… » est la troisième ligne, après « un seul PDF », au premier plan et dans le panneau`, rows.length === 3 && rows[2].id === 'v2-btn-export-pdf-sheets' && rows[2].text === 'Assemblage avant impression…' && seen(row), { rows, row });
  const cRow = await contrastOf(ROW);
  check(`${T}, menu : le texte de la ligne se lit (contraste ${cRow}:1, au moins 4,5:1)`, cRow >= 4.5, cRow);
  await snap(`${T}-1-menu`);
  await closeMenu();

  // 2) Le clic ouvre la fenêtre : elle tient dans le panneau sans défiler, le clavier est sur la feuille cochée.
  await clickSheetsRow();
  const opened = await winOpen();
  const box = await hit(BOX), title = await hit(`${WIN} h3`), ok = await hit(OK), cancel = await hit(CANCEL);
  const parts = [];
  for (const sel of [radio('pp-sheets-sheet', 'A4'), radio('pp-sheets-sheet', 'A3'), radio('pp-sheets-orientation', 'portrait'), radio('pp-sheets-orientation', 'landscape'), radio('pp-sheets-marks', 'off'), radio('pp-sheets-marks', 'on'), '#pp-sheets-cols', '#pp-sheets-rows', `${WIN} .pp-sheets-svg`, `${WIN} .pp-sheets-summary`]) parts.push(await hit(sel));
  const scroll = await fits();
  check(`${T}, fenêtre : un clic sur la ligne l'ouvre`, opened, { opened });
  check(`${T}, fenêtre : elle tient dans ${WIDTH}x${HEIGHT} - titre, feuille, sens, traits de coupe, deux listes, aperçu, résumé, « Annuler » et « Générer » au premier plan, sans défiler (${scroll.scrollH}/${scroll.clientH})`, box.inPanel && seen(title) && seen(ok) && seen(cancel) && parts.every(seen) && scroll.ok, { box, title, ok, cancel, bad: parts.filter(p => !seen(p)), scroll });
  check(`${T}, fenêtre : le focus est sur la feuille cochée (A4)`, (await focusIn()) === 'sheet=A4', await focusIn());
  const s0 = await dialogState();
  check(`${T}, fenêtre : au départ A4, portrait, sans traits de coupe, 2 x 2, quatre emplacements numérotés 1 à 4, résumé « 4 emplacements par feuille (2 × 2) : 6 lignes sur 2 feuilles A4. »`, s0.sheet === 'A4' && s0.orientation === 'portrait' && s0.marks === 'off' && s0.cols === 2 && s0.rows === 2 && s0.slots === 4 && s0.marksDrawn === 0 && s0.numbers === '1,2,3,4' && s0.summary === '4 emplacements par feuille (2 × 2) : 6 lignes sur 2 feuilles A4.', s0);
  check(`${T}, fenêtre : titre, libellés, choix et boutons en français`, s0.title === 'Assemblage avant impression' && s0.labels === 'Feuille,Orientation,Traits de coupe,Emplacements' && s0.options === 'A4,A3,Portrait,Paysage,Sans,Avec' && s0.buttons === 'Annuler,Générer', s0);
  const cs = [];
  for (const sel of [`${WIN} .pp-sheets-summary`, `${WIN} #pp-sheets-hint`, `${WIN} #pp-sheets-scaled`, `${WIN} .pp-sheets-label`, `${WIN} .pp-sheets-option`, `${WIN} .pp-sheets-select`, `${WIN} .pp-sheets-slot-field span`, `${WIN} .pp-modal-header h3`]) cs.push([sel.replace(WIN + ' ', ''), await contrastOf(sel)]);
  check(`${T}, fenêtre : le résumé, les deux notes, les libellés, les choix, les listes et le titre font au moins 4,5:1 (${cs.map(c => c[1]).join(', ')})`, cs.every(c => c[1] >= 4.5), cs);
  // Chaque indication commence sous son champ, pas sous son libellé (règle d'Antoine) : l'échelle sous les traits de coupe, la règle de l'ordre sous les emplacements ; le résumé ferme la fenêtre.
  await clickCenter(radio('pp-sheets-marks', 'on'));
  const align = await page.evaluate(() => {
    const r = sel => document.querySelector('#pp-sheets-modal ' + sel).getBoundingClientRect();
    const labelLeft = r('.pp-sheets-label').left;
    return {
      labelLeft, marksLeft: r('.pp-sheets-options:has(input[name="pp-sheets-marks"])').left, marksBottom: r('.pp-sheets-options:has(input[name="pp-sheets-marks"])').bottom,
      scaledLeft: r('#pp-sheets-scaled').left, scaledTop: r('#pp-sheets-scaled').top, slotsLeft: r('.pp-sheets-slots').left, slotsBottom: r('.pp-sheets-slots').bottom,
      hintLeft: r('#pp-sheets-hint').left, hintTop: r('#pp-sheets-hint').top, summaryLeft: r('.pp-sheets-summary').left, summaryTop: r('.pp-sheets-summary').top, hintBottom: r('#pp-sheets-hint').bottom,
    };
  });
  check(`${T}, fenêtre : l'échelle commence sous le champ des traits de coupe et la règle de l'ordre sous celui des emplacements (au bord gauche des réglages, pas sous leur libellé), le résumé ferme la fenêtre`,
    Math.abs(align.scaledLeft - align.marksLeft) <= 0.5 && align.scaledLeft > align.labelLeft + 50 && align.scaledTop >= align.marksBottom - 1 && align.scaledTop - align.marksBottom < 14
    && Math.abs(align.hintLeft - align.slotsLeft) <= 0.5 && align.hintTop >= align.slotsBottom - 1 && align.hintTop - align.slotsBottom < 14
    && Math.abs(align.summaryLeft - align.labelLeft) <= 0.5 && align.summaryTop >= align.hintBottom, align);
  // La feuille d'aperçu : le papier reste blanc, les cases claires, les repères sombres dans les deux thèmes.
  const paint = await page.evaluate(() => {
    const fill = s => getComputedStyle(document.querySelector('#pp-sheets-modal ' + s)).fill;
    const stroke = s => getComputedStyle(document.querySelector('#pp-sheets-modal ' + s)).stroke;
    return { paper: fill('.pp-sheets-paper'), slot: fill('.pp-sheets-slot'), mark: stroke('.pp-sheets-mark') };
  });
  check(`${T}, aperçu : papier blanc, cases claires, repères sombres, quel que soit le thème`, paint.paper === FIXED.paper && paint.slot === FIXED.slot && paint.mark === FIXED.mark, paint);
  await snap(`${T}-2-fenetre-traits`);
  await clickCenter(radio('pp-sheets-marks', 'off'));

  // 3) De vrais clics : A3, Paysage, Portrait, Avec - l'aperçu et la fenêtre suivent, sans jamais défiler.
  await clickCenter(optionLabel('pp-sheets-sheet', 'A3'));
  const a3 = await dialogState(), a3Fit = await fits();
  check(`${T}, clic sur A3 : paysage, 4 x 2, huit emplacements numérotés, résumé « 8 emplacements par feuille (4 × 2) : 6 lignes sur 1 feuille A3. », sans défiler`, a3.sheet === 'A3' && a3.orientation === 'landscape' && a3.cols === 4 && a3.rows === 2 && a3.slots === 8 && a3.numbers === '1,2,3,4,5,6,7,8' && a3.summary === '8 emplacements par feuille (4 × 2) : 6 lignes sur 1 feuille A3.' && a3Fit.ok, { a3, a3Fit });
  await clickCenter(optionLabel('pp-sheets-marks', 'on'));
  const a3m = await dialogState(), a3mFit = await fits();
  check(`${T}, clic sur Avec : seize repères dessinés, la note « Pages réduites à 96 % pour laisser la place aux traits de coupe. » apparaît, la fenêtre tient toujours (${a3mFit.scrollH}/${a3mFit.clientH})`, a3m.marks === 'on' && a3m.marksDrawn === 16 && a3m.scaled === 'Pages réduites à 96 % pour laisser la place aux traits de coupe.' && a3mFit.ok, { a3m, a3mFit });
  await snap(`${T}-3-a3-traits`);
  await clickCenter(optionLabel('pp-sheets-orientation', 'portrait'));
  const a3p = await dialogState(), a3pFit = await fits();
  check(`${T}, clic sur Portrait : 2 x 2, douze repères, plus de note d'échelle (la place est là), sans défiler`, a3p.orientation === 'portrait' && a3p.cols === 2 && a3p.rows === 2 && a3p.marksDrawn === 12 && a3p.scaled === '' && a3pFit.ok, { a3p, a3pFit });
  await clickCenter(optionLabel('pp-sheets-sheet', 'A4'));
  const back = await dialogState();
  check(`${T}, clic sur A4 : retour au meilleur réglage de l'A4 (portrait, 2 x 2), note « 93 % » avec les traits`, back.sheet === 'A4' && back.orientation === 'portrait' && back.cols === 2 && back.rows === 2 && back.scaled === 'Pages réduites à 93 % pour laisser la place aux traits de coupe.', back);

  // 4) Le clavier : flèches sur les cases d'option, flèches sur une liste, Tab sans sortir de la fenêtre.
  await clickCenter(optionLabel('pp-sheets-sheet', 'A4'));
  await page.keyboard.press('ArrowRight');
  const arrowRight = await dialogState();
  await page.keyboard.press('ArrowLeft');
  const arrowLeft = await dialogState();
  check(`${T}, clavier : flèche droite sur « A4 » coche A3 (paysage, 4 x 2), flèche gauche revient à A4 (portrait, 2 x 2)`, arrowRight.sheet === 'A3' && arrowRight.orientation === 'landscape' && arrowRight.cols === 4 && arrowLeft.sheet === 'A4' && arrowLeft.orientation === 'portrait' && arrowLeft.cols === 2, { arrowRight, arrowLeft });
  const tabs = [];
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); tabs.push(await focusIn()); }
  check(`${T}, clavier : Tab tourne dans la fenêtre sans en sortir (${tabs.join(' > ')})`, tabs.every(t => t !== 'editor' && t !== 'body') && ['orientation=portrait', 'marks=on', 'pp-sheets-cols', 'pp-sheets-rows', 'Annuler', 'Générer'].every(t => tabs.includes(t)), tabs);
  await page.focus('#pp-sheets-cols');
  await page.keyboard.press('ArrowUp');
  const oneCol = await dialogState();
  check(`${T}, clavier : flèche haut sur la liste « en largeur » passe à 1 colonne (1 x 2, deux emplacements), le résumé et l'aperçu suivent`, oneCol.cols === 1 && oneCol.rows === 2 && oneCol.slots === 2 && oneCol.summary === '2 emplacements par feuille (1 × 2) : 6 lignes sur 3 feuilles A4.', oneCol);
  await snap(`${T}-4-clavier`);

  // 5) Un choix qui ne tient pas est grisé, lisible et sans effet.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate(() => PageLayout.setFormat('A3'));
  await page.waitForTimeout(300);
  await clickSheetsRow();
  const grey = await page.evaluate(() => {
    const input = document.querySelector('#pp-sheets-modal input[name="pp-sheets-sheet"][value="A4"]');
    const label = input.closest('label');
    const land = document.querySelector('#pp-sheets-modal input[name="pp-sheets-orientation"][value="landscape"]');
    return { disabled: input.disabled, off: label.classList.contains('pp-sheets-option-off'), title: label.title, landDisabled: land.disabled, landTitle: land.closest('label').title };
  });
  await clickCenter(optionLabel('pp-sheets-sheet', 'A4'));
  const greyState = await dialogState();
  const cGrey = await contrastOf(optionLabel('pp-sheets-sheet', 'A4'));
  const greyScroll = await fits();
  check(`${T}, grisé : pour une page A3, la feuille A4 et le paysage restent affichés, grisés, avec leur raison en info-bulle`, grey.disabled && grey.off && grey.title === 'Trop petite pour une page A3.' && grey.landDisabled && grey.landTitle === 'Une page A3 n’y tient pas.', grey);
  check(`${T}, grisé : un vrai clic sur « A4 » ne change rien (reste A3 portrait, 1 x 1), le texte grisé fait ${cGrey}:1 (au moins 4,5:1), la fenêtre tient`, greyState.sheet === 'A3' && greyState.orientation === 'portrait' && greyState.slots === 1 && cGrey >= 4.5 && greyScroll.ok, { greyState, cGrey, greyScroll });
  await snap(`${T}-5-grise`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate(() => PageLayout.setFormat('A6'));
  await page.waitForTimeout(300);

  if (!full) { await closeWindowWithEscape(); return; }

  // 6) Annuler et Échap ne lancent rien ; « Générer » à la souris télécharge le fichier ; Entrée aussi.
  await clickSheetsRow();
  const before = await statusText();
  let downloaded = null;
  const onDownload = d => { downloaded = d; };
  page.on('download', onDownload);
  await clickCenter(CANCEL);
  await page.waitForTimeout(600);
  const afterCancel = await statusText();
  check(`${T}, annuler : la fenêtre se ferme, rien n'est téléchargé, le message d'état ne change pas`, !(await winOpen()) && downloaded === null && afterCancel === before, { open: await winOpen(), downloaded: !!downloaded, before, afterCancel });
  await clickSheetsRow();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  check(`${T}, Échap : la fenêtre se ferme, rien n'est téléchargé`, !(await winOpen()) && downloaded === null, { open: await winOpen(), downloaded: !!downloaded });
  page.off('download', onDownload);

  await clickSheetsRow();
  await clickCenter(optionLabel('pp-sheets-marks', 'on'));
  const downloadA = page.waitForEvent('download', { timeout: 60000 });
  await clickCenter(OK);
  const fileA = await readDownload(await downloadA);
  await page.waitForTimeout(300);
  const statusA = await statusText();
  check(`${T}, « Générer » : « ${TABLE}-assemblage.pdf », un PDF de 2 feuilles A4 (595,28 x 841,89 pt) - quatre lignes puis deux, dans l'ordre`, fileA.name === `${TABLE}-assemblage.pdf` && fileA.header === '%PDF-' && fileA.pages === 2 && fileA.sizes.every(([w, h]) => Math.abs(w - 595.28) < 0.1 && Math.abs(h - 841.89) < 0.1) && NAMES.slice(0, 4).every(n => fileA.texts[0].includes(n.split(' ')[0])) && NAMES.slice(4).every(n => fileA.texts[1].includes(n.split(' ')[0])) && !NAMES.slice(4).some(n => fileA.texts[0].includes(n.split(' ')[0])), fileA);
  check(`${T}, « Générer » : la fenêtre est fermée et le message final dit « 6 lignes placées sur 2 feuilles — fichier téléchargé. »`, !(await winOpen()) && statusA === '6 lignes placées sur 2 feuilles — fichier téléchargé.', { open: await winOpen(), statusA });
  // Le choix (A4, portrait, avec traits) est retrouvé à la réouverture ; Entrée sur une case d'option valide.
  await clickSheetsRow();
  const reopened = await dialogState();
  check(`${T}, réouverture : le dernier choix est gardé (A4, portrait, avec traits de coupe), les emplacements repartent du maximum (2 x 2)`, reopened.sheet === 'A4' && reopened.orientation === 'portrait' && reopened.marks === 'on' && reopened.cols === 2 && reopened.rows === 2, reopened);
  const downloadB = page.waitForEvent('download', { timeout: 60000 });
  await page.keyboard.press('Enter');
  const fileB = await readDownload(await downloadB);
  await page.waitForTimeout(300);
  check(`${T}, Entrée : valide la fenêtre et télécharge le même fichier (2 feuilles)`, !(await winOpen()) && fileB.name === `${TABLE}-assemblage.pdf` && fileB.pages === 2, { open: await winOpen(), fileB });
}

async function runEnglish() {
  await page.evaluate(() => { localStorage.removeItem(SheetAssemblyDialog.STORAGE); I18n.setLang('en'); });
  await page.waitForTimeout(250);
  await seed('A6');
  await openExportMenu();
  const rowEn = await page.evaluate(() => document.getElementById('v2-btn-export-pdf-sheets').textContent.trim());
  check('anglais, menu : la ligne dit « Assemble before printing… »', rowEn === 'Assemble before printing…', rowEn);
  await closeMenu();
  await clickSheetsRow();
  await clickCenter(optionLabel('pp-sheets-marks', 'on'));
  const en = await dialogState(), enFit = await fits(), ok = await hit(OK), box = await hit(BOX);
  check('anglais, fenêtre : titre, libellés, choix, boutons, résumé et note en anglais', en.title === 'Assemble before printing' && en.labels === 'Sheet,Orientation,Crop marks,Slots' && en.options === 'A4,A3,Portrait,Landscape,Without,With' && en.buttons === 'Cancel,Generate' && en.summary === '4 slots per sheet (2 × 2): 6 rows on 2 A4 sheets.' && en.hint === 'One page per slot, in table order.' && en.scaled === 'Pages reduced to 93% to leave room for the crop marks.', en);
  check(`anglais, fenêtre : elle tient dans le panneau, sans défiler (${enFit.scrollH}/${enFit.clientH}), « Generate » au premier plan`, box.inPanel && seen(ok) && enFit.ok, { box, ok, enFit });
  await snap('en-1-fenetre');
  await clickCenter(optionLabel('pp-sheets-sheet', 'A3'));
  const enA3 = await dialogState(), enA3Fit = await fits();
  check('anglais, A3 avec traits de coupe : huit emplacements, seize repères, la fenêtre tient toujours', enA3.slots === 8 && enA3.marksDrawn === 16 && enA3.summary === '8 slots per sheet (4 × 2): 6 rows on 1 A3 sheet.' && enA3Fit.ok, { enA3, enA3Fit });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate(() => { localStorage.removeItem(SheetAssemblyDialog.STORAGE); I18n.setLang('fr'); });
  await page.waitForTimeout(250);
  await closeWindowWithEscape();
}

await page.evaluate(() => localStorage.removeItem(SheetAssemblyDialog.STORAGE));
await run('light', true);
await page.evaluate(() => { localStorage.removeItem(SheetAssemblyDialog.STORAGE); Settings.setTheme('dark'); });
await page.waitForTimeout(200);
await run('dark', false);
await runEnglish();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucun avertissement de ProseMirror (sélection invalide, contenu refusé) pendant le parcours', consoleProblems.length === 0, consoleProblems);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
