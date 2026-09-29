#!/usr/bin/env node
// Listes de colonnes avec recherche (js/search-select.js) dans les fenêtres qui proposent un choix de colonne, à la VRAIE souris et au vrai clavier
// (page.mouse / page.keyboard, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400) : les scénarios de dev-tests/scenarios-column-search.js
// tournent DANS la page (dispatchEvent), ils ne prouvent ni qu'un vrai clic atteint le champ, ni que le panneau de la liste tient dans un panneau bas sans
// être rogné ni recouvert, ni que la molette fait défiler la liste et non la page. Sections lançables seules : node dev-tests/verify-column-search-mouse.mjs condition
// Écrans : fenêtre de condition, filtre et « Trier par » de la boucle, règles et listes de modèles des macro-modèles (et la règle sur deux lignes, section ruleRows, en
// clair et en sombre), Réglages > Accès (la table et les colonnes), menu « Image depuis une variable » de la barre.
// Lancé par run-headless.mjs (groupe Node "columnSearchMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-column-search-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.COLUMN_SEARCH_MOUSE_PORT || 8898);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-wheel-scroll.mjs.
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-column-search-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
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


// Jeu de données : la page est sur CsDossiers ; CsAnnuaire liée par Responsable ; CsContacts et CsFactures pas encore liées ; CsLignes liée par Facture
// (plusieurs lignes par facture : la fenêtre Boucle s'ouvre sur ses variables) ; CsLarge, 40 colonnes, pour une liste qui défile. Rejoué après un
// rechargement de la page (section withoutComponent).
async function seedData() {
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('CsAnnuaire', { NomPrenom: 'Text', Telephone: 'Text', Naissance: 'Date' });
  stub.setVariables('CsDossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:CsAnnuaire', Montant: 'Numeric', Echeance: 'Date', Actif: 'Bool' });
  stub.setVariables('CsContacts', { Dossier: 'Ref:CsDossiers', Role: 'Text', Nom: 'Text' });
  stub.setVariables('CsFactures', { Numero: 'Text', Client: 'Text' });
  stub.setVariables('CsLignes', { Facture: 'Ref:CsFactures', Designation: 'Text', Qte: 'Numeric', Montant: 'Numeric', Presence: 'Choice' }, { Presence: ['Présent', 'Absent'] });
  const many = {};
  for (let i = 1; i <= 40; i++) many['Champ' + (i < 10 ? '0' + i : i)] = 'Text';
  stub.setVariables('CsLarge', many);
  stub.setRows('CsAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44', Naissance: 631152000 }]);
  stub.setRows('CsDossiers', [{ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7, Montant: 1200, Echeance: 631152000, Actif: true }]);
  stub.setRows('CsContacts', [{ id: 1, Dossier: 1, Role: 'Client', Nom: 'Xavier' }]);
  stub.setRows('CsFactures', [{ id: 1, Numero: 'F-1', Client: 'Atelier Durand' }]);
  stub.setRows('CsLignes', [{ id: 1, Facture: 1, Designation: 'Audit', Qte: 1, Montant: 800, Presence: 'Présent' }, { id: 2, Facture: 1, Designation: 'Suivi', Qte: 2, Montant: 90, Presence: 'Absent' }]);
  await GristAPI.refreshSchema();
  await GristAPI.saveLinkRule('CsAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
  await GristAPI.saveLinkRule('CsLignes', { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
  stub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200, Echeance: 631152000, Actif: true }, 'CsDossiers');
  const badge = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;
  Editor.setHTML(`<p>Objet : ${badge('CsDossiers', 'Titre')}</p><p>Lignes : ${badge('CsLignes', 'Designation')}.</p>`);
});
await page.waitForTimeout(300);
}
await seedData();

// Centre d'un élément et ce qui s'y trouve réellement au premier plan (un champ recouvert par autre chose ne recevrait pas le clic).
async function hitTest(selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width,
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}
// Fait défiler la fenêtre (molette réelle, la souris posée sur elle) jusqu'à ce que l'élément soit entièrement dans le panneau ET au premier plan (la barre
// Annuler / Enregistrer, collée en bas de la fenêtre, en recouvre le bas tant qu'on n'a pas défilé) : une fenêtre plus haute que 400 px défile, comme pour
// la personne qui l'utilise.
async function reveal(selector, scrollOver) {
  for (let i = 0; i < 8; i++) {
    const box = await hitTest(selector);
    if (box.found && box.inViewport && box.onTop) return box;
    const over = await hitTest(scrollOver);
    await page.mouse.move(over.x, over.y);
    await page.mouse.wheel(0, box.found && box.top < 0 ? -120 : 120);
    await page.waitForTimeout(80);
  }
  return hitTest(selector);
}
async function clickCenter(selector) {
  const box = await hitTest(selector);
  if (box.found) await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(150);
  return box;
}
async function clickBadge(column) {
  const box = await hitTest(`.tiptap .var-badge[data-column="${column}"]`);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(250);
}
async function openWindowFor(column, action, modalSelector) {
  await clickBadge(column);
  await clickCenter(`.v2-varfmt-toolbar.visible button[data-action="${action}"]`);
  await page.waitForTimeout(250);
  return hitTest(modalSelector + ' .var-modal-content');
}
const windowState = modalSelector => page.evaluate(sel => ({
  open: document.querySelector(sel).style.display !== 'none',
  boxTop: document.querySelector(sel + ' .modal-content').getBoundingClientRect().top,
  // Ce qui défile dans la fenêtre : la zone de contenu de la base commune (js/modal-base.js), sinon le cadre lui-même (fenêtres écrites dans index.html).
  boxScroll: (document.querySelector(sel + ' .pp-modal-body') || document.querySelector(sel + ' .modal-content')).scrollTop,
  docTop: document.scrollingElement.scrollTop,
}), modalSelector);
// Ce que montre le panneau ouvert d'une liste : ses lignes, ses intitulés, son cadre, et si la zone de recherche a le focus.
const panelInfo = scope => page.evaluate(sel => {
  const panel = document.querySelector(sel + ' .ss-panel:not([hidden])');
  if (!panel) return null;
  const r = panel.getBoundingClientRect();
  const list = panel.querySelector('.ss-list');
  const name = row => row.querySelector('.ss-name').textContent + (row.querySelector('.ss-hint') ? ' ' + row.querySelector('.ss-hint').textContent : '');
  return {
    rows: Array.from(panel.querySelectorAll('.ss-option')).map(name), heads: Array.from(panel.querySelectorAll('.ss-group')).map(n => n.textContent),
    inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
    searchFocused: document.activeElement === panel.querySelector('.ss-input'), scrollable: list.scrollHeight > list.clientHeight, listScroll: list.scrollTop,
    emptyShown: !panel.querySelector('.ss-empty').hidden,
  };
}, scope);
async function rowCenter(scope, text) {
  return page.evaluate(({ scope, text }) => {
    const found = Array.from(document.querySelectorAll(scope + ' .ss-panel:not([hidden]) .ss-option')).find(r => r.querySelector('.ss-name').textContent === text);
    if (!found) return null;
    const r = found.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: !!top && found.contains(top), inViewport: r.top >= 0 && r.bottom <= innerHeight };
  }, { scope, text });
}
// Les contrôles de la première règle d'une fenêtre (« Si », colonne, opérateur, valeur ; pour un macro-modèle aussi la flèche, le modèle et la croix) : leur
// rectangle et ce qui se trouve au premier plan en leur centre, pour dire sur combien de lignes la règle tient et si un contrôle en recouvre un autre.
const ruleBoxes = (scope, index = 0) => page.evaluate(({ sel, index }) => {
  const row = document.querySelectorAll(sel + ' .macro-rule-row')[index];
  if (!row) return null;
  const visibleField = selector => { const s = row.querySelector(selector); const w = s && s.nextElementSibling; return w && w.classList.contains('ss-wrap') ? w.querySelector('.ss-trigger') : s; };
  const parts = {
    connector: row.querySelector('.macro-rule-connector'),
    column: visibleField('select.macro-rule-column'),
    operator: Array.from(row.querySelectorAll('select')).find(s => !s.matches('.macro-rule-column, .macro-rule-modele, .macro-rule-value')),
    value: row.querySelector('.macro-rule-value-slot'),
    arrow: row.querySelector('.macro-rule-arrow'),
    model: visibleField('select.macro-rule-modele'),
    remove: row.querySelector('.macro-rule-remove'),
  };
  const boxes = {};
  for (const [name, el] of Object.entries(parts)) {
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    boxes[name] = { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, onTop: !!top && (top === el || el.contains(top)) };
  }
  const rr = row.getBoundingClientRect();
  return { boxes, row: { l: rr.left, r: rr.right, t: rr.top, b: rr.bottom }, twoLines: !!row.querySelector('.macro-rule-body') };
}, { sel: scope, index });
const overlapping = boxes => {
  const names = Object.keys(boxes), out = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = boxes[names[i]], c = boxes[names[j]];
    if (Math.min(a.r, c.r) - Math.max(a.l, c.l) > 0.5 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 0.5) out.push(names[i] + '/' + names[j]);
  }
  return out;
};
const sameLine = (...boxes) => boxes.every(b => Math.abs(b.cy - boxes[0].cy) <= 3);
const insidePanel = boxes => Object.values(boxes).every(b => b.l >= 0 && b.t >= 0 && b.r <= WIDTH + 0.5 && b.b <= HEIGHT + 0.5);
const cond = '#var-condition-modal';

const SECTIONS = {
  // Fenêtre « Condition d'affichage » : la capture d'Antoine du 2026-09-29, avec les colonnes de toutes les tables (intitulés de groupe).
  async condition() {
    const win = await openWindowFor('Titre', 'var-condition', cond);
    check('condition : fenêtre ouverte et entièrement dans le panneau', win.found && win.inViewport, win);
    const field = await hitTest(cond + ' .macro-rule-column-wrap .ss-trigger');
    const native = await hitTest(cond + ' select.macro-rule-column');
    check('condition : le champ de la colonne est visible, au premier plan, et le <select> natif est masqué', field.found && field.inViewport && field.onTop && field.width > 80 && native.width === 0, { field, native });
    const before = await windowState(cond);
    await page.mouse.click(field.x, field.y);
    await page.waitForTimeout(150);
    const open = await panelInfo(cond);
    check('condition : un vrai clic ouvre la liste, entièrement dans le panneau Grist, la zone de recherche a le focus', !!open && open.inside && open.searchFocused, open);
    check('condition : le choix « rien » en tête, un intitulé par table, la saisie avancée en dernier, le type derrière les colonnes',
      !!open && open.rows[0] === '— Choisir une colonne —' && open.rows[open.rows.length - 1] === 'Autre (colonne d\'une autre table…)' && open.heads.length === 6
      && open.heads[0] === 'CsDossiers (table de la page)' && open.rows.includes('Responsable (référence)') && open.rows.includes('Actif (case à cocher)'), open);
    check('condition : la liste défile (colonnes nombreuses)', !!open && open.scrollable, open);
    const list = await hitTest(cond + ' .ss-panel:not([hidden]) .ss-list');
    await page.mouse.move(list.x, list.y);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);
    const wheeled = await panelInfo(cond);
    const after = await windowState(cond);
    check('condition : molette réelle sur la liste : elle défile, ni la page, ni la fenêtre, ni le panneau ne bougent',
      wheeled.listScroll > 0 && after.docTop === 0 && after.boxScroll === before.boxScroll && after.boxTop === before.boxTop && wheeled.rect.top === open.rect.top, { before, after, wheeled });
    // Frappe réelle : la liste se réduit, l'intitulé des autres tables disparaît, la saisie avancée reste atteignable.
    await page.keyboard.type('ann');
    await page.waitForTimeout(100);
    const typed = await panelInfo(cond);
    const pinned = await rowCenter(cond, 'Autre (colonne d\'une autre table…)');
    check('condition : « ann » réduit la liste à la table CsAnnuaire (un seul intitulé), la saisie avancée reste visible et au premier plan',
      !!typed && typed.heads.length === 1 && typed.rows.slice(0, -1).every(r => r.indexOf('CsAnnuaire.') === 0) && !!pinned && pinned.onTop && pinned.inViewport, { typed, pinned });
    await page.keyboard.type('zzz');
    await page.waitForTimeout(100);
    const none = await panelInfo(cond);
    check('condition : sans résultat, le message s’affiche et la saisie avancée reste seule dans la liste', !!none && none.emptyShown && none.rows.length === 1 && none.heads.length === 0, none);
    // Saisie avancée : vrai clic, le champ libre apparaît avec le focus, la frappe réelle s'y fait.
    const adv = await rowCenter(cond, 'Autre (colonne d\'une autre table…)');
    if (adv) await page.mouse.click(adv.x, adv.y);
    await page.waitForTimeout(150);
    await page.keyboard.type('CsInconnue.Colonne');
    const free = await page.evaluate(() => {
      const input = document.querySelector('#var-condition-modal .macro-rule-column-advanced');
      const trigger = document.querySelector('#var-condition-modal .macro-rule-column-wrap .ss-trigger');
      return { hidden: input.hidden, focused: document.activeElement === input, value: input.value, shown: trigger.textContent };
    });
    check('condition : la saisie avancée montre le champ libre (focus), et la frappe s’y fait', !free.hidden && free.focused && free.value === 'CsInconnue.Colonne' && free.shown === 'Autre (colonne d\'une autre table…)', free);
    // Retour à une vraie colonne, à la souris.
    await clickCenter(cond + ' .macro-rule-column-wrap .ss-trigger');
    await page.keyboard.type('stat');
    await page.waitForTimeout(100);
    const status = await rowCenter(cond, 'Statut');
    check('condition : « stat » propose Statut, visible et non recouvert', !!status && status.onTop && status.inViewport, status);
    if (status) await page.mouse.click(status.x, status.y);
    await page.waitForTimeout(150);
    const chosen = await page.evaluate(() => ({
      value: document.querySelector('#var-condition-modal select.macro-rule-column').value,
      shown: document.querySelector('#var-condition-modal .macro-rule-column-wrap .ss-trigger').textContent,
      freeHidden: document.querySelector('#var-condition-modal .macro-rule-column-advanced').hidden,
      listOpen: !!document.querySelector('#var-condition-modal .ss-panel:not([hidden])'),
      windowOpen: document.getElementById('var-condition-modal').style.display !== 'none',
    }));
    check('condition : le clic sur le résultat choisit Statut, ferme la liste, cache le champ libre, la fenêtre reste ouverte',
      chosen.value === 'Statut' && chosen.shown === 'Statut' && chosen.freeHidden && !chosen.listOpen && chosen.windowOpen, chosen);
    // Échap referme la liste seule ; un clic à côté referme sans rien choisir ; Tab passe au champ suivant.
    await clickCenter(cond + ' .macro-rule-column-wrap .ss-trigger');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const esc = await page.evaluate(() => ({
      listOpen: !!document.querySelector('#var-condition-modal .ss-panel:not([hidden])'),
      windowOpen: document.getElementById('var-condition-modal').style.display !== 'none',
      focusOnField: document.activeElement === document.querySelector('#var-condition-modal .macro-rule-column-wrap .ss-trigger'),
    }));
    check('condition : Échap referme la liste seule, la fenêtre reste ouverte et le champ reprend le focus', !esc.listOpen && esc.windowOpen && esc.focusOnField, esc);
    await clickCenter(cond + ' .macro-rule-column-wrap .ss-trigger');
    await page.keyboard.type('mont');
    await clickCenter(cond + ' h3');
    const outside = await page.evaluate(() => ({
      listOpen: !!document.querySelector('#var-condition-modal .ss-panel:not([hidden])'),
      value: document.querySelector('#var-condition-modal select.macro-rule-column').value,
    }));
    check('condition : un clic à côté referme la liste sans rien choisir', !outside.listOpen && outside.value === 'Statut', outside);
    await clickCenter(cond + ' .macro-rule-column-wrap .ss-trigger');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    const tabbed = await page.evaluate(() => { const a = document.activeElement; return { tag: a.tagName, inRow: !!a.closest('.macro-rule-row'), isField: a.classList.contains('ss-trigger') }; });
    check('condition : Tab quitte le champ pour le suivant de la ligne (l’opérateur), sans piège de focus', tabbed.tag === 'SELECT' && tabbed.inRow && !tabbed.isField, tabbed);
    const save = await hitTest(cond + ' .var-modal-primary');
    check('condition : Enregistrer visible et non recouvert après tout cela', save.found && save.inViewport && save.onTop, save);
    const cancel = await hitTest(cond + ' .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
    if (cancel.found) await page.mouse.click(cancel.x, cancel.y);
    await page.waitForTimeout(200);
  },

  // Filtre d'une boucle : les colonnes de la table parcourue, sans intitulés de groupe.
  async loop() {
    const scope = '#var-loop-modal';
    const win = await openWindowFor('Designation', 'var-loop', scope);
    check('boucle : fenêtre ouverte et entièrement dans le panneau', win.found && win.inViewport, win);
    await reveal(scope + ' .var-loop-filter .var-condition-add', scope + ' .modal-content');
    await clickCenter(scope + ' .var-loop-filter .var-condition-add');
    const focused = await page.evaluate(() => document.activeElement === document.querySelector('#var-loop-modal .var-loop-filter .macro-rule-column-wrap .ss-trigger'));
    check('boucle : « + Ajouter une condition » (vrai clic) donne le focus au champ visible de la nouvelle règle', focused);
    const field = await reveal(scope + ' .var-loop-filter .macro-rule-column-wrap .ss-trigger', scope + ' .modal-content');
    check('boucle : le champ de la colonne est visible, dans le panneau et au premier plan', field.found && field.inViewport && field.onTop, field);
    await page.mouse.click(field.x, field.y);
    await page.waitForTimeout(150);
    const open = await panelInfo(scope);
    check('boucle : la liste s’ouvre dans le panneau Grist, sans intitulé de groupe, avec les colonnes de la table parcourue',
      !!open && open.inside && open.searchFocused && open.heads.length === 0 && open.rows.includes('Presence (choix)') && open.rows.includes('Designation') && !open.rows.some(r => r.indexOf('CsDossiers') !== -1), open);
    await page.keyboard.type('pres');
    await page.waitForTimeout(100);
    const row = await rowCenter(scope, 'Presence');
    check('boucle : « pres » propose Presence, visible et non recouvert', !!row && row.onTop && row.inViewport, row);
    if (row) await page.mouse.click(row.x, row.y);
    await page.waitForTimeout(200);
    const chosen = await page.evaluate(() => ({
      value: document.querySelector('#var-loop-modal select.macro-rule-column').value,
      choiceField: !!document.querySelector('#var-loop-modal .var-loop-filter select.macro-rule-value'),
      windowOpen: document.getElementById('var-loop-modal').style.display !== 'none',
    }));
    check('boucle : le clic choisit Presence, le champ Valeur devient la liste des choix, la fenêtre reste ouverte', chosen.value === 'Presence' && chosen.choiceField && chosen.windowOpen, chosen);
    const save = await reveal(scope + ' .var-modal-primary', scope + ' .modal-content');
    check('boucle : Enregistrer visible et non recouvert', save.found && save.inViewport && save.onTop, save);
    const cancel = await hitTest(scope + ' .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
    if (cancel.found) await page.mouse.click(cancel.x, cancel.y);
    await page.waitForTimeout(200);
  },

  // « Trier par » d'une boucle : le champ avec recherche à côté du sens du tri, choix enregistré puis relu à la réouverture.
  async loopSort() {
    const scope = '#var-loop-modal';
    const win = await openWindowFor('Designation', 'var-loop', scope);
    check('tri : fenêtre Boucle ouverte et entièrement dans le panneau', win.found && win.inViewport, win);
    const field = await reveal(scope + ' .var-loop-sort-row .ss-trigger', scope + ' .modal-content');
    const direction = await hitTest(scope + ' .var-loop-sort-row > select:last-child');
    const native = await hitTest(scope + ' #var-loop-sort');
    check('tri : le champ « Trier par » est visible et au premier plan, à côté du sens du tri sans le recouvrir, et le <select> natif est masqué',
      field.found && field.inViewport && field.onTop && field.width > 60 && native.width === 0
      && direction.found && direction.onTop && field.right <= direction.left + 0.5 && Math.abs(field.top - direction.top) < 1, { field, direction, native });
    await page.mouse.click(field.x, field.y);
    await page.waitForTimeout(150);
    const open = await panelInfo(scope);
    check('tri : un vrai clic ouvre la liste dans le panneau Grist (zone de recherche au focus) : « Ordre » en tête, les colonnes de la table parcourue avec leur type, sans intitulé de groupe',
      !!open && open.inside && open.searchFocused && open.heads.length === 0 && open.rows[0] === 'Ordre' && open.rows.includes('Montant (nombre)') && open.rows.includes('Designation')
      && !open.rows.some(r => r.indexOf('CsDossiers') !== -1), open);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const esc = await page.evaluate(() => ({
      listOpen: !!document.querySelector('#var-loop-modal .ss-panel:not([hidden])'),
      windowOpen: document.getElementById('var-loop-modal').style.display !== 'none',
      focusOnField: document.activeElement === document.querySelector('#var-loop-modal .var-loop-sort-row .ss-trigger'),
    }));
    check('tri : Échap referme la liste seule, la fenêtre reste ouverte et le champ reprend le focus', !esc.listOpen && esc.windowOpen && esc.focusOnField, esc);
    await clickCenter(scope + ' .var-loop-sort-row .ss-trigger');
    await page.keyboard.type('mont');
    await page.waitForTimeout(100);
    const row = await rowCenter(scope, 'Montant');
    check('tri : « mont » propose Montant, visible et non recouvert', !!row && row.onTop && row.inViewport, row);
    if (row) await page.mouse.click(row.x, row.y);
    await page.waitForTimeout(700);
    const chosen = await page.evaluate(() => {
      const trigger = document.querySelector('#var-loop-modal .var-loop-sort-row .ss-trigger');
      const directionSelect = document.querySelector('#var-loop-modal .var-loop-sort-row > select:last-child');
      const lines = Array.from(document.querySelectorAll('#var-loop-modal .var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent);
      return {
        value: document.querySelector('#var-loop-modal #var-loop-sort').value, shown: trigger.textContent,
        listOpen: !!document.querySelector('#var-loop-modal .ss-panel:not([hidden])'), windowOpen: document.getElementById('var-loop-modal').style.display !== 'none',
        directions: Array.from(directionSelect.options).map(o => o.textContent), preview: lines[0],
      };
    });
    check('tri : le clic choisit Montant, ferme la liste, propose « croissant / décroissant » (nombre), relance l’aperçu triée ; la fenêtre reste ouverte',
      chosen.value === 'Montant' && chosen.shown === 'Montant' && !chosen.listOpen && chosen.windowOpen
      && JSON.stringify(chosen.directions) === JSON.stringify(['croissant', 'décroissant']) && /Suivi.*Audit/.test(chosen.preview || ''), chosen);
    const save = await reveal(scope + ' .var-modal-primary', scope + ' .modal-content');
    check('tri : Enregistrer visible et non recouvert', save.found && save.inViewport && save.onTop, save);
    if (save.found) await page.mouse.click(save.x, save.y);
    await page.waitForTimeout(250);
    const afterSave = await page.evaluate(() => {
      let loop = null;
      EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge' && n.attrs.column === 'Designation') loop = n.attrs.loop; });
      return { loop, windowOpen: document.getElementById('var-loop-modal').style.display !== 'none' };
    });
    check('tri : Enregistrer (vrai clic) pose le tri sur la bulle et ferme la fenêtre', !afterSave.windowOpen && !!afterSave.loop && !!afterSave.loop.sort && afterSave.loop.sort.column === 'Montant', afterSave);
    const again = await openWindowFor('Designation', 'var-loop', scope);
    const reopened = await page.evaluate(() => ({
      shown: document.querySelector('#var-loop-modal .var-loop-sort-row .ss-trigger').textContent,
      value: document.querySelector('#var-loop-modal #var-loop-sort').value,
    }));
    check('tri : la fenêtre rouverte montre la colonne de tri enregistrée dans le champ', again.found && reopened.value === 'Montant' && reopened.shown === 'Montant', reopened);
    const cancel = await reveal(scope + ' .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)', scope + ' .modal-content');
    if (cancel.found) await page.mouse.click(cancel.x, cancel.y);
    await page.waitForTimeout(200);
  },

  // Macro-modèle : les colonnes de la table de la page pour les règles, puis les trois listes de modèles (page de garde, modèle d'une règle, « Si aucune règle ne
  // correspond ») - la même liste avec recherche. Les modèles viennent de Templates.getCached(), remplacé le temps de la section.
  async macro() {
    const scope = '#macro-editor-modal';
    await page.evaluate(() => {
      window.__csRealCached = Templates.getCached;
      Templates.getCached = () => [
        { id: 11, nom: 'Notification_base', typeModele: 'document' },
        { id: 12, nom: 'Notification_bureau', typeModele: 'document' },
        { id: 13, nom: 'Notification_projet', typeModele: 'document' },
        { id: 14, nom: 'Relance par email', typeModele: 'email' },
      ];
      MacroEditor.openModal(null);
    });
    await page.waitForTimeout(200);
    await reveal('#macro-editor-add-slot', scope + ' .modal-content');
    await clickCenter('#macro-editor-add-slot');
    const field = await reveal(scope + ' .macro-rule-column-wrap .ss-trigger', scope + ' .modal-content');
    check('macro : le champ de la colonne est visible, dans le panneau et au premier plan', field.found && field.inViewport && field.onTop, field);
    await page.mouse.click(field.x, field.y);
    await page.waitForTimeout(150);
    const open = await panelInfo(scope);
    check('macro : la liste s’ouvre dans le panneau Grist avec les colonnes de la page, sans groupe', !!open && open.inside && open.searchFocused && open.heads.length === 0 && open.rows.includes('Titre') && !open.rows.some(r => r.indexOf('CsAnnuaire') !== -1), open);
    await page.keyboard.type('resp');
    await page.waitForTimeout(100);
    const row = await rowCenter(scope, 'Responsable');
    if (row) await page.mouse.click(row.x, row.y);
    await page.waitForTimeout(200);
    const chosen = await page.evaluate(() => ({
      value: document.querySelector('#macro-editor-modal select.macro-rule-column').value,
      hint: document.querySelector('#macro-editor-modal .macro-rule-column-type').textContent,
      modalOpen: document.getElementById('macro-editor-modal').style.display !== 'none',
    }));
    check('macro : le clic choisit Responsable, l’indication de type s’affiche, la fenêtre reste ouverte', chosen.value === 'Responsable' && chosen.hint === 'référence' && chosen.modalOpen, chosen);
    const documents = ['Notification_base', 'Notification_bureau', 'Notification_projet'];
    const lists = [
      { name: 'de la page de garde', trigger: '#macro-editor-cover + .ss-wrap .ss-trigger', select: '#macro-editor-cover', rows: ['— Choisir un modèle —'].concat(documents), typed: 'proj', row: 'Notification_projet', value: '13' },
      { name: 'du modèle d’une règle', trigger: '.macro-rule-modele + .ss-wrap .ss-trigger', select: '.macro-rule-modele', rows: ['— Choisir un modèle —'].concat(documents), typed: 'bu', row: 'Notification_bureau', value: '12' },
      { name: '« Si aucune règle ne correspond »', trigger: '.macro-slot-default-select + .ss-wrap .ss-trigger', select: '.macro-slot-default-select', rows: ['Ne rien inclure'].concat(documents.map(nom => 'Utiliser « ' + nom + ' »')), typed: 'base', row: 'Utiliser « Notification_base »', value: '11' },
    ];
    for (const list of lists) {
      const field = await reveal(scope + ' ' + list.trigger, scope + ' .modal-content');
      const native = await hitTest(scope + ' ' + list.select);
      check(`macro : la liste ${list.name} est un champ visible, dans le panneau et au premier plan, le <select> natif masqué`, field.found && field.inViewport && field.onTop && field.width > 60 && native.width === 0, { field, native });
      await page.mouse.click(field.x, field.y);
      await page.waitForTimeout(150);
      const open = await panelInfo(scope);
      check(`macro : un vrai clic ouvre la liste ${list.name} dans le panneau, zone de recherche au focus, les seuls modèles de type document`,
        !!open && open.inside && open.searchFocused && open.heads.length === 0 && JSON.stringify(open.rows) === JSON.stringify(list.rows), open);
      await page.keyboard.type(list.typed);
      await page.waitForTimeout(100);
      const row = await rowCenter(scope, list.row);
      check(`macro : « ${list.typed} » propose ${list.row} dans la liste ${list.name}, visible et non recouvert`, !!row && row.onTop && row.inViewport, row);
      if (row) await page.mouse.click(row.x, row.y);
      await page.waitForTimeout(200);
      const picked = await page.evaluate(({ select, trigger }) => ({
        value: document.querySelector('#macro-editor-modal ' + select).value, shown: document.querySelector('#macro-editor-modal ' + trigger).textContent,
        listOpen: !!document.querySelector('#macro-editor-modal .ss-panel:not([hidden])'), modalOpen: document.getElementById('macro-editor-modal').style.display !== 'none',
      }), list);
      check(`macro : le clic choisit ${list.row} dans la liste ${list.name}, la referme, la fenêtre reste ouverte`, picked.value === list.value && picked.shown.indexOf(list.row) === 0 && !picked.listOpen && picked.modalOpen, picked);
    }
    // Échap referme la liste seule et rend le focus au champ, la fenêtre reste ouverte.
    const ruleField = await reveal(scope + ' .macro-rule-modele + .ss-wrap .ss-trigger', scope + ' .modal-content');
    await page.mouse.click(ruleField.x, ruleField.y);
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const esc = await page.evaluate(() => ({
      listOpen: !!document.querySelector('#macro-editor-modal .ss-panel:not([hidden])'), modalOpen: document.getElementById('macro-editor-modal').style.display !== 'none',
      focusOnField: document.activeElement === document.querySelector('#macro-editor-modal .macro-rule-modele + .ss-wrap .ss-trigger'), value: document.querySelector('#macro-editor-modal .macro-rule-modele').value,
    }));
    check('macro : Échap referme la liste de modèles seule, la fenêtre reste ouverte, le champ reprend le focus et garde son choix', !esc.listOpen && esc.modalOpen && esc.focusOnField && esc.value === '12', esc);
    const cancel = await reveal('#macro-editor-cancel', scope + ' .modal-content');
    check('macro : Annuler visible et non recouvert', cancel.found && cancel.inViewport && cancel.onTop, cancel);
    if (cancel.found) await page.mouse.click(cancel.x, cancel.y);
    await page.waitForTimeout(200);
    await page.evaluate(() => { Templates.getCached = window.__csRealCached; });
  },

  // Règle d'une annexe du macro-modèle sur DEUX lignes (audit UX/UI du 2026-09-29, F8), en clair puis en sombre : cinq contrôles sur une ligne se chevauchaient dans la
  // fenêtre de 520 px (la liste des colonnes recouvrait l'opérateur, dont le « = » disparaissait). « Si », la colonne et l'opérateur sur la première ligne ; la valeur, la
  // flèche et le modèle sur la seconde, sous la colonne ; la croix, à droite, retire la règle entière (vrai clic). La fenêtre de condition d'une bulle et le filtre d'une
  // boucle partagent les classes .macro-rule-* : ils gardent leur ligne unique, sans recouvrement.
  async ruleRows() {
    const macro = '#macro-editor-modal';
    const loop = '#var-loop-modal';
    const previousTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.evaluate(() => {
      window.__csRealCached = Templates.getCached;
      Templates.getCached = () => [{ id: 11, nom: 'Notification_base', typeModele: 'document' }, { id: 12, nom: 'Notification_bureau', typeModele: 'document' }];
    });
    const count = () => page.evaluate(() => document.querySelectorAll('#macro-editor-modal .macro-rule-row').length);
    const closeWindow = async (scope, selector) => {
      const cancel = await reveal(selector, scope + ' .modal-content');
      if (cancel.found) await page.mouse.click(cancel.x, cancel.y);
      await page.waitForTimeout(200);
    };
    for (const theme of ['light', 'dark']) {
      const label = theme === 'dark' ? 'sombre' : 'clair';
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(100);
      // Macro-modèle : une annexe et sa règle, puis une seconde règle.
      await page.evaluate(() => MacroEditor.openModal(null));
      await page.waitForTimeout(200);
      await reveal('#macro-editor-add-slot', macro + ' .modal-content');
      await clickCenter('#macro-editor-add-slot');
      await reveal(macro + ' .macro-rule-modele + .ss-wrap .ss-trigger', macro + ' .modal-content');
      const rule = await ruleBoxes(macro);
      const b = rule && rule.boxes;
      const horizontalScroll = await page.evaluate(() => { const box = document.querySelector('#macro-editor-modal .macro-editor-slots'); return box.scrollWidth > box.clientWidth + 1; });
      check(`macro (${label}) : la règle tient sur deux lignes : « Si », la colonne et l’opérateur ; puis, sous la colonne, la valeur, la flèche et le modèle`,
        !!rule && rule.twoLines && sameLine(b.connector, b.column, b.operator) && sameLine(b.value, b.arrow, b.model) && b.value.t >= b.column.b - 1 && Math.abs(b.value.l - b.column.l) <= 2, rule);
      check(`macro (${label}) : aucun contrôle de la règle n’en recouvre un autre, chacun reçoit le clic en son centre, tous sont dans le panneau, sans défilement horizontal`,
        !!rule && overlapping(b).length === 0 && Object.values(b).every(box => box.onTop) && insidePanel(b) && !horizontalScroll, { rule, overlaps: rule && overlapping(b), horizontalScroll });
      check(`macro (${label}) : la colonne et le modèle gardent une largeur lisible (150 px), l’opérateur (40 px) et la valeur (90 px) aussi`,
        !!rule && b.column.w >= 150 && b.model.w >= 150 && b.operator.w >= 40 && b.value.w >= 90, rule && { column: b.column.w, model: b.model.w, operator: b.operator.w, value: b.value.w });
      check(`macro (${label}) : la croix est à droite des deux lignes et centrée dessus`,
        !!rule && b.remove.l >= Math.max(b.operator.r, b.model.r) - 0.5 && Math.abs(b.remove.cy - (b.column.t + b.model.b) / 2) <= 3, rule);
      // Un vrai clic sur la croix retire la règle entière ; deux « + Ajouter une condition » en remettent deux, l'une sous l'autre.
      await clickCenter(macro + ' .macro-rule-remove');
      const afterRemove = await count();
      for (let i = 0; i < 2; i++) {
        await reveal(macro + ' .macro-rule-add', macro + ' .modal-content');
        await clickCenter(macro + ' .macro-rule-add');
      }
      const afterAdd = await count();
      await reveal(macro + ' .macro-rule-row:nth-of-type(2) .macro-rule-modele + .ss-wrap .ss-trigger', macro + ' .modal-content');
      const first = await ruleBoxes(macro, 0);
      const second = await ruleBoxes(macro, 1);
      check(`macro (${label}) : un vrai clic sur la croix retire la règle entière, « + Ajouter une condition » en remet, deux règles se suivent sans se chevaucher, chacune sur deux lignes`,
        afterRemove === 0 && afterAdd === 2 && !!first && !!second && first.twoLines && second.twoLines && second.row.t >= first.row.b - 0.5
        && overlapping(second.boxes).length === 0 && Object.values(second.boxes).every(box => box.onTop), { afterRemove, afterAdd, first, second });
      await closeWindow(macro, '#macro-editor-cancel');

      // Fenêtre de condition d'une bulle : la règle garde sa ligne unique, sans recouvrement.
      await openWindowFor('Titre', 'var-condition', cond);
      await reveal(cond + ' .macro-rule-remove', cond + ' .modal-content');
      const condition = await ruleBoxes(cond);
      check(`condition (${label}) : la règle garde sa ligne unique (« Si », colonne, opérateur, valeur, croix), sans recouvrement, chaque contrôle au premier plan`,
        !!condition && !condition.twoLines && sameLine(...Object.values(condition.boxes)) && overlapping(condition.boxes).length === 0 && Object.values(condition.boxes).every(box => box.onTop), condition);
      await closeWindow(cond, cond + ' .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');

      // Filtre d'une boucle : de même.
      await openWindowFor('Designation', 'var-loop', loop);
      await reveal(loop + ' .var-loop-filter .var-condition-add', loop + ' .modal-content');
      await clickCenter(loop + ' .var-loop-filter .var-condition-add');
      await reveal(loop + ' .var-loop-filter .macro-rule-remove', loop + ' .modal-content');
      const filter = await ruleBoxes(loop + ' .var-loop-filter');
      check(`boucle (${label}) : la règle du filtre garde sa ligne unique (« Si », colonne, opérateur, valeur, croix), sans recouvrement, chaque contrôle au premier plan`,
        !!filter && !filter.twoLines && sameLine(...Object.values(filter.boxes)) && overlapping(filter.boxes).length === 0 && Object.values(filter.boxes).every(box => box.onTop), filter);
      await closeWindow(loop, loop + ' .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
    }
    await page.evaluate(theme => {
      Templates.getCached = window.__csRealCached;
      if (theme) document.documentElement.setAttribute('data-theme', theme); else document.documentElement.removeAttribute('data-theme');
    }, previousTheme);
  },

  // Réglages > Accès : la table des droits (liste native) et quatre choix de colonne avec recherche, dans une fenêtre qui défile à 700x400.
  async access() {
    const scope = '#settings-modal';
    await page.evaluate(async () => {
      const stub = window.__gristStub;
      stub.setVariables('CsDroits', { Email: 'Text', Nom: 'Text', Service: 'Ref:CsAnnuaire', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
      stub.setRows('CsDroits', [{ id: 1, Email: 'a@exemple.fr', Nom: 'A', Service: 7, LectureSeule: false, Export: true, Commentaires: true }]);
      await GristAPI.refreshSchema();
      stub.setWidgetOptions(null);
    });
    await clickCenter('#v2-btn-settings');
    await page.waitForTimeout(300);
    const tab = await clickCenter(scope + ' .settings-tab[data-settings-tab="access"]');
    check('accès : le clic sur l’onglet Accès ouvre les Réglages et son panneau', tab.found && await page.evaluate(() => !document.querySelector('#settings-modal [data-settings-panel="access"]').hidden), tab);
    // La table des droits : une liste avec recherche comme les colonnes, choisie à la vraie souris.
    const tableTrigger = scope + ' #settings-access-table + .ss-wrap .ss-trigger';
    const tableField = await reveal(tableTrigger, scope + ' .modal-content');
    const tableNative = await hitTest(scope + ' #settings-access-table');
    check('accès : le champ de la table est visible, dans le panneau et au premier plan, le <select> natif masqué', tableField.found && tableField.inViewport && tableField.onTop && tableField.width > 100 && tableNative.width === 0, { tableField, tableNative });
    await page.mouse.click(tableField.x, tableField.y);
    await page.waitForTimeout(150);
    const tableOpen = await panelInfo(scope);
    check('accès : un vrai clic ouvre la liste des tables dans le panneau, zone de recherche au focus, « — Aucune — » en tête puis les tables du document',
      !!tableOpen && tableOpen.inside && tableOpen.searchFocused && tableOpen.heads.length === 0 && tableOpen.rows[0] === '— Aucune —' && ['CsDroits', 'CsAnnuaire', 'CsDossiers'].every(t => tableOpen.rows.includes(t)), tableOpen);
    await page.keyboard.type('droit');
    await page.waitForTimeout(100);
    const tableRow = await rowCenter(scope, 'CsDroits');
    check('accès : « droit » propose CsDroits, visible et non recouvert', !!tableRow && tableRow.onTop && tableRow.inViewport, tableRow);
    if (tableRow) await page.mouse.click(tableRow.x, tableRow.y);
    await page.waitForTimeout(400);
    const tableChosen = await page.evaluate(() => ({ value: document.getElementById('settings-access-table').value, shown: document.querySelector('#settings-access-table + .ss-wrap .ss-trigger').textContent, listOpen: !!document.querySelector('#settings-modal .ss-panel:not([hidden])') }));
    check('accès : le clic choisit CsDroits, referme la liste, le champ montre la table', tableChosen.value === 'CsDroits' && tableChosen.shown === 'CsDroits' && !tableChosen.listOpen, tableChosen);
    const field = await reveal(scope + ' #settings-access-readonly + .ss-wrap .ss-trigger', scope + ' .modal-content');
    const native = await hitTest(scope + ' #settings-access-readonly');
    const table = await hitTest(tableTrigger);
    check('accès : le champ « Lecture seule » est visible, dans le panneau et au premier plan, le <select> natif masqué, à la hauteur du champ de la table',
      field.found && field.inViewport && field.onTop && field.width > 100 && native.width === 0 && table.found && Math.abs((field.bottom - field.top) - (table.bottom - table.top)) < 1, { field, native, table });
    const emailShown = await page.evaluate(() => document.querySelector('#settings-access-email + .ss-wrap .ss-trigger').textContent);
    check('accès : choisir la table pré-choisit la colonne email, et le champ visible la montre', emailShown === 'Email', emailShown);
    await page.mouse.click(field.x, field.y);
    await page.waitForTimeout(150);
    const open = await panelInfo(scope);
    check('accès : un vrai clic ouvre la liste, entièrement dans le panneau Grist, zone de recherche au focus, « — Aucune — » en tête puis les seules colonnes à cocher',
      !!open && open.inside && open.searchFocused && open.heads.length === 0 && JSON.stringify(open.rows) === JSON.stringify(['— Aucune —', 'LectureSeule', 'Export', 'Commentaires']), open);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const esc = await page.evaluate(() => ({
      listOpen: !!document.querySelector('#settings-modal .ss-panel:not([hidden])'),
      windowOpen: document.getElementById('settings-modal').style.display !== 'none',
      focusOnField: document.activeElement === document.querySelector('#settings-access-readonly + .ss-wrap .ss-trigger'),
    }));
    check('accès : Échap referme la liste seule, les Réglages restent ouverts et le champ reprend le focus', !esc.listOpen && esc.windowOpen && esc.focusOnField, esc);
    await clickCenter(scope + ' #settings-access-readonly + .ss-wrap .ss-trigger');
    await page.keyboard.type('lect');
    await page.waitForTimeout(100);
    const row = await rowCenter(scope, 'LectureSeule');
    check('accès : « lect » propose LectureSeule, visible et non recouvert', !!row && row.onTop && row.inViewport, row);
    if (row) await page.mouse.click(row.x, row.y);
    await page.waitForTimeout(400);
    const chosen = await page.evaluate(() => {
      const option = window.__gristStub.state.options && window.__gristStub.state.options.droitsAcces;
      return {
        value: document.getElementById('settings-access-readonly').value, shown: document.querySelector('#settings-access-readonly + .ss-wrap .ss-trigger').textContent,
        listOpen: !!document.querySelector('#settings-modal .ss-panel:not([hidden])'), windowOpen: document.getElementById('settings-modal').style.display !== 'none', option,
      };
    });
    check('accès : le clic choisit LectureSeule, referme la liste, écrit l’option du widget ; les Réglages restent ouverts',
      chosen.value === 'LectureSeule' && chosen.shown === 'LectureSeule' && !chosen.listOpen && chosen.windowOpen
      && !!chosen.option && chosen.option.table === 'CsDroits' && chosen.option.emailColumn === 'Email' && chosen.option.readOnlyColumn === 'LectureSeule', chosen);
    const close = await reveal('#settings-close', scope + ' .modal-content');
    check('accès : Fermer visible et non recouvert', close.found && close.inViewport && close.onTop, close);
    if (close.found) await page.mouse.click(close.x, close.y);
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__gristStub.setWidgetOptions(null));
    await page.waitForTimeout(200);
  },

  // Menu « Image depuis une variable » de la barre (js/main-toolbar.js) : vrai survol du bouton Image, vrai clic sur la ligne du menu ; la liste avec recherche
  // s'ouvre à côté, tient dans le panneau et se cherche au clavier ; un vrai clic sur une ligne (ou Entrée) insère l'image liée à la variable au curseur ;
  // Échap et un vrai clic ailleurs la ferment sans rien insérer.
  async imagePicker() {
    const scope = '#v2-image-var-search';
    await page.evaluate(async () => {
      const stub = window.__gristStub;
      const photos = {};
      for (let i = 1; i <= 12; i++) photos['Photo_' + String(i).padStart(2, '0')] = 'Attachments';
      stub.setVariables('CsPieces', Object.assign({ Titre: 'Text' }, photos));
      stub.setVariables('CsSites', { Nom: 'Text', Logo: 'Attachments' });
      await GristAPI.refreshSchema();
      Editor.setHTML('<p>Bonjour Marie</p><p>Fin</p>');
    });
    await page.waitForTimeout(300);
    const inserted = () => page.evaluate(() => {
      const ed = EditorCore.getEditor();
      const out = [];
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name === 'editorImage') out.push({ key: node.attrs.varKey, before: ed.state.doc.textBetween(0, pos), after: ed.state.doc.textBetween(pos + 1, ed.state.doc.content.size, '|') });
      });
      return out;
    });
    const editorFocused = () => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.tiptap'));
    const hostGone = () => page.evaluate(() => !document.getElementById('v2-image-var-search'));
    // Le curseur : un vrai clic à droite de la première ligne, donc à sa fin.
    async function putCursorAtEndOfFirstLine() {
      const first = await hitTest('.tiptap p:nth-of-type(1)');
      await page.mouse.click(first.right - 6, first.y);
      await page.waitForTimeout(150);
    }
    // Vrai survol du bouton Image, puis d'un seul geste vers la ligne du menu (pas à pas, un point tomberait dans l'écart de 2 px entre le bouton et son menu),
    // vrai clic ; attente de l'ouverture (la lecture du schéma précède l'affichage).
    async function openMenu() {
      const button = await hitTest('#v2-btn-image');
      await page.mouse.move(button.x, button.y);
      await page.waitForTimeout(250);
      const row = await hitTest('#v2-btn-image-from-variable');
      await page.mouse.move(row.left + 10, row.y);
      await page.mouse.click(row.left + 10, row.y);
      await page.waitForSelector(scope + ' .ss-panel:not([hidden])', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(150);
      return { button, row };
    }

    await putCursorAtEndOfFirstLine();
    const { button, row } = await openMenu();
    check('image : la ligne « Image depuis une variable » est visible et atteignable au survol du bouton Image', row.found && row.inViewport && row.onTop, { button, row });
    const open = await panelInfo(scope);
    const panelBox = await hitTest(scope + ' .ss-panel');
    check('image : un vrai clic sur la ligne ouvre la liste, entière dans le panneau Grist, au premier plan, près du bouton Image, la zone de recherche a le focus',
      !!open && open.inside && open.searchFocused && panelBox.onTop && panelBox.top >= button.top - 300 && panelBox.left <= button.right + 40, { open, panelBox, button });
    check('image : les seules colonnes Pièces jointes, sans intitulé de groupe, sans « rien » ; la liste défile (13 colonnes)',
      !!open && open.rows.length === 13 && open.rows[0] === 'CsPieces.Photo_01' && open.rows.includes('CsSites.Logo') && !open.rows.some(r => r.includes('Titre') || r.includes('Nom'))
      && open.heads.length === 0 && open.scrollable, open);
    const list = await hitTest(scope + ' .ss-panel .ss-list');
    await page.mouse.move(list.x, list.y);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);
    const wheeled = await panelInfo(scope);
    check('image : la molette réelle sur la liste la fait défiler, sans déplacer le panneau', !!wheeled && wheeled.listScroll > 0 && wheeled.rect.top === open.rect.top, { wheeled, open });
    await page.keyboard.type('logo');
    await page.waitForTimeout(100);
    const typed = await panelInfo(scope);
    check('image : « logo » tapé au clavier réduit la liste à CsSites.Logo', !!typed && JSON.stringify(typed.rows) === JSON.stringify(['CsSites.Logo']), typed);
    const logo = await rowCenter(scope, 'CsSites.Logo');
    check('image : la ligne CsSites.Logo est visible et non recouverte', !!logo && logo.onTop && logo.inViewport, logo);
    if (logo) await page.mouse.click(logo.x, logo.y);
    await page.waitForTimeout(250);
    let images = await inserted();
    check('image : le clic insère l’image liée à CsSites.Logo à la fin de la première ligne, ferme la liste et rend le focus à l’éditeur',
      images.length === 1 && images[0].key === 'CsSites.Logo' && images[0].before === 'Bonjour Marie' && images[0].after === '|Fin' && await hostGone() && await editorFocused(), { images });

    // Au clavier seul : ouverture au clic, recherche puis Entrée.
    await openMenu();
    await page.keyboard.type('photo_12');
    await page.waitForTimeout(100);
    const typedPhoto = await panelInfo(scope);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    images = await inserted();
    check('image : « photo_12 » puis Entrée insère l’image de CsPieces.Photo_12, la liste se referme',
      !!typedPhoto && JSON.stringify(typedPhoto.rows) === JSON.stringify(['CsPieces.Photo_12']) && images.length === 2 && images[1].key === 'CsPieces.Photo_12' && await hostGone(), { typedPhoto, images });

    // Échap : ferme la liste seule, rend le focus à l'éditeur, n'insère rien.
    await openMenu();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    images = await inserted();
    check('image : Échap referme la liste sans rien insérer, le focus revient à l’éditeur', await hostGone() && images.length === 2 && await editorFocused(), images);

    // Un vrai clic ailleurs (sur le texte de l'éditeur) : ferme aussi, sans rien insérer.
    await openMenu();
    const elsewhere = await hitTest('.tiptap p:nth-of-type(2)');
    await page.mouse.click(elsewhere.left + 6, elsewhere.y);
    await page.waitForTimeout(250);
    images = await inserted();
    check('image : un vrai clic ailleurs referme la liste sans rien insérer', await hostGone() && images.length === 2, images);
  },

  // Le composant ne se charge pas (fichier introuvable) : l'application démarre quand même et chaque choix de colonne reste la liste native d'avant, qui
  // marche. Dernière section : elle recharge la page.
  async withoutComponent() {
    const pattern = '**/js/search-select.js*';
    await page.route(pattern, route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'introuvable' }));
    await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
    await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
    await seedData();
    const missing = await page.evaluate(() => typeof SearchSelect === 'undefined');
    check('sans composant : le fichier ne se charge pas et l’application démarre quand même', missing);
    // Condition d'affichage.
    await openWindowFor('Titre', 'var-condition', cond);
    const conditionField = await hitTest(cond + ' select.macro-rule-column');
    const conditionTriggers = await page.evaluate(() => document.querySelectorAll('#var-condition-modal .ss-trigger').length);
    check('sans composant : la colonne de la condition est la liste native, visible et au premier plan', conditionField.found && conditionField.width > 80 && conditionField.onTop && conditionTriggers === 0, { conditionField, conditionTriggers });
    await page.selectOption(cond + ' select.macro-rule-column', 'Statut');
    await page.waitForTimeout(150);
    const conditionChosen = await page.evaluate(() => ({ value: document.querySelector('#var-condition-modal select.macro-rule-column').value, valueField: !!document.querySelector('#var-condition-modal .macro-rule-value') }));
    check('sans composant : choisir une colonne dans la liste native affiche le champ Valeur', conditionChosen.value === 'Statut' && conditionChosen.valueField, conditionChosen);
    const conditionCancel = await hitTest(cond + ' .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
    if (conditionCancel.found) await page.mouse.click(conditionCancel.x, conditionCancel.y);
    await page.waitForTimeout(200);
    // « Trier par » d'une boucle.
    const loopScope = '#var-loop-modal';
    await openWindowFor('Designation', 'var-loop', loopScope);
    const sortField = await reveal(loopScope + ' #var-loop-sort', loopScope + ' .modal-content');
    check('sans composant : « Trier par » est la liste native, visible et au premier plan', sortField.found && sortField.width > 40 && sortField.onTop && await page.evaluate(() => !document.querySelector('#var-loop-modal .ss-trigger')), sortField);
    await page.selectOption(loopScope + ' #var-loop-sort', 'Montant');
    await page.waitForTimeout(300);
    check('sans composant : choisir une colonne de tri dans la liste native marche', await page.evaluate(() => document.querySelector('#var-loop-modal #var-loop-sort').value === 'Montant'));
    const loopCancel = await reveal(loopScope + ' .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)', loopScope + ' .modal-content');
    if (loopCancel.found) await page.mouse.click(loopCancel.x, loopCancel.y);
    await page.waitForTimeout(200);
    // Macro-modèle : les trois listes de modèles restent les listes natives d'avant, qui marchent.
    const macroScope = '#macro-editor-modal';
    await page.evaluate(() => {
      window.__csRealCached = Templates.getCached;
      Templates.getCached = () => [{ id: 11, nom: 'Notification_base', typeModele: 'document' }, { id: 12, nom: 'Notification_bureau', typeModele: 'document' }];
      MacroEditor.openModal(null);
      document.getElementById('macro-editor-add-slot').click();
    });
    await page.waitForTimeout(200);
    const macroLists = { cover: '#macro-editor-cover', rule: macroScope + ' select.macro-rule-modele', dflt: macroScope + ' .macro-slot-default-select' };
    const macroBoxes = {};
    for (const [key, selector] of Object.entries(macroLists)) macroBoxes[key] = await reveal(selector, macroScope + ' .modal-content');
    const macroTriggers = await page.evaluate(() => document.querySelectorAll('#macro-editor-modal .ss-trigger').length);
    check('sans composant : les listes de modèles du macro-modèle sont les listes natives, visibles et au premier plan', Object.values(macroBoxes).every(b => b.found && b.width > 60 && b.onTop) && macroTriggers === 0, { macroBoxes, macroTriggers });
    await page.selectOption(macroLists.cover, '11');
    await page.selectOption(macroLists.rule, '12');
    await page.selectOption(macroLists.dflt, '12');
    await page.waitForTimeout(150);
    // Une condition de plus redessine les annexes : le choix des listes natives est gardé.
    await reveal(macroScope + ' .macro-rule-add', macroScope + ' .modal-content');
    await clickCenter(macroScope + ' .macro-rule-add');
    const macroPicked = await page.evaluate(() => ({
      cover: document.getElementById('macro-editor-cover').value, rules: document.querySelectorAll('#macro-editor-modal .macro-rule-row').length,
      rule: document.querySelector('#macro-editor-modal select.macro-rule-modele').value, dflt: document.querySelector('#macro-editor-modal .macro-slot-default-select').value,
    }));
    check('sans composant : choisir un modèle dans les listes natives marche, et le choix est gardé quand une condition est ajoutée', macroPicked.cover === '11' && macroPicked.rules === 2 && macroPicked.rule === '12' && macroPicked.dflt === '12', macroPicked);
    const macroCancel = await reveal('#macro-editor-cancel', macroScope + ' .modal-content');
    if (macroCancel.found) await page.mouse.click(macroCancel.x, macroCancel.y);
    await page.waitForTimeout(200);
    await page.evaluate(() => { Templates.getCached = window.__csRealCached; });
    // Menu « Image depuis une variable » : la liste simple d'avant, qui insère toujours l'image.
    await page.evaluate(async () => {
      const stub = window.__gristStub;
      stub.setVariables('CsSites', { Nom: 'Text', Logo: 'Attachments' });
      await GristAPI.refreshSchema();
      Editor.setHTML('<p>Bonjour Marie</p><p>Fin</p>');
    });
    await page.waitForTimeout(300);
    const firstLine = await hitTest('.tiptap p:nth-of-type(1)');
    await page.mouse.click(firstLine.right - 6, firstLine.y);
    await page.waitForTimeout(150);
    const imageButton = await hitTest('#v2-btn-image');
    await page.mouse.move(imageButton.x, imageButton.y);
    await page.waitForTimeout(250);
    const imageRow = await hitTest('#v2-btn-image-from-variable');
    await page.mouse.move(imageRow.left + 10, imageRow.y);
    await page.mouse.click(imageRow.left + 10, imageRow.y);
    await page.waitForSelector('#v2-image-var-picker .v2-image-var-picker-item', { timeout: 5000 }).catch(() => {});
    const simpleList = await page.evaluate(() => {
      const box = document.getElementById('v2-image-var-picker');
      const r = box ? box.getBoundingClientRect() : null;
      return {
        shown: !!box && box.style.display !== 'none', items: box ? Array.from(box.querySelectorAll('.v2-image-var-picker-item')).map(i => i.textContent) : [],
        inside: !!r && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
        searchLeft: !!document.getElementById('v2-image-var-search') || !!document.querySelector('.ss-panel'),
      };
    });
    check('sans composant : « Image depuis une variable » montre la liste simple d’avant (une ligne par colonne Pièces jointes), dans le panneau, sans reste de la recherche',
      simpleList.shown && JSON.stringify(simpleList.items) === JSON.stringify(['CsSites.Logo']) && simpleList.inside && !simpleList.searchLeft, simpleList);
    const simpleRow = await hitTest('#v2-image-var-picker .v2-image-var-picker-item');
    if (simpleRow.found) await page.mouse.click(simpleRow.x, simpleRow.y);
    await page.waitForTimeout(250);
    const simpleInserted = await page.evaluate(() => {
      const out = [];
      EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'editorImage') out.push(node.attrs.varKey); });
      return { images: out, boxClosed: document.getElementById('v2-image-var-picker').style.display === 'none' };
    });
    check('sans composant : un vrai clic sur la ligne insère l’image liée à CsSites.Logo et ferme la liste', JSON.stringify(simpleInserted.images) === JSON.stringify(['CsSites.Logo']) && simpleInserted.boxClosed, simpleInserted);
    // Réglages > Accès.
    await page.evaluate(async () => {
      const stub = window.__gristStub;
      stub.setVariables('CsDroits', { Email: 'Text', Nom: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
      stub.setRows('CsDroits', [{ id: 1, Email: 'a@exemple.fr', Nom: 'A', LectureSeule: false, Export: true, Commentaires: true }]);
      await GristAPI.refreshSchema();
      stub.setWidgetOptions(null);
    });
    await clickCenter('#v2-btn-settings');
    await page.waitForTimeout(300);
    await clickCenter('#settings-modal .settings-tab[data-settings-tab="access"]');
    await page.selectOption('#settings-access-table', 'CsDroits');
    await page.waitForTimeout(400);
    await page.selectOption('#settings-access-readonly', 'LectureSeule');
    await page.waitForTimeout(400);
    const access = await page.evaluate(() => {
      const option = window.__gristStub.state.options && window.__gristStub.state.options.droitsAcces;
      return {
        triggers: document.querySelectorAll('#settings-modal .ss-trigger').length, email: document.getElementById('settings-access-email').value,
        emailVisible: document.getElementById('settings-access-email').getBoundingClientRect().width > 100, option,
      };
    });
    check('sans composant : les colonnes de Réglages > Accès sont des listes natives qui marchent et écrivent l’option du widget',
      access.triggers === 0 && access.emailVisible && access.email === 'Email' && !!access.option && access.option.readOnlyColumn === 'LectureSeule', access);
    const close = await reveal('#settings-close', '#settings-modal .modal-content');
    if (close.found) await page.mouse.click(close.x, close.y);
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__gristStub.setWidgetOptions(null));
    await page.unroute(pattern);
  },
};
const only = process.argv.slice(2);
for (const [name, run] of Object.entries(SECTIONS)) if (!only.length || only.includes(name)) await run();

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
