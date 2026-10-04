#!/usr/bin/env node
// Sélectionner plusieurs cases en glissant la souris, dans un tableau de document et dans une grille (demande d'Antoine, 01/10), à la VRAIE souris (page.mouse, Node/Playwright), à la
// taille du panneau Grist (~700x400), en thème clair puis sombre. Une page.evaluate ne déclenche ni un appui « trusted », ni le survol, ni le glissé : c'est ici qu'on s'assure que
//   - glisser d'une case à une autre sélectionne exactement le rectangle entre les deux, dans tous les sens, depuis n'importe quelle case (texte compris) ;
//   - Maj + clic étend la sélection ; la sélection se voit même sur une case colorée (voile, pas fond) et le texte y reste lisible ;
//   - dans une grille, la barre de la case est fixée dans sa bande au-dessus du tableau, jamais posée sur une case : aucune case n'est recouverte, un appui tombe toujours sur la
//     case visée (flottante, elle recouvrait les cases voisines de la case courante) ;
//   - le pointeur près d'un bord du panneau (ou au-delà) fait défiler le plan de travail, et la sélection suit la case qui arrive sous le bord - tableau de document et grille ;
//   - la barre de la case se déclenche aussi au clavier (Tab, Entrée) sans doubler le clic de la souris ; hors d'une grille elle flotte comme avant.
// Lancé par run-headless.mjs (groupe Node « tableSelectMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-table-select-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TABLE_SELECT_PORT || 8913);
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
if (!OFFLINE) console.log('[verify-table-select-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
  return b;
}

// Tire à la vraie souris d'un point à un autre : appuyé, déplacé en `steps` pas, `during` lu AVANT le relâcher, puis relâché.
async function realDrag(page, from, to, during) {
  await page.mouse.move(from.x, from.y, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  const live = during ? await during() : null;
  await page.mouse.up();
  await page.waitForTimeout(150);
  return live;
}


const cellBox = (page, r, c) => boxOf(page, `.tiptap table tr:nth-child(${r}) > :nth-child(${c})`);

// Les cases sélectionnées, lues sur le rendu : rectangle (lignes et colonnes, depuis 1) et nombre ; la sélection de ProseMirror doit être une sélection de cases.
const selectedRect = page => page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('.tiptap td.selectedCell, .tiptap th.selectedCell'));
  const sel = EditorCore.getEditor().state.selection;
  if (!els.length) return { count: 0, isCell: !!sel.$anchorCell };
  const rows = els.map(e => e.parentElement.rowIndex + 1), cols = els.map(e => e.cellIndex + 1);
  return { count: els.length, r1: Math.min(...rows), r2: Math.max(...rows), c1: Math.min(...cols), c2: Math.max(...cols), isCell: !!sel.$anchorCell };
});
const wantRect = (from, to) => {
  const r1 = Math.min(from[0], to[0]), r2 = Math.max(from[0], to[0]), c1 = Math.min(from[1], to[1]), c2 = Math.max(from[1], to[1]);
  return { count: (r2 - r1 + 1) * (c2 - c1 + 1), r1, r2, c1, c2, isCell: true };
};
const sameRect = (got, want) => got.isCell && got.count === want.count && got.r1 === want.r1 && got.r2 === want.r2 && got.c1 === want.c1 && got.c2 === want.c2;
const show = r => r.count ? `${r.count} cases, lignes ${r.r1}-${r.r2}, colonnes ${r.c1}-${r.c2}${r.isCell ? '' : ' (pas une sélection de cases)'}` : `aucune case${r.isCell ? '' : ' (pas une sélection de cases)'}`;

// Appuie sur la case `from` (par son centre, ou `at` : décalage en px), glisse sur la case `to`, relâche. `during` est lu pendant que le bouton est encore appuyé.
async function dragCells(page, from, to, opts = {}) {
  const a = await cellBox(page, from[0], from[1]);
  const b = await cellBox(page, to[0], to[1]);
  const startX = a.x + (opts.dx || 0);
  await page.mouse.move(startX, a.y, { steps: 2 });
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.waitForTimeout(40);
  const during = opts.during ? await opts.during() : null;
  await page.mouse.up();
  await page.waitForTimeout(90);
  return { rect: await selectedRect(page), during };
}

const cellHtml = (t, extra = '', tag = 'td') => `<${tag}${extra}><p>${t}</p></${tag}>`;
const tableHtml = (rows, cols, opts = {}) => `<table><tbody>${Array.from({ length: rows }, (_, r) => `<tr>${Array.from({ length: cols }, (_, c) => cellHtml(`${String.fromCharCode(65 + c)}${r + 1}`, opts.fill && opts.fill[0] === r + 1 && opts.fill[1] === c + 1 ? ` style="background-color: ${opts.fill[2]}"` : '', r === 0 && opts.header ? 'th' : 'td')).join('')}</tr>`).join('')}</tbody></table>`;

async function loadDoc(page, html) {
  await page.evaluate(h => {
    GridEditor.setActive(false);
    EditorCore.getEditor().commands.setContent(h);
    const box = document.getElementById('editor-container');
    box.scrollTop = 0; box.scrollLeft = 0;
  }, html);
  await page.waitForTimeout(450);
}

// « + » puis « Nouvelle grille » à la vraie souris : une grille de départ toute neuve.
async function freshGrid(page) {
  const newBtn = await boxOf(page, '#btn-new');
  await page.mouse.move(newBtn.x, newBtn.y, { steps: 3 });
  await page.waitForTimeout(350);
  const entry = await boxOf(page, '#v2-btn-new-grid');
  await page.mouse.move(entry.x, entry.y, { steps: 4 });
  await page.mouse.click(entry.x, entry.y);
  await page.waitForTimeout(250);
  // Une grille modifiée et pas enregistrée ouvre d'abord « Modifications non enregistrées » (retour d'Antoine du 01/10) : ce test repart à zéro, il clique « Abandonner ».
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
  return entry;
}

// Contraste WCAG de deux couleurs CSS « rgb(...) ».
const CONTRAST_FN = `(a, b) => {
  const parse = c => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const la = lum(parse(a)), lb = lum(parse(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}`;

// La barre de la case (celle qui porte « Supprimer le tableau ») : où est-elle, que recouvre-t-elle ?
const barState = page => page.evaluate(() => {
  const del = document.querySelector('.v2-floating-toolbar button[data-action="table-del"]');
  const bar = del && del.closest('.v2-floating-toolbar');
  if (!bar) return null;
  const r = bar.getBoundingClientRect();
  const dock = document.getElementById('v2-cell-bar-dock');
  const covered = Array.from(document.querySelectorAll('.tiptap td, .tiptap th')).filter(td => { const c = td.getBoundingClientRect(); return c.width > 0 && c.right > r.left && c.left < r.right && c.bottom > r.top && c.top < r.bottom; }).length;
  const strips = Array.from(document.querySelectorAll('.v2-grid-corner, .v2-grid-cols, .v2-grid-rows')).filter(s => { const c = s.getBoundingClientRect(); return c.width > 0 && c.right > r.left && c.left < r.right && c.bottom > r.top && c.top < r.bottom; }).length;
  return {
    visible: bar.classList.contains('visible') && r.width > 0, docked: bar.classList.contains('docked'), inDock: !!dock && dock.contains(bar), parent: bar.parentElement && (bar.parentElement.id || bar.parentElement.tagName),
    left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), covered, strips, dockShown: !!dock && getComputedStyle(dock).display !== 'none',
    delGrey: del.classList.contains('v2-hf-locked'),
  };
});

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Sélection de cases à la souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);

  // ---------- 1) Tableau d'un document classique ----------
  await loadDoc(page, `<p>Avant</p>${tableHtml(6, 4, { header: true, fill: [3, 2, '#ffe699'] })}<p>Après</p>`);
  const cases = [
    ['de droite à gauche puis vers le bas : de B2 à D3', [2, 2], [3, 4]],
    ['vers le bas dans une colonne : de A2 à A5', [2, 1], [5, 1]],
    ['en ligne vers la droite : de A4 à D4', [4, 1], [4, 4]],
    ['en diagonale vers le haut et la gauche : de D5 à B3', [5, 4], [3, 2]],
    ['de deux cases voisines : de C2 à C3', [2, 3], [3, 3]],
    ['vers la gauche : de D6 à B6', [6, 4], [6, 2]],
  ];
  for (const [text, from, to] of cases) {
    const got = (await dragCells(page, from, to)).rect;
    check(`${label} - tableau de document, glissé ${text} : ${show(wantRect(from, to))}`, sameRect(got, wantRect(from, to)), { got: show(got) });
  }
  const fromText = await dragCells(page, [2, 2], [4, 3], { dx: -70 });
  check(`${label} - tableau de document : un glissé qui commence sur le texte de la case (B2) sélectionne bien les cases (B2 à C4)`, sameRect(fromText.rect, wantRect([2, 2], [4, 3])), show(fromText.rect));

  // Maj + clic étend la sélection depuis la case du curseur.
  const a2 = await cellBox(page, 2, 1);
  await page.mouse.click(a2.x, a2.y);
  await page.waitForTimeout(150);
  const c4 = await cellBox(page, 4, 3);
  await page.keyboard.down('Shift');
  await page.mouse.click(c4.x, c4.y);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(120);
  const shifted = await selectedRect(page);
  check(`${label} - tableau de document : clic sur A2 puis Maj + clic sur C4 sélectionne les 9 cases`, sameRect(shifted, wantRect([2, 1], [4, 3])), show(shifted));

  // La sélection se voit, même sur une case colorée : un voile posé par-dessus, que le fond de la case n'efface pas ; le texte reste lisible dessous.
  await dragCells(page, [2, 1], [4, 3]);
  const veil = await page.evaluate(`(() => {
    const ratio = ${CONTRAST_FN};
    const read = (r, c) => {
      const td = document.querySelector('.tiptap table tr:nth-child(' + r + ') > :nth-child(' + c + ')');
      const after = getComputedStyle(td, '::after');
      const rect = td.getBoundingClientRect();
      const m = after.backgroundColor.match(/[\\d.]+/g).map(Number);
      return { content: after.content, position: after.position, alpha: m.length > 3 ? m[3] : 1, covers: Math.abs(parseFloat(after.width) - td.clientWidth) <= 1.5 && Math.abs(parseFloat(after.height) - td.clientHeight) <= 1.5, size: [after.width, after.height, td.clientWidth, td.clientHeight], bg: getComputedStyle(td).backgroundColor, text: getComputedStyle(td).color, veil: after.backgroundColor };
    };
    const plain = read(3, 1), filled = read(3, 2);
    const blend = (veil, base) => { const v = veil.match(/[\\d.]+/g).map(Number); const b = base.match(/[\\d.]+/g).map(Number); const a = v.length > 3 ? v[3] : 1; return 'rgb(' + [0, 1, 2].map(i => Math.round(v[i] * a + b[i] * (1 - a))).join(',') + ')'; };
    return { plain, filled, textOnFilled: ratio(filled.text, blend(filled.veil, filled.bg)), textOnPlain: ratio(plain.text, blend(plain.veil, 'rgb(255,255,255)')) };
  })()`);
  check(`${label} - une case sélectionnée, colorée ou non, est recouverte d'un voile bleu translucide (la case B3 est jaune : sa sélection se voit)`,
    veil.plain.content !== 'none' && veil.filled.content !== 'none' && veil.plain.position === 'absolute' && veil.filled.position === 'absolute' && veil.plain.alpha >= 0.15 && veil.filled.alpha >= 0.15 && veil.plain.covers && veil.filled.covers, veil);
  check(`${label} - le texte d'une case sélectionnée reste lisible sous le voile (>= 4,5:1, case jaune et case blanche)`, veil.textOnFilled >= 4.5 && veil.textOnPlain >= 4.5, { textOnFilled: veil.textOnFilled, textOnPlain: veil.textOnPlain });

  // Défilement automatique : un tableau de 30 lignes, bien plus haut que le panneau.
  await loadDoc(page, `<p>Avant</p>${tableHtml(30, 3)}<p>Après</p>`);
  const scrollTop = () => page.evaluate(() => document.getElementById('editor-container').scrollTop);
  const startCell = await cellBox(page, 2, 1);
  await page.mouse.move(startCell.x, startCell.y, { steps: 2 });
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.move(startCell.x + 150, HEIGHT - 4, { steps: 8 });
  await page.waitForTimeout(1500);
  const heldDown = { top: await scrollTop(), rect: await selectedRect(page) };
  await page.waitForTimeout(2200);
  const heldLonger = { top: await scrollTop(), rect: await selectedRect(page) };
  await page.mouse.up();
  await page.waitForTimeout(150);
  check(`${label} - tableau de 30 lignes : bouton tenu au bord du panneau, le plan de travail défile tout seul (${heldDown.top} px après 1,5 s) et la sélection descend avec lui (${show(heldDown.rect)})`,
    heldDown.top > 150 && heldDown.rect.isCell && heldDown.rect.r1 === 2 && heldDown.rect.r2 > 8, { heldDown: { top: heldDown.top, rect: show(heldDown.rect) } });
  check(`${label} - tenu plus longtemps, la sélection atteint la dernière ligne (30) et le défilement s'arrête en bas`, heldLonger.rect.r2 === 30 && heldLonger.rect.r1 === 2 && heldLonger.top >= heldDown.top, { heldLonger: { top: heldLonger.top, rect: show(heldLonger.rect) } });
  // Retour vers le haut : le pointeur au-dessus du panneau (sur la barre d'outils) remonte et la sélection rétrécit jusqu'à la case de départ.
  const fromBottom = await cellBox(page, 28, 1);
  await page.mouse.move(fromBottom.x, Math.min(fromBottom.y, HEIGHT - 40), { steps: 3 });
  await page.waitForTimeout(450);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.move(fromBottom.x + 150, 160, { steps: 8 });
  await page.waitForTimeout(1800);
  const heldUp = { top: await scrollTop(), rect: await selectedRect(page) };
  await page.mouse.up();
  await page.waitForTimeout(150);
  check(`${label} - glissé vers le haut, pointeur sur la barre d'outils, au-dessus du panneau : le plan de travail remonte et la sélection monte avec lui (${show(heldUp.rect)})`,
    heldUp.rect.isCell && heldUp.rect.r2 === 28 && heldUp.rect.r1 < 22 && heldUp.top < heldLonger.top, { heldUp: { top: heldUp.top, rect: show(heldUp.rect) }, was: heldLonger.top });

  // Contenu réel d'un document : bulles de variables, zone répétée, condition, lien, image, cases fusionnées, en-tête coloré, suivi allumé, curseur déjà dans le tableau (barre ouverte).
  // Le glissé doit y sélectionner le rectangle voulu comme dans un tableau de texte, et le voile doit recouvrir chacune des cases (la sélection se voit).
  const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
  const badge = (key, extra = '') => `<span class="var-badge" data-table="T" data-column="${key}" data-key="T.${key}"${extra}>#T.${key}</span>`;
  const LOOP = ` data-loop='{"table":"L","via":"","repeat":"row"}' data-loop-repeat="row"`;
  const COND = ` data-condition='{"mode":"all","rules":[{"column":"T.A","operator":"=","value":"x"}]}'`;
  const td = (w, html, tag = 'td', extra = '') => `<${tag} data-colwidth="${w}"${extra}><p>${html}</p></${tag}>`;
  const REAL = [
    ['facture : bulles de variables, de B2 à D3', `<p>Facture</p><table><tbody><tr>${td(200, 'Désignation', 'th', ' style="background-color: #d9e2f3"')}${td(80, 'Qté', 'th')}${td(100, 'Prix', 'th')}${td(100, 'Total', 'th')}</tr>`
      + `<tr>${td(200, badge('Nom'))}${td(80, badge('Qte'))}${td(100, badge('Prix'))}${td(100, badge('Total'))}</tr><tr>${td(200, badge('Nom2'))}${td(80, badge('Qte2'))}${td(100, badge('Prix2'))}${td(100, '<strong>' + badge('Somme') + '</strong>')}</tr></tbody></table><p>Merci.</p>`, [2, 2], [3, 4], 6],
    ['facture : de la ligne d\'en-tête colorée à la dernière ligne, de A1 à C3', null, [1, 1], [3, 3], 9],
    ['zone répétée et condition : de A2 à B3', `<table><tbody><tr>${td(100, 'Produit', 'th')}${td(100, 'Prix', 'th')}</tr><tr>${td(100, badge('Nom', LOOP))}${td(100, badge('Prix', LOOP))}</tr><tr>${td(100, badge('A', COND))}${td(100, badge('B', COND))}</tr></tbody></table>`, [2, 1], [3, 2], 4],
    ['liens : de A1 à B2', `<table><tbody><tr><td><p><a href="https://example.com">lien un</a></p></td><td><p><a href="https://example.com">lien deux</a></p></td></tr><tr><td><p>A2</p></td><td><p><a href="https://example.com">lien trois</a></p></td></tr></tbody></table>`, [1, 1], [2, 2], 4],
    ['images : de A1 à B2', `<table><tbody><tr><td><p><img class="editor-image" src="${GIF}" style="width:60px;height:30px"></p></td><td><p>B1</p></td></tr><tr><td><p>A2</p></td><td><p><img class="editor-image" src="${GIF}" style="width:60px;height:30px"></p></td></tr></tbody></table>`, [1, 1], [2, 2], 4],
    ['case fusionnée : de A1 (deux colonnes) à C3', `<table><tbody><tr><th colspan="2"><p>Titre fusionné</p></th><th><p>C1</p></th></tr><tr><td><p>A2</p></td><td><p>B2</p></td><td><p>C2</p></td></tr><tr><td><p>A3</p></td><td><p>B3</p></td><td><p>C3</p></td></tr></tbody></table>`, [1, 1], [3, 3], 8],
  ];
  let invoiceHtml = null;
  for (const [text, html, from, to, count] of REAL) {
    if (html) { invoiceHtml = invoiceHtml || html; await loadDoc(page, html); } else await loadDoc(page, invoiceHtml);
    const got = (await dragCells(page, from, to)).rect;
    const veiled = await page.evaluate(() => { const cells = Array.from(document.querySelectorAll('.tiptap td.selectedCell, .tiptap th.selectedCell')); return cells.length > 0 && cells.every(c => getComputedStyle(c, '::after').content !== 'none'); });
    check(`${label} - contenu réel, ${text} : ${count} cases sélectionnées, toutes sous le voile`, got.isCell && got.count === count && got.r1 === Math.min(from[0], to[0]) && got.r2 === Math.max(from[0], to[0]) && got.c1 === Math.min(from[1], to[1]) && got.c2 === Math.max(from[1], to[1]) && veiled, { got: show(got), veiled });
  }
  await loadDoc(page, invoiceHtml);
  await page.evaluate(() => Editor.setTrackChanges(true));
  const tracked = (await dragCells(page, [2, 1], [3, 3])).rect;
  await page.evaluate(() => Editor.setTrackChanges(false));
  check(`${label} - contenu réel, suivi des modifications allumé : le glissé de A2 à C3 sélectionne les 6 cases`, sameRect(tracked, wantRect([2, 1], [3, 3])), show(tracked));
  await loadDoc(page, invoiceHtml);
  const inTable = await cellBox(page, 3, 4);
  await page.mouse.click(inTable.x, inTable.y);
  await page.waitForTimeout(400);
  const withBar = (await dragCells(page, [2, 1], [3, 3])).rect;
  check(`${label} - contenu réel, curseur déjà dans le tableau (barre de la case ouverte) : le glissé de A2 à C3 sélectionne les 6 cases`, sameRect(withBar, wantRect([2, 1], [3, 3])), show(withBar));

  // ---------- 2) Grille ----------
  await freshGrid(page);
  const gridGeometry = await page.evaluate(() => {
    const r = id => { const e = document.getElementById(id) || document.querySelector(id); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
    return { toolbar: r('v2-toolbar'), dock: r('v2-cell-bar-dock'), container: r('editor-container') };
  });
  check(`${label} - grille : la bande de la barre de la case est entre la barre d'outils et le plan de travail (ni l'un ni l'autre n'est recouvert)`,
    !!gridGeometry.dock && gridGeometry.dock[0] >= gridGeometry.toolbar[1] - 1 && gridGeometry.dock[1] <= gridGeometry.container[0] + 1 && gridGeometry.dock[1] - gridGeometry.dock[0] >= 30, gridGeometry);

  // La barre ne recouvre aucune case, quelle que soit la case du curseur : les cases voisines, au-dessus comme en dessous, restent atteignables.
  const places = [[1, 1], [2, 2], [3, 4], [5, 3], [6, 6]];
  const bars = [];
  for (const [r, c] of places) {
    const b = await cellBox(page, r, c);
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(250);
    bars.push([`${r},${c}`, await barState(page)]);
    await page.waitForTimeout(450);
  }
  check(`${label} - grille : la barre de la case est dans sa bande (hors du plan de travail), visible, et ne recouvre ni une case ni un bandeau, curseur dans A1, B2, D3, C5 ou F6`,
    bars.every(([, s]) => !!s && s.visible && s.docked && s.inDock && s.covered === 0 && s.strips === 0 && s.dockShown && s.delGrey), bars);

  // Un appui sur CHAQUE case d'un bloc tombe sur la case, jamais sur la barre : glissé depuis n'importe quelle case, curseur dans A1 puis dans D5 (l'ancienne barre recouvrait les
  // cases au-dessus ou en dessous de la case courante).
  for (const cursor of [[1, 1], [5, 4]]) {
    const fails = [];
    let total = 0;
    for (const r of [1, 2, 3, 4, 5, 6]) {
      for (const c of [1, 2, 3, 4]) {
        const to = [Math.min(6, r + 1), Math.min(5, c + 1)];
        const cur = await cellBox(page, cursor[0], cursor[1]);
        await page.mouse.click(cur.x, cur.y);
        await page.waitForTimeout(160);
        const from = [r, c];
        const touched = await cellBox(page, r, c).then(b => page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest('.tiptap td, .tiptap th'); }, b));
        const got = (await dragCells(page, from, to)).rect;
        total++;
        if (!touched || !sameRect(got, wantRect(from, to))) fails.push(`${r},${c}->${to}: ${touched ? '' : 'sous un élément étranger, '}${show(got)}`);
        await page.waitForTimeout(500);
      }
    }
    check(`${label} - grille, curseur dans ${String.fromCharCode(64 + cursor[1])}${cursor[0]} : ${total} glissés (chaque case du bloc A1-D6 vers sa voisine en diagonale) donnent le bon rectangle, aucun appui ne tombe sur la barre`, fails.length === 0, fails.slice(0, 6));
  }

  // Défilement automatique d'une grille de 15 lignes, panneau de ~7 lignes : bouton tenu au bord du bas.
  await freshGrid(page);
  const g = await cellBox(page, 2, 2);
  await page.mouse.move(g.x, g.y, { steps: 2 });
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.move(g.x + 100, HEIGHT - 3, { steps: 8 });
  await page.waitForTimeout(1600);
  const gridHeld = { top: await scrollTop(), rect: await selectedRect(page) };
  await page.mouse.up();
  await page.waitForTimeout(150);
  check(`${label} - grille de 15 lignes : bouton tenu au bord du bas du panneau, la grille défile et la sélection va jusqu'à la ligne 15 (${show(gridHeld.rect)})`,
    gridHeld.top > 100 && gridHeld.rect.isCell && gridHeld.rect.r1 === 2 && gridHeld.rect.r2 === 15 && gridHeld.rect.c1 === 2 && gridHeld.rect.c2 >= 3, { top: gridHeld.top, rect: show(gridHeld.rect) });
  const stripsOk = await page.evaluate(() => { const c = document.getElementById('editor-container').getBoundingClientRect(); const col = document.querySelector('.v2-grid-colhead').getBoundingClientRect(); return Math.abs(col.top - c.top) <= 1; });
  check(`${label} - grille : après le défilement, le bandeau des lettres est toujours collé en haut`, stripsOk, stripsOk);

  // Colonnes en plus (12 colonnes de 100 px : plus large que le panneau) : bouton tenu au bord droit.
  await page.evaluate(() => { const ed = EditorCore.getEditor(); for (let i = 0; i < 6; i++) ed.chain().focus().addColumnAfter().run(); document.getElementById('editor-container').scrollTop = 0; });
  await page.waitForTimeout(400);
  const w = await cellBox(page, 3, 2);
  await page.mouse.move(w.x, w.y, { steps: 2 });
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.move(WIDTH - 3, w.y, { steps: 8 });
  await page.waitForTimeout(2000);
  const wide = await page.evaluate(() => ({ left: document.getElementById('editor-container').scrollLeft }));
  const wideRect = await selectedRect(page);
  await page.mouse.up();
  await page.waitForTimeout(150);
  check(`${label} - grille de 12 colonnes : bouton tenu au bord droit du panneau, la grille défile à l'horizontale et la sélection va jusqu'à la colonne L (${show(wideRect)})`,
    wide.left > 100 && wideRect.isCell && wideRect.c1 === 2 && wideRect.c2 === 12 && wideRect.r1 === 3 && wideRect.r2 === 3, { left: wide.left, rect: show(wideRect) });

  // Le clavier : la barre se déclenche à Tab puis Entrée, et un clic de souris n'agit qu'une fois.
  await freshGrid(page);
  const rowsNow = () => page.evaluate(() => document.querySelectorAll('.tiptap table tr').length);
  const before = await rowsNow();
  const ROW_AFTER = '.v2-floating-toolbar button[data-action="row-after"]';
  const mouseTarget = await boxOf(page, ROW_AFTER);
  if (mouseTarget) await page.mouse.click(mouseTarget.x, mouseTarget.y);
  await page.waitForTimeout(200);
  const afterMouse = await rowsNow();
  check(`${label} - grille : un vrai clic sur « Insérer une ligne après » de la barre ajoute UNE ligne (pas deux)`, afterMouse === before + 1, { before, afterMouse });
  await page.evaluate(sel => { const b = document.querySelector(sel); if (b) b.focus(); }, ROW_AFTER);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const afterKey = await rowsNow();
  check(`${label} - grille : Tab jusqu'à la barre puis Entrée sur « Insérer une ligne après » ajoute une ligne`, afterKey === afterMouse + 1, { afterMouse, afterKey });
  // Après une action le focus revient dans la grille : le bouton est refocalisé pour la touche suivante.
  await page.evaluate(sel => { const b = document.querySelector(sel); if (b) b.focus(); }, ROW_AFTER);
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  const afterSpace = await rowsNow();
  check(`${label} - grille : Espace sur le même bouton ajoute encore une ligne`, afterSpace === afterKey + 1, { afterKey, afterSpace });

  // Lecture : la bande disparaît avec l'éditeur et revient avec lui.
  await page.mouse.click(...(await boxOf(page, '#btn-mode-read').then(b => [b.x, b.y])));
  await page.waitForTimeout(500);
  const dockDisplay = () => page.evaluate(() => { const d = document.getElementById('v2-cell-bar-dock'); return d ? getComputedStyle(d).display : 'absent'; });
  const dockInRead = await dockDisplay();
  await page.mouse.click(...(await boxOf(page, '#btn-mode-edit').then(b => [b.x, b.y])));
  await page.waitForTimeout(500);
  const dockBack = await dockDisplay();
  check(`${label} - Lecture : la bande de la barre de la case est masquée avec l'éditeur et revient au retour à l'édition`, dockInRead === 'none' && dockBack !== 'none' && dockBack !== 'absent', { dockInRead, dockBack });

  // Hors d'une grille : la barre flotte comme avant (au-dessus du tableau), la bande est masquée.
  await loadDoc(page, `<p>Avant</p>${tableHtml(4, 3)}<p>Après</p>`);
  const t = await cellBox(page, 3, 2);
  await page.mouse.click(t.x, t.y);
  await page.waitForTimeout(350);
  const floating = await barState(page);
  const tableTop = await page.evaluate(() => document.querySelector('.tiptap table').getBoundingClientRect().top);
  check(`${label} - tableau de document : la barre de la case flotte au-dessus du tableau (hors de la bande), « Supprimer le tableau » actif, la bande est masquée`,
    !!floating && floating.visible && !floating.docked && floating.parent === 'BODY' && floating.bottom <= tableTop + 2 && !floating.delGrey && !floating.dockShown && floating.covered === 0, { floating, tableTop });

  await context.close();
}

await runTheme('light');
await runTheme('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
