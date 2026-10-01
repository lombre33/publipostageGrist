#!/usr/bin/env node
// Barre de la case d'une grille (lot « fusion, bordures, alignement vertical », demande d'Antoine du 01/10) à la VRAIE souris (page.mouse, Node/Playwright), à la taille du panneau
// Grist (~700x400), en thème clair puis sombre. Une page.evaluate ne déclenche ni un appui « trusted », ni le survol, ni le glissé : c'est ici qu'on s'assure que
//   - la barre de la case porte, dans sa bande et sur une seule ligne, les boutons Lignes, Colonnes, Fusion, Fond, Bordures, Alignement vertical (dans cet ordre), ceux qui n'ont pas de sens
//     grisés et jamais retirés (« Fusionner » sans plusieurs cases choisies, « Scinder » sur une case non fusionnée, « Supprimer le tableau ») ;
//   - glisser sur un bloc de cases puis cliquer « Fusionner » en fait UNE case (colspan, rowspan), qui garde la taille des colonnes et des lignes et le texte de toutes les cases ;
//     « Scinder » rend les cases ; chacun est annulé par UN Ctrl+Z ;
//   - fusionner toutes les lignes de deux colonnes de largeurs différentes ne les remet pas à la largeur par défaut, tirer le bord d'une de ces colonnes ne règle que la sienne ;
//   - « Aligner en haut / au milieu / en bas » s'applique à toutes les cases choisies en une transaction, le bouton enfoncé dit l'alignement des cases choisies (aucun quand elles diffèrent) ;
//   - hors d'une grille, la barre d'un tableau de document n'a aucun de ces boutons et flotte comme avant.
// Lancé par run-headless.mjs (groupe Node « gridCellsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-grid-cells-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.GRID_CELLS_PORT || 8914);
const WIDTH = 700;
const HEIGHT = 400;

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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/html2pdf\.bundle\.min\.js$/, 'umd/html2pdf.bundle.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/exceljs\.min\.js$/, 'umd/exceljs.min.js'],
].filter(([, rel]) => rel !== 'umd/exceljs.min.js' || existsSync(join(CACHE, rel))) : [];
if (!OFFLINE) console.log('[verify-grid-cells-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
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
  await page.waitForTimeout(120);
  return b;
}

// Le centre de la case LOGIQUE (ligne r, colonne c, depuis 1) : au milieu de sa colonne et de sa ligne, qu'une case fusionnée la recouvre ou non.
const gridPoint = (page, r, c) => page.evaluate(([row, col]) => {
  const colEl = document.querySelectorAll('.tiptap table > colgroup > col')[col - 1];
  const rowEl = document.querySelectorAll('.tiptap table > tbody > tr')[row - 1];
  if (!colEl || !rowEl) return null;
  const a = colEl.getBoundingClientRect(), b = rowEl.getBoundingClientRect();
  return { x: a.left + a.width / 2, y: b.top + b.height / 2 };
}, [r, c]);

// Appuie sur la case `from`, glisse sur la case `to`, relâche : une sélection de cases.
async function dragGrid(page, from, to) {
  const a = await gridPoint(page, from[0], from[1]);
  const b = await gridPoint(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y, { steps: 2 });
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(120);
}

async function clickGrid(page, r, c) {
  const p = await gridPoint(page, r, c);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(100);
}

const colWidths = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table > colgroup > col')).map(c => Math.round(c.getBoundingClientRect().width * 10) / 10));
const rowHeights = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table > tbody > tr')).map(r => Math.round(r.getBoundingClientRect().height * 10) / 10));
const sameList = (a, b, tolerance = 0.6) => !!a && !!b && a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= tolerance);

// Les cases du tableau telles que le document les porte : forme, texte (un élément par paragraphe), alignement, largeur enregistrée.
const cellsOf = page => page.evaluate(() => {
  const doc = EditorCore.getEditor().state.doc;
  const out = [];
  doc.child(0).forEach((row, _o, r) => row.forEach(cell => out.push({
    row: r + 1, colspan: cell.attrs.colspan, rowspan: cell.attrs.rowspan, valign: cell.attrs.verticalAlign, colwidth: cell.attrs.colwidth,
    paragraphs: Array.from({ length: cell.childCount }, (_, i) => cell.child(i).textContent),
  })));
  return out;
});
const mergedOf = cells => cells.find(c => c.colspan > 1 || c.rowspan > 1) || null;
const selectedCount = page => page.evaluate(() => {
  const sel = EditorCore.getEditor().state.selection;
  return sel.$anchorCell ? document.querySelectorAll('.tiptap td.selectedCell, .tiptap th.selectedCell').length : 0;
});

async function loadGrid(page, html) {
  await page.evaluate(h => {
    GridEditor.setActive(false);
    Editor.setHTML(h);
    GridEditor.setActive(true);
    const box = document.getElementById('editor-container');
    box.scrollTop = 0; box.scrollLeft = 0;
  }, html);
  await page.waitForTimeout(500);
}
// Une grille aux dimensions connues : `widths` (px, par colonne), `heights` (px, par ligne), `text(r, c)` le texte de chaque case.
const gridHtml = (widths, heights, text) => `<table style="width: ${widths.reduce((s, w) => s + w, 0)}px;"><colgroup>${widths.map(w => `<col style="width: ${w}px;">`).join('')}</colgroup><tbody>`
  + heights.map((h, r) => `<tr data-row-height="${h}" style="height: ${h}px">${widths.map((w, c) => `<td colwidth="${w}"><p>${text(r + 1, c + 1)}</p></td>`).join('')}</tr>`).join('') + '</tbody></table>';

// « + » puis « Nouvelle grille » à la vraie souris : une grille de départ toute neuve (une grille déjà modifiée ouvre d'abord « Modifications non enregistrées » : « Abandonner »).
async function freshGrid(page) {
  const newBtn = await boxOf(page, '#btn-new');
  await page.mouse.move(newBtn.x, newBtn.y, { steps: 3 });
  await page.waitForTimeout(350);
  const entry = await boxOf(page, '#v2-btn-new-grid');
  await page.mouse.move(entry.x, entry.y, { steps: 4 });
  await page.mouse.click(entry.x, entry.y);
  await page.waitForTimeout(250);
  const discard = await page.evaluate(() => {
    const ov = document.getElementById('pp-dialog-modal');
    if (!ov || getComputedStyle(ov).display === 'none') return null;
    const button = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).find(b => b.textContent === 'Abandonner');
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (discard) {
    await page.mouse.move(discard.x - 10, discard.y, { steps: 2 });
    await page.mouse.click(discard.x, discard.y);
  }
  await page.waitForFunction(() => GridEditor.isActive() && document.querySelectorAll('.v2-grid-colhead').length > 0, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10);
}

// Contraste WCAG de deux couleurs CSS « rgb(...) ».
const CONTRAST_FN = `(a, b) => {
  const parse = c => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const la = lum(parse(a)), lb = lum(parse(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}`;

const BAR = '.v2-cell-bar-dock .v2-floating-toolbar';
const button = action => `${BAR} button[data-action="${action}"]`;
// Chaque bouton de la barre : visible, grisé, enfoncé, dans la bande ; la hauteur de la barre.
const barState = page => page.evaluate((sel) => {
  const bar = document.querySelector(sel);
  const dockEl = document.getElementById('v2-cell-bar-dock');
  if (!bar || !dockEl) return null;
  const dock = dockEl.getBoundingClientRect();
  const buttons = {};
  const order = [];
  bar.querySelectorAll('button[data-action]').forEach(b => {
    const r = b.getBoundingClientRect();
    const shown = getComputedStyle(b).display !== 'none' && r.width > 0;
    if (shown) order.push([r.left, b.dataset.action]);
    buttons[b.dataset.action] = {
      shown, locked: b.classList.contains('v2-hf-locked'), active: b.classList.contains('is-active'), pressed: b.getAttribute('aria-pressed'), title: b.title, opacity: Number(getComputedStyle(b).opacity),
      inside: r.left >= dock.left - 0.5 && r.right <= dock.right + 0.5 && r.top >= dock.top - 0.5 && r.bottom <= dock.bottom + 0.5,
    };
  });
  order.sort((a, b) => a[0] - b[0]);
  const r = bar.getBoundingClientRect();
  return { buttons, order: order.map(o => o[1]), height: r.height, dockHeight: dock.height, dockShown: getComputedStyle(dockEl).display !== 'none' };
}, BAR);

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Barre de la case d'une grille à la souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);
  await freshGrid(page);
  await page.evaluate(`window.__ratio = ${CONTRAST_FN};`);

  // ---------- 1) La barre, curseur dans la première case ----------
  await clickGrid(page, 1, 1);
  const SHOWN = ['row-before', 'row-after', 'row-del', 'col-before', 'col-after', 'col-del', 'table-del', 'cell-merge', 'cell-split', 'caption', 'fill-open', 'borders-open', 'valign-top', 'valign-middle', 'valign-bottom'];
  let bar = await barState(page);
  check(`${label} - la barre de la case porte ses 15 boutons dans l'ordre Lignes, Colonnes, Fusion, Légende, Fond, Bordures, Alignement vertical, tous dans la bande, sur une seule ligne à ${WIDTH} px`,
    !!bar && bar.dockShown && bar.order.join() === SHOWN.join() && SHOWN.every(a => bar.buttons[a].inside) && bar.height <= 34 && bar.dockHeight <= 40, { order: bar && bar.order, height: bar && bar.height, dock: bar && bar.dockHeight });
  check(`${label} - « Fusionner les cases », « Scinder la case » et « Supprimer le tableau » sont grisés (pas retirés) quand une seule case est choisie`,
    !!bar && ['cell-merge', 'cell-split', 'table-del'].every(a => bar.buttons[a].locked && bar.buttons[a].shown && bar.buttons[a].opacity < 0.5) && !['row-before', 'col-after', 'fill-open', 'valign-top'].some(a => bar.buttons[a].locked), bar && bar.buttons);
  check(`${label} - « Légende » est grisée (pas retirée) dans la barre de la case, avec sa raison pour nom : une grille n'a pas de légende`,
    !!bar && !!bar.buttons.caption && bar.buttons.caption.shown && bar.buttons.caption.opacity < 0.5 && bar.buttons.caption.title === 'Pas de légende dans une grille', bar && bar.buttons.caption);
  check(`${label} - au départ chaque case est au milieu : « Aligner au milieu » est enfoncé, ni le haut ni le bas`,
    !!bar && bar.buttons['valign-middle'].active && bar.buttons['valign-middle'].pressed === 'true' && !bar.buttons['valign-top'].active && bar.buttons['valign-top'].pressed === 'false' && !bar.buttons['valign-bottom'].active, bar && bar.buttons);
  const contrast = await page.evaluate(([on, off]) => {
    const pressed = getComputedStyle(document.querySelector(on)), plain = getComputedStyle(document.querySelector(off));
    const band = getComputedStyle(document.getElementById('v2-cell-bar-dock')).backgroundColor;
    return { pressed: Math.round(window.__ratio(pressed.color, pressed.backgroundColor) * 100) / 100, plain: Math.round(window.__ratio(plain.color, band) * 100) / 100 };
  }, [button('valign-middle'), button('valign-top')]);
  check(`${label} - contraste des icônes de la barre (≥ 3:1) : enfoncée ${contrast.pressed}, normale ${contrast.plain}`, contrast.pressed >= 3 && contrast.plain >= 3, contrast);
  check(`${label} - les infobulles sont en français : Fusionner les cases, Scinder la case, Aligner en haut, au milieu, en bas`,
    !!bar && bar.buttons['cell-merge'].title === 'Fusionner les cases' && bar.buttons['cell-split'].title === 'Scinder la case' && bar.buttons['valign-top'].title === 'Aligner en haut'
    && bar.buttons['valign-middle'].title === 'Aligner au milieu' && bar.buttons['valign-bottom'].title === 'Aligner en bas', bar && Object.entries(bar.buttons).map(([k, v]) => k + ':' + v.title));
  const noopBefore = (await cellsOf(page)).length;
  await realClick(page, button('cell-split'));
  await realClick(page, button('cell-merge'));
  check(`${label} - un clic sur un bouton grisé ne fait rien`, (await cellsOf(page)).length === noopBefore && !mergedOf(await cellsOf(page)), noopBefore);

  // Le dernier menu ouvert passe au-dessus de la barre de la case : le menu « + » descend sur la bande, ses lignes (« Nouvelle grille ») doivent être sous le pointeur - la barre, élargie
  // à 13 boutons, les recouvrait (son z-index de 2000 s'applique à l'enfant d'une bande flex) et un clic sur « Nouvelle grille » tombait sur « Aligner en haut ».
  const plusBtn = await boxOf(page, '#btn-new');
  await page.mouse.move(plusBtn.x, plusBtn.y, { steps: 3 });
  await page.waitForTimeout(450);
  const plusMenu = await page.evaluate(() => {
    const dock = document.getElementById('v2-cell-bar-dock').getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll('#v2-new-template-flyout .v2-hover-row')).map(row => {
      const r = row.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return { id: row.id, overBand: r.bottom > dock.top && r.top < dock.bottom && r.right > dock.left, reachable: !!top && (top === row || row.contains(top)), under: top && (top.dataset.action || top.id || top.tagName) };
    });
    return { rows, band: [dock.top, dock.bottom] };
  });
  check(`${label} - le menu « + » reste au-dessus de la barre de la case : ses lignes qui tombent sur la bande (dont « Nouvelle grille ») sont sous le pointeur`,
    plusMenu.rows.length >= 2 && plusMenu.rows.some(row => row.overBand) && plusMenu.rows.every(row => row.reachable) && plusMenu.rows.find(row => row.id === 'v2-btn-new-grid') && plusMenu.rows.find(row => row.id === 'v2-btn-new-grid').reachable, plusMenu);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10, { steps: 3 });
  await page.waitForTimeout(450);

  // ---------- 2) Fusionner, scinder, annuler ----------
  const widths0 = await colWidths(page);
  const heights0 = await rowHeights(page);
  await clickGrid(page, 2, 2);
  await page.keyboard.type('x1');
  await clickGrid(page, 2, 3);
  await page.keyboard.type('x2');
  // Deux gestes à moins de 500 ms l'un de l'autre sont UN seul évènement d'historique (prosemirror-history, newGroupDelay) : on les espace pour compter les Ctrl+Z.
  await page.waitForTimeout(650);
  await dragGrid(page, [2, 2], [3, 3]);
  check(`${label} - glisser de B2 à C3 sélectionne 4 cases : « Fusionner » est actif, « Scinder » reste grisé`, (await selectedCount(page)) === 4 && await page.evaluate(([m, s]) => !document.querySelector(m).classList.contains('v2-hf-locked') && document.querySelector(s).classList.contains('v2-hf-locked'), [button('cell-merge'), button('cell-split')]), await selectedCount(page));
  await realClick(page, button('cell-merge'));
  const merged = mergedOf(await cellsOf(page));
  const afterMerge = await cellsOf(page);
  check(`${label} - « Fusionner » (vrai clic) fait UNE case de 2 colonnes et 2 lignes : 87 cases au lieu de 90, le texte des deux cases à la suite, au milieu`,
    !!merged && merged.colspan === 2 && merged.rowspan === 2 && afterMerge.length === 87 && merged.paragraphs.join('|') === 'x1|x2' && merged.valign === 'middle', { merged, count: afterMerge.length });
  const mergedBox = await page.evaluate(() => { const td = document.querySelector('.tiptap td[colspan="2"]'); const r = td && td.getBoundingClientRect(); return r && { w: r.width, h: r.height }; });
  const widths1 = await colWidths(page);
  const heights1 = await rowHeights(page);
  check(`${label} - la fusion garde la taille des colonnes et des lignes ; la case fusionnée a la taille de deux colonnes et de deux lignes`,
    sameList(widths1, widths0) && sameList(heights1, heights0) && !!mergedBox && Math.abs(mergedBox.w - (widths1[1] + widths1[2])) <= 1.5 && Math.abs(mergedBox.h - (heights1[1] + heights1[2])) <= 1.5, { widths0, widths1, heights0, heights1, mergedBox });
  check(`${label} - les bandeaux suivent : toujours 6 lettres et 15 numéros, B-C et 2-3 allumés`, await page.evaluate(() => {
    const cols = Array.from(document.querySelectorAll('.v2-grid-colhead')), rows = Array.from(document.querySelectorAll('.v2-grid-rowhead'));
    return cols.length === 6 && rows.length === 15 && cols.map(h => h.classList.contains('sel') ? 1 : 0).join('') === '011000' && rows.slice(0, 4).map(h => h.classList.contains('sel') ? 1 : 0).join('') === '0110';
  }));
  bar = await barState(page);
  check(`${label} - la case fusionnée est choisie : « Fusionner » se grise, « Scinder » devient actif`, !!bar && bar.buttons['cell-merge'].locked && !bar.buttons['cell-split'].locked && (await selectedCount(page)) === 1, bar && bar.buttons);

  await page.waitForTimeout(650);
  await realClick(page, button('cell-split'));
  const afterSplit = await cellsOf(page);
  const second = afterSplit.filter(c => c.row === 2).map(c => c.paragraphs.join('|'));
  // La case qui garde les deux paragraphes est maintenant sur UNE ligne : son texte, sur deux lignes, l'agrandit (jamais sous sa hauteur réglée) ; les autres lignes et les colonnes sont celles d'avant.
  const heights2 = await rowHeights(page);
  check(`${label} - « Scinder » (vrai clic) rend 90 cases ; la première garde le texte, les trois autres naissent vides, au milieu, aux largeurs d'avant ; les lignes gardent leur hauteur (la 2e grandit pour ses deux lignes de texte)`,
    afterSplit.length === 90 && !mergedOf(afterSplit) && second[1] === 'x1|x2' && second[2] === '' && afterSplit.every(c => c.valign === 'middle') && sameList(await colWidths(page), widths0)
    && heights2.every((h, i) => (i === 1 ? h >= heights0[i] : Math.abs(h - heights0[i]) <= 0.6)), { count: afterSplit.length, second, heights0, heights2 });
  await page.waitForTimeout(650);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const undone1 = await cellsOf(page);
  check(`${label} - Ctrl+Z annule « Scinder » en un seul geste : la case fusionnée est de retour (87 cases)`, undone1.length === 87 && !!mergedOf(undone1), undone1.length);
  await page.waitForTimeout(650);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const undone2 = await cellsOf(page);
  const row2 = undone2.filter(c => c.row === 2).map(c => c.paragraphs.join('|'));
  check(`${label} - un second Ctrl+Z annule « Fusionner » : 90 cases, x1 dans B2 et x2 dans C2, aux mêmes tailles`, undone2.length === 90 && !mergedOf(undone2) && row2[1] === 'x1' && row2[2] === 'x2' && sameList(await colWidths(page), widths0), { count: undone2.length, row2 });

  // Au clavier : le bouton « Fusionner » reçoit le focus puis Entrée.
  await dragGrid(page, [2, 2], [3, 3]);
  await page.evaluate(sel => document.querySelector(sel).focus(), button('cell-merge'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check(`${label} - au clavier, Entrée sur « Fusionner les cases » fusionne une seule fois`, (await cellsOf(page)).length === 87 && !!mergedOf(await cellsOf(page)));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);

  // ---------- 3) Alignement vertical ----------
  await dragGrid(page, [2, 1], [3, 2]);
  await realClick(page, button('valign-top'));
  let cells = await cellsOf(page);
  const topCount = cells.filter(c => c.valign === 'top').length;
  bar = await barState(page);
  check(`${label} - « Aligner en haut » sur A2:B3 (vrai clic) passe les 4 cases en haut d'un seul coup, le bouton est enfoncé`, topCount === 4 && !!bar && bar.buttons['valign-top'].active && !bar.buttons['valign-middle'].active, { topCount, buttons: bar && bar.buttons });
  await dragGrid(page, [1, 1], [3, 1]);
  bar = await barState(page);
  check(`${label} - une sélection mêlée (A1 et A3 au milieu, A2 en haut) n'enfonce aucun bouton d'alignement`, !!bar && SHOWN.slice(-3).every(a => !bar.buttons[a].active && bar.buttons[a].pressed === 'false'), bar && bar.buttons);
  await page.waitForTimeout(650);
  await realClick(page, button('valign-bottom'));
  cells = await cellsOf(page);
  const bottoms = cells.filter(c => c.valign === 'bottom').length;
  bar = await barState(page);
  check(`${label} - « Aligner en bas » sur A1:A3 : 3 cases en bas, le bouton du bas est enfoncé`, bottoms === 3 && !!bar && bar.buttons['valign-bottom'].active && !bar.buttons['valign-top'].active, { bottoms });
  await page.waitForTimeout(650);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  cells = await cellsOf(page);
  check(`${label} - un Ctrl+Z annule l'alignement des trois cases d'un coup`, cells.filter(c => c.valign === 'bottom').length === 0 && cells.filter(c => c.valign === 'top').length === 4, { bottoms: cells.filter(c => c.valign === 'bottom').length });
  const saved = await page.evaluate(() => Editor.getHTML());
  check(`${label} - l'alignement est enregistré avec le modèle (data-valign) : 4 cases en haut, les autres au milieu`, (saved.match(/data-valign="top"/g) || []).length === 4 && (saved.match(/data-valign="middle"/g) || []).length === 86, { top: (saved.match(/data-valign="top"/g) || []).length });
  // Le texte suit l'alignement : une ligne haute, trois alignements.
  await loadGrid(page, gridHtml([100, 100, 100], [28, 90, 28], (r, c) => (r === 2 ? ['Haut', 'Milieu', 'Bas'][c - 1] : '')));
  await clickGrid(page, 2, 1);
  await realClick(page, button('valign-top'));
  await clickGrid(page, 2, 3);
  await realClick(page, button('valign-bottom'));
  const offsets = await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table tr:nth-child(2) > td')).map(td => {
    const range = document.createRange(); range.selectNodeContents(td);
    const r = range.getBoundingClientRect(), t = td.getBoundingClientRect();
    return Math.round(((r.top + r.bottom) / 2 - t.top) * 10) / 10;
  }));
  check(`${label} - dans une ligne haute (90 px), le texte est en haut, au milieu ou en bas selon le bouton (${offsets.join(' < ')})`, offsets[0] < offsets[1] - 15 && offsets[1] < offsets[2] - 15, offsets);

  // ---------- 4) Largeurs : fusionner toutes les lignes de deux colonnes de largeurs différentes ----------
  await loadGrid(page, gridHtml([100, 150, 60, 100], [28, 28, 28, 28], (r, c) => `${String.fromCharCode(64 + c)}${r}`));
  const wide0 = await colWidths(page);
  await dragGrid(page, [1, 2], [4, 3]);
  await realClick(page, button('cell-merge'));
  const mergedWide = mergedOf(await cellsOf(page));
  const wide1 = await colWidths(page);
  check(`${label} - fusionner B1:C4 (150 px et 60 px, toutes les lignes) garde les deux largeurs : ${wide1.join(', ')} px`, sameList(wide1, wide0) && !!mergedWide && mergedWide.colspan === 2 && mergedWide.rowspan === 4 && String(mergedWide.colwidth) === '150,60', { wide0, wide1, mergedWide });
  // Tirer le bord droit de la lettre C (la colonne de 60 px, recouverte par la case fusionnée) : seule cette colonne change, la case fusionnée en garde les deux parts.
  const handle = await boxOf(page, '.v2-grid-colhead:nth-child(3) .v2-grid-handle');
  await page.mouse.move(handle.x, handle.y, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(handle.x + 25, handle.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const wide2 = await colWidths(page);
  const mergedWide2 = mergedOf(await cellsOf(page));
  check(`${label} - tirer le bord de la colonne C (sous une case fusionnée) ne règle que C : ${wide2.join(', ')} px, la case fusionnée porte 150 et 85`, sameList(wide2, [100, 150, 85, 100], 1.5) && !!mergedWide2 && String(mergedWide2.colwidth) === '150,85', { wide2, mergedWide2 });
  await realClick(page, button('cell-split'));
  const wide3 = await colWidths(page);
  const piece = (await cellsOf(page)).filter(c => c.row === 1).map(c => String(c.colwidth));
  check(`${label} - « Scinder » rend à chaque colonne sa largeur (${wide3.join(', ')} px)`, sameList(wide3, [100, 150, 85, 100], 1.5) && piece.join('|') === '100|150|85|100', { wide3, piece });

  // ---------- 5) Lignes et colonnes autour d'une case fusionnée ----------
  await loadGrid(page, gridHtml([100, 100, 100], [28, 28, 28, 28, 28], (r, c) => `${String.fromCharCode(64 + c)}${r}`));
  await dragGrid(page, [2, 2], [3, 3]);
  await realClick(page, button('cell-merge'));
  await clickGrid(page, 3, 1);
  await realClick(page, button('row-del'));
  let after = await cellsOf(page);
  const m2 = mergedOf(after);
  check(`${label} - supprimer une des deux lignes d'une case fusionnée la rétrécit (2 lignes -> 1), sans casser la grille : 4 lignes, colonnes inchangées`, !!m2 && m2.colspan === 2 && m2.rowspan === 1 && (await rowHeights(page)).length === 4 && (await colWidths(page)).length === 3 && after.every(c => c.valign === 'middle' && c.colwidth && c.colwidth.length === c.colspan), { m2, rows: (await rowHeights(page)).length });
  await clickGrid(page, 2, 1);
  await realClick(page, button('col-after'));
  after = await cellsOf(page);
  const m3 = mergedOf(after);
  check(`${label} - ajouter une colonne à gauche d'une case fusionnée de 2 colonnes garde son contenu, et la nouvelle colonne reçoit sa largeur (4 colonnes de 100 px)`, !!m3 && (await colWidths(page)).length === 4 && sameList(await colWidths(page), [100, 100, 100, 100], 1.5), { m3, widths: await colWidths(page) });

  // ---------- 6) Un tableau de document : la barre d'avant ----------
  await page.evaluate(() => {
    GridEditor.setActive(false);
    EditorCore.getEditor().commands.setContent('<p>Avant</p><table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table><p>Après</p>');
  });
  await page.waitForTimeout(450);
  const t = await boxOf(page, '.tiptap table tr:nth-child(2) > td:nth-child(2)');
  await page.mouse.click(t.x, t.y);
  await page.waitForTimeout(350);
  const classic = await page.evaluate(() => {
    const del = document.querySelector('.v2-floating-toolbar button[data-action="table-del"]');
    const bar = del && del.closest('.v2-floating-toolbar');
    if (!bar) return null;
    const shown = Array.from(bar.querySelectorAll('button[data-action]')).filter(b => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0).map(b => b.dataset.action);
    const seps = Array.from(bar.querySelectorAll('.v2-floating-sep')).filter(s => getComputedStyle(s).display !== 'none').length;
    return { floating: !bar.classList.contains('docked') && bar.parentElement === document.body, visible: bar.classList.contains('visible'), shown, seps, delGrey: del.classList.contains('v2-hf-locked') };
  });
  check(`${label} - tableau de document : la barre flotte comme avant, avec ses 9 boutons (lignes, colonnes, tableau, légende, fond) et ni fusion ni alignement vertical`,
    !!classic && classic.floating && classic.visible && classic.shown.join() === 'row-before,row-after,row-del,col-before,col-after,col-del,table-del,caption,fill-open' && !classic.delGrey, classic);

  await context.close();
}

await runTheme('light');
await runTheme('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
