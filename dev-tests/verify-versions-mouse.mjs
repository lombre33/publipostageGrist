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
//   5) l'anglais : la ligne du menu, le titre, les lignes et les boutons ; un modèle jamais enregistré n'ouvre pas la fenêtre ;
//   6) « Comparer » : sur un long texte, un vrai clic allume la comparaison (bouton enfoncé, nombre de différences et légende, la première différence amenée dans l'aperçu qui défile seul, la fenêtre
//      qui garde son cadre, son titre et ses boutons), contrastes d'au moins 4,5:1 du vert, du rouge barré et de la légende, Tab puis Espace et Entrée au clavier, la molette, une version sans
//      différence, « Version actuelle » où le bouton se grise, « Restaurer cette version » qui reprend l'état gardé ; en anglais aussi.
//   7) « Nommer… » : un vrai clic sur « Version actuelle » pose la question dans la fenêtre du panneau (titre, champ, texte, boutons entiers et au premier plan), le nom tapé au clavier et Entrée
//      gardent l'état enregistré sous ce nom (la liste est relue, la nouvelle version choisie) ; sur une ancienne version, le nom prend la place de la date sur place, il est reproposé et un champ
//      vidé le retire ; Échap n'écrit rien et ne ferme que la question ; Tab atteint « Nommer… » entre « Comparer » et « Fermer » ; contrastes d'au moins 4,5:1 ; en anglais aussi.
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
  check(`${T} : la fenêtre tient dans 700x400 : cadre, titre « Historique des versions : Contrat de vente » et quatre boutons entiers et au premier plan`,
    inViewport(look, look.box) && inViewport(look, look.title) && inViewport(look, look.actions) && look.titleOnTop && look.titleText === 'Historique des versions : Contrat de vente'
      && look.buttons.length === 4 && look.buttons.every(b => b.onTop && b.t >= look.box.t && b.b <= look.box.b), look);
  check(`${T} : ni le cadre ni la page ne défilent (le défilement est dans la liste et dans l’aperçu)`, look.boxOver <= 1 && look.bodyScroll <= 0 && look.pageScroll === 0, look);
  check(`${T} : sept lignes (la version actuelle et six versions), « Version actuelle » choisie, « Comparer » et « Restaurer cette version » grisés, « Nommer… » et « Fermer » actifs`, look.rows === 7 && (await checkedIndex(page)) === 0
    && (await rowTexts(page))[0].startsWith('Version actuelle') && look.buttons[0].text === 'Comparer' && look.buttons[0].disabled && look.buttons[1].text === 'Nommer…' && !look.buttons[1].disabled
    && look.buttons[2].text === 'Fermer' && !look.buttons[2].disabled && look.buttons[3].text === 'Restaurer cette version' && look.buttons[3].disabled, { rows: look.rows, buttons: look.buttons });
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
  check(`${T} : Tab depuis la liste atteint « Comparer », « Nommer… », « Fermer » puis « Restaurer cette version » (et reste dans la fenêtre)`, order.join('|') === 'Comparer|Nommer…|Fermer|Restaurer cette version', order);
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
  await realClick(page, '#pp-versions-modal .pp-modal-actions button:not(.var-modal-primary):not([class*="pp-versions-"])', 300);
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

// --- « Comparer » -------------------------------------------------------------------------------------------------------------------------------------------------------
// Un long contrat (60 articles) : une version diffère de l'état actuel par un mot à l'article 45 et un article de plus à la fin (2 différences), l'autre en rien.
const COMPARE_SEED = `
  const longHtml = Array.from({ length: 60 }, (_, i) => '<p>Article ' + (i + 1) + ' : le vendeur et l’acheteur conviennent de ce qui suit.</p>').join('');
  add(4, 'Contrat long', longHtml, false);
  stub.state.nextRowId.Publipostage_Modeles = 5;
`;
async function seedCompareVersions(page) {
  await page.evaluate(async () => {
    const id = Templates.getCurrentId();
    const token = await Templates.ensureToken(id);
    await GristAPI.ensureTable(VersionsStore.TABLE_NAME, VersionsStore.TABLE_COLUMNS);
    const now = Date.now();
    const article = (i, who) => '<p>Article ' + i + ' : le ' + who + ' et l’acheteur conviennent de ce qui suit.</p>';
    const doc = (changed, extra) => Array.from({ length: 60 }, (_, i) => article(i + 1, changed && i === 44 ? 'bailleur' : 'vendeur')).join('') + (extra || '');
    const one = async (minutesAgo, author, html) => grist.docApi.applyUserActions([['AddRecord', VersionsStore.TABLE_NAME, null, {
      Jeton: token, Date: Math.floor((now - minutesAgo * 60000) / 1000), Auteur: author, Nom: '', Genre: '',
      Donnees: await VersionsStore.pack(VersionsStore.stable({ v: 1, typeModele: 'document', contenu: html, nomFichierPDF: '', headerFooter: null, margins: null })),
    }]]);
    await one(300, 'Dan Roux <dan@exemple.fr>', doc(false));
    await one(60, 'Claire Martin <claire@exemple.fr>', doc(true, '<p>Article 61 : clause ajoutée à la fin.</p>'));
  });
}
// La comparaison telle que la fenêtre la montre.
const compareLook = (page) => page.evaluate(() => {
  const ov = document.getElementById('pp-versions-modal');
  const btn = ov.querySelector('.pp-versions-compare');
  const note = ov.querySelector('.pp-versions-note');
  const paper = ov.querySelector('.pp-versions-paper');
  const pr = paper.getBoundingClientRect();
  const mark = ov.querySelector('.pp-versions-tiptap ins.pp-versions-added, .pp-versions-tiptap del.pp-versions-removed');
  const mr = mark ? mark.getBoundingClientRect() : null;
  const status = ov.querySelector('.pp-versions-status');
  return {
    text: btn.textContent, pressed: btn.getAttribute('aria-pressed'), disabled: btn.disabled, noteHidden: note.hidden, noteText: note.hidden ? '' : note.querySelector('.pp-versions-note-text').textContent,
    keys: Array.from(note.querySelectorAll('.pp-versions-key')).filter(k => !k.hidden).map(k => k.textContent),
    added: Array.from(ov.querySelectorAll('.pp-versions-tiptap ins.pp-versions-added')).map(n => n.textContent),
    removed: Array.from(ov.querySelectorAll('.pp-versions-tiptap del.pp-versions-removed')).map(n => n.textContent),
    paperTop: Math.round(paper.scrollTop), paperOver: Math.round(paper.scrollHeight - paper.clientHeight),
    markVisible: !!mr && mr.top >= pr.top - 1 && mr.bottom <= pr.bottom + 1, status: status.hidden ? '' : status.textContent,
  };
});
async function openCompareWindow(page) {
  await page.evaluate(() => { const s = document.getElementById('template-select'); s.value = '4'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(800);
  await seedCompareVersions(page);
  await clickMenuRow(page, '#v2-btn-history', 900);
}

for (const theme of ['light', 'dark']) {
  const T = theme === 'light' ? 'clair' : 'sombre';
  console.log(`\n== Comparer, thème ${T} ==`);
  const page = await openPage(COMPARE_SEED);
  await page.evaluate((t) => Settings.setTheme(t), theme);
  await page.waitForTimeout(200);
  await openCompareWindow(page);
  let look = await winLook(page);
  let cmp = await compareLook(page);
  check(`${T} : sur « Version actuelle », quatre boutons entiers et au premier plan, « Comparer » (le premier, à gauche) grisé et éteint, aucune note`,
    look.buttons.length === 4 && look.buttons.every(b => b.onTop) && look.buttons[0].text === 'Comparer' && look.buttons[0].disabled && look.buttons[0].l < look.buttons[1].l && cmp.pressed === 'false' && cmp.noteHidden, { buttons: look.buttons, cmp });

  // une version choisie : « Comparer » se dégrise, rien n'est marqué tant qu'il n'est pas allumé
  await clickRowOf(page, 1);
  cmp = await compareLook(page);
  check(`${T} : une version choisie dégrise « Comparer », éteint, sans note ni marque`, !cmp.disabled && cmp.pressed === 'false' && cmp.noteHidden && cmp.added.length === 0 && cmp.removed.length === 0, cmp);

  // un vrai clic allume la comparaison
  await realClick(page, '#pp-versions-modal .pp-versions-compare', 800);
  cmp = await compareLook(page);
  check(`${T} : un vrai clic sur « Comparer » l'enfonce et dit « 2 différences avec la version actuelle » avec la légende des deux couleurs`,
    cmp.pressed === 'true' && cmp.noteText === '2 différences avec la version actuelle' && cmp.keys.join('|') === 'Seulement dans cette version|Seulement dans la version actuelle', cmp);
  check(`${T} : le mot remplacé (« vendeur » barré, « bailleur » en vert) et l'article ajouté à la fin sont marqués, rien d'autre`,
    cmp.removed.join('|') === 'vendeur' && cmp.added.join('|') === 'bailleur|Article 61 : clause ajoutée à la fin.', cmp);
  check(`${T} : la première différence (article 45) est amenée dans l'aperçu : il a défilé de ${cmp.paperTop} px et la marque est entièrement visible`, cmp.paperTop > 300 && cmp.markVisible, cmp);
  look = await winLook(page);
  check(`${T} : la fenêtre garde son cadre, son titre et ses boutons dans 700x400, sans défilement de la page ni du cadre`,
    inViewport(look, look.box) && inViewport(look, look.title) && inViewport(look, look.actions) && look.titleOnTop && look.buttons.every(b => b.onTop && b.t >= look.box.t && b.b <= look.box.b) && look.boxOver <= 1 && look.bodyScroll <= 0 && look.pageScroll === 0, look);
  await page.screenshot({ path: SHOTS + `/comparer-${theme}.png` });
  const cAdded = await contrastOf(page, '#pp-versions-modal .pp-versions-tiptap ins.pp-versions-added');
  const cRemoved = await contrastOf(page, '#pp-versions-modal .pp-versions-tiptap del.pp-versions-removed');
  const cKeyAdded = await contrastOf(page, '#pp-versions-modal .pp-versions-note ins.pp-versions-key');
  const cKeyRemoved = await contrastOf(page, '#pp-versions-modal .pp-versions-note del.pp-versions-key');
  const cNote = await contrastOf(page, '#pp-versions-modal .pp-versions-note-text');
  const cButton = await contrastOf(page, '#pp-versions-modal .pp-versions-compare');
  check(`${T} : contraste d'au moins 4,5:1 : vert (${cAdded}), rouge barré (${cRemoved}), légende (${cKeyAdded} et ${cKeyRemoved}), nombre de différences (${cNote}), bouton enfoncé (${cButton})`,
    [cAdded, cRemoved, cKeyAdded, cKeyRemoved, cNote, cButton].every(c => c !== null && c >= 4.5), { cAdded, cRemoved, cKeyAdded, cKeyRemoved, cNote, cButton });
  const decoration = await page.evaluate(() => {
    const a = getComputedStyle(document.querySelector('#pp-versions-modal .pp-versions-tiptap ins.pp-versions-added')), r = getComputedStyle(document.querySelector('#pp-versions-modal .pp-versions-tiptap del.pp-versions-removed'));
    return { addedLine: a.borderBottomWidth, removedLine: r.textDecorationLine };
  });
  check(`${T} : le vert a un trait dessous et le rouge est barré (la couleur n'est pas seule à parler)`, parseFloat(decoration.addedLine) >= 1 && /line-through/.test(decoration.removedLine), decoration);

  // la molette sur l'aperçu le fait défiler seul
  const comparePaper = await rectOf(page, '#pp-versions-modal .pp-versions-paper');
  await page.mouse.move(comparePaper.x, comparePaper.y, { steps: 3 });
  await page.mouse.wheel(0, 250);
  await page.waitForTimeout(250);
  const afterPaperWheel = await winLook(page);
  check(`${T} : la molette sur l'aperçu comparé le fait défiler (${afterPaperWheel.paperTop - cmp.paperTop} px de plus) sans toucher la page`, afterPaperWheel.paperTop > cmp.paperTop && afterPaperWheel.pageScroll === 0 && afterPaperWheel.boxOver <= 1, { afterPaperWheel, before: cmp.paperTop });

  // le clavier : Espace éteint, Entrée rallume, l'anneau de focus se voit
  await page.focus('#pp-versions-modal .pp-versions-compare');
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  cmp = await compareLook(page);
  const ring = await page.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a); return { cls: a.className, visible: a.matches(':focus-visible'), outline: cs.outlineWidth }; });
  check(`${T} : Espace sur « Comparer » l'éteint : plus de marque ni de note, l'aperçu revient en haut, le focus et son anneau restent sur le bouton`,
    cmp.pressed === 'false' && cmp.noteHidden && cmp.added.length === 0 && cmp.removed.length === 0 && cmp.paperTop === 0 && /pp-versions-compare/.test(ring.cls) && ring.visible && ring.outline !== '0px', { cmp, ring });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  cmp = await compareLook(page);
  check(`${T} : Entrée le rallume, et la première différence est de nouveau amenée à l'écran`, cmp.pressed === 'true' && cmp.noteText === '2 différences avec la version actuelle' && cmp.paperTop > 300 && cmp.markVisible, cmp);
  const order = [];
  await page.focus('#pp-versions-modal .pp-versions-row[aria-checked="true"]');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => { const a = document.activeElement; return a.closest && a.closest('.pp-modal-actions') ? a.textContent : (a.className || a.tagName); }));
  }
  // L'aperçu qui défile prend un arrêt de Tab (le navigateur le fait pour tout cadre qui défile, pour qu'on le fasse défiler aux flèches) : entre la liste et les boutons, jamais ailleurs.
  const buttonsInOrder = order.filter(o => o === 'Comparer' || o === 'Nommer…' || o === 'Fermer' || o === 'Restaurer cette version');
  check(`${T} : Tab depuis la liste atteint « Comparer », « Nommer… », « Fermer » puis « Restaurer cette version » (l'aperçu qui défile peut prendre un arrêt avant)`,
    buttonsInOrder.join('|') === 'Comparer|Nommer…|Fermer|Restaurer cette version' && order.indexOf('Comparer') <= 1 && order.every(o => o !== 'BODY' && o !== 'HTML'), order);

  // la version sans différence
  await clickRowOf(page, 2);
  cmp = await compareLook(page);
  check(`${T} : une version identique : « Aucune différence de texte avec la version actuelle. », ni marque ni légende, le bouton reste enfoncé`, cmp.pressed === 'true' && cmp.noteText === 'Aucune différence de texte avec la version actuelle.' && cmp.keys.length === 0 && cmp.added.length === 0 && cmp.removed.length === 0, cmp);
  // « Version actuelle » : grisé, enfoncé, rien d'écrit sur la feuille
  await clickRowOf(page, 0);
  cmp = await compareLook(page);
  check(`${T} : sur « Version actuelle » le bouton se grise (toujours enfoncé), sans note ni marque`, cmp.disabled && cmp.pressed === 'true' && cmp.noteHidden && cmp.added.length === 0 && cmp.removed.length === 0, cmp);

  // Restaurer depuis la comparaison : l'état gardé, jamais la feuille marquée
  await clickRowOf(page, 1);
  await page.waitForTimeout(400);
  cmp = await compareLook(page);
  check(`${T} : la version de nouveau choisie reprend la comparaison (le mode est resté)`, cmp.pressed === 'true' && cmp.noteText === '2 différences avec la version actuelle', cmp);
  await realClick(page, '#pp-versions-modal .pp-modal-actions .var-modal-primary', 500);
  await realClick(page, '#pp-dialog-modal .pp-modal-actions .var-modal-primary', 1200);
  const content = await modelContent(page, 'Contrat long');
  const editorNow = await page.evaluate(() => document.querySelector('.ProseMirror').innerHTML);
  check(`${T} : « Restaurer » depuis la comparaison remet l'état gardé : le modèle et l'éditeur ont « bailleur » et l'article 61, aucune marque de comparaison`,
    !(await winOpen(page)) && content.includes('bailleur') && content.includes('Article 61') && !/pp-versions|<ins|<del/.test(content) && /bailleur/.test(editorNow) && !/pp-versions|<ins|<del/.test(editorNow), { open: await winOpen(page), content: content.slice(0, 120) });
  await page.context().close();
}

// --- « Nommer… » ---------------------------------------------------------------------------------------------------------------------------------------------------------------
const NAME_BUTTON = '#pp-versions-modal .pp-versions-name';
// La question de « Nommer… » telle que la fenêtre du panneau la montre.
const askLook = (page) => page.evaluate(() => {
  const o = document.getElementById('pp-dialog-modal'); const box = o.querySelector('.pp-modal-box'); const b = box.getBoundingClientRect();
  const hit = (e) => { const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && (top === e || e.contains(top)); };
  const input = o.querySelector('.pp-dialog-input');
  return {
    shown: getComputedStyle(o).display, title: o.querySelector('h3').textContent, label: o.querySelector('.pp-dialog-label').textContent, message: o.querySelector('.pp-dialog-message').textContent,
    value: input.value, placeholder: input.placeholder, focused: document.activeElement === input, inputOnTop: hit(input),
    fits: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight,
    buttons: Array.from(o.querySelectorAll('.pp-modal-actions button')).map(x => ({ text: x.textContent, onTop: hit(x) })),
  };
});
const rowTitle = (page, index) => page.evaluate((i) => { const r = document.querySelectorAll('#pp-versions-modal .pp-versions-row')[i]; return r ? r.querySelector('.pp-versions-when').textContent : null; }, index);
const previewOf = (page) => page.evaluate(() => ({ text: document.querySelector('#pp-versions-modal .pp-versions-tiptap').textContent }));
const headTextOf = (page) => page.evaluate(() => document.querySelector('#pp-versions-modal .pp-versions-head').textContent);
const versionsTable = (page) => page.evaluate(() => { const t = window.__gristStub.state.rows.Publipostage_Versions; return t ? t.id.map((id, i) => ({ id, nom: t.Nom[i], genre: t.Genre[i] })) : []; });
// Le modèle ouvert a été enregistré il y a une demi-minute (son état est donc le plus récent de la liste, comme dans un vrai document : la date de départ de ces pages est ancienne).
async function openNameWindow(page) {
  await page.evaluate(() => { const s = document.getElementById('template-select'); s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(700);
  await page.evaluate(async () => {
    const m = window.__gristStub.state.rows.Publipostage_Modeles;
    m.DateModif[m.Nom.indexOf('Contrat de vente')] = Math.floor(Date.now() / 1000) - 30;
    await Templates.loadAll();
  });
  await seedVersions(page);
  await clickMenuRow(page, '#v2-btn-history', 900);
}
// Les gestes de la question : le nom tapé au vrai clavier, puis Entrée.
async function answerName(page, text) {
  if (text) await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
}

for (const theme of ['light', 'dark']) {
  const T = theme === 'light' ? 'clair' : 'sombre';
  console.log(`\n== Nommer, thème ${T} ==`);
  const page = await openPage('');
  await page.evaluate((t) => Settings.setTheme(t), theme);
  await page.waitForTimeout(200);
  await openNameWindow(page);
  let look = await winLook(page);
  const labels = look.buttons.map(b => b.text).join('|');
  check(`${T} : quatre boutons entiers et au premier plan, dans l'ordre « Comparer », « Nommer… », « Fermer », « Restaurer cette version » ; « Nommer… » actif sur « Version actuelle », dans 700x400`,
    labels === 'Comparer|Nommer…|Fermer|Restaurer cette version' && look.buttons.every(b => b.onTop && b.t >= look.box.t && b.b <= look.box.b) && !look.buttons[1].disabled && look.buttons[0].disabled && look.buttons[3].disabled
      && look.buttons[0].r <= look.buttons[1].l && inViewport(look, look.actions) && look.boxOver <= 1, { labels, buttons: look.buttons });
  const start = (await versionsTable(page)).length;

  // un vrai clic sur « Nommer… » (sur « Version actuelle ») pose la question
  await realClick(page, NAME_BUTTON, 500);
  let ask = await askLook(page);
  check(`${T} : un vrai clic sur « Nommer… » pose la question dans la fenêtre du panneau : titre, champ vide avec son texte d'aide, boutons « Annuler » et « Nommer » entiers et au premier plan, le focus dans le champ`,
    ask.shown === 'flex' && ask.title === 'Nommer cette version' && ask.label === 'Nom de la version' && ask.value === '' && ask.placeholder === 'Ex. : Avant envoi' && /état enregistré du modèle/.test(ask.message)
      && ask.fits && ask.focused && ask.inputOnTop && ask.buttons.map(b => b.text).join('|') === 'Annuler|Nommer' && ask.buttons.every(b => b.onTop), ask);
  await page.screenshot({ path: SHOTS + `/nommer-question-${theme}.png` });
  const cMessage = await contrastOf(page, '#pp-dialog-modal .pp-dialog-message');
  const cLabel = await contrastOf(page, '#pp-dialog-modal .pp-dialog-label');
  const cInput = await contrastOf(page, '#pp-dialog-modal .pp-dialog-input');
  check(`${T} : contraste d'au moins 4,5:1 : texte de la question (${cMessage}), intitulé du champ (${cLabel}), champ (${cInput})`, [cMessage, cLabel, cInput].every(c => c !== null && c >= 4.5), { cMessage, cLabel, cInput });

  // Échap n'annule que la question
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const focusBack = await page.evaluate(() => document.activeElement.className);
  check(`${T} : Échap ferme la question seule : rien n'est écrit, la fenêtre de l'historique reste ouverte et le focus revient sur « Nommer… »`,
    !(await dialogOpen(page)) && (await winOpen(page)) && (await versionsTable(page)).length === start && /pp-versions-name/.test(focusBack), { dialog: await dialogOpen(page), win: await winOpen(page), focusBack });

  // le nom tapé et Entrée : l'état enregistré est gardé, la liste relue, la nouvelle version choisie
  await realClick(page, NAME_BUTTON, 500);
  await answerName(page, 'Version signée');
  let table = await versionsTable(page);
  const added = table[table.length - 1];
  check(`${T} : « Version signée » + Entrée ferme la question et garde une version de plus, nommée, sans genre`, !(await dialogOpen(page)) && (await winOpen(page)) && table.length === start + 1 && added.nom === 'Version signée' && added.genre === '', { table });
  const texts = await rowTexts(page);
  check(`${T} : la liste est relue : huit lignes, la version nommée en deuxième ligne (sous « Version actuelle »), choisie, avec son nom pour titre et son aperçu`,
    texts.length === 8 && (await rowTitle(page, 1)) === 'Version signée' && (await checkedIndex(page)) === 1 && /Version signée/.test(await headTextOf(page)) && (await previewOf(page)).text.includes('Texte actuel du contrat.'), { texts, head: await headTextOf(page) });
  look = await winLook(page);
  check(`${T} : la fenêtre garde son cadre, son titre et ses boutons dans 700x400, sans défilement de la page ni du cadre`,
    inViewport(look, look.box) && inViewport(look, look.title) && inViewport(look, look.actions) && look.buttons.every(b => b.onTop) && look.boxOver <= 1 && look.bodyScroll <= 0 && look.pageScroll === 0, look);
  await page.screenshot({ path: SHOTS + `/nommer-liste-${theme}.png` });

  // une ancienne version : le nom prend la place de la date, sur place
  await clickRowOf(page, 4);
  const dateTitle = await rowTitle(page, 4);
  await realClick(page, NAME_BUTTON, 500);
  ask = await askLook(page);
  check(`${T} : sur une ancienne version la question est la même, champ vide, avec le texte « Une version nommée n’est plus effacée avec les plus anciennes. »`, ask.shown === 'flex' && ask.value === '' && /n’est plus effacée avec les plus anciennes/.test(ask.message) && ask.focused, ask);
  await answerName(page, 'Brouillon');
  table = await versionsTable(page);
  check(`${T} : « Brouillon » prend la place de la date sur cette ligne, la version reste choisie, l'en-tête dit son nom, et rien n'est ajouté à la table`,
    (await rowTitle(page, 4)) === 'Brouillon' && (await checkedIndex(page)) === 4 && /Brouillon/.test(await headTextOf(page)) && table.length === start + 1 && table.filter(r => r.nom === 'Brouillon').length === 1, { title: await rowTitle(page, 4), head: await headTextOf(page), table });

  // reproposé ; un champ vidé retire le nom
  await realClick(page, NAME_BUTTON, 500);
  ask = await askLook(page);
  check(`${T} : le nom déjà donné est reproposé dans le champ, avec le texte qui dit qu'un champ vide le retire`, ask.value === 'Brouillon' && /Laissez le champ vide pour retirer le nom/.test(ask.message), ask);
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await answerName(page, '');
  table = await versionsTable(page);
  check(`${T} : un champ vidé retire le nom : la ligne retrouve sa date (« ${dateTitle} »)`, (await rowTitle(page, 4)) === dateTitle && table.every(r => r.nom !== 'Brouillon') && table.length === start + 1, { title: await rowTitle(page, 4), table });

  // le clavier : « Nommer… » s'atteint entre « Comparer » et « Fermer », avec son anneau
  await page.focus('#pp-versions-modal .pp-versions-row[aria-checked="true"]');
  const order = [];
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => { const a = document.activeElement; return a.closest && a.closest('.pp-modal-actions') ? a.textContent : (a.className || a.tagName); }));
  }
  const ringName = await page.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a); return { text: a.textContent, visible: a.matches(':focus-visible'), outline: cs.outlineWidth }; });
  check(`${T} : Tab depuis la liste atteint « Comparer » puis « Nommer… », qui montre son anneau de focus`, order.join('|') === 'Comparer|Nommer…' && ringName.visible && ringName.outline !== '0px', { order, ringName });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  ask = await askLook(page);
  check(`${T} : Entrée sur « Nommer… » pose la question, le focus dans le champ`, ask.shown === 'flex' && ask.focused, ask);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const cName = await contrastOf(page, NAME_BUTTON);
  check(`${T} : contraste d'au moins 4,5:1 du texte de « Nommer… » (${cName})`, cName !== null && cName >= 4.5, { cName });
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
  check('anglais : ligne « Version history… », titre « Version history: Contrat de vente », « Current version », « Before a restore », boutons « Compare », « Name… », « Close » et « Restore this version », fenêtre dans 700x400',
    en.lang === 'en' && en.row === 'Version history…' && en.title === 'Version history: Contrat de vente' && /^Current version/.test(en.rows[0]) && /Before a restore/.test(en.rows[1]) && en.buttons.join('|') === 'Compare|Name…|Close|Restore this version' && en.label === 'Versions'
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

{
  console.log('\n== Comparer, page en anglais ==');
  const page = await openPage(COMPARE_SEED, 'en');
  await openCompareWindow(page);
  await clickRowOf(page, 1);
  await realClick(page, '#pp-versions-modal .pp-versions-compare', 800);
  const cmp = await compareLook(page);
  const look = await winLook(page);
  check('anglais : « Compare » enfoncé, « 2 differences from the current version », légende « Only in this version » / « Only in the current version », première différence à l\'écran, fenêtre dans 700x400',
    cmp.text === 'Compare' && cmp.pressed === 'true' && cmp.noteText === '2 differences from the current version' && cmp.keys.join('|') === 'Only in this version|Only in the current version' && cmp.paperTop > 300 && cmp.markVisible
      && inViewport(look, look.box) && inViewport(look, look.actions) && look.boxOver <= 1 && look.buttons.every(b => b.onTop), { cmp, look });
  await page.screenshot({ path: SHOTS + '/comparer-en.png' });
  await clickRowOf(page, 2);
  const same = await compareLook(page);
  check('anglais : une version identique dit « No text difference from the current version. »', same.noteText === 'No text difference from the current version.' && same.keys.length === 0, same);
  await page.context().close();
}

{
  console.log('\n== Nommer, page en anglais ==');
  const page = await openPage('', 'en');
  await openNameWindow(page);
  const look = await winLook(page);
  await realClick(page, NAME_BUTTON, 500);
  const ask = await askLook(page);
  check('anglais : « Name… » pose la question « Name this version » (champ « Version name », exemple « E.g. Before sending », boutons « Cancel » et « Name »), dans 700x400',
    look.buttons.map(b => b.text).join('|') === 'Compare|Name…|Close|Restore this version' && ask.title === 'Name this version' && ask.label === 'Version name' && ask.placeholder === 'E.g. Before sending'
      && /^The saved state of the template, as the preview shows it, will be kept under this name\./.test(ask.message) && ask.buttons.map(b => b.text).join('|') === 'Cancel|Name' && ask.fits && ask.focused, { buttons: look.buttons.map(b => b.text), ask });
  await page.screenshot({ path: SHOTS + '/nommer-question-en.png' });
  await answerName(page, 'Before sending');
  check('anglais : « Before sending » est le titre de la version nommée, en deuxième ligne, choisie', (await rowTitle(page, 1)) === 'Before sending' && (await checkedIndex(page)) === 1, { title: await rowTitle(page, 1) });
  await page.context().close();
}

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
