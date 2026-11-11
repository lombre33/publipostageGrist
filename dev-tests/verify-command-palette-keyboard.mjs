#!/usr/bin/env node
// Palette de commandes (js/command-palette.js, css/command-palette.css, l'action `commandPalette` de js/shortcuts.js) : le panneau de 700x400 d'Antoine, au VRAI clavier (page.keyboard) et à la vraie
// souris (page.mouse), en clair, en sombre, en anglais et en mode Mac. Ce que dev-tests/scenarios-command-palette.js ne peut pas voir depuis la page : Alt+/ doit être pris AVANT l'éditeur sans rien
// écrire dans le texte, le focus et la sélection de l'éditeur doivent survivre à l'ouverture et à la fermeture, une commande qui ouvre une fenêtre ne doit pas se la voir reprendre par le focus de l'éditeur.
//  - Alt+/ ouvre la palette depuis le document, le champ a le focus, rien n'est écrit dans le texte ; Alt+/ une seconde fois, Échap et « Fermer » la ferment, le focus revient au document, sa sélection intacte ;
//  - Ctrl+K reste « Lien… » (la palette n'y touche pas) et ne l'ouvre pas ;
//  - la liste (toutes les commandes de Réglages > Raccourcis sauf elle-même, un titre par groupe) ; la saisie la réduit (« pdf » trouve Exporter, « souligne » Souligné, mots dans n'importe quel ordre) ;
//  - ↑ ↓ Entrée : « Gras » lancé sur un mot choisi à la souris le met en gras, le curseur revient au document ; « Lien… » ouvre sa fenêtre et le focus y reste ;
//  - une commande grisée (Lecture) reste dans la liste, grisée, dit pourquoi, et Entrée sur elle ne lance rien ni ne ferme la fenêtre ;
//  - la touche se change dans Réglages > Raccourcis (Alt+Q ouvre, Alt+/ ne fait plus rien) ; la touche actuelle de chaque commande est montrée à sa droite ;
//  - 700x400 : la fenêtre tient dans le panneau, seule la liste défile, le champ ne bouge pas quand la liste raccourcit, le surlignage suit les flèches jusqu'au bout de la liste, contrastes ≥ 4,5:1 ;
//  - clair, sombre, anglais (« Command palette », « Shift »), mode Mac (⌥/, ⌘B).
// Lancé par run-headless.mjs (groupe Node "commandPaletteKeyboard", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-command-palette-keyboard.mjs
// PALETTE_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.PALETTE_PORT || 8962);
const SHOTS = process.env.PALETTE_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-text-expansion-keyboard.mjs.
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
if (!OFFLINE) console.log('[verify-command-palette-keyboard] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();
const pageErrors = [];
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

await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.getElementById('status-msg');
  return !!el && /prêt|ready/i.test(el.textContent || '');
}, null, { timeout: 90000 });

const nativeDialogs = [];
page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });

// Un export, un nouveau modèle ou une suppression ne sont pas ce qu'on mesure : le clic est compté et avalé avant d'aller au bout.
async function installSpy() {
  await page.evaluate(() => {
    window.__spy = {};
    document.addEventListener('click', event => {
      const el = event.target && event.target.closest && event.target.closest('#btn-export-pdf, #btn-new, #btn-delete');
      if (!el) return;
      window.__spy[el.id] = (window.__spy[el.id] || 0) + 1;
      event.stopImmediatePropagation();
      event.preventDefault();
    }, true);
  });
}
await installSpy();
// La page ne change plus de langue en route : Réglages garde le choix et la recharge. Le script fait pareil - il garde la langue, recharge, attend le widget et repose son espion.
async function restartIn(lang) {
  await page.evaluate(next => I18n.storeLang(next), lang);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  await installSpy();
}
const spied = id => page.evaluate(id => window.__spy[id] || 0, id);

async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const html = () => page.evaluate(() => Editor.getHTML());
const plain = () => page.evaluate(() => { const div = document.createElement('div'); div.innerHTML = Editor.getHTML(); return div.textContent; });
async function setDoc(doc) {
  await page.evaluate(d => { Editor.setHTML(d); }, doc);
  await page.waitForTimeout(250);
}
// Curseur à la fin du dernier bloc, par un vrai clic au milieu de ce bloc puis Ctrl+Fin. Pas à 20 px du haut de `.tiptap` : les 24 px du haut de la feuille sont la bande de l'en-tête
// (js/header-footer-preview.js, depuis la bande commune de l'éditeur et du PDF) - un clic dessus ouvre l'en-tête, et la frappe suivante y irait au lieu du document. Si le clavier n'est
// pas dans le document après le clic (en-tête ou pied ouvert, rien d'actif), le script s'arrête ici, sur la cause, plutôt que cinq contrôles plus loin.
async function focusEnd() {
  const box = await page.evaluate(() => {
    const root = document.querySelector('.tiptap');
    const blocks = Array.from(root.children).filter(el => el.getBoundingClientRect().height > 0 && !el.classList.contains('ProseMirror-widget') && !el.classList.contains('ProseMirror-gapcursor'));
    const last = blocks[blocks.length - 1] || root;
    last.scrollIntoView({ block: 'nearest' });
    const r = last.getBoundingClientRect();
    return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(80);
  const inDocument = await page.evaluate(() => {
    const el = document.activeElement;
    return !!el && !!el.closest && !!el.closest('.tiptap') && !HeaderFooterPreview.isEditingHeaderFooter();
  });
  if (!inDocument) throw new Error('focusEnd : après le clic, le clavier n\'est pas dans le document (en-tête ou pied ouvert ?)');
}
const mode = () => page.evaluate(() => (document.getElementById('btn-mode-read').classList.contains('active') ? 'read' : 'edit'));
const focused = () => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return 'rien';
  return el.closest && el.closest('.ProseMirror') ? 'éditeur' : (el.id || el.className || el.tagName);
});
const settingsOpen = () => page.evaluate(() => getComputedStyle(document.getElementById('settings-modal')).display !== 'none');
const text = selector => page.evaluate(sel => { const el = document.querySelector(sel); return el ? el.textContent : null; }, selector);
const visible = selector => page.evaluate(sel => { const el = document.querySelector(sel); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; }, selector);
const edge = (selector, side) => page.evaluate(({ selector, side }) => { const r = document.querySelector(selector).getBoundingClientRect(); return Math.round(r[side] * 10) / 10; }, { selector, side });
async function click(selector, wait = 150) { await page.click(selector, { timeout: 5000 }); await page.waitForTimeout(wait); }
const stored = () => page.evaluate(() => localStorage.getItem('pp_shortcuts'));
const keyBtn = id => `.settings-key-row[data-action="${id}"] .settings-key-btn`;
const resetBtn = id => `.settings-key-row[data-action="${id}"] .settings-key-reset`;
const errorOf = id => `.settings-key-row[data-action="${id}"] .settings-key-error`;
async function openKeys() {
  await click('#v2-btn-settings', 250);
  await click('#settings-modal .settings-tab[data-settings-tab="shortcuts"]', 250);
  if (!(await visible('#settings-keys-section'))) await click('#settings-switch-keys', 150);
}
async function closeSettings() { await click('#settings-close', 250); }
async function resetAll() {
  await page.evaluate(() => { Shortcuts.setPlatform(null); Shortcuts.resetAll(); });
  await page.waitForTimeout(80);
}
// L'info-bulle d'un hôte [data-tip] : le ::after (css/toolbar-v2.css), son texte et son rectangle en coordonnées fenêtre, calculés depuis les valeurs résolues du navigateur.
const tipOf = id => page.evaluate(id => {
  const host = document.getElementById(id);
  const r = host.getBoundingClientRect();
  const cs = getComputedStyle(host, '::after');
  const w = parseFloat(cs.width) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const left = r.left + host.clientLeft + parseFloat(cs.left) - w / 2;
  return { content: cs.content.replace(/^"|"$/g, ''), opacity: Number(cs.opacity), left: Math.round(left * 10) / 10, right: Math.round((left + w) * 10) / 10 };
}, id);
// L'info-bulle d'un bouton paraît .35s après le survol et se fond en .12s (css/toolbar-v2.css) : on attend qu'elle soit entière.
async function hover(id) {
  const point = await page.evaluate(id => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(id => Number(getComputedStyle(document.getElementById(id), '::after').opacity) === 1, id, { timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(60);
}


// === Aides propres à la palette ===============================================================================================================================
const paletteOpen = () => page.evaluate(() => { const o = document.getElementById('pp-palette-modal'); return !!o && getComputedStyle(o).display !== 'none'; });
const rows = () => page.evaluate(() => Array.from(document.querySelectorAll('#pp-palette-list .pp-palette-row')).map(row => ({
  id: row.dataset.command, name: row.querySelector('.pp-palette-name').textContent, key: (row.querySelector('.pp-palette-key') || {}).textContent || '',
  off: row.classList.contains('is-off'), disabled: row.getAttribute('aria-disabled') === 'true', active: row.classList.contains('is-active'), selected: row.getAttribute('aria-selected') === 'true',
})));
const groupTitles = () => page.evaluate(() => Array.from(document.querySelectorAll('#pp-palette-list .pp-palette-group')).map(h => h.textContent));
const hintText = () => text('.pp-palette-hint');
const actionCount = () => page.evaluate(() => Shortcuts.ACTIONS.length);
const link = () => page.evaluate(() => getComputedStyle(document.getElementById('pp-link-modal') || document.body).display !== 'none' && !!document.getElementById('pp-link-modal'));
const inPalette = () => page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest && !!a.closest('#pp-palette-modal'); });
const inputFocused = () => page.evaluate(() => document.activeElement === document.querySelector('.pp-palette-input'));
const selectedText = () => page.evaluate(() => { const ed = EditorCore.getEditor(); const { from, to } = ed.state.selection; return ed.state.doc.textBetween(from, to); });
async function typeInPalette(query) {
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  if (query) await page.keyboard.type(query);
  await page.waitForTimeout(60);
}
// Double-clic réel sur un mot du document : sa sélection est celle que la palette doit retrouver.
async function selectWord(word) {
  const point = await page.evaluate(word => {
    const walker = document.createTreeWalker(document.querySelector('.tiptap'), NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent.indexOf(word);
      if (at === -1) continue;
      const range = document.createRange();
      range.setStart(node, at + 1);
      range.setEnd(node, at + 2);
      const r = range.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  }, word);
  if (!point) throw new Error('selectWord : « ' + word + ' » introuvable dans le document');
  await page.mouse.move(2, 2);
  await page.mouse.dblclick(point.x, point.y);
  await page.waitForTimeout(150);
  if ((await selectedText()) !== word) throw new Error('selectWord : « ' + (await selectedText()) + ' » sélectionné au lieu de « ' + word + ' »');
}
async function openPalette(T, why) {
  await page.keyboard.press('Alt+/');
  await page.waitForTimeout(220);
  const open = await paletteOpen();
  if (!open) check(`${T} : ${why} : Alt+/ ouvre la palette`, false);
  return open;
}
async function closeLink() { if (await link()) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } }
// Le contraste WCAG d'un texte sur le fond réellement vu derrière lui (le premier ancêtre non transparent).
const contrastOf = selector => page.evaluate(selector => {
  const el = document.querySelector(selector);
  if (!el) return null;
  const parse = css => { const m = /rgba?\(([^)]+)\)/.exec(css); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  let bg = null;
  for (let node = el; node && !bg; node = node.parentElement) { const c = parse(getComputedStyle(node).backgroundColor); if (c && c.a > 0.99) bg = c; }
  const fg = parse(getComputedStyle(el).color);
  if (!bg || !fg) return null;
  const a = lum(fg), b = lum(bg);
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}, selector);

// === Un parcours complet, dans la langue et le thème de la page ================================================================================================
async function paletteRun(T, lang) {
  const fr = lang === 'fr';
  await resetAll();
  await setDoc('<p>Bonjour monde</p>');
  await selectWord('monde');

  // 1. L'ouverture, depuis le document
  const before = await html();
  await page.keyboard.press('Alt+/');
  await page.waitForTimeout(250);
  check(`${T} : Alt+/ ouvre la palette depuis le document`, await paletteOpen(), await paletteOpen());
  check(`${T} : le champ de recherche a le focus et rien n'est écrit dans le texte (ni « / » ni lettre)`, (await inputFocused()) && (await html()) === before && (await page.evaluate(() => document.querySelector('.pp-palette-input').value)) === '', { focus: await focused(), html: await html() });
  check(`${T} : le titre de la fenêtre est « ${fr ? 'Palette de commandes' : 'Command palette'} »`, (await text('#pp-palette-title')) === (fr ? 'Palette de commandes' : 'Command palette'), await text('#pp-palette-title'));
  const input = await page.evaluate(() => { const i = document.querySelector('.pp-palette-input'); return { role: i.getAttribute('role'), label: i.getAttribute('aria-label'), placeholder: i.placeholder, controls: i.getAttribute('aria-controls'), active: i.getAttribute('aria-activedescendant') }; });
  check(`${T} : le champ est un combobox nommé, lié à la liste, avec une invite`, input.role === 'combobox' && input.controls === 'pp-palette-list' && input.label === (fr ? 'Rechercher une commande' : 'Search for a command') && input.placeholder.length > 5 && !!input.active, input);
  const all = await rows();
  const count = await actionCount();
  check(`${T} : la liste porte toutes les commandes de Réglages > Raccourcis sauf la palette elle-même (${count - 1})`, all.length === count - 1 && !all.some(r => r.id === 'commandPalette'), { rows: all.length, count });
  check(`${T} : un titre par groupe quand rien n'est tapé (cinq), la première commande est surlignée`, (await groupTitles()).length === 5 && all[0].active && all[0].selected && all.filter(r => r.active).length === 1, { groups: await groupTitles(), first: all[0] });
  check(`${T} : la touche actuelle de chaque commande est à sa droite (Gras ${fr ? 'Ctrl+B' : 'Ctrl+B'}, Surligner Alt+${fr ? 'Maj' : 'Shift'}+H)`, all.find(r => r.id === 'bold').key === 'Ctrl+B' && all.find(r => r.id === 'highlight').key === `Alt+${fr ? 'Maj' : 'Shift'}+H` && all.find(r => r.id === 'table').key === '', all.find(r => r.id === 'highlight'));
  check(`${T} : la ligne du bas dit les touches de la liste`, (await hintText()) === (fr ? '↑ ↓ pour choisir · Entrée pour lancer · Échap pour fermer' : '↑ ↓ to choose · Enter to run · Esc to close'), await hintText());
  await snap(`palette-${T.replace(/\W+/g, '-')}-ouverte`);

  // 2. La recherche
  await page.keyboard.type('pdf');
  await page.waitForTimeout(80);
  let found = await rows();
  check(`${T} : « pdf » trouve ${fr ? 'Exporter' : 'Export'} (mot en plus), seul et surligné`, found.length >= 1 && found[0].id === 'exportPdf' && found[0].active && found.length <= 3, found.map(r => r.name));
  check(`${T} : une liste à plat pendant la recherche (plus de titre de groupe)`, (await groupTitles()).length === 0);
  await typeInPalette(fr ? 'souligne' : 'underline');
  found = await rows();
  check(`${T} : ${fr ? '« souligne » (sans accent) trouve Souligné' : '« underline » trouve Underline'}`, found.length >= 1 && found[0].id === 'underline', found.map(r => r.name));
  await typeInPalette(fr ? 'tableau inserer' : 'table insert');
  found = await rows();
  check(`${T} : les mots viennent dans n'importe quel ordre (${fr ? '« tableau inserer » → Insérer un tableau' : '« table insert » → Insert a table'})`, found.length >= 1 && found[0].id === 'table', found.map(r => r.name));
  await typeInPalette(fr ? 'titre' : 'heading');
  found = await rows();
  check(`${T} : les noms qui commencent par le mot passent devant (${fr ? 'Titre 1, 2, 3' : 'Heading 1, 2, 3'})`, found.slice(0, 3).map(r => r.id).join() === 'heading1,heading2,heading3', found.map(r => r.name));
  await typeInPalette(fr ? 'mise en forme' : 'formatting');
  found = await rows();
  const formatIds = await page.evaluate(() => Shortcuts.ACTIONS.filter(a => a.group === 'format').map(a => a.id));
  check(`${T} : le nom du groupe se cherche aussi (« ${fr ? 'mise en forme' : 'formatting'} » retient toutes les commandes du groupe)`, formatIds.every(id => found.some(r => r.id === id)), { found: found.length, formatIds: formatIds.length });
  await typeInPalette('zzzz');
  const noneHint = await page.evaluate(() => ({ rows: document.querySelectorAll('#pp-palette-list .pp-palette-row').length, empty: (() => { const e = document.querySelector('.pp-palette-empty'); return e && !e.hidden ? e.textContent : null; })() }));
  check(`${T} : sans résultat, la fenêtre le dit avec la saisie`, noneHint.rows === 0 && !!noneHint.empty && noneHint.empty.includes('zzzz'), noneHint);
  await page.keyboard.press('Enter');
  check(`${T} : Entrée sans résultat ne ferme rien et ne lance rien`, (await paletteOpen()) && (await html()) === before, await html());
  await typeInPalette('');
  check(`${T} : le champ vidé rend toute la liste`, (await rows()).length === count - 1);

  // 3. Les flèches
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  let now = await rows();
  check(`${T} : ↓ ↓ surligne la troisième commande, une seule à la fois`, now[2].active && now.filter(r => r.active).length === 1, now.map(r => r.active));
  await page.keyboard.press('ArrowUp');
  now = await rows();
  check(`${T} : ↑ remonte d'une commande`, now[1].active && now.filter(r => r.active).length === 1);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  now = await rows();
  check(`${T} : ↑ au début de la liste passe à la dernière commande`, now[now.length - 1].active);
  const lastVisible = await page.evaluate(() => { const row = document.querySelector('#pp-palette-list .pp-palette-row.is-active'); const body = document.querySelector('#pp-palette-modal .pp-modal-body'); const r = row.getBoundingClientRect(), b = body.getBoundingClientRect(); return r.top >= b.top - 1 && r.bottom <= b.bottom + 1; });
  check(`${T} : la commande surlignée est ramenée dans la zone visible de la liste`, lastVisible);
  await page.keyboard.press('ArrowDown');
  now = await rows();
  check(`${T} : ↓ à la fin de la liste revient à la première`, now[0].active);

  // 4. Lancer « Gras » sur le mot choisi à la souris
  await typeInPalette(fr ? 'gras' : 'bold');
  found = await rows();
  check(`${T} : « ${fr ? 'gras' : 'bold'} » surligne ${fr ? 'Gras' : 'Bold'} en premier`, found.length >= 1 && found[0].id === 'bold' && found[0].active, found.map(r => r.name));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  check(`${T} : Entrée lance la commande : le mot choisi est en gras (rien d'autre)`, /<strong>monde<\/strong>/.test(await html()) && (await plain()) === 'Bonjour monde', await html());
  check(`${T} : la palette est fermée et le focus est revenu au document`, !(await paletteOpen()) && (await focused()) === 'éditeur', { open: await paletteOpen(), focus: await focused() });
  await page.keyboard.type('!');
  check(`${T} : la sélection a survécu : la frappe suivante remplace le mot`, (await plain()) === 'Bonjour !', await plain());

  // 5. Échap, Alt+/ une seconde fois et « Fermer » rendent le focus et la sélection
  await setDoc('<p>Bonjour monde</p>');
  await selectWord('monde');
  if (await openPalette(T, 'avant Échap')) {
    await page.keyboard.type('gras');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check(`${T} : Échap ferme sans rien lancer, le focus et la sélection reviennent au document`, !(await paletteOpen()) && (await focused()) === 'éditeur' && (await selectedText()) === 'monde' && !/<strong/.test(await html()), { open: await paletteOpen(), focus: await focused(), sel: await selectedText() });
  }
  if (await openPalette(T, 'avant Alt+/')) {
    await page.keyboard.press('Alt+/');
    await page.waitForTimeout(250);
    check(`${T} : Alt+/ une seconde fois referme la palette, le focus revient au document`, !(await paletteOpen()) && (await focused()) === 'éditeur' && (await selectedText()) === 'monde', { open: await paletteOpen(), focus: await focused() });
  }
  if (await openPalette(T, 'avant Fermer')) {
    await click('#pp-palette-modal .pp-palette-actions button', 250);
    check(`${T} : « ${fr ? 'Fermer' : 'Close'} » ferme la palette, le focus revient au document`, !(await paletteOpen()) && (await focused()) === 'éditeur' && (await selectedText()) === 'monde', { open: await paletteOpen(), focus: await focused() });
  }
  check(`${T} : le bouton du bas se nomme « ${fr ? 'Fermer' : 'Close'} »`, (await page.evaluate(() => document.querySelector('#pp-palette-modal .pp-palette-actions button').textContent)) === (fr ? 'Fermer' : 'Close'));

  // 6. Ctrl+K reste « Lien… »
  await focusEnd();
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
  check(`${T} : Ctrl+K ouvre toujours la fenêtre du lien, pas la palette`, (await link()) && !(await paletteOpen()), { link: await link(), palette: await paletteOpen() });
  await closeLink();

  // 7. Une commande qui ouvre une fenêtre : le focus y reste
  await focusEnd();
  if (await openPalette(T, 'avant Lien…')) {
    await page.keyboard.type(fr ? 'lien' : 'link');
    await page.waitForTimeout(60);
    check(`${T} : « ${fr ? 'lien' : 'link'} » surligne ${fr ? 'Lien…' : 'Link…'}`, (await rows())[0].id === 'link', (await rows()).map(r => r.name));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    check(`${T} : ${fr ? 'Lien…' : 'Link…'} lancé depuis la palette ouvre sa fenêtre, que le focus de l'éditeur ne lui reprend pas`, !(await paletteOpen()) && (await link()) && (await page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest('#pp-link-modal'); })), { palette: await paletteOpen(), link: await link(), focus: await focused() });
    await closeLink();
  }

  // 8. Une commande grisée reste dans la liste et dit pourquoi
  await page.keyboard.press('Alt+l');
  await page.waitForTimeout(300);
  check(`${T} : Alt+L passe en Lecture (préparation)`, (await mode()) === 'read', await mode());
  const readBefore = await html();
  if (await openPalette(T, 'en Lecture')) {
    await page.keyboard.type(fr ? 'gras' : 'bold');
    await page.waitForTimeout(80);
    found = await rows();
    const bold = found.find(r => r.id === 'bold');
    check(`${T} : en Lecture, ${fr ? 'Gras' : 'Bold'} reste dans la liste, grisé (aria-disabled), il ne disparaît pas`, !!bold && bold.off && bold.disabled && bold.active, found);
    const why = await hintText();
    check(`${T} : surlignée, la commande grisée dit pourquoi au bas de la fenêtre (pas la ligne des touches)`, !!why && why !== (fr ? '↑ ↓ pour choisir · Entrée pour lancer · Échap pour fermer' : '↑ ↓ to choose · Enter to run · Esc to close'), why);
    await snap(`palette-${T.replace(/\W+/g, '-')}-grisee`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    check(`${T} : Entrée sur une commande grisée ne lance rien et laisse la fenêtre ouverte`, (await paletteOpen()) && (await inputFocused()) && (await html()) === readBefore, { open: await paletteOpen(), html: await html() });
    await typeInPalette(fr ? 'mode édition' : 'edit mode');
    found = await rows();
    check(`${T} : en Lecture, « ${fr ? 'Mode édition' : 'Edit mode'} » reste disponible`, found.length >= 1 && found[0].id === 'modeEdit' && !found[0].off, found.map(r => r.name + (r.off ? ' (grisé)' : '')));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(350);
    check(`${T} : « Mode édition » lancé depuis la palette repasse en Édition`, (await mode()) === 'edit' && !(await paletteOpen()), { mode: await mode(), open: await paletteOpen() });
  } else {
    await page.keyboard.press('Alt+e');
    await page.waitForTimeout(300);
  }

  // 9. La souris : surligner en bougeant, lancer au clic
  await setDoc('<p>Bonjour monde</p>');
  await focusEnd();
  if (await openPalette(T, 'à la souris')) {
    await typeInPalette(fr ? 'mode' : 'mode');
    const target = await page.evaluate(() => { const row = Array.from(document.querySelectorAll('#pp-palette-list .pp-palette-row')).find(r => r.dataset.command === 'modeRead'); const r = row.getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height / 2, id: row.dataset.command }; });
    await page.mouse.move(target.x - 5, target.y - 1);
    await page.mouse.move(target.x, target.y);
    await page.waitForTimeout(120);
    found = await rows();
    check(`${T} : la souris surligne la ligne survolée`, found.find(r => r.active).id === 'modeRead', found.map(r => r.id + (r.active ? '*' : '')));
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(350);
    check(`${T} : un clic sur la ligne lance la commande (${fr ? 'Mode lecture' : 'Read mode'})`, (await mode()) === 'read' && !(await paletteOpen()), { mode: await mode(), open: await paletteOpen() });
    await page.keyboard.press('Alt+e');
    await page.waitForTimeout(300);
  }
}

// === La touche de la palette se change comme les autres ========================================================================================================
async function keyPart(T) {
  await resetAll();
  await setDoc('<p>Bonjour monde</p>');
  await focusEnd();
  const before = await html();
  await page.evaluate(() => Shortcuts.setKey('commandPalette', 'Alt+q'));
  await page.keyboard.press('Alt+/');
  await page.waitForTimeout(200);
  check(`${T} : la touche changée en Alt+Q, Alt+/ ne fait plus rien`, !(await paletteOpen()) && (await html()) === before, await paletteOpen());
  await page.keyboard.press('Alt+q');
  await page.waitForTimeout(250);
  check(`${T} : Alt+Q ouvre la palette`, await paletteOpen());
  await page.keyboard.press('Alt+q');
  await page.waitForTimeout(250);
  check(`${T} : Alt+Q la referme aussi (la touche choisie, pas Alt+/)`, !(await paletteOpen()) && (await focused()) === 'éditeur', { open: await paletteOpen(), focus: await focused() });
  await page.evaluate(() => Shortcuts.setKey('bold', 'Alt+b'));
  await page.keyboard.press('Alt+q');
  await page.waitForTimeout(250);
  const bold = (await rows()).find(r => r.id === 'bold');
  check(`${T} : la palette montre la touche choisie d'une autre commande (Gras : Alt+B)`, !!bold && bold.key === 'Alt+B', bold);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate(() => Shortcuts.setKey('commandPalette', ''));
  await page.keyboard.press('Alt+q');
  await page.keyboard.press('Alt+/');
  await page.waitForTimeout(200);
  check(`${T} : sans touche, la palette ne s'ouvre ni par Alt+Q ni par Alt+/`, !(await paletteOpen()) && (await html()) === before, await paletteOpen());
  await resetAll();
  await focusEnd();
  await page.keyboard.press('Alt+/');
  await page.waitForTimeout(250);
  check(`${T} : « Par défaut » rend Alt+/`, await paletteOpen());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

// === 700x400 : la fenêtre tient, seule la liste défile, le champ ne bouge pas ===================================================================================
async function geometryPart(T, lang) {
  await resetAll();
  await setDoc('<p>Bonjour monde</p>');
  await focusEnd();
  if (!(await openPalette(T, 'géométrie'))) return;
  const measure = () => page.evaluate(() => {
    const rect = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10, left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, height: Math.round(r.height * 10) / 10 }; };
    const body = document.querySelector('#pp-palette-modal .pp-modal-body');
    const box = document.querySelector('#pp-palette-modal .pp-modal-box');
    const names = Array.from(document.querySelectorAll('.pp-palette-name'));
    const hint = document.querySelector('.pp-palette-hint');
    return {
      box: rect('#pp-palette-modal .pp-modal-box'), title: rect('#pp-palette-title'), input: rect('.pp-palette-input'), actions: rect('.pp-palette-actions'), closeButton: rect('.pp-palette-actions button'), body: rect('#pp-palette-modal .pp-modal-body'),
      bodyOverflows: body.scrollHeight > body.clientHeight + 1, boxOverflows: box.scrollHeight > box.clientHeight + 1, pageScrollsX: document.documentElement.scrollWidth > innerWidth + 1,
      clipped: names.filter(n => n.scrollWidth > n.clientWidth + 1).length, hintClipped: hint.scrollWidth > hint.clientWidth + 1, scrollTop: body.scrollTop,
      visibleRows: Array.from(document.querySelectorAll('.pp-palette-row')).filter(r => { const x = r.getBoundingClientRect(), b = body.getBoundingClientRect(); return x.top >= b.top - 1 && x.bottom <= b.bottom + 1; }).length,
    };
  });
  const first = await measure();
  check(`${T} : la fenêtre tient dans le panneau de ${WIDTH}x${HEIGHT}`, first.box.top >= 0 && first.box.left >= 0 && first.box.right <= WIDTH && first.box.bottom <= HEIGHT && !first.pageScrollsX && !first.boxOverflows, first.box);
  check(`${T} : le titre, le champ et « Fermer » sont tous entiers dans la fenêtre`, first.title.top >= first.box.top && first.input.top >= first.title.bottom - 1 && first.input.bottom <= first.body.top + 1 && first.closeButton.bottom <= first.box.bottom && first.actions.top >= first.body.bottom - 1, first);
  check(`${T} : la liste est la seule zone qui défile (59 commandes, au moins 5 entières à l'écran)`, first.bodyOverflows && first.visibleRows >= 5, { overflows: first.bodyOverflows, visible: first.visibleRows });
  check(`${T} : aucun nom de commande n'est coupé, la ligne du bas non plus`, first.clipped === 0 && !first.hintClipped, { clipped: first.clipped, hint: first.hintClipped });
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(120);
  const scrolled = await measure();
  check(`${T} : en bas de la liste, le champ, le titre et « Fermer » n'ont pas bougé`, scrolled.scrollTop > 0 && scrolled.input.top === first.input.top && scrolled.title.top === first.title.top && scrolled.closeButton.top === first.closeButton.top && scrolled.box.top === first.box.top, { first, scrolled });
  await snap(`palette-${T.replace(/\W+/g, '-')}-liste-en-bas`);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(120);
  const top = await measure();
  check(`${T} : de retour à la première commande, la liste remonte tout en haut`, top.scrollTop === 0, top.scrollTop);
  await typeInPalette('zzzz');
  const empty = await measure();
  check(`${T} : la fenêtre reste calée en haut : le champ ne bouge pas quand la liste se vide`, empty.input.top === first.input.top && empty.box.top === first.box.top, { first: first.input, empty: empty.input });
  const emptyContrast = await contrastOf('.pp-palette-empty');
  check(`${T} : le texte « aucune commande » a un contraste ≥ 4,5:1`, emptyContrast >= 4.5, emptyContrast);
  await snap(`palette-${T.replace(/\W+/g, '-')}-sans-resultat`);
  await typeInPalette('');
  const contrasts = {
    name: await contrastOf('.pp-palette-row:not(.is-active):not(.is-off) .pp-palette-name'),
    key: await contrastOf('.pp-palette-row:not(.is-active):not(.is-off) .pp-palette-key'),
    active: await contrastOf('.pp-palette-row.is-active .pp-palette-name'),
    activeKey: await contrastOf('.pp-palette-row.is-active .pp-palette-key'),
    group: await contrastOf('.pp-palette-group'),
    hint: await contrastOf('.pp-palette-hint'),
  };
  check(`${T} : contrastes ≥ 4,5:1 (nom, touche, ligne surlignée, titre de groupe, bas de fenêtre)`, Object.values(contrasts).every(v => v !== null && v >= 4.5), contrasts);
  // Une commande grisée : Lecture.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('Alt+l');
  await page.waitForTimeout(300);
  await page.keyboard.press('Alt+/');
  await page.waitForTimeout(250);
  await page.keyboard.type(lang === 'fr' ? 'gras' : 'bold');
  await page.waitForTimeout(80);
  const off = {
    name: await contrastOf('.pp-palette-row.is-off .pp-palette-name'),
    key: await contrastOf('.pp-palette-row.is-off .pp-palette-key'),
    hint: await contrastOf('.pp-palette-hint'),
    title: await page.evaluate(() => (document.querySelector('.pp-palette-row.is-off') || {}).title || ''),
  };
  check(`${T} : une commande grisée garde un contraste ≥ 4,5:1 et sa raison en info-bulle`, off.name >= 4.5 && off.key >= 4.5 && off.hint >= 4.5 && off.title.length > 3, off);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('Alt+e');
  await page.waitForTimeout(300);
}

async function fullRun(T, lang) {
  await paletteRun(T, lang);
  await keyPart(T);
  await geometryPart(T, lang);
}

// === Mode Mac : ⌥/ et ⌘ ========================================================================================================================================
async function macPart(T) {
  await resetAll();
  await setDoc('<p>Bonjour monde</p>');
  await focusEnd();
  await page.evaluate(() => Shortcuts.setPlatform('mac'));
  await page.waitForTimeout(100);
  check(`${T} : mode Mac : la touche de la palette s'écrit ⌥/`, (await page.evaluate(() => Shortcuts.label('commandPalette'))) === '⌥/', await page.evaluate(() => Shortcuts.label('commandPalette')));
  await page.keyboard.press('Alt+/');
  await page.waitForTimeout(250);
  check(`${T} : mode Mac : ⌥/ ouvre la palette`, await paletteOpen());
  const all = await rows();
  check(`${T} : mode Mac : les touches des commandes sont écrites à la façon du Mac (Gras ⌘B, Surligner ⌥⇧H)`, all.find(r => r.id === 'bold').key === '⌘B' && all.find(r => r.id === 'highlight').key === '⌥⇧H', all.find(r => r.id === 'bold'));
  await snap(`palette-${T.replace(/\W+/g, '-')}-mac`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  // Sur un clavier Mac, Option+/ écrit « ÷ » : la touche se lit sur le code physique (une frappe synthétique, Chromium sous Linux n'écrit pas le « ÷ »).
  await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: '÷', code: 'Slash', altKey: true, bubbles: true, cancelable: true, composed: true })));
  await page.waitForTimeout(250);
  check(`${T} : mode Mac : Option+/ qui écrit « ÷ » ouvre aussi la palette (lu sur le code physique)`, await paletteOpen());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate(() => Shortcuts.setPlatform(null));
  // Hors Mac, la même frappe n'est pas Alt+/ : elle reste au texte.
  await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: '÷', code: 'Slash', altKey: true, bubbles: true, cancelable: true, composed: true })));
  await page.waitForTimeout(200);
  check(`${T} : hors Mac, « ÷ » avec Alt n'ouvre pas la palette`, !(await paletteOpen()));
}

await fullRun('clair', 'fr');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(250);
await fullRun('sombre', 'fr');
await page.evaluate(() => Settings.setTheme('light'));
await page.waitForTimeout(250);
await restartIn('en');
await fullRun('anglais', 'en');
await restartIn('fr');
await macPart('Mac');
await resetAll();

const stray = await page.evaluate(() => Object.keys(localStorage).filter(key => /palette/i.test(key)));
check('la palette ne retient rien d\'une ouverture à l\'autre (aucune clé de stockage à son nom)', stray.length === 0, stray);
check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
