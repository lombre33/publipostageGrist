#!/usr/bin/env node
// Format de page libre (ligne « Format libre… » du menu Page, fenêtre en centimètres, js/page-size-dialog.js) à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard ;
// Node/Playwright), à la taille du panneau Grist d'Antoine (~700x400), en thème clair puis sombre : la ligne du menu (septième, atteignable, lisible), un vrai clic l'ouvre et elle tient
// dans le panneau sans défiler, la frappe met à jour la taille, le sens et la feuille d'aperçu, une saisie mauvaise ou hors bornes se dit sous le champ (filet rouge, « Valider » grisé,
// toujours sans défiler), « Valider » pose la page (feuille de la largeur demandée, mesurée aux PIXELS d'une vraie capture), l'enregistrement automatique écrit la clé `format` en une
// seule écriture, la Lecture suit, la zone d'en-tête d'une page basse est grisée et ne s'ouvre pas, le clavier (Tab, Entrée, Maj+Tab, Échap) parcourt le menu puis la fenêtre et rend
// le focus à la ligne, l'assemblage avant impression remplit la feuille d'étiquettes ou refuse une page qui ne tient ni sur A4 ni sur A3 (message, « Générer » grisé), et l'anglais tient.
// dev-tests/scenarios-page-size.js vérifie le reste DANS la page (conversions, PDF, Word, enregistrement, Lecture, pagination...) ; ici, chaque geste est un vrai geste.
// Lancé par run-headless.mjs (groupe Node "pageSizeMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-page-size-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.PAGE_SIZE_MOUSE_PORT || 8970);
const WIDTH = 700;
const HEIGHT = 400;
// Captures d'écran (menu, fenêtre, fenêtre en erreur, assemblage, en clair et en sombre) : un dossier temporaire, ou PAGE_SIZE_SHOTS pour les garder.
const SHOTS = process.env.PAGE_SIZE_SHOTS || mkdtempSync(join(tmpdir(), 'page-size-'));
mkdirSync(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-access-rights-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-page-size-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const pageErrors = [];

async function openWidget(colorScheme) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  // Boîtes du navigateur (alert/confirm) : acceptées et consignées, jamais bloquantes.
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept().catch(() => {}); });
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
  // Semé avant le démarrage : un modèle classique « Contrat » enregistré et ouvert par défaut, une ligne de données ; AUCUN réglage de droits, donc tous les droits.
  await page.addInitScript(() => {
    window.__preSeedGristStub = (stub) => {
      stub.setVariables('Clients', { Nom: 'Text' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      // Assez long pour passer sur plusieurs pages dans les deux sens, avec un tableau pour voir la largeur de la page.
      const paras = Array.from({ length: 100 }, (_, i) => '<p>Ligne ' + i + ' du contrat de location, rédigée pour que le modèle tienne sur plusieurs pages.</p>').join('');
      m.Contenu.push('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>, voici le contrat de location.</p>'
        + '<table><tbody><tr><td><p>Désignation</p></td><td><p>Quantité</p></td><td><p>Prix</p></td></tr></tbody></table>' + paras);
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  });
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  return { context, page, dialogs };
}


// Centre d'un élément et est-il entièrement dans le panneau ?
async function boxOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height,
      inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  }, selector);
}

// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, selector) {
  const b = await boxOf(page, selector);
  if (!b) return null;
  await page.mouse.move(b.x - 6, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.click(b.x, b.y);
  return b;
}

// La feuille telle que la voit la personne : son rectangle à l'écran (facteur d'ajustement compris), sa largeur de mise en page (rectangle / facteur), le
// panneau qui la contient, le nombre de sauts de page tracés et le débordement horizontal de la PAGE (et non du conteneur, qui a son propre défilement).
const sheetOf = (page, scope) => page.evaluate((scope) => {
  const container = document.getElementById(scope === 'reader' ? 'reader-container' : 'editor-container');
  const sheet = scope === 'reader' ? container.querySelector('.reader-content') : container.querySelector('.v2-page-sheet');
  if (!sheet) return null;
  const r = sheet.getBoundingClientRect();
  const c = container.getBoundingClientRect();
  const zoom = parseFloat(getComputedStyle(sheet).zoom) || 1;
  return {
    left: r.left, right: r.right, top: r.top, width: r.width, layoutWidth: r.width / zoom, zoom,
    container: { left: c.left, right: c.right, top: c.top, bottom: c.bottom, clientWidth: container.clientWidth, scrollWidth: container.scrollWidth },
    breaks: container.querySelectorAll('.v2-page-break-line').length,
    pageOverflowX: document.documentElement.scrollWidth - window.innerWidth,
    landscape: PageLayout.isLandscape(),
  };
}, scope);

// Étendue du BLANC pur de la feuille sur une ligne de vraie capture d'écran (comme dev-tests/verify-small-panel.mjs, la capture est décodée dans la page) :
// le fond de l'espace de travail autour de la feuille est gris clair ou sombre, jamais blanc pur. Une ligne dans la marge haute de la feuille (vide) donne
// ses deux bords tels qu'ils sont peints, et donc coupés si un conteneur rognait la feuille.
async function whiteExtent(page, y, x0, x1) {
  const png = await page.screenshot({ clip: { x: Math.max(0, Math.floor(x0)), y: Math.floor(y), width: Math.floor(Math.min(x1, WIDTH) - Math.max(0, x0)), height: 1 } });
  return page.evaluate(async ({ b64, offset }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, 1).data;
    let first = -1, last = -1;
    for (let x = 0; x < c.width; x++) {
      if (d[x * 4] >= 253 && d[x * 4 + 1] >= 253 && d[x * 4 + 2] >= 253) { if (first < 0) first = x; last = x; }
    }
    return first < 0 ? null : { left: first + offset, right: last + offset + 1 };
  }, { b64: png.toString('base64'), offset: Math.max(0, Math.floor(x0)) });
}

// Vrai survol : la souris rejoint le centre en quelques pas.
async function hoverBox(page, selector) {
  const b = await boxOf(page, selector);
  await page.mouse.move(b.x - 6, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  return b;
}

const within = (a, b, tol) => Math.abs(a - b) <= tol;
const stored = page => page.evaluate(() => {
  const s = window.__gristStub;
  const row = s.getRow('Publipostage_Modeles', 1);
  return { margins: row.Margins, writes: s.countActions('UpdateRecord', 'Publipostage_Modeles') };
});


// Le menu Page : position, lignes (nom, dimensions, coche, grisé), et si chaque ligne est atteignable (rien ne la recouvre à son centre).
const pageMenu = page => page.evaluate(() => {
  const fly = document.getElementById('v2-page-flyout');
  const btn = document.getElementById('btn-page-orientation');
  const cs = getComputedStyle(fly);
  const r = fly.getBoundingClientRect();
  const rows = Array.from(fly.querySelectorAll('.v2-hover-row-check')).map(row => {
    const rr = row.getBoundingClientRect();
    const hit = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2);
    return {
      key: row.getAttribute('data-page-orientation') || row.getAttribute('data-page-format'), x: rr.left + rr.width / 2, y: rr.top + rr.height / 2, w: rr.width, h: rr.height,
      checked: row.getAttribute('aria-checked'), disabled: row.getAttribute('aria-disabled'), tab: row.tabIndex,
      hit: !!hit && (hit === row || row.contains(hit)), name: row.querySelector('.v2-page-row-name').textContent, size: (row.querySelector('.v2-page-row-size') || { textContent: '' }).textContent,
    };
  });
  return {
    display: cs.display, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, expanded: btn.getAttribute('aria-expanded'),
    title: document.getElementById('v2-page-flyout-label').textContent, rows,
    inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
  };
});

// Contraste (WCAG) du texte d'un élément contre le premier fond opaque qu'il traverse en remontant.
const contrastOf = (page, selector) => page.evaluate((sel) => {
  const nums = c => (c.match(/-?[\d.]+/g) || []).map(Number);
  const rgba = c => { const n = nums(c); return c.indexOf('color(') === 0 ? { r: n[0] * 255, g: n[1] * 255, b: n[2] * 255, a: n.length > 3 ? n[3] : 1 } : { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const el = document.querySelector(sel);
  if (!el) return null;
  const fg = rgba(getComputedStyle(el).color);
  let node = el; let bg = { r: 255, g: 255, b: 255, a: 1 };
  while (node) { const c = rgba(getComputedStyle(node).backgroundColor); if (c.a > .99) { bg = c; break; } node = node.parentElement; }
  const a = lum(fg), b = lum(bg);
  return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), fg: getComputedStyle(el).color, bg: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')' };
}, selector);

// Survole le bouton Page, descend tout droit jusqu'à la ligne demandée (le menu reste ouvert tout du long) et clique.
async function pickRow(page, key) {
  const btn = await boxOf(page, '#btn-page-orientation');
  await page.mouse.move(btn.x - 8, btn.y - 4, { steps: 2 });
  await page.mouse.move(btn.x, btn.y, { steps: 3 });
  await page.waitForTimeout(200);
  const menu = await pageMenu(page);
  const row = menu.rows.find(r => r.key === key);
  if (!row) throw new Error('ligne introuvable : ' + key);
  await page.mouse.move(btn.x, row.y, { steps: 8 });
  await page.mouse.move(row.x, row.y, { steps: 3 });
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(1000);
  return menu;
}
const away = async (page) => { await page.mouse.move(350, 345, { steps: 6 }); await page.waitForTimeout(250); };
const inEditor = (page) => page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest && !!a.closest('.ProseMirror'); });
const formatNow = (page) => page.evaluate(() => ({ format: PageLayout.getFormat(), landscape: PageLayout.isLandscape() }));

const MM = 96 / 25.4; // pixels de mise en page par millimètre
const WIN = '#pp-pagesize-modal';
const OK_BUTTON = `${WIN} .var-modal-primary`;
const CANCEL_BUTTON = `${WIN} .var-modal-actions button:not(.var-modal-primary):not(.pp-pagesize-save)`;

const winOpen = page => page.evaluate(() => { const m = document.getElementById('pp-pagesize-modal'); return !!m && getComputedStyle(m).display !== 'none'; });
// Ce que la fenêtre montre : textes, champs (valeur, erreur), aperçu (feuille dessinée dans son cadre), boutons, élément qui a le focus.
const winState = page => page.evaluate(() => {
  const m = document.getElementById('pp-pagesize-modal');
  const q = s => m.querySelector(s);
  const w = q('#pp-pagesize-width'), h = q('#pp-pagesize-height');
  const sheetEl = q('.pp-pagesize-sheet');
  const sheet = sheetEl.getBoundingClientRect(), stage = q('.pp-pagesize-stage').getBoundingClientRect();
  const err = q('#pp-pagesize-error');
  const ok = q('.var-modal-primary'), cancel = q('.var-modal-actions button:not(.var-modal-primary):not(.pp-pagesize-save)');
  const a = document.activeElement;
  return {
    open: getComputedStyle(m).display !== 'none', title: q('h3').textContent, labels: Array.from(m.querySelectorAll('.pp-pagesize-label')).map(l => l.textContent),
    width: w.value, height: h.value, invalid: [w.getAttribute('aria-invalid') === 'true', h.getAttribute('aria-invalid') === 'true'],
    error: err.hidden ? '' : err.textContent, hint: q('#pp-pagesize-hint').textContent, caption: q('.pp-pagesize-caption').textContent, orientation: q('.pp-pagesize-orientation').textContent,
    sheet: { w: parseFloat(sheetEl.style.width), h: parseFloat(sheetEl.style.height), inStage: sheet.left >= stage.left - .5 && sheet.right <= stage.right + .5 && sheet.top >= stage.top - .5 && sheet.bottom <= stage.bottom + .5 },
    okDisabled: ok.disabled, okText: ok.textContent, cancelText: cancel.textContent,
    focus: !a || a === document.body ? 'body' : (a.id || a.textContent || a.tagName),
    selected: a === w ? [w.selectionStart, w.selectionEnd, w.value.length] : a === h ? [h.selectionStart, h.selectionEnd, h.value.length] : null,
  };
});
// La fenêtre tient dans le panneau : aucun défilement dans son corps, son cadre entier dans la vue, aucun texte coupé dans sa colonne.
const winFits = page => page.evaluate(() => {
  const m = document.getElementById('pp-pagesize-modal');
  const body = m.querySelector('.pp-modal-body');
  const r = m.querySelector('.modal-content').getBoundingClientRect();
  const clipped = Array.from(m.querySelectorAll('.pp-pagesize-note, .pp-pagesize-caption, .pp-pagesize-label, .pp-pagesize-orientation, button')).filter(e => !e.hidden && e.getClientRects().length && e.scrollWidth > e.clientWidth + 1).map(e => e.className || e.tagName);
  return { scrollH: body.scrollHeight, clientH: body.clientHeight, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), clipped,
    ok: body.scrollHeight <= body.clientHeight + 1 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && clipped.length === 0 };
});
// L'élément est dans le panneau et au premier plan (rien d'autre à son centre).
const seenBox = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!top && (top === el || el.contains(top));
}, selector);
// Contraste (WCAG) d'une couleur d'un élément (`color` ou `borderTopColor`) contre le premier fond opaque trouvé en remontant (à partir du parent pour une bordure).
const ratioOf = (page, selector, prop) => page.evaluate(({ sel, prop }) => {
  const nums = c => (c.match(/-?[\d.]+/g) || []).map(Number);
  const rgba = c => { const n = nums(c); return c.indexOf('color(') === 0 ? { r: n[0] * 255, g: n[1] * 255, b: n[2] * 255, a: n.length > 3 ? n[3] : 1 } : { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const el = document.querySelector(sel);
  if (!el) return null;
  const fg = rgba(getComputedStyle(el)[prop]);
  let node = prop === 'color' ? el : el.parentElement; let bg = { r: 255, g: 255, b: 255, a: 1 };
  while (node) { const c = rgba(getComputedStyle(node).backgroundColor); if (c.a > .99) { bg = c; break; } node = node.parentElement; }
  const a = lum(fg), b = lum(bg);
  return Math.round((Math.max(a, b) + .05) / (Math.min(a, b) + .05) * 100) / 100;
}, { sel: selector, prop: prop || 'color' });
const dangerColor = page => page.evaluate(() => { const t = document.createElement('i'); t.style.color = 'var(--danger)'; document.body.appendChild(t); const c = getComputedStyle(t).color; t.remove(); return c; });
const borderOf = (page, selector) => page.evaluate(sel => getComputedStyle(document.querySelector(sel)).borderTopColor, selector);

// Un clic de vraie souris dans la zone de marge d'en-tête (haut de la feuille) ; vrai si la zone d'en-tête s'est ouverte en édition.
const center = (page, sel) => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
async function clickHeaderZone(page) {
  const sel = '#editor-container .v2-page-edge-top';
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
  await page.waitForTimeout(250);
  const c = await center(page, sel);
  const landed = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return !!(el && (el.closest('.v2-hf-zone') || el.classList.contains('tiptap') || el.classList.contains('v2-page-sheet'))); }, c);
  await page.mouse.move(c.x, c.y); await page.waitForTimeout(80);
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(350);
  return { landed, editing: await page.evaluate(() => Editor.isEditingHeaderFooter()) };
}
async function clickHeaderDone(page) {
  const c = await center(page, '#v2-hf-btn-done');
  await page.mouse.move(c.x, c.y); await page.waitForTimeout(80);
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(350);
  return page.evaluate(() => !Editor.isEditingHeaderFooter() && !document.getElementById('v2-hf-pill'));
}

// Ouvre la fenêtre par un vrai clic sur la ligne « Format libre… », puis attend qu'elle soit là.
async function openWindowByMouse(page) {
  await pickRow(page, 'custom');
  await page.waitForFunction(() => { const m = document.getElementById('pp-pagesize-modal'); return !!m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
}
// Triple clic de vraie souris dans un champ, visé à sa place du moment (la fenêtre se recentre quand un message s'affiche) : tout son texte est sélectionné.
async function tripleClick(page, selector) {
  const b = await boxOf(page, selector);
  await page.mouse.click(b.x, b.y, { clickCount: 3 });
}
// Écrit une taille en cm au vrai clavier : triple clic dans le champ (tout sélectionner), frappe, Tab, frappe.
async function typeSizeByKeyboard(page, widthText, heightText) {
  for (const [id, text] of [['#pp-pagesize-width', widthText], ['#pp-pagesize-height', heightText]]) {
    await tripleClick(page, id);
    await page.keyboard.type(text);
  }
}
async function confirmByMouse(page) {
  await realClick(page, OK_BUTTON);
  await page.waitForTimeout(900);
  await away(page);
}
const checkedKeys = menu => menu.rows.filter(r => r.checked === 'true').map(r => r.key).join();
const exportRow = '#v2-btn-export-pdf-sheets';
// Survol réel du bouton « Exporter en PDF », clic réel sur « Assemblage avant impression… », puis attente de la fenêtre.
async function openAssemblyByMouse(page) {
  const c = await boxOf(page, '#btn-export-pdf');
  await page.mouse.move(c.x - 30, c.y + 5, { steps: 3 });
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.waitForTimeout(450);
  await realClick(page, exportRow);
  await page.waitForFunction(() => { const m = document.getElementById('pp-sheets-modal'); return !!m && m.style.display !== 'none'; }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(250);
}
const assemblyState = page => page.evaluate(() => {
  const q = s => document.querySelector('#pp-sheets-modal ' + s);
  const body = q('.pp-modal-body');
  const box = q('.modal-content').getBoundingClientRect();
  const scaled = document.getElementById('pp-sheets-scaled');
  const ok = q('.var-modal-primary');
  return { open: document.getElementById('pp-sheets-modal').style.display !== 'none', summary: q('.pp-sheets-summary').textContent, scaled: scaled.hidden ? '' : scaled.textContent,
    slots: document.querySelectorAll('#pp-sheets-modal .pp-sheets-slot').length, okDisabled: ok.disabled, okText: ok.textContent,
    fits: body.scrollHeight <= body.clientHeight + 1 && box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth, scrollH: body.scrollHeight, clientH: body.clientHeight };
});

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Format de page libre à la vraie souris et au vrai clavier, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page, dialogs } = await openWidget(theme);
  const nativeDialogs = dialogs;

  // Départ : A4 portrait, Aperçu A4 allumé (vrai clic si besoin).
  const a4On = await page.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview'));
  if (!a4On) await realClick(page, '#v2-a4-toggle');
  await page.waitForTimeout(700);
  const start = await sheetOf(page, 'editor');
  check(`${label} - départ : A4 portrait, feuille de 793.71px de mise en page, dans le panneau`, !!start && within(start.layoutWidth, 793.71, 1) && start.left >= start.container.left - 1 && start.right <= start.container.right + 1, start);
  // Témoin : sur l'A4, un vrai clic dans la marge d'en-tête ouvre la zone d'en-tête (sans lui, le « rien ne se passe » de la page basse prouverait peu).
  const control = await clickHeaderZone(page);
  check(`${label} - A4 (témoin) : un vrai clic dans la marge d'en-tête ouvre la zone d'en-tête`, control.landed && control.editing, control);
  check(`${label} - A4 (témoin) : « Terminer » referme la zone, sans rien laisser`, await clickHeaderDone(page));

  // 1) La ligne « Format libre… » du menu Page : la septième, après A6, atteignable, lisible, sans taille tant que la page est un format de la liste.
  const btn = await boxOf(page, '#btn-page-orientation');
  await page.mouse.move(btn.x - 14, btn.y - 6, { steps: 2 });
  await page.mouse.move(btn.x, btn.y, { steps: 4 });
  await page.waitForTimeout(300);
  const menu0 = await pageMenu(page);
  const custom0 = menu0.rows.find(r => r.key === 'custom');
  const sizeDisplay0 = await page.evaluate(() => getComputedStyle(document.querySelector('#v2-btn-page-custom .v2-page-row-size')).display);
  check(`${label} - menu : « Format libre… » est la septième ligne, après A6, décochée, sans taille affichée, atteignable et assez haute (${custom0 && custom0.h.toFixed(1)}px)`,
    !!custom0 && menu0.rows.map(r => r.key).join() === 'portrait,landscape,A3,A4,A5,A6,custom' && custom0.name === 'Format libre…' && custom0.checked === 'false' && custom0.size === '' && sizeDisplay0 === 'none' && custom0.hit && custom0.h >= 24 && custom0.w >= 120 && menu0.inside, { custom0, sizeDisplay0 });
  const cCustom = await ratioOf(page, '#v2-btn-page-custom .v2-page-row-name', 'color');
  check(`${label} - menu : le texte de « Format libre… » se lit (contraste ${cCustom}:1, au moins 4,5:1)`, cCustom >= 4.5, cCustom);
  await page.screenshot({ path: SHOTS + '/menu-' + theme + '.png', clip: { x: 0, y: 0, width: WIDTH, height: 300 } });

  // 2) Un vrai clic sur la ligne ouvre la fenêtre, à la page courante : tout dans le panneau, sans défiler, le champ de la largeur au clavier et sélectionné.
  await page.mouse.move(btn.x, custom0.y, { steps: 10 });
  await page.mouse.move(custom0.x, custom0.y, { steps: 4 });
  await page.mouse.click(custom0.x, custom0.y);
  await page.waitForFunction(() => { const m = document.getElementById('pp-pagesize-modal'); return !!m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);
  const w0 = await winState(page);
  const fit0 = await winFits(page);
  check(`${label} - fenêtre : un vrai clic sur la ligne l'ouvre, titre « ${w0.title} », Largeur et Hauteur à la page courante (${w0.width} x ${w0.height})`,
    w0.open && w0.title === 'Format de page libre' && w0.labels.join() === 'Format,Largeur,Hauteur' && w0.width === '21' && w0.height === '29,7' && w0.caption === '21 × 29,7 cm' && w0.orientation === 'Portrait' && !w0.okDisabled && w0.error === '', w0);
  check(`${label} - fenêtre : elle tient dans ${WIDTH}x${HEIGHT} sans défiler (${fit0.scrollH}/${fit0.clientH}, ${fit0.top}-${fit0.bottom}) ; « Annuler » et « Valider » au premier plan`,
    fit0.ok && (await seenBox(page, OK_BUTTON)) && (await seenBox(page, CANCEL_BUTTON)) && w0.cancelText === 'Annuler' && w0.okText === 'Valider', { fit0, w0 });
  check(`${label} - fenêtre : le focus est dans le champ de la largeur, son texte sélectionné`, w0.focus === 'pp-pagesize-width' && w0.selected && w0.selected[0] === 0 && w0.selected[1] === w0.selected[2] && w0.selected[2] === 2, { focus: w0.focus, selected: w0.selected });
  check(`${label} - fenêtre : la feuille d'aperçu est celle d'un A4 portrait, dans son cadre (${w0.sheet.w.toFixed(1)} x ${w0.sheet.h.toFixed(1)})`, w0.sheet.inStage && within(w0.sheet.w / w0.sheet.h, 210 / 297, .03), w0.sheet);
  const textRatios = {};
  for (const [name, sel] of [['indication', '#pp-pagesize-hint'], ['unité', '.pp-pagesize-unit'], ['libellé', '.pp-pagesize-label'], ['taille', '.pp-pagesize-caption'], ['sens', '.pp-pagesize-orientation']]) textRatios[name] = await ratioOf(page, WIN + ' ' + sel, 'color');
  check(`${label} - fenêtre : chaque texte se lit (contrastes ${Object.entries(textRatios).map(([k, v]) => k + ' ' + v).join(', ')} ; au moins 4,5:1)`, Object.values(textRatios).every(v => v >= 4.5), textRatios);
  const menuAfterOpen = await pageMenu(page);
  check(`${label} - fenêtre : le menu Page s'est refermé sous le voile et l'ouverture n'a pas changé la page (${checkedKeys(menuAfterOpen)})`, menuAfterOpen.display === 'none' && checkedKeys(menuAfterOpen) === 'portrait,A4', { display: menuAfterOpen.display, checked: checkedKeys(menuAfterOpen) });
  await page.screenshot({ path: SHOTS + '/window-' + theme + '.png' });

  // 3) La frappe au vrai clavier : la taille, le sens et la feuille d'aperçu suivent ; Valider reste actif.
  await page.keyboard.type('7');
  await page.keyboard.press('Tab');
  const onHeight = await winState(page);
  await page.keyboard.type('3,7');
  const w1 = await winState(page);
  check(`${label} - frappe : Tab passe à la hauteur, texte sélectionné (${onHeight.focus}) ; « 7 » et « 3,7 » donnent « ${w1.caption} », ${w1.orientation}, feuille d'aperçu plus large que haute`,
    onHeight.focus === 'pp-pagesize-height' && onHeight.selected[0] === 0 && onHeight.selected[1] === onHeight.selected[2] && w1.caption === '7 × 3,7 cm' && w1.orientation === 'Paysage' && !w1.okDisabled && w1.error === ''
      && w1.sheet.inStage && within(w1.sheet.w / w1.sheet.h, 70 / 37, .03) && w1.sheet.w > w1.sheet.h, { onHeight, w1 });

  // 4) Une saisie mauvaise : filet rouge du champ, message sous les champs, Valider grisé, la feuille garde la dernière page valide, et la fenêtre tient toujours.
  await tripleClick(page, '#pp-pagesize-width');
  await page.keyboard.type('abc');
  const bad = await winState(page);
  const badFit = await winFits(page);
  const danger = await dangerColor(page);
  const badBorder = await borderOf(page, '#pp-pagesize-width');
  const okBorder = await borderOf(page, '#pp-pagesize-height');
  const borderRatio = await ratioOf(page, '#pp-pagesize-width', 'borderTopColor');
  const errorRatio = await ratioOf(page, '#pp-pagesize-error', 'color');
  const noteLeft = await page.evaluate(() => ({ error: document.getElementById('pp-pagesize-error').getBoundingClientRect().left, field: document.getElementById('pp-pagesize-width').getBoundingClientRect().left, labelLeft: document.querySelector('.pp-pagesize-label').getBoundingClientRect().left }));
  check(`${label} - saisie mauvaise (« abc ») : message « ${bad.error} », champ marqué invalide, « Valider » grisé, feuille et taille gardées sur la dernière page valide (${bad.caption})`,
    bad.error === 'Saisissez un nombre en centimètres, par exemple 10,5.' && bad.invalid[0] && !bad.invalid[1] && bad.okDisabled && bad.caption === '7 × 3,7 cm' && bad.sheet.inStage, bad);
  check(`${label} - saisie mauvaise : le champ prend le filet de la couleur d'erreur (${badBorder}), pas l'autre (${okBorder}), contraste de la bordure ${borderRatio}:1 (au moins 3:1) ; le message se lit (${errorRatio}:1)`,
    badBorder === danger && okBorder !== danger && borderRatio >= 3 && errorRatio >= 4.5, { badBorder, okBorder, danger, borderRatio, errorRatio });
  check(`${label} - saisie mauvaise : le message commence sous le champ, pas sous son libellé (${Math.round(noteLeft.error)} contre champ ${Math.round(noteLeft.field)}, libellé ${Math.round(noteLeft.labelLeft)})`, noteLeft.error >= noteLeft.field - 1, noteLeft);
  check(`${label} - saisie mauvaise : la fenêtre, message affiché, tient toujours dans ${WIDTH}x${HEIGHT} sans défiler (${badFit.scrollH}/${badFit.clientH}, ${badFit.top}-${badFit.bottom})`, badFit.ok, badFit);
  await page.screenshot({ path: SHOTS + '/window-error-' + theme + '.png' });
  // Entrée ne valide pas une saisie mauvaise (la fenêtre reste, le focus reste dans le champ fautif) ; un vrai clic sur « Valider » grisé ne fait rien non plus.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const enterBad = await winState(page);
  const okBox = await boxOf(page, OK_BUTTON);
  await page.mouse.click(okBox.x, okBox.y);
  await page.waitForTimeout(250);
  const clickBad = await winState(page);
  check(`${label} - saisie mauvaise : Entrée ne valide pas (focus gardé dans le champ fautif : ${enterBad.focus}) et un clic sur « Valider » grisé ne fait rien : la fenêtre reste ouverte, la page ne change pas`,
    enterBad.open && enterBad.focus === 'pp-pagesize-width' && clickBad.open && clickBad.okDisabled && (await formatNow(page)).format === 'A4', { enterBad, clickBad, fmt: await formatNow(page) });
  await tripleClick(page, '#pp-pagesize-width');
  await page.keyboard.type('60');
  const range = await winState(page);
  check(`${label} - hors bornes (« 60 ») : « ${range.error} » (bornes en centimètres, virgule française)`, range.error === 'La taille doit être comprise entre 2 et 55,88 cm.' && range.invalid[0] && range.okDisabled, range);
  await tripleClick(page, '#pp-pagesize-width');
  await page.keyboard.type('7');
  const fixed = await winState(page);
  check(`${label} - la correction (« 7 ») efface le message et le filet rouge, « Valider » est actif`, fixed.error === '' && !fixed.invalid[0] && !fixed.okDisabled && fixed.caption === '7 × 3,7 cm', fixed);

  // 5) Un vrai clic sur « Valider » : la fenêtre se ferme et la page de 7 x 3,7 cm est là, feuille de la largeur de 70 mm mesurée à l'écran et aux PIXELS d'une vraie capture.
  const writes0 = (await stored(page)).writes;
  await confirmByMouse(page);
  check(`${label} - Valider : la fenêtre est refermée`, !(await winOpen(page)));
  const label70 = await sheetOf(page, 'editor');
  const expected70 = 70 * MM;
  check(`${label} - Valider : feuille de ${expected70.toFixed(2)}px de mise en page (70 mm), entièrement dans le panneau (facteur ${label70 && label70.zoom.toFixed(3)}), page sans défilement horizontal, paysage`,
    !!label70 && within(label70.layoutWidth, expected70, 1) && label70.left >= label70.container.left - 1 && label70.right <= label70.container.right + 1 && label70.pageOverflowX <= 0 && label70.landscape, label70);
  const pixels70 = await whiteExtent(page, label70.top + 6, 0, WIDTH);
  check(`${label} - Valider : le blanc de la feuille peint par le navigateur a sa largeur (${pixels70 && (pixels70.right - pixels70.left)}px pour ${label70.width.toFixed(1)}px), du fond de chaque côté`,
    !!pixels70 && within(pixels70.right - pixels70.left, label70.width, 4) && pixels70.left > 20 && pixels70.right < WIDTH - 20, { pixels70, width: label70.width });
  check(`${label} - Valider : la page tient sur plus de pages qu'en A4 (${start.breaks} -> ${label70.breaks} sauts)`, label70.breaks > start.breaks, { start: start.breaks, free: label70.breaks });
  const afterMenu = await (async () => { await hoverBox(page, '#btn-page-orientation'); await page.waitForTimeout(300); return pageMenu(page); })();
  const customAfter = afterMenu.rows.find(r => r.key === 'custom');
  const sizeRatio = await ratioOf(page, '#v2-btn-page-custom .v2-page-row-size', 'color');
  check(`${label} - menu après Valider : « Format libre… » et Paysage cochés (${checkedKeys(afterMenu)}), la ligne dit « ${customAfter.size} » (contraste ${sizeRatio}:1), A4 décoché`,
    checkedKeys(afterMenu) === 'landscape,custom' && customAfter.size === '7 × 3,7 cm' && sizeRatio >= 4.5 && afterMenu.inside, { checked: checkedKeys(afterMenu), customAfter, sizeRatio });
  const texts = await page.evaluate(() => ({ button: document.getElementById('btn-page-orientation').getAttribute('aria-label'), pressed: document.getElementById('btn-page-orientation').getAttribute('aria-pressed'), tip: document.getElementById('v2-a4-toggle').getAttribute('data-tip') }));
  check(`${label} - la barre dit la page : « ${texts.button} », bouton allumé, case Aperçu « ${texts.tip} »`, texts.button === 'Page 7 × 3,7 cm en paysage (passer en portrait)' && texts.pressed === 'true' && texts.tip === 'Aperçu 7 × 3,7 cm', texts);
  await away(page);
  const closedMenu = await pageMenu(page);
  const focusInGroup = await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest && !!document.activeElement.closest('#v2-page-group'));
  check(`${label} - souris partie : le menu est refermé et rien du groupe Page n'a gardé le focus`, closedMenu.display === 'none' && !focusInGroup, { display: closedMenu.display, focusInGroup });
  await page.waitForTimeout(4200);
  const saved = await stored(page);
  const savedMargins = (() => { try { return JSON.parse(saved.margins || '{}'); } catch (e) { return null; } })();
  check(`${label} - l'enregistrement automatique écrit la page libre (« ${savedMargins && savedMargins.format} », ${savedMargins && savedMargins.orientation}, marges de 3 mm) dans la colonne Margins du modèle, en une seule écriture`,
    !!savedMargins && savedMargins.format === '37x70' && savedMargins.orientation === 'landscape' && [savedMargins.top, savedMargins.right, savedMargins.bottom, savedMargins.left].every(v => within(v, 3, .001)) && saved.writes === writes0 + 1, { saved, writes0 });

  // 6) Page basse (37 mm) : plus de place pour un en-tête ni un pied. La marge d'en-tête est grisée, jamais retirée, et un vrai clic dedans n'ouvre rien.
  const zone = await page.evaluate(() => { const z = document.querySelector('#editor-container .v2-page-edge-top'); const cs = getComputedStyle(z); return { locked: z.classList.contains('v2-hf-locked'), opacity: cs.opacity, pointer: cs.pointerEvents, present: true }; });
  const lowClick = await clickHeaderZone(page);
  check(`${label} - page de 37 mm : la zone d'en-tête est grisée (v2-hf-locked, opacité ${zone.opacity}), un vrai clic dans la marge d'en-tête n'ouvre pas la zone`, zone.locked && Number(zone.opacity) < 1 && zone.pointer === 'none' && lowClick.landed && !lowClick.editing, { zone, lowClick });
  await page.keyboard.press('Escape');

  // 7) Lecture : la feuille de la Lecture suit, repaginée comme l'éditeur.
  const editorBreaks = (await sheetOf(page, 'editor')).breaks;
  await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients'));
  await realClick(page, '#btn-mode-read');
  await page.waitForFunction(() => document.getElementById('reader-container').style.display === 'block' && !!document.querySelector('#reader-container .reader-content'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900);
  const reader = await sheetOf(page, 'reader');
  check(`${label} - Lecture : feuille de ${expected70.toFixed(2)}px de mise en page (70 mm), dans le panneau, repaginée comme l'éditeur (${reader && reader.breaks} sauts contre ${editorBreaks})`,
    !!reader && within(reader.layoutWidth, expected70, 1.5) && reader.left >= reader.container.left - 1 && reader.right <= reader.container.right + 1 && reader.pageOverflowX <= 0 && reader.breaks === editorBreaks, { reader, editorBreaks });
  await realClick(page, '#btn-mode-edit');
  await page.waitForTimeout(900);
  const backEdit = await sheetOf(page, 'editor');
  check(`${label} - retour en Édition : même feuille et mêmes sauts de page`, !!backEdit && within(backEdit.layoutWidth, expected70, .5) && backEdit.breaks === editorBreaks && backEdit.landscape, { backEdit, editorBreaks });

  // 8) Clavier : Tab traverse le menu jusqu'à « Format libre… » (cochée), Entrée ouvre la fenêtre ; Tab tourne dans la fenêtre ; Entrée dans un champ valide ; Échap ferme sans rien changer.
  await page.focus('#v2-toggle-a4-preview');
  const stops = [];
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Tab');
    stops.push(await page.evaluate(() => { const a = document.activeElement; return a.id || a.getAttribute('data-page-orientation') || a.getAttribute('data-page-format') || a.className; }));
    if (stops[stops.length - 1] === 'v2-btn-page-custom') break;
  }
  const ring = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), menu: getComputedStyle(document.getElementById('v2-page-flyout')).display, checked: document.activeElement.getAttribute('aria-checked') }; });
  check(`${label} - clavier : Tab arrive sur « Format libre… » après A6 (${stops.join(' > ')}), cochée, avec un trait de focus visible (${ring.style} ${ring.width}px), menu ouvert`,
    stops.join() === 'btn-page-orientation,portrait,landscape,A3,A4,A5,A6,v2-btn-page-custom' && ring.style !== 'none' && ring.width >= 2 && ring.menu === 'flex' && ring.checked === 'true', { stops, ring });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const kb0 = await winState(page);
  check(`${label} - clavier : Entrée sur la ligne ouvre la fenêtre sur la page libre (${kb0.width} x ${kb0.height}, ${kb0.orientation}), focus dans la largeur`, kb0.open && kb0.width === '7' && kb0.height === '3,7' && kb0.orientation === 'Paysage' && kb0.focus === 'pp-pagesize-width', kb0);
  // Un tour entier depuis la largeur : la hauteur, « Enregistrer ce format… », « Annuler », « Valider », puis, en tournant, la liste des formats (la corbeille, grisée tant qu'aucun format n'est
  // choisi, est sautée), la largeur et la hauteur de nouveau (le détail de la rangée « Format » est dans savedFormatsMouse).
  const order = [];
  for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); order.push((await winState(page)).focus); }
  check(`${label} - clavier : Tab tourne dans la fenêtre (${order.join(' > ')}), sans en sortir`, order.join() === 'pp-pagesize-height,Enregistrer ce format…,Annuler,Valider,— Choisir un format —,pp-pagesize-width,pp-pagesize-height', order);
  // Depuis la hauteur, Maj+Tab : la largeur, la liste, puis, en tournant, « Valider » ; Tab revient sur la liste puis la largeur.
  await page.keyboard.press('Shift+Tab');
  const reverseWidth = (await winState(page)).focus;
  await page.keyboard.press('Shift+Tab');
  const reverseList = (await winState(page)).focus;
  await page.keyboard.press('Shift+Tab');
  const reverse = (await winState(page)).focus;
  await page.keyboard.press('Tab');
  const forwardList = (await winState(page)).focus;
  await page.keyboard.press('Tab');
  const forward = (await winState(page)).focus;
  check(`${label} - clavier : Maj+Tab depuis la hauteur va à la largeur, à la liste puis revient sur « Valider » (${reverseWidth} > ${reverseList} > ${reverse}), et Tab retourne à la liste puis à la largeur (${forwardList} > ${forward})`,
    reverseWidth === 'pp-pagesize-width' && reverseList === '— Choisir un format —' && reverse === 'Valider' && forwardList === '— Choisir un format —' && forward === 'pp-pagesize-width', { reverseWidth, reverseList, reverse, forwardList, forward });
  await page.keyboard.press('Control+a');
  await page.keyboard.type('10');
  await page.keyboard.press('Tab');
  await page.keyboard.type('15');
  const kb1 = await winState(page);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const card = await sheetOf(page, 'editor');
  const cardNow = await formatNow(page);
  check(`${label} - clavier : « 10 » et « 15 » (aperçu « ${kb1.caption} », ${kb1.orientation}), Entrée dans le champ valide : fenêtre fermée, page de 10 x 15 cm en portrait, feuille de ${(100 * MM).toFixed(2)}px`,
    kb1.caption === '10 × 15 cm' && kb1.orientation === 'Portrait' && !(await winOpen(page)) && cardNow.format === '100x150' && !cardNow.landscape && !!card && within(card.layoutWidth, 100 * MM, 1), { kb1, cardNow, card });
  const afterKb = await page.evaluate(() => { const a = document.activeElement; return { id: a.id || a.tagName, inWindow: !!a.closest('#pp-pagesize-modal'), menu: getComputedStyle(document.getElementById('v2-page-flyout')).display, checked: Array.from(document.querySelectorAll('#v2-page-flyout .v2-hover-row-check')).filter(r => r.getAttribute('aria-checked') === 'true').map(r => r.getAttribute('data-page-orientation') || r.getAttribute('data-page-format')).join(), size: document.querySelector('#v2-btn-page-custom .v2-page-row-size').textContent }; });
  // Le menu se referme dès que le focus le quitte (la ligne qui avait ouvert la fenêtre est alors cachée) : le focus ne revient pas sur elle, comme pour « Filigrane… », mais il ne reste
  // pas dans la fenêtre fermée.
  check(`${label} - clavier : la fenêtre fermée ne garde pas le focus (${afterKb.id}) ; Portrait et « Format libre… » cochés, la ligne dit « ${afterKb.size} »`, !afterKb.inWindow && afterKb.checked === 'portrait,custom' && afterKb.size === '10 × 15 cm', afterKb);
  await page.focus('#v2-toggle-a4-preview');
  for (let i = 0; i < 9; i++) { await page.keyboard.press('Tab'); if ((await page.evaluate(() => document.activeElement.id)) === 'v2-btn-page-custom') break; }
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const spaceOpened = await winOpen(page);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('5');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const esc = await page.evaluate(() => ({ open: getComputedStyle(document.getElementById('pp-pagesize-modal')).display !== 'none', inWindow: !!document.activeElement.closest('#pp-pagesize-modal') }));
  check(`${label} - clavier : Espace sur la ligne ouvre la fenêtre, Échap la ferme sans rien changer (page ${(await formatNow(page)).format}) et sans garder le focus`, spaceOpened && !esc.open && !esc.inWindow && (await formatNow(page)).format === '100x150', { spaceOpened, esc, fmt: await formatNow(page) });
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await away(page);

  // 9) Assemblage avant impression : une étiquette de 7 x 3,7 cm remplit la feuille ; un format de 40 x 50 cm ne tient sur aucune feuille : message, « Générer » grisé, la fenêtre tient toujours.
  await openWindowByMouse(page);
  await typeSizeByKeyboard(page, '7', '3,7');
  await confirmByMouse(page);
  await openAssemblyByMouse(page);
  const sheetsLabel = await assemblyState(page);
  check(`${label} - assemblage, étiquette de 7 x 3,7 cm : « ${sheetsLabel.summary} » (${sheetsLabel.slots} emplacements), « Générer » actif, la fenêtre tient sans défiler (${sheetsLabel.scrollH}/${sheetsLabel.clientH})`,
    sheetsLabel.open && sheetsLabel.slots >= 2 && !sheetsLabel.okDisabled && sheetsLabel.fits && !/ne tient ni/.test(sheetsLabel.summary), sheetsLabel);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await away(page);
  await openWindowByMouse(page);
  await typeSizeByKeyboard(page, '40', '50');
  const big = await winState(page);
  check(`${label} - fenêtre : 40 x 50 cm est accepté (aperçu « ${big.caption} », ${big.orientation})`, big.caption === '40 × 50 cm' && big.orientation === 'Portrait' && !big.okDisabled && big.error === '', big);
  await confirmByMouse(page);
  const bigSheet = await sheetOf(page, 'editor');
  check(`${label} - 40 x 50 cm : feuille de ${(400 * MM).toFixed(2)}px de mise en page, facteur d'ajustement au plancher (${bigSheet && bigSheet.zoom.toFixed(3)}), le conteneur défile mais pas la page`,
    !!bigSheet && within(bigSheet.layoutWidth, 400 * MM, 1.5) && within(bigSheet.zoom, .5, .001) && bigSheet.container.scrollWidth > bigSheet.container.clientWidth && bigSheet.pageOverflowX <= 0, bigSheet);
  await openAssemblyByMouse(page);
  const sheetsBig = await assemblyState(page);
  await page.screenshot({ path: SHOTS + '/assembly-nofit-' + theme + '.png' });
  check(`${label} - assemblage, page de 40 x 50 cm : « ${sheetsBig.summary} », aucune note de réduction, « Générer » grisé, la fenêtre tient sans défiler (${sheetsBig.scrollH}/${sheetsBig.clientH})`,
    sheetsBig.open && sheetsBig.summary === 'Une page 40 × 50 cm ne tient ni sur A4 ni sur A3 : l’assemblage n’est pas possible.' && sheetsBig.scaled === '' && sheetsBig.slots === 0 && sheetsBig.okDisabled && sheetsBig.fits, sheetsBig);
  const summaryRatio = await ratioOf(page, '#pp-sheets-modal .pp-sheets-summary', 'color');
  check(`${label} - assemblage, page de 40 x 50 cm : le message se lit (contraste ${summaryRatio}:1)`, summaryRatio >= 4.5, summaryRatio);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await away(page);

  // 10) L'anglais : la fenêtre, ses messages et l'indication tiennent dans le panneau, la virgule est acceptée, la taille s'écrit avec le point.
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(300);
  await openWindowByMouse(page);
  const en = await winState(page);
  const enFit = await winFits(page);
  check(`${label} - anglais : « ${en.title} », Width / Height, « ${en.cancelText} » et « ${en.okText} », taille « ${en.caption} », la fenêtre tient sans défiler`,
    en.title === 'Custom page size' && en.labels.join() === 'Format,Width,Height' && en.cancelText === 'Cancel' && en.okText === 'Confirm' && en.width === '40' && en.height === '50' && en.caption === '40 × 50 cm' && enFit.ok, { en, enFit });
  await typeSizeByKeyboard(page, '7,5', 'abc');
  const enBad = await winState(page);
  const enBadFit = await winFits(page);
  check(`${label} - anglais : « ${enBad.error} », la virgule est acceptée (« 7,5 » -> ${enBad.caption}), la fenêtre tient sans défiler (${enBadFit.scrollH}/${enBadFit.clientH})`,
    enBad.error === 'Enter a number in centimeters, for example 10.5.' && enBad.invalid[1] && !enBad.invalid[0] && enBad.caption === '7.5 × 50 cm' && enBadFit.ok, { enBad, enBadFit });
  await typeSizeByKeyboard(page, '7,5', '60');
  const enRange = await winState(page);
  check(`${label} - anglais : « ${enRange.error} »`, enRange.error === 'The size must be between 2 and 55.88 cm.', enRange);
  await typeSizeByKeyboard(page, '7,5', '10');
  const enOk = await winState(page);
  check(`${label} - anglais : « 7,5 » et « 10 » s'écrivent « ${enOk.caption} » (point décimal)`, enOk.caption === '7.5 × 10 cm' && !enOk.okDisabled, enOk);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(300);
  await away(page);

  // 11) Retour à l'A4 par un vrai clic sur sa ligne : la feuille, les sauts et la ligne « Format libre… » (décochée, sans taille) comme au départ.
  await pickRow(page, 'portrait');
  await pickRow(page, 'A4');
  await away(page);
  const back = await sheetOf(page, 'editor');
  const backMenu = await (async () => { await hoverBox(page, '#btn-page-orientation'); await page.waitForTimeout(300); return pageMenu(page); })();
  check(`${label} - A4 par sa ligne : exactement la feuille et les sauts de page du départ, « Format libre… » décochée et sans taille (${checkedKeys(backMenu)})`,
    !!back && !back.landscape && within(back.layoutWidth, start.layoutWidth, .5) && back.breaks === start.breaks && checkedKeys(backMenu) === 'portrait,A4' && backMenu.rows.find(r => r.key === 'custom').size === '', { back, start, checked: checkedKeys(backMenu) });
  await away(page);
  const backZone = await clickHeaderZone(page);
  check(`${label} - A4 de nouveau : la zone d'en-tête s'ouvre au clic, comme au départ`, backZone.editing, backZone);
  await clickHeaderDone(page);
  check(`${label} - aucune boîte native (alert, confirm, prompt) n'a été ouverte`, nativeDialogs.length === 0, nativeDialogs);
  await context.close();
}

await runTheme('light');
await runTheme('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
