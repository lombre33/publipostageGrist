#!/usr/bin/env node
// Base commune des fenêtres (js/modal-base.js, css/modal-base.css) : Condition d'affichage, Autres attributs et Boucle à 700x400 (le panneau d'Antoine),
// à la VRAIE souris (page.mouse) et au VRAI clavier (Tab, Maj+Tab, Échap), en clair et en sombre - les scénarios qui tournent dans la page (dispatchEvent)
// ne voient ni le focus qui quitte la fenêtre, ni la molette qui fait défiler le mauvais élément (audit UX/UI du 2026-09-29, constats F3 et F6).
// Les sélecteurs sont ceux des fenêtres d'avant (`#var-…-modal`, `.modal-content`, `h3`, `.var-modal-actions`, `.var-modal-primary`) : le script échoue sur
// l'ancien code par ses constats (titre qui défile, Tab qui s'échappe, Échap muet), pas parce qu'un sélecteur manque.
// Lancé par run-headless.mjs (groupe Node "modalBaseMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-modal-base-mouse.mjs
// MODAL_BASE_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.MODAL_BASE_MOUSE_PORT || 8894);
const SHOTS = process.env.MODAL_BASE_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-var-toolbar-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-modal-base-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Données : VcAnnuaire liée par la Référence Responsable (Condition), VcMembres liée par Dossier avec SEIZE colonnes (Autres attributs : une liste plus
// haute que le panneau), VcTaches liée par Dossier (Boucle), VcContacts PAS liée (le choix de sa clé s'ouvre par-dessus la fenêtre de condition).
const manyColumns = extra => Object.assign({
  Role: 'Text', Telephone: 'Text', Courriel: 'Text', Adresse: 'Text', Ville: 'Text', CodePostal: 'Text', Pays: 'Text', Notes: 'Text',
  Origine: 'Text', Priorite: 'Text', Societe: 'Text', Service: 'Text', Fonction: 'Text', Langue: 'Text', Civilite: 'Text',
}, extra);
await page.evaluate(async ({ manyColumns }) => {
  const stub = window.__gristStub;
  stub.setVariables('VcAnnuaire', { NomPrenom: 'Text', Telephone: 'Text', Naissance: 'Date' });
  stub.setVariables('VcDossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:VcAnnuaire', Montant: 'Numeric' });
  stub.setVariables('VcMembres', Object.assign({ Dossier: 'Ref:VcDossiers' }, manyColumns));
  stub.setVariables('VcContacts', Object.assign({ Dossier: 'Ref:VcDossiers' }, manyColumns));
  stub.setVariables('VcTaches', { Dossier: 'Ref:VcDossiers', Libelle: 'Text', Echeance: 'Date' });
  stub.setRows('VcAnnuaire', [
    { id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44', Naissance: 631152000 },
    { id: 8, NomPrenom: 'Martin Anne', Telephone: '06 55 66 77 88', Naissance: 662688000 },
  ]);
  stub.setRows('VcDossiers', [
    { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7, Montant: 1200 },
    { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 8, Montant: 50 },
  ]);
  stub.setRows('VcMembres', [{ id: 1, Dossier: 1, Role: 'Avocat', Telephone: '01 02 03 04 05' }]);
  stub.setRows('VcTaches', [
    { id: 1, Dossier: 1, Libelle: 'Relancer le client', Echeance: 1790208000 },
    { id: 2, Dossier: 1, Libelle: 'Préparer l’audience', Echeance: 1790812800 },
    { id: 3, Dossier: 2, Libelle: 'Archiver', Echeance: 1791417600 },
  ]);
  await GristAPI.refreshSchema();
  await GristAPI.saveLinkRule('VcAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
  await GristAPI.saveLinkRule('VcMembres', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
  await GristAPI.saveLinkRule('VcTaches', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
  stub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200 }, 'VcDossiers');
  document.getElementById('editor-container').classList.add('a4-preview');
}, { manyColumns: manyColumns({}) });
await page.waitForTimeout(300);

// Centre d'un élément et ce qui s'y trouve réellement au premier plan (un bouton recouvert ou rogné par un ancêtre ne recevrait pas le clic).
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
const seen = box => box.found && box.inViewport && box.onTop;
async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const isOpen = id => page.evaluate(sel => document.querySelector(sel).style.display !== 'none', id);
const badge = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;

// Fait défiler la fenêtre à la molette réelle (la souris posée sur le cadre) jusqu'à ce que l'élément soit entièrement dans le panneau ET au premier plan.
async function reveal(selector, scrollOver) {
  for (let i = 0; i < 10; i++) {
    const box = await hitTest(selector);
    if (seen(box)) return box;
    const over = await hitTest(scrollOver);
    await page.mouse.move(over.x, over.y);
    await page.mouse.wheel(0, box.found && box.top < 0 ? -120 : 120);
    await page.waitForTimeout(80);
  }
  return hitTest(selector);
}
async function pickColumn(scope, name) {
  const field = await reveal(scope + ' .macro-rule-column-wrap .ss-trigger', scope + ' .modal-content');
  await page.mouse.click(field.x, field.y);
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

// Les trois fenêtres : comment on les ouvre (clic sur la bulle, puis sur l'icône de la barre flottante) et comment on les allonge.
const WINDOWS = [
  {
    key: 'condition', label: 'Condition d’affichage', id: '#var-condition-modal', action: 'var-condition',
    html: () => `<p>Dossier suivi par ${badge('VcAnnuaire', 'NomPrenom')} jusqu’à la clôture.</p>`, bubble: '.tiptap .var-badge[data-column="NomPrenom"]',
    grow: async id => { for (let i = 0; i < 4; i++) { const add = await reveal(id + ' .var-condition-add', id + ' .modal-content'); await page.mouse.click(add.x, add.y); await page.waitForTimeout(200); } },
  },
  {
    key: 'linked', label: 'Autres attributs', id: '#var-linked-modal', action: 'var-linked',
    html: () => `<p>Membre du dossier : ${badge('VcMembres', 'Role')}</p>`, bubble: '.tiptap .var-badge[data-column="Role"]',
    grow: async () => {},
  },
  {
    key: 'loop', label: 'Boucle', id: '#var-loop-modal', action: 'var-loop',
    html: () => '<p>Tâches du dossier :</p><table><tbody><tr><th><p>Tâche</p></th><th><p>Échéance</p></th></tr>'
      + `<tr><td><p>${badge('VcTaches', 'Libelle')}</p></td><td><p>${badge('VcTaches', 'Echeance')}</p></td></tr></tbody></table>`,
    bubble: '.tiptap td .var-badge[data-column="Libelle"]',
    grow: async id => { for (let i = 0; i < 2; i++) { const add = await reveal(id + ' .var-loop-filter .var-condition-add', id + ' .modal-content'); await page.mouse.click(add.x, add.y); await page.waitForTimeout(200); } },
  },
];

async function openWindow(win) {
  await page.evaluate(html => Editor.setHTML(html), win.html());
  await page.waitForTimeout(250);
  const bubble = await hitTest(win.bubble);
  await page.mouse.click(bubble.x, bubble.y);
  await page.waitForTimeout(250);
  const icon = await hitTest(`.v2-varfmt-toolbar.visible button[data-action="${win.action}"]`);
  if (icon.found) await page.mouse.click(icon.x, icon.y);
  await page.waitForTimeout(600);
  return { bubble, icon };
}
// Ferme par le bouton Annuler (vrai clic) quand un Échap n'a pas fermé : le scénario suivant repart d'une page propre, même si un constat a échoué.
async function forceClose(win) {
  if (!(await isOpen(win.id))) return;
  const cancel = await reveal(win.id + ' .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)', win.id + ' .modal-content');
  if (cancel.found) await page.mouse.click(cancel.x, cancel.y);
  await page.waitForTimeout(250);
}

// Ce que voit la personne : le cadre, le titre, la ligne de boutons, les attributs d'accessibilité, la couleur du voile.
const describe = id => page.evaluate(sel => {
  const overlay = document.querySelector(sel);
  const box = overlay.querySelector('.modal-content');
  const dialog = overlay.querySelector('[role="dialog"]');
  const labelled = dialog && document.getElementById(dialog.getAttribute('aria-labelledby') || '');
  const probe = document.createElement('div');
  probe.style.background = 'var(--pp-scrim)';
  document.body.appendChild(probe);
  const scrim = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const r = box.getBoundingClientRect();
  return {
    box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width },
    dialogIsBox: !!dialog && dialog === box, modal: dialog && dialog.getAttribute('aria-modal'),
    labelledText: labelled ? labelled.textContent.trim() : '', titleText: (box.querySelector('h3') || {}).textContent || '',
    overlayBg: getComputedStyle(overlay).backgroundColor, scrim, position: getComputedStyle(overlay).position,
  };
}, id);
// Éléments à défilement (overflow auto) qui ont vraiment du contenu caché : prouve qu'un scénario a fait déborder la fenêtre.
const scrollers = id => page.evaluate(sel => {
  const overlay = document.querySelector(sel);
  return Array.from(overlay.querySelectorAll('*')).filter(e => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1)
    .map(e => e.className.toString().split(' ')[0] + ':' + (e.scrollHeight - e.clientHeight));
}, id);
const boxScroll = id => page.evaluate(sel => document.querySelector(sel + ' .modal-content').scrollTop, id);
const behindScroll = () => page.evaluate(() => ({ doc: document.scrollingElement.scrollTop, editor: document.getElementById('editor-container').scrollTop }));

// Un parcours au clavier, un appui à la fois (Tab ou Maj+Tab) : où est le focus après chaque appui, dans la fenêtre ou hors d'elle ; s'arrête dès qu'il en
// sort ou qu'il repasse sur un élément déjà visité (le tour est fait). `actions` : la ligne de boutons a-t-elle reçu le focus (Insérer, grisé tant que rien
// n'est coché, en est sauté : Annuler suffit).
async function walk(id, key, limit = 120) {
  const trail = [];
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press(key);
    const st = await page.evaluate(sel => {
      const a = document.activeElement;
      window.__tabIds = window.__tabIds || new WeakMap();
      window.__tabN = window.__tabN || 0;
      let n = window.__tabIds.get(a);
      const again = n !== undefined;
      if (!again) { n = ++window.__tabN; window.__tabIds.set(a, n); }
      return { inside: document.querySelector(sel).contains(a), again, actions: !!(a && a.closest && a.closest('.var-modal-actions')), what: a ? a.tagName + '.' + String(a.className).split(' ')[0] : 'null' };
    }, id);
    trail.push(st);
    if (!st.inside || st.again) break;
  }
  return { presses: trail.length, left: trail.some(s => !s.inside), wrapped: trail.length > 0 && trail[trail.length - 1].again && trail[trail.length - 1].inside, actions: trail.some(s => s.actions), last: trail[trail.length - 1] };
}
const forgetTabs = () => page.evaluate(() => { window.__tabIds = new WeakMap(); });
const insideNow = id => page.evaluate(sel => document.querySelector(sel).contains(document.activeElement), id);
const blurFocus = () => page.evaluate(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); return document.activeElement === document.body; });
const focusInEditor = () => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.tiptap'));

const widths = {};
const scrims = {};
for (const theme of ['light', 'dark']) {
  await page.evaluate(t => Settings.setTheme(t), theme);
  await page.waitForTimeout(150);
  for (const win of WINDOWS) {
    const T = `${theme}, ${win.label}`;
    const id = win.id;
    const { bubble, icon } = await openWindow(win);
    check(`${T} : la bulle et l’icône de la barre sont atteignables à la souris`, seen(bubble) && seen(icon), { bubble, icon });

    // 1) La fenêtre ouverte : dans le panneau, titre et boutons visibles, accessibilité, voile du thème.
    const d0 = await describe(id);
    const title0 = await hitTest(id + ' h3');
    const primary0 = await hitTest(id + ' .var-modal-primary');
    check(`${T} : ouverte, dans le panneau ${WIDTH}x${HEIGHT}, titre et bouton principal visibles et au premier plan`,
      (await isOpen(id)) && d0.box.left >= 0 && d0.box.right <= WIDTH && d0.box.top >= 0 && d0.box.bottom <= HEIGHT && seen(title0) && seen(primary0), { d0, title0, primary0 });
    check(`${T} : role="dialog" aria-modal sur le cadre, nommé par son titre affiché`, d0.dialogIsBox && d0.modal === 'true' && d0.labelledText !== '' && d0.labelledText === d0.titleText.trim(), d0);
    check(`${T} : le voile prend la couleur du thème (--pp-scrim) et couvre le panneau`, d0.overlayBg === d0.scrim && d0.position === 'fixed', { overlay: d0.overlayBg, scrim: d0.scrim, position: d0.position });
    widths[`${theme}/${win.key}`] = Math.round(d0.box.width);
    scrims[theme] = d0.scrim;
    await snap(`${theme}-${win.key}-1-ouverte`);

    // 2) Le contenu déborde : seul lui défile. Le titre et les boutons ne bougent pas, la page derrière non plus.
    await win.grow(id);
    const cadre = id + ' .modal-content';
    const scrolled = await scrollers(id);
    check(`${T} : le contenu dépasse la fenêtre (le scénario la fait bien déborder : un élément à défilement a du contenu caché)`, scrolled.length >= 1, scrolled);
    const behind0 = await behindScroll();
    const over = await hitTest(cadre);
    await page.mouse.move(over.x, over.y);
    await page.mouse.wheel(0, -3000);
    await page.waitForTimeout(150);
    const titleTop = await hitTest(id + ' h3');
    const primaryTop = await hitTest(id + ' .var-modal-primary');
    await snap(`${theme}-${win.key}-2-haut`);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(60); }
    await page.waitForTimeout(120);
    const titleEnd = await hitTest(id + ' h3');
    const primaryEnd = await hitTest(id + ' .var-modal-primary');
    await snap(`${theme}-${win.key}-3-bas`);
    check(`${T} : contenu défilé jusqu’au bout à la molette, le titre reste à sa place et visible`, seen(titleTop) && seen(titleEnd) && Math.abs(titleEnd.top - titleTop.top) < 1, { titleTop: titleTop.top, titleEnd: titleEnd.top, onTop: titleEnd.onTop });
    check(`${T} : ... et la ligne de boutons aussi (Enregistrer / Insérer atteignable en haut comme en bas)`, seen(primaryTop) && seen(primaryEnd) && Math.abs(primaryEnd.top - primaryTop.top) < 1, { primaryTop: primaryTop.top, primaryEnd: primaryEnd.top });
    check(`${T} : le cadre lui-même ne défile pas (seule la zone de contenu le fait)`, (await boxScroll(id)) === 0, await boxScroll(id));
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(40); }
    const behind1 = await behindScroll();
    check(`${T} : au bout du contenu, la molette ne fait défiler ni la page ni l’éditeur derrière le voile`, behind1.doc === behind0.doc && behind1.editor === behind0.editor, { behind0, behind1 });
    const dEnd = await describe(id);
    check(`${T} : la fenêtre grandie tient toujours dans le panneau`, dEnd.box.top >= 0 && dEnd.box.bottom <= HEIGHT && dEnd.box.left >= 0 && dEnd.box.right <= WIDTH, dEnd.box);

    // 3) Panneau étroit (360 px) : dans le panneau, pas de débordement latéral.
    await page.setViewportSize({ width: 360, height: HEIGHT });
    await page.waitForTimeout(200);
    const narrow = await page.evaluate(sel => {
      const box = document.querySelector(sel + ' .modal-content').getBoundingClientRect();
      const wide = Array.from(document.querySelectorAll(sel + ' .modal-content, ' + sel + ' .modal-content *')).filter(e => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollWidth > e.clientWidth + 1).map(e => String(e.className).split(' ')[0]);
      return { left: box.left, right: box.right, docOverflow: document.documentElement.scrollWidth - innerWidth, wide };
    }, id);
    check(`${T} : à 360 px de large, la fenêtre reste dans le panneau, sans défilement horizontal ni débordement de page`, narrow.left >= 0 && narrow.right <= 360 && narrow.docOverflow <= 0 && narrow.wide.length === 0, narrow);
    await snap(`${theme}-${win.key}-4-360`);
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });
    await page.waitForTimeout(200);

    // 4) Le clic sur le voile ne ferme rien (à dessein), puis Tab rentre dans la fenêtre au lieu de partir dans l’éditeur.
    await page.mouse.click(4, 4);
    await page.waitForTimeout(150);
    check(`${T} : un clic sur le voile ne ferme pas la fenêtre`, await isOpen(id));
    await page.keyboard.press('Tab');
    check(`${T} : Tab après un clic sur le voile reste dans la fenêtre`, await insideNow(id), await page.evaluate(() => document.activeElement && document.activeElement.tagName + '.' + document.activeElement.className));

    // 5) Tab et Maj+Tab tournent dans la fenêtre (un tour complet), sans jamais en sortir.
    await forgetTabs();
    const forward = await walk(id, 'Tab');
    check(`${T} : Tab fait le tour de la fenêtre (${forward.presses} appuis), le focus n’en sort jamais et passe par la ligne de boutons`, !forward.left && forward.wrapped && forward.actions, forward);
    await forgetTabs();
    const backward = await walk(id, 'Shift+Tab');
    check(`${T} : Maj+Tab fait le tour dans l’autre sens (${backward.presses} appuis) sans jamais sortir`, !backward.left && backward.wrapped && backward.actions, backward);

    // 6) Focus tombé sur <body> (un champ redessiné, un bouton retiré) : Tab et Maj+Tab rentrent dans la fenêtre.
    check(`${T} : le focus est bien tombé sur <body> (mise en place du scénario)`, await blurFocus());
    await page.keyboard.press('Tab');
    check(`${T} : Tab depuis <body> rentre dans la fenêtre`, await insideNow(id), await page.evaluate(() => document.activeElement && document.activeElement.tagName));
    await blurFocus();
    await page.keyboard.press('Shift+Tab');
    check(`${T} : Maj+Tab depuis <body> rentre dans la fenêtre`, await insideNow(id), await page.evaluate(() => document.activeElement && document.activeElement.tagName));

    // 7) Échap ferme la fenêtre où que soit le focus (ici : sur <body>), et rend le focus à l’éditeur.
    await blurFocus();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const closedFromBody = !(await isOpen(id));
    check(`${T} : Échap avec le focus sur <body> ferme la fenêtre`, closedFromBody);
    if (closedFromBody) check(`${T} : ... et le focus revient dans l’éditeur`, await focusInEditor());
    await forceClose(win);

    // 8) Échap après neuf appuis sur Tab (le focus était déjà parti dans l’éditeur derrière le voile avant la base commune) ferme la fenêtre.
    await openWindow(win);
    for (let i = 0; i < 9; i++) await page.keyboard.press('Tab');
    const insideAfterNine = await insideNow(id);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const closedAfterNine = !(await isOpen(id));
    check(`${T} : après neuf appuis sur Tab le focus est encore dans la fenêtre, et Échap la ferme`, insideAfterNine && closedAfterNine, { insideAfterNine, closedAfterNine });
    await forceClose(win);

    // 9) Condition seulement : le choix de la clé d’une table pas encore liée s’ouvre PAR-DESSUS ; le clavier est à lui (Tab y reste, un premier Échap
    // ferme SEUL ce choix, le second ferme la condition).
    if (win.key === 'condition') {
      await page.evaluate(html => Editor.setHTML(html), `<p>Dossier suivi par ${badge('VcAnnuaire', 'NomPrenom')} jusqu’à la clôture.</p>`);
      await openWindow(win);
      const picked = await pickColumn(id, 'VcContacts.Role');
      await page.waitForTimeout(300);
      const keyOpen = await page.evaluate(() => document.getElementById('link-config-modal').style.display !== 'none');
      check(`${T} : le choix de la clé s’ouvre par-dessus la fenêtre de condition`, picked && keyOpen, { picked, keyOpen });
      await snap(`${theme}-condition-5-cle-par-dessus`);
      let leftKey = false;
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        if (!(await page.evaluate(() => document.getElementById('link-config-modal').contains(document.activeElement)))) leftKey = true;
      }
      check(`${T} : douze appuis sur Tab restent dans le choix de la clé (le clavier est à la fenêtre du dessus)`, !leftKey);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      const afterFirst = { key: await page.evaluate(() => document.getElementById('link-config-modal').style.display !== 'none'), condition: await isOpen(id) };
      check(`${T} : un premier Échap ferme le choix de la clé SEUL, la fenêtre de condition reste ouverte`, !afterFirst.key && afterFirst.condition, afterFirst);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      check(`${T} : le second Échap ferme la fenêtre de condition`, !(await isOpen(id)));
      await forceClose(win);
    }
  }
}

// Les trois fenêtres ont la même largeur (elles en avaient deux : 480 et 420 px), en clair comme en sombre, et le voile change avec le thème.
const distinctWidths = Array.from(new Set(Object.values(widths)));
check('les trois fenêtres ont la même largeur, en clair comme en sombre', distinctWidths.length === 1, widths);
check('le voile est plus foncé en sombre qu’en clair (le thème est bien appliqué)', !!scrims.light && !!scrims.dark && scrims.light !== scrims.dark, scrims);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
