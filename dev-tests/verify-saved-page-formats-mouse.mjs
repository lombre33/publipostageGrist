#!/usr/bin/env node
// Formats de page enregistrés (liste de la fenêtre « Format libre… », js/saved-page-formats.js, table Publipostage_FormatsPage) à la VRAIE souris et au vrai clavier (page.mouse,
// page.keyboard ; Node/Playwright), à la taille du panneau Grist d'Antoine (~700x400), en thème clair puis sombre : la fenêtre tient sans défiler avec sa rangée « Format » (liste avec
// recherche, corbeille), ses mesures (30 px de haut, libellés centrés, alignements, boutons), l'invite entière dans le champ fermé, les contrastes ; un vrai clic sur la liste l'ouvre
// au-dessus de la fenêtre, triée, la taille en indice ; choisir un format remplit les champs sans toucher la page ; Tab, ↓, recherche et Entrée au clavier ; retoucher un champ remet
// l'invite ; « Enregistrer ce format… » ouvre la saisie du nom par-dessus (proposition, Échap, voile), Entrée enregistre sans rien déplacer, un nom pris devient « (2) » ; la corbeille
// confirme (focus sur « Annuler ») puis retire la ligne et rend le focus à la liste ; « Valider » pose la page choisie et le modèle l'enregistre ; 40 formats et un nom de plus de cent
// caractères ; l'anglais. dev-tests/scenarios-saved-page-formats.js vérifie le reste DANS la page (table, noms, lignes illisibles, échecs d'écriture, reprise sur un autre modèle) ;
// ici, chaque geste est un vrai geste.
// Lancé par run-headless.mjs (groupe Node "savedFormatsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-saved-page-formats-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.SAVED_FORMATS_MOUSE_PORT || 8971);
const WIDTH = 700;
const HEIGHT = 400;
// Captures d'écran (menu, fenêtre, fenêtre en erreur, assemblage, en clair et en sombre) : un dossier temporaire, ou PAGE_SIZE_SHOTS pour les garder.
const SHOTS = process.env.SAVED_FORMATS_SHOTS || mkdtempSync(join(tmpdir(), 'saved-formats-'));
mkdirSync(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-access-rights-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-saved-page-formats-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
  // Boîtes du navigateur (alert/confirm) : acceptées et consignées, jamais bloquantes.
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept().catch(() => {}); });
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
  // Semé avant le démarrage : un modèle classique « Contrat » enregistré et ouvert par défaut, une ligne de données ; AUCUN réglage de droits, donc tous les droits.
  await page.addInitScript(() => {
    window.__preSeedGristStub = (stub) => {
      stub.setVariables('Clients', { Nom: 'Text' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      // Assez long pour passer sur plusieurs pages dans les deux sens, avec un tableau pour voir la largeur de la page.
      const paras = Array.from({ length: 100 }, (_, i) => '<p>Ligne ' + i + ' du contrat de location, rédigée pour que le modèle tienne sur plusieurs pages.</p>').join('');
      m.Contenu.push('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>, voici le contrat de location.</p>'
        + '<table><tbody><tr><td><p>Désignation</p></td><td><p>Quantité</p></td><td><p>Prix</p></td></tr></tbody></table>' + paras);
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  });
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  return { context, page, dialogs };
}

// === Aides ================================================================================================================================================

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
const within = (a, b, tol) => Math.abs(a - b) <= tol;

// Le menu Page : survole le bouton, descend tout droit jusqu'à la ligne demandée (le menu reste ouvert tout du long) et clique.
const pageMenuRows = page => page.evaluate(() => Array.from(document.querySelectorAll('#v2-page-flyout .v2-hover-row-check')).map(row => {
  const rr = row.getBoundingClientRect();
  return { key: row.getAttribute('data-page-orientation') || row.getAttribute('data-page-format'), x: rr.left + rr.width / 2, y: rr.top + rr.height / 2 };
}));
async function pickRow(page, key) {
  const btn = await boxOf(page, '#btn-page-orientation');
  await page.mouse.move(btn.x - 8, btn.y - 4, { steps: 2 });
  await page.mouse.move(btn.x, btn.y, { steps: 3 });
  await page.waitForTimeout(200);
  const row = (await pageMenuRows(page)).find(r => r.key === key);
  if (!row) throw new Error('ligne introuvable : ' + key);
  await page.mouse.move(btn.x, row.y, { steps: 8 });
  await page.mouse.move(row.x, row.y, { steps: 3 });
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(800);
}
const away = async (page) => { await page.mouse.move(350, 345, { steps: 6 }); await page.waitForTimeout(250); };

// Contraste (WCAG) d'une couleur d'un élément (`color` ou `borderTopColor`) contre le premier fond opaque trouvé en remontant (à partir du parent pour une bordure).
const ratioOf = (page, selector, prop) => page.evaluate(({ sel, prop }) => {
  const nums = c => (c.match(/-?[\d.]+/g) || []).map(Number);
  const rgba = c => { const n = nums(c); return c.indexOf('color(') === 0 ? { r: n[0] * 255, g: n[1] * 255, b: n[2] * 255, a: n.length > 3 ? n[3] : 1 } : { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const el = document.querySelector(sel);
  if (!el) return null;
  const fg = rgba(getComputedStyle(el)[prop]);
  let node = prop === 'color' ? el : el.parentElement; let bg = { r: 255, g: 255, b: 255, a: 1 };
  while (node) { const c = rgba(getComputedStyle(node).backgroundColor); if (c.a > .99) { bg = c; break; } node = node.parentElement; }
  const a = lum(fg), b = lum(bg);
  return Math.round((Math.max(a, b) + .05) / (Math.min(a, b) + .05) * 100) / 100;
}, { sel: selector, prop: prop || 'color' });

const stored = page => page.evaluate(() => {
  const s = window.__gristStub;
  const row = s.getRow('Publipostage_Modeles', 1);
  return { margins: row.Margins, writes: s.countActions('UpdateRecord', 'Publipostage_Modeles') };
});

const TABLE = 'Publipostage_FormatsPage';
const WIN = '#pp-pagesize-modal';
const LIST = `${WIN} .pp-pagesize-saved .ss-trigger`;
const PANEL = `${WIN} .ss-panel`;
const TRASH = `${WIN} .pp-pagesize-remove`;
const SAVE = `${WIN} .pp-pagesize-save`;
const OK_BUTTON = `${WIN} .var-modal-primary`;
const CANCEL_BUTTON = `${WIN} .var-modal-actions button:not(.var-modal-primary):not(.pp-pagesize-save)`;
const DLG = '#pp-dialog-modal';

// Les formats enregistrés du document, comme si l'équipe les avait déjà : [[nom, largeur mm, hauteur mm], ...].
async function seedFormats(page, rows) {
  await page.evaluate(async ({ rows, TABLE }) => {
    const s = window.__gristStub;
    const actions = s.state.tables.indexOf(TABLE) === -1 ? [['AddTable', TABLE, [{ id: 'Nom', type: 'Text' }, { id: 'Largeur', type: 'Numeric' }, { id: 'Hauteur', type: 'Numeric' }]]] : [];
    rows.forEach(([Nom, Largeur, Hauteur]) => actions.push(['AddRecord', TABLE, null, { Nom, Largeur, Hauteur }]));
    await s.applyUserActions(actions);
  }, { rows, TABLE });
}
const tableRows = page => page.evaluate(TABLE => {
  const t = window.__gristStub.state.rows[TABLE];
  return t ? t.id.map((id, i) => t.Nom[i] + ' ' + t.Largeur[i] + 'x' + t.Hauteur[i]) : [];
}, TABLE);

// Ouvre la fenêtre par un vrai clic sur la ligne « Format libre… », puis attend qu'elle soit là et que sa liste ait lu le document (grisée en attendant).
async function openWindowByMouse(page) {
  await pickRow(page, 'custom');
  await page.waitForFunction(() => { const m = document.getElementById('pp-pagesize-modal'); return !!m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => { const t = document.querySelector('#pp-pagesize-modal .pp-pagesize-saved .ss-trigger'); return !!t && !t.disabled; }, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(150);
}
// Triple clic de vraie souris dans un champ (tout son texte est sélectionné), puis la frappe.
async function typeInField(page, selector, text) {
  const b = await boxOf(page, selector);
  await page.mouse.click(b.x, b.y, { clickCount: 3 });
  await page.keyboard.type(text);
}
// L'élément qui a le focus, nommé comme la personne le comprend.
const focusName = page => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return 'corps';
  if (a.classList.contains('ss-trigger')) return 'liste';
  if (a.classList.contains('ss-input')) return 'recherche';
  if (a.classList.contains('pp-pagesize-remove')) return 'corbeille';
  if (a.id === 'pp-pagesize-width') return 'largeur';
  if (a.id === 'pp-pagesize-height') return 'hauteur';
  if (a.classList.contains('pp-pagesize-save')) return 'enregistrer';
  if (a.id === 'pp-dialog-input') return 'saisie';
  if (a.closest('#pp-dialog-modal')) return 'dialogue:' + a.textContent;
  if (a.closest('#pp-pagesize-modal')) return a.classList.contains('var-modal-primary') ? 'valider' : 'fenêtre:' + (a.textContent || a.tagName);
  return a.id || a.tagName;
});

// Ce que la fenêtre montre : textes, champs, liste (champ fermé, corbeille), aperçu, boutons.
const winState = page => page.evaluate(() => {
  const m = document.getElementById('pp-pagesize-modal');
  const q = s => m.querySelector(s);
  const err = q('#pp-pagesize-error');
  const trigger = q('.pp-pagesize-saved .ss-trigger');
  return {
    open: getComputedStyle(m).display !== 'none', title: q('h3').textContent, labels: Array.from(m.querySelectorAll('.pp-pagesize-label')).map(l => l.textContent),
    width: q('#pp-pagesize-width').value, height: q('#pp-pagesize-height').value, error: err.hidden ? '' : err.textContent,
    caption: q('.pp-pagesize-caption').textContent, orientation: q('.pp-pagesize-orientation').textContent,
    shown: trigger.querySelector('.ss-name').textContent, hintShown: trigger.querySelector('.ss-hint').textContent, placeholder: trigger.classList.contains('is-placeholder'), listDisabled: trigger.disabled,
    trashDisabled: q('.pp-pagesize-remove').disabled, trashTitle: q('.pp-pagesize-remove').title, saveDisabled: q('.pp-pagesize-save').disabled, saveText: q('.pp-pagesize-save').textContent,
    okDisabled: q('.var-modal-primary').disabled, status: q('#pp-pagesize-status').textContent,
  };
});
// La fenêtre tient dans le panneau : aucun défilement dans son corps, son cadre entier dans la vue, aucun texte coupé (hors noms de formats, qui se coupent par « … »).
const winFits = page => page.evaluate(() => {
  const m = document.getElementById('pp-pagesize-modal');
  const body = m.querySelector('.pp-modal-body');
  const r = m.querySelector('.modal-content').getBoundingClientRect();
  const clipped = Array.from(m.querySelectorAll('.pp-pagesize-note, .pp-pagesize-caption, .pp-pagesize-label, .pp-pagesize-orientation, .var-modal-actions button')).filter(e => !e.hidden && e.getClientRects().length && e.scrollWidth > e.clientWidth + 1).map(e => e.className || e.tagName);
  return { scrollH: body.scrollHeight, clientH: body.clientHeight, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), clipped,
    ok: body.scrollHeight <= body.clientHeight + 1 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && clipped.length === 0 };
});
// Les mesures de la fenêtre : chaque ligne (libellé, champ, corbeille) et le cadre.
const geometry = page => page.evaluate(() => {
  const m = document.getElementById('pp-pagesize-modal');
  const rect = s => { const e = m.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, w: b.width, h: b.height, cy: b.top + b.height / 2 }; };
  const labels = Array.from(m.querySelectorAll('.pp-pagesize-label')).map(l => { const b = l.getBoundingClientRect(); return { cy: b.top + b.height / 2, left: b.left }; });
  return { box: rect('.modal-content'), trigger: rect('.pp-pagesize-saved .ss-trigger'), name: rect('.pp-pagesize-saved .ss-name'), trash: rect('.pp-pagesize-remove'), width: rect('#pp-pagesize-width'), height: rect('#pp-pagesize-height'),
    save: rect('.pp-pagesize-save'), cancel: rect('.var-modal-actions button:not(.var-modal-primary):not(.pp-pagesize-save)'), ok: rect('.var-modal-primary'), preview: rect('.pp-pagesize-preview'), labels };
});
// La liste ouverte : panneau (dans le panneau Grist, au-dessus de la fenêtre), lignes, défilement.
const panelInfo = page => page.evaluate(() => {
  const p = document.querySelector('#pp-pagesize-modal .ss-panel');
  if (!p || p.hidden) return { open: false };
  const b = p.getBoundingClientRect();
  const list = p.querySelector('.ss-list');
  const first = p.querySelector('.ss-option');
  const fr = first ? first.getBoundingClientRect() : null;
  const hit = fr ? document.elementFromPoint(fr.left + fr.width / 2, fr.top + fr.height / 2) : null;
  return { open: true, left: b.left, right: b.right, top: b.top, bottom: b.bottom, w: b.width, h: b.height, inView: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight,
    firstVisibleOnTop: !!hit && p.contains(hit), rows: Array.from(p.querySelectorAll('.ss-option')).map(o => o.querySelector('.ss-name').textContent), hints: Array.from(p.querySelectorAll('.ss-option .ss-hint')).map(o => o.textContent),
    scrolls: list.scrollHeight > list.clientHeight + 1, horizontalOverflow: list.scrollWidth > list.clientWidth + 1, empty: (p.querySelector('.ss-empty') && !p.querySelector('.ss-empty').hidden) ? p.querySelector('.ss-empty').textContent : '',
    search: p.querySelector('.ss-input').placeholder };
});
const rowBox = (page, name) => page.evaluate(n => {
  const li = Array.from(document.querySelectorAll('#pp-pagesize-modal .ss-option')).find(o => o.querySelector('.ss-name').textContent === n);
  if (!li) return null;
  const r = li.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, name);
// Choisit un format comme la personne : un vrai clic sur le champ de la liste, un vrai clic sur la ligne.
async function chooseByMouse(page, name, query) {
  await realClick(page, LIST);
  await page.waitForTimeout(200);
  if (query) { await page.keyboard.type(query); await page.waitForTimeout(150); }
  const b = await rowBox(page, name);
  if (!b) return null;
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(200);
  return b;
}
// La fenêtre de saisie ou de confirmation (js/dialogs.js).
const dlgInfo = page => page.evaluate(() => {
  const d = document.getElementById('pp-dialog-modal');
  if (!d || getComputedStyle(d).display === 'none') return { open: false };
  const box = d.querySelector('.modal-content').getBoundingClientRect();
  const mid = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  const input = document.getElementById('pp-dialog-input');
  const msg = d.querySelector('.pp-dialog-message');
  const body = d.querySelector('.pp-modal-body');
  const a = document.activeElement;
  return { open: true, title: d.querySelector('h3').textContent, message: msg.hidden ? '' : msg.textContent, label: d.querySelector('.pp-dialog-label').hidden ? '' : d.querySelector('.pp-dialog-label').textContent,
    value: input.hidden ? null : input.value, selected: input.hidden ? null : [input.selectionStart, input.selectionEnd], focusOnInput: a === input, focusText: a && d.contains(a) && a !== input ? a.textContent : '',
    onTop: !!mid && d.contains(mid), inView: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, w: Math.round(box.width), h: Math.round(box.height),
    overflow: body.scrollWidth > body.clientWidth + 1 || body.scrollHeight > body.clientHeight + 1,
    ok: d.querySelector('.var-modal-primary').textContent, cancel: d.querySelector('.var-modal-actions button:not(.var-modal-primary)').textContent };
});

// === Le parcours ==========================================================================================================================================

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Formats de page enregistrés à la vraie souris et au vrai clavier, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page, dialogs } = await openWidget(theme);
  const nativeDialogs = dialogs;
  const a4On = await page.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview'));
  if (!a4On) await realClick(page, '#v2-a4-toggle');
  await page.waitForTimeout(500);

  // 1) Un document sans format enregistré : la liste le dit, rien n'est écrit, la fenêtre tient.
  const writesBefore = await page.evaluate(TABLE => ({ created: window.__gristStub.countActions('AddTable', TABLE), tables: window.__gristStub.state.tables.indexOf(TABLE) }), TABLE);
  await openWindowByMouse(page);
  const empty = await winState(page);
  const emptyFit = await winFits(page);
  check(`${label} - document sans format enregistré : la fenêtre s'ouvre avec « Format » en tête, la liste dit « ${empty.shown} », corbeille grisée, « Enregistrer ce format… » actif, tout tient sans défiler (${emptyFit.scrollH}/${emptyFit.clientH})`,
    empty.open && empty.labels.join() === 'Format,Largeur,Hauteur' && empty.shown === '— Choisir un format —' && empty.placeholder && !empty.listDisabled && empty.trashDisabled && !empty.saveDisabled && emptyFit.ok && empty.saveText === 'Enregistrer ce format…', { empty, emptyFit });
  await realClick(page, LIST);
  await page.waitForTimeout(250);
  const noneOpen = await panelInfo(page);
  check(`${label} - la liste ouverte d'un document sans format dit « ${noneOpen.empty} » et propose « ${noneOpen.search} »`, noneOpen.open && noneOpen.empty === 'Aucun format enregistré.' && noneOpen.search === 'Chercher un format…' && noneOpen.inView && noneOpen.rows.length === 0, noneOpen);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const afterEsc = await winState(page);
  check(`${label} - Échap referme la liste seule : la fenêtre reste ouverte, le focus est revenu sur le champ de la liste (${await focusName(page)})`, afterEsc.open && (await focusName(page)) === 'liste' && !(await panelInfo(page)).open, afterEsc);
  const writesAfter = await page.evaluate(TABLE => ({ created: window.__gristStub.countActions('AddTable', TABLE), tables: window.__gristStub.state.tables.indexOf(TABLE) }), TABLE);
  check(`${label} - ouvrir la fenêtre et sa liste n'a ni créé ni écrit la table des formats`, JSON.stringify(writesBefore) === JSON.stringify(writesAfter) && writesAfter.created === 0 && writesAfter.tables === -1, { writesBefore, writesAfter });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check(`${label} - Échap sur la fenêtre la ferme, la page reste en A4`, !(await winState(page).catch(() => ({ open: false }))).open && (await page.evaluate(() => PageLayout.getFormat())) === 'A4', null);
  await away(page);

  // 2) Des formats enregistrés par l'équipe : la liste, sa mise en page et ses mesures.
  await seedFormats(page, [['Étiquette 70 × 37', 70, 37], ['Carte de visite 85 × 55', 85, 55], ['Flyer', 100, 210]]);
  await openWindowByMouse(page);
  const g = await geometry(page);
  const s0 = await winState(page);
  const fit0 = await winFits(page);
  const nameCut = await page.evaluate(() => { const n = document.querySelector('#pp-pagesize-modal .pp-pagesize-saved .ss-name'); return n.scrollWidth > n.clientWidth + 1; });
  check(`${label} - fenêtre : « Format » en tête, l'invite « ${s0.shown} » tient en entier dans le champ fermé, aucun défilement (${fit0.scrollH}/${fit0.clientH}), hauteur ${fit0.h}px dans ${HEIGHT}`,
    s0.open && s0.shown === '— Choisir un format —' && !nameCut && fit0.ok && fit0.h <= 330, { s0, nameCut, fit0 });
  check(`${label} - mesures : liste, corbeille et champs ont 30px de haut, la corbeille est collée à la liste (écart ${(g.trash.left - g.trigger.right).toFixed(1)}px) sans toucher l'aperçu, la liste commence là où les champs commencent (${g.trigger.left.toFixed(1)} / ${g.width.left.toFixed(1)})`,
    within(g.trigger.h, 30, .6) && within(g.trash.h, 30, .6) && within(g.width.h, 30, .6) && within(g.trash.w, 30, .6) && within(g.trash.top, g.trigger.top, .6) && within(g.trash.left - g.trigger.right, 6, 1.2)
      && g.trash.right <= g.preview.left - 6 && within(g.trigger.left, g.width.left, 1.2), g);
  check(`${label} - mesures : chaque libellé est centré sur sa ligne (Format ${g.labels[0].cy.toFixed(1)}/${g.trigger.cy.toFixed(1)}, Largeur ${g.labels[1].cy.toFixed(1)}/${g.width.cy.toFixed(1)}, Hauteur ${g.labels[2].cy.toFixed(1)}/${g.height.cy.toFixed(1)}), alignés à gauche, lignes espacées de 12px`,
    within(g.labels[0].cy, g.trigger.cy, 1.5) && within(g.labels[1].cy, g.width.cy, 1.5) && within(g.labels[2].cy, g.height.cy, 1.5) && within(g.labels[0].left, g.labels[1].left, .6) && within(g.labels[1].left, g.labels[2].left, .6)
      && within(g.width.top - g.trigger.bottom, 12, 1.2) && within(g.height.top - g.width.bottom, 12, 1.2), g);
  check(`${label} - mesures : « Enregistrer ce format… » à gauche de la rangée de boutons, « Annuler » et « Valider » à droite, sans se toucher`,
    g.save.left < g.cancel.left - 30 && g.cancel.right < g.ok.left && g.save.right < g.cancel.left && within(g.save.top, g.ok.top, .6), g);
  const cPlaceholder = await ratioOf(page, `${LIST} .ss-value`, 'color');
  const cLabel = await ratioOf(page, `${WIN} .pp-pagesize-label`, 'color');
  const cSave = await ratioOf(page, SAVE, 'color');
  check(`${label} - contrastes : invite de la liste ${cPlaceholder}:1, libellé ${cLabel}:1, « Enregistrer ce format… » ${cSave}:1 (au moins 4,5:1)`, cPlaceholder >= 4.5 && cLabel >= 4.5 && cSave >= 4.5, { cPlaceholder, cLabel, cSave });
  const cTrash = await ratioOf(page, `${WIN} .pp-pagesize-remove svg`, 'color');
  // La corbeille, active : on la verra plus bas ; grisée ici, elle reste lisible comme une icône désactivée (opacité .55).
  await page.screenshot({ path: SHOTS + '/fenetre-' + theme + '.png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });

  // 3) La liste à la vraie souris : au-dessus de la fenêtre, dans le panneau, triée, la taille en indice.
  await realClick(page, LIST);
  await page.waitForTimeout(250);
  const open1 = await panelInfo(page);
  check(`${label} - liste ouverte : le panneau est dans le panneau Grist (${Math.round(open1.left)}-${Math.round(open1.right)} x ${Math.round(open1.top)}-${Math.round(open1.bottom)}), au-dessus de la fenêtre, lignes triées « ${open1.rows.join(' / ')} » avec leur taille « ${open1.hints.join(' ')} »`,
    open1.open && open1.inView && open1.firstVisibleOnTop && open1.rows.join('|') === 'Carte de visite 85 × 55|Étiquette 70 × 37|Flyer' && open1.hints.join('|') === '(8,5 × 5,5 cm)|(7 × 3,7 cm)|(10 × 21 cm)' && !open1.horizontalOverflow, open1);
  await page.screenshot({ path: SHOTS + '/liste-' + theme + '.png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  const rb = await rowBox(page, 'Étiquette 70 × 37');
  await page.mouse.move(rb.x, rb.y, { steps: 4 });
  await page.mouse.click(rb.x, rb.y);
  await page.waitForTimeout(250);
  const chosen = await winState(page);
  const chosenFit = await winFits(page);
  const stillA4 = await page.evaluate(() => ({ format: PageLayout.getFormat(), landscape: PageLayout.isLandscape() }));
  check(`${label} - un vrai clic sur « Étiquette 70 × 37 » remplit les champs (${chosen.width} x ${chosen.height}), l'aperçu (« ${chosen.caption} », ${chosen.orientation}), le champ fermé ne montre que le nom (« ${chosen.shown} »), la corbeille s'active`,
    chosen.width === '7' && chosen.height === '3,7' && chosen.caption === '7 × 3,7 cm' && chosen.orientation === 'Paysage' && chosen.shown === 'Étiquette 70 × 37' && chosen.hintShown === '' && !chosen.placeholder && !chosen.trashDisabled && !chosen.okDisabled && chosenFit.ok, { chosen, chosenFit });
  check(`${label} - la page n'a pas bougé avant « Valider » (${stillA4.format}, paysage ${stillA4.landscape}) et le focus est revenu sur la liste (${await focusName(page)})`, stillA4.format === 'A4' && !stillA4.landscape && (await focusName(page)) === 'liste', stillA4);
  const cTrashOn = await ratioOf(page, `${WIN} .pp-pagesize-remove`, 'color');
  check(`${label} - corbeille active : icône à ${cTrashOn}:1 (au moins 4,5:1), nommée « ${chosen.trashTitle} »`, cTrashOn >= 4.5 && chosen.trashTitle === 'Supprimer le format enregistré', { cTrashOn, title: chosen.trashTitle });
  await page.screenshot({ path: SHOTS + '/choisi-' + theme + '.png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });

  // 4) Le clavier : l'ordre de Tab, puis la liste au clavier (flèche, recherche, Entrée).
  const order = [await focusName(page)];
  for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); order.push(await focusName(page)); }
  check(`${label} - Tab parcourt la fenêtre dans l'ordre de la page et boucle (${order.join(' > ')})`, order.join() === 'liste,corbeille,largeur,hauteur,enregistrer,fenêtre:Annuler,valider,liste', order);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  const kb1 = await panelInfo(page);
  await page.keyboard.type('fly');
  await page.waitForTimeout(150);
  const kb2 = await panelInfo(page);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const kb3 = await winState(page);
  check(`${label} - au clavier : ↓ ouvre la liste (${kb1.rows.length} lignes), « fly » ne laisse que « ${kb2.rows.join()} », Entrée la choisit (${kb3.width} x ${kb3.height}, ${kb3.orientation}), le focus reste sur la liste (${await focusName(page)})`,
    kb1.open && kb1.rows.length === 3 && kb2.rows.join() === 'Flyer' && kb3.width === '10' && kb3.height === '21' && kb3.orientation === 'Portrait' && kb3.shown === 'Flyer' && (await focusName(page)) === 'liste', { kb1, kb2, kb3 });
  await realClick(page, LIST);
  await page.waitForTimeout(200);
  await page.keyboard.type('zzz');
  await page.waitForTimeout(150);
  const none = await panelInfo(page);
  check(`${label} - une recherche sans résultat dit « ${none.empty} »`, none.open && none.empty === 'Aucun format ne correspond.' && none.rows.length === 0, none);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 5) Retoucher un champ après le choix remet la liste à son invite (le format n'est plus celui qu'on voit).
  await typeInField(page, '#pp-pagesize-height', '22');
  const edited = await winState(page);
  check(`${label} - une fois « Flyer » choisi, taper 22 dans la hauteur remet la liste à « ${edited.shown} » et grise la corbeille (taille ${edited.caption})`, edited.shown === '— Choisir un format —' && edited.placeholder && edited.trashDisabled && edited.caption === '10 × 22 cm', edited);

  // 6) « Enregistrer ce format… » à la vraie souris : la saisie du nom s'ouvre par-dessus, la taille en proposition, Entrée enregistre, la fenêtre ne bouge pas.
  await typeInField(page, '#pp-pagesize-width', '5');
  await typeInField(page, '#pp-pagesize-height', '8');
  const geomBefore = await geometry(page);
  await realClick(page, SAVE);
  await page.waitForTimeout(300);
  const ask = await dlgInfo(page);
  check(`${label} - « Enregistrer ce format… » ouvre « ${ask.title} » par-dessus la fenêtre, au premier plan, la taille en proposition (« ${ask.value} », sélectionnée), le focus dans le champ`,
    ask.open && ask.title === 'Enregistrer ce format' && ask.label === 'Nom du format' && ask.value === '5 × 8 cm' && ask.selected && ask.selected[0] === 0 && ask.selected[1] === ask.value.length && ask.focusOnInput && ask.onTop && ask.inView && !ask.overflow && ask.ok === 'Enregistrer', ask);
  await page.screenshot({ path: SHOTS + '/saisie-' + theme + '.png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  await page.mouse.click(8, 8);
  await page.waitForTimeout(150);
  check(`${label} - un clic sur le voile ne ferme pas la saisie du nom`, (await dlgInfo(page)).open, null);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const afterEscAsk = { dlg: await dlgInfo(page), win: await winState(page), rows: await tableRows(page), focus: await focusName(page) };
  check(`${label} - Échap sur la saisie du nom la ferme seule : la fenêtre reste ouverte (${afterEscAsk.win.width} x ${afterEscAsk.win.height}), rien n'est écrit (${afterEscAsk.rows.length} lignes), le focus revient sur « Enregistrer ce format… » (${afterEscAsk.focus})`,
    !afterEscAsk.dlg.open && afterEscAsk.win.open && afterEscAsk.rows.length === 3 && afterEscAsk.focus === 'enregistrer', afterEscAsk);
  await realClick(page, SAVE);
  await page.waitForTimeout(250);
  await page.keyboard.type('Carte postale');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const saved = await winState(page);
  const savedRows = await tableRows(page);
  const geomAfter = await geometry(page);
  check(`${label} - Entrée enregistre « Carte postale » (50 x 80 mm) : ${savedRows.length} lignes dans le document, la liste la montre choisie (« ${saved.shown} »), la corbeille est active, l'état est dit (« ${saved.status} »)`,
    savedRows.length === 4 && savedRows[3] === 'Carte postale 50x80' && saved.shown === 'Carte postale' && !saved.placeholder && !saved.trashDisabled && saved.status === 'Format « Carte postale » enregistré.' && saved.open, { savedRows, saved });
  check(`${label} - l'enregistrement ne déplace rien : même cadre (${Math.round(geomAfter.box.left)}, ${Math.round(geomAfter.box.top)}, ${Math.round(geomAfter.box.w)} x ${Math.round(geomAfter.box.h)}), même liste, même corbeille ; le focus est sur « Enregistrer ce format… » (${await focusName(page)})`,
    JSON.stringify(geomBefore.box) === JSON.stringify(geomAfter.box) && JSON.stringify(geomBefore.trigger) === JSON.stringify(geomAfter.trigger) && JSON.stringify(geomBefore.trash) === JSON.stringify(geomAfter.trash) && (await focusName(page)) === 'enregistrer', { before: geomBefore.box, after: geomAfter.box });
  // Même nom, casse et espaces ignorés : « (2) ».
  await realClick(page, SAVE);
  await page.waitForTimeout(250);
  await page.keyboard.type('  carte   POSTALE ');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const dup = await winState(page);
  check(`${label} - le même nom retapé (casse et espaces ignorés) devient « ${dup.shown} »`, dup.shown === 'carte POSTALE (2)' && (await tableRows(page)).length === 5, { dup, rows: await tableRows(page) });

  // 7) La corbeille à la vraie souris : confirmation par-dessus (focus sur « Annuler »), « Annuler » ne retire rien, « Supprimer » retire la ligne et rend le focus à la liste.
  await realClick(page, TRASH);
  await page.waitForTimeout(300);
  const conf = await dlgInfo(page);
  check(`${label} - la corbeille demande « ${conf.title} » : message avec le nom et la taille, au premier plan, focus sur « ${conf.focusText} » (un Entrée distrait ne supprime rien)`,
    conf.open && conf.title === 'Supprimer ce format ?' && conf.message === 'Le format « carte POSTALE (2) » (5 × 8 cm) sera retiré de la liste. Les modèles qui l’utilisent gardent leur taille.' && conf.focusText === 'Annuler' && conf.onTop && conf.inView && !conf.overflow && conf.ok === 'Supprimer', conf);
  await page.screenshot({ path: SHOTS + '/confirmation-' + theme + '.png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check(`${label} - Entrée sur « Annuler » ne supprime rien (${(await tableRows(page)).length} lignes), la confirmation se ferme`, !(await dlgInfo(page)).open && (await tableRows(page)).length === 5 && (await winState(page)).open, null);
  await realClick(page, TRASH);
  await page.waitForTimeout(300);
  const okBox = await boxOf(page, DLG + ' .var-modal-primary');
  await page.mouse.move(okBox.x - 6, okBox.y, { steps: 2 });
  await page.mouse.click(okBox.x, okBox.y);
  await page.waitForTimeout(500);
  const gone = await winState(page);
  const goneRows = await tableRows(page);
  const geomGone = await geometry(page);
  check(`${label} - « Supprimer » retire « carte POSTALE (2) » (${goneRows.length} lignes), la liste revient à « ${gone.shown} », la corbeille se grise, l'état est dit (« ${gone.status} »), le focus est sur la liste (${await focusName(page)}), le cadre n'a pas bougé`,
    goneRows.length === 4 && !goneRows.some(r => r.startsWith('carte POSTALE')) && gone.placeholder && gone.trashDisabled && gone.status === 'Format « carte POSTALE (2) » supprimé.' && (await focusName(page)) === 'liste' && JSON.stringify(geomGone.box) === JSON.stringify(geomBefore.box), { goneRows, gone });

  // 8) « Valider » avec un format choisi : la page prend la taille, le modèle l'enregistre (clé `format`), la liste est remise à l'invite à la réouverture.
  await chooseByMouse(page, 'Étiquette 70 × 37');
  const writes0 = (await stored(page)).writes;
  await realClick(page, OK_BUTTON);
  await page.waitForTimeout(800);
  const applied = await page.evaluate(() => ({ format: PageLayout.getFormat(), landscape: PageLayout.isLandscape(), size: PageLayout.getPageSizeMm(), open: getComputedStyle(document.getElementById('pp-pagesize-modal')).display !== 'none' }));
  check(`${label} - « Valider » pose la page choisie dans la liste : ${applied.format}, paysage ${applied.landscape}, ${applied.size.width} x ${applied.size.height} mm, fenêtre fermée`,
    !applied.open && applied.format === '37x70' && applied.landscape && applied.size.width === 70 && applied.size.height === 37, applied);
  await away(page);
  await page.waitForTimeout(4200);
  const savedTpl = await stored(page);
  check(`${label} - le modèle enregistre cette taille en une écriture (clé format « 37x70 » : ${/"format":"37x70"/.test(savedTpl.margins)}, écritures ${savedTpl.writes - writes0})`, /"format":"37x70"/.test(savedTpl.margins) && savedTpl.writes - writes0 === 1, savedTpl);
  await openWindowByMouse(page);
  const reopened = await winState(page);
  check(`${label} - rouverte, la fenêtre montre la page du modèle (${reopened.width} x ${reopened.height}) et la liste à l'invite : le modèle garde la taille, pas le nom du format`,
    reopened.width === '7' && reopened.height === '3,7' && reopened.placeholder && reopened.trashDisabled, reopened);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await away(page);

  // 9) Beaucoup de formats et des noms longs : la liste défile et se recherche, le champ fermé coupe par « … », rien ne sort de la fenêtre.
  const many = Array.from({ length: 40 }, (_, i) => ['Format de série ' + (i + 1), 50 + i, 80 + i]);
  // Un nom écrit à la main dans Grist, plus long que ce que le widget garde (120 caractères, SavedPageFormats.MAX_NAME_LENGTH) : la liste le montre coupé à 120.
  const rawLong = 'Étiquette adhésive pour colis, grand modèle avec une très très longue description de plus de cent caractères au total, pour bien voir comment la liste et la confirmation le tiennent';
  const longName = rawLong.slice(0, 120);
  if (longName !== longName.trim() || rawLong.length <= 120) throw new Error('le nom long du test doit dépasser 120 caractères sans finir sur une espace');
  await seedFormats(page, many.concat([[rawLong, 120, 60]]));
  await openWindowByMouse(page);
  const gBefore = await geometry(page);
  await realClick(page, LIST);
  await page.waitForTimeout(250);
  const big = await panelInfo(page);
  check(`${label} - ${big.rows.length} formats : le panneau de la liste (${Math.round(big.h)}px) reste dans le panneau Grist, défile (${big.scrolls}) et ne déborde pas sur les côtés`, big.open && big.rows.length === 45 && big.inView && big.scrolls && !big.horizontalOverflow && big.firstVisibleOnTop, big);
  await page.keyboard.type('SERIE 40');
  await page.waitForTimeout(200);
  const filtered = await panelInfo(page);
  check(`${label} - « SERIE 40 » (sans accent, ni casse) retrouve « ${filtered.rows.join(' / ')} » parmi ${big.rows.length} formats`, filtered.rows.join('|') === 'Format de série 40' && filtered.open && !filtered.scrolls, filtered);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('8,5 × 5,5');
  await page.waitForTimeout(200);
  const bySize = await panelInfo(page);
  check(`${label} - la recherche porte aussi sur la taille, dans n'importe quel ordre : « 8,5 × 5,5 » retrouve « ${bySize.rows.join(' / ')} » (leurs tailles : ${bySize.hints.join(' et ')})`, bySize.rows.join('|') === 'Carte de visite 85 × 55|Format de série 6', bySize);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await chooseByMouse(page, longName, 'adhesive');
  const longState = await winState(page);
  const gLong = await geometry(page);
  const longFit = await winFits(page);
  const longClip = await page.evaluate(() => { const n = document.querySelector('#pp-pagesize-modal .pp-pagesize-saved .ss-value'); return { cut: n.scrollWidth > n.clientWidth, ellipsis: getComputedStyle(n).textOverflow }; });
  check(`${label} - un nom de ${rawLong.length} caractères (montré à ${longName.length}) se coupe par « … » dans le champ fermé (${longClip.ellipsis}) sans l'agrandir (${Math.round(gLong.trigger.w)}px comme ${Math.round(gBefore.trigger.w)}px) ni sortir de la fenêtre`,
    longClip.cut && longClip.ellipsis === 'ellipsis' && within(gLong.trigger.w, gBefore.trigger.w, .6) && within(gLong.box.w, gBefore.box.w, .6) && longFit.ok && longState.width === '12' && longState.height === '6', { longClip, gLong: gLong.trigger, gBefore: gBefore.trigger, longFit });
  await realClick(page, TRASH);
  await page.waitForTimeout(300);
  const longConf = await dlgInfo(page);
  check(`${label} - la confirmation d'un nom très long reste dans le panneau (${longConf.w}x${longConf.h}px), sans défiler ni déborder`, longConf.open && longConf.inView && !longConf.overflow && longConf.onTop, longConf);
  await page.screenshot({ path: SHOTS + '/long-' + theme + '.png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await away(page);

  // 10) L'anglais : textes de la fenêtre, de la liste, de la saisie et de la confirmation ; tout tient encore.
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(300);
  await openWindowByMouse(page);
  const en = await winState(page);
  const enFit = await winFits(page);
  check(`${label} - anglais : « ${en.labels.join(' / ')} », liste « ${en.shown} », bouton « ${en.saveText} », corbeille « ${en.trashTitle} », dimensions au point (${en.width} x ${en.height}), tout tient (${enFit.scrollH}/${enFit.clientH})`,
    en.labels.join() === 'Format,Width,Height' && en.shown === '— Choose a format —' && en.saveText === 'Save this format…' && en.trashTitle === 'Delete the saved format' && en.width === '7' && en.height === '3.7' && enFit.ok, { en, enFit });
  await realClick(page, LIST);
  await page.waitForTimeout(200);
  const enOpen = await panelInfo(page);
  check(`${label} - anglais : la liste propose « ${enOpen.search} » et dit les tailles au point (« ${enOpen.hints[0]} »)`, enOpen.search === 'Search formats…' && /^\(\d+(\.\d+)? × \d+(\.\d+)? cm\)$/.test(enOpen.hints[0]), enOpen);
  await page.keyboard.type('zzz');
  await page.waitForTimeout(150);
  check(`${label} - anglais : sans résultat, « ${(await panelInfo(page)).empty} »`, (await panelInfo(page)).empty === 'No format matches.', await panelInfo(page));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await realClick(page, SAVE);
  await page.waitForTimeout(250);
  const enAsk = await dlgInfo(page);
  check(`${label} - anglais : la saisie du nom dit « ${enAsk.title} » / « ${enAsk.label} », propose « ${enAsk.value} » et « ${enAsk.ok} »`, enAsk.title === 'Save this format' && enAsk.label === 'Format name' && enAsk.value === '7 × 3.7 cm' && enAsk.ok === 'Save' && enAsk.cancel === 'Cancel', enAsk);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await chooseByMouse(page, 'Flyer');
  await realClick(page, TRASH);
  await page.waitForTimeout(300);
  const enConf = await dlgInfo(page);
  check(`${label} - anglais : la confirmation dit « ${enConf.title} » et « ${enConf.message} »`, enConf.title === 'Delete this format?' && enConf.message === 'The format “Flyer” (10 × 21 cm) will be removed from the list. Templates that use it keep their size.' && enConf.ok === 'Delete', enConf);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(300);
  check(`${label} - aucune boîte native (alert, confirm, prompt) n'a été ouverte`, nativeDialogs.length === 0, nativeDialogs);
  await context.close();
}

await runTheme('light');
await runTheme('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
