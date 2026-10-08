#!/usr/bin/env node
// Menu de couleur (js/color-palette.js) et fenêtre « Couleur personnalisée » (js/color-dialog.js, css/color-palette.css) : le panneau de 700x400 d'Antoine, à la VRAIE souris (page.mouse,
// Node/Playwright) et au VRAI clavier, en clair, en sombre et en anglais. Demande du 08/10 : une palette plus moderne, un code # en plus du rouge-vert-bleu, un clic sur une couleur
// personnalisée qui marche, des couleurs gardées par modèle. Ce que scenarios-color-palette.js ne peut pas voir depuis la page (appuis « trusted », survol, glissé, mesure à l'écran) :
//   - le menu de la police, du surlignage et du fond de case s'ouvre TOUT ENTIER dans le panneau (il mesure ~220 px : il glisse le long de son bouton plutôt que de déborder), ses 52
//     boutons sont sous le pointeur, assez grands, ses textes lisibles (≥ 4,5:1) ; la pastille choisie porte un anneau et une coche lisibles ;
//   - UN clic sur une pastille pose la couleur, referme le menu, garde la sélection et le curseur du texte ;
//   - « Personnalisé… » ouvre la fenêtre, qui tient dans 700x400 sans défiler, avec le clavier dans le champ du code : le code tapé sans # change l'aperçu et les trois champs, un code
//     illisible est refusé (message lisible, « Appliquer » grisé et sans effet), Tab fait le tour de la fenêtre sans en sortir, le carré se clique et se glisse (même hors du carré),
//     la teinte se clique, « Annuler » ne pose rien, « Appliquer » (souris) et Entrée posent la couleur, la gardent dans le modèle et rendent le curseur au texte ;
//   - la rangée « Couleurs du modèle » : un clic sur une pastille gardée la pose, sa croix (au survol) la retire SANS poser ni sa couleur ni celle de la voisine qui prend sa place,
//     Suppr au clavier aussi ;
//   - la rangée « Couleurs du document » (une ligne réservée de la table des modèles, pas une table de plus) : sa case se coche à la vraie souris dans la fenêtre, la couleur y arrive,
//     les deux rangées tiennent CÔTE À CÔTE dans 700x400 (noms entiers, même hauteur, menu entier dans le panneau) et l'UNE SOUS L'AUTRE dans un panneau haut, un clic la pose, sa croix
//     la retire sans poser la voisine, sans toucher à celle du modèle ;
//   - le fond d'une case depuis la barre du tableau : la barre revient après la fenêtre ; l'interface en anglais ; Échap ferme la fenêtre.
// Le menu Bordures d'une grille (qui rouvre le menu après la fenêtre) est dans verify-grid-borders-mouse.mjs.
// Lancé par run-headless.mjs (groupe Node « colorPaletteMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-color-palette-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.COLOR_PALETTE_MOUSE_PORT || 8985);
const WIDTH = 700;
const HEIGHT = 400;
const TALL = 640;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-read-mode-mouse.mjs.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/exceljs\.min\.js$/, 'umd/exceljs.min.js'],
].filter(([, rel]) => rel !== 'umd/exceljs.min.js' || existsSync(join(CACHE, rel))) : [];
if (!OFFLINE) console.log('[verify-color-palette-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

async function openWidget(colorScheme, size) {
  const context = await browser.newContext({ bypassCSP: true, viewport: size || { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
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
  await page.waitForTimeout(140);
  return b;
}

const CONTRAST_FN = `(a, b) => {
  const parse = c => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const la = lum(parse(a)), lb = lum(parse(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}`;

const MENU = '.v2-color-dropdown.visible';
const TEXT_CARET = '#v2-btn-text-color-caret';
const HIGHLIGHT_CARET = '#v2-btn-highlight-caret';
const MODAL = '#pp-color-modal';
const swatchOf = (color, root) => `${root || MENU} .cp-swatch[data-color="${color}"]`;
const rowSwatch = color => `${MENU} .cp-row .cp-swatch[data-color="${color}"]`;
const scopedSwatch = (scope, color) => `${MENU} .cp-row[data-scope="${scope}"] .cp-swatch[data-color="${color}"]`;
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Le menu ouvert : où il est, tout est-il dans le panneau, chaque bouton est-il sous le pointeur et assez grand, que montre-t-il ?
const menuInfo = page => page.evaluate((menuSel) => {
  const m = document.querySelector(menuSel);
  if (!m) return null;
  const r = m.getBoundingClientRect();
  const buttons = Array.from(m.querySelectorAll('button:not(.cp-forget)'));
  const unreachable = buttons.filter((b) => { const q = b.getBoundingClientRect(); const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !(hit === b || b.contains(hit)); }).map(b => b.dataset.action);
  const small = buttons.filter((b) => { const q = b.getBoundingClientRect(); return q.width < 19 || q.height < 19; }).length;
  const footer = m.querySelector('.v2-color-dropdown-footer');
  const footerTops = footer ? Array.from(footer.querySelectorAll('button')).map(b => Math.round(b.getBoundingClientRect().top)) : [];
  return {
    top: r.top, left: r.left, right: r.right, bottom: r.bottom, w: r.width, h: r.height, n: buttons.length, unreachable, small,
    inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    swatches: m.querySelectorAll('.cp-grid .cp-swatch').length, rowSwatches: Array.from(m.querySelectorAll('.cp-row .cp-swatch')).map(b => b.dataset.color),
    active: Array.from(m.querySelectorAll('.cp-swatch.is-active')).map(b => b.dataset.color), customActive: !!m.querySelector('.cp-custom.is-active'),
    clipped: m.scrollWidth > m.clientWidth + 1 || m.scrollHeight > m.clientHeight + 1,
    footerOneRow: footerTops.length > 0 && footerTops.every(t => Math.abs(t - footerTops[0]) <= 1),
    opened: m.classList.contains('visible'),
  };
}, MENU);

// La fenêtre ouverte : tient-elle dans le panneau sans défiler, chaque champ et bouton est-il visible et sous le pointeur ?
const dialogInfo = page => page.evaluate((modalSel) => {
  const modal = document.querySelector(modalSel);
  if (!modal || getComputedStyle(modal).display === 'none') return null;
  const box = modal.querySelector('.pp-modal-box');
  const body = modal.querySelector('.pp-modal-body');
  const header = modal.querySelector('.pp-modal-header').getBoundingClientRect();
  const actions = modal.querySelector('.pp-modal-actions').getBoundingClientRect();
  const r = box.getBoundingClientRect();
  const controls = Array.from(modal.querySelectorAll('input, button, .pp-color-area')).filter(el => el.getBoundingClientRect().width > 0);
  const hidden = controls.filter((el) => { const q = el.getBoundingClientRect(); const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !(hit === el || el.contains(hit)); }).map(el => el.id || el.className);
  const outside = controls.filter((el) => { const q = el.getBoundingClientRect(); return q.left < 0 || q.top < 0 || q.right > innerWidth || q.bottom > innerHeight; }).map(el => el.id || el.className);
  return {
    box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    scrolls: body.scrollHeight > body.clientHeight + 1 || box.scrollHeight > box.clientHeight + 1, titleAtTop: header.top >= r.top - 1 && header.bottom <= r.bottom, actionsAtBottom: Math.abs(actions.bottom - r.bottom) <= 18,
    controls: controls.length, hidden, outside, active: document.activeElement && (document.activeElement.id || document.activeElement.className),
  };
}, MODAL);

// Les champs de la fenêtre.
const fields = page => page.evaluate(() => {
  const hex = document.getElementById('pp-color-hex');
  const numbers = Array.from(document.querySelectorAll('#pp-color-modal .pp-color-number')).map(input => input.value);
  const chip = which => getComputedStyle(document.querySelector('#pp-color-modal .pp-color-chip-' + which)).backgroundColor;
  const thumb = document.querySelector('#pp-color-modal .pp-color-thumb').getBoundingClientRect();
  const hue = document.querySelector('#pp-color-modal .pp-color-hue');
  const ok = document.querySelector('#pp-color-modal .var-modal-primary');
  return { hex: hex.value, numbers, after: chip('after'), before: chip('before'), thumb: { x: thumb.left + thumb.width / 2, y: thumb.top + thumb.height / 2 }, hue: Number(hue.value),
    invalid: hex.getAttribute('aria-invalid') === 'true', okDisabled: ok.disabled, hint: document.querySelector('#pp-color-modal .pp-color-hint').textContent.trim() };
});
const toRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };

// Que montre le document : la couleur du texte d'un mot, son surlignage, le fond d'une case.
const styleOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const s = getComputedStyle(el);
  return { color: s.color, background: s.backgroundColor };
}, selector);
const selectedText = page => page.evaluate(() => window.getSelection().toString());
const editorFocused = page => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.tiptap'));
const keptColors = page => page.evaluate(() => PageLayout.getCustomColors());
const documentColors = page => page.evaluate(() => Templates.getDocumentSettings().colors || []);
// Ce que Grist garde du document : la ligne réservée aux réglages dans la table des modèles (une au plus, son JSON), les tables, les créations de table depuis `clearActionLog`.
const storedSettings = page => page.evaluate(() => {
  const stub = window.__gristStub;
  const t = stub.state.rows['Publipostage_Modeles'];
  const rows = t && t.TypeModele ? t.id.filter((id, i) => t.TypeModele[i] === 'reglages').map(id => stub.getRow('Publipostage_Modeles', id)) : [];
  let json = null;
  try { json = rows.length ? JSON.parse(rows[0].Contenu) : null; } catch (e) { json = 'illisible'; }
  return { rows: rows.length, json, tables: Object.keys(stub.state.rows).sort(), addTables: stub.getActionLog().filter(a => a[0] === 'AddTable').length };
});
// La disposition du menu ouvert : la palette, chaque rangée de couleurs gardées (sa boîte, son nom, entier ou coupé, ses couleurs), le pied.
const layoutInfo = page => page.evaluate((menuSel) => {
  const m = document.querySelector(menuSel);
  if (!m) return null;
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
  const rows = Array.from(m.querySelectorAll('.cp-row')).map((row) => {
    const name = row.querySelector('.cp-row-label');
    const first = row.querySelector('.cp-swatch');
    return Object.assign(box(row), { scope: row.dataset.scope, label: name.textContent.trim(), hint: name.title, clipped: name.scrollWidth > name.clientWidth + 1, labelBottom: name.getBoundingClientRect().bottom, firstSwatchTop: first ? first.getBoundingClientRect().top : null,
      colors: Array.from(row.querySelectorAll('.cp-saved .cp-swatch')).map(b => b.dataset.color), empty: row.classList.contains('is-empty'), emptyText: (row.querySelector('.cp-row-empty') || {}).textContent || null });
  });
  const footer = m.querySelector('.v2-color-dropdown-footer');
  return { menu: box(m), grid: box(m.querySelector('.cp-grid')), rows, footer: footer ? box(footer) : null };
}, MENU);
const dialogShown = page => page.evaluate(sel => { const m = document.querySelector(sel); return !!m && getComputedStyle(m).display !== 'none'; }, MODAL);

async function freshText(page, html) {
  await page.evaluate((h) => { PageLayout.setMarginsMm(null); Editor.setHTML(h); }, html || '<p>Alpha Beta Gamma</p>');
  await page.waitForTimeout(250);
  await realClick(page, '.tiptap p');
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(120);
}

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Menu de couleur et fenêtre « Couleur personnalisée » à la souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);
  await page.evaluate(`window.__ratio = ${CONTRAST_FN};`);

  // ---------- 1) Le menu de la couleur de police : palette, rangée, pied - tout dans le panneau, tout sous le pointeur ----------
  await freshText(page);
  const caret = await realClick(page, TEXT_CARET);
  check(`${label} - le bouton « Choisir une couleur » de la barre est visible dans le panneau`, !!caret && caret.inViewport, caret);
  let menu = await menuInfo(page);
  check(`${label} - le clic ouvre le menu de couleur, TOUT ENTIER dans le panneau de ${WIDTH}x${HEIGHT} (${menu && Math.round(menu.left)},${menu && Math.round(menu.top)} -> ${menu && Math.round(menu.right)},${menu && Math.round(menu.bottom)})`, !!menu && menu.opened && menu.inside, menu);
  check(`${label} - le menu montre la palette de 50 pastilles, les rangées « Couleurs du modèle » et « Couleurs du document » vides, « Personnalisé… » et « Par défaut » : 52 boutons, chacun sous le pointeur, aucun de moins de 19 px, rien qui déborde`,
    !!menu && menu.swatches === 50 && menu.n === 52 && menu.unreachable.length === 0 && menu.small === 0 && !menu.clipped && menu.rowSwatches.length === 0, menu && { swatches: menu.swatches, n: menu.n, unreachable: menu.unreachable, small: menu.small, clipped: menu.clipped });
  check(`${label} - « Personnalisé… » et « Par défaut » tiennent sur une seule ligne`, !!menu && menu.footerOneRow, menu && menu.footerOneRow);
  const texts = await page.evaluate(([menuSel]) => {
    const m = document.querySelector(menuSel);
    const bg = getComputedStyle(m).backgroundColor;
    const ratio = sel => { const el = m.querySelector(sel); return el ? Math.round(window.__ratio(getComputedStyle(el).color, bg) * 100) / 100 : null; };
    const ratios = sel => Array.from(m.querySelectorAll(sel)).map(el => Math.round(window.__ratio(getComputedStyle(el).color, bg) * 100) / 100);
    return { labels: ratios('.cp-row-label'), empties: ratios('.cp-row-empty'), custom: ratio('.cp-custom span'), none: ratio('[data-action="none"] span') };
  }, [MENU]);
  check(`${label} - les textes du menu se lisent sur son fond (≥ 4,5:1) : noms des deux rangées ${texts.labels.join(' et ')}, « Aucune » ${texts.empties.join(' et ')}, « Personnalisé… » ${texts.custom}, « Par défaut » ${texts.none}`,
    texts.labels.length === 2 && texts.empties.length === 2 && [...texts.labels, ...texts.empties, texts.custom, texts.none].every(v => v !== null && v >= 4.5), texts);
  // Le panneau est court et large : les deux rangées sont à droite de la palette et de son pied, l'une sous l'autre, et le menu reste bas (la bande d'une grille lui laisse 207 px).
  let lay = await layoutInfo(page);
  check(`${label} - dans ce panneau court les deux rangées sont à DROITE de la palette et de son pied (palette jusqu'à ${lay && Math.round(lay.grid.right)}, rangées dès ${lay && Math.round(lay.rows[0].left)}), l'une sous l'autre, en tête de la palette, le pied sous elle`,
    !!lay && lay.rows.length === 2 && lay.rows.every(r => r.left >= lay.grid.right && r.left >= lay.footer.right - 1 && Math.abs(r.left - lay.rows[0].left) <= 1) && lay.rows[1].top >= lay.rows[0].bottom - 0.5 && Math.abs(lay.rows[0].top - lay.grid.top) <= 2 && lay.footer.top >= lay.grid.bottom - 0.5 && lay.footer.left <= lay.grid.left + 1, lay);
  check(`${label} - le menu mesure ${lay && Math.round(lay.menu.h)} px de haut (au plus 207 : la bande d'une grille ne lui laisse pas plus) et ses deux noms sont lisibles en entier : « ${lay && lay.rows.map(r => r.label).join(' », « ')} »`,
    !!lay && lay.menu.h <= 207 && lay.rows.every(r => !r.clipped && r.hint.length > 10) && lay.rows[0].label === 'Couleurs du modèle' && lay.rows[1].label === 'Couleurs du document' && lay.rows.every(r => r.empty && r.emptyText === 'Aucune'), lay);

  // ---------- 2) UN clic sur une pastille pose la couleur et referme le menu ----------
  const red = await realClick(page, swatchOf('#b91c1c'));
  check(`${label} - la pastille rouge est visible et un clic la choisit`, !!red && red.inViewport, red);
  menu = await menuInfo(page);
  const redText = await styleOf(page, '.tiptap p span');
  check(`${label} - le menu se referme au premier clic et le texte sélectionné est rouge (${redText && redText.color})`, !menu && !!redText && redText.color === toRgb('#b91c1c'), { menu: !!menu, redText });
  check(`${label} - la sélection est toujours là (${JSON.stringify(await selectedText(page))}) et le curseur est resté dans le texte`, (await selectedText(page)) === 'Alpha Beta Gamma' && (await editorFocused(page)), await selectedText(page));
  await realClick(page, TEXT_CARET);
  menu = await menuInfo(page);
  check(`${label} - rouvert, le menu marque la pastille rouge (et elle seule), pas « Personnalisé… »`, !!menu && sameList(menu.active, ['#b91c1c']) && !menu.customActive, menu && { active: menu.active, custom: menu.customActive });
  const mark = await page.evaluate((sel) => {
    const b = document.querySelector(sel);
    const s = getComputedStyle(b);
    const after = getComputedStyle(b, '::after');
    const menuBg = getComputedStyle(b.closest('.v2-color-dropdown')).backgroundColor;
    return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, ring: Math.round(window.__ratio(s.outlineColor, menuBg) * 100) / 100, tick: after.content !== 'none' && parseFloat(after.width) > 0, tickRatio: Math.round(window.__ratio(after.borderRightColor, s.backgroundColor) * 100) / 100, pressed: b.getAttribute('aria-pressed') };
  }, swatchOf('#b91c1c'));
  check(`${label} - la pastille choisie porte un anneau d'accent lisible (≥ 3:1 : ${mark.ring}) et une coche qui se lit sur sa couleur (≥ 3:1 : ${mark.tickRatio}), aria-pressed vrai`, mark.outlineStyle === 'solid' && parseFloat(mark.outlineWidth) >= 2 && mark.ring >= 3 && mark.tick && mark.tickRatio >= 3 && mark.pressed === 'true', mark);
  await page.keyboard.press('Escape');
  await page.mouse.click(WIDTH - 8, HEIGHT - 8);
  await page.waitForTimeout(120);

  // ---------- 3) « Personnalisé… » : la fenêtre ----------
  await freshText(page);
  await realClick(page, TEXT_CARET);
  await realClick(page, `${MENU} .cp-custom`);
  await page.waitForTimeout(150);
  menu = await menuInfo(page);
  let dialog = await dialogInfo(page);
  check(`${label} - « Personnalisé… » referme le menu et ouvre la fenêtre`, !menu && !!dialog, { menu: !!menu, dialog: !!dialog });
  check(`${label} - la fenêtre tient dans le panneau (${dialog && dialog.box.join(',')}) sans défiler, titre en haut et boutons en bas, ses ${dialog && dialog.controls} champs et boutons sont visibles et sous le pointeur`,
    !!dialog && dialog.inside && !dialog.scrolls && dialog.titleAtTop && dialog.actionsAtBottom && dialog.hidden.length === 0 && dialog.outside.length === 0 && dialog.controls >= 9, dialog);
  check(`${label} - le clavier est dans le champ du code (${dialog && dialog.active})`, !!dialog && dialog.active === 'pp-color-hex', dialog && dialog.active);
  let f = await fields(page);
  check(`${label} - sans couleur de départ : le bleu d'accent (${f.hex}), l'aperçu de la nouvelle couleur seul`, f.hex === '#2F6FED' && f.after === toRgb('#2f6fed') && sameList(f.numbers, ['47', '111', '237']), f);

  // La frappe d'un code à la vraie touche.
  await page.keyboard.press('Control+a');
  await page.keyboard.type('1E8449');
  await page.waitForTimeout(80);
  f = await fields(page);
  check(`${label} - le code « 1E8449 » tapé sans # change l'aperçu (${f.after}) et les trois champs (${f.numbers.join(', ')}) sans réécrire le champ en cours de frappe (${f.hex})`, f.after === toRgb('#1e8449') && sameList(f.numbers, ['30', '132', '73']) && f.hex === '1E8449' && !f.invalid, f);
  // Un code illisible : message, champ marqué, « Appliquer » grisé et sans effet.
  await page.keyboard.press('Control+a');
  await page.keyboard.type('#12');
  await page.waitForTimeout(80);
  f = await fields(page);
  const hintRatio = await page.evaluate(() => { const hint = document.querySelector('#pp-color-modal .pp-color-hint'); const box = document.querySelector('#pp-color-modal .pp-modal-box'); return Math.round(window.__ratio(getComputedStyle(hint).color, getComputedStyle(box).backgroundColor) * 100) / 100; });
  check(`${label} - « #12 » est refusé : champ marqué, message « ${f.hint} » lisible (≥ 4,5:1 : ${hintRatio}), « Appliquer » grisé, aperçu inchangé`, f.invalid && f.okDisabled && /3 ou 6 chiffres/.test(f.hint) && hintRatio >= 4.5 && f.after === toRgb('#1e8449'), { f, hintRatio });
  const okBox = await boxOf(page, `${MODAL} .var-modal-primary`);
  await page.mouse.click(okBox.x, okBox.y);
  await page.waitForTimeout(120);
  const afterDisabledClick = await styleOf(page, '.tiptap p span');
  check(`${label} - un clic sur « Appliquer » grisé ne fait rien : la fenêtre reste ouverte, le champ reste marqué, le texte n'a pris aucune couleur`, (await dialogShown(page)) && !afterDisabledClick && (await fields(page)).invalid, afterDisabledClick);
  // Les trois champs, à la touche.
  await page.click('#pp-color-hex', { clickCount: 3 });
  await page.keyboard.type('#102030');
  await page.keyboard.press('Tab');
  await page.keyboard.type('255');
  await page.waitForTimeout(80);
  f = await fields(page);
  check(`${label} - Tab passe au champ Rouge, « 255 » y donne ${f.hex} (${f.numbers.join(', ')}) : le code suit les champs`, f.hex === '#FF2030' && sameList(f.numbers, ['255', '32', '48']) && f.after === toRgb('#ff2030'), f);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const onKeep = await page.evaluate(() => document.activeElement && document.activeElement.type + ' ' + document.activeElement.closest('label')?.textContent.trim());
  check(`${label} - Tab ×3 de plus passe par Vert, Bleu puis la case « Couleurs du modèle » (${onKeep}), cochée d'office`, /^checkbox Couleurs du modèle$/.test(onKeep) && (await page.evaluate(() => document.activeElement.checked)), onKeep);
  await page.keyboard.press('Tab');
  const onKeepDocument = await page.evaluate(() => document.activeElement && document.activeElement.type + ' ' + document.activeElement.closest('label')?.textContent.trim());
  check(`${label} - Tab de plus : la case « Couleurs du document » (${onKeepDocument}), décochée d'office`, /^checkbox Couleurs du document$/.test(onKeepDocument) && !(await page.evaluate(() => document.activeElement.checked)), onKeepDocument);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const onApply = await page.evaluate(() => document.activeElement && document.activeElement.textContent.trim());
  check(`${label} - deux Tab de plus : « Annuler » puis « Appliquer » (${onApply})`, onApply === 'Appliquer', onApply);
  await page.keyboard.press('Tab');
  const wrapped = await page.evaluate(() => document.activeElement.className);
  check(`${label} - Tab depuis « Appliquer » reprend au début de la fenêtre (le carré : ${wrapped}) : le clavier ne la quitte pas`, /pp-color-area/.test(wrapped), wrapped);

  // Le carré à la vraie souris : un coin, puis un glissé qui sort du carré (la souris reste capturée).
  const area = await boxOf(page, `${MODAL} .pp-color-area`);
  check(`${label} - le carré est dans le panneau (${Math.round(area.w)}x${Math.round(area.h)} px)`, area.inViewport && area.w >= 150 && area.h >= 100, area);
  // À 3 px du coin : le carré a des angles arrondis (6 px), un point plus près du coin est hors de sa forme et n'est pas un clic dessus.
  await page.mouse.move(area.right - 3, area.top + 3, { steps: 3 });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(80);
  f = await fields(page);
  const [r1, g1, b1] = f.numbers.map(Number);
  check(`${label} - un clic près du coin haut droit du carré donne une couleur presque pure de la teinte (${f.hex}) et le curseur suit le pointeur (${Math.round(f.thumb.x)},${Math.round(f.thumb.y)})`, Math.max(r1, g1, b1) >= 240 && Math.min(r1, g1, b1) <= 12 && Math.abs(f.thumb.x - (area.right - 3)) <= 1.5 && Math.abs(f.thumb.y - (area.top + 3)) <= 1.5, { f, area });
  await page.mouse.move(area.x, area.y, { steps: 2 });
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.move(area.x + 30, area.y - 20, { steps: 4 });
  f = await fields(page);
  check(`${label} - le glissé suit le pointeur dans le carré : curseur en (${Math.round(f.thumb.x)},${Math.round(f.thumb.y)}) pour un pointeur en (${Math.round(area.x + 30)},${Math.round(area.y - 20)})`, Math.abs(f.thumb.x - (area.x + 30)) <= 1.5 && Math.abs(f.thumb.y - (area.y - 20)) <= 1.5, { f, area });
  await page.mouse.move(area.left - 40, area.bottom + 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  f = await fields(page);
  check(`${label} - le glissé qui sort du carré par le bas gauche reste capturé : noir (${f.hex}), curseur dans le coin bas gauche`, f.hex === '#000000' && Math.abs(f.thumb.x - area.left) <= 1.5 && Math.abs(f.thumb.y - area.bottom) <= 1.5, { f, area });
  // La teinte : un clic à un tiers de la glissière, sur une couleur vive.
  await page.click('#pp-color-hex', { clickCount: 3 });
  await page.keyboard.type('#ff0000');
  await page.waitForTimeout(60);
  const hue = await boxOf(page, `${MODAL} .pp-color-hue`);
  check(`${label} - la glissière de teinte est dans le panneau, sous la souris`, hue.inViewport && hue.w >= 150, hue);
  await page.mouse.click(hue.left + hue.w / 3, hue.y);
  await page.waitForTimeout(80);
  f = await fields(page);
  const [r2, g2, b2] = f.numbers.map(Number);
  check(`${label} - un clic à un tiers de la teinte (${f.hue}°) donne un vert (${f.hex}) et le curseur du carré reste dans son coin vif`, f.hue >= 105 && f.hue <= 130 && g2 === 255 && r2 < g2 && b2 < g2, f);

  // Annuler ferme sans rien poser.
  await page.click('#pp-color-hex', { clickCount: 3 });
  await page.keyboard.type('#7c3aed');
  const cancelBox = await boxOf(page, `${MODAL} .pp-modal-actions button:not(.var-modal-primary)`);
  await page.mouse.move(cancelBox.x, cancelBox.y, { steps: 3 });
  await page.mouse.click(cancelBox.x, cancelBox.y);
  await page.waitForTimeout(150);
  check(`${label} - « Annuler » ferme la fenêtre sans rien poser ni garder, le curseur est revenu dans le texte`, !(await dialogShown(page)) && (await keptColors(page)).length === 0 && !(await styleOf(page, '.tiptap p span')) && (await editorFocused(page)), { kept: await keptColors(page), focus: await editorFocused(page) });

  // « Appliquer » à la souris pose la couleur tapée et la garde.
  await freshText(page);
  await realClick(page, TEXT_CARET);
  await realClick(page, `${MENU} .cp-custom`);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('1E8449');
  const apply = await realClick(page, `${MODAL} .var-modal-primary`);
  check(`${label} - « Appliquer » est sous le pointeur dans le panneau`, !!apply && apply.inViewport, apply);
  const green = await styleOf(page, '.tiptap p span');
  check(`${label} - « Appliquer » ferme la fenêtre, pose #1E8449 sur le texte sélectionné (${green && green.color}) et rend le curseur à l'éditeur, la sélection intacte`, !(await dialogShown(page)) && !!green && green.color === toRgb('#1e8449') && (await editorFocused(page)) && (await selectedText(page)) === 'Alpha Beta Gamma', { green, sel: await selectedText(page) });
  check(`${label} - la couleur est gardée dans le modèle (${JSON.stringify(await keptColors(page))})`, sameList(await keptColors(page), ['#1e8449']));

  // ---------- 4) La rangée « Couleurs du modèle » ----------
  await realClick(page, TEXT_CARET);
  menu = await menuInfo(page);
  check(`${label} - la rangée montre la couleur composée, marquée ; « Personnalisé… » ne l'est pas (la couleur y est) ; le menu est toujours tout entier dans le panneau`, !!menu && sameList(menu.rowSwatches, ['#1e8449']) && sameList(menu.active, ['#1e8449']) && !menu.customActive && menu.inside, menu && { row: menu.rowSwatches, active: menu.active, inside: menu.inside });
  // Une autre couleur, pour que le clic sur la rangée change quelque chose.
  await realClick(page, swatchOf('#b91c1c'));
  await realClick(page, TEXT_CARET);
  await realClick(page, rowSwatch('#1e8449'));
  const back = await styleOf(page, '.tiptap p span');
  check(`${label} - UN clic sur la pastille de la rangée pose la couleur et referme le menu (${back && back.color})`, !(await menuInfo(page)) && !!back && back.color === toRgb('#1e8449'), back);
  // Des couleurs de plus, pour voir la croix : survol, clic, et la voisine qui prend sa place ne reçoit pas le clic.
  await page.evaluate(() => ['#7c3aed', '#0e7490', '#ca8a04'].forEach(color => ColorStore.add('model', color)));
  await realClick(page, TEXT_CARET);
  menu = await menuInfo(page);
  check(`${label} - quatre couleurs gardées, la plus récente en tête (${menu && menu.rowSwatches.join(' ')}), menu entier dans le panneau, chaque pastille sous le pointeur`, !!menu && sameList(menu.rowSwatches, ['#ca8a04', '#0e7490', '#7c3aed', '#1e8449']) && menu.inside && menu.unreachable.length === 0, menu && { row: menu.rowSwatches, inside: menu.inside, unreachable: menu.unreachable });
  const second = await boxOf(page, rowSwatch('#0e7490'));
  await page.mouse.move(second.x - 8, second.y, { steps: 2 });
  await page.mouse.move(second.x, second.y, { steps: 3 });
  await page.waitForTimeout(100);
  const cross = await page.evaluate((sel) => {
    const saved = document.querySelector(sel).closest('.cp-saved');
    const x = saved.querySelector('.cp-forget');
    const q = x.getBoundingClientRect();
    const m = x.closest('.v2-color-dropdown').getBoundingClientRect();
    const ratio = Math.round(window.__ratio(getComputedStyle(x).color, getComputedStyle(x).backgroundColor) * 100) / 100;
    return { shown: getComputedStyle(x).display !== 'none' && q.width > 0, w: q.width, h: q.height, x: q.left + q.width / 2, y: q.top + q.height / 2, inMenu: q.left >= m.left && q.right <= m.right && q.top >= m.top, ratio, title: x.title };
  }, rowSwatch('#0e7490'));
  check(`${label} - au survol d'une couleur gardée sa croix apparaît (${Math.round(cross.w)}x${Math.round(cross.h)} px, « ${cross.title} »), dans le menu, lisible (≥ 3:1 : ${cross.ratio})`, cross.shown && cross.w >= 14 && cross.h >= 14 && cross.inMenu && cross.ratio >= 3, cross);
  await page.mouse.move(cross.x, cross.y, { steps: 2 });
  await page.mouse.click(cross.x, cross.y);
  await page.waitForTimeout(200);
  menu = await menuInfo(page);
  const afterCross = await styleOf(page, '.tiptap p span');
  check(`${label} - un clic sur la croix retire la couleur (${menu && menu.rowSwatches.join(' ')}), laisse le menu ouvert et ne pose AUCUNE couleur : ni la sienne ni celle de la pastille qui a pris sa place (le texte reste ${afterCross && afterCross.color})`,
    !!menu && sameList(menu.rowSwatches, ['#ca8a04', '#7c3aed', '#1e8449']) && !!afterCross && afterCross.color === toRgb('#1e8449') && sameList(await keptColors(page), ['#ca8a04', '#7c3aed', '#1e8449']), { menu: menu && menu.rowSwatches, afterCross });
  // Suppr au clavier sur une pastille gardée.
  await page.focus(rowSwatch('#7c3aed'));
  await page.keyboard.press('Delete');
  await page.waitForTimeout(150);
  menu = await menuInfo(page);
  const focusedColor = await page.evaluate(() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.color);
  check(`${label} - Suppr sur une pastille gardée la retire (${menu && menu.rowSwatches.join(' ')}) et le focus passe à la première qui reste (${focusedColor})`, !!menu && sameList(menu.rowSwatches, ['#ca8a04', '#1e8449']) && focusedColor === '#ca8a04', { row: menu && menu.rowSwatches, focusedColor });
  await page.keyboard.press('Escape');
  await page.mouse.click(WIDTH - 8, HEIGHT - 8);
  await page.waitForTimeout(120);

  // ---------- 4 bis) La rangée « Couleurs du document » ----------
  // Le document n'a encore rien gardé : la rangée est là, vide, sous celle du modèle ; la fenêtre y garde une couleur (sa case se coche à la vraie souris).
  await freshText(page);
  await page.evaluate(() => { ColorStore.add('model', '#1e8449'); ColorStore.add('model', '#ca8a04'); });
  await realClick(page, TEXT_CARET);
  lay = await layoutInfo(page);
  check(`${label} - la rangée du document est vide (« Aucune ») à côté de celle du modèle, qui garde ses deux couleurs (${lay && lay.rows[0].colors.join(' ')})`, !!lay && lay.rows[1].scope === 'document' && lay.rows[1].empty && sameList(lay.rows[0].colors, ['#ca8a04', '#1e8449']), lay && lay.rows.map(r => [r.scope, r.colors]));
  await realClick(page, `${MENU} .cp-custom`);
  await page.waitForTimeout(150);
  const boxes = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-color-modal .pp-color-keep-row input')).map(input => ({ scope: input.value, checked: input.checked, label: input.closest('label').textContent.trim(), title: input.closest('label').title })));
  check(`${label} - la fenêtre propose deux cases : « Couleurs du modèle » cochée, « Couleurs du document » décochée, chacune avec son infobulle (${boxes.map(b => b.title).join(' / ')})`,
    boxes.length === 2 && boxes[0].scope === 'model' && boxes[0].checked && boxes[0].label === 'Couleurs du modèle' && boxes[1].scope === 'document' && !boxes[1].checked && boxes[1].label === 'Couleurs du document' && boxes.every(b => b.title.length > 10), boxes);
  dialog = await dialogInfo(page);
  check(`${label} - avec ses deux cases la fenêtre tient toujours dans le panneau (${dialog && dialog.box.join(',')}) sans défiler, tout est sous le pointeur`, !!dialog && dialog.inside && !dialog.scrolls && dialog.titleAtTop && dialog.actionsAtBottom && dialog.hidden.length === 0 && dialog.outside.length === 0 && dialog.controls >= 10, dialog);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('0E7490');
  const tablesBefore = (await storedSettings(page)).tables;
  await page.evaluate(() => window.__gristStub.clearActionLog());
  const docBox = await realClick(page, `${MODAL} .pp-color-keep-row input[value="document"]`);
  check(`${label} - un clic sur la case « Couleurs du document » (${docBox && Math.round(docBox.w)}x${docBox && Math.round(docBox.h)} px, dans la fenêtre) la coche, celle du modèle reste cochée`,
    !!docBox && docBox.inViewport && await page.evaluate(() => Array.from(document.querySelectorAll('#pp-color-modal .pp-color-keep-row input')).map(i => i.checked).join() === 'true,true'), docBox);
  await realClick(page, `${MODAL} .var-modal-primary`);
  const teal = await styleOf(page, '.tiptap p span');
  check(`${label} - « Appliquer » pose #0E7490 (${teal && teal.color}) et le garde dans les DEUX rangées : modèle ${JSON.stringify(await keptColors(page))}, document ${JSON.stringify(await documentColors(page))}`,
    !(await dialogShown(page)) && !!teal && teal.color === toRgb('#0e7490') && sameList(await keptColors(page), ['#0e7490', '#ca8a04', '#1e8449']) && sameList(await documentColors(page), ['#0e7490']), { teal });
  await page.waitForTimeout(500);
  let stored = await storedSettings(page);
  check(`${label} - Grist garde la couleur du document dans UNE ligne réservée de la table des modèles (${JSON.stringify(stored.json)}), sans table de plus (${stored.addTables} création de table)`,
    stored.rows === 1 && sameList(stored.json, { colors: ['#0e7490'] }) && stored.addTables === 0 && sameList(stored.tables, tablesBefore), stored);
  await realClick(page, TEXT_CARET);
  lay = await layoutInfo(page);
  check(`${label} - rouvert, le menu montre #0E7490 dans les deux rangées (modèle ${lay && lay.rows[0].colors.join(' ')} ; document ${lay && lay.rows[1].colors.join(' ')}), toutes deux marquées`,
    !!lay && sameList(lay.rows[0].colors, ['#0e7490', '#ca8a04', '#1e8449']) && sameList(lay.rows[1].colors, ['#0e7490']) && sameList((await menuInfo(page)).active, ['#0e7490', '#0e7490']), lay && lay.rows.map(r => r.colors));
  // Un clic sur une couleur du document la pose (une autre couleur d'abord, pour que le clic change quelque chose).
  await realClick(page, swatchOf('#b91c1c'));
  await realClick(page, TEXT_CARET);
  await realClick(page, scopedSwatch('document', '#0e7490'));
  const fromDocument = await styleOf(page, '.tiptap p span');
  check(`${label} - UN clic sur la pastille de la rangée du document pose la couleur et referme le menu (${fromDocument && fromDocument.color})`, !(await menuInfo(page)) && !!fromDocument && fromDocument.color === toRgb('#0e7490'), fromDocument);
  // La croix : la même couleur est dans les deux rangées, celle du document la retire de CETTE rangée seulement, et rien ne se pose.
  await page.evaluate(() => { ColorStore.add('document', '#ca8a04'); ColorStore.add('document', '#7c3aed'); });
  await realClick(page, TEXT_CARET);
  lay = await layoutInfo(page);
  check(`${label} - le document garde trois couleurs, la plus récente en tête (${lay && lay.rows[1].colors.join(' ')}), dont #CA8A04 qui est aussi dans le modèle (${lay && lay.rows[0].colors.join(' ')})`,
    !!lay && sameList(lay.rows[1].colors, ['#7c3aed', '#ca8a04', '#0e7490']) && lay.rows[0].colors.includes('#ca8a04'), lay && lay.rows.map(r => r.colors));
  const dupe = await boxOf(page, scopedSwatch('document', '#ca8a04'));
  await page.mouse.move(dupe.x - 8, dupe.y, { steps: 2 });
  await page.mouse.move(dupe.x, dupe.y, { steps: 3 });
  await page.waitForTimeout(100);
  const crossDoc = await page.evaluate((sel) => { const x = document.querySelector(sel).closest('.cp-saved').querySelector('.cp-forget'); const q = x.getBoundingClientRect(); const m = x.closest('.v2-color-dropdown').getBoundingClientRect(); return { shown: getComputedStyle(x).display !== 'none' && q.width > 0, x: q.left + q.width / 2, y: q.top + q.height / 2, inMenu: q.left >= m.left && q.right <= m.right && q.top >= m.top && q.bottom <= m.bottom, scope: x.dataset.action }; }, scopedSwatch('document', '#ca8a04'));
  check(`${label} - au survol d'une couleur du document sa croix apparaît dans le menu (${crossDoc.scope})`, crossDoc.shown && crossDoc.inMenu && crossDoc.scope === 'forget:document:#ca8a04', crossDoc);
  await page.mouse.move(crossDoc.x, crossDoc.y, { steps: 2 });
  await page.mouse.click(crossDoc.x, crossDoc.y);
  await page.waitForTimeout(250);
  lay = await layoutInfo(page);
  const afterDocCross = await styleOf(page, '.tiptap p span');
  check(`${label} - la croix retire #CA8A04 du DOCUMENT seulement (document ${lay && lay.rows[1].colors.join(' ')}, modèle ${lay && lay.rows[0].colors.join(' ')}), laisse le menu ouvert et ne pose rien : ni elle ni sa voisine (le texte reste ${afterDocCross && afterDocCross.color})`,
    !!lay && sameList(lay.rows[1].colors, ['#7c3aed', '#0e7490']) && lay.rows[0].colors.includes('#ca8a04') && !!afterDocCross && afterDocCross.color === toRgb('#0e7490') && sameList(await documentColors(page), ['#7c3aed', '#0e7490']), { lay: lay && lay.rows.map(r => r.colors), afterDocCross });
  await page.focus(scopedSwatch('document', '#7c3aed'));
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(150);
  lay = await layoutInfo(page);
  check(`${label} - Retour arrière sur une couleur du document la retire (${lay && lay.rows[1].colors.join(' ')}), celles du modèle n'ont pas bougé (${lay && lay.rows[0].colors.join(' ')})`, !!lay && sameList(lay.rows[1].colors, ['#0e7490']) && sameList(lay.rows[0].colors, ['#0e7490', '#ca8a04', '#1e8449']), lay && lay.rows.map(r => r.colors));
  // Le choix des cases est gardé d'une fenêtre à l'autre : « Couleurs du document » reste cochée, on la décoche (la suite repart d'un document sans couleur).
  await page.keyboard.press('Escape');
  await page.mouse.click(WIDTH - 8, HEIGHT - 8);
  await realClick(page, TEXT_CARET);
  await realClick(page, `${MENU} .cp-custom`);
  await page.waitForTimeout(150);
  const remembered = () => page.evaluate(() => Array.from(document.querySelectorAll('#pp-color-modal .pp-color-keep-row input')).map(input => input.checked));
  const rememberedFirst = await remembered();
  check(`${label} - la fenêtre se rouvre avec le choix d'avant : « Couleurs du document » est restée cochée (${rememberedFirst.join(', ')})`, sameList(rememberedFirst, [true, true]), rememberedFirst);
  await realClick(page, `${MODAL} .pp-color-keep-row input[value="document"]`);
  const rememberedAfter = await remembered();
  check(`${label} - un clic sur la case la décoche (${rememberedAfter.join(', ')}) ; Échap ferme la fenêtre sans rien garder`, sameList(rememberedAfter, [true, false]), rememberedAfter);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check(`${label} - rien n'a été gardé en plus : document ${JSON.stringify(await documentColors(page))}, modèle ${JSON.stringify(await keptColors(page))}`, !(await dialogShown(page)) && sameList(await documentColors(page), ['#0e7490']) && sameList(await keptColors(page), ['#0e7490', '#ca8a04', '#1e8449']), { doc: await documentColors(page), model: await keptColors(page) });
  // Dix couleurs dans chaque rangée : le menu garde sa hauteur (deux lignes de cinq dans la colonne de droite), rien ne glisse sous le pied, tout est sous le pointeur.
  await page.evaluate(() => {
    ['#7c3aed', '#be123c', '#0f766e', '#4338ca', '#9a3412', '#334155', '#a21caf', '#0369a1', '#15803d', '#ca8a04'].forEach(color => ColorStore.add('model', color));
    ['#111827', '#7f1d1d', '#14532d', '#1e3a8a', '#4c1d95', '#831843', '#713f12', '#164e63', '#3f6212', '#9f1239'].forEach(color => ColorStore.add('document', color));
  });
  await page.keyboard.press('Escape');
  await page.mouse.click(WIDTH - 8, HEIGHT - 8);
  await realClick(page, TEXT_CARET);
  lay = await layoutInfo(page);
  menu = await menuInfo(page);
  check(`${label} - avec dix couleurs dans chaque rangée le menu mesure ${lay && Math.round(lay.menu.h)} px (au plus 207), reste tout entier dans le panneau, ses ${menu && menu.n} boutons sont sous le pointeur, aucun de moins de 19 px`,
    !!lay && !!menu && lay.rows[0].colors.length === 10 && lay.rows[1].colors.length === 10 && lay.menu.h <= 207 && menu.inside && menu.unreachable.length === 0 && menu.small === 0 && menu.n === 72 && !menu.clipped, { h: lay && lay.menu.h, menu });
  check(`${label} - les rangées pleines restent à droite de la palette et de son pied, l'une sous l'autre (rangée du document jusqu'à ${lay && Math.round(lay.rows[1].bottom)}, pied jusqu'à ${lay && Math.round(lay.footer.bottom)}), sur deux lignes de cinq (${lay && Math.round(lay.rows[0].h)} px chacune)`,
    !!lay && lay.rows.every(r => r.left >= lay.grid.right && r.left >= lay.footer.right - 1 && r.w <= 117) && lay.rows[1].top >= lay.rows[0].bottom - 0.5 && lay.rows[0].h > 50, lay);
  await page.keyboard.press('Escape');
  await page.mouse.click(WIDTH - 8, HEIGHT - 8);
  // Le document est remis à zéro pour la suite (les rangées du modèle repartent d'un modèle neuf à chaque texte).
  await page.evaluate(() => Templates.updateDocumentSettings({ colors: null }));
  await page.waitForTimeout(500);
  stored = await storedSettings(page);
  check(`${label} - le document remis à zéro garde sa ligne réservée, sans couleur (${JSON.stringify(stored.json)}), et toujours aucune table de plus`, stored.rows === 1 && sameList(stored.json, {}) && stored.addTables === 0, stored);

  // ---------- 5) Le surlignage ----------
  await freshText(page);
  await realClick(page, HIGHLIGHT_CARET);
  menu = await menuInfo(page);
  check(`${label} - le menu du surlignage est tout entier dans le panneau, 50 pastilles, « Aucun » ; la rangée du modèle y est aussi (${menu && menu.rowSwatches.length} couleur(s) gardée(s))`, !!menu && menu.inside && menu.swatches === 50 && menu.unreachable.length === 0 && menu.rowSwatches.length === 0, menu && { inside: menu.inside, swatches: menu.swatches, unreachable: menu.unreachable });
  await realClick(page, swatchOf('#fff2a8'));
  const mark2 = await styleOf(page, '.tiptap p span');
  check(`${label} - un clic sur le jaune pose le surlignage (${mark2 && mark2.background}) et referme le menu`, !(await menuInfo(page)) && !!mark2 && mark2.background === toRgb('#fff2a8'), mark2);
  await realClick(page, HIGHLIGHT_CARET);
  menu = await menuInfo(page);
  check(`${label} - rouvert, le menu marque le jaune posé`, !!menu && sameList(menu.active, ['#fff2a8']), menu && menu.active);
  await realClick(page, `${MENU} [data-action="none"]`);
  const noMark = await styleOf(page, '.tiptap p span');
  check(`${label} - « Aucun » retire le surlignage`, !(await menuInfo(page)) && (!noMark || noMark.background === 'rgba(0, 0, 0, 0)'), noMark);

  // ---------- 6) Le fond d'une case : la barre du tableau revient après la fenêtre ----------
  await page.evaluate(() => { PageLayout.setMarginsMm(null); Editor.setHTML('<p>Avant</p><table><tbody><tr><td><p>Alpha</p></td><td><p>Beta</p></td></tr><tr><td><p>Gamma</p></td><td><p>Delta</p></td></tr></tbody></table><p>Après</p>'); });
  await page.waitForTimeout(300);
  await realClick(page, '.tiptap table tr:nth-child(1) > td:nth-child(1)');
  await page.waitForTimeout(250);
  const barFill = '.v2-floating-toolbar.visible button[data-action="fill-open"]';
  const bar = await boxOf(page, barFill);
  check(`${label} - la barre du tableau est là, son bouton « Fond de cellule » dans le panneau`, !!bar && bar.inViewport, bar);
  await realClick(page, barFill);
  menu = await menuInfo(page);
  check(`${label} - le menu du fond est tout entier dans le panneau (${menu && Math.round(menu.top)} -> ${menu && Math.round(menu.bottom)}), 50 pastilles, « Aucun », chaque bouton sous le pointeur`, !!menu && menu.inside && menu.swatches === 50 && menu.unreachable.length === 0 && menu.small === 0, menu && { inside: menu.inside, bottom: menu.bottom, unreachable: menu.unreachable });
  await realClick(page, `${MENU} .cp-custom`);
  await page.waitForTimeout(150);
  check(`${label} - « Personnalisé… » du fond ouvre la fenêtre`, await dialogShown(page));
  await page.keyboard.press('Control+a');
  await page.keyboard.type('0369a1');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const cell = await styleOf(page, '.tiptap table tr:nth-child(1) > td:nth-child(1)');
  check(`${label} - Entrée applique : la case prend le fond (${cell && cell.background}), la fenêtre est fermée`, !(await dialogShown(page)) && !!cell && cell.background === toRgb('#0369a1'), cell);
  const barBack = await boxOf(page, barFill);
  check(`${label} - la barre du tableau est revenue (le curseur est resté dans la case) et le trait de son bouton « Fond » a pris la couleur`, !!barBack && barBack.inViewport && (await page.evaluate(() => getComputedStyle(document.getElementById('v2-table-fill-bar')).backgroundColor)) === toRgb('#0369a1'), barBack);
  await page.mouse.click(WIDTH - 8, HEIGHT - 8);

  // ---------- 7) L'anglais ----------
  await page.evaluate(() => { I18n.setLang('en'); });
  await page.waitForTimeout(200);
  await freshText(page);
  await page.evaluate(() => ColorStore.add('model', '#1e8449'));
  await realClick(page, TEXT_CARET);
  menu = await menuInfo(page);
  const english = await page.evaluate(() => { const m = document.querySelector('.v2-color-dropdown.visible'); const names = Array.from(m.querySelectorAll('.cp-row-label')).map(e => e.textContent.trim()); return { row: names[0], document: names[1], empty: m.querySelector('.cp-row.is-empty .cp-row-empty').textContent.trim(), custom: m.querySelector('.cp-custom').textContent.trim(), none: m.querySelector('[data-action="none"]').textContent.trim() }; });
  lay = await layoutInfo(page);
  check(`${label} - en anglais : « ${english.row} », « ${english.document} » (« ${english.empty} »), « ${english.custom} », « ${english.none} », le menu reste entier dans le panneau et son pied sur une ligne`, english.row === 'Template colors' && english.document === 'Document colors' && english.empty === 'None' && english.custom === 'Custom…' && english.none === 'Default' && !!menu && menu.inside && menu.footerOneRow && !!lay && lay.rows.every(r => !r.clipped), { english, inside: menu && menu.inside });
  await realClick(page, `${MENU} .cp-custom`);
  dialog = await dialogInfo(page);
  const englishDialog = await page.evaluate(() => ({ title: document.getElementById('pp-color-title').textContent.trim(), ok: document.querySelector('#pp-color-modal .var-modal-primary').textContent.trim(), keep: document.querySelector('#pp-color-modal .pp-color-keep-legend').textContent.trim(), boxes: Array.from(document.querySelectorAll('#pp-color-modal .pp-color-keep-row')).map(row => row.textContent.trim()) }));
  check(`${label} - la fenêtre en anglais (« ${englishDialog.title} », « ${englishDialog.ok} », « ${englishDialog.keep} », cases « ${englishDialog.boxes.join(' », « ')} ») tient aussi dans le panneau sans défiler`, englishDialog.title === 'Custom color' && englishDialog.ok === 'Apply' && sameList(englishDialog.boxes, ['Template colors', 'Document colors']) && !!dialog && dialog.inside && !dialog.scrolls && dialog.hidden.length === 0 && dialog.outside.length === 0, { englishDialog, dialog });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check(`${label} - Échap ferme la fenêtre sans rien poser`, !(await dialogShown(page)) && (await editorFocused(page)), await editorFocused(page));
  await page.evaluate(() => { I18n.setLang('fr'); });

  await context.close();
}

// Un panneau haut (TALL px) : les deux rangées de couleurs gardées se posent SOUS la palette, l'une sous l'autre, leur nom au-dessus de leurs pastilles.
async function runTall(theme) {
  const label = (theme === 'dark' ? 'sombre' : 'clair') + ', panneau haut';
  console.log(`\n=== Les deux rangées dans un panneau haut, ${WIDTH}x${TALL}, thème ${theme === 'dark' ? 'sombre' : 'clair'} ===`);
  const { context, page } = await openWidget(theme, { width: WIDTH, height: TALL });
  await page.evaluate(`window.__ratio = ${CONTRAST_FN};`);
  await freshText(page);
  await page.evaluate(() => { ['#7c3aed', '#0e7490'].forEach(color => ColorStore.add('model', color)); ['#ca8a04', '#1e8449', '#be123c'].forEach(color => ColorStore.add('document', color)); });
  await page.waitForTimeout(300);
  await realClick(page, TEXT_CARET);
  const lay = await layoutInfo(page);
  const menu = await menuInfo(page);
  check(`${label} - le menu s'ouvre tout entier dans le panneau (${lay && Math.round(lay.menu.h)} px de haut), ses ${menu && menu.n} boutons sont sous le pointeur, aucun de moins de 19 px`, !!menu && menu.opened && menu.inside && menu.n === 57 && menu.unreachable.length === 0 && menu.small === 0 && !menu.clipped, menu);
  check(`${label} - les deux rangées sont SOUS la palette (palette jusqu'à ${lay && Math.round(lay.grid.bottom)}, rangées dès ${lay && Math.round(lay.rows[0].top)}), alignées à gauche avec elle, l'une sous l'autre, au-dessus du pied`,
    !!lay && lay.rows.length === 2 && lay.rows.every(r => r.top >= lay.grid.bottom && Math.abs(r.left - lay.grid.left) <= 1 && r.bottom <= lay.footer.top) && lay.rows[1].top >= lay.rows[0].bottom - 0.5, lay);
  check(`${label} - le nom de chaque rangée est lu en entier, au-dessus de ses pastilles : « ${lay && lay.rows.map(r => r.label).join(' », « ')} »`,
    !!lay && lay.rows.every(r => !r.clipped && r.firstSwatchTop !== null && r.labelBottom <= r.firstSwatchTop) && sameList(lay.rows[0].colors, ['#0e7490', '#7c3aed']) && sameList(lay.rows[1].colors, ['#be123c', '#1e8449', '#ca8a04']), lay);
  const tallCross = await boxOf(page, scopedSwatch('model', '#7c3aed'));
  await page.mouse.move(tallCross.x - 8, tallCross.y, { steps: 2 });
  await page.mouse.move(tallCross.x, tallCross.y, { steps: 3 });
  await page.waitForTimeout(100);
  const cross = await page.evaluate((sel) => { const x = document.querySelector(sel).closest('.cp-saved').querySelector('.cp-forget'); const q = x.getBoundingClientRect(); const m = x.closest('.v2-color-dropdown').getBoundingClientRect(); return { shown: getComputedStyle(x).display !== 'none' && q.width > 0, x: q.left + q.width / 2, y: q.top + q.height / 2, inMenu: q.left >= m.left && q.right <= m.right && q.top >= m.top && q.bottom <= m.bottom }; }, scopedSwatch('model', '#7c3aed'));
  await page.mouse.move(cross.x, cross.y, { steps: 2 });
  await page.mouse.click(cross.x, cross.y);
  await page.waitForTimeout(250);
  check(`${label} - la croix d'une couleur du modèle est dans le menu et la retire du modèle seulement (modèle ${JSON.stringify(await keptColors(page))}, document ${JSON.stringify(await documentColors(page))}), sans rien poser`,
    cross.shown && cross.inMenu && sameList(await keptColors(page), ['#0e7490']) && sameList(await documentColors(page), ['#be123c', '#1e8449', '#ca8a04']) && !(await styleOf(page, '.tiptap p span')) && !!(await menuInfo(page)), cross);
  await realClick(page, scopedSwatch('document', '#be123c'));
  const picked = await styleOf(page, '.tiptap p span');
  check(`${label} - un clic sur une couleur du document pose #BE123C (${picked && picked.color}) et referme le menu`, !(await menuInfo(page)) && !!picked && picked.color === toRgb('#be123c') && (await editorFocused(page)), picked);
  await context.close();
}

await runTheme('light');
await runTheme('dark');
await runTall('light');
await runTall('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
