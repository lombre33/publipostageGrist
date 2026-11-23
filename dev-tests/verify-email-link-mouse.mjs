#!/usr/bin/env node
// Email lié à un document (demande d'Antoine du 23/11 : « pouvoir dans les settings lier un modèle d'email, comme ça en un clic on bascule de l'email au document, et vice versa ») à la VRAIE souris et au vrai
// clavier, à la taille du panneau Grist d'Antoine (~700x400) : les cas de dev-tests/scenarios-email-link.js tournent DANS la page et ne prouvent ni que le bouton tient à côté de l'étoile sans casser la barre,
// ni que le menu au survol reste ouvert jusqu'à sa ligne, ni que Réglages > Email se lit et se manie à cette taille.
//   1) un document sans email : le bouton (enveloppe, discret), le menu au survol, un clic qui mène à Réglages > Email, le choix posé, Ctrl + Z et Ctrl + Y ;
//   2) UN clic du document à son email, UN clic de retour ; 3) le menu : un autre email en deux clics, le lien ne bouge pas ;
//   4) un email qui sert plusieurs documents, ouvert sans le bouton : le clic le dit, le menu liste les documents ; 5) Réglages côté email : « Retirer » et « Lier un document » ;
//   6) grisé avec sa raison : email supprimé, macro-modèle ; 7) sombre et anglais.
// Lancé par run-headless.mjs (groupe Node "emailLinkMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-email-link-mouse.mjs (EMAIL_LINK_SHOTS=dossier pour garder les captures)
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.EMAIL_LINK_MOUSE_PORT || 8897);
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
if (!OFFLINE) console.log('[verify-email-link-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
// Un document Grist avec : deux emails (le premier sert deux documents), quatre documents, un macro-modèle. Les colonnes d'avant (TypeModele, Jeton, EmailLie) : le widget les lit par SchemaColumns.
const TEMPLATES = `
    const m = stub.state.rows.Publipostage_Modeles;
    const add = (id, nom, html, def, type, token, link) => { m.id.push(id); m.Nom.push(nom); m.Contenu.push(html); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(def); m.TypeModele.push(type); m.Jeton.push(token); m.EmailLie.push(link); };
    m.TypeModele = []; m.Jeton = []; m.EmailLie = [];
    add(1, 'Bail habitation', '<p>Bail</p>', false, 'document', 'doc-bail', 'mail-bail');
    add(2, 'Contrat de vente', '<p>Vente</p>', true, 'document', 'doc-vente', '');
    add(3, 'Avenant loyer', '<p>Avenant</p>', false, 'document', 'doc-avenant', 'mail-bail');
    add(4, 'Quittance', '<p>Quittance</p>', false, 'document', 'doc-quittance', 'mail-supprime');
    add(11, 'Email du bail', '<p>Bonjour</p>', false, 'email', 'mail-bail', '');
    add(12, 'Email de relance', '<p>Relance</p>', false, 'email', 'mail-relance', '');
    add(20, 'Courrier en lot', '{}', false, 'macro', 'macro-lot', '');
    stub.state.nextRowId.Publipostage_Modeles = 30;
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
const SHOTS = process.env.EMAIL_LINK_SHOTS || mkdtempSync(join(tmpdir(), 'email-link-'));
mkdirSync(SHOTS, { recursive: true });

const rectOf = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, onTop: !!top && (top === e || e.contains(top)) };
}, sel);
async function realClick(page, sel, wait = 300) {
  const c = await rectOf(page, sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 3 }); await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(wait);
  return c;
}
// Une ligne d'une liste repérée par son texte : { x, y } au centre, après l'avoir amenée à l'écran.
const rowByText = (page, sel, text) => page.evaluate(([s, t]) => {
  const e = Array.from(document.querySelectorAll(s)).find(n => n.textContent.trim() === t); if (!e) return null;
  e.scrollIntoView({ block: 'nearest' });
  const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: !!top && (top === e || e.contains(top)) };
}, [sel, text]);
const away = (page) => page.mouse.move(350, 370, { steps: 6 });
const label = (page) => page.evaluate(() => document.querySelector('.tts-trigger-label').textContent.replace(/\s*★$/, ''));
const status = (page) => page.evaluate(() => document.getElementById('status-msg').textContent);
// Le coin d'état est écrasé par « Enregistré à … » dès qu'un passage de l'enregistrement automatique tombe entre le geste et la lecture : chaque texte pris depuis ce repère est noté.
const markStatus = (page) => page.evaluate(() => {
  const el = document.getElementById('status-msg');
  window.__statusSeen = [el.textContent];
  if (!window.__statusWatch) { window.__statusWatch = new MutationObserver(() => window.__statusSeen.push(el.textContent)); window.__statusWatch.observe(el, { childList: true, characterData: true, subtree: true }); }
});
const seen = (page, text) => page.evaluate(t => (window.__statusSeen || []).some(s => s.includes(t)), text);
const linkOnDisk = (page, id) => page.evaluate(i => { const m = window.__gristStub.state.rows.Publipostage_Modeles; const k = m.id.indexOf(i); return k < 0 ? null : String(m.EmailLie[k] || ''); }, id);
const tokenOnDisk = (page, id) => page.evaluate(i => { const m = window.__gristStub.state.rows.Publipostage_Modeles; const k = m.id.indexOf(i); return k < 0 ? null : String(m.Jeton[k] || ''); }, id);

// Le modèle ouvert par le sélecteur de la barre (clic réel sur le déclencheur puis sur la ligne) : l'ouverture ne passe PAS par le bouton, donc sans « origine ».
async function openByPicker(page, name) {
  await realClick(page, '.tts-trigger', 350);
  const row = await rowByText(page, '.tts-popup .tts-row-leaf .tts-row-label', name);
  if (!row) throw new Error('modèle absent de la liste : ' + name);
  await page.mouse.move(row.x, row.y, { steps: 3 }); await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(700);
  await away(page);
}
const buttonInfo = (page) => page.evaluate(() => {
  const b = document.getElementById('btn-linked-email'); if (!b) return null;
  const r = b.getBoundingClientRect(), star = document.getElementById('btn-set-default-template').getBoundingClientRect(), bar = document.getElementById('toolbar-top').getBoundingClientRect();
  const cluster = document.getElementById('v2-title-cluster').getBoundingClientRect();
  return { aria: b.getAttribute('aria-label'), toEmail: b.classList.contains('is-to-email'), toDoc: b.classList.contains('is-to-document'), target: b.classList.contains('has-target'), disabled: b.disabled,
    soft: b.hasAttribute('data-pp-lock-soft'), shown: r.width > 4 && r.height > 4, besideStar: Math.abs(r.top - star.top) < 2 && r.left >= star.right - 1 && r.left - star.right < 12, inBar: r.right <= innerWidth && r.bottom <= bar.bottom + 1,
    barH: Math.round(bar.height), clusterRight: Math.round(cluster.right), vw: innerWidth, mask: getComputedStyle(b, '::before').webkitMaskImage || getComputedStyle(b, '::before').maskImage };
});
const flyoutRows = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#v2-linked-email-flyout > *')).map(n => ({ text: n.textContent, active: n.classList.contains('is-active'), label: n.classList.contains('v2-hover-flyout-label'), disabled: n.getAttribute('aria-disabled') === 'true' })));
const flyoutShown = (page) => page.evaluate(() => { const f = document.getElementById('v2-linked-email-flyout'); const r = f.getBoundingClientRect(); const cs = getComputedStyle(f); return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 20 && r.height > 20 && r.bottom <= innerHeight && r.right <= innerWidth; });
async function hoverButton(page) {
  const c = await rectOf(page, '#btn-linked-email');
  await page.mouse.move(c.x - 14, c.y - 8, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(250);
  return c;
}
async function slideToRow(page, sel, text) {
  const from = await rectOf(page, '#btn-linked-email');
  await page.mouse.move(from.x, from.y);
  const to = await rowByText(page, sel, text);
  if (!to) throw new Error('ligne absente du menu : ' + text);
  await page.mouse.move(from.x, to.y, { steps: 14 }); await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.waitForTimeout(150);
  return to;
}
const settings = (page) => page.evaluate(() => {
  const vis = id => { const e = document.getElementById(id); return !!e && !e.hidden && e.offsetParent !== null; };
  const modal = document.getElementById('settings-modal');
  const box = modal.querySelector('.modal-content').getBoundingClientRect();
  const sel = document.getElementById('settings-emaillink-select'), add = document.getElementById('settings-emaillink-add');
  return { open: getComputedStyle(modal).display !== 'none', inPanel: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
    title: document.getElementById('settings-emaillink-title').textContent, intro: vis('settings-emaillink-intro'), chooseShown: vis('settings-emaillink-choose'), docsShown: vis('settings-emaillink-docs-block'),
    reason: vis('settings-emaillink-reason') ? document.getElementById('settings-emaillink-reason').textContent : '', gone: vis('settings-emaillink-gone'),
    selectValue: sel ? sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].textContent : null, selectDisabled: !!sel && sel.disabled,
    options: sel ? Array.from(sel.options).map(o => o.textContent) : [], items: Array.from(document.querySelectorAll('#settings-emaillink-list .settings-emaillink-name')).map(n => n.textContent),
    addDisabled: !!add && add.disabled, addOptions: add ? Array.from(add.options).map(o => o.textContent) : [], activeTab: (document.querySelector('[data-settings-tab].active, [data-settings-tab][aria-selected="true"]') || {}).dataset ? document.querySelector('[data-settings-tab].active, [data-settings-tab][aria-selected="true"]').dataset.settingsTab : null };
});
// La liste native d'un champ de Réglages : le navigateur sans écran n'en dessine pas la fenêtre, le choix se pose donc par `selectOption` (UN évènement change, comme un choix à la souris ; les flèches en poseraient un par ligne traversée).
async function pickInSelect(page, selectSel, text) {
  const c = await rectOf(page, selectSel);
  if (!c || !c.onTop) throw new Error('champ introuvable ou recouvert : ' + selectSel);
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.selectOption(selectSel, { label: text });
  await page.waitForTimeout(450);
  return c;
}
async function closeSettings(page) { await realClick(page, '#settings-close', 350); }
const modalShown = (page, id) => page.evaluate(i => { const m = document.getElementById(i); return !!m && getComputedStyle(m).display !== 'none'; }, id);

let page = await openPage('');
await markStatus(page);
const bar0 = (await buttonInfo(page)).barH;

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 1) Le bouton à côté de l'étoile : un document sans email lié (« Contrat de vente », ouvert au démarrage), le menu, puis Réglages > Email
// ---------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== Un document sans email lié ==');
let b = await buttonInfo(page);
check('le bouton est là, à droite de l\'étoile, dans la barre, sans la rendre plus haute ni sortir du panneau à 700 px', !!b && b.shown && b.besideStar && b.inBar && b.clusterRight <= b.vw, b);
check('sans email lié : l\'icône est l\'enveloppe (le geste mène à l\'email), discrète (pas d\'accent), et dit « Aucun email lié : cliquer pour en choisir un »', b.toEmail && !b.toDoc && !b.target && !b.disabled && b.aria === 'Aucun email lié : cliquer pour en choisir un' && /rect/.test(b.mask), b);
const without = await page.evaluate(() => { const g = document.getElementById('v2-linked-email-group'); const h = () => Math.round(document.getElementById('toolbar-top').getBoundingClientRect().height); const withBtn = h(); g.style.display = 'none'; const hidden = h(); g.style.display = ''; return { withBtn, hidden }; });
check('le bouton ne rend pas la barre plus haute (la rangée du titre ne passe pas à la ligne)', without.withBtn === without.hidden, without);
await page.screenshot({ path: SHOTS + '/1-barre-sans-lien.png', clip: { x: 0, y: 0, width: 700, height: 120 } });
await hoverButton(page);
check('au survol : un menu s\'ouvre sous le bouton, dans le panneau', await flyoutShown(page));
let rows = await flyoutRows(page);
check('le menu liste les emails du document (ordre alphabétique), aucun marqué, puis « Choisir l\'email lié… »', JSON.stringify(rows.map(r => r.text).filter(Boolean)) === JSON.stringify(['Ouvrir un email', 'Email de relance', 'Email du bail', 'Choisir l’email lié…']) && rows.every(r => !r.active), rows);
await page.screenshot({ path: SHOTS + '/2-menu-sans-lien.png', clip: { x: 0, y: 0, width: 700, height: 220 } });
await away(page);
await page.waitForTimeout(250);

// Un clic sans email lié mène à Réglages > Email, où le choix se pose (un geste de plus : « deux clics si on veut choisir un autre modèle »).
await realClick(page, '#btn-linked-email', 600);
let s = await settings(page);
check('un clic sur le bouton sans email lié ouvre Réglages sur l\'onglet Email, dans le panneau', s.open && s.inPanel && s.activeTab === 'mailClient' && s.chooseShown && !s.docsShown, s);
check('la section dit « Email lié à ce document », propose « — Aucun — » puis les emails, et rien n\'est grisé', s.title === 'Email lié à ce document' && s.selectValue === '— Aucun —' && JSON.stringify(s.options) === JSON.stringify(['— Aucun —', 'Email de relance', 'Email du bail']) && !s.selectDisabled && s.reason === '', s);
await page.screenshot({ path: SHOTS + '/3-reglages-document.png', clip: { x: 0, y: 0, width: 700, height: 400 } });
await markStatus(page);
await pickInSelect(page, '#settings-emaillink-select', 'Email du bail');
s = await settings(page);
check('choisir « Email du bail » écrit le lien (le jeton de l\'email, dans la ligne du document seulement), le coin d\'état le dit', (await linkOnDisk(page, 2)) === 'mail-bail' && s.selectValue === 'Email du bail' && (await seen(page, 'Email « Email du bail » lié à « Contrat de vente ».')), { link: await linkOnDisk(page, 2), s, seen: await page.evaluate(() => window.__statusSeen) });
await closeSettings(page);
check('« Fermer » referme Réglages', !(await modalShown(page, 'settings-modal')));
// Ctrl + Z est celui de l'éditeur (js/action-history.js : le lien y est un repère) : la personne referme Réglages, reprend le texte, puis l'annule.
await realClick(page, '.ProseMirror', 250);
await page.keyboard.press('Control+z'); await page.waitForTimeout(700);
check('Ctrl + Z défait le lien : la colonne du document est vide et le coin d\'état le dit', (await linkOnDisk(page, 2)) === '' && (await seen(page, 'Lien retiré entre « Contrat de vente » et son email.')), { link: await linkOnDisk(page, 2), seen: await page.evaluate(() => window.__statusSeen) });
b = await buttonInfo(page);
check('le bouton le sait aussitôt : plus de compagnon, icône discrète', b.toEmail && !b.target && b.aria === 'Aucun email lié : cliquer pour en choisir un', b);
await page.keyboard.press('Control+y'); await page.waitForTimeout(700);
check('Ctrl + Y le rétablit : le document retrouve « Email du bail »', (await linkOnDisk(page, 2)) === 'mail-bail', await linkOnDisk(page, 2));

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 2) UN clic : du document à son email, et UN clic de retour
// ---------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== Un clic, aller et retour ==');
await away(page);
b = await buttonInfo(page);
check('le lien posé : l\'icône prend la couleur d\'accent et dit « Aller à l\'email lié : « Email du bail » »', b.target && b.toEmail && b.aria === 'Aller à l’email lié : « Email du bail »', b);
await realClick(page, '#btn-linked-email', 900);
check('UN clic : l\'email « Email du bail » est ouvert', (await label(page)) === 'Email du bail', await label(page));
b = await buttonInfo(page);
check('depuis l\'email, le bouton montre la feuille et mène au document d\'où l\'on vient : « Revenir au document : « Contrat de vente » »', b.toDoc && !b.toEmail && b.target && b.aria === 'Revenir au document : « Contrat de vente »', b);
await page.screenshot({ path: SHOTS + '/4-sur-l-email.png', clip: { x: 0, y: 0, width: 700, height: 120 } });
await realClick(page, '#btn-linked-email', 900);
check('UN clic en retour : le document « Contrat de vente » est de nouveau ouvert', (await label(page)) === 'Contrat de vente', await label(page));
await away(page);

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 3) Le menu au survol : deux clics pour ouvrir un autre email ; le lien ne change pas
// ---------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== Le menu au survol ==');
await hoverButton(page);
rows = await flyoutRows(page);
check('le menu montre l\'email lié en premier, marqué', rows[1] && rows[1].text === 'Email du bail' && rows[1].active && rows.slice(2, 3).every(r => !r.active) && rows[2].text === 'Email de relance', rows);
await page.screenshot({ path: SHOTS + '/5-menu-avec-lien.png', clip: { x: 0, y: 0, width: 700, height: 220 } });
const toRelance = await slideToRow(page, '#v2-linked-email-flyout .v2-hover-row', 'Email de relance');
check('la ligne « Email de relance » est atteignable à la souris (rien ne la recouvre)', toRelance.onTop, toRelance);
await page.mouse.click(toRelance.x, toRelance.y); await page.waitForTimeout(900);
check('un clic sur la ligne ouvre « Email de relance »', (await label(page)) === 'Email de relance', await label(page));
check('ouvrir un autre email ne change pas le lien du document', (await linkOnDisk(page, 2)) === 'mail-bail', await linkOnDisk(page, 2));
await away(page);
b = await buttonInfo(page);
check('« Email de relance » ne sert aucun document, mais vient du document : le bouton y retourne', b.toDoc && b.aria === 'Revenir au document : « Contrat de vente »', b);
await realClick(page, '#btn-linked-email', 900);
check('le clic ramène à « Contrat de vente »', (await label(page)) === 'Contrat de vente', await label(page));

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 4) Un email qui sert deux documents, ouvert sans passer par le bouton : pas d'origine, le clic le dit ; le menu liste les documents
// ---------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== Un email, deux documents ==');
await openByPicker(page, 'Email du bail');
check('« Email du bail » est ouvert par la liste des modèles', (await label(page)) === 'Email du bail', await label(page));
b = await buttonInfo(page);
check('trois documents le visent (Bail habitation, Avenant loyer, Contrat de vente) : pas de compagnon unique, le bouton dit de choisir dans le menu', b.toDoc && !b.target && b.aria === 'Cet email sert à plusieurs documents : choisir dans le menu', b);
await markStatus(page);
await realClick(page, '#btn-linked-email', 400);
check('un clic ne devine pas : le coin d\'état dit que plusieurs documents sont liés', await seen(page, 'plusieurs'), await page.evaluate(() => window.__statusSeen));
await hoverButton(page);
rows = await flyoutRows(page);
check('le menu liste d\'abord les trois documents liés (marqués), puis les autres, puis « Lier un document… »', JSON.stringify(rows.slice(1, 4).map(r => r.text)) === JSON.stringify(['Avenant loyer', 'Bail habitation', 'Contrat de vente']) && rows.slice(1, 4).every(r => r.active) && rows[rows.length - 1].text === 'Lier un document…', rows);
const toAvenant = await slideToRow(page, '#v2-linked-email-flyout .v2-hover-row', 'Avenant loyer');
await page.mouse.click(toAvenant.x, toAvenant.y); await page.waitForTimeout(900);
check('un clic sur « Avenant loyer » l\'ouvre', (await label(page)) === 'Avenant loyer', await label(page));
await away(page);
b = await buttonInfo(page);
check('son email lié est « Email du bail » : le bouton y mène', b.toEmail && b.target && b.aria === 'Aller à l’email lié : « Email du bail »', b);

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 5) Réglages > Email côté email : retirer un document, en lier un autre
// ---------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== Réglages côté email ==');
await openByPicker(page, 'Email du bail');
await realClick(page, '#v2-btn-settings', 400);
await realClick(page, '[data-settings-tab="mailClient"]', 400);
s = await settings(page);
check('côté email : « Documents liés à cet email », la liste de ses trois documents, la liste « Lier un document » et rien de grisé', s.open && s.inPanel && s.title === 'Documents liés à cet email' && s.docsShown && !s.chooseShown && JSON.stringify(s.items) === JSON.stringify(['Avenant loyer', 'Bail habitation', 'Contrat de vente']) && !s.addDisabled && s.reason === '', s);
await page.screenshot({ path: SHOTS + '/6-reglages-email.png', clip: { x: 0, y: 0, width: 700, height: 400 } });
await markStatus(page);
const removeAvenant = await page.evaluate(() => { const b = document.querySelector('#settings-emaillink-list button[data-document-id="3"]'); if (!b) return null; b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: top === b || b.contains(top), text: b.textContent }; });
check('« Retirer » d\'« Avenant loyer » est atteignable à la souris', !!removeAvenant && removeAvenant.onTop && removeAvenant.text === 'Retirer', removeAvenant);
await page.mouse.move(removeAvenant.x, removeAvenant.y, { steps: 4 }); await page.mouse.click(removeAvenant.x, removeAvenant.y); await page.waitForTimeout(600);
s = await settings(page);
check('« Retirer » vide la colonne du document et le sort de la liste ; les deux autres restent liés', (await linkOnDisk(page, 3)) === '' && JSON.stringify(s.items) === JSON.stringify(['Bail habitation', 'Contrat de vente']) && (await linkOnDisk(page, 1)) === 'mail-bail', { s, a: await linkOnDisk(page, 3) });
check('le coin d\'état dit que le lien est retiré', await seen(page, 'Lien retiré entre « Avenant loyer » et son email.'), await page.evaluate(() => window.__statusSeen));
await pickInSelect(page, '#settings-emaillink-add', 'Avenant loyer');
s = await settings(page);
check('« Lier un document » : « Avenant loyer » revient dans la liste, et le lien s\'écrit', (await linkOnDisk(page, 3)) === 'mail-bail' && s.items.includes('Avenant loyer'), { s, a: await linkOnDisk(page, 3) });
await closeSettings(page);
await away(page);

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 6) Grisé, jamais masqué : l'email supprimé, un macro-modèle, un document pas encore enregistré
// ---------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== Grisé avec sa raison ==');
await openByPicker(page, 'Quittance');
b = await buttonInfo(page);
check('« Quittance » garde le jeton d\'un email supprimé : le bouton reste là, sans compagnon, et propose de choisir', b.shown && b.toEmail && !b.target && b.aria === 'Aucun email lié : cliquer pour en choisir un', b);
await realClick(page, '#btn-linked-email', 600);
s = await settings(page);
check('Réglages le dit : « Email supprimé » est le choix en cours, et la phrase sous la liste l\'explique', s.open && s.selectValue === '— Email supprimé —' && s.gone, s);
await page.screenshot({ path: SHOTS + '/7-email-supprime.png', clip: { x: 0, y: 0, width: 700, height: 400 } });
await closeSettings(page);
await away(page);
await openByPicker(page, 'Courrier en lot');
b = await buttonInfo(page);
check('un macro-modèle ne se lie pas : le bouton est grisé (visible), et sa raison est son nom accessible', b.shown && b.soft && b.aria === 'Seuls un document, une grille et un email se lient entre eux', b);
await hoverButton(page);
check('grisé : le menu ne s\'ouvre pas', !(await flyoutShown(page)) || (await flyoutRows(page)).length === 0);
await away(page);
await realClick(page, '#v2-btn-settings', 400);
await realClick(page, '[data-settings-tab="mailClient"]', 400);
s = await settings(page);
check('Réglages > Email d\'un macro-modèle : le contrôle est grisé et une phrase visible dit pourquoi', s.open && s.reason !== '' && !s.docsShown && !s.chooseShown, s);
await closeSettings(page);

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 7) Sombre, en anglais : le bouton, le menu, Réglages
// ---------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== Sombre, en anglais ==');
// La page se traduit au chargement et la langue se change en rechargeant : ici la fenêtre Réglages est retraduite à la main pour que la capture montre l'anglais.
await page.evaluate(() => { Settings.setTheme('dark'); I18n.setLang('en'); document.querySelectorAll('#settings-modal [data-i18n]').forEach(e => { e.textContent = I18n.t(e.getAttribute('data-i18n')); }); });
await page.waitForTimeout(500);
await openByPicker(page, 'Bail habitation');
b = await buttonInfo(page);
check('anglais : « Go to the linked email: “Email du bail” »', b.aria === 'Go to the linked email: “Email du bail”' && b.target && b.toEmail, b);
const colors = await page.evaluate(() => { const bt = document.getElementById('btn-linked-email'); const cs = getComputedStyle(bt); const star = getComputedStyle(document.getElementById('btn-set-default-template')); return { color: cs.color, bg: cs.backgroundColor, starColor: star.color }; });
await page.screenshot({ path: SHOTS + '/8-sombre-anglais-barre.png', clip: { x: 0, y: 0, width: 700, height: 120 } });
await hoverButton(page);
rows = await flyoutRows(page);
check('anglais : le menu dit « Open an email », l\'email lié en premier et « Choose the linked email… »', rows[0].text === 'Open an email' && rows[1].text === 'Email du bail' && rows[1].active && rows[rows.length - 1].text === 'Choose the linked email…', rows);
await page.screenshot({ path: SHOTS + '/9-sombre-anglais-menu.png', clip: { x: 0, y: 0, width: 700, height: 220 } });
await away(page);
await realClick(page, '#v2-btn-settings', 400);
await realClick(page, '[data-settings-tab="mailClient"]', 400);
s = await settings(page);
check('anglais : Réglages > Email dit « Email linked to this document » et propose « — None — »', s.title === 'Email linked to this document' && s.selectValue === 'Email du bail' && s.options[0] === '— None —', s);
await page.screenshot({ path: SHOTS + '/10-sombre-anglais-reglages.png', clip: { x: 0, y: 0, width: 700, height: 400 } });
await closeSettings(page);
await page.evaluate(() => { Settings.setTheme('light'); I18n.setLang('fr'); });
await page.context().close();

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await browser.close(); server.close();
console.log(`\nCaptures : ${SHOTS}`);
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
