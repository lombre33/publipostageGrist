#!/usr/bin/env node
// Fenêtre « Historique des versions » (js/versions-history.js, css/versions-history.css, ligne du menu du bouton Enregistrer dans js/main.js), à la VRAIE souris et au vrai clavier, à la taille
// du panneau Grist d'Antoine (~700x400), en clair puis en sombre : les scénarios de dev-tests/scenarios-versions.js tournent DANS la page (dispatchEvent, :hover jamais actif, aucune mise en
// page contrainte à 700x400) et ne prouvent ni que la fenêtre tient dans le panneau avec son titre et ses boutons en place, ni que la liste et l'aperçu défilent chacun à la molette sans faire
// défiler le reste, ni qu'un clic sur une ligne la choisit, ni que le texte de l'aperçu reste lisible sur la feuille blanche en thème sombre.
//   1) l'ouverture : le survol de Enregistrer ouvre le menu, la ligne « Historique des versions… » se descend à la souris et se clique ; la fenêtre tient dans 700x400 (cadre, titre et deux boutons entiers
//      et au premier plan, ni le cadre ni le menu qui défilent), « Version actuelle » est choisie, « Restaurer » est grisé ;
//   2) la liste : sept lignes, qui défilent seules à la molette (la page, l'aperçu et le cadre ne bougent pas) ; un vrai clic choisit une version (cochée, aperçu, personne et date en tête de l'aperçu,
//      « Restaurer » dégrisé) ; flèches du clavier ; le texte de l'aperçu a un contraste d'au moins 4,5:1 sur la feuille ; l'aperçu d'une version longue défile seul ;
//   3) le clavier : Tab depuis la liste atteint « Fermer » puis « Restaurer cette version », avec l'anneau de focus ; la ligne du menu s'atteint au Tab (après « Enregistrer sous… ») et Entrée y ouvre la
//      fenêtre ; Échap la ferme et rend le focus au bouton Enregistrer ;
//   4) « Restaurer cette version » : la question entre dans la fenêtre du panneau, au premier plan ; « Annuler » n'écrit rien ; « Restaurer » ferme tout, l'éditeur et le modèle reprennent la version
//      choisie, le coin d'état le dit, et la version remplacée est dans la liste, à sa date (« Avant une restauration ») ;
//   5) l'anglais : la ligne du menu, le titre, les lignes et les boutons ; un modèle jamais enregistré n'ouvre pas la fenêtre.
// Lancé par run-headless.mjs (groupe Node "versionsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-versions-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.VERSIONS_MOUSE_PORT || 9060);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-save-menu-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-versions-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
    add(1, 'Bail habitation', '<p>a</p>', false); add(2, 'Contrat de vente', '<p>Texte actuel du contrat.</p>', true); add(3, 'Avenant loyer', '<p>c</p>', false);
    stub.state.nextRowId.Publipostage_Modeles = 4;
`;

async function openPage(extraSeed, lang) {
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
  // La langue de la page est celle qui est gardée au chargement (changer de langue recharge la page) : une page en anglais se charge avec « en » déjà gardé.
  if (lang) await page.addInitScript((l) => { try { localStorage.setItem('pp_lang', l); } catch (e) { /* sans stockage la page reste en français */ } }, lang);
  await page.addInitScript(`window.__preSeedGristStub = (stub) => { ${TEMPLATES} ${extraSeed || ''} };`);
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  return page;
}

const SHOTS = process.env.VERSIONS_SHOTS || mkdtempSync(join(tmpdir(), 'versions-'));
mkdirSync(SHOTS, { recursive: true });

// --- Gestes réels ----------------------------------------------------------------------------------------------------------------------------------------------------------
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
// Le survol réel de Enregistrer, puis la descente lente de la souris vers une ligne du menu (le menu doit rester ouvert tout du long).
async function hoverSave(page) {
  const c = await rectOf(page, '#btn-save');
  await page.mouse.move(c.x - 16, c.y - 8, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(150);
  return c;
}
async function slideTo(page, sel) {
  const from = await rectOf(page, '#btn-save');
  await page.mouse.move(from.x, from.y);
  const to = await rectOf(page, sel);
  await page.mouse.move(from.x, to.y, { steps: 14 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.waitForTimeout(150);
  return to;
}
async function clickMenuRow(page, sel, wait = 700) {
  await hoverSave(page);
  const to = await slideTo(page, sel);
  await page.mouse.click(to.x, to.y);
  await page.waitForTimeout(wait);
  return to;
}
const away = (page) => page.mouse.move(350, 340, { steps: 6 });

// --- Lectures de la page ------------------------------------------------------------------------------------------------------------------------------------------------
const flyOpen = (page) => page.evaluate(() => getComputedStyle(document.getElementById('v2-save-flyout')).display !== 'none');
const statusOf = (page) => page.evaluate(() => document.getElementById('status-msg').textContent);
const activeId = (page) => page.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) : null; });
const editorText = (page) => page.evaluate(() => document.querySelector('.ProseMirror').textContent);
const modelContent = (page, name) => page.evaluate((n) => { const m = window.__gristStub.state.rows.Publipostage_Modeles; const i = m.Nom.indexOf(n); return i === -1 ? null : String(m.Contenu[i]); }, name);
const winOpen = (page) => page.evaluate(() => { const o = document.getElementById('pp-versions-modal'); return !!o && getComputedStyle(o).display !== 'none'; });
const dialogOpen = (page) => page.evaluate(() => { const o = document.getElementById('pp-dialog-modal'); return !!o && getComputedStyle(o).display !== 'none'; });
const rowTexts = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#pp-versions-modal .pp-versions-row')).map(r => r.textContent));
const checkedIndex = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#pp-versions-modal .pp-versions-row')).findIndex(r => r.getAttribute('aria-checked') === 'true'));

// La fenêtre : son cadre, son titre, ses boutons, ce qui défile.
const winLook = (page) => page.evaluate(() => {
  const ov = document.getElementById('pp-versions-modal');
  const box = ov.querySelector('.pp-modal-box');
  const r = (e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
  const hit = (e) => { const b = e.getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!top && (top === e || e.contains(top)); };
  const title = ov.querySelector('h3'), actions = ov.querySelector('.pp-modal-actions');
  const host = ov.querySelector('.pp-versions-listhost'), paper = ov.querySelector('.pp-versions-paper');
  const buttons = Array.from(actions.querySelectorAll('button')).map(b => ({ text: b.textContent, disabled: b.disabled, onTop: hit(b), ...r(b) }));
  return {
    display: getComputedStyle(ov).display, box: r(box), title: r(title), titleText: title.textContent, titleOnTop: hit(title), actions: r(actions), buttons,
    vw: innerWidth, vh: innerHeight, pageScroll: window.scrollY, bodyScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    boxOver: box.scrollHeight - box.clientHeight, hostOver: host.scrollHeight - host.clientHeight, hostTop: host.scrollTop, paperOver: paper.scrollHeight - paper.clientHeight, paperTop: paper.scrollTop,
    rows: ov.querySelectorAll('.pp-versions-row').length,
  };
});
const inViewport = (look, part) => part.l >= 0 && part.t >= 0 && part.r <= look.vw && part.b <= look.vh;

// Le contraste d'un texte sur son fond opaque le plus proche (WCAG).
const contrastOf = (page, selector) => page.evaluate((sel) => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { let n = el; while (n) { const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0.95) return c; n = n.parentElement; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const el = document.querySelector(sel); if (!el) return null;
  const a = lum(parse(getComputedStyle(el).color)), b = lum(bgOf(el));
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}, selector);

// Sept versions du modèle ouvert (le courant), de la plus récente à la plus ancienne : une « avant une restauration », une nommée et très longue (l'aperçu défile), des auteurs connus et un inconnu.
async function seedVersions(page) {
  await page.evaluate(async () => {
    const id = Templates.getCurrentId();
    const token = await Templates.ensureToken(id);
    await GristAPI.ensureTable(VersionsStore.TABLE_NAME, VersionsStore.TABLE_COLUMNS);
    const now = Date.now();
    const long = '<h1>Contrat de vente</h1>' + Array.from({ length: 40 }, (_, i) => '<p>Article ' + (i + 1) + ' : le vendeur et l’acheteur conviennent de ce qui suit, ligne ' + (i + 1) + '.</p>').join('');
    const one = async (minutesAgo, author, name, genre, html) => grist.docApi.applyUserActions([['AddRecord', VersionsStore.TABLE_NAME, null, {
      Jeton: token, Date: Math.floor((now - minutesAgo * 60000) / 1000), Auteur: author, Nom: name, Genre: genre,
      Donnees: await VersionsStore.pack(VersionsStore.stable({ v: 1, typeModele: 'document', contenu: html, nomFichierPDF: '', headerFooter: null, margins: null })),
    }]]);
    await one(9 * 1440, 'Dan Roux <dan@exemple.fr>', '', '', '<p>Texte d’il y a neuf jours.</p>');
    await one(3 * 1440, '', '', '', '<p>Texte d’il y a trois jours.</p>');
    await one(1440 + 120, 'Claire Martin <claire@exemple.fr>', '', '', '<p>Texte d’hier.</p>');
    await one(180, 'Claire Martin <claire@exemple.fr>', '', '', '<h1>Contrat de vente</h1><p>Texte du matin.</p>');
    await one(50, 'Bruno Petit <bruno@exemple.fr>', 'Avant envoi aux locataires', '', long);
    await one(12, 'Claire Martin <claire@exemple.fr>', '', 'restauration', '<p>Texte avant la dernière restauration.</p>');
  });
}

// Un vrai clic sur la ligne d'une version (amenée dans la liste d'abord).
async function clickRowOf(page, index) {
  await page.evaluate((i) => document.querySelectorAll('#pp-versions-modal .pp-versions-row')[i].scrollIntoView({ block: 'nearest' }), index);
  await page.waitForTimeout(80);
  const c = await page.evaluate((i) => { const b = document.querySelectorAll('#pp-versions-modal .pp-versions-row')[i].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, index);
  await page.mouse.move(c.x - 10, c.y, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 3 }); await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(350);
}

for (const theme of ['light', 'dark']) {
  const T = theme === 'light' ? 'clair' : 'sombre';
  console.log(`\n== Thème ${T} ==`);
  const page = await openPage('');
  await page.evaluate((t) => Settings.setTheme(t), theme);
  await page.waitForTimeout(200);

  // 0) un modèle jamais enregistré n'a pas d'historique : la ligne le dit sans ouvrir de fenêtre
  await realClick(page, '#btn-new', 500);
  await clickMenuRow(page, '#v2-btn-history', 500);
  check(`${T} : un modèle neuf n’ouvre pas la fenêtre et le coin d’état dit d’enregistrer d’abord`, !(await winOpen(page)) && /Enregistrez d’abord le modèle/.test(await statusOf(page)), { open: await winOpen(page), status: await statusOf(page) });
  await away(page);
  await page.evaluate(() => { const s = document.getElementById('template-select'); s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(700);
  check(`${T} : le modèle « Contrat de vente » est chargé`, (await editorText(page)).includes('Texte actuel du contrat.'), await editorText(page));
  await seedVersions(page);

  // 1) l'ouverture à la vraie souris
  await hoverSave(page);
  const flyer = await page.evaluate(() => { const f = document.getElementById('v2-save-flyout'), fr = f.getBoundingClientRect(), row = document.getElementById('v2-btn-history'); const b = row.getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { shown: getComputedStyle(f).display, b: Math.round(fr.bottom), vh: innerHeight, text: row.textContent.trim(), h: Math.round(b.height), onTop: !!top && (top === row || row.contains(top)), size: parseFloat(getComputedStyle(row).fontSize), role: row.getAttribute('role') }; });
  check(`${T} : le menu Enregistrer montre « Historique des versions… » (ligne de 24 px au moins, 12,5 px, au premier plan, entière dans la fenêtre)`, flyer.shown === 'flex' && flyer.text === 'Historique des versions…' && flyer.h >= 24 && flyer.size === 12.5 && flyer.onTop && flyer.b <= flyer.vh && flyer.role === 'menuitem', flyer);
  await page.screenshot({ path: SHOTS + `/menu-${theme}.png`, clip: { x: 0, y: 0, width: 700, height: 160 } });
  await away(page); await page.waitForTimeout(200);
  await clickMenuRow(page, '#v2-btn-history', 900);
  check(`${T} : un vrai clic sur la ligne ouvre la fenêtre, et le menu s’est refermé sous la souris partie`, (await winOpen(page)), { open: await winOpen(page) });
  let look = await winLook(page);
  check(`${T} : la fenêtre tient dans 700x400 : cadre, titre « Historique des versions : Contrat de vente » et deux boutons entiers et au premier plan`,
    inViewport(look, look.box) && inViewport(look, look.title) && inViewport(look, look.actions) && look.titleOnTop && look.titleText === 'Historique des versions : Contrat de vente'
      && look.buttons.length === 2 && look.buttons.every(b => b.onTop && b.t >= look.box.t && b.b <= look.box.b), look);
  check(`${T} : ni le cadre ni la page ne défilent (le défilement est dans la liste et dans l’aperçu)`, look.boxOver <= 1 && look.bodyScroll <= 0 && look.pageScroll === 0, look);
  check(`${T} : sept lignes (la version actuelle et six versions), « Version actuelle » choisie, « Restaurer cette version » grisé, « Fermer » actif`, look.rows === 7 && (await checkedIndex(page)) === 0
    && (await rowTexts(page))[0].startsWith('Version actuelle') && look.buttons[0].text === 'Fermer' && !look.buttons[0].disabled && look.buttons[1].text === 'Restaurer cette version' && look.buttons[1].disabled, { rows: look.rows, buttons: look.buttons });
  check(`${T} : la liste est plus haute que sa colonne : elle défile seule (${look.hostOver} px de plus)`, look.hostOver > 20, look);
  await page.screenshot({ path: SHOTS + `/fenetre-${theme}.png` });

  // 2) la liste à la molette : elle défile, la page, le cadre et l'aperçu ne bougent pas
  const listPoint = await rectOf(page, '#pp-versions-modal .pp-versions-listhost');
  await page.mouse.move(listPoint.x, listPoint.y, { steps: 3 });
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(250);
  const afterWheel = await winLook(page);
  check(`${T} : la molette sur la liste la fait défiler (${afterWheel.hostTop} px), sans faire bouger la page ni l’aperçu`, afterWheel.hostTop > 20 && afterWheel.pageScroll === 0 && afterWheel.paperTop === 0 && afterWheel.boxOver <= 1, afterWheel);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(200);

  // 3) un vrai clic sur une version : cochée, aperçu, en-tête, « Restaurer » dégrisé
  const clickRow = (index) => clickRowOf(page, index);
  const preview = () => page.evaluate(() => ({
    text: document.querySelector('#pp-versions-modal .pp-versions-tiptap').textContent, head: document.querySelector('#pp-versions-modal .pp-versions-head').textContent,
    restoreDisabled: document.querySelector('#pp-versions-modal .pp-modal-actions .var-modal-primary').disabled,
  }));
  await clickRow(2);
  let shown = await preview();
  check(`${T} : un vrai clic sur la deuxième version (« Avant envoi aux locataires », Bruno Petit) la coche, montre son aperçu et son en-tête, et dégrise « Restaurer »`,
    (await checkedIndex(page)) === 2 && shown.text.includes('Article 40') && /Avant envoi aux locataires/.test(shown.head) && /Bruno Petit/.test(shown.head) && !shown.restoreDisabled, { checked: await checkedIndex(page), head: shown.head, restoreDisabled: shown.restoreDisabled });
  look = await winLook(page);
  check(`${T} : l’aperçu de cette version longue défile seul (${look.paperOver} px de plus), le cadre et la page restent en place`, look.paperOver > 100 && look.boxOver <= 1 && look.pageScroll === 0, look);
  const paperPoint = await rectOf(page, '#pp-versions-modal .pp-versions-paper');
  await page.mouse.move(paperPoint.x, paperPoint.y, { steps: 3 });
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(250);
  const paperWheel = await winLook(page);
  check(`${T} : la molette sur l’aperçu le fait défiler (${paperWheel.paperTop} px) sans toucher la liste ni la page`, paperWheel.paperTop > 50 && paperWheel.pageScroll === 0 && paperWheel.hostTop === look.hostTop, { paperWheel, hostBefore: look.hostTop });
  await page.screenshot({ path: SHOTS + `/apercu-${theme}.png` });
  const cText = await contrastOf(page, '#pp-versions-modal .pp-versions-tiptap p');
  const cWhen = await contrastOf(page, '#pp-versions-modal .pp-versions-row[aria-checked="true"] .pp-versions-when');
  const cWho = await contrastOf(page, '#pp-versions-modal .pp-versions-row[aria-checked="true"] .pp-versions-who');
  const cOther = await contrastOf(page, '#pp-versions-modal .pp-versions-row[aria-checked="false"] .pp-versions-who');
  const cHead = await contrastOf(page, '#pp-versions-modal .pp-versions-head');
  const cLabel = await contrastOf(page, '#pp-versions-modal .pp-versions-label');
  check(`${T} : contraste d’au moins 4,5:1 : texte de l’aperçu sur la feuille (${cText}), ligne choisie (${cWhen} et ${cWho}), autres lignes (${cOther}), en-tête (${cHead}), titre de la liste (${cLabel})`,
    [cText, cWhen, cWho, cOther, cHead, cLabel].every(c => c !== null && c >= 4.5), { cText, cWhen, cWho, cOther, cHead, cLabel });

  // 4) le clavier : flèches dans la liste, puis Tab jusqu'aux boutons
  await page.evaluate(() => document.querySelectorAll('#pp-versions-modal .pp-versions-row')[2].focus());
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  check(`${T} : flèche bas : la version suivante est choisie, son aperçu change`, (await checkedIndex(page)) === 3 && (await preview()).text.includes('Texte du matin'), { checked: await checkedIndex(page), text: (await preview()).text });
  await page.keyboard.press('Home');
  await page.waitForTimeout(250);
  check(`${T} : Début : retour à « Version actuelle », « Restaurer » grisé`, (await checkedIndex(page)) === 0 && (await preview()).restoreDisabled, { checked: await checkedIndex(page) });
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(200);
  const ringRow = await page.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a); return { cls: a.className, visible: a.matches(':focus-visible'), outline: cs.outlineWidth }; });
  check(`${T} : la ligne qui a le focus montre son anneau (2 px)`, /pp-versions-row/.test(ringRow.cls) && ringRow.visible && ringRow.outline === '2px', ringRow);
  const order = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => { const a = document.activeElement; return (a.className && /pp-versions-row/.test(a.className)) ? 'liste' : (a.closest && a.closest('.pp-modal-actions') ? a.textContent : (a.className || a.tagName)); }));
  }
  check(`${T} : Tab depuis la liste atteint « Fermer » puis « Restaurer cette version » (puis reste dans la fenêtre)`, order.indexOf('Fermer') !== -1 && order.indexOf('Restaurer cette version') > order.indexOf('Fermer') && order.every(o => o !== 'BODY'), order);
  const ringButton = await page.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a); return { text: a.textContent, visible: a.matches(':focus-visible'), outline: cs.outlineWidth }; });
  check(`${T} : le bouton qui a le focus montre son anneau`, ringButton.visible && ringButton.outline !== '0px', ringButton);

  // 5) Restaurer : la question dans la fenêtre du panneau, Annuler n'écrit rien, Restaurer remplace tout
  await clickRow(2);
  const before = await modelContent(page, 'Contrat de vente');
  await realClick(page, '#pp-versions-modal .pp-modal-actions .var-modal-primary', 500);
  const ask = await page.evaluate(() => {
    const o = document.getElementById('pp-dialog-modal'); const box = o.querySelector('.pp-modal-box'); const b = box.getBoundingClientRect();
    const hit = (e) => { const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && (top === e || e.contains(top)); };
    const buttons = Array.from(o.querySelectorAll('.pp-modal-actions button')).map(x => ({ text: x.textContent, onTop: hit(x) }));
    return { shown: getComputedStyle(o).display, title: o.querySelector('h3').textContent, message: o.querySelector('.pp-dialog-message').textContent, fits: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, buttons };
  });
  check(`${T} : « Restaurer cette version » pose la question dans la fenêtre du panneau : titre, version et personne citées, boutons entiers et au premier plan`,
    ask.shown === 'flex' && ask.title === 'Restaurer cette version ?' && /Bruno Petit/.test(ask.message) && ask.fits && ask.buttons.length === 2 && ask.buttons.every(b => b.onTop) && ask.buttons[1].text === 'Restaurer', ask);
  await page.screenshot({ path: SHOTS + `/question-${theme}.png` });
  await realClick(page, '#pp-dialog-modal .pp-modal-actions button:not(.var-modal-primary)', 400);
  check(`${T} : « Annuler » ferme la question, la fenêtre reste ouverte et rien n’est écrit`, !(await dialogOpen(page)) && (await winOpen(page)) && (await modelContent(page, 'Contrat de vente')) === before && (await editorText(page)).includes('Texte actuel du contrat.'), { dialog: await dialogOpen(page), win: await winOpen(page) });
  await realClick(page, '#pp-versions-modal .pp-modal-actions .var-modal-primary', 500);
  await realClick(page, '#pp-dialog-modal .pp-modal-actions .var-modal-primary', 1200);
  check(`${T} : « Restaurer » ferme la question et la fenêtre`, !(await dialogOpen(page)) && !(await winOpen(page)), { dialog: await dialogOpen(page), win: await winOpen(page) });
  check(`${T} : l’éditeur et le modèle montrent la version restaurée (40 articles), le coin d’état le dit`, (await editorText(page)).includes('Article 40') && !(await editorText(page)).includes('Texte actuel du contrat.') && (await modelContent(page, 'Contrat de vente')).includes('Article 40') && /Version du .* restaurée\./.test(await statusOf(page)), { status: await statusOf(page), editor: (await editorText(page)).slice(0, 80) });
  await away(page); await page.waitForTimeout(250);
  check(`${T} : le menu Enregistrer n’est pas resté ouvert`, !(await flyOpen(page)));

  // 6) l'état remplacé est gardé : la fenêtre rouverte le liste en tête, « Avant une restauration »
  await clickMenuRow(page, '#v2-btn-history', 900);
  // La date d'une version est celle de l'état qu'elle garde (ici l'état de départ du modèle, le plus ancien de la liste), pas celle de la restauration.
  const texts = await rowTexts(page);
  const last = texts.length - 1;
  check(`${T} : rouverte, la liste a une version de plus : l’état remplacé, à sa date, marqué « Avant une restauration »`, texts.length === 8 && /Avant une restauration/.test(texts[last]) && !/Avant une restauration/.test(texts[0]), texts);
  await clickRow(last);
  check(`${T} : son aperçu est le texte remplacé (« Texte actuel du contrat. »)`, (await preview()).text.includes('Texte actuel du contrat.') && /Avant une restauration/.test((await page.evaluate(() => document.querySelector('#pp-versions-modal .pp-versions-head').textContent))), (await preview()).text);

  // 7) Échap ferme et rend le focus ; « Fermer » aussi
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(`${T} : Échap ferme la fenêtre`, !(await winOpen(page)));
  await clickMenuRow(page, '#v2-btn-history', 900);
  await realClick(page, '#pp-versions-modal .pp-modal-actions button:not(.var-modal-primary)', 300);
  check(`${T} : un vrai clic sur « Fermer » la ferme`, !(await winOpen(page)));
  await away(page);

  // 8) au clavier : la ligne du menu s'atteint au Tab, Entrée ouvre, Échap rend le focus au bouton Enregistrer
  await page.focus('#btn-new'); await page.keyboard.press('Tab');
  const kSave = await activeId(page);
  await page.keyboard.press('Tab');
  const kSaveAs = await activeId(page);
  await page.keyboard.press('Tab');
  const kHistory = await page.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a); return { id: a.id, visible: a.matches(':focus-visible'), outline: cs.outlineWidth, open: getComputedStyle(document.getElementById('v2-save-flyout')).display }; });
  check(`${T} : Tab : Enregistrer, « Enregistrer sous… » puis « Historique des versions… » (anneau visible, menu ouvert)`, kSave === 'btn-save' && kSaveAs === 'v2-btn-save-as' && kHistory.id === 'v2-btn-history' && kHistory.visible && kHistory.outline === '2px' && kHistory.open === 'flex', { kSave, kSaveAs, kHistory });
  await page.keyboard.press('Tab');
  check(`${T} : Tab suivant : « Enregistrement automatique »`, (await activeId(page)) === 'v2-btn-autosave', await activeId(page));
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  check(`${T} : Entrée sur « Historique des versions… » ouvre la fenêtre, et le focus entre dans sa liste`, (await winOpen(page)) && await page.evaluate(() => /pp-versions-row/.test(document.activeElement.className)), { open: await winOpen(page), focus: await activeId(page) });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(`${T} : Échap la ferme et le focus revient au bouton Enregistrer`, !(await winOpen(page)) && (await activeId(page)) === 'btn-save', { open: await winOpen(page), focus: await activeId(page) });

  await page.context().close();
}

// L'anglais : une page chargée en anglais (changer de langue recharge la page, les libellés de la fenêtre s'écrivent à sa construction) ; la ligne du menu, le titre, les lignes et les boutons.
{
  console.log('\n== Page en anglais ==');
  const page = await openPage('', 'en');
  await page.evaluate(() => { const s = document.getElementById('template-select'); s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(700);
  await seedVersions(page);
  await clickMenuRow(page, '#v2-btn-history', 900);
  const en = await page.evaluate(() => ({ row: document.getElementById('v2-btn-history').textContent.trim(), title: document.querySelector('#pp-versions-modal h3').textContent,
    rows: Array.from(document.querySelectorAll('#pp-versions-modal .pp-versions-row')).map(r => r.textContent), buttons: Array.from(document.querySelectorAll('#pp-versions-modal .pp-modal-actions button')).map(b => b.textContent),
    label: document.querySelector('#pp-versions-modal .pp-versions-label').textContent, lang: document.documentElement.lang }));
  const look = await winLook(page);
  check('anglais : ligne « Version history… », titre « Version history: Contrat de vente », « Current version », « Before a restore », boutons « Close » et « Restore this version », fenêtre dans 700x400',
    en.lang === 'en' && en.row === 'Version history…' && en.title === 'Version history: Contrat de vente' && /^Current version/.test(en.rows[0]) && /Before a restore/.test(en.rows[1]) && en.buttons[0] === 'Close' && en.buttons[1] === 'Restore this version' && en.label === 'Versions'
      && inViewport(look, look.box) && inViewport(look, look.actions) && look.boxOver <= 1, { en, look });
  await page.screenshot({ path: SHOTS + '/fenetre-en.png' });
  // La question de restauration (écrite au moment du clic, dans la langue de la page).
  await clickRowOf(page, 2);
  await realClick(page, '#pp-versions-modal .pp-modal-actions .var-modal-primary', 500);
  const askEn = await page.evaluate(() => { const o = document.getElementById('pp-dialog-modal'); return { shown: getComputedStyle(o).display, title: o.querySelector('h3').textContent, message: o.querySelector('.pp-dialog-message').textContent, buttons: Array.from(o.querySelectorAll('.pp-modal-actions button')).map(x => x.textContent) }; });
  check('anglais : la question « Restore this version? » cite l’état et la personne (Bruno Petit), boutons « Cancel » et « Restore »',
    askEn.shown === 'flex' && askEn.title === 'Restore this version?' && /^The template will go back to its state of .* \(Bruno Petit\)\./.test(askEn.message) && askEn.buttons[0] === 'Cancel' && askEn.buttons[1] === 'Restore', askEn);
  await page.screenshot({ path: SHOTS + '/question-en.png' });
  await realClick(page, '#pp-dialog-modal .pp-modal-actions button:not(.var-modal-primary)', 400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.context().close();
}

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
