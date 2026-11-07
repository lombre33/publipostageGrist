#!/usr/bin/env node
// Le PDF joint à la ligne (js/row-attachment.js, js/pdf-delivery.js ; Réglages > Vue > « PDF joint à la ligne », case « Joindre à la ligne » du menu Exporter) à la VRAIE souris
// (page.mouse, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en clair et en sombre, en français et en anglais.
// dev-tests/scenarios-row-attachment.js vérifie l'envoi, Remplacer / Ajouter, les refus et les phrases DANS la page ; ici, ce qui se mesure aux PIXELS et au vrai geste : la section
// atteignable à la molette sans défilement horizontal ; la liste avec recherche (« Aucune » en tête, les seules colonnes Pièces jointes sans formule) ; le menu Exporter qui ouvre au survol
// avec sa nouvelle case ENTIÈRE dans le panneau de 400 px et au premier plan ; la case grisée avec sa raison, puis cochée au vrai clic ; un VRAI export PDF au vrai clic (le téléchargement que
// reçoit Chromium) dont le PDF est aussi joint à la cellule de la ligne courante, elle seule ; le PDF réuni, qui grise la case et n'envoie rien ; un compte Lecteur (grisé, inerte).
// ATTENTION : le serveur d'envoi est le faux de dev-tests/grist-stub.js (installUploadServer), pas un vrai Grist - la preuve réelle est dans dev-tests/PROTOCOLE_TEST_MANUEL.md.
// Lancé par run-headless.mjs (groupe Node "rowAttachmentMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-row-attachment-mouse.mjs
// (ROW_ATTACHMENT_SHOTS=<dossier> y range une capture par étape, à regarder - aucune vérification n'en dépend).
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.ROW_ATTACHMENT_MOUSE_PORT || 8938);
const SHOTS = process.env.ROW_ATTACHMENT_SHOTS || '';
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
    let body = await readFile(target);
    // Le COMMUTATEUR DE RETOUR du PDF joint chez GFS : en production GFS_ATTACH_WIRED est à `true` (grisé levé le 07/11) ; l'étape « hébergé par GFS » ci-dessous rejoue le grisé, la constante servie à `false`, le seul changement.
    if (target === join(ROOT, 'js', 'row-attachment.js')) {
      const text = body.toString('utf8');
      const greyed = text.replace('const GFS_ATTACH_WIRED = true;', 'const GFS_ATTACH_WIRED = false;');
      if (greyed === text) throw new Error('« const GFS_ATTACH_WIRED = true; » est introuvable dans js/row-attachment.js : l\'étape GFS ne pourrait pas rejouer le grisé');
      body = Buffer.from(greyed, 'utf8');
    }
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
if (!OFFLINE) console.log('[verify-row-attachment-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Les colonnes de la table : Nom (Texte), Pdf et Autre (Pièces jointes, proposées), Montant (Numérique) et Calcul (Pièces jointes à formule), jamais proposées.
const COLUMNS = { Nom: 'Text', Pdf: 'Attachments', Autre: 'Attachments', Calcul: 'Attachments', Montant: 'Numeric' };
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
      stub.setFormulaColumn('Clients', 'Calcul', '$Pdf');
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

// La section de Réglages telle que l'écran la montre.
const sectionState = page => page.evaluate(() => {
  const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const status = document.getElementById('settings-rowattachment-status');
  const locked = document.getElementById('settings-rowattachment-locked');
  const select = document.getElementById('settings-rowattachment-column');
  const mode = document.getElementById('settings-rowattachment-mode');
  const trigger = document.querySelector('#settings-rowattachment-column + .ss-wrap .ss-trigger');
  const body = document.querySelector('#settings-modal .settings-body');
  return {
    title: (document.querySelector('#settings-rowattachment-section .settings-section-title') || {}).textContent,
    trigger: rect(trigger), triggerText: trigger ? trigger.textContent.trim() : null,
    statusShown: !!status && !status.hidden && status.getClientRects().length > 0, statusText: status ? status.textContent : null, statusProblem: !!status && status.classList.contains('is-problem'),
    lockedShown: !!locked && !locked.hidden && locked.getClientRects().length > 0,
    disabled: !!select && select.disabled, value: select ? select.value : null, modeValue: mode ? mode.value : null, modeDisabled: !!mode && mode.disabled,
    bodyOverflowX: body.scrollWidth - body.clientWidth,
    reminderShown: (() => { const b = document.getElementById('settings-save-reminder'); return !!b && !b.hidden && b.getClientRects().length > 0; })(),
  };
});
const widgetState = page => page.evaluate(() => {
  const s = window.__gristStub;
  return {
    column: RowAttachment.getColumn(), mode: RowAttachment.getMode(), optionColumn: (s.state.options || {}).pp_attach_column, optionMode: (s.state.options || {}).pp_attach_mode,
    cells: [1, 2, 3].map(id => { const r = s.getRow('Clients', id); return r ? r.Pdf : undefined; }),
    writes: s.getActionLog().filter(a => a[0] === 'BulkUpdateRecord' && a[1] === 'Clients').map(a => a[2]),
    stored: PersonStore.get('pp_export_attach'),
    status: document.getElementById('status-msg').textContent, statusClass: document.getElementById('status-msg').className,
    uploads: (window.__ra_server ? window.__ra_server.requests.length : 0), writeTokens: s.state.tokenCalls.filter(c => c.readOnly === false).length,
  };
});
const clearLog = page => page.evaluate(() => { window.__gristStub.clearActionLog(); });

// La case et son menu : le survol du bouton Exporter ouvre le menu ; on mesure la case (entière dans le panneau, au premier plan) et son état.
async function menuState(page) {
  const group = await hitTest(page, '#btn-export-pdf');
  await page.mouse.move(group.x, group.y);
  await page.waitForTimeout(450);
  return page.evaluate(() => {
    const flyout = document.getElementById('v2-export-pdf-flyout');
    const row = document.getElementById('v2-export-attach');
    const fr = flyout.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      flyoutShown: fr.height > 0, flyout: { top: fr.top, bottom: fr.bottom, left: fr.left, right: fr.right },
      row: { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height },
      shown: row.getClientRects().length > 0 && !row.closest('[hidden]'), onTop: !!top && (top === row || row.contains(top)),
      inViewport: r.top >= 0 && r.bottom <= innerHeight + 0.5 && r.left >= 0 && r.right <= innerWidth + 0.5,
      checked: row.getAttribute('aria-checked'), disabled: row.classList.contains('v2-hover-row-disabled'), title: row.getAttribute('title') || '', text: row.textContent.trim(),
      viewport: { w: innerWidth, h: innerHeight },
    };
  });
}
// Un clic dans la marge de la page ferme le menu : la case cliquée garde le focus, donc le menu reste ouvert tant que le focus y est (:focus-within).
async function leaveMenu(page) {
  await page.mouse.move(5, 200);
  await page.mouse.click(5, 200);
  await page.waitForTimeout(350);
}
// Un export PDF au vrai clic sur le bouton « Exporter » de la barre : le téléchargement est celui que Chromium reçoit. Un lot demande d'abord sa confirmation (« Générer »).
async function realPdfExport(page, { confirm = false } = {}) {
  const btn = await hitTest(page, '#btn-export-pdf');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }).catch(() => null),
    (async () => {
      await page.mouse.click(btn.x, btn.y);
      if (confirm) {
        await page.waitForSelector('#pp-dialog-modal .var-modal-primary', { state: 'visible', timeout: 30000 });
        await page.waitForTimeout(250);
        const ok = await hitTest(page, '#pp-dialog-modal .var-modal-primary');
        await page.mouse.click(ok.x, ok.y);
      }
    })(),
  ]);
  let magic = '';
  if (download) magic = readFileSync(await download.path()).subarray(0, 4).toString('latin1');
  await page.waitForFunction(() => { const t = document.getElementById('status-msg').textContent; return !/génération|Generating|en cours|in progress|Envoi|Sending/i.test(t); }, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);
  return { downloaded: !!download, magic, found: btn.found, name: download ? download.suggestedFilename() : '' };
}
// Une option de lignes du menu Exporter cochée au vrai clic (« one », « zip », « merged »).
async function chooseLines(page, key) {
  const group = await hitTest(page, '#btn-export-pdf');
  await page.mouse.move(group.x, group.y);
  await page.waitForTimeout(450);
  const row = await hitTest(page, '#v2-export-lines-' + key);
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(300);
  await leaveMenu(page);
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
  const { context, page } = await openWidget(colorScheme, lang);
  const T = await page.evaluate(() => ({
    title: I18n.t('settings.rowAttachment.title'), none: I18n.t('settings.rowAttachment.none'),
    ok: I18n.t('settings.rowAttachment.status.ok', { column: 'Pdf' }), missing: I18n.t('settings.rowAttachment.status.missing', { column: 'Pdf' }),
    locked: I18n.t('settings.rowAttachment.locked'), label: I18n.t('attach.label'),
    offColumn: I18n.t('attach.off.column'), offMerged: I18n.t('attach.off.merged'), offReadOnly: I18n.t('attach.off.readOnly'),
    offGfs: I18n.t('attach.off.gfs'), lockedGfs: I18n.t('settings.rowAttachment.lockedGfs'), one: I18n.t('attach.one', { column: 'Pdf' }), generated: I18n.t('status.pdfGenerated'), replace: I18n.t('settings.rowAttachment.mode.replace'), add: I18n.t('settings.rowAttachment.mode.add'),
  }));
  // La ligne courante du widget : la deuxième (« Martin »). Le faux serveur d'envoi de grist-stub.js (rien de mesuré dans un vrai Grist).
  await page.evaluate(() => { window.__gristStub.fireRecord({ id: 2, Nom: 'Martin' }, 'Clients'); window.__ra_server = window.__gristStub.installUploadServer(); });
  await page.waitForTimeout(300);

  // === Le menu Exporter, sans colonne choisie : la case est là, grisée, et dit pourquoi ===
  const m0 = await menuState(page);
  check(`${tag} : menu Exporter : la case « ${T.label} » est montrée, ENTIÈRE dans le panneau de ${HEIGHT} px et au premier plan`,
    m0.flyoutShown && m0.shown && m0.inViewport && m0.onTop && m0.text === T.label && m0.flyout.bottom <= HEIGHT, m0);
  check(`${tag} : sans colonne, la case est grisée (non cochée) et son info-bulle dit : « ${T.offColumn} »`, m0.disabled === true && m0.checked === 'false' && m0.title === T.offColumn, m0);
  await shot(page, `${colorScheme}-${lang}-1-menu-grise`);
  await page.mouse.click(m0.row.x, m0.row.y);
  await page.waitForTimeout(300);
  const w0 = await widgetState(page);
  check(`${tag} : un vrai clic sur la case grisée ne coche rien et dit la raison au coin d'état`, w0.stored === null && w0.status === T.offColumn, w0);
  await leaveMenu(page);

  // === Réglages > Vue : la section ===
  await openViewTab(page);
  const triggerBox = await reveal(page, '#settings-rowattachment-column + .ss-wrap .ss-trigger');
  const sec0 = await sectionState(page);
  check(`${tag} : Réglages > Vue : la section « ${T.title} » existe et sa liste s'atteint à la molette, entière dans le panneau et au premier plan`,
    sec0.title === T.title && triggerBox.found && triggerBox.inViewport && triggerBox.onTop && triggerBox.width >= 120 && sec0.value === '' && sec0.disabled === false && sec0.modeValue === 'replace', { title: sec0.title, triggerBox, sec0 });
  check(`${tag} : la section ne fait pas défiler la fenêtre de côté, rien n'est annoncé tant qu'aucune colonne n'est choisie`,
    sec0.bodyOverflowX <= 1 && sec0.statusShown === false && sec0.lockedShown === false && sec0.reminderShown === false, sec0);
  await page.mouse.click(triggerBox.x, triggerBox.y);
  await page.waitForTimeout(300);
  const list = await listRows(page);
  check(`${tag} : la liste ouverte : « ${T.none} » puis les seules colonnes Pièces jointes sans formule (Pdf, Autre), ni Texte, ni Numérique, ni la colonne à formule, entière dans le panneau`,
    !!list && list.inside && list.rows.map(r => r.name).join('|') === T.none + '|Pdf|Autre', list);
  await shot(page, `${colorScheme}-${lang}-2-liste`);
  const pdfRow = await rowCenter(page, 'Pdf');
  if (pdfRow) await page.mouse.click(pdfRow.x, pdfRow.y);
  await page.waitForTimeout(500);
  const sec1 = await sectionState(page);
  const w1 = await widgetState(page);
  check(`${tag} : choisir « Pdf » au vrai clic : la phrase dit « ${T.ok} », l'option du widget est écrite, le rappel « Enregistrer » apparaît`,
    sec1.value === 'Pdf' && sec1.statusShown && sec1.statusText === T.ok && !sec1.statusProblem && w1.optionColumn === 'Pdf' && w1.column === 'Pdf' && sec1.reminderShown === true, { sec1, w1 });
  const ratio = await ratioOf(page, '#settings-rowattachment-status');
  check(`${tag} : la phrase d'état se lit (contraste ≥ 4,5:1)`, ratio >= 4.5, ratio);
  // Le mode : une liste native, changée au vrai geste (focus puis flèche du clavier).
  const modeBox = await reveal(page, '#settings-rowattachment-mode');
  await page.mouse.click(modeBox.x, modeBox.y);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const sec2 = await sectionState(page);
  const w2 = await widgetState(page);
  check(`${tag} : le mode passe à « ${T.add} » (option du widget écrite), puis on le remet à « ${T.replace} »`, sec2.modeValue === 'add' && w2.optionMode === 'add' && w2.mode === 'add', { sec2, w2 });
  await shot(page, `${colorScheme}-${lang}-3-reglages`);
  await page.mouse.click(modeBox.x, modeBox.y);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  check(`${tag} : le mode est revenu à « ${T.replace} »`, (await widgetState(page)).mode === 'replace', await widgetState(page));
  await closeSettings(page);

  // === Le menu Exporter, colonne choisie : la case se coche au vrai clic ===
  const m1 = await menuState(page);
  check(`${tag} : colonne choisie : la case est vivante et décochée`, m1.disabled === false && m1.checked === 'false' && m1.title === '' && m1.inViewport && m1.onTop, m1);
  await page.mouse.click(m1.row.x, m1.row.y);
  await page.waitForTimeout(300);
  const m2 = await menuState(page);
  const w3 = await widgetState(page);
  check(`${tag} : un vrai clic coche la case (clé de la personne = 1) ; le menu reste entier dans le panneau`, m2.checked === 'true' && w3.stored === '1' && m2.inViewport && m2.flyout.bottom <= HEIGHT, { m2, w3 });
  const textRatio = await ratioOf(page, '#v2-export-attach');
  check(`${tag} : le libellé de la case se lit (contraste ≥ 4,5:1)`, textRatio >= 4.5, textRatio);
  await shot(page, `${colorScheme}-${lang}-4-menu-coche`);

  // === Un VRAI export PDF au vrai clic : téléchargé ET joint à la ligne courante ===
  await leaveMenu(page);
  await clearLog(page);
  const exp = await realPdfExport(page);
  const w4 = await widgetState(page);
  check(`${tag} : « Exporter » au vrai clic : le PDF est téléchargé ET joint à la ligne courante (la 2), elle seule, avec un jeton d'écriture et une seule écriture`,
    exp.downloaded && exp.magic === '%PDF' && w4.uploads === 1 && JSON.stringify(w4.cells) === JSON.stringify([null, ['L', 1], null]) && w4.writes.length === 1 && w4.writeTokens === 1, { exp, w4 });
  check(`${tag} : le coin d'état dit « ${T.one} » puis que le PDF est généré, sans alerte`, w4.status === T.one + ' ' + T.generated && w4.statusClass === '', w4);
  const uploaded = await page.evaluate(() => { const sent = window.__ra_server.requests[0] || {}; return { name: sent.fileName, type: sent.type, size: sent.size }; });
  check(`${tag} : le fichier joint porte le nom du PDF téléchargé`, uploaded.name === exp.name && uploaded.type === 'application/pdf' && uploaded.size > 500, { uploaded, name: exp.name });
  await shot(page, `${colorScheme}-${lang}-5-exporte`);

  // === Toutes les lignes (ZIP) : chaque PDF dans SA ligne, en une seule écriture ===
  await chooseLines(page, 'zip');
  const m5 = await menuState(page);
  check(`${tag} : « ZIP » : la case reste vivante et cochée`, m5.shown && m5.disabled === false && m5.checked === 'true', m5);
  await leaveMenu(page);
  await clearLog(page);
  const beforeZip = (await widgetState(page)).uploads;
  const expZip = await realPdfExport(page, { confirm: true });
  const wZip = await widgetState(page);
  check(`${tag} : le ZIP est téléchargé ET ses trois PDF sont joints, chacun à sa ligne, en une seule écriture`,
    expZip.downloaded && /\.zip$/i.test(expZip.name) && wZip.uploads === beforeZip + 3 && wZip.writes.length === 1 && JSON.stringify(wZip.writes[0].slice().sort()) === '[1,2,3]'
      && wZip.cells.every(cell => Array.isArray(cell) && cell[0] === 'L' && cell.length >= 2) && wZip.cells[1].length === 3, { expZip, wZip, beforeZip });
  check(`${tag} : le coin d'état dit que les 3 PDF sont joints à leur ligne`, /^3 /.test(wZip.status) && wZip.statusClass === '', wZip);
  await shot(page, `${colorScheme}-${lang}-6-zip`);

  // === Le PDF réuni : la case est grisée avec sa raison et rien n'est envoyé ===
  await chooseLines(page, 'merged');
  const m3 = await menuState(page);
  check(`${tag} : « tout en un seul PDF » : la case est grisée (jamais retirée) et dit « ${T.offMerged} »`, m3.shown && m3.disabled === true && m3.checked === 'false' && m3.title === T.offMerged, m3);
  await shot(page, `${colorScheme}-${lang}-7-reuni`);
  await leaveMenu(page);
  await clearLog(page);
  const before = (await widgetState(page)).uploads;
  const exp2 = await realPdfExport(page, { confirm: true });
  const w5 = await widgetState(page);
  check(`${tag} : le PDF réuni est téléchargé, aucun envoi, aucune écriture, le coin d'état ne parle pas de pièce jointe`,
    exp2.downloaded && exp2.magic === '%PDF' && w5.uploads === before && w5.writes.length === 0 && !/joint|attached/i.test(w5.status), { exp2, w5 });
  await chooseLines(page, 'one');

  // === Compte Lecteur : la case est grisée, l'export n'envoie rien ===
  await page.evaluate(async () => { window.__gristStub.setViewer(true); await AccessRights.refresh(); });
  await page.waitForTimeout(400);
  const m4 = await menuState(page);
  check(`${tag} : compte Lecteur : la case est grisée et dit « ${T.offReadOnly} »`, m4.shown && m4.disabled === true && m4.title === T.offReadOnly, m4);
  await leaveMenu(page);
  await clearLog(page);
  const before2 = (await widgetState(page)).uploads;
  const exp3 = await realPdfExport(page);
  const w6 = await widgetState(page);
  check(`${tag} : compte Lecteur : le PDF est produit sans alerte, rien n'est envoyé ni écrit`, exp3.downloaded && w6.uploads === before2 && w6.writes.length === 0 && w6.statusClass === '' && w6.status === T.generated, { exp3, w6 });

  // === Le commutateur de retour chez GFS (choix du 06/11, « Griser dans GFS pour l'instant », levé le 07/11 ; ici la constante est servie à `false`) : la case et la section sont grisées avec leur raison, rien n'est envoyé ===
  await page.evaluate(async () => { window.__gristStub.setViewer(false); await AccessRights.refresh(); GfsLink.hosted = true; RowAttachment.render(); });
  await page.waitForTimeout(400);
  await leaveMenu(page);   // le survol relit la case : le pointeur quitte d'abord le bouton, qu'il survolait encore après le dernier export
  const m6 = await menuState(page);
  check(`${tag} : dans GFS : la case est grisée (jamais retirée), décochée, entière dans le panneau, et dit « ${T.offGfs} »`,
    m6.shown && m6.disabled === true && m6.checked === 'false' && m6.title === T.offGfs && m6.inViewport && m6.onTop && m6.flyout.bottom <= HEIGHT, m6);
  await page.mouse.click(m6.row.x, m6.row.y);
  await page.waitForTimeout(300);
  const w7 = await widgetState(page);
  check(`${tag} : dans GFS : un vrai clic sur la case grisée dit la raison au coin d'état et ne change pas la clé de la personne`, w7.status === T.offGfs && w7.stored === '1', w7);
  await shot(page, `${colorScheme}-${lang}-8-gfs-menu`);
  await leaveMenu(page);
  await clearLog(page);
  const before3 = (await widgetState(page)).uploads;
  const exp4 = await realPdfExport(page);
  const w8 = await widgetState(page);
  check(`${tag} : dans GFS : le PDF est téléchargé, rien n'est envoyé ni écrit, aucun jeton d'écriture demandé`,
    exp4.downloaded && exp4.magic === '%PDF' && w8.uploads === before3 && w8.writes.length === 0 && w8.statusClass === '' && !/joint|attached/i.test(w8.status), { exp4, w8 });
  await openViewTab(page);
  const hint = await reveal(page, '#settings-rowattachment-locked-gfs');
  const sec2g = await sectionState(page);
  const hintText = await page.evaluate(() => document.getElementById('settings-rowattachment-locked-gfs').textContent);
  check(`${tag} : dans GFS : Réglages > Vue : la liste et le mode sont grisés, la mention de GFS se lit entière dans le panneau, pas celle de la lecture seule`,
    sec2g.disabled === true && sec2g.modeDisabled === true && hint.found && hint.shown && hint.inViewport && hint.onTop && hintText === T.lockedGfs && sec2g.lockedShown === false, { sec2g, hint, hintText });
  const hintRatio = await ratioOf(page, '#settings-rowattachment-locked-gfs');
  check(`${tag} : dans GFS : la mention se lit (contraste ≥ 4,5:1)`, hintRatio >= 4.5, hintRatio);
  await shot(page, `${colorScheme}-${lang}-9-gfs-reglages`);
  const closeBox = await hitTest(page, '#settings-close');
  await page.mouse.click(closeBox.x, closeBox.y);
  await page.waitForTimeout(350);
  await page.evaluate(() => { GfsLink.hosted = false; RowAttachment.render(); });
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
