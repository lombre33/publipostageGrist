#!/usr/bin/env node
// Nom de modèle déjà pris (demande d'Antoine du 2026-10-01 : « nom de modèle dupliqué : prévoir un naming du style nom(x) avec incrémentation de x si nom existant »), à la VRAIE
// souris et au vrai clavier, à la taille du panneau Grist d'Antoine (~700x400) : les scénarios de dev-tests/scenarios-template-names.js tournent DANS la page (dispatchEvent) et ne
// prouvent ni que la fenêtre « Enregistrer sous » s'ouvre avec le nom proposé sélectionné, ni que le crayon « Renommer » laisse la frappe tranquille, ni que le message tient dans le coin d'état.
//   1) « Enregistrer sous… » au vrai clic : la fenêtre arrive avec « nom (2) » déjà saisi et sélectionné (le focus dans le champ), dans le panneau ; Entrée crée la copie sous ce nom ;
//      une frappe remplace la proposition ; un nom saisi qui existe déjà devient « nom (2) » et le coin d'état le dit, en entier à 700 px, sans changer la hauteur de la barre ;
//   2) le crayon « Renommer » : taper le nom d'un autre modèle ne change rien sous les doigts, Entrée le numérote et le dit, l'enregistrement automatique écrit le nom retenu ;
//      rouvrir le crayon et valider sans rien changer ne le numérote pas ;
//   3) la galerie : « Utiliser ce modèle » deux fois de suite donne « nom » puis « nom (2) » ;
//   4) Entrée valide le nom (demande d'Antoine du 20/10) : la fenêtre du macro-modèle (nom saisi puis Entrée, nom changé puis Entrée, Échap qui garde son rôle, nom vide), puis un modèle neuf dont le crayon valide un nom
//      (le titre le montre au lieu de « — Nouveau modèle — », le modèle suivant repart de l'invite) ;
//   5) nom effacé et Échap dans le crayon (suite du 20/10, carte « Nom effacé et Échap seulement ») : le nom effacé puis Entrée ou un clic ailleurs revient et le coin d'état le dit,
//      ce qui est tapé ensuite s'enregistre ; Échap abandonne la frappe, y compris un nom tapé à moitié que l'enregistrement automatique avait déjà écrit ;
//   6) interface en anglais : la proposition et les messages.
// Lancé par run-headless.mjs (groupe Node "templateNamesMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-template-names-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TEMPLATE_NAMES_MOUSE_PORT || 8915);
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
if (!OFFLINE) console.log('[verify-template-names-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const TEMPLATES = `
    const m = stub.state.rows.Publipostage_Modeles;
    const add = (id, nom, html, def) => { m.id.push(id); m.Nom.push(nom); m.Contenu.push(html); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(def); };
    add(1, 'Bail habitation', '<p>a</p>', false); add(2, 'Contrat de vente', '<p>b</p>', true); add(3, 'Avenant loyer', '<p>c</p>', false);
    add(4, 'Mise en demeure', '<p>d</p>', false); add(5, 'Quittance', '<p>e</p>', false); add(6, 'Sans dossier', '<p>f</p>', false);
    stub.state.nextRowId.Publipostage_Modeles = 7;
`;

async function openPage(extraSeed) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
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
  await page.addInitScript(`window.__preSeedGristStub = (stub) => { ${TEMPLATES} ${extraSeed || ''} };`);
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  return page;
}


import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
const SHOTS = process.env.TEMPLATE_NAMES_SHOTS || mkdtempSync(join(tmpdir(), 'template-names-'));
mkdirSync(SHOTS, { recursive: true });

const rectOf = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, onTop: !!top && (top === e || e.contains(top)) };
}, sel);
async function realClick(page, sel, wait = 250) {
  const c = await rectOf(page, sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 3 }); await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(wait);
  return c;
}
const names = (page) => page.evaluate(() => window.__gristStub.state.rows.Publipostage_Modeles.Nom.slice());
// Le survol réel de Enregistrer : approche en deux temps, puis le menu s'ouvre dessous.
async function hoverSave(page) {
  const c = await rectOf(page, '#btn-save');
  await page.mouse.move(c.x - 16, c.y - 8, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(150);
  return c;
}
// Descente LENTE de la souris du bouton vers une ligne du menu (le menu doit rester ouvert tout du long : pont de survol) : tout droit sous le bouton, puis vers la ligne.
async function slideTo(page, sel) {
  const from = await rectOf(page, '#btn-save');
  await page.mouse.move(from.x, from.y);
  const to = await rectOf(page, sel);
  await page.mouse.move(from.x, to.y, { steps: 14 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.waitForTimeout(150);
  return to;
}
async function clickMenuRow(page, sel, wait = 300) {
  await hoverSave(page);
  const to = await slideTo(page, sel);
  await page.mouse.click(to.x, to.y);
  await page.waitForTimeout(wait);
  return to;
}
const away = (page) => page.mouse.move(350, 340, { steps: 6 });


const label = (page) => page.evaluate(() => document.querySelector('.tts-trigger-label').textContent);
const statusInfo = (page) => page.evaluate(() => {
  const el = document.getElementById('status-msg');
  return { text: el.textContent, fits: el.scrollWidth <= el.clientWidth, barH: Math.round(document.getElementById('toolbar-top').getBoundingClientRect().height) };
});
const dialogInfo = (page) => page.evaluate(() => {
  const m = document.getElementById('pp-dialog-modal'); if (!m || getComputedStyle(m).display === 'none') return { shown: false };
  const input = m.querySelector('.pp-dialog-input'), box = m.querySelector('.modal-content').getBoundingClientRect();
  const buttons = Array.from(m.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden);
  return { shown: true, value: input.value, selected: input.selectionStart === 0 && input.selectionEnd === input.value.length && input.value.length > 0, focused: document.activeElement === input,
    inPanel: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, buttons: buttons.map(b => b.textContent) };
});
const page = await openPage('');

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 1) « Enregistrer sous… » : la proposition, la frappe, le nom déjà pris
// ---------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== Enregistrer sous… ==');
const start = await page.evaluate(() => ({ label: document.querySelector('.tts-trigger-label').textContent, id: Templates.getCurrentId() }));
check('au départ, le modèle par défaut « Contrat de vente » est ouvert', /^Contrat de vente/.test(start.label) && start.id === 2, start);
await clickMenuRow(page, '#v2-btn-save-as', 500);
let dlg = await dialogInfo(page);
check('« Enregistrer sous… » : la fenêtre arrive avec « Contrat de vente (2) » déjà saisi et sélectionné, le focus dans le champ, dans le panneau', dlg.shown && dlg.value === 'Contrat de vente (2)' && dlg.selected && dlg.focused && dlg.inPanel, dlg);
await page.screenshot({ path: SHOTS + '/1-enregistrer-sous.png', clip: { x: 0, y: 0, width: 700, height: 400 } });
await page.keyboard.press('Enter'); await page.waitForTimeout(900);
let n = await names(page);
let st = await statusInfo(page);
check('Entrée crée la copie sous la proposition ; l’original reste ; la liste montre la copie ; rien à dire sur le nom (il était libre)',
  n.includes('Contrat de vente (2)') && n.filter(x => x === 'Contrat de vente').length === 1 && (await label(page)) === 'Contrat de vente (2)' && !/existe déjà/.test(st.text), { n, st });
await away(page);

await clickMenuRow(page, '#v2-btn-save-as', 500);
dlg = await dialogInfo(page);
check('« Enregistrer sous… » depuis la copie : la proposition continue la série, « Contrat de vente (3) »', dlg.shown && dlg.value === 'Contrat de vente (3)' && dlg.selected, dlg);
const plainBar = (await statusInfo(page)).barH;
await page.keyboard.type('Bail habitation'); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
n = await names(page);
st = await statusInfo(page);
check('une frappe remplace la proposition ; « Bail habitation » existe déjà : la copie s’appelle « Bail habitation (2) » (l’autre reste seule sous son nom)',
  n.includes('Bail habitation (2)') && n.filter(x => x === 'Bail habitation').length === 1 && (await label(page)) === 'Bail habitation (2)', { n, label: await label(page) });
check('le coin d’état le dit en entier à 700 px, sans changer la hauteur de la barre', st.text === 'Ce nom existe déjà : renommé « Bail habitation (2) ».' && st.fits && st.barH === plainBar, { st, plainBar });
await page.screenshot({ path: SHOTS + '/2-nom-deja-pris.png', clip: { x: 0, y: 0, width: 700, height: 150 } });
await away(page);
await page.keyboard.press('Escape');

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 2) Le crayon « Renommer »
// ---------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== Crayon Renommer ==');
await realClick(page, '#btn-rename-template', 250);
await page.keyboard.press('End');
for (let i = 0; i < 40; i++) await page.keyboard.press('Backspace');
await page.keyboard.type('Quittance');
const typing = await page.evaluate(() => ({ field: document.getElementById('template-name').value, open: !document.getElementById('template-name').hidden }));
check('le crayon : « Quittance » existe déjà, mais pendant la frappe le champ ne bouge pas', typing.field === 'Quittance' && typing.open, typing);
await page.waitForTimeout(3300);
check('... un passage de l’enregistrement automatique en route écrit le nom tel que tapé (doublon passager)', (await names(page)).filter(x => x === 'Quittance').length === 2, await names(page));
await page.keyboard.press('Enter'); await page.waitForTimeout(250);
const validated = await page.evaluate(() => ({ field: document.getElementById('template-name').value, hidden: document.getElementById('template-name').hidden, label: document.querySelector('.tts-trigger-label').textContent }));
st = await statusInfo(page);
check('Entrée : le champ se referme, le nom est « Quittance (2) » dans la liste et le coin d’état le dit', validated.hidden && validated.field === 'Quittance (2)' && validated.label === 'Quittance (2)' && st.text === 'Ce nom existe déjà : renommé « Quittance (2) ».' && st.fits, { validated, st });
await page.waitForTimeout(3300);
n = await names(page);
check('l’enregistrement automatique écrit « Quittance (2) » : « Quittance » reste seul sous son nom', n.includes('Quittance (2)') && n.filter(x => x === 'Quittance').length === 1, n);
await realClick(page, '#btn-rename-template', 250);
await page.keyboard.press('Enter'); await page.waitForTimeout(250);
const unchanged = await page.evaluate(() => ({ field: document.getElementById('template-name').value, label: document.querySelector('.tts-trigger-label').textContent }));
check('rouvrir le crayon et valider sans rien changer ne numérote pas : « Quittance (2) » reste « Quittance (2) »', unchanged.field === 'Quittance (2)' && unchanged.label === 'Quittance (2)', unchanged);
await away(page);

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 3) La galerie, deux fois
// ---------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== Galerie ==');
const openGalleryCard = async () => {
  const newBtn = await rectOf(page, '#btn-new');
  await page.mouse.move(newBtn.x - 10, newBtn.y, { steps: 2 }); await page.mouse.move(newBtn.x, newBtn.y, { steps: 3 }); await page.waitForTimeout(350);
  const row = await rectOf(page, '#v2-btn-new-from-template');
  await page.mouse.move(newBtn.x, row.y, { steps: 10 }); await page.mouse.move(row.x, row.y, { steps: 4 });
  await page.mouse.click(row.x, row.y); await page.waitForTimeout(400);
  await page.waitForSelector('#tpl-gallery-grid .tpl-gallery-card', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  await realClick(page, '#tpl-gallery-grid .tpl-gallery-card', 400);
  await page.waitForFunction(() => document.getElementById('tpl-preview-tiptap').children.length > 0, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  const entryName = await page.evaluate(() => document.getElementById('tpl-preview-name').textContent);
  await realClick(page, '#tpl-preview-use-empty', 1200);
  return entryName;
};
const galleryName = await openGalleryCard();
n = await names(page);
check('galerie : « Utiliser ce modèle » crée le modèle sous le nom de la galerie (libre : tel quel)', n.filter(x => x === galleryName).length === 1 && (await label(page)) === galleryName, { galleryName, n, label: await label(page) });
await away(page);
const again = await openGalleryCard();
n = await names(page);
st = await statusInfo(page);
check('galerie : le même modèle une seconde fois s’appelle « nom (2) », la galerie se ferme, le coin d’état annonce le nom retenu et non celui de la galerie', again === galleryName && n.includes(galleryName + ' (2)') && n.filter(x => x === galleryName).length === 1 && (await label(page)) === galleryName + ' (2)'
  && st.text === 'Modèle « ' + galleryName + ' (2) » enregistré comme nouveau modèle.', { again, n, label: await label(page), st });
await away(page);

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 4) Entrée valide le nom
// ---------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== Entrée valide le nom ==');
// Le menu « + » au vrai survol, puis sa ligne au vrai clic.
async function newMenuRow(rowSel, wait = 500) {
  const newBtn = await rectOf(page, '#btn-new');
  await page.mouse.move(newBtn.x - 10, newBtn.y, { steps: 2 }); await page.mouse.move(newBtn.x, newBtn.y, { steps: 3 }); await page.waitForTimeout(350);
  const row = await rectOf(page, rowSel);
  await page.mouse.move(newBtn.x, row.y, { steps: 10 }); await page.mouse.move(row.x, row.y, { steps: 4 });
  await page.mouse.click(row.x, row.y); await page.waitForTimeout(wait);
}
// Un bouton de la question « Enregistrer / Abandonner / Annuler », au vrai clic.
async function clickQuestion(text, wait = 700) {
  const b = await page.evaluate((t) => {
    const ov = document.getElementById('pp-dialog-modal');
    if (!ov || getComputedStyle(ov).display === 'none') return null;
    const btn = Array.from(ov.querySelectorAll('.pp-modal-actions button')).find(x => !x.hidden && x.textContent === t);
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, text);
  if (!b) throw new Error('bouton « ' + text + ' » absent');
  await page.mouse.move(b.x - 10, b.y, { steps: 2 }); await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(wait);
}
const macroInfo = () => page.evaluate(() => {
  const m = document.getElementById('macro-editor-modal');
  const shown = !!m && getComputedStyle(m).display !== 'none';
  const box = shown ? m.querySelector('.pp-modal-box').getBoundingClientRect() : null;
  const input = document.getElementById('macro-editor-name');
  return { shown, name: input.value, focused: document.activeElement === input,
    inPanel: !!box && box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight };
});
const titleInfo = () => page.evaluate(() => {
  const field = document.getElementById('template-name');
  const trigger = document.querySelector('.tts-trigger'), r = trigger.getBoundingClientRect();
  return { label: document.querySelector('.tts-trigger-label').textContent, field: field.value, fieldOpen: !field.hidden, id: Templates.getCurrentId(),
    triggerShown: r.width > 0 && r.right <= innerWidth };
});

// La fenêtre du macro-modèle : le focus arrive dans le nom, Entrée l'enregistre comme le bouton.
await away(page);
await newMenuRow('#v2-btn-new-macro');
let macro = await macroInfo();
check('« Nouveau macro-modèle » : la fenêtre s’ouvre dans le panneau, le focus dans le nom', macro.shown && macro.focused && macro.inPanel, macro);
await page.keyboard.type('Annexes Entrée');
await page.screenshot({ path: SHOTS + '/3-macro-nom-saisi.png', clip: { x: 0, y: 0, width: 700, height: 400 } });
await page.keyboard.press('Enter'); await page.waitForTimeout(900);
macro = await macroInfo();
n = await names(page);
st = await statusInfo(page);
check('Entrée dans le nom : la fenêtre se ferme, le macro-modèle existe sous ce nom (une fois), le titre et le coin d’état le disent',
  !macro.shown && n.filter(x => x === 'Annexes Entrée').length === 1 && (await label(page)) === 'Annexes Entrée' && st.text === 'Macro-modèle enregistré.', { macro, n, label: await label(page), st });
await away(page);

await realClick(page, '#btn-save', 500);
macro = await macroInfo();
check('« Enregistrer » sur le macro-modèle rouvre sa fenêtre, avec son nom, dans le panneau', macro.shown && macro.name === 'Annexes Entrée' && macro.inPanel, macro);
await page.keyboard.press('Control+a'); await page.keyboard.type('Annexes de bail');
await page.keyboard.press('Enter'); await page.waitForTimeout(900);
macro = await macroInfo();
n = await names(page);
check('un nom changé puis Entrée : le macro-modèle est renommé (il ne s’ajoute pas), la fenêtre se ferme, le titre suit',
  !macro.shown && n.includes('Annexes de bail') && !n.includes('Annexes Entrée') && (await label(page)) === 'Annexes de bail', { macro, n, label: await label(page) });
await away(page);

await realClick(page, '#btn-save', 500);
await page.keyboard.press('Control+a'); await page.keyboard.type('Ne doit pas partir');
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
macro = await macroInfo();
n = await names(page);
check('Échap garde son rôle : la fenêtre se ferme, le nom tapé n’est pas enregistré', !macro.shown && !n.includes('Ne doit pas partir') && n.includes('Annexes de bail') && (await label(page)) === 'Annexes de bail', { macro, n, label: await label(page) });
await away(page);

// Un nom vide : la réponse du bouton (son message), la fenêtre reste ouverte.
const alerts = [];
const onDialog = (d) => { alerts.push(d.message()); d.dismiss().catch(() => {}); };
page.on('dialog', onDialog);
await realClick(page, '#btn-save', 500);
await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace');
await page.keyboard.press('Enter'); await page.waitForTimeout(500);
macro = await macroInfo();
n = await names(page);
page.off('dialog', onDialog);
check('un nom vide puis Entrée : le message « Le macro-modèle doit avoir un nom. », la fenêtre reste ouverte, rien n’est écrit', alerts.length === 1 && alerts[0] === 'Le macro-modèle doit avoir un nom.' && macro.shown && n.includes('Annexes de bail'), { alerts, macro, n });
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
await away(page);

// Un modèle neuf : le crayon valide un nom, le titre le montre.
await newMenuRow('#v2-btn-new-document');
let title = await titleInfo();
const barBefore = (await statusInfo(page)).barH;
check('« Nouveau document » : le titre dit « — Nouveau modèle — », aucun modèle courant', title.label === '— Nouveau modèle —' && title.id == null && !title.fieldOpen, title);
await realClick(page, '#btn-rename-template', 250);
await page.keyboard.type('Facture en cours');
title = await titleInfo();
check('... pendant la frappe, le champ est ouvert et le titre ne bouge pas', title.fieldOpen && title.field === 'Facture en cours', title);
await page.keyboard.press('Enter'); await page.waitForTimeout(400);
title = await titleInfo();
st = await statusInfo(page);
check('Entrée : le champ se ferme et le titre montre « Facture en cours » (plus « — Nouveau modèle — »), dans le panneau, sans changer la hauteur de la barre ; le modèle n’est pas encore enregistré',
  !title.fieldOpen && title.label === 'Facture en cours' && title.field === 'Facture en cours' && title.id == null && title.triggerShown && st.barH === barBefore && !(await names(page)).includes('Facture en cours'), { title, st, barBefore });
await page.screenshot({ path: SHOTS + '/4-modele-neuf-nom-valide.png', clip: { x: 0, y: 0, width: 700, height: 150 } });
await away(page);

// Le modèle suivant : le nom du précédent (abandonné) ne s'y affiche pas.
await newMenuRow('#v2-btn-new-document', 600);
await clickQuestion('Ne pas enregistrer');
title = await titleInfo();
check('« Ne pas enregistrer » puis un modèle vierge : le titre repart de « — Nouveau modèle — », le champ est vide', title.label === '— Nouveau modèle —' && title.field === '' && title.id == null, title);

// Entrée, puis Enregistrer : le modèle existe sous ce nom, le titre ne bouge pas.
await realClick(page, '#btn-rename-template', 250);
await page.keyboard.type('Facture en cours');
await page.keyboard.press('Enter'); await page.waitForTimeout(300);
await realClick(page, '#btn-save', 900);
title = await titleInfo();
n = await names(page);
check('Enregistrer après Entrée : le modèle existe sous ce nom (une fois), le titre est le même', n.filter(x => x === 'Facture en cours').length === 1 && title.label === 'Facture en cours' && title.id != null, { title, n });
await away(page);

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 5) Nom effacé, Échap
// ---------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== Nom effacé, Échap ==');
const rowOf = (nom) => page.evaluate((nm) => {
  const r = window.__gristStub.state.rows.Publipostage_Modeles; const i = r.Nom.indexOf(nm);
  return i === -1 ? null : { id: r.id[i], content: String(r.Contenu[i]) };
}, nom);
const typeInEditor = async (text) => {
  await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
  await page.keyboard.type(text);
};
const barRef = (await statusInfo(page)).barH;
const MSG = 'Nom du modèle requis : « Facture en cours » est gardé.';

// Le nom effacé puis Entrée : le champ reprend le nom d'avant, le coin d'état le dit.
await realClick(page, '#btn-rename-template', 250);
await page.keyboard.press('Backspace');
title = await titleInfo();
check('le crayon sur « Facture en cours », tout le nom effacé : le champ est ouvert et vide', title.fieldOpen && title.field === '', title);
await page.keyboard.press('Enter'); await page.waitForTimeout(250);
title = await titleInfo();
st = await statusInfo(page);
check('Entrée : le champ se referme sur « Facture en cours » (pas vide), le titre ne bouge pas, le coin d’état le dit en entier à 700 px, sans changer la hauteur de la barre',
  !title.fieldOpen && title.field === 'Facture en cours' && title.label === 'Facture en cours' && st.text === MSG && st.fits && st.barH === barRef, { title, st, barRef });
await page.screenshot({ path: SHOTS + '/5-nom-efface-repris.png', clip: { x: 0, y: 0, width: 700, height: 150 } });
await typeInEditor(' après le nom effacé');
await page.waitForTimeout(3300);
let row = await rowOf('Facture en cours');
check('ce qui est tapé ensuite s’enregistre (sans nom, l’enregistrement automatique n’aurait plus rien écrit) : une seule ligne « Facture en cours », avec le texte', !!row && /après le nom effacé/.test(row.content) && (await names(page)).filter(x => x === 'Facture en cours').length === 1, { row, n: await names(page) });
await away(page);

// Un clic ailleurs valide de même.
await realClick(page, '#btn-rename-template', 250);
await page.keyboard.press('Backspace');
await realClick(page, '.ProseMirror', 300);
title = await titleInfo();
st = await statusInfo(page);
check('un clic dans le texte, le nom effacé : le champ se referme sur « Facture en cours », le coin d’état le dit', !title.fieldOpen && title.field === 'Facture en cours' && title.label === 'Facture en cours' && st.text === MSG, { title, st });
await away(page);

// Échap : la frappe est abandonnée, même quand l'enregistrement automatique en avait écrit le début.
await realClick(page, '#btn-rename-template', 250);
await page.keyboard.type('Devis brouillon');
await page.waitForTimeout(3300);
check('... un nom tapé à moitié est déjà écrit par l’enregistrement automatique (le cas que Échap doit rattraper)', (await names(page)).includes('Devis brouillon'), await names(page));
await page.keyboard.press('Escape'); await page.waitForTimeout(250);
title = await titleInfo();
st = await statusInfo(page);
check('Échap : le champ se referme sur « Facture en cours », le titre n’a pas bougé, aucun message', !title.fieldOpen && title.field === 'Facture en cours' && title.label === 'Facture en cours' && !/est gardé/.test(st.text) && st.barH === barRef, { title, st });
await page.waitForTimeout(3300);
n = await names(page);
check('le passage suivant de l’enregistrement automatique réécrit « Facture en cours » : plus de « Devis brouillon », une seule ligne sous le nom', !n.includes('Devis brouillon') && n.filter(x => x === 'Facture en cours').length === 1, n);
await away(page);

// Échap sans rien taper, puis Entrée qui valide toujours un nom changé.
await realClick(page, '#btn-rename-template', 250);
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
title = await titleInfo();
check('Échap sans rien avoir tapé : le champ se referme, rien ne change', !title.fieldOpen && title.field === 'Facture en cours' && title.label === 'Facture en cours', title);
await realClick(page, '#btn-rename-template', 250);
await page.keyboard.type('Facture finale'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
title = await titleInfo();
check('Entrée valide toujours un nom changé : « Facture finale »', !title.fieldOpen && title.field === 'Facture finale' && title.label === 'Facture finale', title);
await page.waitForTimeout(3300);
check('... et l’enregistrement automatique l’écrit (une ligne, l’ancien nom a disparu)', (await names(page)).filter(x => x === 'Facture finale').length === 1 && !(await names(page)).includes('Facture en cours'), await names(page));
await away(page);

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 6) Anglais
// ---------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== Anglais ==');
await page.evaluate(() => I18n.setLang('en'));
await page.waitForTimeout(300);
await clickMenuRow(page, '#v2-btn-save-as', 500);
dlg = await dialogInfo(page);
const proposedEn = dlg.value;
check('anglais : « Save as… » propose le premier nom libre, sélectionné', dlg.shown && dlg.selected && /\(\d+\)$/.test(proposedEn), dlg);
await page.keyboard.type('Quittance'); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
st = await statusInfo(page);
check('anglais : « This name already exists: renamed “Quittance (3)”. »', st.text === 'This name already exists: renamed “Quittance (3)”.', st);
await realClick(page, '#btn-rename-template', 250);
await page.keyboard.press('Backspace'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
st = await statusInfo(page);
check('anglais : le nom effacé revient et le coin d’état dit « Template name required: “Quittance (3)” is kept. »', st.text === 'Template name required: “Quittance (3)” is kept.' && (await label(page)) === 'Quittance (3)', { st, label: await label(page) });
await page.evaluate(() => I18n.setLang('fr'));
await page.context().close();

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
