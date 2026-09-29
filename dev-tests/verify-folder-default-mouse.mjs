#!/usr/bin/env node
// Dossier déplié ou replié par défaut dans la liste déroulante des modèles (interrupteur de « Organiser mes modèles »), à la VRAIE souris et à la taille du
// panneau Grist d'Antoine (~700x400) : les scénarios de dev-tests/scenarios-template-organize.js et scenarios-template-tree.js tournent DANS la page
// (dispatchEvent), ils ne prouvent ni qu'un vrai clic atteint l'interrupteur (au premier plan, 20x20), ni que la liste déroulante s'ouvre réellement repliée
// ou déplie au clic, ni que l'état survit à un rechargement de la page, ni que la colonne Replie manquante d'un document ancien est ajoutée.
// Trois pages : (A) document neuf, (B) rechargement avec un état déjà enregistré (dont celui d'UNE AUTRE personne), (C) document créé avant la fonction.
// À 700x400 la modale doit tenir dans la fenêtre (elle faisait 568 px de haut : titre coupé, « Fermer » hors de l'écran, demande d'Antoine du 29/09) : on la ferme
// au vrai clic sur « Fermer », le dossier « en attente » (dernière ligne de la liste, qui défile) est atteint sans agrandir la fenêtre, et Échap ferme encore la
// modale après un clic dans la liste (le focus doit rester dans la modale malgré le redessin).
// Lancé par run-headless.mjs (groupe Node "folderDefaultMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-folder-default-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.FOLDER_DEFAULT_MOUSE_PORT || 8896);
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
if (!OFFLINE) console.log('[verify-folder-default-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
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

const center = (page, sel, txt) => page.evaluate(([s, t]) => {
  const rows = Array.from(document.querySelectorAll(s));
  const r = t ? rows.find(e => (e.querySelector('.tts-row-label') || e).textContent === t) : rows[0];
  if (!r) return null; r.scrollIntoView({ block: 'nearest' });
  const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}, [sel, txt]);
const folderBtn = (page, label) => page.evaluate((t) => {
  const row = Array.from(document.querySelectorAll('#template-organize-list .tts-row-folder')).find(e => e.querySelector('.tts-row-label').textContent === t);
  const b = row && row.querySelector('.tom-folder-default-btn'); if (!b) return null; b.scrollIntoView({ block: 'nearest' });
  const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, label);
const stateOf = (page, label) => page.evaluate((t) => {
  const row = Array.from(document.querySelectorAll('#template-organize-list .tts-row-folder')).find(e => e.querySelector('.tts-row-label').textContent === t);
  if (!row) return null; const b = row.querySelector('.tom-folder-default-btn');
  b.scrollIntoView({ block: 'nearest' }); // la liste défile maintenant à 700x400 : la personne amène d'abord la ligne dans la partie visible
  const before = getComputedStyle(b, '::before'); const r = b.getBoundingClientRect();
  return { pressed: b.getAttribute('aria-pressed'), cls: b.className, title: b.title, rowExpanded: row.getAttribute('aria-expanded'),
    top: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b, w: Math.round(r.width), h: Math.round(r.height), glyph: before.width + 'x' + before.height, mask: before.maskImage.length > 20 };
}, label);
const prefRows = (page) => page.evaluate(() => {
  const t = window.__gristStub.state.rows.Publipostage_PreferencesModeles; if (!t) return [];
  return t.id.map((id, i) => ({ id, u: t.Utilisateur[i], m: t.ModeleId[i], d: t.Dossier[i], r: t.Replie ? t.Replie[i] : undefined }));
});
const treeState = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.tts-popup .tts-row-folder')).map(r => {
  const g = r.nextElementSibling; return { f: r.dataset.folderPath, exp: r.getAttribute('aria-expanded'), hidden: getComputedStyle(g).display === 'none' };
}));
const leafVisible = (page, name) => page.evaluate((n) => {
  const r = Array.from(document.querySelectorAll('.tts-popup .tts-row-leaf')).find(e => e.querySelector('.tts-row-label').textContent.replace(' ★', '') === n);
  if (!r) return null; const b = r.getBoundingClientRect(); return b.width > 0 && b.height > 0;
}, name);

// ---------------- Phase A : document neuf -------------------------------------------------------------
console.log('Phase A : document neuf');
let page = await openPage('');
await page.evaluate(async () => {
  await TemplatePreferences.setFolder(1, 'Contrats');
  await TemplatePreferences.setFolder(3, 'Contrats/Avenants');
  await TemplatePreferences.setFolder(4, 'Litiges');
  await TemplatePreferences.setPinned(5, true);
  TemplateTreeSelect.refresh();
});
const overflowBefore = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
await page.evaluate(() => TemplateOrganizeModal.open());
await page.waitForTimeout(300);
let st = await stateOf(page, 'Litiges');
check('modale : chaque dossier porte l’interrupteur, glyphe 16x16 avec masque, au premier plan, 20x20', !!st && st.top && st.w === 20 && st.h === 20 && st.glyph === '16px x 16px'.replace(' x ', 'x') && st.mask, st);
check('modale : par défaut « déplié » (non pressé), info-bulle « s’ouvre déplié »', st.pressed === 'false' && /déplié/.test(st.title) && !st.cls.includes('is-collapsed'), st);
await page.evaluate(() => { const l = document.getElementById('template-organize-list'); l.scrollTop = Math.min(30, l.scrollHeight - l.clientHeight); });
let p = await folderBtn(page, 'Litiges');
const top0 = await page.evaluate(() => document.getElementById('template-organize-list').scrollTop);
await page.mouse.move(p.x, p.y); await page.waitForTimeout(120);
await page.mouse.click(p.x, p.y); await page.waitForTimeout(250);
const afterClick = await page.evaluate(() => ({ top: document.getElementById('template-organize-list').scrollTop, key: document.activeElement && document.activeElement.dataset.focusKey, inModal: document.getElementById('template-organize-modal').contains(document.activeElement) }));
check('vrai clic : le focus reste sur l’interrupteur cliqué et la liste garde son défilement (le redessin ne les perd plus)', afterClick.key === 'folder-default:Litiges' && afterClick.inModal && afterClick.top === top0 && top0 > 0, { top0, afterClick });
st = await stateOf(page, 'Litiges');
check('vrai clic : l’interrupteur passe à « replié » (pressé, accent, info-bulle inversée)', st.pressed === 'true' && st.cls.includes('is-collapsed') && /replié/.test(st.title), st);
check('vrai clic : la ligne dossier de la modale ne se replie pas (stopPropagation), modale ouverte', st.rowExpanded === 'true' && await page.evaluate(() => getComputedStyle(document.getElementById('template-organize-modal')).display !== 'none'), st);
let rows = await prefRows(page);
const lit = rows.filter(r => r.m === 0 && r.d === 'Litiges');
check('Grist : une ligne d’état (ModeleId 0, Dossier « Litiges », Replie vrai), rien pour les autres dossiers', lit.length === 1 && lit[0].r === true && rows.filter(r => r.m === 0).length === 1, rows.filter(r => r.m === 0));
const stCon = await stateOf(page, 'Contrats');
check('les autres dossiers restent « déplié »', stCon.pressed === 'false', stCon);
const lw = await page.evaluate(() => { const l = document.getElementById('template-organize-list'); return { sw: l.scrollWidth, cw: l.clientWidth }; });
check('modale : pas de défilement horizontal dans la liste', lw.sw <= lw.cw + 1, lw);
const geo = await page.evaluate(() => {
  const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
  const c = document.getElementById('template-organize-close').getBoundingClientRect();
  const l = document.getElementById('template-organize-list');
  return { vh: innerHeight, content: box('.template-organize-modal-content'), title: box('.template-organize-modal-content h3'), close: box('#template-organize-close'),
    closeOnTop: document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2) === document.getElementById('template-organize-close'), listClient: l.clientHeight, listScroll: l.scrollHeight };
});
check('700x400 : la modale tient entièrement dans la fenêtre (titre en haut, « Fermer » en bas, rien de coupé)', geo.content.top >= 0 && geo.content.bottom <= geo.vh && geo.title.top >= 0 && geo.close.bottom <= geo.vh && geo.closeOnTop, geo);
check('700x400 : la liste garde une hauteur utile et défile', geo.listClient >= 72 && geo.listScroll > geo.listClient, geo);
const closeAt = await center(page, '#template-organize-close');
await page.mouse.click(closeAt.x, closeAt.y); await page.waitForTimeout(200);
check('700x400 : un vrai clic sur « Fermer » ferme la modale', await page.evaluate(() => getComputedStyle(document.getElementById('template-organize-modal')).display === 'none'));
// ouvrir la liste déroulante à la vraie souris
const tb = await center(page, '.tts-trigger');
await page.mouse.click(tb.x, tb.y); await page.waitForTimeout(250);
let ts = await treeState(page);
const lit1 = ts.find(x => x.f === 'Litiges'), con1 = ts.find(x => x.f === 'Contrats'), ave1 = ts.find(x => x.f === 'Contrats/Avenants');
check('liste déroulante : « Litiges » s’ouvre replié (contenu masqué), « Contrats » et son sous-dossier dépliés', lit1.exp === 'false' && lit1.hidden && con1.exp === 'true' && !con1.hidden && ave1.exp === 'true' && !ave1.hidden, ts);
check('liste déroulante : « Mise en demeure » (dans le dossier replié) invisible, « Bail habitation » visible', (await leafVisible(page, 'Mise en demeure')) === false && (await leafVisible(page, 'Bail habitation')) === true);
// déplier à la main puis cliquer une épingle : la liste se redessine, le dossier reste déplié
let lp = await center(page, '.tts-popup .tts-row-folder[data-folder-path="Litiges"]');
await page.mouse.click(lp.x, lp.y); await page.waitForTimeout(150);
check('vrai clic sur le dossier replié : il se déplie', (await leafVisible(page, 'Mise en demeure')) === true);
const pinPos = await page.evaluate(() => {
  const r = Array.from(document.querySelectorAll('.tts-popup .tts-row-leaf')).find(e => e.querySelector('.tts-row-label').textContent === 'Bail habitation');
  r.scrollIntoView({ block: 'nearest' }); const b = r.querySelector('.tts-pin-btn').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, rx: r.getBoundingClientRect().left + 40 };
});
await page.mouse.move(pinPos.rx, pinPos.y); await page.waitForTimeout(80);
await page.mouse.click(pinPos.x, pinPos.y); await page.waitForTimeout(300);
ts = await treeState(page);
check('épingle cliquée pendant que le panneau est ouvert : le dossier déplié à la main reste déplié (pas de retour à « replié » sous les yeux)', ts.find(x => x.f === 'Litiges').exp === 'true' && (await leafVisible(page, 'Mise en demeure')) === true, ts);
await page.keyboard.press('Escape'); await page.waitForTimeout(100);
await page.mouse.click(tb.x, tb.y); await page.waitForTimeout(250);
ts = await treeState(page);
check('fermé puis rouvert : « Litiges » redevient replié (état par défaut)', ts.find(x => x.f === 'Litiges').exp === 'false', ts);
await page.keyboard.press('Escape'); await page.waitForTimeout(100);

// dossier en attente : interrupteur local, écrit seulement quand un modèle y est rangé.
await page.evaluate(() => { window.prompt = () => 'Archives'; TemplateOrganizeModal.open(); });
await page.waitForTimeout(250);
const nb = await center(page, '#template-organize-new-folder');
await page.mouse.click(nb.x, nb.y); await page.waitForTimeout(250);
const pendBtn = await page.evaluate(() => { const b = document.querySelector('#template-organize-list .tom-pending-folder .tom-folder-default-btn'); if (!b) return null; const r = b.getBoundingClientRect(); const l = document.getElementById('template-organize-list').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, inList: r.top >= l.top - 1 && r.bottom <= l.bottom + 1 && r.bottom <= innerHeight }; });
check('700x400 : le dossier tout juste créé est ramené en vue dans la liste, sans agrandir la fenêtre', !!pendBtn && pendBtn.inList, pendBtn);
check('dossier en attente : il porte lui aussi l’interrupteur', !!pendBtn);
const nBefore = (await prefRows(page)).length;
await page.mouse.click(pendBtn.x, pendBtn.y); await page.waitForTimeout(200);
const pendState = await page.evaluate(() => { const b = document.querySelector('#template-organize-list .tom-pending-folder .tom-folder-default-btn'); return { pressed: b.getAttribute('aria-pressed'), cls: b.className }; });
check('dossier en attente : le clic bascule l’interrupteur sans aucune écriture Grist', pendState.pressed === 'true' && (await prefRows(page)).length === nBefore, pendState);
// « Ranger ici » sur « Sans dossier » (vrai clic)
const place = await page.evaluate(() => {
  const r = Array.from(document.querySelectorAll('#template-organize-list .tts-row-leaf')).find(e => e.querySelector('.tts-row-label').textContent === 'Sans dossier');
  r.scrollIntoView({ block: 'nearest' }); const b = r.querySelector('.tom-place-here-btn').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, rx: r.getBoundingClientRect().left + 40 };
});
await page.mouse.move(place.rx, place.y); await page.mouse.click(place.x, place.y); await page.waitForTimeout(400);
rows = await prefRows(page);
const arch = rows.filter(r => r.m === 0 && r.d === 'Archives');
check('« Ranger ici » : le dossier devient réel et son état « replié » est écrit (une ligne, Replie vrai)', arch.length === 1 && arch[0].r === true, rows.filter(r => r.m === 0));
const stArch = await stateOf(page, 'Archives');
check('le dossier réel « Archives » affiche l’interrupteur « replié »', !!stArch && stArch.pressed === 'true', stArch);
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
check('Échap ferme la modale après un clic sur « Ranger ici » (le focus est resté dans la fenêtre malgré le redessin)', await page.evaluate(() => getComputedStyle(document.getElementById('template-organize-modal')).display === 'none'));
const overflowAfter = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
check('aucun débordement horizontal de page ajouté', overflowAfter <= Math.max(overflowBefore, 20), { overflowBefore, overflowAfter });
await page.context().close();

// ---------------- Phase B : rechargement de la page, état déjà enregistré ----------------------------
console.log('Phase B : rechargement (état lu depuis Grist)');
const SEED_PREFS = (withReplie) => `
    stub.state.tables.push('Publipostage_PreferencesModeles');
    const cols = ${withReplie
      ? "{ id: [1,2,3], Utilisateur: ['', '', 'autre@exemple.fr'], ModeleId: [4, 0, 0], Epingle: [false, false, false], Dossier: ['Litiges', 'Litiges', 'Contrats'], Replie: [false, true, true] }"
      : "{ id: [1], Utilisateur: [''], ModeleId: [4], Epingle: [false], Dossier: ['Litiges'] }"};
    stub.state.rows.Publipostage_PreferencesModeles = cols; stub.state.nextRowId.Publipostage_PreferencesModeles = 4;
`;
page = await openPage(SEED_PREFS(true));
await page.evaluate(() => TemplatePreferences.setFolder(1, 'Contrats'));
const tb2 = await center(page, '.tts-trigger');
await page.mouse.click(tb2.x, tb2.y); await page.waitForTimeout(250);
ts = await treeState(page);
check('rechargé : « Litiges » (réglé replié par cette personne) s’ouvre replié dès la première ouverture', ts.find(x => x.f === 'Litiges').exp === 'false', ts);
check('rechargé : « Contrats » (réglé replié par UNE AUTRE personne) reste déplié pour celle-ci', ts.find(x => x.f === 'Contrats').exp === 'true', ts);
await page.context().close();

console.log('Phase C : document créé avant la fonction (colonne Replie absente)');
page = await openPage(SEED_PREFS(false));
const tb3 = await center(page, '.tts-trigger');
await page.mouse.click(tb3.x, tb3.y); await page.waitForTimeout(250);
ts = await treeState(page);
check('ancien document : la liste s’ouvre normalement, tout déplié', ts.length >= 1 && ts.every(x => x.exp === 'true'), ts);
await page.keyboard.press('Escape');
await page.evaluate(() => TemplateOrganizeModal.open()); await page.waitForTimeout(250);
p = await folderBtn(page, 'Litiges');
await page.mouse.click(p.x, p.y); await page.waitForTimeout(400);
rows = await prefRows(page);
const log = await page.evaluate(() => window.__gristStub.getActionLog().filter(a => a[1] === 'Publipostage_PreferencesModeles').map(a => a[0] + ':' + (a[2] && a[2].Replie !== undefined ? 'Replie' : (typeof a[2] === 'string' ? a[2] : ''))));
check('ancien document : la colonne Replie est ajoutée une seule fois, AVANT l’écriture, puis la ligne d’état est créée', log.filter(x => x.startsWith('AddVisibleColumn')).length === 1 && log.findIndex(x => x.startsWith('AddVisibleColumn')) < log.findIndex(x => x.startsWith('AddRecord')), log);
const lit3 = rows.filter(r => r.m === 0 && r.d === 'Litiges');
check('ancien document : « Litiges » enregistré replié', lit3.length === 1 && lit3[0].r === true, rows);
await page.context().close();

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
