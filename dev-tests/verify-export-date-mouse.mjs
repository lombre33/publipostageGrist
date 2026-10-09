#!/usr/bin/env node
// Date du dernier export PDF (js/export-date.js, Réglages > Vue > « Date du dernier export PDF », css/row-template.css) à la VRAIE souris (page.mouse, Node/Playwright) et à la
// taille du panneau Grist d'Antoine (~700x400), en clair et en sombre, en français et en anglais - demande du 09/10 (« une option où tu choisis une colonne qui gardera la date du
// dernier export PDF »).
// dev-tests/scenarios-export-date.js, scenarios-pdf-batch.js et scenarios-sheet-assembly.js vérifient la liste, l'option, ce qui s'écrit et les cas d'échec DANS la page ; ici, ce
// qui se mesure aux PIXELS et au vrai geste : la section atteignable à la molette dans le panneau, sans défilement horizontal ; la liste avec recherche (« Aucune » en tête, les
// colonnes Date, Date et heure et Texte avec leur type en indice, ni la colonne Numérique ni la colonne à formule) ; choisir une colonne au vrai clic (la phrase qui dit ce qui
// s'écrira, le rappel « Enregistrer » qui apparaît) ; un VRAI export PDF au vrai clic (le téléchargement que reçoit Chromium) qui date la ligne courante, elle seule ; la colonne
// supprimée dans Grist (la section le dit en rouge, l'export produit le PDF quand même et le coin d'état commence, en rouge, par « Date non écrite » ; rien n'est écrit) ; un compte
// Lecteur (la section reste là, grisée et inerte, et l'export n'écrit rien, sans erreur).
// Lancé par run-headless.mjs (groupe Node "exportDateMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-export-date-mouse.mjs
// (EXPORT_DATE_SHOTS=<dossier> y range une capture par étape, à regarder - aucune vérification n'en dépend).
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.EXPORT_DATE_MOUSE_PORT || 8937);
const SHOTS = process.env.EXPORT_DATE_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-save-reminder-mouse.mjs.
async function regenerateHarness() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const stubbed = html.replace(
    '<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>',
    '<script src="dev-tests/grist-stub.js"></script>'
  );
  await writeFile(join(ROOT, '_test-harness.html'), stubbed);
}
await regenerateHarness();
if (SHOTS) await mkdir(SHOTS, { recursive: true });

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
if (!OFFLINE) console.log('[verify-export-date-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Les colonnes de la table : Nom (Texte), Dernier (Date et heure), Jour (Date), Quand (Texte), Montant (Numérique, jamais proposée), Calcul (à formule, jamais proposée).
const COLUMNS = { Nom: 'Text', Dernier: 'DateTime:Europe/Paris', Jour: 'Date', Quand: 'Text', Montant: 'Numeric', Calcul: 'DateTime:Europe/Paris' };
const NAMES = ['Dupont', 'Martin', 'Petit'];

async function openWidget(colorScheme, lang) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme, acceptDownloads: true });
  const page = await context.newPage();
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
  // Semé avant le démarrage : un modèle « Contrat » enregistré et ouvert par défaut, la table Clients (trois lignes, six colonnes dont une à formule), aucune option du widget,
  // le faux Grist qui ne rappelle que les vrais changements comme le vrai.
  await page.addInitScript(({ language, columns, names }) => {
    try { localStorage.setItem('pp_lang', language); } catch (e) { /* stockage indisponible */ }
    window.__preSeedGristStub = (stub) => {
      stub.state.echoOnlyChanges = true;
      stub.setVariables('Clients', columns);
      stub.setFormulaColumn('Clients', 'Calcul', '$Dernier');
      stub.setRows('Clients', names.map((Nom, i) => ({ id: i + 1, Nom, Montant: (i + 1) * 10 })));
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      m.Contenu.push('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>, voici le contrat de location.</p>');
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  }, { language: lang, columns: COLUMNS, names: NAMES });
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  await page.waitForTimeout(600);
  return { context, page };
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

const luminance = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const contrast = (a, b) => { const l1 = luminance(a), l2 = luminance(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const parseRgb = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); const p = m ? m[1].split(/[ ,/]+/).map(Number) : [0, 0, 0]; return { r: p[0], g: p[1], b: p[2] }; };

async function hitTest(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
      shown: el.getClientRects().length > 0,
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}
// Molette réelle sur la fenêtre jusqu'à ce que l'élément soit entièrement dans le panneau ET au premier plan.
async function reveal(page, selector) {
  for (let i = 0; i < 12; i++) {
    const box = await hitTest(page, selector);
    if (box.found && box.inViewport && box.onTop) return box;
    const over = await hitTest(page, '#settings-modal .settings-body');
    await page.mouse.move(over.x, over.y);
    await page.mouse.wheel(0, box.found && box.top < 0 ? -120 : 120);
    await page.waitForTimeout(80);
  }
  return hitTest(page, selector);
}
async function clickCenter(page, selector) {
  const box = await reveal(page, selector);
  if (box.found) await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(220);
  return box;
}
// La liste avec recherche ouverte : une ligne par option, son nom et son indice (le type), et si elle est entière dans le panneau.
const listRows = page => page.evaluate(() => {
  const panel = document.querySelector('#settings-modal .ss-panel:not([hidden])');
  if (!panel) return null;
  const r = panel.getBoundingClientRect();
  return {
    rows: Array.from(panel.querySelectorAll('.ss-option')).map(row => ({ name: (row.querySelector('.ss-name') || {}).textContent || '', hint: (row.querySelector('.ss-hint') || {}).textContent || '' })),
    inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
  };
});
const rowCenter = (page, text) => page.evaluate(wanted => {
  const found = Array.from(document.querySelectorAll('#settings-modal .ss-panel:not([hidden]) .ss-option')).find(row => row.querySelector('.ss-name').textContent === wanted);
  if (!found) return null;
  const r = found.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: !!top && found.contains(top), inViewport: r.top >= 0 && r.bottom <= innerHeight };
}, text);

// La couleur du texte d'un élément contre le fond réel qu'il a derrière lui (le premier fond opaque en remontant).
const textContrast = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const toRgb = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); const p = m ? m[1].split(/[ ,/]+/).map(Number) : [0, 0, 0]; return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  let node = el, bg = null;
  while (node && node !== document.documentElement) {
    const c = toRgb(getComputedStyle(node).backgroundColor);
    if (c.a > 0.95) { bg = c; break; }
    node = node.parentElement;
  }
  if (!bg) bg = toRgb(getComputedStyle(document.body).backgroundColor);
  return { color: getComputedStyle(el).color, background: 'rgb(' + bg.r + ',' + bg.g + ',' + bg.b + ')' };
}, selector);
const ratioOf = async (page, selector) => { const c = await textContrast(page, selector); return c ? Math.round(contrast(parseRgb(c.color), parseRgb(c.background)) * 100) / 100 : 0; };

// La section telle que l'écran la montre.
const sectionState = page => page.evaluate(() => {
  const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const status = document.getElementById('settings-exportdate-status');
  const locked = document.getElementById('settings-exportdate-locked');
  const select = document.getElementById('settings-exportdate-column');
  const trigger = document.querySelector('#settings-exportdate-column + .ss-wrap .ss-trigger');
  const body = document.querySelector('#settings-modal .settings-body');
  return {
    section: rect(document.getElementById('settings-exportdate-section')),
    title: (document.querySelector('#settings-exportdate-section .settings-section-title') || {}).textContent,
    trigger: rect(trigger), triggerText: trigger ? trigger.textContent.trim() : null,
    statusShown: !!status && !status.hidden && status.getClientRects().length > 0, statusText: status ? status.textContent : null, statusProblem: !!status && status.classList.contains('is-problem'),
    lockedShown: !!locked && !locked.hidden && locked.getClientRects().length > 0,
    disabled: !!select && select.disabled, value: select ? select.value : null,
    modal: rect(document.querySelector('#settings-modal .pp-modal-box')), close: rect(document.getElementById('settings-close')),
    bodyOverflowX: body.scrollWidth - body.clientWidth,
    viewport: { w: innerWidth, h: innerHeight },
    reminderShown: (() => { const b = document.getElementById('settings-save-reminder'); return !!b && !b.hidden && b.getClientRects().length > 0; })(),
  };
});
const widgetState = page => page.evaluate(() => {
  const s = window.__gristStub;
  const log = s.getActionLog().filter(a => a[0] === 'BulkUpdateRecord' && a[1] === 'Clients');
  return {
    option: (s.state.options || {}).dateDernierExport,
    column: ExportDate.getColumn(),
    dernier: [1, 2, 3].map(id => { const r = s.getRow('Clients', id); return r ? r.Dernier : undefined; }),
    writes: log.map(a => a[2]),
    denied: s.state.deniedWrites.length,
    status: document.getElementById('status-msg').textContent,
    statusClass: document.getElementById('status-msg').className,
    now: Math.floor(Date.now() / 1000),
  };
});
const clearLog = page => page.evaluate(() => window.__gristStub.clearActionLog());

// Un export PDF au vrai clic sur le bouton « Exporter en PDF » de la barre : le téléchargement est celui que Chromium reçoit.
async function realPdfExport(page) {
  const btn = await hitTest(page, '#btn-export-pdf');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }).catch(() => null),
    page.mouse.click(btn.x, btn.y),
  ]);
  let magic = '';
  if (download) magic = readFileSync(await download.path()).subarray(0, 5).toString('latin1');
  await page.waitForFunction(() => { const t = document.getElementById('status-msg').textContent; return !/génération|Generating|en cours|in progress/i.test(t); }, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { downloaded: !!download, magic, found: btn.found };
}
async function openViewTab(page) {
  await clickCenter(page, '#v2-btn-settings');
  await page.waitForTimeout(500);
  await clickCenter(page, '#settings-modal .settings-tab[data-settings-tab="rowTemplate"]');
  await page.waitForTimeout(300);
}
async function closeSettings(page) {
  await clickCenter(page, '#settings-close');
  await page.waitForTimeout(350);
}

// Une passe complète : un thème, une langue.
async function pass(colorScheme, lang) {
  const tag = `${colorScheme}/${lang}`;
  const fr = lang === 'fr';
  const { context, page } = await openWidget(colorScheme, lang);
  const T = await page.evaluate(() => ({
    title: I18n.t('settings.exportDate.title'), none: I18n.t('settings.exportDate.none'),
    datetime: I18n.t('settings.exportDate.status.datetime', { column: 'Dernier' }),
    missing: I18n.t('settings.exportDate.status.missing', { column: 'Dernier' }),
    locked: I18n.t('settings.exportDate.locked'), generated: I18n.t('status.pdfGenerated'),
    noteMissing: I18n.t('status.exportDate.missing', { column: 'Dernier' }),
    reminder: I18n.t('settings.saveReminder'),
  }));
  // La ligne courante du widget : la deuxième (« Martin »).
  await page.evaluate(() => window.__gristStub.fireRecord({ id: 2, Nom: 'Martin' }, 'Clients'));
  await page.waitForTimeout(300);

  // === Réglages > Vue : la section ===
  await openViewTab(page);
  const triggerBox = await reveal(page, '#settings-exportdate-column + .ss-wrap .ss-trigger');
  const sec0 = await sectionState(page);
  check(`${tag} : Réglages > Vue : la section « ${T.title} » existe et sa liste s'atteint à la molette, entière dans le panneau et au premier plan`,
    sec0.title === T.title && triggerBox.found && triggerBox.inViewport && triggerBox.onTop && triggerBox.width >= 120 && sec0.value === '' && sec0.disabled === false, { title: sec0.title, triggerBox, value: sec0.value });
  check(`${tag} : la section ne fait pas défiler la fenêtre de côté, et rien n'est annoncé tant qu'aucune colonne n'est choisie`,
    sec0.bodyOverflowX <= 1 && sec0.statusShown === false && sec0.lockedShown === false && sec0.reminderShown === false, sec0);
  await shot(page, `${colorScheme}-${lang}-1-section`);

  // === La liste avec recherche, au vrai clic ===
  await page.mouse.click(triggerBox.x, triggerBox.y);
  await page.waitForTimeout(250);
  const list = await listRows(page);
  const names = list ? list.rows.map(r => r.name) : null;
  const hints = list ? list.rows.map(r => r.hint) : null;
  check(`${tag} : la liste s'ouvre dans le panneau et propose « ${T.none} » puis les seules colonnes qui peuvent recevoir la date (Date, Date et heure, Texte), dans l'ordre de la table`,
    !!list && list.inside && JSON.stringify(names) === JSON.stringify([T.none, 'Nom', 'Dernier', 'Jour', 'Quand']), { names, inside: list && list.inside });
  check(`${tag} : le type de chaque colonne est son indice (${fr ? 'texte, date et heure, date' : 'text, date and time, date'}) ; ni la colonne Numérique ni la colonne à formule ne sont proposées`,
    !!list && JSON.stringify(hints) === JSON.stringify(['', fr ? '(texte)' : '(text)', fr ? '(date et heure)' : '(date and time)', '(date)', fr ? '(texte)' : '(text)']) && names.indexOf('Montant') === -1 && names.indexOf('Calcul') === -1, { hints, names });

  // La recherche : « jou » ne garde que la colonne Jour, « der » que Dernier ; un clic sur Dernier la choisit.
  await page.keyboard.type('jou');
  await page.waitForTimeout(150);
  const jou = await listRows(page);
  check(`${tag} : la recherche « jou » ne garde que la colonne « Jour »`, !!jou && JSON.stringify(jou.rows.map(r => r.name)) === JSON.stringify(['Jour']), jou);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('der');
  await page.waitForTimeout(150);
  const der = await listRows(page);
  check(`${tag} : la recherche « der » ne garde que la colonne « Dernier »`, !!der && JSON.stringify(der.rows.map(r => r.name)) === JSON.stringify(['Dernier']), der);
  const derRow = await rowCenter(page, 'Dernier');
  if (derRow) await page.mouse.click(derRow.x, derRow.y);
  await page.waitForTimeout(500);
  const sec1 = await sectionState(page);
  const wid1 = await widgetState(page);
  check(`${tag} : choisir « Dernier » au vrai clic : l'option du widget est écrite et la phrase dit ce qui s'écrira, sans alerte`,
    wid1.option === 'Dernier' && wid1.column === 'Dernier' && sec1.value === 'Dernier' && sec1.statusShown && sec1.statusText === T.datetime && sec1.statusProblem === false, { option: wid1.option, sec: sec1 });
  const statusBox = await reveal(page, '#settings-exportdate-status');
  const ratio1 = await ratioOf(page, '#settings-exportdate-status');
  check(`${tag} : la phrase est entière dans le panneau, lisible (contraste ${ratio1}, 4,5 au moins)`, statusBox.found && statusBox.inViewport && statusBox.onTop && ratio1 >= 4.5, { statusBox, ratio1 });
  check(`${tag} : le choix est un brouillon du widget : le rappel « Enregistrer » apparaît, la fenêtre garde « Fermer » à l'écran`,
    (await sectionState(page)).reminderShown === true && sec1.close.bottom <= sec1.viewport.h + 0.5 && sec1.modal.bottom <= sec1.viewport.h + 0.5, { reminder: (await sectionState(page)).reminderShown, close: sec1.close, modal: sec1.modal });
  await shot(page, `${colorScheme}-${lang}-2-choisie`);

  // === Un vrai export PDF : la ligne courante est datée, elle seule ===
  await closeSettings(page);
  await clearLog(page);
  const exp1 = await realPdfExport(page);
  const after1 = await widgetState(page);
  check(`${tag} : « Exporter en PDF » au vrai clic : un PDF est téléchargé, l'état reste « ${T.generated} »`, exp1.downloaded && exp1.magic === '%PDF-' && after1.status === T.generated && after1.statusClass === '', { exp1, status: after1.status, cls: after1.statusClass });
  check(`${tag} : la ligne courante (la 2) reçoit l'instant de l'export, les autres lignes ne changent pas, en une seule écriture`,
    typeof after1.dernier[1] === 'number' && Math.abs(after1.now - after1.dernier[1]) <= 120 && after1.dernier[0] == null && after1.dernier[2] == null && JSON.stringify(after1.writes) === '[[2]]', after1);

  // === La colonne supprimée dans Grist : la section le dit, l'export produit le PDF quand même ===
  await page.evaluate(() => window.__gristStub.deleteColumn('Clients', 'Dernier'));
  await openViewTab(page);
  await page.waitForTimeout(700); // la relecture du schéma à l'ouverture
  const gone = await sectionState(page);
  const goneStatus = await reveal(page, '#settings-exportdate-status');
  const ratioGone = await ratioOf(page, '#settings-exportdate-status');
  check(`${tag} : colonne supprimée dans Grist : la section la garde visible dans la liste et le dit en rouge, entier dans le panneau, contraste ${ratioGone}`,
    gone.value === 'Dernier' && gone.statusShown && gone.statusProblem && gone.statusText === T.missing && goneStatus.inViewport && goneStatus.onTop && ratioGone >= 4.5, { gone, goneStatus, ratioGone });
  await shot(page, `${colorScheme}-${lang}-3-colonne-supprimee`);
  await closeSettings(page);
  await clearLog(page);
  const exp2 = await realPdfExport(page);
  const after2 = await widgetState(page);
  const statusState = await hitTest(page, '#status-msg');
  const statusText = after2.status;
  check(`${tag} : colonne supprimée, « Exporter en PDF » au vrai clic : le PDF est produit quand même, rien n'est écrit`, exp2.downloaded && exp2.magic === '%PDF-' && after2.writes.length === 0 && after2.denied === 0, { exp2, writes: after2.writes, denied: after2.denied });
  check(`${tag} : le coin d'état commence, en rouge, par « ${T.noteMissing} » et reste dans la fenêtre`,
    statusText.startsWith(T.noteMissing) && statusText.endsWith(T.generated) && after2.statusClass === 'error-msg' && statusState.inViewport, { statusText, cls: after2.statusClass, statusState });
  await shot(page, `${colorScheme}-${lang}-4-etat-rouge`);

  // === Un compte Lecteur : la section reste, grisée et inerte ; l'export n'écrit rien ===
  await page.evaluate(async (columns) => {
    const s = window.__gristStub;
    s.setVariables('Clients', columns);
    s.setFormulaColumn('Clients', 'Calcul', '$Dernier');
    s.setRows('Clients', [{ id: 1, Nom: 'Dupont', Montant: 10 }, { id: 2, Nom: 'Martin', Montant: 20 }, { id: 3, Nom: 'Petit', Montant: 30 }]);
    await GristAPI.refreshSchema();
    s.fireRecord({ id: 2, Nom: 'Martin' }, 'Clients');
    s.setViewer(true);
    await AccessRights.refresh();
  }, COLUMNS);
  await page.waitForTimeout(500);
  await openViewTab(page);
  const trig = await reveal(page, '#settings-exportdate-column + .ss-wrap .ss-trigger');
  const viewer = await sectionState(page);
  await page.mouse.click(trig.x, trig.y);
  await page.waitForTimeout(250);
  const viewerList = await listRows(page);
  const lockedBox = await reveal(page, '#settings-exportdate-locked');
  check(`${tag} : compte Lecteur : la section reste visible, la liste est grisée (elle garde la colonne choisie), la phrase « ${T.locked} » l'explique`,
    viewer.title === T.title && viewer.disabled === true && viewer.value === 'Dernier' && viewer.lockedShown && lockedBox.inViewport && lockedBox.onTop, { viewer, lockedBox });
  check(`${tag} : compte Lecteur : un vrai clic sur la liste n'ouvre rien`, viewerList === null, viewerList);
  await shot(page, `${colorScheme}-${lang}-5-lecteur`);
  await closeSettings(page);
  await clearLog(page);
  const exp3 = await realPdfExport(page);
  const after3 = await widgetState(page);
  check(`${tag} : compte Lecteur, « Exporter en PDF » au vrai clic : le PDF est produit, aucune écriture tentée ni refusée, état « ${T.generated} » sans alerte`,
    exp3.downloaded && exp3.magic === '%PDF-' && after3.writes.length === 0 && after3.denied === 0 && after3.status === T.generated && after3.statusClass === '', { exp3, after3 });
  await context.close();
}

await pass('light', 'fr');
await pass('dark', 'fr');
await pass('light', 'en');

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);
await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
