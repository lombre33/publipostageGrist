#!/usr/bin/env node
// « Tout le document » ou « Cette page » dans le menu du bouton Page d'un DOCUMENT, à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard ; Node/Playwright), à la taille du panneau Grist
// d'Antoine (~700x400), en français clair, français sombre puis anglais sombre (demande du 22/10 : une page en paysage et les autres en portrait, le bouton ayant « un mini menu pour savoir si le choix
// s'applique à tout le document ou à la page sélectionnée »). Le curseur est posé d'un vrai clic dans le texte de la 2e page ; le survol du bouton ouvre le menu, tout entier dans le panneau, avec le choix
// « Tout le document / Cette page » sous son titre (« Tout le document » retenu, chaque choix atteignable et lisible, contrastes) ; un vrai clic sur « Cette page » puis sur « Paysage » tourne cette page
// seule : la feuille prend la largeur de la plus large (mesurée aux PIXELS d'une vraie capture : le papier paysage est 1,414 fois plus large que le papier portrait), le curseur reste dans le panneau, deux
// sauts de page posés par le menu portent le sens, le bouton dit que les pages sont mêlées ; souris partie, le menu repart de « Tout le document » ; « Tout le document » + « Portrait » pose la question
// (annulée : rien ne bouge ; confirmée : plus aucune page tournée) ; un seul Ctrl + Z défait les sauts ; le clavier (Tab, Entrée, Espace) atteint le choix et le fait ; sans l'Aperçu de la page, « Cette
// page » est grisée avec sa raison et le sens de tout le document reste actif.
// dev-tests/scenarios-page-sections.js vérifie le reste DANS la page (plan des sauts, PDF, sélection sur plusieurs pages, tableau coupé, suivi des modifications...) ; ici, chaque geste est un vrai geste.
// Lancé par run-headless.mjs (groupe Node "pageScopeMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-page-scope-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.PAGE_SCOPE_MOUSE_PORT || 8913);
const WIDTH = 700;
const HEIGHT = 400;
// Captures d'écran (clair, sombre, anglais) : un dossier temporaire, ou PAGE_SCOPE_SHOTS pour les garder.
const SHOTS = process.env.PAGE_SCOPE_SHOTS || mkdtempSync(join(tmpdir(), 'page-scope-'));
mkdirSync(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-page-format-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-page-scope-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

async function openWidget(colorScheme, lang) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  // La page ne change plus de langue en route : l'anglais est une page qui DÉMARRE en anglais (la langue choisie est lue au démarrage, `pp_lang`).
  if (lang === 'en') await page.addInitScript(() => { try { localStorage.setItem('pp_lang', 'en'); } catch (e) { /* stockage refusé : la page reste en français */ } });
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  // Boîtes du navigateur (alert/confirm) : acceptées et consignées, jamais bloquantes ; la question du menu est celle du widget (js/dialogs.js), cliquée à la souris.
  page.on('dialog', d => { d.accept().catch(() => {}); });
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
  // Semé avant le démarrage : un document « Contrat » enregistré et ouvert par défaut, assez long pour tenir sur trois pages portrait ; AUCUN réglage de droits, donc tous les droits.
  await page.addInitScript(() => {
    window.__preSeedGristStub = (stub) => {
      stub.setVariables('Clients', { Nom: 'Text' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      const paras = Array.from({ length: 130 }, (_, i) => '<p>Ligne ' + i + ' du contrat de location, rédigée pour que le modèle tienne sur plusieurs pages.</p>').join('');
      m.Contenu.push('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>, voici le contrat de location.</p>' + paras);
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
  return { context, page };
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

const within = (a, b, tol) => Math.abs(a - b) <= tol;
const away = async (page) => { await page.mouse.move(350, 372, { steps: 6 }); await page.waitForTimeout(250); };

// Étendue du BLANC pur d'une ligne de vraie capture d'écran (comme dev-tests/verify-page-format-mouse.mjs : la capture est décodée dans la page).
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

// Le menu Page d'un document : sa place, le choix « Tout le document / Cette page » (texte, coche, grisé, info-bulle, atteignable à son centre) et les lignes de sens.
const scopeMenu = page => page.evaluate(() => {
  const fly = document.getElementById('v2-page-flyout');
  const cs = getComputedStyle(fly);
  const r = fly.getBoundingClientRect();
  const reach = el => { const rr = el.getBoundingClientRect(); const hit = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2); return !!hit && (hit === el || el.contains(hit)); };
  const choices = Array.from(fly.querySelectorAll('[data-page-scope]')).map(el => {
    const rr = el.getBoundingClientRect();
    return { key: el.getAttribute('data-page-scope'), x: rr.left + rr.width / 2, y: rr.top + rr.height / 2, w: rr.width, h: rr.height, text: el.textContent.trim(), checked: el.getAttribute('aria-checked'),
      disabled: el.getAttribute('aria-disabled'), title: el.getAttribute('title') || '', active: el.classList.contains('active'), hit: reach(el), tab: el.tabIndex };
  });
  const rows = Array.from(fly.querySelectorAll('.v2-hover-row-check[data-page-orientation]')).map(el => {
    const rr = el.getBoundingClientRect();
    return { key: el.getAttribute('data-page-orientation'), x: rr.left + rr.width / 2, y: rr.top + rr.height / 2, h: rr.height, checked: el.getAttribute('aria-checked'), disabled: el.getAttribute('aria-disabled'), hit: reach(el) };
  });
  const block = document.getElementById('v2-page-scope');
  return {
    display: cs.display, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, expanded: document.getElementById('btn-page-orientation').getAttribute('aria-expanded'),
    title: document.getElementById('v2-page-flyout-label').textContent, blockHidden: block ? block.hidden : null, choices, rows,
    inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
  };
});

// Où en est le document : le sens des marges, les sauts de page qui tournent, la feuille de l'éditeur et le curseur (est-il visible dans le panneau ?).
const docNow = page => page.evaluate(() => {
  const ec = document.getElementById('editor-container');
  const html = Editor.getHTML();
  const markers = html.match(/<div class="page-break-marker"[^>]*>/g) || [];
  const sheet = ec.querySelector('.v2-page-sheet');
  const sr = sheet ? sheet.getBoundingClientRect() : null;
  const zoom = sheet ? parseFloat(getComputedStyle(sheet).zoom) || 1 : 1;
  const view = EditorCore.getEditor().view;
  const head = EditorCore.getEditor().state.selection.head;
  const coords = view.coordsAtPos(head);
  const cr = ec.getBoundingClientRect();
  return {
    base: PageLayout.getOrientation(), turned: markers.filter(tag => tag.indexOf('data-page-orientation') !== -1).length, added: markers.filter(tag => tag.indexOf('data-page-added') !== -1).length,
    mixed: ec.classList.contains('pp-mixed-pages'), layoutWidth: sr ? sr.width / zoom : null, sheetLeft: sr ? sr.left : null, sheetRight: sr ? sr.right : null, zoom,
    cursorVisible: coords.top >= cr.top - 1 && coords.bottom <= cr.bottom + 1, label: document.getElementById('btn-page-orientation').getAttribute('aria-label'),
    pressed: document.getElementById('btn-page-orientation').getAttribute('aria-pressed'), scope: typeof OrientationToggle.getScope === 'function' ? OrientationToggle.getScope() : null, pageOverflowX: document.documentElement.scrollWidth - window.innerWidth,
  };
});

// La question du menu (js/dialogs.js : #pp-dialog-modal) : visible ? son titre, son texte, ses boutons (centre) et s'ils tiennent dans le panneau.
const dialogNow = page => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  if (!ov || getComputedStyle(ov).display === 'none') return null;
  const box = ov.querySelector('.pp-modal-box');
  const r = box.getBoundingClientRect();
  const buttons = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map(b => { const br = b.getBoundingClientRect(); return { text: b.textContent.trim(), x: br.left + br.width / 2, y: br.top + br.height / 2 }; });
  const title = ov.querySelector('.pp-modal-header, h3');
  return { title: title ? title.textContent.trim() : '', message: (ov.querySelector('.pp-modal-body, p') || { textContent: '' }).textContent.trim(), buttons, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
});

// Le curseur dans le texte de la 2e page, d'un vrai clic.
async function clickInPageTwo(page) {
  const target = await page.evaluate(() => {
    const brks = HeaderFooterPreview.pageBreaks();
    if (!brks.length) return null;
    const el = brks[0].afterEl.nextElementSibling;
    el.scrollIntoView({ block: 'center' });
    return true;
  });
  if (!target) return null;
  await page.waitForTimeout(300);
  const spot = await page.evaluate(() => {
    const el = HeaderFooterPreview.pageBreaks()[0].afterEl.nextElementSibling;
    const r = el.getBoundingClientRect();
    return { x: r.left + 30, y: r.top + r.height / 2, text: el.textContent.slice(0, 24) };
  });
  await page.mouse.click(spot.x, spot.y);
  await page.waitForTimeout(200);
  return spot;
}

// Survole le bouton Page ; le menu reste ouvert tant que la souris est dans le groupe.
async function hoverPageButton(page) {
  const btn = await boxOf(page, '#btn-page-orientation');
  await page.mouse.move(btn.x - 14, btn.y - 6, { steps: 2 });
  await page.mouse.move(btn.x, btn.y, { steps: 4 });
  await page.waitForTimeout(300);
  return btn;
}
// Un vrai clic sur un choix ou une ligne du menu ouvert : la souris descend du bouton (le menu reste ouvert tout du long) puis clique.
async function clickMenuItem(page, btn, item) {
  await page.mouse.move(btn.x, item.y, { steps: 8 });
  await page.mouse.move(item.x, item.y, { steps: 3 });
  await page.mouse.click(item.x, item.y);
  await page.waitForTimeout(700);
}

async function runPass(theme, lang) {
  const dark = theme === 'dark';
  const en = lang === 'en';
  const label = (dark ? 'sombre' : 'clair') + (en ? ', anglais' : '');
  const T = en
    ? { document: 'Whole document', page: 'This page', preview: 'Check “A4 preview” to turn a single page: it is what shows the pages.', confirmTitle: 'Whole document in portrait?', ok: 'All portrait', cancel: 'Cancel', mixed: 'A4 pages in portrait and landscape (set all to landscape)', portrait: 'Portrait', landscape: 'Landscape' }
    : { document: 'Tout le document', page: 'Cette page', preview: 'Cochez « Aperçu A4 » pour tourner une seule page : c’est lui qui montre les pages.', confirmTitle: 'Tout le document en portrait ?', ok: 'Tout en portrait', cancel: 'Annuler', mixed: 'Pages A4 en portrait et en paysage (tout mettre en paysage)', portrait: 'Portrait', landscape: 'Paysage' };
  console.log(`\n=== Orientation par page à la vraie souris et au vrai clavier, ${WIDTH}x${HEIGHT}, ${label} ===`);
  const { context, page } = await openWidget(theme, lang);

  // Départ : Aperçu A4 allumé (vrai clic si besoin), le document tient sur plusieurs pages.
  const a4On = await page.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview'));
  if (!a4On) await realClick(page, '#v2-a4-toggle');
  await page.waitForTimeout(800);
  const pages = await page.evaluate(() => HeaderFooterPreview.pageBreaks().length + 1);
  const start = await docNow(page);
  check(`${label} - départ : le document tient sur ${pages} pages portrait, aucun saut qui tourne, sens des marges portrait`, pages >= 3 && start.base === 'portrait' && start.turned === 0 && !start.mixed, { pages, start });
  const paper1Before = await page.evaluate(() => { const p = document.querySelector('#editor-container .v2-page-paper'); return p ? Math.round(p.getBoundingClientRect().width) : null; });

  // 1) Le curseur d'un vrai clic dans la 2e page ; le survol du bouton ouvre le menu, tout entier dans le panneau, avec le choix sous le titre.
  const spot = await clickInPageTwo(page);
  check(`${label} - un vrai clic pose le curseur dans le texte de la 2e page (« ${spot && spot.text} »)`, !!spot, spot);
  const btn = await hoverPageButton(page);
  const open = await scopeMenu(page);
  check(`${label} - le survol du bouton ouvre le menu Page sous la souris (aria-expanded « true ») et il tient tout entier dans le panneau (${Math.round(open.left)}-${Math.round(open.right)} x ${Math.round(open.top)}-${Math.round(open.bottom)})`,
    open.display === 'flex' && open.expanded === 'true' && open.inside, open);
  check(`${label} - sous le titre, deux choix : « ${T.document} » (retenu) et « ${T.page} » ; Portrait coché (la page du curseur est en portrait, le document aussi)`,
    open.blockHidden === false && open.choices.map(c => c.text).join('|') === T.document + '|' + T.page && open.choices[0].checked === 'true' && open.choices[0].active && open.choices[1].checked === 'false' && open.choices[1].disabled === 'false'
      && open.rows.find(r => r.key === 'portrait').checked === 'true' && open.rows.find(r => r.key === 'landscape').checked === 'false', open);
  check(`${label} - chaque choix est atteignable à la souris (rien ne le recouvre), assez haut (${Math.min(...open.choices.map(c => c.h)).toFixed(1)}px) et large (${Math.min(...open.choices.map(c => c.w)).toFixed(1)}px) pour le viser`, open.choices.every(c => c.hit && c.h >= 24 && c.w >= 80), open.choices);
  const cOff = await contrastOf(page, '#v2-page-flyout [data-page-scope="page"]');
  const cOn = await contrastOf(page, '#v2-page-flyout [data-page-scope="document"]');
  check(`${label} - contraste du choix non retenu (${cOff && cOff.ratio.toFixed(2)}:1) et du choix retenu (${cOn && cOn.ratio.toFixed(2)}:1) : au moins 4,5:1`, !!cOff && !!cOn && cOff.ratio >= 4.5 && cOn.ratio >= 4.5, { cOff, cOn });
  await page.screenshot({ path: SHOTS + '/menu-page-' + theme + (en ? '-en' : '') + '.png', clip: { x: 0, y: 0, width: WIDTH, height: 400 } });

  // 2) Un vrai clic sur « Cette page » : retenu ; Portrait reste coché (la page est en portrait) ; le menu ne se referme pas.
  await clickMenuItem(page, btn, open.choices[1]);
  const chosen = await scopeMenu(page);
  check(`${label} - vrai clic sur « ${T.page} » : le choix est retenu, le menu reste ouvert, Portrait est coché (la page du curseur) et le bouton n'a rien tourné`,
    chosen.display === 'flex' && chosen.choices[1].checked === 'true' && chosen.choices[0].checked === 'false' && chosen.rows.find(r => r.key === 'portrait').checked === 'true' && (await docNow(page)).turned === 0, chosen);
  await page.screenshot({ path: SHOTS + '/menu-page-cette-page-' + theme + (en ? '-en' : '') + '.png', clip: { x: 0, y: 0, width: WIDTH, height: 400 } });

  // 3) Un vrai clic sur « Paysage » : cette page seule tourne.
  const landscapeRow = chosen.rows.find(r => r.key === 'landscape');
  await clickMenuItem(page, btn, landscapeRow);
  await page.waitForTimeout(500);
  const turned = await docNow(page);
  const afterMenu = await scopeMenu(page);
  check(`${label} - vrai clic sur « ${T.landscape} » : deux sauts de page posés par le menu portent le sens (${turned.turned} qui tournent, ${turned.added} posés), le sens des marges reste portrait, les pages sont mêlées`,
    turned.turned === 2 && turned.added === 2 && turned.base === 'portrait' && turned.mixed, turned);
  check(`${label} - la feuille prend la largeur de la plus large page (${turned.layoutWidth && turned.layoutWidth.toFixed(1)}px de mise en page = 1122.5), entièrement dans le panneau, sans défilement horizontal de la page, et le curseur y reste visible`,
    within(turned.layoutWidth, 1122.52, 1.5) && turned.sheetLeft >= -1 && turned.sheetRight <= WIDTH + 1 && turned.pageOverflowX <= 0 && turned.cursorVisible, turned);
  check(`${label} - le menu est resté ouvert, « ${T.landscape} » est coché, « ${T.portrait} » ne l'est plus et « ${T.page} » reste retenu`,
    afterMenu.display === 'flex' && afterMenu.rows.find(r => r.key === 'landscape').checked === 'true' && afterMenu.rows.find(r => r.key === 'portrait').checked === 'false' && afterMenu.choices[1].checked === 'true', afterMenu);
  check(`${label} - le bouton dit que les pages sont mêlées (« ${turned.label} »)`, turned.label === T.mixed, turned.label);

  // 4) La même page, mesurée aux pixels : le papier paysage est 1,414 fois plus large que le papier portrait.
  await away(page);
  const papers = await page.evaluate(() => {
    const ec = document.getElementById('editor-container');
    ec.scrollTop = 0;
    return Array.from(ec.querySelectorAll('.v2-page-paper')).map(p => p.getBoundingClientRect().width);
  });
  await page.waitForTimeout(250);
  const topPaper = await page.evaluate(() => { const p = document.querySelector('#editor-container .v2-page-paper'); const r = p.getBoundingClientRect(); return { top: r.top, width: r.width }; });
  const portraitPx = await whiteExtent(page, topPaper.top + 6, 0, WIDTH);
  await page.evaluate(() => {
    const ec = document.getElementById('editor-container');
    const second = ec.querySelectorAll('.v2-page-paper')[1];
    ec.scrollTop += second.getBoundingClientRect().top - ec.getBoundingClientRect().top - 4;
  });
  await page.waitForTimeout(300);
  const landscapeTop = await page.evaluate(() => { const p = document.querySelectorAll('#editor-container .v2-page-paper')[1]; const r = p.getBoundingClientRect(); return { top: r.top, width: r.width, senseOk: !!p }; });
  const landscapePx = await whiteExtent(page, landscapeTop.top + 6, 0, WIDTH);
  const ratio = portraitPx && landscapePx ? (landscapePx.right - landscapePx.left) / (portraitPx.right - portraitPx.left) : null;
  check(`${label} - aux pixels d'une vraie capture : le papier de la page tournée est ${ratio && ratio.toFixed(3)} fois plus large que celui de la 1re page (1.414 attendu), et chacun a du fond de chaque côté`,
    ratio !== null && within(ratio, 1.4142, 0.03) && portraitPx.left > 2 && landscapePx.left >= 0, { ratio, portraitPx, landscapePx, papers: papers.map(Math.round), paper1Before });
  await page.screenshot({ path: SHOTS + '/page-tournee-' + theme + (en ? '-en' : '') + '.png' });

  // 5) Souris partie, le menu est refermé ; il repart de « Tout le document » quand on le rouvre.
  await away(page);
  const closed = await scopeMenu(page);
  await hoverPageButton(page);
  const reopened = await scopeMenu(page);
  check(`${label} - souris partie, le menu se referme ; rouvert, il repart de « ${T.document} » (« ${T.page} » ne vaut que le temps du survol), les pages restent mêlées`,
    closed.display === 'none' && reopened.display === 'flex' && reopened.choices[0].checked === 'true' && reopened.choices[1].checked === 'false' && (await docNow(page)).mixed, { closed: closed.display, reopened });
  // « Tout le document » d'un document aux pages mêlées : ni Portrait ni Paysage n'est coché (aucun sens n'est celui de tout le document).
  check(`${label} - « ${T.document} » d'un document aux pages mêlées : ni « ${T.portrait} » ni « ${T.landscape} » n'est coché`, reopened.rows.every(r => r.checked === 'false'), reopened.rows);

  // 6) « Tout le document » + « Portrait » : la question est posée ; annulée, rien ne bouge ; confirmée, plus aucune page tournée.
  const btn2 = await boxOf(page, '#btn-page-orientation');
  const portraitRow = reopened.rows.find(r => r.key === 'portrait');
  await clickMenuItem(page, btn2, portraitRow);
  await page.waitForTimeout(300);
  const ask = await dialogNow(page);
  check(`${label} - la question « ${T.confirmTitle} » est posée, dans le panneau, avec « ${T.cancel} » et « ${T.ok} »`,
    !!ask && ask.title === T.confirmTitle && ask.buttons.map(b => b.text).includes(T.cancel) && ask.buttons.map(b => b.text).includes(T.ok) && ask.inside, ask);
  await page.screenshot({ path: SHOTS + '/question-' + theme + (en ? '-en' : '') + '.png' });
  const cancel = ask && ask.buttons.find(b => b.text === T.cancel);
  if (cancel) { await page.mouse.move(cancel.x - 10, cancel.y, { steps: 2 }); await page.mouse.click(cancel.x, cancel.y); }
  await page.waitForTimeout(500);
  const afterCancel = await docNow(page);
  check(`${label} - « ${T.cancel} » : rien ne bouge (toujours ${afterCancel.turned} sauts qui tournent, pages mêlées, marges ${afterCancel.base})`, afterCancel.turned === 2 && afterCancel.mixed && afterCancel.base === 'portrait' && !(await dialogNow(page)), afterCancel);
  await away(page);
  const btn3 = await hoverPageButton(page);
  const again = await scopeMenu(page);
  await clickMenuItem(page, btn3, again.rows.find(r => r.key === 'portrait'));
  await page.waitForTimeout(300);
  const ask2 = await dialogNow(page);
  const confirm = ask2 && ask2.buttons.find(b => b.text === T.ok);
  if (confirm) { await page.mouse.move(confirm.x - 10, confirm.y, { steps: 2 }); await page.mouse.click(confirm.x, confirm.y); }
  await page.waitForTimeout(700);
  const afterOk = await docNow(page);
  check(`${label} - « ${T.ok} » : plus aucun saut ne tourne (${afterOk.turned}), les pages ne sont plus mêlées, la feuille a retrouvé la largeur du portrait (${afterOk.layoutWidth && afterOk.layoutWidth.toFixed(1)}px), marges ${afterOk.base}`,
    !!confirm && afterOk.turned === 0 && afterOk.added === 0 && !afterOk.mixed && within(afterOk.layoutWidth, 793.71, 1.5) && afterOk.base === 'portrait', afterOk);
  await away(page);

  // 7) Un seul Ctrl + Z défait les sauts posés par le menu : on les repose d'abord (Cette page + Paysage), puis le vrai clavier.
  await clickInPageTwo(page);
  const btn4 = await hoverPageButton(page);
  const menu4 = await scopeMenu(page);
  await clickMenuItem(page, btn4, menu4.choices[1]);
  await clickMenuItem(page, btn4, (await scopeMenu(page)).rows.find(r => r.key === 'landscape'));
  const turnedAgain = await docNow(page);
  await away(page);
  // Le focus revient dans le texte d'un vrai clic, puis Ctrl + Z.
  await clickInPageTwo(page);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  const undone = await docNow(page);
  check(`${label} - Cette page + Paysage de nouveau (${turnedAgain.turned} sauts), puis un seul Ctrl + Z : plus aucun saut ne tourne, les pages ne sont plus mêlées`, turnedAgain.turned === 2 && undone.turned === 0 && !undone.mixed, { turnedAgain, undone });
  await away(page);

  // 8) Le clavier : Tab du bouton Aperçu au bouton Page, puis le choix « Tout le document », « Cette page », Portrait, Paysage ; Entrée sur « Cette page » puis Tab jusqu'à Paysage et Entrée.
  await clickInPageTwo(page);
  await page.focus('#v2-toggle-a4-preview');
  const stops = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    stops.push(await page.evaluate(() => { const a = document.activeElement; return a.id || (a.getAttribute('data-page-scope') ? 'scope-' + a.getAttribute('data-page-scope') : '') || a.getAttribute('data-page-orientation') || a.className; }));
    if (stops[stops.length - 1] === 'landscape') break;
    if (stops[stops.length - 1] === 'scope-page') {
      const ring = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), menu: getComputedStyle(document.getElementById('v2-page-flyout')).display }; });
      check(`${label} - clavier : le choix « ${T.page} » a un trait de focus visible (${ring.style} ${ring.width}px) et le menu reste ouvert`, ring.style !== 'none' && ring.width >= 2 && ring.menu === 'flex', ring);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      const viaEnter = await scopeMenu(page);
      check(`${label} - clavier, Entrée sur « ${T.page} » : le choix est retenu (Portrait coché, le menu reste ouvert)`, viaEnter.choices[1].checked === 'true' && viaEnter.display === 'flex' && viaEnter.rows.find(r => r.key === 'portrait').checked === 'true', viaEnter);
    }
  }
  check(`${label} - clavier : Tab passe du bouton Page à « ${T.document} », « ${T.page} », Portrait puis Paysage (${stops.join(' > ')})`, stops.join() === 'btn-page-orientation,scope-document,scope-page,portrait,landscape', stops);
  await page.keyboard.press('Space');
  await page.waitForTimeout(700);
  const viaSpace = await docNow(page);
  check(`${label} - clavier, Espace sur Paysage : la page du curseur tourne seule (${viaSpace.turned} sauts, pages mêlées, marges ${viaSpace.base}), le curseur reste visible`, viaSpace.turned === 2 && viaSpace.mixed && viaSpace.base === 'portrait' && viaSpace.cursorVisible, viaSpace);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await away(page);
  await clickInPageTwo(page);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);

  // 9) Sans l'Aperçu de la page, « Cette page » est grisée, dit pourquoi (info-bulle) et ne se laisse pas choisir ; le sens de tout le document reste actif.
  await realClick(page, '#v2-a4-toggle');
  await page.waitForTimeout(600);
  await clickInPageTwo(page).catch(() => null);
  const btn5 = await hoverPageButton(page);
  const noPreview = await scopeMenu(page);
  const pageChoice = noPreview.choices[1];
  check(`${label} - sans l'Aperçu : « ${T.page} » est grisée (aria-disabled) avec sa raison en info-bulle, « ${T.document} » et les deux sens restent actifs`,
    pageChoice.disabled === 'true' && pageChoice.title === T.preview && noPreview.choices[0].disabled === 'false' && noPreview.rows.every(r => r.disabled === 'false'), { pageChoice, rows: noPreview.rows });
  await page.mouse.move(btn5.x, pageChoice.y, { steps: 8 });
  await page.mouse.move(pageChoice.x, pageChoice.y, { steps: 3 });
  await page.mouse.click(pageChoice.x, pageChoice.y);
  await page.waitForTimeout(300);
  const stillDocument = await scopeMenu(page);
  check(`${label} - un vrai clic sur « ${T.page} » grisée ne la retient pas : « ${T.document} » reste retenu`, stillDocument.choices[0].checked === 'true' && stillDocument.choices[1].checked === 'false', stillDocument.choices);
  await page.screenshot({ path: SHOTS + '/menu-sans-apercu-' + theme + (en ? '-en' : '') + '.png', clip: { x: 0, y: 0, width: WIDTH, height: 400 } });
  await away(page);
  await context.close();
}

await runPass('light', 'fr');
await runPass('dark', 'fr');
await runPass('dark', 'en');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
// Le lanceur (dev-tests/run-headless.mjs) lit le total à la TOUTE FIN de la sortie.
console.log('Captures : ' + SHOTS);
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
