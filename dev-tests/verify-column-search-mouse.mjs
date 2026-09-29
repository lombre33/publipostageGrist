#!/usr/bin/env node
// Listes de colonnes avec recherche (js/search-select.js) dans les fenêtres qui proposent un choix de colonne, à la VRAIE souris et au vrai clavier
// (page.mouse / page.keyboard, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400) : les scénarios de dev-tests/scenarios-column-search.js
// tournent DANS la page (dispatchEvent), ils ne prouvent ni qu'un vrai clic atteint le champ, ni que le panneau de la liste tient dans un panneau bas sans
// être rogné ni recouvert, ni que la molette fait défiler la liste et non la page. Sections lançables seules : node dev-tests/verify-column-search-mouse.mjs condition
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
// (plusieurs lignes par facture : la fenêtre Boucle s'ouvre sur ses variables) ; CsLarge, 40 colonnes, pour une liste qui défile.
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
  boxScroll: document.querySelector(sel + ' .modal-content').scrollTop,
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
      !!open && open.rows[0] === '-- Choisir une colonne --' && open.rows[open.rows.length - 1] === 'Autre (colonne d\'une autre table…)' && open.heads.length === 6
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

  // Règles d'un macro-modèle : les colonnes de la table de la page.
  async macro() {
    const scope = '#macro-editor-modal';
    await page.evaluate(() => MacroEditor.openModal(null));
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
    const cancel = await reveal('#macro-editor-cancel', scope + ' .modal-content');
    check('macro : Annuler visible et non recouvert', cancel.found && cancel.inViewport && cancel.onTop, cancel);
    if (cancel.found) await page.mouse.click(cancel.x, cancel.y);
    await page.waitForTimeout(200);
  },
};
const only = process.argv.slice(2);
for (const [name, run] of Object.entries(SECTIONS)) if (!only.length || only.includes(name)) await run();

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
