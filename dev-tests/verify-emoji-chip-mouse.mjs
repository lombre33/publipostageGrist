#!/usr/bin/env node
// Puce « Smiley » (js/emoji-chip.js) à la VRAIE souris, au VRAI clavier et au VRAI presse-papiers (page.mouse / page.keyboard, Node/Playwright), à la taille du panneau Grist
// (~700x400), en français (thème clair) puis en anglais (thème sombre). dev-tests/scenarios-emoji-chip.js vérifie le smiley DANS la page (liste, HTML du modèle, sorties : Lecture, HTML,
// Markdown, PDF, Word) ; ici, ce que seuls de vrais gestes prouvent :
//  - la liste « # », onglet Puces : la ligne « Smiley » (« Emoji ») juste après « N° de ligne », entière dans le panneau, au premier plan, texte non rogné ;
//  - UN clic sur la ligne pose UN smiley à la place du « # », une seule puce sur une ligne, la liste se ferme ET la grille de choix reste ouverte (le clic sur la liste referme les barres
//    flottantes à la fin de son « mousedown » : la grille doit être rouverte juste après), entière dans le panneau, le smiley en cours marqué, texte lisible (contraste >= 4,5:1) ;
//  - un clic sur un smiley de la grille remplace celui de la puce, referme la grille, rend le curseur derrière la puce (la frappe suivante s'écrit derrière) ;
//  - un clic sur la puce rouvre la grille ; la molette sur la grille atteint le dernier thème, un clic y choisit ; Ctrl + Z rend l'ancien smiley en UN geste, Ctrl + Y le nouveau ;
//  - le clavier : Entrée sur la puce sélectionnée met le focus dans la grille sans couper le paragraphe, les flèches déplacent le focus, Entrée choisit, Échap referme sans rien changer ;
//  - la grille d'une puce posée près du bas du panneau reste entière dans le panneau ;
//  - Ctrl + C puis Ctrl + V : la puce se recopie ; le texte copié est le smiley ; un emoji collé de Teams (une image) arrive en texte, jamais en puce ;
//  - la Lecture écrit le smiley comme du texte (aucune puce, aucun débordement) et le retour à l'édition le retrouve.
// Lancé par run-headless.mjs (groupe Node "emojiChipMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-emoji-chip-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.EMOJI_CHIP_MOUSE_PORT || 9611);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-user-name-chip-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-emoji-chip-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

// EMOJI_CHIP_SHOTS=<dossier> : enregistre des captures aux moments clés, à relire à l'œil.
const SHOTS = process.env.EMOJI_CHIP_SHOTS || '';
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];

// Le widget d'une personne qui a choisi sa langue dans Réglages : elle est lue dans le stockage local avant tout autre script.
async function openWidget(lang, colorScheme) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, bypassCSP: true, colorScheme, permissions: ['clipboard-read', 'clipboard-write'] });
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
  await page.addInitScript(l => { try { localStorage.setItem('pp_lang', l); } catch (e) { /* stockage indisponible */ } }, lang);
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  // Aperçu A4, le réglage d'Antoine (page réduite dans le panneau).
  await page.evaluate(() => { document.getElementById('editor-container').classList.add('a4-preview'); });
  return { context, page };
}

// Centre d'un élément, entièrement dans le panneau ?, au premier plan (un contrôle recouvert par autre chose ne recevrait pas le clic) ?
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
// Une ligne de liste retrouvée par son texte exact (la liste « # » n'a pas d'identifiant par ligne), et son texte tient-il dans sa boîte ?
async function hitByText(page, selector, text) {
  return page.evaluate(({ selector, text }) => {
    const el = Array.from(document.querySelectorAll(selector)).find(e => e.textContent.trim() === text);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
      fits: el.scrollWidth <= el.clientWidth + 0.5,
    };
  }, { selector, text });
}
// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, box) {
  await page.mouse.move(box.x - 6, box.y, { steps: 2 });
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
}
// Garer la souris au bord droit de la feuille, à la hauteur visée : sur son chemin vers le texte, elle ne survole plus la barre du haut, dont un menu au survol (style de
// paragraphe, …) s'ouvrirait sous le pointeur et recevrait le clic à la place du paragraphe.
const park = (page, y) => page.mouse.move(WIDTH - 4, y);


const ROWS = {
  fr: { insert: 'Smiley', rowNumber: 'N° de ligne', tab: 'Puces', pickLabel: 'Choisir un smiley', group: 'Visages' },
  en: { insert: 'Emoji', rowNumber: 'Row number', tab: 'Chips', pickLabel: 'Choose an emoji', group: 'Faces' },
};
const DEFAULT = '\u{1F642}';
const FIRST_PICK = '\u{1F60D}';
const LAST_PICK = '\u{1F4AD}';
const TEAMS_EMOJI = '\u{1F389}';
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

// Les puces « Smiley » du document : leur texte, leur place, tiennent-elles sur une ligne et dans le panneau ?
const chipsInEditor = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap .smart-chip[data-chip-kind="emoji"]')).map(c => {
  const r = c.getBoundingClientRect();
  return {
    label: c.textContent, attr: c.getAttribute('data-chip-emoji'), lines: c.getClientRects().length, selected: c.classList.contains('ProseMirror-selectednode'),
    inViewport: r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
    x: r.left + r.width / 2, y: r.top + r.height / 2,
  };
}));
// La grille de choix : ouverte ?, entière dans le panneau ?, smiley marqué, défilement, et lisibilité du titre d'un thème (contraste du texte sur le fond de la grille).
const gridState = page => page.evaluate(() => {
  const el = document.querySelector('.v2-emoji-toolbar');
  if (!el || !el.classList.contains('visible')) return { open: false };
  const r = el.getBoundingClientRect();
  const parse = css => { const m = css.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const title = el.querySelector('.emoji-group-title');
  let bg = null;
  for (let n = el; n && !bg; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0.9) bg = c; }
  const fg = title && parse(getComputedStyle(title).color);
  const contrast = fg && bg ? (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05) : 0;
  const cell = el.querySelector('.emoji-cell');
  const cb = cell && cell.getBoundingClientRect();
  const top = cb && document.elementFromPoint(cb.left + cb.width / 2, cb.top + cb.height / 2);
  return {
    open: true, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height,
    inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
    cells: el.querySelectorAll('.emoji-cell').length, marked: Array.from(el.querySelectorAll('.emoji-cell[aria-pressed="true"]')).map(c => c.getAttribute('aria-label')),
    scrollTop: el.scrollTop, scrollable: el.scrollHeight > el.clientHeight + 1, contrast: Math.round(contrast * 100) / 100,
    groups: Array.from(el.querySelectorAll('.emoji-group-title')).map(t => t.textContent), label: el.querySelector('.emoji-picker').getAttribute('aria-label'),
    firstCellOnTop: !!top && (top === cell || cell.contains(top)),
    cellH: cb ? cb.height : 0, cellW: cb ? cb.width : 0,
  };
});
// Le centre d'un smiley de la grille ET la partie visible de la grille (la grille défile) : le smiley est-il dans ce qu'on voit ?
const cellBox = (page, emoji) => page.evaluate(emoji => {
  const panel = document.querySelector('.v2-emoji-toolbar');
  const cell = panel && Array.from(panel.querySelectorAll('.emoji-cell')).find(c => c.getAttribute('aria-label') === emoji);
  if (!cell) return { found: false };
  const r = cell.getBoundingClientRect(), p = panel.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { found: true, x, y, visible: r.top >= p.top && r.bottom <= p.bottom && r.left >= p.left && r.right <= p.right, onTop: !!top && (top === cell || cell.contains(top)), panelX: p.left + p.width / 2, panelY: p.top + p.height / 2 };
}, emoji);
// La molette sur la grille jusqu'à ce que le smiley soit visible (la grille défile : max 240 px de haut).
async function wheelTo(page, emoji) {
  let box = await cellBox(page, emoji);
  for (let i = 0; i < 20 && box.found && !box.visible; i++) {
    await page.mouse.move(box.panelX, box.panelY);
    await page.mouse.wheel(0, 90);
    await page.waitForTimeout(60);
    box = await cellBox(page, emoji);
  }
  return box;
}
const focusedCell = page => page.evaluate(() => { const a = document.activeElement; return a && a.classList && a.classList.contains('emoji-cell') ? { emoji: a.getAttribute('aria-label'), top: Math.round(a.getBoundingClientRect().top) } : null; });
const editorHasFocus = page => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.tiptap'));
const paragraphText = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap > p')).map(p => p.textContent));

// Une table et sa fiche, comme dans Grist : sans elles la liste « # » n'a rien à proposer et ne s'ouvre pas.
async function seedTable(page) {
  await page.evaluate(async () => {
    const stub = window.__gristStub;
    stub.setVariables('EmFiches', { Titre: 'Text' });
    stub.setRows('EmFiches', [{ id: 1, Titre: 'Dossier A' }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Titre: 'Dossier A' }, 'EmFiches');
  });
  await page.waitForTimeout(300);
}
async function seedDocument(page, html) {
  await page.evaluate(h => Editor.setHTML(h), html);
  await page.waitForTimeout(300);
}
// Le curseur au bout du premier paragraphe : un vrai clic dans sa partie vide à droite du texte.
async function clickEndOfParagraph(page, index) {
  const target = await page.evaluate(i => {
    const p = document.querySelectorAll('.tiptap > p')[i];
    p.scrollIntoView({ block: 'nearest' });
    const r = p.getBoundingClientRect();
    return { x: r.right - 12, y: r.top + r.height / 2 };
  }, index || 0);
  await park(page, target.y);
  await realClick(page, target);
  // La sélection d'un clic dans le texte arrive de l'observateur du DOM de ProseMirror, un instant après le clic : on la laisse arriver avant de taper ou de coller.
  await page.waitForTimeout(220);
  await page.keyboard.press('End');
  await page.waitForTimeout(80);
}
async function openHashList(page, label, R, nth) {
  await clickEndOfParagraph(page, nth);
  await page.keyboard.type(' ');
  const insertButton = await hitTest(page, '#v2-btn-insert-variable');
  check(`${label} - le bouton « Insérer une variable » est dans le panneau et au premier plan`, insertButton.found && insertButton.inViewport && insertButton.onTop, insertButton);
  await realClick(page, insertButton);
  await page.waitForTimeout(250);
  const chipsTab = await hitTest(page, '#autocomplete-box .ac-tab[data-tab="chips"]');
  await realClick(page, chipsTab);
  await page.waitForTimeout(150);
  return page.evaluate(() => Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).map(i => i.textContent.trim()));
}

async function runCase({ lang, colorScheme, title }) {
  const R = ROWS[lang];
  const label = `${lang === 'en' ? 'anglais' : 'français'}, ${colorScheme === 'dark' ? 'sombre' : 'clair'}`;
  const tag = `${lang}-${colorScheme}`;
  console.log(`\n=== ${title}, ${WIDTH}x${HEIGHT}, interface ${lang === 'en' ? 'anglaise' : 'française'}, thème ${colorScheme === 'dark' ? 'sombre' : 'clair'} ===`);
  const { context, page } = await openWidget(lang, colorScheme);
  check(`${label} - l'interface est bien en ${lang === 'en' ? 'anglais' : 'français'}`, await page.evaluate(l => I18n.getLang() === l && document.documentElement.lang === l, lang));
  await seedTable(page);
  await seedDocument(page, '<p>Merci</p><p>Fin</p>');

  // 1) La liste « # » et la pose.
  const items = await openHashList(page, label, R, 0);
  const wanted = await hitByText(page, '#autocomplete-box .ac-item', R.insert);
  check(`${label} - la ligne « ${R.insert} » vient juste après « ${R.rowNumber} » dans l'onglet ${R.tab}`, items.indexOf(R.insert) === items.indexOf(R.rowNumber) + 1 && items.indexOf(R.rowNumber) > 0, items);
  check(`${label} - elle est entière dans le panneau, au premier plan, texte non rogné`, wanted.found && wanted.inViewport && wanted.onTop && wanted.fits, wanted);
  await shot(page, `${tag}-1-liste`);
  if (wanted.found) await realClick(page, wanted);
  await page.waitForTimeout(450);
  const listClosed = !(await hitTest(page, '#autocomplete-box')).inViewport;
  let chips = await chipsInEditor(page);
  let grid = await gridState(page);
  check(`${label} - un clic sur la ligne : une seule puce au smiley d'origine remplace « # », sélectionnée, sur une ligne, dans le panneau, et la liste se ferme`,
    chips.length === 1 && chips[0].label === DEFAULT && chips[0].attr === DEFAULT && chips[0].lines === 1 && chips[0].inViewport && chips[0].selected && listClosed, { chips, listClosed });
  check(`${label} - sa grille de choix est ouverte (elle ne s'est pas refermée avec la liste), entière dans le panneau, le smiley en cours marqué`,
    grid.open && grid.inViewport && grid.marked.length === 1 && grid.marked[0] === DEFAULT && grid.cells >= 160 && grid.cells <= 190, grid);
  check(`${label} - la grille : ses cinq thèmes se lisent dans la langue de l'interface (« ${R.group} » en premier), son nom accessible est « ${R.pickLabel} », le texte des titres a un contraste de 4,5:1 au moins, chaque bouton a de quoi se viser (≥ 26 px de haut)`,
    grid.open && grid.groups.length === 5 && grid.groups[0] === R.group && grid.label === R.pickLabel && grid.contrast >= 4.5 && grid.cellH >= 26 && grid.firstCellOnTop, grid);
  await shot(page, `${tag}-2-grille`);

  // 2) Choisir un smiley visible : la puce change, la grille se ferme, le curseur est derrière la puce.
  let box = await cellBox(page, FIRST_PICK);
  check(`${label} - le smiley ${FIRST_PICK} est visible dans la grille, au premier plan`, box.found && box.visible && box.onTop, box);
  await realClick(page, box);
  await page.waitForTimeout(250);
  chips = await chipsInEditor(page);
  grid = await gridState(page);
  check(`${label} - un clic sur ${FIRST_PICK} : la puce devient ${FIRST_PICK} (toujours UNE puce, son HTML aussi), la grille se ferme`, chips.length === 1 && chips[0].label === FIRST_PICK && chips[0].attr === FIRST_PICK && !grid.open, { chips, grid });
  await page.keyboard.type('!');
  let paragraphs = await paragraphText(page);
  check(`${label} - le curseur est derrière la puce : la frappe suivante s'écrit derrière elle`, paragraphs[0] === 'Merci ' + FIRST_PICK + '!' && await editorHasFocus(page), paragraphs);

  // 3) Un clic sur la puce rouvre la grille ; la molette atteint le dernier thème ; un clic y choisit.
  chips = await chipsInEditor(page);
  await park(page, chips[0].y);
  await realClick(page, chips[0]);
  await page.waitForTimeout(250);
  grid = await gridState(page);
  check(`${label} - un clic sur la puce rouvre la grille, la puce marquée, la grille entière dans le panneau`, grid.open && grid.inViewport && grid.marked.length === 1 && grid.marked[0] === FIRST_PICK, grid);
  check(`${label} - la grille défile (le panneau est bas) et le dernier smiley est hors de la partie visible avant la molette`, grid.scrollable && !(await cellBox(page, LAST_PICK)).visible, grid);
  box = await wheelTo(page, LAST_PICK);
  grid = await gridState(page);
  check(`${label} - la molette posée sur la grille la fait défiler : le dernier smiley est visible, au premier plan, la grille n'a pas bougé de place`, box.found && box.visible && box.onTop && grid.scrollTop > 0 && grid.open && grid.inViewport, { box, grid });
  await shot(page, `${tag}-3-grille-defilee`);
  await realClick(page, box);
  await page.waitForTimeout(250);
  chips = await chipsInEditor(page);
  check(`${label} - un clic sur ${LAST_PICK} (dernier thème) : la puce le prend, la grille se ferme`, chips.length === 1 && chips[0].label === LAST_PICK && !(await gridState(page)).open, chips);

  // 4) Annuler / Rétablir à la vraie touche : un geste chacun.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  chips = await chipsInEditor(page);
  check(`${label} - Ctrl + Z : un seul geste rend l'ancien smiley ${FIRST_PICK}`, chips.length === 1 && chips[0].label === FIRST_PICK, chips);
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(150);
  chips = await chipsInEditor(page);
  check(`${label} - Ctrl + Y : un seul geste redonne ${LAST_PICK}`, chips.length === 1 && chips[0].label === LAST_PICK, chips);

  // 5) Le clavier : Entrée sur la puce sélectionnée entre dans la grille, flèches, Entrée choisit ; Échap referme sans rien changer.
  await park(page, chips[0].y);
  await realClick(page, (await chipsInEditor(page))[0]);
  await page.waitForTimeout(250);
  const paragraphCount = (await paragraphText(page)).length;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  let focus = await focusedCell(page);
  check(`${label} - Entrée sur la puce sélectionnée : le focus entre dans la grille, sur le smiley en cours, sans couper le paragraphe`, !!focus && focus.emoji === LAST_PICK && (await paragraphText(page)).length === paragraphCount, { focus, paragraphs: await paragraphText(page) });
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  const second = await focusedCell(page);
  await page.keyboard.press('ArrowDown');
  const below = await focusedCell(page);
  await page.keyboard.press('ArrowUp');
  const backUp = await focusedCell(page);
  check(`${label} - Début et les flèches déplacent le focus d'un smiley à l'autre (droite, bas, haut)`, !!second && !!below && !!backUp && second.emoji !== focus.emoji && below.top > second.top && backUp.emoji === second.emoji, { focus, second, below, backUp });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  chips = await chipsInEditor(page);
  check(`${label} - Entrée sur un smiley de la grille le choisit (le deuxième de la liste), la grille se ferme et le focus revient au texte`, chips.length === 1 && chips[0].label === second.emoji && !(await gridState(page)).open && await editorHasFocus(page), { chips, second });
  await page.keyboard.type('x');
  paragraphs = await paragraphText(page);
  check(`${label} - la frappe suivante s'écrit derrière la puce`, paragraphs[0] === 'Merci ' + second.emoji + 'x!', paragraphs);
  chips = await chipsInEditor(page);
  await park(page, chips[0].y);
  await realClick(page, chips[0]);
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  chips = await chipsInEditor(page);
  check(`${label} - Échap referme la grille sans rien changer et rend le focus à l'éditeur`, chips.length === 1 && chips[0].label === second.emoji && !(await gridState(page)).open && await editorHasFocus(page), chips);

  // 6) Le presse-papiers : copier la puce, la coller ; le texte copié est le smiley ; un emoji de Teams (une image) arrive en texte.
  await realClick(page, chips[0]);
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(150);
  const copied = await page.evaluate(async () => { try { return await navigator.clipboard.readText(); } catch (e) { return 'ERREUR ' + e.message; } });
  check(`${label} - Ctrl + C sur la puce : le texte copié est le smiley lui-même`, copied === second.emoji, copied);
  await clickEndOfParagraph(page, 1);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(300);
  chips = await chipsInEditor(page);
  check(`${label} - Ctrl + V ailleurs : la puce se recopie avec son smiley (deux puces, la même)`, chips.length === 2 && chips[0].label === second.emoji && chips[1].label === second.emoji, chips);
  await page.evaluate(async ({ emoji, pixel }) => {
    const html = `<html>\r\n<body>\r\n<!--StartFragment--><p>Bravo <img alt="${emoji}" itemscope itemtype="http://schema.skype.com/Emoji" src="${pixel}"> fin</p><!--EndFragment-->\r\n</body>\r\n</html>`;
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob(['Bravo ' + emoji + ' fin'], { type: 'text/plain' }) })]);
  }, { emoji: TEAMS_EMOJI, pixel: PIXEL });
  await clickEndOfParagraph(page, 1);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(300);
  chips = await chipsInEditor(page);
  paragraphs = await paragraphText(page);
  check(`${label} - un emoji copié de Teams (une image) et collé à Ctrl + V arrive comme TEXTE : aucune puce de plus, le caractère est dans le paragraphe`, chips.length === 2 && paragraphs.join('|').includes(TEAMS_EMOJI) && !(await gridState(page)).open, { chips: chips.length, paragraphs });
  await shot(page, `${tag}-4-colle`);

  // 7) Près du bas du panneau : la grille reste entière dans le panneau.
  await seedDocument(page, Array.from({ length: 14 }, (_, i) => `<p>Ligne ${i + 1}</p>`).join(''));
  const nearBottom = await page.evaluate(() => {
    const ps = Array.from(document.querySelectorAll('.tiptap > p'));
    const scroller = document.getElementById('editor-container');
    // Le dernier paragraphe qui tient dans le panneau : le plus bas visible.
    const visible = ps.filter(p => { const r = p.getBoundingClientRect(); return r.top >= 60 && r.bottom <= innerHeight - 4; });
    return visible.length - 1;
  });
  const lowItems = await openHashList(page, label, R, Math.max(nearBottom, 0));
  const lowRow = await hitByText(page, '#autocomplete-box .ac-item', R.insert);
  if (lowRow.found) await realClick(page, lowRow);
  await page.waitForTimeout(450);
  grid = await gridState(page);
  chips = await chipsInEditor(page);
  check(`${label} - puce posée en bas du panneau : la grille s'ouvre et reste entière dans le panneau (elle se place au-dessus quand il n'y a pas de place dessous)`, lowItems.includes(R.insert) && chips.length === 1 && grid.open && grid.inViewport, { lowRow, chips, grid, nearBottom });
  await shot(page, `${tag}-5-bas`);
  await page.keyboard.press('Escape');

  // 8) La Lecture : le smiley est un texte, aucune puce, rien ne déborde ; le retour à l'édition retrouve la puce.
  await seedDocument(page, `<p>Merci <span class="smart-chip" contenteditable="false" data-chip-kind="emoji" data-chip-emoji="${FIRST_PICK}">${FIRST_PICK}</span> à tous</p>`);
  await realClick(page, await hitTest(page, '#btn-mode-read'));
  await page.waitForTimeout(900);
  const reading = await page.evaluate(() => {
    const reader = document.getElementById('reader-container');
    return { shown: reader.style.display === 'block', text: reader.textContent.replace(/\s+/g, ' ').trim(), chipsLeft: reader.querySelectorAll('.smart-chip').length, overflowX: reader.scrollWidth - reader.clientWidth };
  });
  check(`${label} - Lecture : « Merci ${FIRST_PICK} à tous », plus aucune puce, la feuille ne déborde pas`, reading.shown && reading.text.includes('Merci ' + FIRST_PICK + ' à tous') && reading.chipsLeft === 0 && reading.overflowX <= 1, reading);
  await shot(page, `${tag}-6-lecture`);
  await realClick(page, await hitTest(page, '#btn-mode-edit'));
  await page.waitForTimeout(500);
  chips = await chipsInEditor(page);
  check(`${label} - retour à l'édition : la puce est toujours dans le modèle avec son smiley`, chips.length === 1 && chips[0].label === FIRST_PICK && chips[0].attr === FIRST_PICK, chips);

  await context.close();
}

try {
  await runCase({ lang: 'fr', colorScheme: 'light', title: 'Puce « Smiley » : pose, changement, clavier, presse-papiers, Lecture' });
  await runCase({ lang: 'en', colorScheme: 'dark', title: 'Emoji chip: insert, change, keyboard, clipboard, reading' });
} finally {
  check('aucune erreur de page ni boîte inattendue', pageErrors.length === 0, pageErrors);
  await browser.close();
  server.close();
}
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
