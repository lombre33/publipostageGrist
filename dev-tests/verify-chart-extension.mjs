#!/usr/bin/env node
// L'extension « graphique » (consigne GFS 005 : extensions/graphique/, js/extensions.js, js/gfs-link.js, js/chart-entry.js, css/chart-frame.css) à la vraie souris et au vrai clavier, 700x400,
// français clair puis anglais sombre. Le graphique est une fonction de Grist Factory Suite (GFS) : le widget seul (adresse sans `gfs=`) n'en charge ni le code ni Plotly, la grise - jamais cachée,
// jamais perdue - et explique au clic ; hébergé par GFS (un GFS simulé, dev-tests/gfs-stub.js), il charge l'extension à son premier usage et suit les événements `extensions` de GFS.
//  SEUL (adresse sans `gfs=`) : au démarrage aucun fichier d'extension, aucun Plotly ; le modèle qui porte un graphique s'ouvre (au démarrage, puis en changeant de modèle) avec un cadre grisé qui
//   garde son nom et dit pourquoi ; il se réenregistre avec tous ses attributs ; la ligne « Graphique de la page… » du menu est grisée, avec sa raison, et sa place ; son clic (souris ou clavier)
//   ouvre une fenêtre simple « il faut passer par GFS » (un bouton « Fermer », Échap ferme, le focus revient) ; la Lecture et l'aperçu (ce que lisent le PDF, le Word et l'Excel) écrivent la
//   note « [Graphique indisponible] » ; rien n'est demandé au réseau pour la fonction grisée.
//  HÉBERGÉ : l'extension active ne se charge qu'au premier clic (ses quatre fichiers, ?v= du registre) et la fenêtre du graphique s'ouvre ; l'événement `extensions` retiré puis renvoyé fait passer
//   la ligne et le cadre de grisés à actifs et inversement ; une extension non activée dans GFS : le clic appelle `installer` (pas de fenêtre) ; un GFS qui ne répond pas : la fonction est grisée
//   après les 5 secondes du contexte et le clic ouvre la fenêtre simple.
// Lancé par run-headless.mjs (groupe Node "chartExtension", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-chart-extension.mjs
// CHART_EXTENSION_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const GFS_STUB = join(ROOT, 'dev-tests', 'gfs-stub.js');
const PORT = Number(process.env.CHART_EXTENSION_PORT || 8907);
const SHOTS = process.env.CHART_EXTENSION_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-unknown-type-mouse.mjs.
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-chart-extension] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

let total = 0, failures = 0;
let tag = '';
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + tag + name);
  else { failures++; console.log('  FAIL - ' + tag + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];

// Le graphique d'un modèle, tel que l'éditeur l'écrit : sa référence (section, portée, nom), sa taille ; jamais d'image dans le modèle.
const CHART_IMG = '<img class="editor-image" alt="Graphique" style="width: 480px; height: 300px" data-layer="normal" data-wrap="inline" data-chart-section="101" data-chart-scope="linked" data-chart-name="Ventes par mois">';
const FILES = ['chart-plot.js', 'chart-source.js', 'chart-block.js', 'chart-block.css'];

// Les modèles : 1 « Rapport » (document, ★) porte le graphique ; 2 « Note » n'en porte pas. `starId` : celui qui s'ouvre au démarrage. La ligne reçue dès l'abonnement est « L1 ».
const seedOf = starId => `
  const m = stub.state.rows.Publipostage_Modeles;
  m.TypeModele = [];
  const add = (id, nom, contenu, def, type) => { m.id.push(id); m.Nom.push(nom); m.Contenu.push(contenu); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(def); m.TypeModele.push(type); };
  add(1, 'Rapport', ${JSON.stringify('<p>Bonjour le monde</p><p>' + CHART_IMG + '</p>')}, ${starId === 1}, 'document');
  add(2, 'Note', '<p>Une note sans graphique</p>', ${starId === 2}, 'document');
  stub.state.nextRowId.Publipostage_Modeles = 3;
  stub.setVariables('PpDepart', { Nom: 'Text' });
  const rec = { id: 1, Nom: 'L1' };
  stub.state.recordCallbacks = Object.assign([], { push(entry) { Array.prototype.push.call(this, entry); entry.cb(rec, { tableId: 'PpDepart' }); return this.length; } });
`;

const TEXTS = {
  fr: {
    reason: 'Demande l’extension Graphique (Grist Factory Suite)',
    row: 'Graphique de la page…',
    title: 'Cette fonction demande Grist Factory Suite',
    message: '« Graphique de la page » fait partie de l’extension « Graphique », disponible quand Publipostage+ tourne dans Grist Factory Suite. Pour l’utiliser, passez par Grist Factory Suite.',
    close: 'Fermer',
    note: '[Graphique indisponible]',
  },
  en: {
    reason: 'Needs the Chart extension (Grist Factory Suite)',
    row: 'Chart from the page…',
    title: 'This feature needs Grist Factory Suite',
    message: '“Chart from the page” is part of the “Chart” extension, available when Publipostage+ runs inside Grist Factory Suite. To use it, go through Grist Factory Suite.',
    close: 'Close',
    note: '[Chart unavailable]',
  },
};

// Ouvre le widget (700x400) : seul, ou hébergé (`?gfs=0`, contrat de l'app) avec un GFS simulé réglé par `stub` ({ extensions, ignoreContext… }). Rend la page, les adresses demandées au réseau
// et les boîtes natives ouvertes (aucune ne doit l'être).
async function openPage({ hosted, stub, starId, colorScheme, lang }) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  const requests = [];
  const natives = [];
  page.on('request', request => requests.push(request.url()));
  page.on('dialog', async d => { natives.push(d.type() + ' : ' + d.message()); await d.dismiss(); });
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
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
  // La langue est lue dans le stockage local avant tout autre script, comme chez une personne qui l'a choisie dans Réglages.
  await page.addInitScript(({ language }) => { try { localStorage.setItem('pp_lang', language); } catch (e) { /* stockage indisponible */ } }, { language: lang });
  await page.addInitScript(`window.__preSeedGristStub = (stub) => { ${seedOf(starId)} };`);
  if (hosted) {
    await page.addInitScript({ path: GFS_STUB });
    if (stub) await page.addInitScript(`Object.assign(window.__gfsStub, ${JSON.stringify(stub)});`);
  }
  await page.goto(`${BASE}/_test-harness.html${hosted ? '?gfs=0' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  return { page, requests, natives, context };
}

const rgb = css => { const m = /rgba?\(([^)]+)\)/.exec(css || ''); if (!m) return null; const [r, g, b, a] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a: a === undefined ? 1 : a }; };
const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// Les outils d'une page ouverte : positions, visibilité réelle (dans le panneau et au premier plan), contraste, menu et clics à la vraie souris.
function toolsOf(page) {
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
    return { found: true, w: r.width, h: r.height, inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === el || el.contains(top)), l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) };
  }, selector);
  const seen = box => box.found && box.inPanel && box.onTop;
  // Rapport de contraste WCAG du texte d'un élément (ou de son pseudo-élément) sur son fond réel : les fonds transparents des ancêtres sont composés jusqu'au premier opaque.
  const contrastOf = (selector, pseudo) => page.evaluate(({ sel, ps }) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(s => parseFloat(s)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lumin = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    const layers = [];
    for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (const c of layers.reverse()) base = mix(c, base);
    let fg = parse(getComputedStyle(el, ps || null).color);
    if (fg.a < 1) fg = mix(fg, base);
    const a = lumin(fg), b = lumin(base);
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  }, { sel: selector, ps: pseudo || null });
  async function click(selector) {
    const c = await centerOf(selector);
    if (!c) return null;
    await page.mouse.move(c.x, c.y, { steps: 3 });
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(200);
    return c;
  }
  // Survol réel de l'icône du menu : la souris arrive depuis le bas du document (jamais par-dessus un autre volet de la barre).
  async function openMenu() {
    const c = await centerOf('#v2-btn-link');
    await page.mouse.move(c.x, c.y + 150);
    await page.mouse.move(c.x, c.y, { steps: 4 });
    await page.waitForTimeout(350);
    return c;
  }
  async function closeMenu() {
    await page.mouse.move(WIDTH - 30, HEIGHT - 20, { steps: 3 });
    await page.waitForTimeout(250);
  }
  // Une ligne du menu, à la vraie souris : le volet s'ouvre au survol de l'icône, puis la main descend de l'icône sur la ligne (sans quitter le volet) et clique.
  async function clickRow(selector) {
    const c = await openMenu();
    const r = await centerOf(selector);
    const x = Math.min(Math.max(c.x, r.l + 8), r.r - 8);
    await page.mouse.move(x, r.y, { steps: 8 });
    await page.waitForTimeout(100);
    await page.mouse.click(x, r.y);
    await page.waitForTimeout(300);
  }
  const pointOf = text => page.evaluate(wanted => {
    const walker = document.createTreeWalker(document.querySelector('.tiptap'), NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const i = n.textContent.indexOf(wanted);
      if (i < 0) continue;
      const range = document.createRange(); range.setStart(n, i); range.setEnd(n, i + wanted.length);
      const b = range.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }
    return null;
  }, text);
  return { centerOf, hit, seen, contrastOf, click, openMenu, closeMenu, clickRow, pointOf };
}

const ROW = '#v2-btn-chart';
const FLYOUT = '#v2-blocks-flyout';
const FRAME = '.tiptap .editor-image-chart-placeholder';
const DIALOG = '#pp-dialog-modal';
const CHART_WINDOW = '#pp-chart-modal';

// L'état de la ligne « Graphique de la page… » du menu (et de ses sept voisines : aucune n'est grisée par l'extension).
const rowState = page => page.evaluate(() => {
  const row = document.getElementById('v2-btn-chart');
  const rows = Array.from(document.querySelectorAll('#v2-blocks-flyout .v2-menu-row'));
  return {
    label: row ? row.textContent.trim() : null, index: rows.indexOf(row), count: rows.length,
    ariaDisabled: row ? row.getAttribute('aria-disabled') : null, greyClass: !!row && row.classList.contains('v2-hover-row-disabled'), title: row ? row.title : null,
    othersGrey: rows.filter(r => r !== row && r.classList.contains('v2-hover-row-disabled')).length,
    // Elle se LIT grisée : sa couleur est celle des textes discrets, pas celle de ses voisines (la classe seule ne suffit pas, une règle plus précise peut l'emporter).
    color: row ? getComputedStyle(row).color : null, neighbourColor: rows[5] ? getComputedStyle(rows[5]).color : null, mutedColor: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim(),
    iconColor: row && row.querySelector('.v2-menu-row-icon') ? getComputedStyle(row.querySelector('.v2-menu-row-icon')).color : null,
  };
});
// Le cadre du graphique dans l'éditeur : grisé ou non, son nom, sa raison (le pseudo-élément du libellé) et son titre.
const frameState = page => page.evaluate((selector) => {
  const wrap = document.querySelector(selector);
  if (!wrap) return null;
  const label = wrap.querySelector('.editor-image-var-label');
  const raw = getComputedStyle(label, '::after').content;
  const r = wrap.getBoundingClientRect();
  return {
    off: wrap.classList.contains('editor-image-chart-off'), drawn: wrap.classList.contains('editor-image-chart-drawn'), name: label.textContent,
    reason: raw && raw !== 'none' && raw !== 'normal' ? raw.replace(/^"|"$/g, '') : '', title: wrap.title || '', hasSrc: !!wrap.querySelector('img').getAttribute('src'),
    inPanel: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.width > 40 && r.height > 40,
  };
}, FRAME);
// La fenêtre simple (Dialogs.notice) : ouverte ou non, ses textes, ses boutons visibles, où est le focus.
const dialogState = page => page.evaluate(() => {
  const modal = document.getElementById('pp-dialog-modal');
  if (!modal) return { exists: false, open: false };
  const open = modal.style.display !== 'none' && modal.getBoundingClientRect().height > 0;
  const box = modal.querySelector('.pp-modal-box');
  const br = box.getBoundingClientRect();
  const buttons = Array.from(modal.querySelectorAll('.var-modal-actions button')).filter(b => !b.hidden && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0);
  const message = modal.querySelector('#pp-dialog-message');
  const a = document.activeElement;
  return {
    exists: true, open, title: modal.querySelector('#pp-dialog-title').textContent, message: message.hidden ? '' : message.textContent, buttons: buttons.map(b => b.textContent.trim()),
    focus: a ? (a.closest('#pp-dialog-modal') ? 'fenêtre : ' + a.textContent.trim() : (a.closest('.tiptap') ? 'editor' : 'ailleurs : ' + (a.id || a.tagName))) : 'rien',
    inPanel: br.left >= -0.5 && br.top >= -0.5 && br.right <= innerWidth + 0.5 && br.bottom <= innerHeight + 0.5,
  };
});
const chartWindowOpen = page => page.evaluate(() => { const m = document.getElementById('pp-chart-modal'); return !!m && m.style.display !== 'none' && m.getBoundingClientRect().height > 0; });
const extensionRequests = requests => requests.filter(url => /\/extensions\//.test(url)).map(url => url.replace(/^https?:\/\/[^/]+/, ''));
// Tout ce qui ferait du graphique une dépendance du démarrage : ses fichiers (dossier de l'extension ou anciens js/chart-*.js) et Plotly.
const chartTraffic = requests => requests.filter(url => /\/extensions\/|plotly|\/js\/chart-(plot|source|block)\.js|\/css\/chart-block\.css/i.test(url));
// Les graphiques d'un contenu HTML, tels que le modèle les écrit : leurs références, leur taille, la présence d'une image (jamais).
const chartAttrsOf = (page, html) => page.evaluate((source) => {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  return Array.from(doc.querySelectorAll('img[data-chart-section]')).map(img => ({
    attrs: Object.fromEntries(['data-chart-section', 'data-chart-scope', 'data-chart-name', 'data-layer', 'data-wrap', 'alt'].map(n => [n, img.getAttribute(n)])),
    hasSrc: img.hasAttribute('src'), width: img.style.width, height: img.style.height,
  }));
}, html);

async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Le widget seul : aucune extension.
async function runStandalone(lang, colorScheme) {
  tag = `[seul ${lang} ${colorScheme}] `;
  const t = TEXTS[lang];
  const { page, requests, natives, context } = await openPage({ hosted: false, starId: 1, colorScheme, lang });
  const tools = toolsOf(page);
  const { centerOf, hit, seen, contrastOf, click, openMenu, closeMenu, clickRow, pointOf } = tools;
  const state = () => page.evaluate(() => ({
    hosted: typeof GfsLink !== 'undefined' ? GfsLink.hosted : null,
    extensions: typeof GfsLink !== 'undefined' ? GfsLink.extensions() : null,
    active: typeof Extensions !== 'undefined' ? Extensions.isActive('graphique') : null,
    address: typeof GfsLink !== 'undefined' ? GfsLink.widgetAddress() : null,
    chartBlock: typeof ChartBlock, plotly: typeof window.Plotly, chartPlot: typeof ChartPlot,
    current: typeof Templates !== 'undefined' ? Templates.getCurrentId() : null,
  }));

  // --- Le démarrage : le modèle ★ porte un graphique, et rien n'est demandé pour le dessiner.
  const started = await state();
  check('au démarrage, le widget seul n’est pas hébergé et n’a aucune extension active', started.hosted === false && Array.isArray(started.extensions) && started.extensions.length === 0 && started.active === false, started);
  check('… et aucune adresse de GFS : la sienne est celle de sa page (consigne 009, rien ne change seul)', started.address === '', started);
  check('au démarrage, aucun fichier d’extension, aucun ancien chart-*.js ni Plotly n’est demandé, et le code du graphique n’est pas chargé', chartTraffic(requests).length === 0 && started.chartBlock === 'undefined' && started.chartPlot === 'undefined' && started.plotly === 'undefined', { traffic: chartTraffic(requests), started });
  await page.waitForSelector(FRAME, { timeout: 5000 }).catch(() => {});
  const frame = await frameState(page);
  // Le cadre (480 x 300 px à l'échelle de la feuille) est plus bas que le texte : la personne fait défiler le document jusqu'à lui.
  await page.evaluate(selector => document.querySelector(selector).scrollIntoView({ block: 'center', inline: 'nearest' }), FRAME);
  await page.waitForTimeout(150);
  const frameBox = await hit(FRAME);
  check('le modèle ★ qui porte un graphique s’ouvre : son cadre est là, GRISÉ, avec son nom', !!frame && frame.off && !frame.drawn && frame.name === 'Ventes par mois' && !frame.hasSrc, frame);
  check('le cadre dit pourquoi sous son nom (« Demande l’extension Graphique (Grist Factory Suite) ») et dans son info-bulle', !!frame && frame.reason === t.reason && frame.title === t.reason, frame);
  const centerInPanel = box => box.found && box.l >= 0 && box.r <= WIDTH && (box.t + box.b) / 2 > 0 && (box.t + box.b) / 2 < HEIGHT && box.onTop;
  check('le cadre, une fois le document défilé jusqu’à lui, est dans la largeur du panneau 700x400, son centre (nom et raison) au premier plan', !!frame && frame.inPanel && centerInPanel(frameBox), { frame, frameBox });
  const nameContrast = await contrastOf(`${FRAME} .editor-image-var-label`);
  const reasonContrast = await contrastOf(`${FRAME} .editor-image-var-label`, '::after');
  check('le nom et la raison du cadre ont un contraste d’au moins 4,5:1', nameContrast >= 4.5 && reasonContrast >= 4.5, { nameContrast, reasonContrast });
  await snap(page, `seul-${lang}-${colorScheme}-1-cadre`);

  // --- Changer de modèle et revenir : le graphique n'est ni perdu ni demandé.
  const templatePopupRow = id => `.tts-popup .tts-row-leaf[data-template-id="${id}"] .tts-row-label`;
  async function chooseTemplate(id) {
    await click('.tts-trigger');
    await page.waitForSelector('.tts-popup.is-open', { timeout: 5000 }).catch(() => {});
    await click(templatePopupRow(id));
    await page.waitForFunction(wanted => String(Templates.getCurrentId()) === String(wanted), id, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  await chooseTemplate(2);
  const onNote = await page.evaluate(() => ({ text: document.querySelector('.ProseMirror').textContent, frames: document.querySelectorAll('.editor-image-chart-placeholder').length }));
  check('changer de modèle à la vraie souris ouvre « Note », sans graphique', onNote.text === 'Une note sans graphique' && onNote.frames === 0, onNote);
  await chooseTemplate(1);
  const backFrame = await frameState(page);
  check('rouvrir le modèle qui porte le graphique redonne le cadre grisé, avec son nom et sa raison', !!backFrame && backFrame.off && backFrame.name === 'Ventes par mois' && backFrame.reason === t.reason, backFrame);
  check('ni le démarrage ni l’ouverture du modèle n’ont demandé un seul fichier du graphique', chartTraffic(requests).length === 0, chartTraffic(requests));

  // --- Le modèle se réenregistre avec tous les attributs du graphique (rien n'est perdu, rien n'est ajouté).
  const original = await chartAttrsOf(page, CHART_IMG);
  await page.evaluate(() => document.querySelector('.tiptap p').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  const p = await pointOf('Bonjour le monde');
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('End');
  await page.keyboard.type('!', { delay: 20 });
  await click('#btn-save');
  await page.waitForFunction(() => /Bonjour le monde!/.test(window.__gristStub.getRow('Publipostage_Modeles', 1).Contenu || ''), null, { timeout: 8000 }).catch(() => {});
  const saved = await page.evaluate(() => window.__gristStub.getRow('Publipostage_Modeles', 1).Contenu);
  const savedCharts = await chartAttrsOf(page, saved);
  check('« Enregistrer » réécrit le modèle (le texte tapé y est) avec son graphique : mêmes références (section, portée, nom), même taille, toujours aucune image',
    /Bonjour le monde!/.test(saved) && original.length === 1 && savedCharts.length === 1 && JSON.stringify(savedCharts[0]) === JSON.stringify(original[0]) && savedCharts[0].width === '480px' && savedCharts[0].height === '300px' && !savedCharts[0].hasSrc, { savedCharts, original, saved: String(saved).slice(0, 400) });
  const stillGrey = await frameState(page);
  check('après l’enregistrement, le cadre est toujours là, grisé', !!stillGrey && stillGrey.off && stillGrey.name === 'Ventes par mois', stillGrey);

  // --- Le menu : la ligne est à sa place, grisée avec sa raison, jamais retirée.
  await openMenu();
  const flyout = await hit(FLYOUT);
  const rowBox = await hit(ROW);
  const row = await rowState(page);
  check('au survol de l’icône chaîne, le volet s’ouvre dans le panneau avec sa ligne « Graphique de la page… » en dernier (rien n’a disparu)', flyout.found && flyout.inPanel && seen(rowBox) && row.count === 8 && row.index === 7 && row.label === t.row, { flyout, rowBox, row });
  check('la ligne est grisée (aria-disabled et classe des lignes grisées), avec sa raison pour info-bulle, et ses sept voisines ne le sont pas', row.ariaDisabled === 'true' && row.greyClass && row.title === t.reason && row.othersGrey === 0, row);
  check('elle se lit grisée : son texte et son icône ont la couleur des textes discrets, autre que celle de leurs voisines', row.color !== row.neighbourColor && row.color === row.iconColor && row.color === await page.evaluate(token => { const probe = document.createElement('span'); probe.style.color = token; document.body.appendChild(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; }, row.mutedColor), row);
  const rowContrast = await contrastOf(`${ROW} #v2-btn-chart-label`);
  check('le libellé de la ligne grisée garde un contraste d’au moins 4,5:1', rowContrast >= 4.5, rowContrast);
  await snap(page, `seul-${lang}-${colorScheme}-2-menu`);
  await closeMenu();

  // --- Le clic (à la vraie souris) sur la ligne grisée : une fenêtre simple, rien n'est chargé.
  await clickRow(ROW);
  const open = await dialogState(page);
  check('le clic sur la ligne grisée ouvre une fenêtre simple dans le panneau (et non la fenêtre du graphique)', open.open && open.inPanel && !(await chartWindowOpen(page)), open);
  check('la fenêtre dit qu’il faut passer par Grist Factory Suite pour cette fonction', open.title === t.title && open.message === t.message, open);
  check('elle n’a qu’un bouton, « Fermer », où arrive le focus', open.buttons.length === 1 && open.buttons[0] === t.close && open.focus === 'fenêtre : ' + t.close, open);
  const dialogContrast = { title: await contrastOf('#pp-dialog-title'), message: await contrastOf('#pp-dialog-message'), close: await contrastOf(`${DIALOG} .var-modal-actions button:not([hidden])`) };
  check('titre, message et bouton de la fenêtre ont un contraste d’au moins 4,5:1', Object.values(dialogContrast).every(v => v >= 4.5), dialogContrast);
  await snap(page, `seul-${lang}-${colorScheme}-3-fenetre`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const afterEscape = await dialogState(page);
  check('Échap ferme la fenêtre ; le focus n’est pas perdu', !afterEscape.open && afterEscape.focus !== 'rien' && !/fenêtre/.test(afterEscape.focus), afterEscape);
  await clickRow(ROW);
  const reopened = await dialogState(page);
  await click(`${DIALOG} .var-modal-actions button:not([hidden])`);
  const afterClose = await dialogState(page);
  check('rouverte, la fenêtre se ferme avec « Fermer » à la vraie souris', reopened.open && !afterClose.open, { reopened: reopened.open, afterClose: afterClose.open });
  // Au clavier : le focus sur la ligne grisée (volet ouvert) et Entrée expliquent de même.
  await openMenu();
  await page.focus(ROW);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const byKey = await dialogState(page);
  check('au clavier, Entrée sur la ligne grisée ouvre la même fenêtre', byKey.open && byKey.title === t.title, byKey);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await closeMenu();
  // Le raccourci de l'action « Graphique de la page » (sans touche d'origine ; Réglages > Raccourcis la laisse choisir) fait le même geste que la souris : la même fenêtre.
  const ranByShortcut = await page.evaluate(() => Shortcuts.run('chartBlock'));
  await page.waitForTimeout(300);
  const byShortcut = await dialogState(page);
  check('le raccourci de l’action « Graphique de la page » fait le même geste que la souris : la même fenêtre', ranByShortcut === true && byShortcut.open && byShortcut.title === t.title && byShortcut.message === t.message, { ranByShortcut, byShortcut });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('ni les clics sur la ligne grisée, ni le raccourci, ni la fenêtre n’ont demandé un fichier du graphique', chartTraffic(requests).length === 0, chartTraffic(requests));

  // --- La Lecture et l'aperçu (PDF, Word, Excel) : la note prend la place du graphique.
  await click('#btn-mode-read');
  await page.waitForFunction(() => !!document.querySelector('#reader-container .reader-content .error-msg'), null, { timeout: 15000 }).catch(() => {});
  const reading = await page.evaluate(() => {
    const content = document.querySelector('#reader-container .reader-content');
    const note = content && content.querySelector('.error-msg');
    const r = note ? note.getBoundingClientRect() : null;
    return { note: note ? note.textContent.trim() : null, charts: content ? content.querySelectorAll('img[data-chart-section]').length : -1, images: content ? content.querySelectorAll('img').length : -1, inPanel: !!r && r.left >= 0 && r.right <= innerWidth + 0.5 };
  });
  check('à la Lecture, la note « [Graphique indisponible] » prend la place du graphique, dans le panneau, sans image', reading.note === t.note && reading.charts === 0 && reading.images === 0 && reading.inPanel, reading);
  await snap(page, `seul-${lang}-${colorScheme}-4-lecture`);
  await click('#btn-mode-edit');
  await page.waitForTimeout(400);
  const previewHtml = await page.evaluate(async (img) => ReaderMode.preview('<p>Avant</p><p>' + img + '</p>', 'PpDepart', GristAPI.getCurrentRecord()), CHART_IMG);
  const previewText = await page.evaluate(html => { const box = document.createElement('div'); box.innerHTML = html; return { text: box.textContent, images: box.querySelectorAll('img').length, charts: box.querySelectorAll('[data-chart-section]').length }; }, previewHtml);
  check('l’aperçu de la ligne (ce que lisent le PDF, le Word et l’Excel) porte la même note, sans image ni référence au graphique', previewText.text.includes(t.note) && previewText.images === 0 && previewText.charts === 0, previewText);
  const backInEdit = await frameState(page);
  check('de retour en édition, le cadre est intact et grisé', !!backInEdit && backInEdit.off && backInEdit.name === 'Ventes par mois' && backInEdit.reason === t.reason, backInEdit);

  // --- Un modèle dont le contenu est posé par le code (collage, import) garde aussi le graphique, grisé.
  const roundTrip = await page.evaluate((img) => {
    Editor.setHTML('<p>Texte</p><p>' + img + '</p>');
    const first = Editor.getHTML();
    Editor.setHTML(first);
    return { same: Editor.getHTML() === first, html: first };
  }, CHART_IMG);
  const roundCharts = await chartAttrsOf(page, roundTrip.html);
  check('le contenu relu puis réécrit est identique, avec les mêmes références et sans image', roundTrip.same && roundCharts.length === 1 && roundCharts[0].attrs['data-chart-section'] === '101' && roundCharts[0].attrs['data-chart-name'] === 'Ventes par mois' && !roundCharts[0].hasSrc, { roundTrip, roundCharts });
  check('aucun fichier du graphique n’a été demandé de tout le parcours, aucune boîte du navigateur ouverte', chartTraffic(requests).length === 0 && natives.length === 0, { traffic: chartTraffic(requests), natives });
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Hébergé par GFS, extension active : chargée au premier clic seulement.
async function runHostedActive(lang, colorScheme) {
  tag = `[hébergé ${lang} ${colorScheme}] `;
  const t = TEXTS[lang];
  const { page, requests, natives, context } = await openPage({ hosted: true, stub: { extensions: ['graphique'] }, starId: 2, colorScheme, lang });
  const { hit, seen, click, clickRow, closeMenu, openMenu } = toolsOf(page);
  await page.evaluate(() => GfsLink.ready);
  const started = await page.evaluate(() => ({ hosted: GfsLink.hosted, extensions: GfsLink.extensions(), active: Extensions.isActive('graphique'), loaded: Extensions.isLoaded('graphique'), calls: window.__gfsStub.calls.map(c => c.nom), block: typeof ChartBlock, plotly: typeof window.Plotly }));
  check('hébergé, le widget demande le contexte à GFS une fois et sait l’extension active', started.hosted === true && started.calls.filter(n => n === 'contexte').length === 1 && started.active === true && started.extensions.join() === 'graphique', started);
  check('active mais pas encore utilisée : aucun fichier du graphique n’est demandé, ni Plotly (chargement au premier usage)', chartTraffic(requests).length === 0 && !started.loaded && started.block === 'undefined' && started.plotly === 'undefined', { traffic: chartTraffic(requests), started });
  await openMenu();
  const row = await rowState(page);
  check('la ligne « Graphique de la page… » n’est pas grisée : ni aria-disabled, ni classe, ni info-bulle de raison, la couleur de ses voisines', row.label === t.row && row.index === 7 && row.ariaDisabled === 'false' && !row.greyClass && !row.title && row.color === row.neighbourColor, row);
  await closeMenu();
  await clickRow(ROW);
  await page.waitForFunction(() => { const m = document.getElementById('pp-chart-modal'); return !!m && m.style.display !== 'none' && m.getBoundingClientRect().height > 0; }, null, { timeout: 15000 }).catch(() => {});
  const windowBox = await hit(`${CHART_WINDOW} .modal-content`);
  const asked = extensionRequests(requests);
  const expected = FILES.map(file => `/extensions/graphique/${file}?v=0.2`).sort();
  check('le clic charge l’extension : ses quatre fichiers, avec la version du registre, une seule fois', JSON.stringify(asked.slice().sort()) === JSON.stringify(expected), asked);
  check('la fenêtre du graphique s’ouvre dans le panneau, sans la fenêtre « passer par GFS »', (await chartWindowOpen(page)) && windowBox.found && windowBox.inPanel && !(await dialogState(page)).open, { windowBox });
  await snap(page, `heberge-${lang}-${colorScheme}-1-fenetre`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Échap la ferme', !(await chartWindowOpen(page)), null);
  await clickRow(ROW);
  await page.waitForFunction(() => { const m = document.getElementById('pp-chart-modal'); return !!m && m.style.display !== 'none' && m.getBoundingClientRect().height > 0; }, null, { timeout: 15000 }).catch(() => {});
  check('rouvrir la fenêtre ne recharge aucun fichier', JSON.stringify(extensionRequests(requests).sort()) === JSON.stringify(expected), extensionRequests(requests));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('aucune erreur de chargement, aucune boîte du navigateur', natives.length === 0, natives);
  void seen; void click;
  await context.close();
}

// Hébergé : l'événement `extensions` de GFS retiré puis renvoyé fait passer la ligne et le cadre de grisés à actifs et inversement.
async function runHostedEvents(lang, colorScheme) {
  tag = `[événements ${lang} ${colorScheme}] `;
  const t = TEXTS[lang];
  const { page, requests, context } = await openPage({ hosted: true, stub: { extensions: ['graphique'] }, starId: 1, colorScheme, lang });
  const { hit, seen, openMenu, closeMenu } = toolsOf(page);
  await page.evaluate(() => GfsLink.ready);
  await page.waitForFunction(() => Extensions.isLoaded('graphique'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(selector => { const f = document.querySelector(selector); return !!f && !f.classList.contains('editor-image-chart-off'); }, FRAME, { timeout: 5000 }).catch(() => {});
  const active = await frameState(page);
  check('le modèle qui porte un graphique, extension active : l’extension se charge pour le cadre, qui n’est pas grisé', !!active && !active.off && active.name === 'Ventes par mois' && active.title === '' && extensionRequests(requests).length === FILES.length, { active, asked: extensionRequests(requests) });
  await openMenu();
  const rowOn = await rowState(page);
  check('la ligne du menu est active', rowOn.ariaDisabled === 'false' && !rowOn.greyClass && !rowOn.title, rowOn);
  await closeMenu();
  // GFS retire l'extension (la personne l'a désactivée) : l'événement `extensions` arrive sans elle.
  await page.evaluate(() => window.__gfsStub.setExtensions([]));
  await page.waitForTimeout(300);
  const off = await frameState(page);
  await openMenu();
  const rowOff = await rowState(page);
  const rowBox = await hit(ROW);
  check('l’événement sans l’extension grise le cadre (nom gardé, raison dite) sans recharger la page', !!off && off.off && off.name === 'Ventes par mois' && off.reason === t.reason && off.title === t.reason, off);
  check('… et la ligne du menu, qui reste à sa place avec sa raison', rowOff.ariaDisabled === 'true' && rowOff.greyClass && rowOff.title === t.reason && rowOff.index === 7 && seen(rowBox), { rowOff, rowBox });
  await snap(page, `evenements-${lang}-${colorScheme}-1-grise`);
  await closeMenu();
  // La personne la réactive : l'événement revient avec elle.
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await page.waitForTimeout(300);
  const back = await frameState(page);
  await openMenu();
  const rowBack = await rowState(page);
  check('l’événement qui la rend dégrise le cadre', !!back && !back.off && back.title === '' && back.name === 'Ventes par mois', back);
  check('… et la ligne du menu', rowBack.ariaDisabled === 'false' && !rowBack.greyClass && !rowBack.title, rowBack);
  await closeMenu();
  // Un événement qui ne change rien ne réveille personne : la page garde son état (ici, retirée deux fois de suite).
  const reload = await page.evaluate(() => window.__gfsStub.calls.map(c => c.nom));
  check('GFS n’a été interrogé qu’une fois (contexte) : le reste vient de ses événements', reload.filter(n => n === 'contexte').length === 1 && !reload.includes('installer'), reload);
  // L'adresse du widget vient du contexte seul (l'événement `extensions` n'en porte pas) : retiré puis renvoyé, l'événement ne l'a pas effacée.
  const address = await page.evaluate(() => ({ given: window.__gfsStub.adresseWidget, link: GfsLink.widgetAddress(), extensions: Extensions.widgetAddress() }));
  check('l’adresse du widget donnée par le contexte de GFS survit aux événements `extensions` (consigne 009)', address.given === 'https://gfs.example/gfs/index.html' && address.link === address.given && address.extensions === address.given, address);
  await context.close();
}

// Hébergé, extension non activée dans GFS : le clic demande son installation à GFS (sa fenêtre), sans fenêtre du widget.
async function runHostedInactive(lang, colorScheme) {
  tag = `[inactive ${lang} ${colorScheme}] `;
  const t = TEXTS[lang];
  // Un GFS qui ne donne pas l'adresse du widget (`adresseWidget` nul dans son contexte) : le widget n'en garde aucune.
  const { page, requests, context } = await openPage({ hosted: true, stub: { extensions: [], adresseWidget: null }, starId: 2, colorScheme, lang });
  const { clickRow, openMenu, closeMenu } = toolsOf(page);
  await page.evaluate(() => GfsLink.ready);
  const noAddress = await page.evaluate(() => ({ link: GfsLink.widgetAddress(), extensions: Extensions.widgetAddress() }));
  check('un contexte sans adresse du widget n’en laisse aucune (le graphique prend alors celle de sa page)', noAddress.link === '' && noAddress.extensions === '', noAddress);
  await openMenu();
  const row = await rowState(page);
  check('extension non activée dans GFS : la ligne est grisée avec sa raison', row.ariaDisabled === 'true' && row.greyClass && row.title === t.reason, row);
  await closeMenu();
  await clickRow(ROW);
  const calls = await page.evaluate(() => window.__gfsStub.calls.filter(c => c.nom === 'installer'));
  const dialog = await dialogState(page);
  check('son clic demande à GFS d’ouvrir son installation : `installer` avec l’identifiant de l’extension, une seule fois', calls.length === 1 && calls[0].args && calls[0].args.extension === 'graphique', calls);
  check('… et le widget n’ouvre aucune fenêtre de son côté, ne charge aucun fichier du graphique', !dialog.open && !(await chartWindowOpen(page)) && chartTraffic(requests).length === 0, { dialog, traffic: chartTraffic(requests) });
  // La personne l'active dans la fenêtre de GFS : l'événement arrive, la ligne s'allume.
  await page.evaluate(() => window.__gfsStub.setExtensions(['graphique']));
  await page.waitForTimeout(300);
  await openMenu();
  const rowOn = await rowState(page);
  check('l’événement qui suit l’installation allume la ligne', rowOn.ariaDisabled === 'false' && !rowOn.greyClass, rowOn);
  await closeMenu();
  await context.close();
}

// Hébergé, mais GFS ne répond pas (l'adresse porte `gfs=` et le cadre parent se tait) : au bout des 5 secondes du contexte la fonction est grisée, et le clic ouvre la fenêtre simple.
async function runHostedSilent(lang, colorScheme) {
  tag = `[muet ${lang} ${colorScheme}] `;
  const t = TEXTS[lang];
  const { page, requests, context } = await openPage({ hosted: true, stub: { ignoreContext: true }, starId: 1, colorScheme, lang });
  const { clickRow, openMenu, closeMenu } = toolsOf(page);
  const before = Date.now();
  await page.evaluate(() => GfsLink.ready);
  const waited = Date.now() - before;
  check('sans réponse de GFS, le widget n’attend pas plus de 5 secondes le contexte', waited < 6500, waited);
  const silentAddress = await page.evaluate(() => GfsLink.widgetAddress());
  check('… et n’a aucune adresse de GFS (celle de sa page fait foi)', silentAddress === '', silentAddress);
  const frame = await frameState(page);
  await openMenu();
  const row = await rowState(page);
  check('la fonction est grisée (ligne et cadre), jamais cachée', row.ariaDisabled === 'true' && row.greyClass && row.title === t.reason && !!frame && frame.off && frame.name === 'Ventes par mois', { row, frame });
  await closeMenu();
  await clickRow(ROW);
  const dialog = await dialogState(page);
  const calls = await page.evaluate(() => window.__gfsStub.calls.map(c => c.nom));
  check('le clic ouvre la fenêtre simple (pas `installer`, que personne n’entendrait)', dialog.open && dialog.title === t.title && !calls.includes('installer'), { dialog, calls });
  check('rien du graphique n’est chargé', chartTraffic(requests).length === 0, chartTraffic(requests));
  await page.keyboard.press('Escape');
  await context.close();
}

try {
  await runStandalone('fr', 'light');
  await runStandalone('en', 'dark');
  await runHostedActive('en', 'dark');
  await runHostedEvents('fr', 'light');
  await runHostedInactive('fr', 'dark');
  await runHostedSilent('en', 'light');
} catch (e) {
  failures++; total++;
  console.log('  FAIL - le parcours s’est arrêté : ' + (e && e.message ? e.message.split('\n')[0] : e));
}

tag = '';
check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
