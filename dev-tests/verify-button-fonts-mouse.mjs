#!/usr/bin/env node
// Police des boutons et des libellés de l'interface à la VRAIE souris (page.mouse, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400) - « Oui, tous » d'Antoine du 12/10, à la carte
// « Passer aussi les boutons et libellés restés en Arial dans la police des boutons ? ». Depuis la bascule du 04/10 sur la police du système (--font-ui), les boutons des barres la prenaient, mais ceux qu'aucune règle
// ne touchait (FR, US, J, M, A, « Lettres » et « vrai / faux » de la barre d'une variable...) gardaient la police par défaut du navigateur, Arial, et les lignes du menu des polices et des tailles
// (`font-family: inherit`) comme « + Ajouter un en-tête / un pied de page » celle de `body`, Arial aussi. Une règle de base (`input, select, textarea, button`) et deux conteneurs (`.v2-format-panel`, `.v2-hf-zone-ghost`) leur
// donnent --font-ui ; ce script le mesure dans un vrai navigateur : tout bouton, champ ou texte de l'interface a EXACTEMENT la police du bouton « Enregistrer » (qui commence par system-ui), garde sa taille de police
// (12,5 px les lignes des menus, 11,5 et 12 px les boutons d'une variable, 10,5 px le fantôme) et les lignes du menu des polices gardent leur hauteur (26 px). Parcours : au repos (le DOM entier, éléments cachés compris),
// le menu des polices puis celui des tailles (un clic sur une ligne le ferme), la barre d'une variable de chaque type (texte, nombre, date, oui/non), les zones d'en-tête et de pied survolées, un nouvel email, les sept onglets des
// Réglages, la galerie, le macro-modèle, « Organiser mes modèles », la liste des modèles, « Enregistrer sous… » ; un guetteur de DOM contrôle aussi tout élément apparu pendant le parcours (les fenêtres montées par script).
// Une seconde page (un en-tête et un pied remplis, assez de lignes pour une deuxième page) vérifie aussi que le TEXTE des en-têtes et pieds de page de la feuille est en Roboto, comme le document - « Oui, Roboto » d'Antoine
// du 12/10, à la carte « Passer le texte des en-têtes et pieds de page en Roboto ? » : zones de bord, survol à la souris, bandes de couture. Ce texte est du contenu du modèle, pas de l'interface.
// La même seconde page, en anglais, vérifie les lettres des boutons jour / mois / année de la barre d'une date - « Oui, D M Y » d'Antoine du 12/10, à la carte « Traduire les boutons J, M, A de la date en anglais ? » :
// D, M, Y dès la première ouverture, puis J, M, A et D, M, Y après un changement de langue sans recharger la page, et un vrai clic sur « D ».
// Les champs ont aussi leur script, plus détaillé : verify-field-fonts-mouse.mjs (groupe fieldFontsMouse).
// Lancé par run-headless.mjs (groupe Node "buttonFontsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-button-fonts-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.BUTTON_FONTS_MOUSE_PORT || 9021);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-settings-window-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-button-fonts-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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


async function openWidget(colorScheme, opts = {}) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => d.accept().catch(() => {}));
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
  // Guetteur : tout bouton, champ ou texte qui entre dans la page (une fenêtre montée par script, une barre qui s'ouvre) est noté avec sa police au tour d'affichage suivant ; le contenu du document n'en fait pas partie.
  await page.addInitScript(() => {
    window.__uiFonts = [];
    const CONTENT = '.tiptap, .ProseMirror, .reader-content, .pp-callout-paper, .v2-page-watermark, .v2-hf-zone-body, .v2-page-band-header, .v2-page-band-footer, #tpl-preview-sheet, #tpl-preview-tiptap, .pp-sheet-page, svg';
    const SKIP = /^(SCRIPT|STYLE|OPTION|OPTGROUP|BR|HR|TEMPLATE|NOSCRIPT|TITLE)$/;
    const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    const pending = new Set();
    const flush = () => {
      for (const el of pending) {
        if (!el.isConnected || !document.body || !document.body.contains(el) || SKIP.test(el.tagName) || el.closest(CONTENT) || window.__uiFonts.length >= 20000) continue;
        const control = /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName);
        const own = Array.from(el.childNodes).some(node => node.nodeType === 3 && node.textContent.trim());
        if (control || own) window.__uiFonts.push({ desc: desc(el), ff: getComputedStyle(el).fontFamily });
      }
      pending.clear();
    };
    new MutationObserver(list => {
      for (const m of list) for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        pending.add(node);
        node.querySelectorAll('*').forEach(el => pending.add(el));
      }
      if (pending.size) requestAnimationFrame(flush);
    }).observe(document, { childList: true, subtree: true });
  });
  // Semé avant le démarrage : une table de données (nombre, date, oui/non) et un modèle ouvert par défaut avec une bulle de chaque type, pour ouvrir la barre de chacune. Aucun réglage de droits.
  await page.addInitScript(opts => {
    if (opts.lang) { try { localStorage.setItem('pp_lang', opts.lang); } catch (e) { /* stockage indisponible : la langue reste celle du navigateur */ } }
    window.__preSeedGristStub = (stub) => {
      stub.setVariables('Clients', { Nom: 'Text', Montant: 'Numeric', Date: 'Date', Actif: 'Bool' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont', Montant: 12.5, Date: 1790000000, Actif: true }]);
      const badge = c => `<span class="var-badge" data-table="Clients" data-column="${c}" data-key="Clients.${c}"></span>`;
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      // Avec `headerFooter` : un en-tête et un pied remplis et assez de lignes pour une deuxième page, donc une bande de couture (fin de la page 1, début de la page 2).
      m.Contenu.push(`<p>Bonjour ${badge('Nom')}, montant ${badge('Montant')}, le ${badge('Date')}, actif ${badge('Actif')}.</p>` + (opts.headerFooter ? Array.from({ length: 80 }, (_, i) => `<p>Ligne ${i + 1} du contrat.</p>`).join('') : ''));
      m.NomFichierPDF.push('');
      m.HeaderFooter.push(opts.headerFooter ? JSON.stringify({ enabled: true, differentFirstPage: false, header: { default: '<p>En-tête du contrat</p>', first: '' }, footer: { default: '<p>Pied de page du contrat</p>', first: '' } }) : '');
      m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  }, opts);
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  return { context, page };
}

// ===== Mesures =====
// Tout bouton, champ ou texte de la page (éléments cachés compris : un menu fermé existe dans le DOM), hors contenu du document : l'éditeur, la Lecture, les aperçus de modèle et les dessins (svg) gardent
// la police du contenu (Roboto) ou leur propre police, pas celle de l'interface. Renvoie le nombre d'éléments examinés et ceux qui n'ont pas la police de la référence.
const sweepOutside = (page, ref) => page.evaluate(ref => {
  const CONTENT = '.tiptap, .ProseMirror, .reader-content, .pp-callout-paper, .v2-page-watermark, .v2-hf-zone-body, .v2-page-band-header, .v2-page-band-footer, #tpl-preview-sheet, #tpl-preview-tiptap, .pp-sheet-page, svg';
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  let n = 0;
  const outside = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (/^(SCRIPT|STYLE|OPTION|OPTGROUP|BR|HR|TEMPLATE|NOSCRIPT)$/.test(el.tagName) || el.closest(CONTENT)) continue;
    const control = /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName);
    const own = Array.from(el.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim();
    if (!control && !own) continue;
    n++;
    const ff = getComputedStyle(el).fontFamily;
    if (ff !== ref) outside.push(`${desc(el)} : ${ff}${own ? ' « ' + own.slice(0, 24) + ' »' : ''}`);
  }
  return { n, outside };
}, ref);
// Les lignes d'un menu ouvert (le panneau affiché, parmi tous ceux de la page) : police, taille de police, hauteur de chaque ligne et boîte du panneau.
const openPanelRows = (page, panelSelector) => page.evaluate(sel => {
  const panel = Array.from(document.querySelectorAll(sel)).find(el => el.getClientRects().length > 0);
  if (!panel) return null;
  const r = panel.getBoundingClientRect();
  return {
    box: { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) },
    rows: Array.from(panel.querySelectorAll('button')).map(b => { const cs = getComputedStyle(b); return { t: b.textContent.trim(), ff: cs.fontFamily, fs: cs.fontSize, h: Math.round(b.getBoundingClientRect().height * 10) / 10 }; }),
  };
}, panelSelector);
// Les boutons à texte de la barre d'une variable affichée (FR, US, J, M, A, Lettres, vrai / faux...) et sa boîte.
const openVarBar = page => page.evaluate(() => {
  const bar = Array.from(document.querySelectorAll('.v2-varfmt-toolbar')).find(el => el.getClientRects().length > 0);
  if (!bar) return null;
  const r = bar.getBoundingClientRect();
  const buttons = Array.from(bar.querySelectorAll('button')).filter(b => b.getClientRects().length > 0 && b.textContent.trim()).map(b => { const cs = getComputedStyle(b); return { t: b.textContent.trim(), ff: cs.fontFamily, fs: cs.fontSize, h: Math.round(b.getBoundingClientRect().height * 10) / 10 }; });
  return { box: { left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height) }, buttons };
});
// Le fantôme « + Ajouter un en-tête / un pied de page » d'une zone vide (haut ou bas) : affiché ou non, police, taille, graisse, texte.
const ghostOf = (page, which) => page.evaluate(w => {
  const g = document.querySelector(`.v2-hf-zone-empty.v2-page-edge-${w} .v2-hf-zone-ghost`);
  if (!g) return null;
  const cs = getComputedStyle(g);
  return { shown: cs.display !== 'none' && g.getClientRects().length > 0, ff: cs.fontFamily, fs: cs.fontSize, fw: cs.fontWeight, text: g.textContent.trim() };
}, which);

// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function boxOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selector);
}
async function realHover(page, selector, wait = 300) {
  const b = await boxOf(page, selector);
  if (!b) return false;
  await page.mouse.move(b.x - 8, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.waitForTimeout(wait);
  return true;
}
async function realClick(page, selector, wait = 300) {
  const b = await boxOf(page, selector);
  if (!b) return false;
  await page.mouse.move(b.x - 6, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(wait);
  return true;
}
// Clic sur la bulle n° `index` du document (0 : texte, 1 : nombre, 2 : date, 3 : oui/non) : sa barre s'ouvre.
async function clickBadge(page, index) {
  const b = await page.evaluate(i => { const el = document.querySelectorAll('.tiptap .var-badge')[i]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, index);
  if (!b) return false;
  await page.mouse.move(b.x - 6, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(700);
  return true;
}
// Survol d'une zone d'en-tête ou de pied : la souris vient du milieu de la feuille, comme sur une page ; la zone s'allume (classe `v2-hf-zone-hover`) et son invitation apparaît.
async function hoverZone(page, which) {
  const b = await boxOf(page, `.v2-hf-zone-empty.v2-page-edge-${which}`);
  if (!b) return false;
  await page.mouse.move(b.x, which === 'top' ? b.y + 60 : b.y - 60, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.waitForTimeout(500);
  return true;
}
const shown = (page, selector) => page.evaluate(sel => { const el = document.querySelector(sel); return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0; }, selector);

console.log(`\n=== Police des boutons et des libellés de l'interface, ${WIDTH}x${HEIGHT}, vraie souris ===`);
const { context, page } = await openWidget('light');
const ref = await page.evaluate(() => getComputedStyle(document.getElementById('btn-save')).fontFamily);
check('la police de référence (« Enregistrer ») est celle du système : --font-ui commence par system-ui', /^system-ui\b/.test(ref), ref);
const sweeps = {};
const sweepAs = async group => { const s = await sweepOutside(page, ref); (sweeps[group] ||= { states: 0, n: 0, outside: [] }); sweeps[group].states++; sweeps[group].n += s.n; sweeps[group].outside.push(...s.outside); return s; };
// Referme un menu ou une barre : Échap, puis un clic dans le vide à droite de la ligne du document (le curseur y reste : un clic ailleurs ferait perdre le focus à l'éditeur, et la bulle suivante ne s'ouvrirait qu'au second clic).
const closeMenusOf = async pg => {
  await pg.keyboard.press('Escape');
  const at = await pg.evaluate(() => { const r = document.querySelector('.tiptap p').getBoundingClientRect(); return { x: r.right - 12, y: r.y + r.height / 2 }; });
  await pg.mouse.move(at.x - 20, at.y, { steps: 2 });
  await pg.mouse.click(at.x, at.y);
  await pg.waitForTimeout(200);
};
const closeMenus = () => closeMenusOf(page);

// ===== 1) Au repos : tout le DOM, éléments cachés compris =====
const rest = await sweepAs('repos');
check(`au repos : les ${rest.n} boutons, champs et textes de la page (menus et fenêtres fermés compris) ont tous la police des boutons`, rest.n >= 300 && rest.outside.length === 0, { n: rest.n, outside: rest.outside.slice(0, 10), total: rest.outside.length });

// ===== 2) Le menu des polices et celui des tailles =====
await realClick(page, '#v2-font-chip', 400);
const fonts = await openPanelRows(page, '.v2-format-panel');
check('menu des polices : il s\'ouvre à la souris, avec ses six lignes, dans le panneau', !!fonts && fonts.rows.length === 6 && fonts.box.left >= 0 && fonts.box.right <= WIDTH && fonts.box.bottom <= HEIGHT, fonts);
check('menu des polices : chaque ligne a la police des boutons, sans changer de taille de police (12,5 px)', !!fonts && fonts.rows.every(r => r.ff === ref && r.fs === '12.5px'), fonts && fonts.rows.map(r => `${r.t} : ${r.ff} ${r.fs}`));
check('menu des polices : chaque ligne garde sa hauteur de 26 px, quelle que soit la police du système', !!fonts && fonts.rows.every(r => r.h === 26), fonts && fonts.rows.map(r => `${r.t} : ${r.h}`));
await sweepAs('menus');
await realClick(page, '.v2-format-panel.visible button:nth-child(4)', 400);
check('menu des polices : un clic sur une ligne le referme', !(await openPanelRows(page, '.v2-format-panel')));

await realClick(page, '#v2-size-chip-val', 400);
const sizes = await openPanelRows(page, '.v2-format-panel');
check('menu des tailles : il s\'ouvre à la souris, avec ses seize lignes, dans le panneau', !!sizes && sizes.rows.length === 16 && sizes.box.left >= 0 && sizes.box.right <= WIDTH && sizes.box.bottom <= HEIGHT, sizes);
check('menu des tailles : chaque ligne a la police des boutons, sans changer de taille de police (12,5 px) ni de hauteur (26 px)', !!sizes && sizes.rows.every(r => r.ff === ref && r.fs === '12.5px' && r.h === 26), sizes && sizes.rows.filter(r => r.ff !== ref || r.fs !== '12.5px' || r.h !== 26).map(r => `${r.t} : ${r.ff} ${r.fs} ${r.h}`));
await sweepAs('menus');
await realClick(page, '.v2-format-panel.visible button:nth-child(6)', 400);
check('menu des tailles : un clic sur une ligne le referme', !(await openPanelRows(page, '.v2-format-panel')));

// ===== 3) La barre d'une variable, de chaque type =====
const BARS = [[1, 'nombre', ['FR', 'US', '—', 'Lettres']], [2, 'date', ['J', 'M', 'A']], [3, 'oui/non', null]];
for (const [index, kind, expected] of BARS) {
  await closeMenus();
  const opened = await clickBadge(page, index);
  const bar = await openVarBar(page);
  check(`barre d'une variable ${kind} : elle s'ouvre à la souris, dans le panneau (700 px), et garde sa hauteur de 36 px`, opened && !!bar && bar.box.left >= 0 && bar.box.right <= WIDTH && bar.box.height === 36, bar);
  const texts = bar ? bar.buttons.map(b => b.t) : [];
  check(`barre d'une variable ${kind} : ${expected ? expected.join(', ') : 'ses boutons à texte'} ont la police des boutons, sans changer de taille de police (11,5 ou 12 px) ni de hauteur (26 px)`,
    !!bar && bar.buttons.length >= (expected ? expected.length : 1) && (!expected || expected.every(t => texts.includes(t))) && bar.buttons.every(b => b.ff === ref && (b.fs === '11.5px' || b.fs === '12px') && b.h === 26), bar && bar.buttons.map(b => `${b.t} : ${b.ff} ${b.fs} ${b.h}`));
  await sweepAs('barres');
}
// Un clic sur « US » rend le bouton actif : la barre reste utilisable avec la nouvelle police.
await closeMenus();
await clickBadge(page, 1);
await realClick(page, '.v2-varfmt-toolbar.visible button[data-action="num-style:us"]', 400);
check('barre d\'une variable nombre : un clic sur « US » le rend actif (la barre fonctionne comme avant)', await page.evaluate(() => { const b = document.querySelector('.v2-varfmt-toolbar.visible button[data-action="num-style:us"]'); return !!b && b.classList.contains('is-active'); }));
await closeMenus();

// ===== 4) Les zones d'en-tête et de pied de la feuille : l'invitation « + Ajouter un en-tête / un pied de page » =====
await hoverZone(page, 'top');
const ghostTop = await ghostOf(page, 'top');
check('zone d\'en-tête : au survol à la souris, « + Ajouter un en-tête » apparaît, en police des boutons, sans changer de taille (10,5 px, gras 600)', !!ghostTop && ghostTop.shown && /Ajouter un en-tête/.test(ghostTop.text) && ghostTop.ff === ref && ghostTop.fs === '10.5px' && ghostTop.fw === '600', ghostTop);
await sweepAs('zones');
await page.mouse.move(350, 330, { steps: 3 });
await page.mouse.wheel(0, 4000);
await page.waitForTimeout(500);
await hoverZone(page, 'bottom');
const ghostBottom = await ghostOf(page, 'bottom');
check('zone de pied : au survol à la souris, « + Ajouter un pied de page » apparaît, en police des boutons, sans changer de taille (10,5 px, gras 600)', !!ghostBottom && ghostBottom.shown && /Ajouter un pied de page/.test(ghostBottom.text) && ghostBottom.ff === ref && ghostBottom.fs === '10.5px' && ghostBottom.fw === '600', ghostBottom);
await sweepAs('zones');
await page.mouse.wheel(0, -4000);
await page.waitForTimeout(300);

// ===== 5) Un nouvel email, les sept onglets des Réglages, la galerie, le macro-modèle, Organiser, la liste des modèles, « Enregistrer sous… » =====
await realHover(page, '#v2-new-template-group #btn-new');
await realClick(page, '#v2-btn-new-email', 900);
await realClick(page, '#v2-btn-toggle-cci', 300);
await realClick(page, '#btn-toggle-pdf-filename', 300);
await sweepAs('email');
await realClick(page, '#v2-btn-settings', 400);
for (const tab of ['language', 'theme', 'triggerKey', 'pageMargins', 'access', 'credits', 'shortcuts']) {
  await realClick(page, `#settings-modal .settings-tab[data-settings-tab="${tab}"]`, 250);
  await sweepAs('Réglages');
}
await realClick(page, '#settings-close', 300);
await realHover(page, '#v2-new-template-group #btn-new');
await realClick(page, '#v2-btn-new-from-template', 900);
await sweepAs('fenêtres');
await realClick(page, '#tpl-gallery-close', 300);
await realHover(page, '#v2-new-template-group #btn-new');
await realClick(page, '#v2-btn-new-macro', 900);
await sweepAs('fenêtres');
await realClick(page, '#macro-editor-cancel', 300);
await realClick(page, '.tts-trigger', 400);
await sweepAs('fenêtres');
await realClick(page, '#btn-organize-templates', 500);
await sweepAs('fenêtres');
await realClick(page, '#template-organize-close', 300);
await page.keyboard.press('Escape');
await realHover(page, '#btn-save');
await realClick(page, '#v2-btn-save-as', 500);
await sweepAs('fenêtres');
await page.keyboard.press('Escape');
for (const [group, label] of [['menus', 'les menus des polices et des tailles'], ['barres', 'la barre d\'une variable de chaque type'], ['zones', 'les zones d\'en-tête et de pied survolées'], ['email', 'un nouvel email'], ['Réglages', 'les sept onglets des Réglages'], ['fenêtres', 'la galerie, le macro-modèle, la liste des modèles, Organiser et « Enregistrer sous… »']]) {
  const s = sweeps[group];
  check(`${label} : dans ${s.states} état${s.states > 1 ? 's' : ''} de la page (${Math.round(s.n / s.states)} boutons, champs et textes mesurés à chacun), tous ont la police des boutons`, s.n > 0 && s.outside.length === 0, { outside: s.outside.slice(0, 10), total: s.outside.length });
}

// ===== 6) Tout élément apparu pendant le parcours, fenêtres montées par script comprises =====
const seen = await page.evaluate(() => window.__uiFonts);
const seenOutside = seen.filter(f => f.ff !== ref).map(f => `${f.desc} : ${f.ff}`);
check(`pendant tout le parcours, ${seen.length} boutons, champs et textes sont apparus dans la page : tous ont la police des boutons`, seen.length >= 200 && seenOutside.length === 0, { total: seenOutside.length, first: seenOutside.slice(0, 10) });

// ===== 7) Le texte des en-têtes et pieds de page de la feuille : Roboto, comme le document =====
// « Oui, Roboto » d'Antoine du 12/10, à la carte « Passer le texte des en-têtes et pieds de page en Roboto ? ». Ce texte est du contenu du modèle : le PDF l'écrit en Roboto, la Lecture aussi ; la feuille le laissait
// dans l'Arial de `body` (le corps d'une zone est rattaché à la feuille, pas à `.tiptap`). Seconde page de test : interface en anglais, un en-tête et un pied remplis, assez de lignes pour une deuxième page (donc une bande de couture).
const second = await openWidget('light', { headerFooter: true, lang: 'en' });
const p2 = second.page;
const docFont = await p2.evaluate(() => getComputedStyle(document.querySelector('.tiptap')).fontFamily);
check('le document s\'écrit en Roboto : c\'est la référence du texte d\'un en-tête et d\'un pied', /^"?Roboto"?\s*,/.test(docFont), docFont);
// Chaque conteneur du texte d'en-tête ou de pied (zones de bord, bandes de couture) : sa police, sa taille, sa hauteur de ligne, et la police de chaque élément qui porte du texte à lui.
const hfTexts = (pg, selector) => pg.evaluate(sel => Array.from(document.querySelectorAll(sel)).map(el => {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const own = [el, ...el.querySelectorAll('*')].filter(e => Array.from(e.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())).map(e => getComputedStyle(e).fontFamily);
  return { text: (el.textContent || '').trim().slice(0, 30), ff: cs.fontFamily, fs: cs.fontSize, lh: cs.lineHeight, shown: el.getClientRects().length > 0 && r.width > 0 && r.height > 0, top: Math.round(r.top), bottom: Math.round(r.bottom), own };
}), selector);
const edgeBodies = await hfTexts(p2, '.v2-hf-zone-body');
check('en-tête et pied de la feuille (zones de bord) : le texte est en Roboto comme le document, à 14 px et 19,88 px de ligne', edgeBodies.length === 2 && edgeBodies.every(b => b.shown && b.own.length > 0 && b.ff === docFont && b.own.every(f => f === docFont) && b.fs === '14px' && b.lh === '19.88px'), edgeBodies);
// Survol à la souris de l'en-tête rempli : il prend son fond teinté et son crayon, le texte garde sa police.
{
  const z = await p2.evaluate(() => { const el = document.querySelector('.v2-hf-zone-filled.v2-page-edge-top'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (z) { await p2.mouse.move(z.x, z.y + 60, { steps: 3 }); await p2.mouse.move(z.x, z.y, { steps: 6 }); await p2.waitForTimeout(500); }
  const hov = await p2.evaluate(() => { const zone = document.querySelector('.v2-hf-zone-filled.v2-page-edge-top'); const body = zone && zone.querySelector('.v2-hf-zone-body'); const pencil = zone && zone.querySelector('.v2-hf-zone-pencil'); return zone ? { hover: zone.classList.contains('v2-hf-zone-hover') || zone.matches(':hover'), pencil: !!pencil && getComputedStyle(pencil).display !== 'none', ff: body && getComputedStyle(body).fontFamily } : null; });
  check('en-tête rempli : au survol à la souris (fond teinté, crayon), le texte garde la police du document', !!z && !!hov && hov.hover && hov.pencil && hov.ff === docFont, { z, hov });
}
// Bande de couture entre la page 1 et la page 2 : le pied de la page qui finit, puis l'en-tête de celle qui commence ; la molette l'amène dans le panneau.
for (let i = 0; i < 12; i++) {
  const gap = await p2.evaluate(() => { const d = document.querySelector('.v2-page-seam-divider'); return d ? d.getBoundingClientRect().top : null; });
  if (gap === null || (gap > 100 && gap < 300)) break;
  await p2.mouse.move(350, 250, { steps: 2 });
  await p2.mouse.wheel(0, gap > 300 ? Math.min(gap - 200, 600) : gap - 200);
  await p2.waitForTimeout(250);
}
await p2.waitForTimeout(300);
const bandFoot = await hfTexts(p2, '.v2-page-band-footer');
const bandHead = await hfTexts(p2, '.v2-page-band-header');
check('bande de couture, pied de la page 1 (visible dans le panneau) : le texte est en Roboto comme le document, à 14 px et 19,88 px de ligne', bandFoot.length >= 1 && bandFoot[0].shown && bandFoot[0].bottom > 0 && bandFoot[0].top < HEIGHT && /Pied de page/.test(bandFoot[0].text) && bandFoot[0].ff === docFont && bandFoot[0].own.every(f => f === docFont) && bandFoot[0].fs === '14px' && bandFoot[0].lh === '19.88px', bandFoot);
check('bande de couture, en-tête de la page 2 (visible dans le panneau) : le texte est en Roboto comme le document, à 14 px et 19,88 px de ligne', bandHead.length >= 1 && bandHead[0].shown && bandHead[0].bottom > 0 && bandHead[0].top < HEIGHT && /En-tête/.test(bandHead[0].text) && bandHead[0].ff === docFont && bandHead[0].own.every(f => f === docFont) && bandHead[0].fs === '14px' && bandHead[0].lh === '19.88px', bandHead);

// ===== 8) Les boutons de jour, de mois et d'année de la barre d'une date : D, M, Y en anglais =====
// « Oui, D M Y » d'Antoine du 12/10, à la carte « Traduire les boutons J, M, A de la date en anglais ? ». Ils s'écrivaient J, M, A quelle que soit la langue, alors que leur info-bulle était traduite. La barre est bâtie à
// la première ouverture : ici en anglais d'emblée, puis la langue change en cours de session (Réglages) sans recharger - les lettres et les info-bulles suivent à l'ouverture suivante.
const ref2 = await p2.evaluate(() => getComputedStyle(document.getElementById('btn-save')).fontFamily);
const dateParts = pg => pg.evaluate(() => {
  const bar = Array.from(document.querySelectorAll('.v2-varfmt-toolbar')).find(el => el.getClientRects().length > 0);
  if (!bar) return null;
  const r = bar.getBoundingClientRect();
  const parts = Array.from(bar.querySelectorAll('button[data-action^="date-part:"]')).map(b => { const cs = getComputedStyle(b); return { t: b.textContent.trim(), title: b.title, ff: cs.fontFamily, fs: cs.fontSize, h: Math.round(b.getBoundingClientRect().height * 10) / 10, active: b.classList.contains('is-active'), shown: b.getClientRects().length > 0 }; });
  return { box: { left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height) }, parts };
});
const openDateBar = async () => { await closeMenusOf(p2); await p2.evaluate(() => window.scrollTo(0, 0)); const sc = await p2.evaluate(() => { const c = document.getElementById('editor-container'); if (c) c.scrollTop = 0; return !!c; }); await p2.waitForTimeout(200); return sc && await clickBadge(p2, 2) && dateParts(p2); };
const letters = d => d ? d.parts.map(x => x.t).join(' ') : null;
const titles = d => d ? d.parts.map(x => x.title).join(' | ') : null;
let dbar = await openDateBar();
check('barre d\'une date, interface en anglais dès la première ouverture : les boutons s\'écrivent D, M, Y, avec leur info-bulle en anglais', !!dbar && letters(dbar) === 'D M Y' && titles(dbar) === 'Show/hide day | Show/hide month | Show/hide year', dbar);
check('barre d\'une date en anglais : elle tient dans le panneau (700 px), garde sa hauteur de 36 px, et D, M, Y ont la police des boutons, 26 px de haut', !!dbar && dbar.box.left >= 0 && dbar.box.right <= WIDTH && dbar.box.height === 36 && dbar.parts.every(x => x.shown && x.ff === ref2 && x.h === 26), dbar);
// Un vrai clic sur « D » éteint le jour, un second le rallume : les boutons marchent comme avant.
await realClick(p2, '.v2-varfmt-toolbar.visible button[data-action="date-part:day"]', 400);
const afterD = await dateParts(p2);
await realClick(p2, '.v2-varfmt-toolbar.visible button[data-action="date-part:day"]', 400);
const afterD2 = await dateParts(p2);
check('barre d\'une date en anglais : un clic sur « D » éteint le jour, un second le rallume', !!afterD && !!afterD2 && afterD.parts[0].active === false && afterD.parts[1].active && afterD.parts[2].active && afterD2.parts.every(x => x.active), { afterD, afterD2 });
await p2.evaluate(() => I18n.setLang('fr'));
dbar = await openDateBar();
check('on passe l\'interface en français sans recharger : à la réouverture de la barre, les boutons redeviennent J, M, A, avec leur info-bulle en français', !!dbar && letters(dbar) === 'J M A' && titles(dbar) === 'Afficher/masquer le jour | Afficher/masquer le mois | Afficher/masquer l’année', dbar);
await p2.evaluate(() => I18n.setLang('en'));
dbar = await openDateBar();
check('puis de nouveau en anglais sans recharger : D, M, Y', !!dbar && letters(dbar) === 'D M Y' && titles(dbar) === 'Show/hide day | Show/hide month | Show/hide year', dbar);
check('aucune erreur JavaScript pendant tout le parcours (les deux pages)', pageErrors.length === 0, pageErrors);

await second.context.close();
await context.close();
await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
