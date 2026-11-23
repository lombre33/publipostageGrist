#!/usr/bin/env node
// Le gabarit commun des fenêtres de réglage d'une bulle (demande d'Antoine du 23/11 : « pas super intuitif, beaucoup d'infos et d'éléments dans tous les sens » ; audit puis « tu peux
// traiter tout d'un coup ») : Boucle, Condition, Calcul, Liste, Autres colonnes, Mise en forme conditionnelle, à la VRAIE souris (page.mouse, Node/Playwright) et à la taille du panneau
// Grist d'Antoine (~700x400), en clair français puis en sombre anglais. La logique de chaque fenêtre est dans dev-tests/scenarios-var-*.js ; ici, ce que seuls de vrais gestes et de vraies
// mesures prouvent :
//  - le DÉFILEMENT : la Boucle (1,8 à 1,95 écran avant) et la Condition (1,9 écran avant) tiennent en moins d'un écran et demi, le Calcul ne défile plus ;
//  - l'introduction dit une phrase, le « i » (un vrai clic) montre la suite et un second la recache ;
//  - le résultat est COLLÉ au bas de la zone qui défile (sticky) : il se voit à l'ouverture sans défiler, et « Détail » (un vrai clic) montre la ligne de chiffres, cachée avant ;
//  - le repli « Plus d'options » / « Aide » est fermé à l'ouverture, s'ouvre d'office quand un réglage caché n'est pas celui d'origine, s'ouvre au clic et à la touche Entrée ;
//  - la Condition dit le lien d'une table UNE fois (pas sous chaque règle), met « Sinon afficher » sous les règles et le type de la colonne en info-bulle ;
//  - la Boucle dont la ligne est déjà répétée par une autre bulle n'offre qu'un texte (pas un interrupteur à un seul bouton) et ne renvoie pas vers un choix absent ;
//  - « Insérer » (Autres colonnes) ne dit plus « Insérer 0 colonne » ;
//  - tous les textes lus ont un contraste d'au moins 4,5:1 (les contrôles grisés exclus), en clair comme en sombre.
// Lancé par run-headless.mjs (groupe Node "bubbleWindowsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-bubble-windows-mouse.mjs
// BUBBLE_WINDOWS_SHOTS=<dossier> : enregistre aussi des captures aux moments clés (à relire à l'œil) ; sans elle, rien n'est écrit.
//  - l'interface en anglais.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.BUBBLE_WINDOWS_PORT || 8932);
const WIDTH = 700;
const HEIGHT = 400;
const NBSP = ' ';
const SHOTS = process.env.BUBBLE_WINDOWS_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });

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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-bubble-windows-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
  // La langue choisie est lue au démarrage (localStorage `pp_lang`) : la barre flottante d'une bulle est construite une fois, dans la langue du moment.
  if (lang) await page.addInitScript(code => { try { localStorage.setItem('pp_lang', code); } catch (e) { /* sans stockage, la page démarre en français */ } }, lang);
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

async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
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
const seen = box => box.found && box.inViewport && box.onTop;
// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, box) {
  await page.mouse.move(box.x - 6, box.y, { steps: 2 });
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
}
const clickSel = async (page, selector) => { const b = await hitTest(page, selector); if (b.found) await realClick(page, b); return b; };

const attr = (name, v) => ` ${name}="${JSON.stringify(v).replace(/"/g, '&quot;')}"`;
const badge = (table, column, extra = {}) => {
  let s = `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"`;
  if (extra.loop) s += attr('data-loop', extra.loop) + ` data-loop-repeat="${extra.loop.repeat}"`;
  if (extra.condition) s += attr('data-condition', extra.condition);
  if (extra.otherwise != null) s += ` data-otherwise="${extra.otherwise}"`;
  if (extra.before != null) s += ` data-before="${extra.before}"`;
  return s + '></span>';
};
const cell = (c, tag = 'td') => `<${tag}><p>${c}</p></${tag}>`;

async function seed(page) {
  await page.evaluate(async () => {
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setVariables('Programmes', { Nom: 'Text', Budget: 'Numeric' });
    stub.setVariables('Projets', {
      Programme: 'Ref:Programmes', Projet_Parent_le_cas_echeant_: 'Ref:Projets', Titre: 'Text', Porteur: 'Text', Budget: 'Numeric',
      Statut: 'Choice', Ville: 'Text', Echeance: 'Date', Heures: 'Numeric', Prix: 'Numeric', Tags: 'ChoiceList', manualSort: 'ManualSortPos',
    }, { Statut: ['En cours', 'Terminé', 'Suspendu'], Tags: ['Social', 'Numérique'] });
    stub.setRows('Programmes', [{ id: 1, Nom: 'Tiers lieux', Budget: 120000 }, { id: 2, Nom: 'Inclusion', Budget: 80000 }]);
    const rows = [];
    for (let i = 1; i <= 8; i++) rows.push({ id: i, Programme: i <= 5 ? 1 : 2, Projet_Parent_le_cas_echeant_: i > 3 && i <= 5 ? 1 : 0, Titre: 'Projet ' + i, Porteur: 'Équipe ' + i, Budget: 1000 * i, Statut: i % 2 ? 'En cours' : 'Terminé', Ville: 'Lyon', Echeance: 1700000000 + i * 86400, Heures: 10 * i, Prix: 50, Tags: ['L', 'Social'], manualSort: i });
    stub.setRows('Projets', rows);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('Projets');
    await GristAPI.saveLinkRule('Projets', { mode: 'match', colonneCible: 'Programme', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: 'Tiers lieux', Budget: 120000 }, 'Programmes');
  });
  await page.waitForTimeout(300);
}
async function setDoc(page, docHtml) {
  await page.evaluate(h => { Editor.setHTML(h); }, docHtml);
  await page.waitForTimeout(400);
}
// Sélectionne la bulle visée, puis clique VRAIMENT sur le bouton `action` de sa barre flottante.
async function openFrom(page, selector, action, windowId) {
  await page.mouse.move(400, 330);
  const pos = await page.evaluate(sel => { const dom = document.querySelector(sel); return dom ? EditorCore.getEditor().view.posAtDOM(dom, 0) : null; }, selector);
  if (pos == null) throw new Error('bulle introuvable : ' + selector);
  const BTN = act => '.v2-varfmt-toolbar.visible button[data-action="' + act + '"], .v2-image-toolbar.visible button[data-action="' + act + '"]';
  for (let i = 0; i < 10; i++) {
    await page.evaluate(p => { document.querySelector('.tiptap').focus(); EditorCore.getEditor().commands.setNodeSelection(p); }, pos);
    await page.waitForTimeout(250);
    if (await page.evaluate(sel => !!document.querySelector(sel), BTN(action))) break;
  }
  const btn = await hitTest(page, BTN(action));
  if (!btn.found) throw new Error('bouton introuvable : ' + action);
  await realClick(page, btn);
  await page.waitForFunction(id => { const m = document.getElementById(id); return !!m && getComputedStyle(m).display !== 'none' && m.getClientRects().length > 0; }, windowId, { timeout: 5000 });
  await page.waitForTimeout(500);
}
async function closeWindow(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}
// Ce que la fenêtre montre : le défilement de sa zone, le résultat collé, ses replis, ses « i ».
const measure = (page, id) => page.evaluate(windowId => {
  const m = document.getElementById(windowId);
  const body = m.querySelector('.pp-modal-body');
  const bodyBox = body.getBoundingClientRect();
  const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const result = body.querySelector(':scope > .var-result, :scope > .var-condition-debug');
  const rb = result ? result.getBoundingClientRect() : null;
  return {
    client: body.clientHeight, scroll: body.scrollHeight, screens: +(body.scrollHeight / body.clientHeight).toFixed(2),
    resultSticky: !!result && getComputedStyle(result).position === 'sticky',
    resultInView: !!rb && rb.bottom <= bodyBox.bottom + 1 && rb.top >= bodyBox.top,
    folds: Array.from(body.querySelectorAll('details.var-fold')).map(d => ({ open: d.open, title: d.querySelector('summary').textContent.trim() })),
    infos: body.querySelectorAll('.var-info').length,
    introMoreHidden: !!body.querySelector('.var-intro-more') && !vis(body.querySelector('.var-intro-more')),
    intro: (body.querySelector('.var-modal-intro') || {}).textContent || '',
  };
}, id);
// Contraste de tous les textes lus de la fenêtre (les contrôles grisés exclus : règle du groupe `contrast`).
async function contrast(page, windowId) {
  return page.evaluate(id => {
    const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); const p = m[1].split(',').map(x => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
    const bgOf = el => {
      const stack = [];
      for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.a > 0) stack.push(c); if (c.a === 1) break; }
      let bg = parse(getComputedStyle(document.body).backgroundColor);
      if (bg.a === 0) bg = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = stack.length - 1; i >= 0; i--) bg = over(stack[i], bg);
      return bg;
    };
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const body = document.querySelector('#' + id + ' .pp-modal-body');
    const bad = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (!t.textContent.trim()) continue;
      const el = t.parentElement;
      if (el.getClientRects().length === 0) continue;
      if (el.closest('button[disabled], [aria-disabled="true"], .is-disabled, [disabled]')) continue;
      const cs = getComputedStyle(el);
      const bg = bgOf(el);
      const fg = over(parse(cs.color), bg);
      const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (ratio < 4.5) bad.push({ text: t.textContent.trim().slice(0, 40), ratio: +ratio.toFixed(2) });
    }
    return bad;
  }, windowId);
}
const visibleSel = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; }, sel);
// Amène l'élément au milieu de la zone qui défile (le résultat collé couvre le bas), puis rend son centre pour un vrai clic.
async function reach(page, windowId, selector) {
  await page.evaluate(({ windowId, selector }) => { document.querySelector('#' + windowId + ' ' + selector).scrollIntoView({ block: 'center' }); }, { windowId, selector });
  await page.waitForTimeout(120);
  return hitTest(page, '#' + windowId + ' ' + selector);
}

const T = lang => (lang === 'en'
  ? { more: 'More options', help: 'Help', detail: 'Details', insert: 'Insert', style: 'Conditional formatting' }
  : { more: 'Plus d’options', help: 'Aide', detail: 'Détail', insert: 'Insérer', style: 'Mise en forme conditionnelle' });

async function run(scheme, lang) {
  const tag = `${scheme} ${lang}`;
  const t = T(lang);
  const { context, page } = await openWidget(scheme, lang);
  try {
    await seed(page);

    // ---- Boucle : le cas courant (la variable dans une phrase, lignes liées) ----
    await setDoc(page, `<p>Projets du programme : ${badge('Projets', 'Titre')}.</p>`);
    await openFrom(page, '.tiptap .var-badge', 'var-loop', 'var-loop-modal');
    let m = await measure(page, 'var-loop-modal');
    check(`${tag} · Boucle : au plus un écran et demi à défiler (avant : 1,8 à 1,95)`, m.screens <= 1.45, m);
    check(`${tag} · Boucle : une phrase d'introduction et un « i », la suite cachée`, m.infos === 1 && m.introMoreHidden, m);
    let info = await clickSel(page, '#var-loop-modal .var-modal-intro .var-info');
    await page.waitForTimeout(100);
    check(`${tag} · Boucle : un vrai clic sur « i » montre la suite`, seen(info) && await visibleSel(page, '#var-loop-modal .var-intro-more'), info);
    await clickSel(page, '#var-loop-modal .var-modal-intro .var-info');
    await page.waitForTimeout(100);
    check(`${tag} · Boucle : un second clic la recache`, !(await visibleSel(page, '#var-loop-modal .var-intro-more')));
    m = await measure(page, 'var-loop-modal');
    check(`${tag} · Boucle : le résultat est collé au bas, visible sans défiler`, m.resultSticky && m.resultInView, m);
    check(`${tag} · Boucle : « ${t.more} » est fermé à l'ouverture`, m.folds.length === 1 && !m.folds[0].open && m.folds[0].title.startsWith(t.more), m.folds);
    const detailBox = await hitTest(page, '#var-loop-modal .var-result-more');
    const statsHidden = !(await visibleSel(page, '#var-loop-modal .var-result .is-detail-line:not(:empty)'));
    check(`${tag} · Boucle : « ${t.detail} » est là, la ligne de chiffres cachée`, detailBox.found && statsHidden, detailBox);
    if (detailBox.found) { await realClick(page, detailBox); await page.waitForTimeout(150); }
    check(`${tag} · Boucle : un clic sur « ${t.detail} » montre la ligne de chiffres`, await visibleSel(page, '#var-loop-modal .var-result .is-detail-line'));
    const summary = await reach(page, 'var-loop-modal', 'details.var-fold > summary');
    check(`${tag} · Boucle : le repli est atteignable à la souris`, seen(summary), summary);
    if (summary.found) { await realClick(page, summary); await page.waitForTimeout(150); }
    const foldNow = await page.evaluate(() => { const d = document.querySelector('#var-loop-modal details.var-fold'); const so = document.querySelector('#var-loop-modal .var-loop-sort-row'); return { open: d.open, sortVisible: !!so && so.getClientRects().length > 0 && so.getBoundingClientRect().height > 10 }; });
    check(`${tag} · Boucle : un clic ouvre le repli, la rangée de tri y est`, foldNow.open && foldNow.sortVisible, foldNow);
    await shot(page, `boucle-${scheme}-${lang}`);
    check(`${tag} · Boucle : contraste ≥ 4,5:1`, (await contrast(page, 'var-loop-modal')).length === 0, await contrast(page, 'var-loop-modal'));
    await closeWindow(page);

    // Au clavier : le repli s'ouvre à Entrée.
    await openFrom(page, '.tiptap .var-badge', 'var-loop', 'var-loop-modal');
    await page.evaluate(() => document.querySelector('#var-loop-modal details.var-fold > summary').focus());
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    check(`${tag} · Boucle : Entrée sur « ${t.more} » ouvre le repli`, await page.evaluate(() => document.querySelector('#var-loop-modal details.var-fold').open));
    await closeWindow(page);

    // ---- Boucle : une boucle enregistrée par la fenêtre, sans toucher au repli, le garde fermé à la réouverture ----
    await setDoc(page, `<p>Projets : ${badge('Projets', 'Titre')}.</p>`);
    await openFrom(page, '.tiptap .var-badge', 'var-loop', 'var-loop-modal');
    const save = await hitTest(page, '#var-loop-modal .var-modal-primary');
    if (save.found) await realClick(page, save);
    await page.waitForFunction(() => { const w = document.getElementById('var-loop-modal'); return !w || getComputedStyle(w).display === 'none' || w.getClientRects().length === 0; }, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const saved = await page.evaluate(() => { const b = document.querySelector('.tiptap .var-badge'); return b ? b.getAttribute('data-loop') : null; });
    await openFrom(page, '.tiptap .var-badge', 'var-loop', 'var-loop-modal');
    m = await measure(page, 'var-loop-modal');
    check(`${tag} · Boucle : enregistrée sans toucher au repli, elle le garde fermé à la réouverture`, !!saved && m.folds.length === 1 && !m.folds[0].open, { saved, folds: m.folds });
    await closeWindow(page);

    // ---- Boucle : un tri posé est une valeur cachée, le repli s'ouvre d'office ----
    const sorted = { repeat: 'inline', table: 'Projets', sort: { column: 'Titre', direction: 'desc' }, empty: 'blank' };
    await setDoc(page, `<p>Projets : ${badge('Projets', 'Titre', { loop: sorted })}.</p>`);
    await openFrom(page, '.tiptap .var-badge', 'var-loop', 'var-loop-modal');
    m = await measure(page, 'var-loop-modal');
    check(`${tag} · Boucle : un tri déjà posé ouvre le repli d'office`, m.folds.length === 1 && m.folds[0].open, m.folds);
    await closeWindow(page);

    // ---- Boucle : le cas de la capture d'Antoine (une case dans une ligne déjà répétée) ----
    const outer = { repeat: 'row', table: 'Projets', empty: 'header' };
    const bubbles = ['Porteur', 'Budget', 'Statut', 'Ville', 'Heures', 'Prix', 'Tags', 'Echeance', 'Porteur', 'Budget', 'Statut', 'Ville', 'Heures'];
    await setDoc(page, `<table><tbody><tr>${cell('Titre', 'th')}${cell('Programme', 'th')}${bubbles.map(c => cell(c, 'th')).join('')}</tr><tr>${cell(badge('Projets', 'Titre', { loop: outer }))}${cell(badge('Projets', 'Programme'))}${bubbles.map(c => cell(badge('Projets', c))).join('')}</tr></tbody></table>`);
    await openFrom(page, '.tiptap tbody tr:nth-child(2) td:nth-child(2) .var-badge', 'var-loop', 'var-loop-modal');
    m = await measure(page, 'var-loop-modal');
    const note = await page.evaluate(() => document.querySelector('#var-loop-modal .var-loop-row-note').textContent);
    const single = await page.evaluate(() => document.querySelector('#var-loop-modal .var-loop-seg').classList.contains('is-single'));
    check(`${tag} · Boucle (capture) : tient en moins d'un écran et demi (avant : 1,95)`, m.screens <= 1.45, m);
    check(`${tag} · Boucle (capture) : un seul choix, écrit comme du texte`, single, single);
    check(`${tag} · Boucle (capture) : la note ne renvoie pas vers un choix absent`, !note.includes(lang === 'en' ? 'The table row' : 'La ligne du tableau') && note.length > 10, note);
    check(`${tag} · Boucle (capture) : le focus n'est pas sur du texte`, await page.evaluate(() => !document.activeElement.closest('.var-loop-seg')));
    await closeWindow(page);

    // ---- Condition : deux règles et un « Sinon » ----
    const cond = { mode: 'all', rules: [{ column: 'Projets.Statut', operator: '=', value: 'En cours' }, { column: 'Projets.Budget', operator: '>', value: '3000' }] };
    await setDoc(page, `<p>Projet : ${badge('Projets', 'Titre', { condition: cond, otherwise: 'à venir' })}</p>`);
    await openFrom(page, '.tiptap .var-badge', 'var-condition', 'var-condition-modal');
    m = await measure(page, 'var-condition-modal');
    check(`${tag} · Condition : au plus un écran et demi (avant : 1,9)`, m.screens <= 1.6, m);
    check(`${tag} · Condition : une phrase d'introduction et un « i »`, m.infos === 1 && m.introMoreHidden, m);
    const hints = await page.evaluate(() => Array.from(document.querySelectorAll('#var-condition-modal .var-condition-link-hint')).filter(h => h.getClientRects().length > 0 && h.textContent.trim()).length);
    check(`${tag} · Condition : le lien de la table est dit une fois, pas sous chaque règle`, hints === 1, hints);
    const types = await page.evaluate(() => Array.from(document.querySelectorAll('#var-condition-modal .macro-rule-column-type:not(.is-warning)')).filter(e => e.getClientRects().length > 0).length);
    check(`${tag} · Condition : le type de la colonne n'est plus écrit sous chaque règle`, types === 0, types);
    const order = await page.evaluate(() => {
      const kids = Array.from(document.querySelectorAll('#var-condition-modal .pp-modal-body > *')).filter(e => !e.hidden);
      const at = sel => kids.findIndex(e => e.matches(sel));
      return { rules: at('.var-condition-rules'), otherwise: at('.var-condition-otherwise-text-row'), fold: at('details.var-fold'), result: at('.var-result') };
    });
    check(`${tag} · Condition : « Sinon afficher » juste sous les règles, avant le repli et le résultat`, order.rules >= 0 && order.otherwise === order.rules + 1 && order.fold > order.otherwise && order.result === order.fold + 1, order);
    check(`${tag} · Condition : résultat collé, visible sans défiler ; repli « ${t.more} » fermé`, m.resultSticky && m.resultInView && m.folds.length === 1 && !m.folds[0].open, m);
    await shot(page, `condition-${scheme}-${lang}`);
    check(`${tag} · Condition : contraste ≥ 4,5:1`, (await contrast(page, 'var-condition-modal')).length === 0, await contrast(page, 'var-condition-modal'));
    await closeWindow(page);
    // Le repli de la Condition : « Avant » et « Après » s'y atteignent à la souris, ouvert d'un clic.
    await setDoc(page, `<p>Projet : ${badge('Projets', 'Titre')}</p>`);
    await openFrom(page, '.tiptap .var-badge', 'var-condition', 'var-condition-modal');
    const foldSummary = await reach(page, 'var-condition-modal', 'details.var-fold > summary');
    if (foldSummary.found) { await realClick(page, foldSummary); await page.waitForTimeout(150); }
    const beforeBox = await reach(page, 'var-condition-modal', '#var-condition-before');
    check(`${tag} · Condition : « Avant » est atteignable après un clic sur « ${t.more} »`, seen(beforeBox), beforeBox);
    if (beforeBox.found) { await realClick(page, beforeBox); await page.keyboard.type('('); }
    await page.waitForTimeout(150);
    check(`${tag} · Condition : la frappe réelle remplit « Avant »`, await page.evaluate(() => document.getElementById('var-condition-before').value) === '(');
    await closeWindow(page);
    // « Avant » rempli : le repli s'ouvre d'office.
    await setDoc(page, `<p>Projet : ${badge('Projets', 'Titre', { condition: cond, before: ', ' })}</p>`);
    await openFrom(page, '.tiptap .var-badge', 'var-condition', 'var-condition-modal');
    m = await measure(page, 'var-condition-modal');
    check(`${tag} · Condition : un « Avant » écrit ouvre le repli d'office`, m.folds.length === 1 && m.folds[0].open, m.folds);
    await closeWindow(page);

    // ---- Calcul ----
    await setDoc(page, `<p>Total : <span class="calc-badge" data-formula="#Projets.Heures * #Projets.Prix"></span></p>`);
    await openFrom(page, '.tiptap .calc-badge', 'calc-edit', 'pp-calc-modal');
    m = await measure(page, 'pp-calc-modal');
    check(`${tag} · Calcul : ne défile plus (avant : 270 px pour 267)`, m.scroll <= m.client + 1, m);
    check(`${tag} · Calcul : « ${t.help} » fermé, résultat collé`, m.folds.length === 1 && !m.folds[0].open && m.folds[0].title.startsWith(t.help) && m.resultSticky && m.resultInView, m);
    check(`${tag} · Calcul : contraste ≥ 4,5:1`, (await contrast(page, 'pp-calc-modal')).length === 0, await contrast(page, 'pp-calc-modal'));
    await closeWindow(page);

    // ---- Liste ----
    await setDoc(page, `<p>Étiquettes : ${badge('Projets', 'Tags')}</p>`);
    await openFrom(page, '.tiptap .var-badge', 'var-list', 'var-list-modal');
    m = await measure(page, 'var-list-modal');
    check(`${tag} · Liste : ne défile pas`, m.scroll <= m.client + 1, m);
    check(`${tag} · Liste : « Un document par valeur » a son « i », l'indication cachée`, !(await visibleSel(page, '#var-list-split-hint')) && await visibleSel(page, '.var-list-split .var-info'));
    const splitInfo = await clickSel(page, '.var-list-split .var-info');
    await page.waitForTimeout(100);
    check(`${tag} · Liste : un clic sur « i » montre l'indication`, seen(splitInfo) && await visibleSel(page, '#var-list-split-hint'), splitInfo);
    check(`${tag} · Liste : contraste ≥ 4,5:1`, (await contrast(page, 'var-list-modal')).length === 0, await contrast(page, 'var-list-modal'));
    await closeWindow(page);

    // ---- Autres colonnes ----
    await setDoc(page, `<p>Programme : ${badge('Projets', 'Programme')}</p>`);
    await openFrom(page, '.tiptap .var-badge', 'var-linked', 'var-linked-modal');
    const insert = await page.evaluate(() => { const b = document.querySelector('#var-linked-modal .var-modal-primary'); return { text: b.textContent, disabled: b.disabled }; });
    check(`${tag} · Autres colonnes : rien de coché, le bouton dit « ${t.insert} » (grisé)`, insert.text === t.insert && insert.disabled, insert);
    await closeWindow(page);

    // ---- Mise en forme conditionnelle ----
    await setDoc(page, `<p>Projet : ${badge('Projets', 'Budget')}</p>`);
    await openFrom(page, '.tiptap .var-badge', 'var-style', 'cond-style-modal');
    m = await measure(page, 'cond-style-modal');
    const grist = await page.evaluate(() => ({ note: !document.querySelector('#cond-style-modal .cond-style-grist-note').offsetParent, title: document.querySelector('#cond-style-modal .cond-style-grist').title }));
    check(`${tag} · Mise en forme : « Comme dans Grist » grisé tient sur une ligne, sa raison est l'info-bulle`, grist.note && grist.title.length > 10, grist);
    check(`${tag} · Mise en forme : « ${t.help} » fermé, résultat collé`, m.folds.length === 1 && !m.folds[0].open && m.folds[0].title.startsWith(t.help) && m.resultSticky && m.resultInView, m);
    check(`${tag} · Mise en forme : contraste ≥ 4,5:1`, (await contrast(page, 'cond-style-modal')).length === 0, await contrast(page, 'cond-style-modal'));
    await closeWindow(page);
  } catch (e) {
    check(`${tag} · pas d'exception`, false, String(e && e.message || e));
  } finally {
    await context.close();
  }
}

await run('light', 'fr');
await run('dark', 'en');

check('aucune erreur de page', pageErrors.length === 0, pageErrors);
await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
