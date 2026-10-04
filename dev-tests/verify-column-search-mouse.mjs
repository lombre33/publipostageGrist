#!/usr/bin/env node
// Listes de colonnes avec recherche (js/search-select.js) dans les fenêtres qui proposent un choix de colonne, à la VRAIE souris et au vrai clavier
// (page.mouse / page.keyboard, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400) : les scénarios de dev-tests/scenarios-column-search.js
// tournent DANS la page (dispatchEvent), ils ne prouvent ni qu'un vrai clic atteint le champ, ni que le panneau de la liste tient dans un panneau bas sans
// être rogné ni recouvert, ni que la molette fait défiler la liste et non la page. Sections lançables seules : node dev-tests/verify-column-search-mouse.mjs condition
// Écrans : fenêtre de condition, filtre et « Trier par » de la boucle, règles et listes de modèles des macro-modèles (et la règle sur deux lignes, section ruleRows, en
// clair et en sombre), Réglages > Accès (la table et les colonnes), menu « Image depuis une variable » de la barre, champ Valeur d'une règle (section values : colonne
// à choix, Référence, très longue liste plafonnée à 500 lignes, en clair et en sombre ; section boolValues : la liste Oui / Non d'une colonne Oui / Non ; section hashList et fin de
// imagePicker : la table de la page en tête de la liste « # » et du menu Image).
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
// Range la souris dans un coin du panneau, loin de la barre d'outils : un menu de la barre (Image, Page…) reste ouvert tant que la souris est dessus, et il recouvre alors le texte juste
// dessous - le premier paragraphe d'un modèle vide se trouve sous le menu Image depuis que la bande d'un en-tête vide ne prend plus de place (20ccd35) -, si bien qu'un clic « dans le texte »
// tombait sur la ligne du menu au lieu de l'éditeur.
async function parkMouse() {
  await page.mouse.move(WIDTH - 14, HEIGHT - 14);
  await page.waitForTimeout(300);
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
  // Fenêtre « Condition d'affichage » : la capture d'Antoine du 2026-09-29, avec les colonnes de toutes les tables en UNE seule liste à plat, sans intitulé de groupe
  // (choix « À plat » d'Antoine, 2026-10-01 : la même liste que le macro-modèle).
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
    check('condition : le choix « rien » en tête, les colonnes de la page puis celles des autres tables à la suite SANS intitulé de groupe, la saisie avancée en dernier, le type derrière les colonnes',
      !!open && open.rows[0] === '— Choisir une colonne —' && open.rows[open.rows.length - 1] === 'Autre (colonne d\'une autre table…)' && open.heads.length === 0
      && open.rows.includes('Titre') && open.rows.includes('Responsable (référence)') && open.rows.includes('Actif (case à cocher)') && open.rows.includes('CsAnnuaire.NomPrenom') && open.rows.includes('CsContacts.Role'), open);
    check('condition : la liste défile (colonnes nombreuses)', !!open && open.scrollable, open);
    const list = await hitTest(cond + ' .ss-panel:not([hidden]) .ss-list');
    await page.mouse.move(list.x, list.y);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);
    const wheeled = await panelInfo(cond);
    const after = await windowState(cond);
    check('condition : molette réelle sur la liste : elle défile, ni la page, ni la fenêtre, ni le panneau ne bougent',
      wheeled.listScroll > 0 && after.docTop === 0 && after.boxScroll === before.boxScroll && after.boxTop === before.boxTop && wheeled.rect.top === open.rect.top, { before, after, wheeled });
    // Frappe réelle : la liste se réduit aux colonnes qui répondent (la table se cherche avec la colonne), aucun intitulé, la saisie avancée reste atteignable.
    await page.keyboard.type('ann');
    await page.waitForTimeout(100);
    const typed = await panelInfo(cond);
    const pinned = await rowCenter(cond, 'Autre (colonne d\'une autre table…)');
    check('condition : « ann » réduit la liste aux colonnes de CsAnnuaire (la table se cherche avec la colonne, aucun intitulé), la saisie avancée reste visible et au premier plan',
      !!typed && typed.heads.length === 0 && typed.rows.length >= 3 && typed.rows.slice(0, -1).every(r => r.indexOf('CsAnnuaire.') === 0) && !!pinned && pinned.onTop && pinned.inViewport, { typed, pinned });
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
    check('macro : la liste s’ouvre dans le panneau Grist avec les colonnes de la page puis celles des autres tables, sans groupe', !!open && open.inside && open.searchFocused && open.heads.length === 0 && open.rows.includes('Titre') && open.rows.includes('CsAnnuaire.NomPrenom'), open);
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

  // Macro-modèle, colonne d'une AUTRE table (Antoine, 2026-10-01 : « lorsque je veux ajouter une colonne d'une autre table je ne peux pas la rechercher, je dois mettre à la
  // main table.colonne … une seule dropdown avec recherche dynamique. Et si jamais le lien entre les deux tables n'est pas déjà fait … ouvrir la modale pour le choix »), en
  // clair puis en sombre : la colonne se retrouve à la frappe par son nom dans la liste unique ; une table pas encore liée ouvre la clé de correspondance PAR-DESSUS le
  // macro-modèle (fenêtre entière dans le panneau, au premier plan) ; Échap ou Annuler remet la colonne précédente, Valider enregistre le lien et garde la colonne.
  async macroTables() {
    const scope = '#macro-editor-modal';
    const link = '#link-config-modal';
    const previousTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.evaluate(() => {
      window.__csRealCached = Templates.getCached;
      Templates.getCached = () => [{ id: 11, nom: 'Notification_base', typeModele: 'document' }];
    });
    const fieldState = () => page.evaluate(() => {
      const select = document.querySelector('#macro-editor-modal select.macro-rule-column');
      return {
        value: select.value, shown: select.nextElementSibling.querySelector('.ss-name').textContent,
        macroOpen: document.getElementById('macro-editor-modal').style.display !== 'none', linkOpen: document.getElementById('link-config-modal').style.display !== 'none',
        hint: document.querySelector('#macro-editor-modal .macro-rule-column-type').textContent,
      };
    });
    // Ouvre la liste de la colonne à la vraie souris, tape `typed` au vrai clavier et clique la ligne `row`.
    const pick = async (typed, row) => {
      const field = await reveal(scope + ' .macro-rule-column-wrap .ss-trigger', scope + ' .modal-content');
      await page.mouse.click(field.x, field.y);
      await page.waitForTimeout(150);
      await page.keyboard.type(typed);
      await page.waitForTimeout(100);
      const found = await rowCenter(scope, row);
      if (found) await page.mouse.click(found.x, found.y);
      await page.waitForTimeout(350);
      return found;
    };
    for (const theme of ['light', 'dark']) {
      const label = theme === 'dark' ? 'sombre' : 'clair';
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      await page.evaluate(async () => { await GristAPI.deleteLinkRule('CsContacts'); });
      await page.waitForTimeout(100);
      await page.evaluate(() => MacroEditor.openModal(null));
      await page.waitForTimeout(200);
      await reveal('#macro-editor-add-slot', scope + ' .modal-content');
      await clickCenter('#macro-editor-add-slot');
      // Une colonne de la page d'abord : elle garde son nom nu.
      const own = await pick('stat', 'Statut');
      const afterOwn = await fieldState();
      check(`macro tables (${label}) : une colonne de la page se choisit à la frappe et garde son nom nu (« Statut »)`, !!own && own.onTop && own.inViewport && afterOwn.value === 'Statut' && afterOwn.shown === 'Statut' && !afterOwn.linkOpen, { own, afterOwn });
      // Retrouver une colonne d'une autre table par son seul nom : la liste est unique, la table se lit dans le nom de la colonne.
      const field = await reveal(scope + ' .macro-rule-column-wrap .ss-trigger', scope + ' .modal-content');
      await page.mouse.click(field.x, field.y);
      await page.waitForTimeout(150);
      await page.keyboard.type('role');
      await page.waitForTimeout(100);
      const search = await panelInfo(scope);
      const roleRow = await rowCenter(scope, 'CsContacts.Role');
      check(`macro tables (${label}) : « role » retrouve CsContacts.Role dans la liste unique, sans intitulé de table, visible et non recouvert`,
        !!search && search.inside && search.heads.length === 0 && search.rows.includes('CsContacts.Role') && !!roleRow && roleRow.onTop && roleRow.inViewport, { search, roleRow });
      if (roleRow) await page.mouse.click(roleRow.x, roleRow.y);
      await page.waitForTimeout(350);
      // Table pas encore liée : la clé s'ouvre par-dessus le macro-modèle, entière dans le panneau ; le champ montre la colonne demandée, le temps du choix de la clé.
      const asked = await hitTest(link + ' .modal-content');
      const whileAsking = await fieldState();
      check(`macro tables (${label}) : une table pas encore liée ouvre la fenêtre de la clé PAR-DESSUS le macro-modèle, entière dans le panneau et au premier plan`,
        asked.found && asked.inViewport && asked.onTop && whileAsking.linkOpen && whileAsking.macroOpen && whileAsking.value === 'CsContacts.Role', { asked, whileAsking });
      // Échap (vrai clavier) ferme la clé seule : le macro-modèle reste ouvert, la colonne précédente est remise dans le champ.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      const escaped = await fieldState();
      const ruleAfterEscape = await page.evaluate(() => !!GristAPI.getLinkRule('CsContacts'));
      check(`macro tables (${label}) : Échap ferme la clé seule, le macro-modèle reste ouvert, la colonne précédente (« Statut ») est remise, aucun lien enregistré`,
        !escaped.linkOpen && escaped.macroOpen && escaped.value === 'Statut' && escaped.shown === 'Statut' && !ruleAfterEscape, { escaped, ruleAfterEscape });
      // Deuxième essai, bouton Annuler à la vraie souris.
      await pick('role', 'CsContacts.Role');
      const cancel = await reveal('#link-config-cancel', link + ' .modal-content');
      if (cancel.found) await page.mouse.click(cancel.x, cancel.y);
      await page.waitForTimeout(250);
      const cancelled = await fieldState();
      check(`macro tables (${label}) : Annuler (vrai clic) remet aussi la colonne précédente et laisse le macro-modèle ouvert`, cancel.found && cancel.onTop && !cancelled.linkOpen && cancelled.macroOpen && cancelled.value === 'Statut' && cancelled.shown === 'Statut', { cancel, cancelled });
      // Troisième essai, Valider : le lien est enregistré, la colonne est adoptée, le macro-modèle reste ouvert.
      await pick('role', 'CsContacts.Role');
      const confirm = await reveal('#link-config-confirm', link + ' .modal-content');
      if (confirm.found) await page.mouse.click(confirm.x, confirm.y);
      await page.waitForTimeout(350);
      const confirmed = await fieldState();
      const rule = await page.evaluate(() => GristAPI.getLinkRule('CsContacts'));
      check(`macro tables (${label}) : Valider (vrai clic) enregistre le lien et garde CsContacts.Role dans le champ, le macro-modèle reste ouvert`,
        confirm.found && confirm.onTop && !confirmed.linkOpen && confirmed.macroOpen && confirmed.value === 'CsContacts.Role' && confirmed.shown === 'CsContacts.Role' && !!rule && rule.mode === 'match', { confirm, confirmed, rule });
      // Une fois liée, une autre colonne de la même table, comme une colonne d'une table déjà liée, s'adopte sans rien demander.
      await pick('contacts nom', 'CsContacts.Nom');
      const sameTable = await fieldState();
      await pick('annuaire tel', 'CsAnnuaire.Telephone');
      const linkedTable = await fieldState();
      check(`macro tables (${label}) : une table déjà liée n'ouvre plus la clé (une autre colonne de CsContacts, puis CsAnnuaire.Telephone)`,
        sameTable.value === 'CsContacts.Nom' && !sameTable.linkOpen && linkedTable.value === 'CsAnnuaire.Telephone' && !linkedTable.linkOpen && linkedTable.macroOpen, { sameTable, linkedTable });
      const close = await reveal('#macro-editor-cancel', scope + ' .modal-content');
      if (close.found) await page.mouse.click(close.x, close.y);
      await page.waitForTimeout(200);
    }
    await page.evaluate(async theme => {
      Templates.getCached = window.__csRealCached;
      await GristAPI.deleteLinkRule('CsContacts');
      if (theme) document.documentElement.setAttribute('data-theme', theme); else document.documentElement.removeAttribute('data-theme');
    }, previousTheme);
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
      // Une colonne typée choisie à la vraie souris : son indication de type (« nombre ») s'affiche sous la seconde ligne et commence sous la colonne, comme dans la fenêtre de condition.
      const columnField = await reveal(macro + ' .macro-rule-column-wrap .ss-trigger', macro + ' .modal-content');
      await page.mouse.click(columnField.x, columnField.y);
      await page.waitForTimeout(150);
      await page.keyboard.type('mont');
      await page.waitForTimeout(100);
      const amount = await rowCenter(macro, 'Montant');
      if (amount) await page.mouse.click(amount.x, amount.y);
      await page.waitForTimeout(200);
      const typed = await page.evaluate(() => {
        const row = document.querySelector('#macro-editor-modal .macro-rule-row');
        const hint = row.querySelector('.macro-rule-column-type');
        const range = document.createRange();
        range.selectNodeContents(hint);
        const text = range.getClientRects()[0];
        const box = el => el.getBoundingClientRect();
        return {
          text: hint.textContent, textLeft: text ? text.left : null, columnLeft: box(row.querySelector('.macro-rule-column-wrap .ss-trigger')).left,
          hintTop: box(hint).top, modelBottom: box(row.querySelector('.macro-rule-modele + .ss-wrap .ss-trigger')).bottom, hintRight: box(hint).right, rowRight: box(row).right,
        };
      });
      check(`macro (${label}) : la colonne « Montant » choisie à la vraie souris affiche « nombre » sous la seconde ligne, à partir de la colonne (comme dans la fenêtre de condition)`,
        typed.text === 'nombre' && typed.textLeft !== null && Math.abs(typed.textLeft - typed.columnLeft) <= 2 && typed.hintTop >= typed.modelBottom - 0.5 && typed.hintRight <= typed.rowRight + 0.5, typed);
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

    // La table de la page en tête (Antoine, 2026-10-01 : « prioriser dans la recherche dynamique les noms qui sont dans la table en cours ») : la page sur CsSites, dont la
    // table vient après CsPieces dans le schéma ; sa colonne Logo ouvre la liste, la frappe garde cet ordre, Entrée au vrai clavier insère cette colonne.
    await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Siège', Logo: null }, 'CsSites'));
    await page.waitForTimeout(150);
    await putCursorAtEndOfFirstLine();
    await openMenu();
    const pageFirst = await panelInfo(scope);
    check('image : la colonne de la table de la page (CsSites.Logo) ouvre la liste, avant les 12 colonnes de CsPieces, toutes gardées dans leur ordre',
      !!pageFirst && pageFirst.rows.length === 13 && pageFirst.rows[0] === 'CsSites.Logo' && pageFirst.rows[1] === 'CsPieces.Photo_01' && pageFirst.rows[12] === 'CsPieces.Photo_12', pageFirst);
    await page.keyboard.type('o');
    await page.waitForTimeout(100);
    const pageFirstTyped = await panelInfo(scope);
    check('image : « o » tapé au clavier garde la table de la page en tête (CsSites.Logo, puis CsPieces.Photo_01 à 12)',
      !!pageFirstTyped && pageFirstTyped.rows.length === 13 && pageFirstTyped.rows[0] === 'CsSites.Logo' && pageFirstTyped.rows[1] === 'CsPieces.Photo_01', pageFirstTyped);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    images = await inserted();
    check('image : Entrée insère l’image de CsSites.Logo, la première ligne de la liste, et la referme',
      images.length === 3 && images[2].key === 'CsSites.Logo' && await hostGone(), images);
    await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200, Echeance: 631152000, Actif: true }, 'CsDossiers'));
    await parkMouse();
  },

  // Liste « # » du corps (Antoine, 2026-10-01 : « prioriser dans la recherche dynamique les noms qui sont dans la table en cours ») : à la vraie frappe à 700×400, les colonnes
  // de la table de la page (CsDossiers, deuxième du schéma derrière CsAnnuaire) ouvrent la liste, avec ce qui est tapé comme sans ; au vrai clavier, les flèches et Entrée suivent
  // l'ordre affiché, et la liste, qui défile (50 clés pour une dizaine de lignes visibles), garde la ligne choisie entière (demande d'Antoine du 2026-10-04 : « Oui, la liste suit »).
  // La limite de 50 clés (appliquée après le classement) et la zone répétée par une boucle sont dans les scénarios de la page (colsearch_hash_list_*).
  async hashList() {
    const box = '#autocomplete-box';
    const listed = () => page.evaluate(sel => {
      const el = document.querySelector(sel);
      if (!el || el.style.display === 'none') return null;
      const r = el.getBoundingClientRect();
      return {
        rows: Array.from(el.querySelectorAll('.ac-item')).map(i => i.textContent), selected: (el.querySelector('.ac-item.selected') || {}).textContent || null,
        inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      };
    }, box);
    const badgeKeys = () => page.evaluate(() => {
      const out = [];
      EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'varBadge') out.push(node.attrs.key); });
      return out;
    });
    await page.evaluate(() => Editor.setHTML('<p></p>'));
    await parkMouse();
    const paragraph = await hitTest('.tiptap p');
    check('« # » : le paragraphe vide, où le clic va tomber, est au premier plan (aucun menu de la barre resté ouvert dessus)', paragraph.found && paragraph.inViewport && paragraph.onTop, paragraph);
    await page.mouse.click(paragraph.x, paragraph.y);
    await page.waitForTimeout(150);
    await page.keyboard.type('#');
    await page.waitForTimeout(250);
    const opened = await listed();
    const firstRow = await hitTest(box + ' .ac-item');
    const dossiers = ['Titre', 'Statut', 'Responsable', 'Montant', 'Echeance', 'Actif'].map(c => 'CsDossiers.' + c);
    check('« # » : la liste s’ouvre sur les colonnes de la table de la page (CsDossiers), avant celles de CsAnnuaire, première dans le schéma, puis des autres tables',
      !!opened && JSON.stringify(opened.rows.slice(0, 6)) === JSON.stringify(dossiers) && opened.rows[6] === 'CsAnnuaire.NomPrenom' && opened.rows.length === 50, opened);
    check('« # » : la liste est entière dans le panneau et sa première ligne (CsDossiers.Titre) est visible et au premier plan',
      !!opened && opened.inside && firstRow.found && firstRow.inViewport && firstRow.onTop && opened.selected === 'CsDossiers.Titre', { opened: opened && { inside: opened.inside, selected: opened.selected }, firstRow });
    // La ligne choisie, mesurée dans la partie VISIBLE de la liste (celle de `.ac-items`, qui défile) : entière et au premier plan, pas seulement « choisie ».
    const selectedRow = () => page.evaluate(sel => {
      const list = document.querySelector(sel + ' .ac-items');
      const row = list && list.querySelector('.ac-item.selected');
      if (!row) return null;
      const l = list.getBoundingClientRect(), r = row.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { text: row.textContent, entire: r.top >= l.top - 0.5 && r.bottom <= l.bottom + 0.5 && !!hit && (hit === row || row.contains(hit)), scrollTop: list.scrollTop };
    }, box);
    const stepsDown = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(40);
      stepsDown.push(await selectedRow());
    }
    check('« # » : vingt flèches bas de suite, la ligne choisie reste entière et au premier plan dans la liste, qui défile pour la suivre',
      stepsDown.every(step => !!step && step.entire) && stepsDown[19].text === opened.rows[20] && stepsDown[19].scrollTop > 0, { hiddenAt: stepsDown.findIndex(step => !step || !step.entire) + 1, last: stepsDown[19] });
    // La molette sur la liste, puis la souris rangée : un filtre tapé ensuite remet la liste en haut, sur sa première ligne (sinon la ligne choisie resterait cachée au-dessus).
    const wheelOver = await hitTest(box + ' .ac-items');
    await page.mouse.move(wheelOver.x, wheelOver.y);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(150);
    await parkMouse();
    await page.keyboard.type('re');
    await page.waitForTimeout(150);
    const typed = await listed();
    const afterTyping = await selectedRow();
    check('« # » : un filtre tapé après avoir fait défiler la liste la remet en haut : la première ligne (CsDossiers.Titre) est choisie, entière et au premier plan',
      !!afterTyping && afterTyping.text === 'CsDossiers.Titre' && afterTyping.entire && afterTyping.scrollTop === 0, afterTyping);
    // Ce que la règle donne pour « re » : les clés de la table de la page, puis celles des autres tables dans l'ordre du schéma (les sections d'avant laissent leurs tables).
    const expectedTyped = await page.evaluate(() => {
      const current = GristAPI.getCurrentTableId();
      const keys = GristAPI.getAllVariables().filter(v => v.key.toLowerCase().includes('re'));
      return keys.filter(v => v.table === current).concat(keys.filter(v => v.table !== current)).map(v => v.key).slice(0, 50);
    });
    check('« # » : « re » tapé garde la table de la page en tête (CsDossiers.Titre, CsDossiers.Responsable), puis CsAnnuaire et les autres tables dans l’ordre du schéma',
      !!typed && JSON.stringify(typed.rows.slice(0, 3)) === JSON.stringify(['CsDossiers.Titre', 'CsDossiers.Responsable', 'CsAnnuaire.NomPrenom']) && JSON.stringify(typed.rows) === JSON.stringify(expectedTyped), { typed, expectedTyped });
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(80);
    const down = await listed();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(80);
    const back = await listed();
    check('« # » : la flèche bas descend d’une ligne dans l’ordre affiché (CsDossiers.Responsable), la flèche haut revient à la première',
      !!down && down.selected === 'CsDossiers.Responsable' && !!back && back.selected === 'CsDossiers.Titre', { down: down && down.selected, back: back && back.selected });
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(80);
    const wrappedUp = await selectedRow();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(80);
    const wrappedDown = await selectedRow();
    check('« # » : depuis la première ligne, la flèche haut passe à la dernière et la montre entière ; la flèche bas revient à la première, entière aussi, liste en haut',
      !!wrappedUp && wrappedUp.entire && wrappedUp.text === typed.rows[typed.rows.length - 1] && !!wrappedDown && wrappedDown.entire && wrappedDown.text === 'CsDossiers.Titre' && wrappedDown.scrollTop === 0,
      { wrappedUp, wrappedDown });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    const keys = await badgeKeys();
    const closed = await listed();
    check('« # » : Entrée insère la colonne de la table de la page en première ligne (CsDossiers.Titre) et ferme la liste', JSON.stringify(keys) === JSON.stringify(['CsDossiers.Titre']) && closed === null, { keys, closed });
    // Le champ « Nom du PDF » est un <input> : sa liste est la même, ses flèches passent par un autre gestionnaire du clavier. La liste y suit aussi, et un vrai clic sur une ligne
    // (la ligne remontée par ↑ jusqu'à la 6e) l'écrit dans le champ.
    const pdfToggle = await hitTest('#btn-toggle-pdf-filename');
    await page.mouse.click(pdfToggle.x, pdfToggle.y);
    await page.waitForTimeout(150);
    await page.keyboard.type('#');
    await page.waitForTimeout(250);
    const pdfDown = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(40);
      pdfDown.push(await selectedRow());
    }
    check('« # » du champ Nom du PDF : vingt flèches bas de suite, la ligne choisie reste entière et au premier plan dans la liste, qui défile pour la suivre',
      pdfDown.every(step => !!step && step.entire) && pdfDown[19].scrollTop > 0, { hiddenAt: pdfDown.findIndex(step => !step || !step.entire) + 1, last: pdfDown[19] });
    for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(80);
    const pdfRow = await page.evaluate(sel => {
      const row = Array.from(document.querySelectorAll(sel + ' .ac-item')).find(i => i.textContent === 'CsDossiers.Actif');
      if (!row) return null;
      const r = row.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
      return { x, y, onTop: !!hit && (hit === row || row.contains(hit)), selected: row.classList.contains('selected') };
    }, box);
    if (pdfRow) await page.mouse.click(pdfRow.x, pdfRow.y);
    await page.waitForTimeout(250);
    const pdfValue = await page.evaluate(() => document.getElementById('pdf-filename-template').value);
    check('« # » du champ Nom du PDF : après les flèches, un vrai clic sur la ligne CsDossiers.Actif (choisie et au premier plan) écrit « #CsDossiers.Actif » dans le champ et ferme la liste',
      !!pdfRow && pdfRow.onTop && pdfRow.selected && pdfValue === '#CsDossiers.Actif' && (await listed()) === null, { pdfRow, pdfValue });
    await page.evaluate(() => {
      const field = document.getElementById('pdf-filename-template');
      field.value = '';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.blur();
    });
    await parkMouse();
    await page.evaluate(() => {
      const badge = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;
      Editor.setHTML(`<p>Objet : ${badge('CsDossiers', 'Titre')}</p><p>Lignes : ${badge('CsLignes', 'Designation')}.</p>`);
    });
    await page.waitForTimeout(250);
  },

  // Valeurs possibles d'une colonne Choix ou Référence dans le champ Valeur d'une règle (Antoine, 2026-09-29 : « quand on indique une colonne à choix ou à référence,
  // mettre de l'autocompletion ou un dropdown des valeurs possibles ») : à la vraie souris, dans la fenêtre de condition et dans le macro-modèle, en clair et en sombre.
  // Une liste de 1 201 valeurs (une Référence vers une grande table) ne pose que 500 lignes et le dit. Avant withoutComponent : elle ajoute des tables, et rend la page.
  async values() {
    const macro = '#macro-editor-modal';
    const previousTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.evaluate(async () => {
      const stub = window.__gristStub;
      window.__csValuesCached = Templates.getCached;
      Templates.getCached = () => [{ id: 11, nom: 'Notification_base', typeModele: 'document' }, { id: 12, nom: 'Notification_bureau', typeModele: 'document' }];
      stub.setVariables('CsClients', { Nom: 'Text' });
      const clients = [{ id: 5000, Nom: 'Zola Émile' }];
      for (let i = 1; i <= 1200; i++) clients.push({ id: 100 + i, Nom: 'Client ' + String(i).padStart(4, '0') });
      stub.setRows('CsClients', clients);
      stub.setRows('CsAnnuaire', [
        { id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44', Naissance: 631152000 }, { id: 8, NomPrenom: 'Martin Paul', Telephone: '', Naissance: null },
        { id: 9, NomPrenom: 'Zola Émile', Telephone: '', Naissance: null }, { id: 10, NomPrenom: 'Bernard Léa', Telephone: '', Naissance: null },
        { id: 11, NomPrenom: 'Dupont Jean ', Telephone: '', Naissance: null },
      ]);
      stub.setVariables('CsSuivi', { Titre: 'Text', Priorite: 'Choice', Responsable: 'Ref:CsAnnuaire', Client: 'Ref:CsClients' }, { Priorite: ['Haute', 'Normale', 'Basse'] }, undefined,
        { Responsable: 'NomPrenom', Client: 'Nom' });
      stub.setRows('CsSuivi', [{ id: 1, Titre: 'Suivi A', Priorite: 'Haute', Responsable: 7, Client: 101 }]);
      await GristAPI.refreshSchema();
      stub.fireRecord({ id: 1, Titre: 'Suivi A', Priorite: 'Haute', Responsable: 'Dupont Jean', Client: 'Client 0001' }, 'CsSuivi');
    });
    // Lecture d'une propriété d'un élément qui peut manquer (ancien code : pas de liste) : null, pas d'exception.
    await page.evaluate(() => { window.__csQ = (selector, property) => { const el = document.querySelector(selector); return el ? el[property] : null; }; });
    const freshDocument = async () => {
      await page.evaluate(() => Editor.setHTML('<p>Objet : <span class="var-badge" data-table="CsSuivi" data-column="Titre" data-key="CsSuivi.Titre"></span></p>'));
      await page.waitForTimeout(250);
    };
    // Clic réel au centre d'un champ mesuré par hitTest ; sans champ (ancien code, liste absente) rien ne part et les mesures suivantes échouent une à une, au lieu d'un plantage.
    const clickAt = async box => { if (box && typeof box.x === 'number' && box.width > 0) await page.mouse.click(box.x, box.y); };
    const savedConditions = () => page.evaluate(() => {
      const out = [];
      EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'varBadge') out.push(node.attrs.condition); });
      return out;
    });
    // La colonne de la première règle choisie comme le ferait une personne : clic sur le champ, frappe, clic sur la ligne. La lecture de la table liée d'une
    // Référence a le temps d'aboutir avant la suite.
    const pickColumn = async (scope, typed, column) => {
      const field = await reveal(scope + ' .macro-rule-column-wrap .ss-trigger', scope + ' .modal-content');
      await clickAt(field);
      await page.waitForTimeout(150);
      await page.keyboard.type(typed);
      await page.waitForTimeout(100);
      const row = await rowCenter(scope, column);
      if (row) await page.mouse.click(row.x, row.y);
      await page.waitForTimeout(350);
    };
    const valueTrigger = scope => scope + ' .macro-rule-value-wrap .ss-trigger';
    const closeWith = async (scope, selector) => {
      const button = await reveal(selector, scope + ' .modal-content');
      if (button.found) await page.mouse.click(button.x, button.y);
      await page.waitForTimeout(250);
    };
    const cancelOf = scope => scope + ' .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)';
    const saveOf = scope => scope + ' .var-modal-actions .var-modal-primary';
    const contrastOf = selector => page.evaluate(sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const parse = c => (c.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
      const luminance = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      let background = null;
      for (let node = el; node && !background; node = node.parentElement) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c.length >= 3 && (c.length === 3 || c[3] > 0.99)) background = c;
      }
      const a = luminance(parse(getComputedStyle(el).color)), b = luminance(background || [255, 255, 255]);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }, selector);
    const dimming = scope => page.evaluate(sel => {
      const slot = document.querySelector(sel + ' .macro-rule-value-slot');
      const trigger = slot && slot.querySelector('.ss-trigger');
      return trigger ? { slot: getComputedStyle(slot).opacity, trigger: getComputedStyle(trigger).opacity, disabled: trigger.disabled } : null;
    }, scope);
    const CHOOSE = '— Choisir une valeur —', OTHER = 'Autre valeur…';
    for (const theme of ['light', 'dark']) {
      const label = theme === 'dark' ? 'sombre' : 'clair';
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(100);

      // Fenêtre de condition, colonne à choix.
      await freshDocument();
      await openWindowFor('Titre', 'var-condition', cond);
      await pickColumn(cond, 'prio', 'Priorite');
      const field = await reveal(valueTrigger(cond), cond + ' .modal-content');
      const nativeValue = await hitTest(cond + ' select.macro-rule-value');
      check(`valeurs (${label}) : condition, colonne à choix : le champ Valeur est une liste (visible, au premier plan, lisible), le <select> natif est masqué`,
        field.found && field.inViewport && field.onTop && field.width > 80 && nativeValue.width === 0, { field, nativeValue });
      await clickAt(field);
      await page.waitForTimeout(150);
      const open = await panelInfo(cond);
      check(`valeurs (${label}) : condition : un vrai clic ouvre la liste des choix, entièrement dans le panneau, la zone de recherche a le focus, « Autre valeur… » en dernier`,
        !!open && open.inside && open.searchFocused && JSON.stringify(open.rows) === JSON.stringify([CHOOSE, 'Haute', 'Normale', 'Basse', OTHER]), open);
      await page.keyboard.type('nor');
      await page.waitForTimeout(100);
      const typed = await panelInfo(cond);
      check(`valeurs (${label}) : condition : « nor » réduit la liste à Normale, « Autre valeur… » reste`, !!typed && JSON.stringify(typed.rows) === JSON.stringify(['Normale', OTHER]), typed);
      const normal = await rowCenter(cond, 'Normale');
      if (normal) await page.mouse.click(normal.x, normal.y);
      await page.waitForTimeout(150);
      const chosen = await page.evaluate(() => ({
        value: __csQ('#var-condition-modal select.macro-rule-value', 'value'), shown: __csQ('#var-condition-modal .macro-rule-value-wrap .ss-trigger', 'textContent'),
        listOpen: !!document.querySelector('#var-condition-modal .ss-panel:not([hidden])'), windowOpen: document.getElementById('var-condition-modal').style.display !== 'none',
      }));
      check(`valeurs (${label}) : condition : le clic sur Normale choisit le choix, ferme la liste, la fenêtre reste ouverte`, !!normal && normal.onTop && chosen.value === 'Normale' && chosen.shown === 'Normale' && !chosen.listOpen && chosen.windowOpen, { normal, chosen });
      // « vide » : le champ Valeur ne sert pas, il est grisé UNE fois (le conteneur, pas en plus le champ) et ne s'ouvre plus ; « = » le rend.
      await page.selectOption(cond + ' .macro-rule-row > select', 'vide');
      await page.waitForTimeout(150);
      const greyed = await dimming(cond);
      const greyedBox = await hitTest(valueTrigger(cond));
      await clickAt(greyedBox);
      await page.waitForTimeout(150);
      const openedWhenGreyed = !!(await panelInfo(cond));
      await page.selectOption(cond + ' .macro-rule-row > select', '=');
      await page.waitForTimeout(150);
      const back = await dimming(cond);
      check(`valeurs (${label}) : condition : « vide » grise la liste une seule fois (conteneur à 0,45, champ à 1), elle ne s'ouvre plus au clic ; « = » la rend`,
        !!greyed && greyed.slot === '0.45' && greyed.trigger === '1' && greyed.disabled && !openedWhenGreyed && !!back && back.slot === '1' && back.trigger === '1' && !back.disabled, { greyed, openedWhenGreyed, back });
      // « Autre valeur… » : le champ libre apparaît avec le focus, la frappe réelle s'y fait, la valeur s'enregistre.
      const field2 = await hitTest(valueTrigger(cond));
      await clickAt(field2);
      await page.waitForTimeout(150);
      const other = await rowCenter(cond, OTHER);
      if (other) await page.mouse.click(other.x, other.y);
      await page.waitForTimeout(150);
      await page.keyboard.type('Critique');
      const free = await page.evaluate(() => {
        const input = document.querySelector('#var-condition-modal .macro-rule-value-advanced');
        if (!input) return { hidden: true, focused: false, value: null, width: 0 };
        return { hidden: input.hidden, focused: document.activeElement === input, value: input.value, width: input.getBoundingClientRect().width };
      });
      check(`valeurs (${label}) : condition : « Autre valeur… » montre le champ libre (focus, lisible), la frappe s'y fait`, !!other && other.onTop && !free.hidden && free.focused && free.value === 'Critique' && free.width > 60, { other, free });
      await closeWith(cond, saveOf(cond));
      const saved = await savedConditions();
      check(`valeurs (${label}) : condition : Enregistrer garde la règle « Priorite = Critique »`,
        !!saved[0] && saved[0].rules.length === 1 && saved[0].rules[0].column === 'Priorite' && saved[0].rules[0].operator === '=' && saved[0].rules[0].value === 'Critique', saved);

      // Colonne Référence : les valeurs affichées de la table liée, jamais l'id de la ligne.
      await freshDocument();
      await openWindowFor('Titre', 'var-condition', cond);
      await pickColumn(cond, 'resp', 'Responsable');
      const refField = await reveal(valueTrigger(cond), cond + ' .modal-content');
      await clickAt(refField);
      await page.waitForTimeout(150);
      const refOpen = await panelInfo(cond);
      check(`valeurs (${label}) : condition, colonne Référence : la liste propose les noms de la table liée, triés, sans doublon, dans le panneau`,
        !!refOpen && refOpen.inside && JSON.stringify(refOpen.rows) === JSON.stringify([CHOOSE, 'Bernard Léa', 'Dupont Jean', 'Martin Paul', 'Zola Émile', OTHER]), refOpen);
      await page.keyboard.type('zo');
      await page.waitForTimeout(100);
      const zola = await rowCenter(cond, 'Zola Émile');
      if (zola) await page.mouse.click(zola.x, zola.y);
      await page.waitForTimeout(150);
      await closeWith(cond, saveOf(cond));
      const savedRef = await savedConditions();
      check(`valeurs (${label}) : condition, colonne Référence : « zo » puis un vrai clic sur Zola Émile, et Enregistrer garde le nom (pas l'id)`,
        !!zola && zola.onTop && !!savedRef[0] && savedRef[0].rules[0].column === 'Responsable' && savedRef[0].rules[0].value === 'Zola Émile', { zola, savedRef });

      // Très grande table liée : 500 lignes dans la page, une ligne qui dit d'affiner, la recherche atteint le reste.
      await freshDocument();
      await openWindowFor('Titre', 'var-condition', cond);
      await pickColumn(cond, 'clien', 'Client');
      const bigField = await reveal(valueTrigger(cond), cond + ' .modal-content');
      const startedAt = Date.now();
      await clickAt(bigField);
      await page.waitForFunction(() => !!document.querySelector('#var-condition-modal .ss-panel:not([hidden]) .ss-option'), null, { timeout: 4000 }).catch(() => {});
      const openedIn = Date.now() - startedAt;
      const bigOpen = await panelInfo(cond);
      const moreLine = await page.evaluate(() => { const line = document.querySelector('#var-condition-modal .ss-panel .ss-more'); return line ? line.textContent : null; });
      check(`valeurs (${label}) : condition, 1 201 valeurs : 500 lignes posées (+ « Choisir » et « Autre valeur… »), la ligne « Encore 701 résultats » les suit, la liste s'ouvre vite`,
        !!bigOpen && bigOpen.inside && bigOpen.rows.length === 502 && bigOpen.rows[1] === 'Client 0001' && bigOpen.rows[500] === 'Client 0500' && bigOpen.rows[501] === OTHER
        && moreLine === 'Encore 701 résultats : précisez la recherche.' && openedIn < 2000, { openedIn, rows: bigOpen && bigOpen.rows.length, moreLine });
      // Molette réelle jusqu'au bas de la liste : la ligne « Encore… » et « Autre valeur… » se voient, non recouvertes.
      const bigList = await hitTest(cond + ' .ss-panel:not([hidden]) .ss-list');
      if (typeof bigList.x === 'number') await page.mouse.move(bigList.x, bigList.y);
      for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, 40000);
        await page.waitForTimeout(80);
      }
      const bottom = await page.evaluate(() => {
        const list = document.querySelector('#var-condition-modal .ss-panel:not([hidden]) .ss-list');
        const line = list && list.querySelector('.ss-more');
        if (!line) return { atBottom: !!list && list.scrollTop + list.clientHeight >= list.scrollHeight - 2, lineInside: false, lineOnTop: false };
        const lineBox = line.getBoundingClientRect(), listBox = list.getBoundingClientRect();
        const hit = document.elementFromPoint((lineBox.left + lineBox.right) / 2, (lineBox.top + lineBox.bottom) / 2);
        return { atBottom: list.scrollTop + list.clientHeight >= list.scrollHeight - 2, lineInside: lineBox.top >= listBox.top - 0.5 && lineBox.bottom <= listBox.bottom + 0.5, lineOnTop: !!hit && (hit === line || line.contains(hit)) };
      });
      const otherBottom = await rowCenter(cond, OTHER);
      const moreContrast = await contrastOf(cond + ' .ss-panel:not([hidden]) .ss-more');
      check(`valeurs (${label}) : condition, 1 201 valeurs : à la molette, le bas de la liste montre « Encore… » puis « Autre valeur… », au premier plan ; le texte de la ligne est lisible (contraste 4,5:1)`,
        bottom.atBottom && bottom.lineInside && bottom.lineOnTop && !!otherBottom && otherBottom.onTop && otherBottom.inViewport && moreContrast >= 4.5, { bottom, otherBottom, moreContrast });
      await page.keyboard.type('zola');
      await page.waitForTimeout(150);
      const beyond = await panelInfo(cond);
      const beyondRow = await rowCenter(cond, 'Zola Émile');
      check(`valeurs (${label}) : condition, 1 201 valeurs : « zola » trouve une valeur au-delà des 500 premières lignes, sans la ligne « Encore… »`,
        !!beyond && JSON.stringify(beyond.rows) === JSON.stringify(['Zola Émile', OTHER]) && !(await page.evaluate(() => !!document.querySelector('#var-condition-modal .ss-panel .ss-more'))), beyond);
      if (beyondRow) await page.mouse.click(beyondRow.x, beyondRow.y);
      await page.waitForTimeout(150);
      const beyondChosen = await page.evaluate(() => ({ value: __csQ('#var-condition-modal select.macro-rule-value', 'value'), shown: __csQ('#var-condition-modal .macro-rule-value-wrap .ss-trigger', 'textContent') }));
      check(`valeurs (${label}) : condition, 1 201 valeurs : un vrai clic sur cette valeur la choisit`, !!beyondRow && beyondRow.onTop && beyondChosen.value === 'Zola Émile' && beyondChosen.shown === 'Zola Émile', { beyondRow, beyondChosen });
      await closeWith(cond, cancelOf(cond));

      // Macro-modèle : la règle d'une annexe, sur ses deux lignes.
      await page.evaluate(() => MacroEditor.openModal(null));
      await page.waitForTimeout(200);
      await reveal('#macro-editor-add-slot', macro + ' .modal-content');
      await clickCenter('#macro-editor-add-slot');
      await pickColumn(macro, 'prio', 'Priorite');
      const macroField = await reveal(valueTrigger(macro), macro + ' .modal-content');
      const macroRule = await ruleBoxes(macro);
      check(`valeurs (${label}) : macro-modèle : le champ Valeur (colonne à choix) est une liste lisible (90 px), sur la seconde ligne sous la colonne, au premier plan`,
        macroField.found && macroField.inViewport && macroField.onTop && macroField.width >= 90 && !!macroRule && macroRule.twoLines && macroRule.boxes.value.t >= macroRule.boxes.column.b - 1 && overlapping(macroRule.boxes).length === 0,
        { macroField, macroRule });
      await clickAt(macroField);
      await page.waitForTimeout(150);
      const macroOpen = await panelInfo(macro);
      check(`valeurs (${label}) : macro-modèle : la liste des choix s'ouvre entièrement dans le panneau, la zone de recherche a le focus`,
        !!macroOpen && macroOpen.inside && macroOpen.searchFocused && JSON.stringify(macroOpen.rows) === JSON.stringify([CHOOSE, 'Haute', 'Normale', 'Basse', OTHER]), macroOpen);
      await page.keyboard.type('hau');
      await page.waitForTimeout(100);
      const haute = await rowCenter(macro, 'Haute');
      if (haute) await page.mouse.click(haute.x, haute.y);
      await page.waitForTimeout(150);
      const macroChosen = await page.evaluate(() => ({
        value: __csQ('#macro-editor-modal select.macro-rule-value', 'value'), shown: __csQ('#macro-editor-modal .macro-rule-value-wrap .ss-trigger', 'textContent'),
        listOpen: !!document.querySelector('#macro-editor-modal .ss-panel:not([hidden])'),
      }));
      check(`valeurs (${label}) : macro-modèle : « hau » puis un vrai clic sur Haute choisit le choix et ferme la liste`, !!haute && haute.onTop && macroChosen.value === 'Haute' && macroChosen.shown === 'Haute' && !macroChosen.listOpen, { haute, macroChosen });
      await closeWith(macro, '#macro-editor-cancel');
    }
    await page.evaluate(theme => {
      Templates.getCached = window.__csValuesCached;
      if (theme) document.documentElement.setAttribute('data-theme', theme); else document.documentElement.removeAttribute('data-theme');
      const stub = window.__gristStub;
      stub.setRows('CsAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44', Naissance: 631152000 }]);
      stub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200, Echeance: 631152000, Actif: true }, 'CsDossiers');
    }, previousTheme);
  },

  // Champ Valeur d'une colonne Oui / Non (Antoine, 2026-10-01 : « si la colonne est une boolean, proposer la liste déroulante oui/non avec les mots qui vont
  // exactement correspondre à la valeur stockée sur Grist (ou traduite) ; limiter les entrées manuelles ») : la liste de deux mots, sans « Autre valeur… » ni champ
  // libre, au vrai clic et au vrai clavier à 700x400, dans la fenêtre de condition et le macro-modèle, en clair et en sombre ; une valeur enregistrée que la
  // comparaison ne lit pas reste visible avec sa mention ; les mots suivent la langue. Les opérateurs sans sens sur une colonne Oui / Non (« > », « < », « ≥ »,
  // « ≤ » et « contient », carte « Griser » d'Antoine, 2026-10-01) sont grisés dans la liste native des opérateurs, jamais retirés : le vrai clavier les saute,
  // un opérateur déjà enregistré reste affiché et choisi, le macro-modèle les grise aussi.
  async boolValues() {
    const macro = '#macro-editor-modal';
    const previousTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.evaluate(() => {
      window.__csBoolCached = Templates.getCached;
      Templates.getCached = () => [{ id: 11, nom: 'Notification_base', typeModele: 'document' }, { id: 12, nom: 'Notification_bureau', typeModele: 'document' }];
      // Lecture d'une propriété d'un élément qui peut manquer : null, pas d'exception.
      window.__csQ = (selector, property) => { const el = document.querySelector(selector); return el ? el[property] : null; };
    });
    // Une bulle sur CsDossiers.Titre, sans condition ou avec « Actif = valeur » déjà enregistrée (écrite avant la liste, ou à la main) ; `operator` : un autre que « = ».
    const freshDocument = async (value, operator = '=') => {
      const condition = value === undefined ? '' : ' data-condition="' + JSON.stringify({ mode: 'all', rules: [{ column: 'Actif', operator, value }] }).replace(/"/g, '&quot;') + '"';
      await page.evaluate(html => Editor.setHTML(html), `<p>Objet : <span class="var-badge" data-table="CsDossiers" data-column="Titre" data-key="CsDossiers.Titre"${condition}></span></p>`);
      await page.waitForTimeout(250);
    };
    const clickAt = async box => { if (box && typeof box.x === 'number' && box.width > 0) await page.mouse.click(box.x, box.y); };
    const savedConditions = () => page.evaluate(() => {
      const out = [];
      EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'varBadge') out.push(node.attrs.condition); });
      return out;
    });
    // La colonne de la première règle choisie comme le ferait une personne : clic sur le champ, frappe, clic sur la ligne.
    const pickColumn = async (scope, typed, column) => {
      const field = await reveal(scope + ' .macro-rule-column-wrap .ss-trigger', scope + ' .modal-content');
      await clickAt(field);
      await page.waitForTimeout(150);
      await page.keyboard.type(typed);
      await page.waitForTimeout(100);
      const row = await rowCenter(scope, column);
      if (row) await page.mouse.click(row.x, row.y);
      await page.waitForTimeout(350);
    };
    const valueTrigger = scope => scope + ' .macro-rule-value-wrap .ss-trigger';
    const closeWith = async (scope, selector) => {
      const button = await reveal(selector, scope + ' .modal-content');
      if (button.found) await page.mouse.click(button.x, button.y);
      await page.waitForTimeout(250);
    };
    const cancelOf = scope => scope + ' .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)';
    const saveOf = scope => scope + ' .var-modal-actions .var-modal-primary';
    const dimming = scope => page.evaluate(sel => {
      const slot = document.querySelector(sel + ' .macro-rule-value-slot');
      const trigger = slot && slot.querySelector('.ss-trigger');
      return trigger ? { slot: getComputedStyle(slot).opacity, trigger: getComputedStyle(trigger).opacity, disabled: trigger.disabled } : null;
    }, scope);
    // Le champ Valeur de la première règle : ce qu'il montre fermé (nom et mention), s'il y a un champ libre.
    const valueState = scope => page.evaluate(sel => {
      const trigger = document.querySelector(sel + ' .macro-rule-value-wrap .ss-trigger');
      return {
        value: __csQ(sel + ' select.macro-rule-value', 'value'), name: trigger && trigger.querySelector('.ss-name').textContent, hint: trigger && trigger.querySelector('.ss-hint').textContent,
        listOpen: !!document.querySelector(sel + ' .ss-panel:not([hidden])'), free: !!document.querySelector(sel + ' input.macro-rule-value'), advanced: !!document.querySelector(sel + ' .macro-rule-value-advanced'),
        windowOpen: document.querySelector(sel).style.display !== 'none',
      };
    }, scope);
    // La liste des opérateurs de la première règle (le <select> sans classe de la ligne) : ses lignes, celles qui sont grisées, celle qui est choisie et si elle l'est.
    const operatorList = scope => page.evaluate(sel => {
      const row = document.querySelector(sel + ' .macro-rule-row');
      const select = row && Array.from(row.querySelectorAll('select')).find(s => !s.matches('.macro-rule-column, .macro-rule-modele, .macro-rule-value'));
      if (!select) return null;
      return {
        all: Array.from(select.options).map(o => o.value), greyed: Array.from(select.options).filter(o => o.disabled).map(o => o.value),
        value: select.value, shownGreyed: !!select.selectedOptions[0] && select.selectedOptions[0].disabled,
      };
    }, scope);
    const operatorValue = scope => page.evaluate(sel => {
      const row = document.querySelector(sel + ' .macro-rule-row');
      const select = row && Array.from(row.querySelectorAll('select')).find(s => !s.matches('.macro-rule-column, .macro-rule-modele, .macro-rule-value'));
      return select ? select.value : null;
    }, scope);
    const focusOperator = scope => page.evaluate(sel => {
      const row = document.querySelector(sel + ' .macro-rule-row');
      const select = row && Array.from(row.querySelectorAll('select')).find(s => !s.matches('.macro-rule-column, .macro-rule-modele, .macro-rule-value'));
      if (select) select.focus();
      return !!select && document.activeElement === select;
    }, scope);
    const ALL_OPERATORS = ['=', '≠', '>', '<', '≥', '≤', 'contient', 'vide', 'non vide'];
    const GREYED_OPERATORS = ['>', '<', '≥', '≤', 'contient'];
    const CHOOSE = '— Choisir une valeur —';
    for (const theme of ['light', 'dark']) {
      const label = theme === 'dark' ? 'sombre' : 'clair';
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(100);

      // Fenêtre de condition, colonne Oui / Non.
      await freshDocument();
      await openWindowFor('Titre', 'var-condition', cond);
      await pickColumn(cond, 'acti', 'Actif');
      const field = await reveal(valueTrigger(cond), cond + ' .modal-content');
      const nativeValue = await hitTest(cond + ' select.macro-rule-value');
      const closed = await valueState(cond);
      check(`oui/non (${label}) : condition, colonne Oui / Non : le champ Valeur est une liste (visible, au premier plan, lisible), le <select> natif est masqué, aucun champ libre`,
        field.found && field.inViewport && field.onTop && field.width > 80 && nativeValue.width === 0 && closed.name === CHOOSE && !closed.free && !closed.advanced, { field, nativeValue, closed });
      await clickAt(field);
      await page.waitForTimeout(150);
      const open = await panelInfo(cond);
      check(`oui/non (${label}) : condition : un vrai clic ouvre la liste Choisir / Oui / Non, rien d'autre (ni « Autre valeur… »), entièrement dans le panneau, sans défilement, la zone de recherche a le focus`,
        !!open && open.inside && open.searchFocused && !open.scrollable && JSON.stringify(open.rows) === JSON.stringify([CHOOSE, 'Oui', 'Non']), open);
      await page.keyboard.type('no');
      await page.waitForTimeout(100);
      const typed = await panelInfo(cond);
      check(`oui/non (${label}) : condition : « no » réduit la liste à Non`, !!typed && JSON.stringify(typed.rows) === JSON.stringify(['Non']), typed);
      const non = await rowCenter(cond, 'Non');
      if (non) await page.mouse.click(non.x, non.y);
      await page.waitForTimeout(150);
      const chosen = await valueState(cond);
      check(`oui/non (${label}) : condition : le clic sur Non choisit Non, ferme la liste, la fenêtre reste ouverte`, !!non && non.onTop && chosen.value === 'Non' && chosen.name === 'Non' && !chosen.listOpen && chosen.windowOpen, { non, chosen });
      // Au clavier : le champ a le focus, une lettre ouvre la liste avec elle comme recherche, Entrée prend le premier résultat.
      await page.evaluate(sel => { const el = document.querySelector(sel); if (el) el.focus(); }, valueTrigger(cond));
      await page.keyboard.type('ou');
      await page.waitForTimeout(100);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(150);
      const byKeyboard = await valueState(cond);
      const focusBack = await page.evaluate(sel => document.activeElement === document.querySelector(sel), valueTrigger(cond));
      check(`oui/non (${label}) : condition : au clavier, « ou » puis Entrée choisit Oui, la liste se ferme et le champ garde le focus`, byKeyboard.value === 'Oui' && byKeyboard.name === 'Oui' && !byKeyboard.listOpen && focusBack, { byKeyboard, focusBack });
      // « vide » : la liste ne sert pas, elle est grisée UNE fois (le conteneur, pas en plus le champ) et ne s'ouvre plus ; « = » la rend.
      await page.selectOption(cond + ' .macro-rule-row > select', 'vide');
      await page.waitForTimeout(150);
      const greyed = await dimming(cond);
      await clickAt(await hitTest(valueTrigger(cond)));
      await page.waitForTimeout(150);
      const openedWhenGreyed = !!(await panelInfo(cond));
      await page.selectOption(cond + ' .macro-rule-row > select', '=');
      await page.waitForTimeout(150);
      const back = await dimming(cond);
      check(`oui/non (${label}) : condition : « vide » grise la liste une seule fois (conteneur à 0,45, champ à 1), elle ne s'ouvre plus au clic ; « = » la rend`,
        !!greyed && greyed.slot === '0.45' && greyed.trigger === '1' && greyed.disabled && !openedWhenGreyed && !!back && back.slot === '1' && back.trigger === '1' && !back.disabled, { greyed, openedWhenGreyed, back });
      await closeWith(cond, saveOf(cond));
      const saved = await savedConditions();
      check(`oui/non (${label}) : condition : Enregistrer garde la règle « Actif = Oui »`,
        !!saved[0] && saved[0].rules.length === 1 && saved[0].rules[0].column === 'Actif' && saved[0].rules[0].operator === '=' && saved[0].rules[0].value === 'Oui', saved);

      // Opérateurs : les cinq sans sens sont grisés (la liste garde ses neuf lignes), le vrai clavier les saute, et le choix d'un autre opérateur reste libre.
      await freshDocument();
      await openWindowFor('Titre', 'var-condition', cond);
      await pickColumn(cond, 'acti', 'Actif');
      const operatorBox = await reveal(cond + ' .macro-rule-row > select', cond + ' .modal-content');
      const operators = await operatorList(cond);
      check(`oui/non (${label}) : condition, colonne Oui / Non : le choix de l'opérateur est visible et au premier plan, ses neuf lignes sont gardées dans le même ordre et « > », « < », « ≥ », « ≤ », « contient » sont grisés (jamais retirés)`,
        operatorBox.found && operatorBox.inViewport && operatorBox.onTop && !!operators && JSON.stringify(operators.all) === JSON.stringify(ALL_OPERATORS)
        && JSON.stringify(operators.greyed) === JSON.stringify(GREYED_OPERATORS) && operators.value === '=' && !operators.shownGreyed, { operatorBox, operators });
      const focused = await focusOperator(cond);
      const stepsDown = [];
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(60);
        stepsDown.push(await operatorValue(cond));
      }
      const slotAfterEmpty = await dimming(cond);
      const stepsUp = [];
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(60);
        stepsUp.push(await operatorValue(cond));
      }
      check(`oui/non (${label}) : condition : au vrai clavier, les flèches de la liste des opérateurs sautent les lignes grisées (= ≠ vide, non vide, et retour) et n'en prennent aucune`,
        focused && JSON.stringify(stepsDown) === JSON.stringify(['≠', 'vide', 'non vide', 'non vide']) && JSON.stringify(stepsUp) === JSON.stringify(['vide', '≠', '=']), { focused, stepsDown, stepsUp });
      check(`oui/non (${label}) : condition : « vide » choisi au clavier grise la liste Oui / Non (l'évènement a bien lu l'opérateur)`,
        !!slotAfterEmpty && slotAfterEmpty.slot === '0.45' && slotAfterEmpty.disabled, slotAfterEmpty);
      const typedOperators = [];
      for (const key of ['c', '>', '<']) {
        await page.keyboard.type(key);
        await page.waitForTimeout(60);
        typedOperators.push(await operatorValue(cond));
      }
      check(`oui/non (${label}) : condition : taper « c », « > » ou « < » sur la liste des opérateurs ne prend aucune des lignes grisées`,
        JSON.stringify(typedOperators) === JSON.stringify(['=', '=', '=']), typedOperators);
      await closeWith(cond, cancelOf(cond));

      // Une règle « Actif > Oui » écrite avant : l'opérateur reste affiché et choisi (grisé), Enregistrer le garde tel quel.
      await freshDocument('Oui', '>');
      await openWindowFor('Titre', 'var-condition', cond);
      const keptOperator = await operatorList(cond);
      const keptField = await reveal(cond + ' .macro-rule-row > select', cond + ' .modal-content');
      check(`oui/non (${label}) : condition, règle « Actif > Oui » enregistrée avant : « > » reste affiché et choisi (grisé dans la liste), les neuf lignes sont là`,
        keptField.found && keptField.onTop && !!keptOperator && keptOperator.value === '>' && keptOperator.shownGreyed && JSON.stringify(keptOperator.all) === JSON.stringify(ALL_OPERATORS)
        && JSON.stringify(keptOperator.greyed) === JSON.stringify(GREYED_OPERATORS), { keptField, keptOperator });
      await closeWith(cond, saveOf(cond));
      const keptSaved = await savedConditions();
      check(`oui/non (${label}) : condition : Enregistrer garde « Actif > Oui » tel quel, rien n'est réécrit à la place de la personne`,
        !!keptSaved[0] && keptSaved[0].rules.length === 1 && keptSaved[0].rules[0].operator === '>' && keptSaved[0].rules[0].value === 'Oui', keptSaved);

      // Une valeur enregistrée que la comparaison ne lit pas : visible avec sa mention, jamais effacée ; Oui ou Non la remplace et elle quitte la liste.
      await freshDocument('x');
      await openWindowFor('Titre', 'var-condition', cond);
      const unknownField = await reveal(valueTrigger(cond), cond + ' .modal-content');
      const unknown = await valueState(cond);
      check(`oui/non (${label}) : condition, valeur « x » enregistrée avant la liste : le champ la montre avec « valeur non reconnue », visible et au premier plan`,
        unknownField.found && unknownField.inViewport && unknownField.onTop && unknown.value === 'x' && unknown.name === 'x' && unknown.hint === '(valeur non reconnue)', { unknownField, unknown });
      await clickAt(unknownField);
      await page.waitForTimeout(150);
      const unknownOpen = await panelInfo(cond);
      check(`oui/non (${label}) : condition : la liste montre Choisir, Oui, Non puis « x (valeur non reconnue) » en dernière ligne, dans le panneau`,
        !!unknownOpen && unknownOpen.inside && JSON.stringify(unknownOpen.rows) === JSON.stringify([CHOOSE, 'Oui', 'Non', 'x (valeur non reconnue)']), unknownOpen);
      const oui = await rowCenter(cond, 'Oui');
      if (oui) await page.mouse.click(oui.x, oui.y);
      await page.waitForTimeout(150);
      await clickAt(await hitTest(valueTrigger(cond)));
      await page.waitForTimeout(150);
      const afterChoice = await panelInfo(cond);
      check(`oui/non (${label}) : condition : Oui choisi, la valeur « x » quitte la liste`, !!afterChoice && JSON.stringify(afterChoice.rows) === JSON.stringify([CHOOSE, 'Oui', 'Non']), afterChoice);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      await closeWith(cond, cancelOf(cond));

      // Macro-modèle : la règle d'une annexe, sur ses deux lignes.
      await page.evaluate(() => MacroEditor.openModal(null));
      await page.waitForTimeout(200);
      await reveal('#macro-editor-add-slot', macro + ' .modal-content');
      await clickCenter('#macro-editor-add-slot');
      await pickColumn(macro, 'acti', 'Actif');
      const macroField = await reveal(valueTrigger(macro), macro + ' .modal-content');
      const macroRule = await ruleBoxes(macro);
      const macroClosed = await valueState(macro);
      check(`oui/non (${label}) : macro-modèle : le champ Valeur (colonne Oui / Non) est une liste lisible (90 px), sur la seconde ligne sous la colonne, au premier plan, sans champ libre`,
        macroField.found && macroField.inViewport && macroField.onTop && macroField.width >= 90 && !!macroRule && macroRule.twoLines && macroRule.boxes.value.t >= macroRule.boxes.column.b - 1
        && overlapping(macroRule.boxes).length === 0 && macroClosed.name === CHOOSE && !macroClosed.free && !macroClosed.advanced, { macroField, macroRule, macroClosed });
      await clickAt(macroField);
      await page.waitForTimeout(150);
      const macroOpen = await panelInfo(macro);
      check(`oui/non (${label}) : macro-modèle : la liste Choisir / Oui / Non s'ouvre entièrement dans le panneau, la zone de recherche a le focus`,
        !!macroOpen && macroOpen.inside && macroOpen.searchFocused && JSON.stringify(macroOpen.rows) === JSON.stringify([CHOOSE, 'Oui', 'Non']), macroOpen);
      const macroOui = await rowCenter(macro, 'Oui');
      if (macroOui) await page.mouse.click(macroOui.x, macroOui.y);
      await page.waitForTimeout(150);
      const macroChosen = await valueState(macro);
      check(`oui/non (${label}) : macro-modèle : un vrai clic sur Oui choisit Oui et ferme la liste`, !!macroOui && macroOui.onTop && macroChosen.value === 'Oui' && macroChosen.name === 'Oui' && !macroChosen.listOpen, { macroOui, macroChosen });
      const macroOperators = await operatorList(macro);
      check(`oui/non (${label}) : macro-modèle : mêmes neuf opérateurs, les cinq sans sens grisés (jamais retirés), « = » choisi`,
        !!macroOperators && JSON.stringify(macroOperators.all) === JSON.stringify(ALL_OPERATORS) && JSON.stringify(macroOperators.greyed) === JSON.stringify(GREYED_OPERATORS)
        && macroOperators.value === '=' && !macroOperators.shownGreyed, macroOperators);
      await closeWith(macro, '#macro-editor-cancel');
    }

    // En anglais : les mots suivent la langue de l'interface.
    await page.evaluate(() => I18n.setLang('en'));
    await freshDocument();
    await openWindowFor('Titre', 'var-condition', cond);
    await pickColumn(cond, 'acti', 'Actif');
    await clickAt(await reveal(valueTrigger(cond), cond + ' .modal-content'));
    await page.waitForTimeout(150);
    const english = await panelInfo(cond);
    check('oui/non (anglais) : condition : la liste dit « Choose a value », Yes, No', !!english && english.inside && JSON.stringify(english.rows) === JSON.stringify(['— Choose a value —', 'Yes', 'No']), english);
    const yes = await rowCenter(cond, 'Yes');
    if (yes) await page.mouse.click(yes.x, yes.y);
    await page.waitForTimeout(150);
    const yesChosen = await valueState(cond);
    check('oui/non (anglais) : condition : un vrai clic sur Yes le choisit', !!yes && yes.onTop && yesChosen.value === 'Yes' && yesChosen.name === 'Yes', { yes, yesChosen });
    await closeWith(cond, cancelOf(cond));
    await page.evaluate(theme => {
      I18n.setLang('fr');
      Templates.getCached = window.__csBoolCached;
      if (theme) document.documentElement.setAttribute('data-theme', theme); else document.documentElement.removeAttribute('data-theme');
    }, previousTheme);
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
