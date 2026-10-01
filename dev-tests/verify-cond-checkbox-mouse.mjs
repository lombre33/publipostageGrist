#!/usr/bin/env node
// Case conditionnelle (demande d'Antoine du 2026-10-01 : « une case cochée ou décochée en fonction d'une condition basée sur une colonne », puce dédiée) à la VRAIE souris
// (page.mouse / page.keyboard, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en clair, en sombre et en anglais. dev-tests/scenarios-cond-checkbox.js vérifie la
// logique DANS la page (dispatchEvent) ; ici, ce que seule une vraie souris prouve :
//  - la liste « # », son onglet Chips et la ligne « Case conditionnelle » atteignables et au premier plan ; UN clic pose la puce, la liste se ferme et la barre de la case s'ouvre
//    (un clic sur la liste referme les barres flottantes à la fin du « mousedown » : la sélection est reposée juste après) ;
//  - la barre : le panneau des cases seul, trois boutons atteignables (pas de « vrai / faux »), « Autres attributs » et « Boucle » grisés AUX PIXELS ;
//  - la fenêtre de condition entière dans 700x400, colonne choisie à la souris, valeur tapée, aperçu « la case est cochée », Enregistrer : l'étiquette dit « Si Statut = Urgent » ;
//  - la puce tient sur sa ligne, lisible (contraste), et dans une colonne étroite elle coupe son milieu par « … » sans déborder ;
//  - un vrai clic sur un style de case le pose ; en Lecture la case se VOIT sur une vraie capture : bleue à coche blanche quand la condition est remplie, un contour gris sinon ;
//  - en anglais : l'entrée, l'étiquette, la barre et la fenêtre tiennent dans le panneau.
// Lancé par run-headless.mjs (groupe Node "condCheckboxMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-cond-checkbox-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.COND_CHECKBOX_MOUSE_PORT || 8923);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-cond-text-mouse.mjs.
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
] : [];
if (!OFFLINE) console.log('[verify-cond-checkbox-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

// COND_CHECKBOX_SHOTS=<dossier> : enregistre des captures aux moments clés, à relire à l'œil.
const SHOTS = process.env.COND_CHECKBOX_SHOTS || '';
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

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
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  return { context, page };
}

// Centre d'un élément, entièrement dans le panneau ?, et au premier plan (un contrôle recouvert par autre chose ne recevrait pas le clic) ?
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
// Une ligne de liste retrouvée par son texte exact (la liste « # » n'a pas d'identifiant par ligne).
async function hitByText(page, selector, text) {
  return page.evaluate(({ selector, text }) => {
    const el = Array.from(document.querySelectorAll(selector)).find(e => e.textContent.trim() === text);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { found: true, x, y, inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === el || el.contains(top)) };
  }, { selector, text });
}
// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, box) {
  await page.mouse.move(box.x - 6, box.y, { steps: 2 });
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
}
const clickSel = async (page, selector) => { const b = await hitTest(page, selector); if (b.found) await realClick(page, b); return b; };

// Couleurs d'une vraie capture : combien de pixels bleus (accent), blancs, sombres et gris dans le rectangle.
async function pixelsOf(page, box) {
  const png = await page.screenshot({ clip: { x: Math.max(0, Math.floor(box.left) - 1), y: Math.max(0, Math.floor(box.top) - 1), width: Math.ceil(box.w) + 2, height: Math.ceil(box.h) + 2 } });
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const out = { blue: 0, white: 0, dark: 0, grey: 0, total: d.length / 4 };
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (Math.abs(r - 47) < 50 && Math.abs(g - 111) < 50 && Math.abs(b - 237) < 50) out.blue++;
      else if (r > 235 && g > 235 && b > 235) out.white++;
      else if (r < 100 && g < 100 && b < 100) out.dark++;
      else if (r > 90 && r < 160 && Math.abs(r - g) < 25 && Math.abs(g - b) < 40) out.grey++;
    }
    return out;
  }, png.toString('base64'));
}

// « Encre » d'un contrôle sur une VRAIE capture : écart moyen entre ses pixels et celui de son coin (le fond) - un contrôle grisé y est nettement plus faible.
async function ink(page, selector) {
  const b = await hitTest(page, selector);
  if (!b.found || !b.inViewport) return null;
  const png = await page.screenshot({ clip: { x: Math.ceil(b.left), y: Math.ceil(b.top), width: Math.floor(b.w) - 1, height: Math.floor(b.h) - 1 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]);
    return sum / (d.length / 4);
  }, png.toString('base64'));
}

// Choisit une colonne dans le champ d'une règle comme une personne : clic sur le champ visible (liste avec recherche, js/search-select.js), frappe du nom, clic sur la ligne au nom exact.
async function pickColumn(page, scope, name) {
  const field = await hitTest(page, scope + ' .macro-rule-column-wrap .ss-trigger');
  await realClick(page, field);
  await page.waitForTimeout(120);
  await page.keyboard.type(name);
  await page.waitForTimeout(80);
  const row = await page.evaluate(({ scope, name }) => {
    const found = Array.from(document.querySelectorAll(scope + ' .ss-panel:not([hidden]) .ss-option')).find(r => r.querySelector('.ss-name').textContent === name);
    if (!found) return null;
    const r = found.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { scope, name });
  if (row) await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(150);
  return !!row;
}

const TABLE = 'CmDossiers';
const RECORD_URGENT = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 };
const RECORD_NORMAL = { id: 2, Titre: 'Dossier B', Statut: 'Normal', Montant: 50 };
const BAR = '.v2-varfmt-toolbar.visible';
const STYLE_BUTTON = style => `${BAR} [data-var-panel="bool"] button[data-action="bool-style:${style}"]`;
const STYLES = ['accentStrike', 'classic', 'accentPlain'];

const barState = page => page.evaluate(() => {
  const bar = document.querySelector('.v2-varfmt-toolbar');
  const panels = ['bool', 'number', 'date'].map(k => !bar.querySelector(`[data-var-panel="${k}"]`).hidden);
  const buttons = Array.from(bar.querySelectorAll('[data-var-panel="bool"] button')).map(b => ({ style: b.getAttribute('data-action').slice(11), hidden: b.hidden, pressed: b.getAttribute('aria-pressed'), title: b.title }));
  const r = bar.getBoundingClientRect();
  return { visible: bar.classList.contains('visible'), panels, buttons, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
});
const chipState = page => page.evaluate(() => {
  const chips = Array.from(document.querySelectorAll('.tiptap .conditional-checkbox'));
  const selected = EditorCore.getEditor().state.selection.node;
  const first = chips[0];
  if (!first) return { count: 0, selected: selected ? selected.type.name : null };
  const label = Array.from(first.querySelectorAll('.conditional-checkbox-head, .conditional-checkbox-tail')).map(e => e.textContent).join('');
  const box = first.querySelector('.resolved-checkbox');
  const r = first.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const p = first.closest('p, td, th, li') || first.parentElement;
  const pr = p.getBoundingClientRect();
  // La ligne ne grandit pas à cause de la puce : le paragraphe qui la porte a la hauteur d'un paragraphe de texte seul (à 2 px près).
  const plain = Array.from(document.querySelectorAll('.tiptap > p')).find(x => !x.querySelector('.conditional-checkbox') && x.textContent.trim());
  const lineGrowth = plain && p.tagName === 'P' ? pr.height - plain.getBoundingClientRect().height : null;
  const style = getComputedStyle(first);
  return {
    count: chips.length, selected: selected ? selected.type.name : null, label, dashed: style.borderStyle, color: style.color, background: style.backgroundColor,
    boxStyle: box.getAttribute('data-checkbox-style'), boxChecked: box.getAttribute('data-checked'), boxSquare: Math.abs(b.width - b.height) < 0.6 && b.width >= 9,
    chip: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, h: r.height },
    insideLine: r.top >= pr.top - 1 && r.bottom <= pr.bottom + 1, lineGrowth, inViewport: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5,
    condition: EditorCore.getEditor().getHTML().indexOf('data-condition') !== -1,
  };
});
const contrastOf = (page, color, background) => page.evaluate(({ color, background }) => {
  const lum = css => { const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [a, b] = [lum(color), lum(background)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}, { color, background });

// La ligne de boutons de la fenêtre de condition : où est chaque bouton visible, est-il au premier plan.
const footerOf = page => page.evaluate(() => {
  const box = document.querySelector('#var-condition-modal .var-modal-content').getBoundingClientRect();
  const buttons = Array.from(document.querySelectorAll('#var-condition-modal .var-modal-actions button')).filter(b => !b.hidden).map(b => {
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { text: b.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, onTop: !!top && (top === b || b.contains(top)) };
  });
  return { box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, buttons };
});
const inside = f => f.buttons.every(b => b.left >= f.box.left && b.right <= f.box.right && b.top >= f.box.top && b.bottom <= f.box.bottom);

async function seedPage(page, html) {
  await page.evaluate(async ({ record, table, html }) => {
    const stub = window.__gristStub;
    stub.setVariables(table, { Titre: 'Text', Statut: 'Text', Montant: 'Numeric' });
    stub.setRows(table, [
      { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 },
      { id: 2, Titre: 'Dossier B', Statut: 'Normal', Montant: 50 },
    ]);
    await GristAPI.refreshSchema();
    stub.fireRecord(record, table);
    Editor.setHTML(html);
  }, { record: RECORD_URGENT, table: TABLE, html });
  await page.waitForTimeout(400);
}

// Place la puce comme une personne : un vrai clic dans le dernier paragraphe (vide), le bouton « Insérer une variable », l'onglet Chips, la ligne « Case conditionnelle ».
async function placeChip(page, label, entryName) {
  const lastParagraph = await page.evaluate(() => {
    const ps = Array.from(document.querySelectorAll('.tiptap > p'));
    const r = ps[ps.length - 1].getBoundingClientRect();
    return { x: r.left + 40, y: r.top + r.height / 2 };
  });
  await realClick(page, lastParagraph);
  const insertButton = await hitTest(page, '#v2-btn-insert-variable');
  check(`${label} - le bouton « Insérer une variable » est dans le panneau et au premier plan`, insertButton.found && insertButton.inViewport && insertButton.onTop, insertButton);
  await realClick(page, insertButton);
  await page.waitForTimeout(250);
  const panel = await hitTest(page, '#autocomplete-box');
  check(`${label} - la liste « # » s'ouvre entièrement dans le panneau`, panel.found && panel.inViewport, panel);
  const chipsTab = await hitTest(page, '#autocomplete-box .ac-tab[data-tab="chips"]');
  check(`${label} - l'onglet Chips est atteignable à la vraie souris`, chipsTab.found && chipsTab.inViewport && chipsTab.onTop, chipsTab);
  await realClick(page, chipsTab);
  await page.waitForTimeout(150);
  const entry = await hitByText(page, '#autocomplete-box .ac-item', entryName);
  check(`${label} - la ligne « ${entryName} » est dans l'onglet Chips, visible et au premier plan`, entry.found && entry.inViewport && entry.onTop, entry);
  const items = await page.evaluate(() => Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).map(i => i.textContent.trim()));
  // Sept lignes depuis la ligne « Calcul » (js/variable-calc.js), ajoutée après elle : la case conditionnelle est la sixième.
  check(`${label} - elle vient après « Texte conditionnel » : sept lignes, « Calcul » en dernier`, items.length === 7 && items[5] === entryName && /^(Calcul|Calculation)$/.test(items[6]), items);
  if (entry.found) await realClick(page, entry);
  await page.waitForTimeout(350);
  return entry;
}

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Case conditionnelle à la vraie souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);
  await seedPage(page, '<p>Contrat signé</p><p>Pièce jointe fournie</p><p></p>');

  // 1) La pose : un clic sur la ligne, la puce remplace « # », la liste se ferme, la barre de la case s'ouvre.
  await placeChip(page, label, 'Case conditionnelle');
  const listClosed = !(await hitTest(page, '#autocomplete-box')).inViewport;
  let chip = await chipState(page);
  check(`${label} - un clic sur la ligne : une puce remplace « # », la liste se ferme, la puce est sélectionnée`, chip.count === 1 && listClosed && chip.selected === 'conditionalCheckbox', { chip, listClosed });
  const html = await page.evaluate(() => EditorCore.getEditor().getHTML());
  check(`${label} - le HTML ne garde pas le « # » et la puce n'a ni condition ni réglage de style autre que « accent, texte normal »`, html.indexOf('#') === -1 && /<span class="conditional-checkbox"[^>]* data-checkbox-style="accentPlain"/.test(html) && html.indexOf('data-condition') === -1, html);
  check(`${label} - la puce dit « sans condition », tient dans le panneau et dans sa ligne sans l'agrandir, avec sa case décochée carrée`, chip.label === 'sans condition' && chip.inViewport && chip.insideLine && chip.lineGrowth != null && chip.lineGrowth <= 2 && chip.boxChecked === 'false' && chip.boxSquare, chip);
  await shot(page, `${theme}-1-puce-posee`);

  const bar = await barState(page);
  check(`${label} - sa barre s'ouvre (un seul clic) : le panneau des cases seul, entière dans le panneau`, bar.visible && JSON.stringify(bar.panels) === JSON.stringify([true, false, false]) && bar.left >= 0 && bar.right <= WIDTH + 0.5 && bar.top >= 0, bar);
  const reach = {};
  for (const style of STYLES) reach[style] = await hitTest(page, STYLE_BUTTON(style));
  check(`${label} - ses trois styles sont atteignables (au moins 24 px), « accent, texte normal » est enfoncé, il n'y a pas de « vrai / faux »`,
    STYLES.every(s => reach[s].found && reach[s].inViewport && reach[s].onTop && reach[s].w >= 24 && reach[s].h >= 24)
      && JSON.stringify(bar.buttons.map(b => [b.style, b.hidden, b.pressed])) === JSON.stringify([['accentStrike', false, 'false'], ['classic', false, 'false'], ['accentPlain', false, 'true'], ['text', true, 'false']]), { reach, buttons: bar.buttons });
  const barButtons = { condition: await hitTest(page, `${BAR} button[data-action="var-condition"]`), linked: await hitTest(page, `${BAR} button[data-action="var-linked"]`), loop: await hitTest(page, `${BAR} button[data-action="var-loop"]`) };
  check(`${label} - le bouton de la condition est atteignable`, barButtons.condition.found && barButtons.condition.inViewport && barButtons.condition.onTop, barButtons.condition);
  // Les deux icônes sans objet sont GRISÉES aux pixels (pas retirées) : leur encre tombe sous 60 % de celle de la condition, active.
  const inkOf = { condition: await ink(page, `${BAR} button[data-action="var-condition"]`), linked: await ink(page, `${BAR} button[data-action="var-linked"]`), loop: await ink(page, `${BAR} button[data-action="var-loop"]`) };
  check(`${label} - « Autres attributs » et « Boucle » sont grisés sur une case : moins de 60 % de l'encre de l'icône de la condition`, inkOf.condition != null && inkOf.linked != null && inkOf.loop != null && inkOf.linked < inkOf.condition * 0.6 && inkOf.loop < inkOf.condition * 0.6, inkOf);
  await realClick(page, barButtons.linked);
  await realClick(page, barButtons.loop);
  await page.waitForTimeout(250);
  const greyClick = await page.evaluate(() => ({ modals: Array.from(document.querySelectorAll('.modal-overlay, .var-modal-overlay')).filter(m => getComputedStyle(m).display !== 'none' && m.getClientRects().length).length, barOpen: !!document.querySelector('.v2-varfmt-toolbar.visible') }));
  check(`${label} - un vrai clic sur une icône grisée n'ouvre rien et la barre reste`, greyClick.modals === 0 && greyClick.barOpen, greyClick);

  // 2) La lisibilité de la puce : texte #12406b sur #eaf2ff, la page reste blanche dans les deux thèmes.
  const ratio = await contrastOf(page, chip.color, chip.background);
  check(`${label} - le texte de la puce est lisible (contraste au moins 4,5:1)`, ratio >= 4.5, { ratio, color: chip.color, background: chip.background });

  // 3) La fenêtre de condition : entière dans 700x400, colonne choisie à la souris, valeur tapée, aperçu, Enregistrer.
  await realClick(page, await hitTest(page, `${BAR} button[data-action="var-condition"]`));
  await page.waitForTimeout(250);
  await shot(page, `${theme}-2-fenetre-vide`);
  const modalBox = await hitTest(page, '#var-condition-modal .var-modal-content');
  check(`${label} - fenêtre de condition ouverte sur la case, entièrement dans le panneau`, modalBox.found && modalBox.inViewport, modalBox);
  const texts = await page.evaluate(() => ({ title: document.getElementById('var-condition-title').textContent, intro: document.querySelector('#var-condition-modal .var-modal-intro').textContent, barOpen: !!document.querySelector('.v2-varfmt-toolbar.visible') }));
  check(`${label} - son titre est « Condition de la case », son introduction parle de la case, la barre se range derrière`, texts.title === 'Condition de la case' && /^Cette case est cochée en lecture/.test(texts.intro) && !texts.barOpen, texts);
  check(`${label} - colonne Statut choisie à la vraie souris dans la liste avec recherche`, await pickColumn(page, '#var-condition-modal', 'Statut'));
  await realClick(page, await hitTest(page, '#var-condition-modal .macro-rule-value'));
  await page.keyboard.type('Urgent');
  await page.waitForTimeout(700);
  const debugText = await page.evaluate(() => Array.from(document.querySelectorAll('#var-condition-modal .var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent));
  check(`${label} - l'aperçu dit que la case est cochée pour la ligne sélectionnée`, debugText.length > 0 && /condition remplie, la case est cochée/.test(debugText[0]), debugText);
  await shot(page, `${theme}-3-fenetre-remplie`);
  const footer = await footerOf(page);
  check(`${label} - « Annuler » et « Enregistrer » tiennent dans la fenêtre, au premier plan`, footer.buttons.length === 2 && inside(footer) && footer.buttons.every(b => b.onTop), footer);
  const saveBtn = await hitTest(page, '#var-condition-modal .var-modal-primary');
  await realClick(page, saveBtn);
  await page.waitForTimeout(400);
  chip = await chipState(page);
  const barAfter = await barState(page);
  check(`${label} - Enregistrer : la fenêtre se ferme, la puce dit « Si Statut = Urgent », son contour passe en pointillés, elle reste sélectionnée et sa barre revient`,
    chip.label === 'Si Statut = Urgent' && chip.dashed === 'dashed' && chip.condition && chip.selected === 'conditionalCheckbox' && barAfter.visible && chip.inViewport, { chip, bar: barAfter.visible });
  await shot(page, `${theme}-4-puce-avec-condition`);

  // 4) Un vrai clic sur un style : la case de la puce le prend, le bouton enfoncé suit, la condition reste.
  await clickSel(page, STYLE_BUTTON('classic'));
  chip = await chipState(page);
  const afterClassic = await barState(page);
  check(`${label} - vrai clic sur « classique » : la case de la puce est classique, le bouton enfoncé suit, la barre reste ouverte, la condition est gardée`,
    chip.boxStyle === 'classic' && chip.label === 'Si Statut = Urgent' && afterClassic.visible && JSON.stringify(afterClassic.buttons.map(b => b.pressed)) === JSON.stringify(['false', 'true', 'false', 'false']), { chip, buttons: afterClassic.buttons.map(b => b.pressed) });
  await clickSel(page, STYLE_BUTTON('accentPlain'));
  chip = await chipState(page);
  check(`${label} - vrai clic sur « accent, texte normal » : la case revient à l'accent`, chip.boxStyle === 'accentPlain', chip);

  // 5) La Lecture : la ligne « Urgent » remplit la condition (case bleue à coche blanche), la ligne « Normal » non (contour gris).
  await realClick(page, await hitTest(page, '#btn-mode-read'));
  await page.waitForTimeout(700);
  const reading = () => page.evaluate(() => {
    const reader = document.getElementById('reader-container');
    const boxes = Array.from(reader.querySelectorAll('.resolved-checkbox'));
    const last = boxes[boxes.length - 1];
    if (last) last.scrollIntoView({ block: 'center' });
    const r = last ? last.getBoundingClientRect() : null;
    return {
      shown: reader.style.display === 'block', barOpen: !!document.querySelector('.v2-varfmt-toolbar.visible'), frames: reader.querySelectorAll('.conditional-checkbox').length,
      boxes: boxes.map(b => [b.getAttribute('data-checked'), b.getAttribute('data-checkbox-style'), b.getAttribute('aria-label')]),
      rect: r && { left: r.left, top: r.top, w: r.width, h: r.height, inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 },
      overflowX: reader.scrollWidth - reader.clientWidth,
    };
  });
  let read = await reading();
  await page.waitForTimeout(150);
  read = await reading();
  check(`${label} - Lecture, ligne « Urgent » : la barre se ferme, la puce est remplacée par une case cochée (« Coché »), la feuille ne déborde pas`,
    read.shown && !read.barOpen && read.frames === 0 && JSON.stringify(read.boxes) === JSON.stringify([['true', 'accentPlain', 'Coché']]) && read.overflowX <= 1 && !!read.rect && read.rect.inViewport && Math.abs(read.rect.w - read.rect.h) < 0.6, read);
  await shot(page, `${theme}-5-lecture-urgent`);
  if (read.rect) {
    const pixels = await pixelsOf(page, { left: read.rect.left, top: read.rect.top, w: read.rect.w, h: read.rect.h });
    check(`${label} - sur la capture, la case cochée est un carré bleu à coche blanche`, pixels.blue >= 0.45 * pixels.total && pixels.white >= 5 && pixels.dark === 0, pixels);
  }
  await realClick(page, await hitTest(page, '#btn-mode-edit'));
  await page.waitForTimeout(400);
  await page.evaluate(record => window.__gristStub.fireRecord(record, 'CmDossiers'), RECORD_NORMAL);
  await page.waitForTimeout(300);
  await realClick(page, await hitTest(page, '#btn-mode-read'));
  await page.waitForTimeout(700);
  read = await reading();
  await page.waitForTimeout(150);
  read = await reading();
  check(`${label} - Lecture, ligne « Normal » : la case est décochée (« Décoché »)`, read.shown && JSON.stringify(read.boxes) === JSON.stringify([['false', 'accentPlain', 'Décoché']]), read);
  await shot(page, `${theme}-6-lecture-normal`);
  if (read.rect) {
    const pixels = await pixelsOf(page, { left: read.rect.left, top: read.rect.top, w: read.rect.w, h: read.rect.h });
    check(`${label} - sur la capture, la case décochée est un contour gris sur fond blanc, sans bleu`, pixels.blue === 0 && pixels.grey + pixels.dark >= 18 && pixels.white >= 0.4 * pixels.total, pixels);
  }
  await realClick(page, await hitTest(page, '#btn-mode-edit'));
  await page.waitForTimeout(400);

  // 6) Une colonne étroite : une puce à la condition très longue coupe son milieu par « … », ne déborde pas de sa case et ne passe pas à la ligne.
  const longCondition = JSON.stringify({ mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }, { column: 'Titre', operator: '=', value: 'Un titre vraiment très long' }, { column: 'Montant', operator: '>', value: '1000000' }] }).replace(/"/g, '&quot;');
  await page.evaluate(html => Editor.setHTML(html), `<table><tbody><tr><th colwidth="90"><p>Étroite</p></th><th colwidth="300"><p>Large</p></th></tr><tr><td colwidth="90"><p><span class="conditional-checkbox" data-condition="${longCondition}" data-checkbox-style="accentPlain">☐</span></p></td><td colwidth="300"><p>Texte</p></td></tr></tbody></table><p></p>`);
  await page.waitForTimeout(400);
  const narrow = await page.evaluate(() => {
    const chipEl = document.querySelector('.tiptap td .conditional-checkbox');
    const td = chipEl.closest('td');
    const head = chipEl.querySelector('.conditional-checkbox-head');
    const r = chipEl.getBoundingClientRect(); const c = td.getBoundingClientRect();
    return {
      chipRight: r.right, cellRight: c.right, chipLeft: r.left, cellLeft: c.left, height: r.height, lineHeight: parseFloat(getComputedStyle(td.querySelector('p')).lineHeight) || 0,
      ellipsis: getComputedStyle(head).textOverflow === 'ellipsis' && head.scrollWidth > head.clientWidth, whiteSpace: getComputedStyle(head).whiteSpace,
      label: Array.from(chipEl.querySelectorAll('.conditional-checkbox-head, .conditional-checkbox-tail')).map(e => e.textContent).join(''),
    };
  });
  await shot(page, `${theme}-7-colonne-etroite`);
  check(`${label} - colonne étroite : la puce ne déborde pas de sa case, tient sur une ligne et coupe le milieu de son libellé par « … »`,
    narrow.chipRight <= narrow.cellRight + 0.5 && narrow.chipLeft >= narrow.cellLeft - 0.5 && narrow.height < 34 && narrow.ellipsis && narrow.whiteSpace === 'nowrap', narrow);

  await context.close();
}

async function runEnglish() {
  console.log(`\n=== Case conditionnelle en anglais, ${WIDTH}x${HEIGHT} ===`);
  const { context, page } = await openWidget('light');
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  await seedPage(page, '<p>Signed contract</p><p></p>');
  await placeChip(page, 'anglais', 'Conditional checkbox');
  let chip = await chipState(page);
  check('anglais - la puce dit « no condition » et tient dans le panneau', chip.count === 1 && chip.label === 'no condition' && chip.inViewport && chip.insideLine, chip);
  const bar = await barState(page);
  const titles = await page.evaluate(() => ({ condition: document.querySelector('.v2-varfmt-toolbar button[data-action="var-condition"]').title, linked: document.querySelector('.v2-varfmt-toolbar button[data-action="var-linked"]').title }));
  check('anglais - la barre tient dans le panneau, ses infobulles sont en anglais', bar.visible && bar.left >= 0 && bar.right <= WIDTH + 0.5 && titles.condition === 'Checkbox condition: checked if…' && /^Available for a variable/.test(titles.linked), { bar: [bar.left, bar.right], titles });
  await realClick(page, await hitTest(page, `${BAR} button[data-action="var-condition"]`));
  await page.waitForTimeout(250);
  const modalBox = await hitTest(page, '#var-condition-modal .var-modal-content');
  const texts = await page.evaluate(() => ({ title: document.getElementById('var-condition-title').textContent, intro: document.querySelector('#var-condition-modal .var-modal-intro').textContent }));
  check('anglais - la fenêtre de condition tient dans le panneau : « Checkbox condition », introduction en anglais', modalBox.found && modalBox.inViewport && texts.title === 'Checkbox condition' && /^This checkbox is checked in read mode/.test(texts.intro), { modalBox: modalBox.inViewport, texts });
  await realClick(page, await hitTest(page, '#var-condition-modal .var-condition-add'));
  await page.waitForTimeout(150);
  const mode = await page.evaluate(() => document.querySelector('#var-condition-modal .var-condition-mode span').textContent);
  const footer = await footerOf(page);
  check('anglais - « Check if » devant la combinaison de plusieurs règles, les boutons tiennent dans la fenêtre', mode === 'Check if' && footer.buttons.length === 2 && inside(footer) && footer.buttons.every(b => b.onTop), { mode, footer });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('anglais - Échap ferme la fenêtre', !(await page.evaluate(() => VariableCondition.isOpen())));
  await page.evaluate(() => I18n.setLang('fr'));
  await context.close();
}

await runTheme('light');
await runTheme('dark');
await runEnglish();

check('aucune erreur JavaScript ni boîte native pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
