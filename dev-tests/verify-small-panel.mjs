#!/usr/bin/env node
// Petit panneau Grist (600 à 800 x 400) à la VRAIE souris et au vrai clavier (page.mouse / page.keyboard, Node/Playwright), sur les défauts d'affichage
// relevés le 28/09 et corrigés ensemble (js/viewport-fit.js, css/toolbar-v2.css, positionnement des popups) :
//  - info-bulles de la barre du haut : entières dans la fenêtre, réellement visibles (pixels d'une vraie capture, pas une opacité calculée - trois
//    conteneurs en overflow:hidden les rognaient), page jamais décalable latéralement, et plus d'info-bulle "collée" après un clic suivi d'Échap ;
//  - mode email + Cci à 600x400 : texte de l'éditeur visible, page sans débordement vertical ;
//  - hauteur de la barre indépendante du message d'état (entre ~740 et 880px elle sautait de 33px à chaque auto-save) ;
//  - popups #Variable (éditeur et champs), fil de commentaires et "Image depuis une variable" tenus dans la fenêtre ;
//  - menus au survol (.v2-hover-group, dont Exporter en PDF et Image) : ils ne se referment plus quand la souris y descend lentement, et leurs boutons ne portent
//    plus de petit point bleu (29/09, css/editor-v2.css).
// Les scénarios de dev-tests/scenarios-*.js tournent DANS la page (dispatchEvent) : ni :hover réel, ni pixels, ni le :focus-visible qu'un vrai Échap
// déclenche. Lancé par run-headless.mjs (groupe Node "smallPanel", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-small-panel.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.SMALL_PANEL_PORT || 8898);

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-wheel-scroll.mjs.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/html2pdf\.bundle\.min\.js$/, 'umd/html2pdf.bundle.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-small-panel] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

async function openAt(width, height) {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('dialog', d => d.accept());
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
  await page.evaluate(() => { document.getElementById('editor-container').classList.add('a4-preview'); });
  return { browser, page };
}

// Info-bulle = le ::after d'un hôte [data-tip] (css/toolbar-v2.css) : absolute, left = celui que la CSS résout VRAIMENT (décalage compris),
// translateX(-50%). Rectangle en coordonnées fenêtre, calculé depuis les valeurs résolues du navigateur, jamais depuis la logique de js/viewport-fit.js.
const TIP_HOSTS = '.bar-row [data-tip], #v2-toolbar [data-tip]';
function tipRectInPage(id) {
  const host = document.getElementById(id);
  const r = host.getBoundingClientRect();
  const cs = getComputedStyle(host, '::after');
  const w = parseFloat(cs.width) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const h = parseFloat(cs.height) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const left = r.left + host.clientLeft + parseFloat(cs.left) - w / 2;
  const top = r.top + host.clientTop + parseFloat(cs.top);
  return { left, right: left + w, top, bottom: top + h, opacity: Number(cs.opacity) };
}
async function visibleTipHosts(page) {
  return page.evaluate((sel) => [...document.querySelectorAll(sel)].filter(el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || el.closest('.v2-hover-flyout') || el.disabled) return false;
    return r.bottom <= innerHeight && r.right <= innerWidth && r.left >= 0;
  }).map(el => { const r = el.getBoundingClientRect(); return { id: el.id, x: r.x + r.width / 2, y: r.y + r.height / 2 }; }).filter(o => o.id), TIP_HOSTS);
}
// Part de pixels sombres (fond de l'info-bulle : var(--text), #1b2430 en thème clair) dans un rectangle, sur une VRAIE capture d'écran - décodée dans la
// page (canvas) pour ne dépendre d'aucune bibliothèque PNG côté Node.
async function darkRatio(page, rect) {
  const vp = page.viewportSize();
  const x = Math.max(0, Math.ceil(rect.left) + 2), y = Math.max(0, Math.ceil(rect.top) + 2);
  const x2 = Math.min(vp.width, Math.floor(rect.right) - 2), y2 = Math.min(vp.height, Math.floor(rect.bottom) - 2);
  if (x2 - x < 4 || y2 - y < 4) return 0;
  const png = await page.screenshot({ clip: { x, y, width: x2 - x, height: y2 - y } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) < 80) dark++;
    return dark / (d.length / 4);
  }, png.toString('base64'));
}
// Couleur moyenne [r, g, b] d'un carré de VRAIE capture d'écran (décodée dans la page, comme darkRatio).
async function meanColor(page, x, y, w, h) {
  const png = await page.screenshot({ clip: { x, y, width: w, height: h } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const n = d.length / 4;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    return [r / n, g / n, b / n];
  }, png.toString('base64'));
}
async function pageOverflow(page) {
  return page.evaluate(() => ({
    scrollW: document.scrollingElement.scrollWidth, clientW: document.scrollingElement.clientWidth,
    scrollH: document.scrollingElement.scrollHeight, clientH: document.scrollingElement.clientHeight,
  }));
}
async function enterEmailWithCci(page) {
  await page.evaluate(async () => {
    document.querySelector('#v2-new-template-group').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    document.getElementById('v2-btn-new-email').click();
    await new Promise(r => setTimeout(r, 50));
    document.querySelector('#v2-new-template-group').dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    document.getElementById('v2-btn-toggle-cci').click();
  });
  await page.mouse.move(1, 1);
  await page.waitForTimeout(100);
}
async function seedVariables(page) {
  await page.evaluate(async () => {
    const stub = window.__gristStub;
    const cols = {};
    for (let i = 1; i <= 14; i++) cols['Colonne_' + String(i).padStart(2, '0')] = 'Text';
    stub.setVariables('Clients', cols);
    const row = { id: 1 };
    Object.keys(cols).forEach(c => { row[c] = 'valeur ' + c; });
    stub.setRows('Clients', [row]);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, row), 'Clients');
  });
  await page.waitForTimeout(100);
}
function insideViewport(r, vp) {
  return !!r && r.left >= 0 && r.top >= 0 && r.right <= vp.width + 0.5 && r.bottom <= vp.height + 0.5;
}
const boxOf = (page, sel) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el || getComputedStyle(el).display === 'none') return null;
  const r = el.getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) };
}, sel);

// === 1. Info-bulles : entières dans la fenêtre, visibles à l'écran, page non décalable ===
async function tooltipSweep(width, height) {
  console.log(`\n=== Info-bulles à ${width}x${height} ===`);
  const { browser, page } = await openAt(width, height);
  let o = await pageOverflow(page);
  check(`${width}x${height} - la page ne se décale pas latéralement (aucune info-bulle masquée ne dépasse)`, o.scrollW <= o.clientW, o);
  const hosts = await visibleTipHosts(page);
  const outside = [], invisible = [];
  for (const host of hosts) {
    await page.mouse.move(host.x, host.y);
    await page.waitForTimeout(560); // délai d'apparition .35s + fondu .12s (css/toolbar-v2.css)
    const tip = await page.evaluate(tipRectInPage, host.id);
    if (!(tip.left >= 0 && tip.right <= width)) outside.push({ id: host.id, left: Math.round(tip.left), right: Math.round(tip.right) });
    const ratio = await darkRatio(page, tip);
    if (!(ratio >= 0.5)) invisible.push({ id: host.id, ratio: Math.round(ratio * 100) / 100, opacity: tip.opacity });
  }
  check(`${width}x${height} - survol réel : chaque info-bulle tient entière dans la fenêtre (${hosts.length} boutons)`, hosts.length > 20 && outside.length === 0, outside);
  check(`${width}x${height} - survol réel : chaque info-bulle est visible à l'écran, jamais rognée par un conteneur (pixels)`, hosts.length > 20 && invisible.length === 0, invisible);
  await page.mouse.move(width / 2, height - 5);
  o = await pageOverflow(page);
  check(`${width}x${height} - après balayage, toujours aucun décalage latéral`, o.scrollW <= o.clientW, o);
  await browser.close();
}

// === 2. Info-bulle collée : clic souris puis Échap, souris partie -> plus d'info-bulle ; navigation Tab -> info-bulle affichée ===
async function stuckTooltip(width, height) {
  console.log(`\n=== Info-bulle après un clic, à ${width}x${height} ===`);
  const { browser, page } = await openAt(width, height);
  const center = id => page.evaluate(id => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, id);
  const tipOpacity = id => page.evaluate(id => Number(getComputedStyle(document.getElementById(id), '::after').opacity), id);
  const away = { x: width / 2, y: height - 20 };
  await page.evaluate(() => { document.getElementById('template-name').value = 'Info-bulles'; });

  let c = await center('btn-save');
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.mouse.move(away.x, away.y);
  await page.waitForTimeout(700);
  check('Enregistrer : clic puis Échap, souris partie -> son info-bulle ne reste pas affichée', await tipOpacity('btn-save') === 0,
    { opacity: await tipOpacity('btn-save'), focus: await page.evaluate(() => document.activeElement && document.activeElement.id) });

  c = await center('btn-link-rules');
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(300);
  const modalOpen = await page.evaluate(() => getComputedStyle(document.getElementById('link-rules-modal')).display !== 'none');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.mouse.move(away.x, away.y);
  await page.waitForTimeout(700);
  const back = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.id, modal: getComputedStyle(document.getElementById('link-rules-modal')).display }));
  check('Tables liées : fenêtre fermée par Échap (focus rendu au bouton), souris partie -> son info-bulle ne reste pas affichée',
    modalOpen && await tipOpacity('btn-link-rules') === 0, { modalOpen, back, opacity: await tipOpacity('btn-link-rules') });

  // Le clavier garde ses info-bulles : Tab jusqu'au prochain bouton qui en porte une.
  let focused = null;
  for (let i = 0; i < 6 && !focused; i++) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => { const el = document.activeElement; return el && el.hasAttribute('data-tip') && el.id ? el.id : null; });
  }
  await page.waitForTimeout(700);
  check('navigation au clavier (Tab) -> l\'info-bulle du bouton atteint s\'affiche toujours', !!focused && await tipOpacity(focused) === 1, { focused, opacity: focused && await tipOpacity(focused) });
  await browser.close();
}

// === 3. Mode email + Cci : texte de l'éditeur visible, page sans débordement ===
async function emailLayout(width, height) {
  console.log(`\n=== Mode email + Cci à ${width}x${height} ===`);
  const { browser, page } = await openAt(width, height);
  await enterEmailWithCci(page);
  await page.evaluate(() => EditorCore.getEditor().commands.setContent('<p>Bonjour, première ligne du courriel.</p><p>Deuxième ligne.</p>'));
  await page.waitForTimeout(150);
  const m = await page.evaluate(() => {
    const cci = document.getElementById('v2-email-cci');
    const p = document.querySelector('.tiptap p');
    const r = p.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + 10, r.top + r.height / 2);
    return {
      cciShown: !cci.hidden && cci.getBoundingClientRect().width > 0,
      toolbarH: Math.round(document.getElementById('toolbar-top').getBoundingClientRect().height),
      firstLine: { top: Math.round(r.top), bottom: Math.round(r.bottom) },
      firstLineVisible: !!hit && !!hit.closest('.tiptap') && r.bottom <= innerHeight,
      scrollH: document.scrollingElement.scrollHeight, clientH: document.scrollingElement.clientHeight,
    };
  });
  check(`${width}x${height} email+Cci - champ Cci affiché`, m.cciShown, m);
  check(`${width}x${height} email+Cci - la première ligne de texte de l'éditeur est visible (elementFromPoint)`, m.firstLineVisible, m);
  check(`${width}x${height} email+Cci - la page ne déborde pas verticalement`, m.scrollH <= m.clientH, m);
  await browser.close();
}

// === 4. Hauteur de la barre indépendante du message d'état (auto-save : "" <-> "Enregistré à HH:MM:SS.") ===
async function statusStability(height) {
  console.log('\n=== Hauteur de la barre selon le message d\'état, 700 à 900px ===');
  const { browser, page } = await openAt(800, height);
  const messages = ['', 'Enregistré à 12:34:56.', 'Modèle non enregistré : donnez-lui un nom puis cliquez sur Enregistrer pour activer l’enregistrement automatique.'];
  const unstable = [];
  for (let w = 700; w <= 900; w += 20) {
    await page.setViewportSize({ width: w, height });
    const heights = [];
    for (const msg of messages) {
      heights.push(await page.evaluate(async (msg) => {
        document.getElementById('status-msg').textContent = msg; // ce que fait setStatus() (js/main.js)
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return Math.round(document.getElementById('toolbar-top').getBoundingClientRect().height);
      }, msg));
    }
    if (new Set(heights).size > 1) unstable.push({ largeur: w, hauteurs: heights });
  }
  check('la hauteur de la barre ne change pas avec le message d\'état (700 à 900px)', unstable.length === 0, unstable);
  // Message tronqué : lisible en entier au survol.
  await page.setViewportSize({ width: 700, height });
  await page.evaluate((msg) => { document.getElementById('status-msg').textContent = msg; }, messages[2]);
  const s = await page.evaluate(() => { const r = document.getElementById('status-msg').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(s.x, s.y);
  await page.waitForTimeout(100);
  const title = await page.evaluate(() => document.getElementById('status-msg').title);
  check('message d\'état tronqué -> texte entier au survol (title)', title === messages[2], { title });
  await browser.close();
}

// === 5. Popups tenus dans la fenêtre ===
async function popups(width, height) {
  console.log(`\n=== Popups à ${width}x${height} ===`);
  const vp = { width, height };
  let { browser, page } = await openAt(width, height);
  await seedVariables(page);
  const long = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
  await page.evaluate((long) => EditorCore.getEditor().commands.setContent('<p>' + long.repeat(3) + '</p><p>' + long.repeat(6) + '</p>'), long);
  const bottomRight = await page.evaluate(() => {
    const ec = document.getElementById('editor-container').getBoundingClientRect();
    const t = document.querySelector('.tiptap').getBoundingClientRect();
    return { x: Math.min(ec.right, t.right) - 30, y: ec.bottom - 12 };
  });
  await page.mouse.click(bottomRight.x, bottomRight.y);
  await page.keyboard.press('End');
  await page.keyboard.type(' #');
  await page.waitForTimeout(250);
  const ac = await boxOf(page, '#autocomplete-box');
  check(`${width}x${height} - # tapé en bas de l'éditeur -> liste des variables entière dans la fenêtre`, insideViewport(ac, vp), ac);
  await browser.close();

  // Fil de commentaires de plusieurs messages, sur un texte en bas de la zone visible, puis rouvert depuis sa marque. Page neuve : la liste # ci-dessus,
  // quand elle débordait, pouvait laisser la page défilée et fausser les coordonnées.
  ({ browser, page } = await openAt(width, height));
  await page.evaluate((long) => EditorCore.getEditor().commands.setContent('<p>' + long.repeat(3) + '</p><p>' + long.repeat(6) + '</p>'), long);
  await page.evaluate(async () => { document.getElementById('template-name').value = 'Popups'; document.getElementById('btn-save').click(); await new Promise(r => setTimeout(r, 400)); });
  // Sélection des 8 caractères qui précèdent le point bas-droit visible de l'éditeur (posAtCoords) - seul le clic sur le bouton Commenter compte ici.
  const selection = await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    const ec = document.getElementById('editor-container').getBoundingClientRect();
    const t = document.querySelector('.tiptap').getBoundingClientRect();
    const hit = ed.view.posAtCoords({ left: Math.min(ec.right, t.right) - 30, top: ec.bottom - 12 });
    if (!hit) return null;
    ed.chain().focus().setTextSelection({ from: hit.pos - 8, to: hit.pos }).run();
    return [ed.state.selection.from, ed.state.selection.to];
  });
  const cb = await boxOf(page, '#v2-btn-comment');
  await page.mouse.click((cb.left + cb.right) / 2, (cb.top + cb.bottom) / 2);
  await page.waitForTimeout(300);
  const opened = await boxOf(page, '#v2-comment-popup');
  if (!opened) {
    check(`${width}x${height} - Commenter sur une sélection en bas de l'éditeur -> fenêtre du commentaire ouverte`, false, { selection });
  } else {
    for (let k = 0; k < 5; k++) {
      await page.evaluate(async (k) => {
        const box = document.getElementById('v2-comment-popup');
        box.querySelector('textarea').value = 'Message ' + k + ' : ' + 'un commentaire assez long pour occuper plusieurs lignes dans le fil. '.repeat(2);
        box.querySelector('.v2-comment-popup-post').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 250));
      }, k);
    }
    const afterPosts = await boxOf(page, '#v2-comment-popup');
    check(`${width}x${height} - fil de commentaires qui grandit (5 messages publiés) -> reste dans la fenêtre`, insideViewport(afterPosts, vp), afterPosts);
    await page.evaluate(() => { document.getElementById('v2-comment-popup').style.display = 'none'; window.scrollTo(0, 0); });
    const mark = await boxOf(page, '.comment-mark');
    await page.mouse.click(mark.right - 3, mark.bottom - 4);
    await page.waitForTimeout(300);
    const thread = await boxOf(page, '#v2-comment-popup');
    const replyReachable = await page.evaluate(() => {
      const b = document.querySelector('#v2-comment-popup .v2-comment-popup-post');
      if (!b) return false;
      b.scrollIntoView({ block: 'nearest' });
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === b || b.contains(hit);
    });
    check(`${width}x${height} - fil de 5 messages rouvert depuis une marque en bas -> entier dans la fenêtre`, insideViewport(thread, vp), { thread, mark });
    check(`${width}x${height} - fil rouvert -> bouton Répondre atteignable`, replyReachable);
  }
  await browser.close();

  // Image depuis une variable : vrai survol du bouton Image, vrai clic sur la ligne du menu.
  ({ browser, page } = await openAt(width, height));
  // Dix colonnes Pièces jointes : une vraie liste (jusqu'à 240px, css/toolbar-v2.css), pas le seul message "aucune colonne".
  await page.evaluate(async () => {
    const cols = {};
    for (let i = 1; i <= 10; i++) cols['Photo_' + String(i).padStart(2, '0')] = 'Attachments';
    window.__gristStub.setVariables('Pieces', cols);
    await GristAPI.refreshSchema();
  });
  const img = await boxOf(page, '#v2-btn-image');
  await page.mouse.move((img.left + img.right) / 2, (img.top + img.bottom) / 2);
  await page.waitForTimeout(200);
  const row = await boxOf(page, '#v2-btn-image-from-variable');
  if (row) {
    // D'un seul geste, comme un déplacement à vitesse normale : pas à pas, un point tombe dans les 2px entre le bouton et son menu (translateY(2px),
    // css/editor-v2.css) et le menu se referme - hors du sujet de ce test.
    await page.mouse.move(row.left + 10, (row.top + row.bottom) / 2);
    await page.mouse.click(row.left + 10, (row.top + row.bottom) / 2);
    // Ouverture asynchrone (GristAPI.refreshSchema() d'abord, cf. openImageVariablePicker) : attendre l'affichage plutôt qu'un délai fixe.
    await page.waitForFunction(() => { const p = document.getElementById('v2-image-var-picker'); return p && getComputedStyle(p).display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
  }
  const picker = await boxOf(page, '#v2-image-var-picker');
  const items = await page.evaluate(() => document.querySelectorAll('#v2-image-var-picker .v2-image-var-picker-item').length);
  check(`${width}x${height} - "Image depuis une variable" (10 colonnes) -> liste entière dans la fenêtre, près du bouton Image`,
    !!row && items === 10 && insideViewport(picker, vp) && picker.top >= img.top - 300 && picker.left <= img.right + 40, { row, items, picker, img });
  await browser.close();

  // Champs de l'email : # tapé dans À / Cc / Cci.
  ({ browser, page } = await openAt(width, height));
  await seedVariables(page);
  await enterEmailWithCci(page);
  for (const id of ['v2-email-to', 'v2-email-cc', 'v2-email-cci']) {
    const f = await boxOf(page, '#' + id);
    await page.mouse.click(f.right - 8, (f.top + f.bottom) / 2);
    await page.keyboard.type('#');
    await page.waitForTimeout(250);
    const box = await boxOf(page, '#autocomplete-box');
    check(`${width}x${height} - # tapé dans le champ ${id} -> liste entière dans la fenêtre`, insideViewport(box, vp), { field: f, box });
    await page.keyboard.press('Escape');
  }
  await browser.close();
}

// === 6. Menus au survol (.v2-hover-group) : la souris descend LENTEMENT du bouton jusqu'à son menu, puis remonte ===
// Entre le bouton et son menu, le décalage de 2px (translateY, css/editor-v2.css) n'appartenait à aucun élément du groupe : un pointeur qui traverse cette
// bande - un déplacement lent y pose au moins un point - perdait le :hover du groupe, le menu se refermait et la souris ne l'atteignait jamais (retour d'Antoine,
// menu Image ; mesuré sur les 8 menus). Un geste d'un seul bond saute la bande : un pas d'un pixel ici, l'état du menu relevé après CHAQUE pas.
async function hoverMenus(width, height) {
  console.log(`\n=== Menus au survol à ${width}x${height} ===`);
  const { browser, page } = await openAt(width, height);
  // Mode en-tête/pied : ajoute la pastille et son menu "Numéro de page" (#v2-hf-pagenum-group, créé après coup) aux menus de la barre.
  await page.evaluate(async () => {
    HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
    await new Promise(r => setTimeout(r, 300));
    let n = 0;
    document.querySelectorAll('.v2-hover-group').forEach(g => g.setAttribute('data-sp-group', g.id || 'sans-id-' + (++n)));
  });
  const names = await page.evaluate(() => [...document.querySelectorAll('.v2-hover-group')].flatMap(g => {
    const t = g.querySelector(':scope > button'), f = g.querySelector(':scope > .v2-hover-flyout');
    if (!t || !f || t.disabled || getComputedStyle(t).pointerEvents === 'none') return [];
    const r = t.getBoundingClientRect();
    return r.width && r.height && r.bottom <= innerHeight && r.right <= innerWidth ? [g.getAttribute('data-sp-group')] : [];
  }));
  const isOpen = sel => page.evaluate(sel => getComputedStyle(document.querySelector(sel + ' > .v2-hover-flyout')).display !== 'none', sel);
  // Déplacement d'un pixel par pas (la bande à franchir en fait 2) ; rend les ordonnées où le menu était fermé.
  async function slowMove(from, to, sel) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))));
    const closedAt = [];
    for (let i = 1; i <= n; i++) {
      const y = from.y + (to.y - from.y) * i / n;
      await page.mouse.move(from.x + (to.x - from.x) * i / n, y);
      if (!(await isOpen(sel))) closedAt.push(Math.round(y * 10) / 10);
    }
    return closedAt;
  }
  const notOpened = [], descentClosed = {}, notLanded = [], ascentClosed = {}, stayedOpen = [], stolenClick = [], overflowing = [];
  for (const name of names) {
    const sel = `[data-sp-group="${name}"]`;
    const trigger = await page.evaluate(sel => { const r = document.querySelector(sel + ' > button').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, bottom: r.bottom }; }, sel);
    await page.mouse.move(trigger.x, trigger.y);
    await page.waitForTimeout(80);
    if (!(await isOpen(sel))) { notOpened.push(name); continue; }
    const fl = await page.evaluate(sel => { const r = document.querySelector(sel + ' > .v2-hover-flyout').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top }; }, sel);
    const dest = { x: Math.min(Math.max(trigger.x, fl.left + 6), fl.right - 6), y: fl.top + 14 };
    const down = await slowMove(trigger, dest, sel);
    if (down.length) descentClosed[name] = down;
    const landed = await page.evaluate(([sel, x, y]) => { const el = document.elementFromPoint(x, y); return !!el && document.querySelector(sel + ' > .v2-hover-flyout').contains(el); }, [sel, dest.x, dest.y]);
    if (!landed) notLanded.push(name);
    const up = await slowMove(dest, trigger, sel);
    if (up.length) ascentClosed[name] = up;
    // Menu ouvert, pointeur sur le bouton : sa dernière rangée de pixels ENTIÈRE (bas - 1) doit encore atteindre le bouton, le pont de survol commence en dessous.
    // (Chromium teste le pointeur comme un carré de 1px : un point à mi-pixel juste au-dessus du bord d'une boîte voisine la touche déjà - sans conséquence
    // pour une souris à coordonnées entières, d'où la rangée entière et pas bas - 0.5.)
    const bottomRow = await page.evaluate(([sel, x, y]) => { const t = document.querySelector(sel + ' > button'); const el = document.elementFromPoint(x, y - 1); return !!el && t.contains(el); }, [sel, trigger.x, trigger.bottom]);
    if (!bottomRow) stolenClick.push(name);
    const o = await pageOverflow(page);
    if (o.scrollW > o.clientW) overflowing.push({ name, scrollW: o.scrollW, clientW: o.clientW });
    await page.mouse.move(width - 4, height - 4);
    await page.waitForTimeout(60);
    if (await isOpen(sel)) stayedOpen.push(name);
  }
  // Souris partie, au repos : le coin bas-droit de chaque bouton à menu ne porte plus de point bleu (retiré à la demande d'Antoine le 29/09 : un rond de 4px
  // à 2px du coin, .v2-hover-group > button::after). Lu sur une vraie capture : le carré de 4x4px du coin bas-droit, comparé au même carré du coin bas-gauche -
  // le rond n'était que d'un côté, et la comparaison ne dépend pas de la couleur du bouton (Exporter en PDF est plein bleu, où le rond de même teinte ne se voyait pas).
  const dotted = [];
  for (const name of names) {
    const c = await page.evaluate(sel => { const r = document.querySelector(sel + ' > button').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom }; }, `[data-sp-group="${name}"]`);
    const y = Math.round(c.bottom) - 6;
    const rightCorner = await meanColor(page, Math.round(c.right) - 6, y, 4, 4);
    const leftCorner = await meanColor(page, Math.round(c.left) + 2, y, 4, 4);
    const ecart = Math.round(Math.max(...rightCorner.map((v, i) => Math.abs(v - leftCorner[i]))));
    if (ecart > 24) dotted.push({ name, ecart });
  }
  const label = `${width}x${height} - menus au survol`;
  check(`${label} : tous les menus s'ouvrent au survol du bouton (${names.length} menus, dont Exporter en PDF, Image et Numéro de page)`, names.length >= 8 && notOpened.length === 0, { names, notOpened });
  check(`${label} : descente lente (1px par pas) du bouton à une ligne du menu, le menu reste ouvert de bout en bout`, Object.keys(descentClosed).length === 0 && notLanded.length === 0, { descentClosed, notLanded });
  check(`${label} : remontée lente du menu au bouton, le menu reste ouvert de bout en bout`, Object.keys(ascentClosed).length === 0, ascentClosed);
  check(`${label} : souris partie ailleurs, chaque menu se referme`, stayedOpen.length === 0, stayedOpen);
  check(`${label} : menu ouvert, le bas du bouton reste cliquable et la page ne déborde pas`, stolenClick.length === 0 && overflowing.length === 0, { stolenClick, overflowing });
  check(`${label} : au repos, aucun point bleu dans le coin des boutons à menu (${names.length} boutons)`, dotted.length === 0, dotted);
  await browser.close();
}

// Sections lançables seules : node dev-tests/verify-small-panel.mjs popups email menusSurvol
const SECTIONS = {
  infoBulles: async () => { await tooltipSweep(600, 400); await tooltipSweep(700, 400); await tooltipSweep(800, 400); },
  infoBulleCollee: () => stuckTooltip(700, 400),
  email: async () => { await emailLayout(600, 400); await emailLayout(700, 400); },
  statut: () => statusStability(400),
  popups: () => popups(700, 400),
  menusSurvol: () => hoverMenus(700, 400),
};
const only = process.argv.slice(2);
for (const [name, run] of Object.entries(SECTIONS)) if (!only.length || only.includes(name)) await run();
server.close();

console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
