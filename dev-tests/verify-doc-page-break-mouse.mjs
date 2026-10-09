#!/usr/bin/env node
// Saut de page avant une ligne d'un tableau de DOCUMENT (lot 5 (B, C) de « le tableau d'un document est un tableau du mode grille » ; Antoine, 09/10 : « Saut de page » dans une ligne de tableau
// = saut avant cette ligne) à la VRAIE souris (page.mouse, page.keyboard ; Node/Playwright), à la taille du panneau Grist (~700x400), en thème clair puis sombre. Une page.evaluate ne déclenche ni
// un appui « trusted », ni le survol (c'est lui qui montre la raison d'un bouton grisé), ni le vrai clavier : c'est ici qu'on s'assure que
//   - hors d'un tableau le bouton garde son rôle d'avant (libellé « Saut de page », ni grisé ni enfoncé, un clic insère le repère de saut) ;
//   - dans un tableau du premier niveau il parle d'une ligne : info-bulle « Saut de page avant la ligne » suivie de sa touche, un vrai clic pose le saut AVANT la ligne du curseur (la marque est
//     sur la ligne, pas de repère inséré), le bouton s'enfonce, un second clic le retire, un seul Ctrl+Z / Ctrl+Y par geste ; Entrée sur le bouton et Alt+Entrée font de même, une seule fois ;
//   - il se grise, jamais retiré, là où le saut ne tient pas (première ligne, case fusionnée qui traverse, tableau dans une case, suivi des modifications), reste sensible au survol pour dire
//     POURQUOI en info-bulle (la raison seule, entière dans le panneau, sans la touche qui ne ferait rien), et un clic ou Alt+Entrée dessus ne change rien ; il se dégrise dès que la cause s'en va ;
//   - le saut SE VOIT : une pastille à cheval sur le numéro de la ligne (dans le panneau, lisible, elle ne cache pas la poignée de la ligne du dessus) et un trait en tirets sur le bord haut de la
//     ligne (mesuré sur les pixels d'une vraie capture), rien sur les lignes sans saut ; en Aperçu A4 la page change là : une bande de saut sur la ligne marquée, aucun texte recouvert ;
//   - « Fusionner » est grisé (avec sa raison) quand la sélection enjambe un saut, libre quand le saut est sur son bord haut.
// Les fonctions elles-mêmes sont dans dev-tests/scenarios-grid-in-document.js (groupe gridInDocument, cas docbreak_*), les coupures de l'aperçu A4, de la Lecture, du PDF et du Word dans
// dev-tests/scenarios-table-page-cut.js (groupe tablePageCut) ; le saut d'une grille : dev-tests/verify-grid-pagebreak-mouse.mjs (groupe gridPageBreakMouse).
// Lancé par run-headless.mjs (groupe Node « docPageBreakMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-doc-page-break-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.DOC_PAGE_BREAK_MOUSE_PORT || 8999);
const SHOTS = process.env.DOC_PAGE_BREAK_SHOTS || ''; // un dossier : une capture du panneau par étape visuelle (relecture à l'œil), rien d'écrit sinon
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-grid-pagebreak-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-doc-page-break-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
  await page.waitForTimeout(150);
  return b;
}
// La souris attend dans le coin du plan de travail : partie de (0, 0), elle traverserait la barre d'outils (ses menus s'ouvrent au survol).
const parkMouse = page => page.mouse.move(WIDTH - 12, HEIGHT - 12, { steps: 3 });
// Plus de 500 ms entre deux gestes : prosemirror-history groupe sinon les transactions rapprochées en UN seul évènement.
const gap = page => page.waitForTimeout(650);

// Contraste WCAG de deux couleurs CSS « rgb(...) ».
const CONTRAST_FN = `(a, b) => {
  const parse = c => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const la = lum(parse(a)), lb = lum(parse(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}`;

// ---------- Les documents ----------
const cell = (text, attrs = '') => `<td${attrs}><p>${text}</p></td>`;
const row = (cells, attrs = '') => `<tr${attrs}>${cells.join('')}</tr>`;
const MARK = ' data-page-break-before="true"';
// Deux paragraphes avant le tableau : la barre du tableau se pose au-dessus des lettres des bandeaux (css/grid.css) et, tant que le haut du tableau touche le haut du plan de travail, elle recouvre la
// seconde rangée de la barre d'outils, où se trouve le bouton « Saut de page » (un vrai pointeur y tombe sur la barre du tableau) ; avec ces deux paragraphes le tableau commence assez bas pour qu'elle
// tienne dans le plan, sans rien recouvrir. Cinq lignes : le tableau tient en entier sous la barre, dans un panneau de 400 px de haut.
const INTRO = '<p>Avant le tableau</p><p>Un deuxième paragraphe</p>';
const OUTRO = '<p>Après le tableau</p>';
// Un tableau de 5 lignes et 3 colonnes (A1 à C5) ; `marks` : les lignes (depuis 1) qui portent déjà un saut.
const plainTable = (marks = []) => '<table><tbody>' + [1, 2, 3, 4, 5].map(r => row(['A', 'B', 'C'].map(c => cell(c + r)), marks.includes(r) ? MARK : '')).join('') + '</tbody></table>';
const DOC = INTRO + plainTable() + OUTRO;
// Les lignes 2 et 3 partagent la case A2 (rowspan 2).
const MERGED = INTRO + '<table><tbody>'
  + row([cell('A1'), cell('B1'), cell('C1')]) + row([cell('A2', ' rowspan="2"'), cell('B2'), cell('C2')]) + row([cell('B3'), cell('C3')])
  + row([cell('A4'), cell('B4'), cell('C4')]) + row([cell('A5'), cell('B5'), cell('C5')]) + '</tbody></table>' + OUTRO;
// Un tableau dans une case d'un tableau extérieur de deux lignes.
const NESTED = INTRO + '<table><tbody><tr><td><p>Dehors</p><table><tbody>' + [1, 2, 3].map(r => row([cell('N' + r), cell('M' + r)])).join('') + '</tbody></table></td><td><p>Voisine</p></td></tr>'
  + row([cell('Bas'), cell('Bas droite')]) + '</tbody></table>' + OUTRO;

// Les textes que le bouton dit (français ; dev-tests/scenarios-grid-in-document.js lit les mêmes clés par I18n.t).
const TIP = 'Saut de page avant la ligne';
const ARIA = 'Saut de page avant la ligne sélectionnée : nouvelle page du PDF et du Word (un second clic le retire)';
const PILL_TITLE = 'Saut de page · nouvelle page du PDF et du Word';
const REASONS = {
  first: 'Saut de page : pas avant la première ligne du tableau (la page serait vide)',
  merged: 'Saut de page : une case fusionnée sur plusieurs lignes passe sur la limite au-dessus de cette ligne',
  nested: 'Saut de page : un tableau dans une case, une colonne, un encadré ou une liste ne change pas de page',
  tracked: 'Indisponible avec le suivi des modifications : ce réglage ne serait pas suivi',
  mergeAcross: 'Fusionner les cases : un saut de page passe entre deux lignes de la sélection',
};

const PAGE_BREAK = '#v2-btn-page-break';
const STRIPS = '.pp-doc-strips';

async function load(page, html) {
  await page.evaluate((h) => { GridEditor.setActive(false); Editor.setHTML(h); const box = document.getElementById('editor-container'); box.scrollTop = 0; box.scrollLeft = 0; }, html);
  await page.waitForTimeout(500);
  await parkMouse(page);
}
const setA4 = (page, on) => page.evaluate((value) => { const t = document.getElementById('v2-toggle-a4-preview'); if (t && t.checked !== value) { t.checked = value; t.dispatchEvent(new Event('change', { bubbles: true })); } }, on).then(() => page.waitForTimeout(600));

// Le centre de la case dont le texte est exactement `text` (amenée dans le plan de travail seulement si elle n'y est pas : un panneau de 400 px ne laisse que ~250 px au plan).
const cellPoint = (page, text) => page.evaluate((wanted) => {
  const td = Array.from(document.querySelectorAll('.tiptap td, .tiptap th')).find(c => c.querySelector('p') && c.querySelector('p').textContent === wanted);
  if (!td) return null;
  // Le texte de la case, pas la case : en Aperçu A4 la ligne qui ouvre une page est rembourrée de tout le bas de la page d'avant (le centre de sa case est dans ce vide, hors du panneau).
  const para = td.querySelector('p');
  window.__reveal(para);
  const r = para.getBoundingClientRect();
  const c = td.getBoundingClientRect();
  // Le point qu'un vrai pointeur atteint dans la case : la barre du tableau d'une case voisine peut en recouvrir le haut.
  const x = c.left + c.width / 2;
  const ys = [r.top + r.height / 2, c.top + c.height / 2, c.bottom - 8, c.top + 8].filter(y => y > 0 && y < innerHeight);
  const y = ys.find((candidate) => { const hit = document.elementFromPoint(x, candidate); return !!hit && td.contains(hit); });
  return { x, y: y === undefined ? r.top + r.height / 2 : y };
}, text);
async function clickCell(page, text) {
  const p = await cellPoint(page, text);
  if (!p) throw new Error('case introuvable : ' + text);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
  await parkMouse(page);
}
async function clickText(page, text) {
  const p = await page.evaluate((wanted) => {
    const el = Array.from(document.querySelectorAll('.tiptap > p')).find(c => c.textContent === wanted);
    if (!el) return null;
    window.__reveal(el);
    const r = el.getBoundingClientRect();
    return { x: r.left + 20, y: r.top + r.height / 2 };
  }, text);
  if (!p) throw new Error('paragraphe introuvable : ' + text);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
  await parkMouse(page);
}
// Appuie sur la case `from`, glisse sur la case `to`, relâche : une sélection de cases.
async function dragCells(page, from, to) {
  const a = await cellPoint(page, from);
  const b = await cellPoint(page, to);
  await page.mouse.move(a.x, a.y, { steps: 2 });
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(250);
}

// Le bouton « Saut de page » de la barre du haut : dans le panneau ? grisé ? enfoncé ? que dit-il ?
const breakButton = page => page.evaluate((sel) => {
  const b = document.querySelector(sel);
  if (!b) return null;
  const r = b.getBoundingClientRect();
  const cs = getComputedStyle(b);
  return {
    shown: cs.display !== 'none' && r.width > 0, inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    locked: b.classList.contains('v2-hf-locked'), active: b.classList.contains('is-active'), pressed: b.getAttribute('aria-pressed'), tip: b.getAttribute('data-tip'), aria: b.getAttribute('aria-label'),
    opacity: Number(cs.opacity), pointer: cs.pointerEvents, cursor: cs.cursor, keytip: b.getAttribute('data-keytip') || '',
  };
}, PAGE_BREAK);
// L'info-bulle du bouton (le `::after` de js/viewport-fit.js et css/toolbar-v2.css) après un vrai survol : son texte, son opacité, et si elle tient entière dans la fenêtre.
async function hoverTip(page) {
  const b = await boxOf(page, PAGE_BREAK);
  await page.mouse.move(b.x - 8, b.y + 3, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.waitForTimeout(650);
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const tip = getComputedStyle(el, '::after');
    const width = parseFloat(tip.width) + (parseFloat(tip.paddingLeft) || 0) + (parseFloat(tip.paddingRight) || 0);
    const left = r.left + (parseFloat(tip.left) || 0) - width / 2; // `left` est relatif au bouton, la bulle est centrée sur ce point (translateX(-50%))
    return { content: tip.content, opacity: Number(tip.opacity), left: Math.round(left), right: Math.round(left + width), fits: left >= 0 && left + width <= innerWidth };
  }, PAGE_BREAK);
}
// Les lignes (depuis 1) du premier tableau dont le <tr> porte le saut, le nombre de marques enregistrées, les repères de saut de page insérés dans le document.
const breakRows = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table > tbody > tr')).map((r, i) => (r.getAttribute('data-page-break-before') === 'true' && !r.parentElement.closest('tr') ? i + 1 : 0)).filter(Boolean));
const savedBreaks = page => page.evaluate(() => (Editor.getHTML().match(/<tr[^>]*data-page-break-before="true"/g) || []).length);
const markers = page => page.evaluate(() => { let n = 0; EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'pageBreak') n += 1; return true; }); return n; });
const htmlOf = page => page.evaluate(() => Editor.getHTML());
// Les numéros du bandeau du tableau qui portent la pastille.
const pillHeads = page => page.evaluate((s) => Array.from(document.querySelectorAll(s + ' .v2-grid-rowhead')).map((head, i) => (head.classList.contains('has-break') && !!head.querySelector('.v2-grid-break') ? i + 1 : 0)).filter(Boolean), STRIPS);
// La pastille du numéro `n`.
const badgeOf = (page, n) => page.evaluate(([s, i]) => {
  const head = document.querySelectorAll(s + ' .v2-grid-rowhead')[i - 1];
  const badge = head && head.querySelector('.v2-grid-break');
  if (!badge) return null;
  const r = badge.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2 - 3; // un peu au-dessus du bord : sur le territoire de la ligne du dessus
  const hit = document.elementFromPoint(x, y);
  const cs = getComputedStyle(badge);
  const icon = badge.querySelector('svg');
  return {
    x, y, inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, w: r.width, h: r.height, title: head.title,
    hitIsHandleAbove: !!hit && hit.classList.contains('v2-grid-handle') && hit.parentElement.dataset.index === String(i - 2),
    bg: cs.backgroundColor, fg: icon ? getComputedStyle(icon).color : cs.color, pointerEvents: cs.pointerEvents,
  };
}, [STRIPS, n]);

// Les pixels réels du bord haut de la ligne n (dernière colonne, loin du curseur) : une capture de 8 px de haut relue dans un canvas ; pour chaque rangée de pixels, la part qui a la couleur de la pastille.
async function dashesAt(page, n, accent) {
  accent = accent || 'rgb(0, 0, 0)';
  const geo = await page.evaluate((i) => {
    const tr = document.querySelectorAll('.tiptap table > tbody > tr')[i - 1];
    window.__reveal(tr);
    const cellEl = tr.cells[tr.cells.length - 1];
    const r = cellEl.getBoundingClientRect();
    return { left: r.left + 6, width: Math.min(80, r.width - 12), top: tr.getBoundingClientRect().top };
  }, n);
  await page.waitForTimeout(250);
  const geo2 = await page.evaluate((i) => {
    const tr = document.querySelectorAll('.tiptap table > tbody > tr')[i - 1];
    const cellEl = tr.cells[tr.cells.length - 1];
    const r = cellEl.getBoundingClientRect();
    return { left: r.left + 6, width: Math.min(80, r.width - 12), top: tr.getBoundingClientRect().top };
  }, n);
  const clip = { x: Math.round(geo2.left), y: Math.round(geo2.top) - 3, width: Math.round(geo2.width || geo.width), height: 8 };
  const png = await page.screenshot({ clip });
  return page.evaluate(async ({ b64, color }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const g = canvas.getContext('2d');
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
    const [ar, ag, ab] = color.match(/[\d.]+/g).map(Number);
    const ratios = [];
    for (let y = 0; y < canvas.height; y++) {
      let count = 0;
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (Math.abs(data[i] - ar) + Math.abs(data[i + 1] - ag) + Math.abs(data[i + 2] - ab) < 60) count++;
      }
      ratios.push(Math.round(count / canvas.width * 100) / 100);
    }
    return ratios;
  }, { b64: png.toString('base64'), color: accent });
}
// Une ligne en tirets : au moins une rangée de pixels a de l'ordre de 6 pixels de la couleur sur 10 et aucune n'est pleine.
const isDashed = ratios => ratios.some(r => r >= 0.35 && r <= 0.8) && ratios.every(r => r <= 0.85);
const isBlank = ratios => ratios.every(r => r === 0);

// La barre du tableau (curseur dans une case) : l'état d'un bouton.
const BAR = '.v2-floating-toolbar.visible';
const barButton = (page, action) => page.evaluate(([sel, name]) => {
  const b = document.querySelector(`${sel} button[data-action="${name}"]`);
  if (!b) return null;
  const r = b.getBoundingClientRect();
  const cs = getComputedStyle(b);
  return { shown: cs.display !== 'none' && r.width > 0, disabled: b.classList.contains('is-disabled'), aria: b.getAttribute('aria-disabled'), title: b.title, opacity: Number(cs.opacity) };
}, [BAR, action]);

// Les bandes de saut de l'Aperçu A4 et, pour chacune, la première ligne du tableau dont le texte est sous elle ; les lignes dont le texte est recouvert par une bande.
const bandsReport = page => page.evaluate(() => {
  const bands = Array.from(document.querySelectorAll('#editor-container .v2-page-band')).map(b => b.getBoundingClientRect());
  const rows = Array.from(document.querySelectorAll('#editor-container .tiptap > .tableWrapper > table > tbody > tr')).map((tr) => {
    const paras = Array.from(tr.querySelectorAll('p'));
    return { textTop: paras[0].getBoundingClientRect().top, textBottom: paras[paras.length - 1].getBoundingClientRect().bottom, label: paras[0].textContent };
  });
  const aligned = bands.map(r => rows.findIndex(x => x.textTop >= r.bottom - 1));
  const overlaps = bands.reduce((n, r) => n + rows.filter(x => x.textTop < r.bottom - 0.5 && x.textBottom > r.top + 0.5).length, 0);
  return { bands: bands.length, aligned, overlaps, first: aligned.length && aligned[0] >= 0 ? rows[aligned[0]].label : null, inside: bands.every(r => r.left >= 0 && r.right <= innerWidth) };
});

// La hauteur posée de chaque ligne du premier tableau, telle que le document la dit (0 : aucune), et celle que montrent la page et les numéros du bandeau.
const rowAttrs = page => page.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'table') { node.forEach(r => out.push(r.attrs.rowHeight || 0)); return false; } return true; });
  return out;
});
const stripGeometry = page => page.evaluate(() => {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height, left: r.left, right: r.right }; };
  const badge = document.querySelector('.pp-doc-strips .v2-grid-break');
  return { heads: Array.from(document.querySelectorAll('.pp-doc-strips .v2-grid-rowhead')).map(rect), rows: Array.from(document.querySelectorAll('.tiptap table > tbody > tr')).map(rect), badge: badge ? rect(badge) : null };
});
// Ramène la poignée `selector` dans le plan de travail (le tableau d'une page A4 est plus bas que le panneau) puis la tire de (dx, dy) à la vraie souris.
async function dragHandle(page, selector, dx, dy) {
  await page.evaluate((sel) => {
    const box = document.getElementById('editor-container');
    const handle = document.querySelector(sel);
    if (!box || !handle) return;
    const area = box.getBoundingClientRect();
    const r = handle.getBoundingClientRect();
    const cy = r.top + r.height / 2;
    if (cy < area.top + 8) box.scrollTop -= area.top + 8 - cy;
    if (cy > area.bottom - 8) box.scrollTop += cy - (area.bottom - 8);
  }, selector);
  await page.waitForTimeout(350);
  const b = await boxOf(page, selector);
  await page.mouse.move(b.x - 6, b.y - 5, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.move(b.x + dx, b.y + dy, { steps: 8 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(600);
  await parkMouse(page);
}

async function shot(page, name) {
  if (!SHOTS) return;
  await page.screenshot({ path: join(SHOTS, name + '.png') });
}

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Saut de page avant une ligne d'un tableau de document à la souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);
  await page.evaluate(`window.__ratio = ${CONTRAST_FN};`);
  // Amène `el` dans le plan de travail en ne faisant défiler que lui (un `scrollIntoView` fait aussi défiler la fenêtre de quelques pixels, que les bandeaux, posés dans la fenêtre,
  // ne suivent pas : ils se retrouvent à côté de leurs lignes).
  await page.evaluate(() => {
    window.__reveal = (el, center) => {
      const box = document.getElementById('editor-container');
      const area = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (center) box.scrollTop += (r.top + r.height / 2) - (area.top + area.height / 2);
      else if (r.top < area.top + 8) box.scrollTop -= area.top + 8 - r.top;
      else if (r.bottom > area.bottom - 8) box.scrollTop += r.bottom - (area.bottom - 8);
    };
  });
  await setA4(page, false);

  // ---------- 1) Hors d'un tableau : le bouton d'avant ----------
  await load(page, DOC);
  await clickText(page, 'Avant le tableau');
  let btn = await breakButton(page);
  check(`${label} - hors d'un tableau le bouton « Saut de page » est dans le panneau, garde son libellé d'avant (« Saut de page »), n'est ni grisé ni enfoncé et n'annonce aucun état`,
    !!btn && btn.shown && btn.inViewport && btn.tip === 'Saut de page' && !btn.locked && btn.pressed === null && !btn.active && btn.opacity > 0.9, btn);
  await realClick(page, PAGE_BREAK);
  await page.waitForTimeout(150);
  check(`${label} - hors d'un tableau un vrai clic insère le repère de saut de page, comme avant (un repère, aucune marque de ligne)`, (await markers(page)) === 1 && (await savedBreaks(page)) === 0, { markers: await markers(page), saved: await savedBreaks(page) });
  await gap(page);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  check(`${label} - un Ctrl+Z retire ce repère`, (await markers(page)) === 0, await markers(page));

  // ---------- 2) Première ligne : grisé, avec sa raison en info-bulle ; un clic ne fait rien ----------
  await load(page, DOC);
  await clickCell(page, 'A1');
  btn = await breakButton(page);
  check(`${label} - sur la première ligne le bouton est grisé (visible, atténué, jamais retiré), non enfoncé, dans le panneau, et reste sensible au survol (pointer-events, curseur normal)`,
    !!btn && btn.shown && btn.inViewport && btn.locked && btn.opacity > 0 && btn.opacity < 0.6 && btn.pressed === 'false' && !btn.active && btn.pointer === 'auto' && btn.cursor === 'default', btn);
  check(`${label} - son info-bulle est la raison (« ${REASONS.first} ») et son libellé parle de la ligne et du Word`, !!btn && btn.tip === REASONS.first && btn.aria === ARIA, btn);
  const firstTip = await hoverTip(page);
  check(`${label} - survolé, le bouton grisé montre sa raison seule, sans la touche qui ne ferait rien, entière dans la fenêtre (de ${firstTip.left} à ${firstTip.right} px sur ${WIDTH})`,
    firstTip.content === `"${REASONS.first}"` && firstTip.opacity > 0.9 && firstTip.fits, firstTip);
  const htmlBefore = await htmlOf(page);
  await realClick(page, PAGE_BREAK);
  await page.keyboard.press('Alt+Enter');
  await page.waitForTimeout(150);
  check(`${label} - un vrai clic puis Alt+Entrée sur le bouton grisé ne changent rien : le document est identique, aucune marque, aucun repère`,
    (await htmlOf(page)) === htmlBefore && (await markers(page)) === 0 && (await savedBreaks(page)) === 0, { saved: await savedBreaks(page), markers: await markers(page) });
  check(`${label} - ni pastille ni trait n'apparaissent sur la première ligne`, (await pillHeads(page)).length === 0, await pillHeads(page));

  // ---------- 3) Ligne 3 : actif ; un vrai clic pose le saut AVANT cette ligne ----------
  await gap(page);
  await clickCell(page, 'B3');
  btn = await breakButton(page);
  check(`${label} - sur la ligne 3 le bouton est actif (plus grisé, éclat plein) et non enfoncé, son info-bulle parle de la ligne`, !!btn && !btn.locked && btn.opacity > 0.9 && btn.pressed === 'false' && !btn.active && btn.tip === TIP && btn.aria === ARIA && btn.pointer === 'auto', btn);
  const idleTip = await hoverTip(page);
  check(`${label} - survolé, il montre « ${TIP} » suivi de sa touche (${btn && btn.keytip.trim()}), entier dans la fenêtre`, idleTip.content === `"${TIP}${btn ? btn.keytip : ''}"` && idleTip.opacity > 0.9 && idleTip.fits && /Alt\+/.test(btn ? btn.keytip : ''), { idleTip, keytip: btn && btn.keytip });
  await realClick(page, PAGE_BREAK);
  await parkMouse(page);
  await page.waitForTimeout(300);
  btn = await breakButton(page);
  check(`${label} - un vrai clic pose le saut AVANT la ligne 3 seulement (<tr data-page-break-before>, une marque enregistrée, aucun repère de saut inséré)`,
    (await breakRows(page)).join() === '3' && (await savedBreaks(page)) === 1 && (await markers(page)) === 0, { rows: await breakRows(page), saved: await savedBreaks(page), markers: await markers(page) });
  check(`${label} - le bouton est maintenant enfoncé (aria-pressed vrai, allumé) et reste actif : un second clic retirera le saut`, !!btn && btn.pressed === 'true' && btn.active && !btn.locked, btn);

  // ---------- 4) Il se voit : pastille dans le numéro, trait en tirets, contraste ----------
  const heads = await pillHeads(page);
  const badge = await badgeOf(page, 3);
  check(`${label} - le bandeau des numéros montre UNE pastille, sur le numéro 3 (${JSON.stringify(heads)}), entière dans le panneau, avec l'info-bulle du document (« ${PILL_TITLE} »)`,
    heads.join() === '3' && !!badge && badge.inViewport && badge.title === PILL_TITLE, { heads, badge });
  check(`${label} - la pastille ne répond pas au pointeur (pointer-events: none) : un vrai pointeur sur elle tombe sur la poignée de la ligne 2, qui reste atteignable`, !!badge && badge.pointerEvents === 'none' && badge.hitIsHandleAbove, badge);
  const accent = badge && badge.bg;
  const ratio = badge ? await page.evaluate(([a, b]) => window.__ratio(a, b), [badge.fg, badge.bg]) : 0;
  check(`${label} - le glyphe de la pastille se lit sur son fond (${ratio.toFixed(2)}:1, au moins 4,5:1)`, ratio >= 4.5, { fg: badge && badge.fg, bg: badge && badge.bg });
  const onRow3 = await dashesAt(page, 3, accent);
  const onRow2 = await dashesAt(page, 2, accent);
  check(`${label} - le bord haut de la ligne 3 est un trait en tirets de la couleur de la pastille (part de la couleur par rangée de pixels : ${JSON.stringify(onRow3)}) et la ligne 2, sans saut, n'en a aucun`, isDashed(onRow3) && isBlank(onRow2), { onRow3, onRow2 });
  const backdrop = await page.evaluate(([c]) => {
    const tr = document.querySelectorAll('.tiptap table > tbody > tr')[2];
    let el = tr.cells[0], bg = 'rgba(0, 0, 0, 0)';
    while (el && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { bg = getComputedStyle(el).backgroundColor; el = el.parentElement; }
    return { ratio: window.__ratio(c, bg), bg };
  }, [accent]);
  check(`${label} - le trait en tirets se distingue du fond du tableau (${backdrop.ratio.toFixed(2)}:1, au moins 3:1)`, backdrop.ratio >= 3, backdrop);
  await shot(page, `${theme}-marque-ligne-3`);

  // ---------- 5) Aperçu A4 : la page change à la ligne marquée ----------
  await setA4(page, true);
  await page.evaluate(() => Editor.refreshPaginationPreview && Editor.refreshPaginationPreview());
  await page.waitForTimeout(500);
  const a4 = await bandsReport(page);
  check(`${label} - en Aperçu A4 la page change AVANT la ligne 3 : une bande de saut, la ligne dont le texte est dessous est « ${a4.first} » (la 3e), aucun texte recouvert, bande entière dans le panneau`,
    a4.bands === 1 && a4.aligned[0] === 2 && a4.first === 'A3' && a4.overlaps === 0 && a4.inside, a4);
  // Les numéros du bandeau restent sur leurs lignes : celui de la ligne qui ouvre la page mesure la ligne, pas le vide de la page d'avant que son rembourrage ajoute ; sa pastille est sur son bord haut.
  const geo = await stripGeometry(page);
  const own = geo.heads.map(h => Math.round(h.height));
  check(`${label} - en Aperçu A4 les numéros restent sur leurs lignes : le numéro 3 mesure ${own[2]} px comme les autres (${own.join(', ')}) alors que sa ligne en mesure ${Math.round(geo.rows[2].height)} (le vide d'avant la bande y est ajouté), tous finissent avec leur ligne`,
    geo.heads.length === 5 && geo.rows[2].height > 4 * geo.rows[3].height && own.every(h => Math.abs(h - own[3]) <= 1.5) && geo.heads.every((h, i) => Math.abs(h.bottom - geo.rows[i].bottom) <= 1.5), { heads: own, rows: geo.rows.map(r => Math.round(r.height)) });
  check(`${label} - la pastille est sur le bord haut de la ligne 3 elle-même (au centre de son numéro, à ${Math.round(geo.badge ? geo.badge.top + geo.badge.height / 2 - geo.heads[2].top : 0)} px de son haut), pas au-dessus dans le vide de la page d'avant`,
    !!geo.badge && Math.abs(geo.badge.top + geo.badge.height / 2 - geo.heads[2].top) <= 1.5 && geo.badge.left >= geo.heads[2].left - 0.5 && geo.badge.right <= geo.heads[2].right + 0.5, { badge: geo.badge, head: geo.heads[2] });
  // Tirer le bas du numéro 3 de 20 px règle la hauteur de la ligne (celle de son texte plus 20), pas celle que la page lui rend avec son vide : sans cela le glissé écrirait une ligne haute de toute la page.
  const before = await rowAttrs(page);
  await dragHandle(page, `${STRIPS} .v2-grid-rowhead:nth-child(3) .v2-grid-handle`, 0, 20);
  const dragged = await rowAttrs(page);
  const afterGeo = await stripGeometry(page);
  check(`${label} - tirer le bas du numéro 3 de 20 px pose une hauteur de ${dragged[2]} px sur cette ligne (celle de son texte, 29 px, plus ~23), aucune autre ligne ne change, la page ne la rend pas plus haute que prévu (+${Math.round(afterGeo.rows[2].height - geo.rows[2].height)} px)`,
    before.every(h => h === 0) && dragged[2] >= 40 && dragged[2] <= 70 && dragged.every((h, i) => i === 2 || h === 0) && Math.abs(afterGeo.rows[2].height - geo.rows[2].height - 20) <= 3, { before, dragged, rowsBefore: geo.rows[2].height, rowsAfter: afterGeo.rows[2].height });
  await gap(page);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  check(`${label} - un seul Ctrl+Z rend la hauteur de la ligne (aucune hauteur posée) et le saut reste`, (await rowAttrs(page)).every(h => h === 0) && (await breakRows(page)).join() === '3', { rows: await rowAttrs(page), breaks: await breakRows(page) });
  await page.evaluate(() => { const band = document.querySelector('#editor-container .v2-page-band'); if (band) window.__reveal(band, true); });
  await page.waitForTimeout(300);
  await shot(page, `${theme}-apercu-a4`);
  await setA4(page, false);
  const flat = await bandsReport(page);
  check(`${label} - sans Aperçu A4 il n'y a plus de bande (la page ne se voit pas) et la marque reste`, flat.bands === 0 && (await savedBreaks(page)) === 1, flat);

  // ---------- 6) Un second clic le retire ; Ctrl+Z / Ctrl+Y ----------
  await gap(page);
  await clickCell(page, 'B3');
  await realClick(page, PAGE_BREAK);
  await parkMouse(page);
  await page.waitForTimeout(300);
  btn = await breakButton(page);
  const lineGone = await dashesAt(page, 3, accent);
  check(`${label} - un second vrai clic retire le saut : plus de marque, plus de pastille, plus de trait, le bouton n'est plus enfoncé`,
    (await breakRows(page)).length === 0 && (await pillHeads(page)).length === 0 && isBlank(lineGone) && !!btn && btn.pressed === 'false' && !btn.active && !btn.locked, { rows: await breakRows(page), pills: await pillHeads(page), lineGone, btn });
  await gap(page);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  check(`${label} - un seul Ctrl+Z rend le saut retiré (marque, pastille et bouton enfoncé)`, (await breakRows(page)).join() === '3' && (await pillHeads(page)).join() === '3' && (await breakButton(page)).pressed === 'true', { rows: await breakRows(page) });
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(300);
  check(`${label} - un seul Ctrl+Y le retire de nouveau`, (await breakRows(page)).length === 0 && (await pillHeads(page)).length === 0, { rows: await breakRows(page) });

  // ---------- 7) Au clavier : Entrée sur le bouton, puis Alt+Entrée ----------
  await gap(page);
  await clickCell(page, 'B3');
  await page.evaluate(sel => document.querySelector(sel).focus(), PAGE_BREAK);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check(`${label} - au clavier, Entrée sur le bouton « Saut de page » pose UN saut (avant la ligne 3)`, (await breakRows(page)).join() === '3' && (await savedBreaks(page)) === 1, { rows: await breakRows(page), saved: await savedBreaks(page) });
  await gap(page);
  await clickCell(page, 'B3');
  await page.keyboard.press('Alt+Enter');
  await page.waitForTimeout(250);
  check(`${label} - Alt+Entrée dans la case le retire (même geste que le bouton, une marque de moins)`, (await breakRows(page)).length === 0 && (await markers(page)) === 0, { rows: await breakRows(page), markers: await markers(page) });
  await gap(page);
  await clickCell(page, 'B4');
  await page.keyboard.press('Alt+Enter');
  await page.waitForTimeout(250);
  check(`${label} - Alt+Entrée dans la case B4 pose le saut avant la ligne 4`, (await breakRows(page)).join() === '4' && (await savedBreaks(page)) === 1, await breakRows(page));
  await gap(page);
  await realClick(page, PAGE_BREAK); // le curseur est resté dans B4 : retire le saut
  await page.waitForTimeout(250);

  // ---------- 8) Une case fusionnée sur plusieurs lignes : grisé à l'intérieur, libre à son bord haut et dessous ----------
  await load(page, MERGED);
  await clickCell(page, 'B3');
  btn = await breakButton(page);
  check(`${label} - ligne 3, que la case A2 (fusionnée avec la ligne 2) traverse : le bouton est grisé et sa raison dit pourquoi (« ${REASONS.merged} »)`, !!btn && btn.locked && btn.opacity < 0.6 && btn.tip === REASONS.merged, btn);
  const mergedTip = await hoverTip(page);
  check(`${label} - survolée, la raison tient entière dans la fenêtre (de ${mergedTip.left} à ${mergedTip.right} px)`, mergedTip.content === `"${REASONS.merged}"` && mergedTip.opacity > 0.9 && mergedTip.fits, mergedTip);
  const mergedHtml = await htmlOf(page);
  await realClick(page, PAGE_BREAK);
  check(`${label} - un vrai clic dessus ne pose rien`, (await htmlOf(page)) === mergedHtml && (await markers(page)) === 0, { rows: await breakRows(page) });
  await gap(page);
  await clickCell(page, 'B2');
  btn = await breakButton(page);
  check(`${label} - ligne 2, au bord haut de la case fusionnée : le bouton est actif`, !!btn && !btn.locked && btn.opacity > 0.9 && btn.tip === TIP, btn);
  await gap(page);
  await clickCell(page, 'B4');
  btn = await breakButton(page);
  check(`${label} - ligne 4, au-dessous de la case fusionnée : le bouton est actif`, !!btn && !btn.locked && btn.opacity > 0.9 && btn.tip === TIP, btn);

  // ---------- 9) Un tableau dans une case : grisé, le tableau extérieur reste libre ----------
  await load(page, NESTED);
  await clickCell(page, 'N2');
  btn = await breakButton(page);
  check(`${label} - le curseur dans un tableau posé dans une case : le bouton est grisé et sa raison dit pourquoi (« ${REASONS.nested} »)`, !!btn && btn.locked && btn.opacity < 0.6 && btn.tip === REASONS.nested, btn);
  const nestedTip = await hoverTip(page);
  check(`${label} - la raison la plus longue tient entière dans la fenêtre (de ${nestedTip.left} à ${nestedTip.right} px sur ${WIDTH})`, nestedTip.content === `"${REASONS.nested}"` && nestedTip.opacity > 0.9 && nestedTip.fits, nestedTip);
  const nestedHtml = await htmlOf(page);
  await realClick(page, PAGE_BREAK);
  check(`${label} - un vrai clic dessus ne pose rien : aucune marque, aucun repère de saut entré dans la case`, (await htmlOf(page)) === nestedHtml && (await markers(page)) === 0 && (await savedBreaks(page)) === 0, { saved: await savedBreaks(page), markers: await markers(page) });
  await gap(page);
  await clickCell(page, 'Voisine');
  btn = await breakButton(page);
  check(`${label} - le curseur dans le tableau extérieur (case voisine, première ligne) : grisé pour la première ligne, pas pour le tableau`, !!btn && btn.locked && btn.tip === REASONS.first, btn);
  await gap(page);
  await clickCell(page, 'Bas');
  btn = await breakButton(page);
  check(`${label} - sur la deuxième ligne du tableau extérieur le bouton est actif`, !!btn && !btn.locked && btn.opacity > 0.9 && btn.tip === TIP, btn);

  // ---------- 10) Le suivi des modifications : grisé avec sa raison, dégrisé quand il s'éteint ----------
  await load(page, DOC);
  await clickCell(page, 'B3');
  await page.evaluate(() => Editor.setTrackChanges(true));
  await page.waitForTimeout(300);
  await clickCell(page, 'B3');
  btn = await breakButton(page);
  check(`${label} - suivi allumé : le bouton est grisé et sa raison est celle des réglages de tableau (« ${REASONS.tracked} »)`, !!btn && btn.locked && btn.opacity < 0.6 && btn.tip === REASONS.tracked, btn);
  const trackedHtml = await htmlOf(page);
  await realClick(page, PAGE_BREAK);
  check(`${label} - un vrai clic dessus ne fait rien : le document ne change pas, aucune modification n'est proposée`, (await htmlOf(page)) === trackedHtml && !(await page.evaluate(() => Editor.hasPendingTrackedChanges())), (await savedBreaks(page)));
  await page.evaluate(() => Editor.setTrackChanges(false));
  await page.waitForTimeout(300);
  await clickCell(page, 'B3');
  btn = await breakButton(page);
  check(`${label} - le suivi éteint, le bouton reprend son éclat et son libellé`, !!btn && !btn.locked && btn.opacity > 0.9 && btn.tip === TIP, btn);

  // ---------- 11) Fusionner : grisé quand la sélection enjambe un saut, libre quand le saut est sur son bord haut ----------
  await load(page, INTRO + plainTable([3]) + OUTRO);
  await dragCells(page, 'B2', 'C4');
  let merge = await barButton(page, 'cell-merge');
  check(`${label} - avec un saut avant la ligne 3, « Fusionner » est grisé (visible, atténué) pour B2 à C4 qui l'enjambe, sa raison est « ${REASONS.mergeAcross} »`,
    !!merge && merge.shown && merge.disabled && merge.aria === 'true' && merge.opacity < 0.6 && merge.title === REASONS.mergeAcross, merge);
  await gap(page);
  await dragCells(page, 'B3', 'C4');
  merge = await barButton(page, 'cell-merge');
  check(`${label} - « Fusionner » est actif pour B3 à C4 (le saut est sur son bord haut, il ne passe pas à l'intérieur)`, !!merge && !merge.disabled && merge.opacity > 0.9 && merge.title === 'Fusionner les cases', merge);

  await context.close();
}

await runTheme('light');
await runTheme('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
