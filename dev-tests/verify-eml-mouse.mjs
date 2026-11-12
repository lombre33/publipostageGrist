#!/usr/bin/env node
// Export « Email (.eml) » du mode Email (js/eml-export.js ; demande d'Antoine du 12/11) à 700x400 (le panneau d'Antoine), à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard) :
// un nouvel email créé à la souris, le bouton « + PJ » après « + Cci » (le bandeau Objet / À / Cc / Cci / PJ tient dans 700 px sans défilement horizontal), la liste « # » du champ PJ tapée
// au clavier (seules les colonnes Pièces jointes), le type « Email (.eml) » choisi dans le menu du bouton à gauche d'Exporter (le gras de la barre se dégrise, rien d'autre ne change), puis le
// bouton Exporter : le fichier .eml téléchargé est lu (en-têtes, objet et destinataire résolus pour la ligne, HTML mis en forme, pièce jointe octet pour octet - servie par la route du faux
// Grist, comme le ferait le vrai serveur -), et le type « PDF » rend la barre de texte brut. ATTENTION - ce que ce parcours ne prouve pas : aucun VRAI client de messagerie n'a ouvert le fichier.
// Lancé par run-headless.mjs (groupe Node "emlMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-eml-mouse.mjs
// EML_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) et le .eml téléchargé (essai-vrai-export.eml, à ouvrir dans un vrai client) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.EML_MOUSE_PORT || 8947);
const SHOTS = process.env.EML_SHOTS || '';
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-eml-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
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

const nativeDialogs = [];
page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });

// Centre d'un élément (amené dans la vue), vrai déplacement puis vrai clic.
async function centerOf(selector) {
  return page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return null;
    e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = e.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, onTop: !!top && (top === e || e.contains(top)) };
  }, selector);
}
async function realClick(selector, wait = 300) {
  const c = await centerOf(selector);
  if (!c) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(wait);
  return c;
}
async function realHover(selector) {
  const c = await centerOf(selector);
  if (!c) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 30, c.y + 5, { steps: 3 });
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.waitForTimeout(450);
}
const statusText = () => page.evaluate(() => document.getElementById('status-msg').textContent.trim());


const ATTACHMENT_BYTES = Uint8Array.from({ length: 900 }, (_, i) => (i * 13 + 5) % 256);
const attachmentRequests = [];
await page.route('http://localhost/api/docs/**/attachments/*/download*', route => {
  attachmentRequests.push(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(ATTACHMENT_BYTES) });
});

const badge = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;
const TABLE = 'EmlClients';
const BODY_HTML = `<p>Bonjour ${badge(TABLE, 'Nom')},</p><p><strong>Ci-joint</strong> la facture de <em>mars</em>.</p>`;
const decodeWords = value => value.replace(/(=\?UTF-8\?B\?[^?]*\?=)\s+(?==\?UTF-8\?B\?)/g, '$1').replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, data) => Buffer.from(data, 'base64').toString('utf8'));
const stateOf = () => page.evaluate(() => {
  const locked = id => document.getElementById(id).classList.contains('v2-hf-locked');
  return { plain: EmailPlainText.isActive(), bold: locked('v2-btn-bold'), toc: locked('v2-btn-toc'), type: document.getElementById('v2-export-type').value };
});

async function run() {
  await page.evaluate(async () => {
    const stub = window.__gristStub;
    stub.setAttachments([{ id: 301, fileName: 'Facture été.pdf', fileType: 'application/pdf' }]);
    stub.setVariables('EmlClients', { Nom: 'Text', Mail: 'Text', Pj: 'Attachments', Notes: 'Text' });
    stub.setRows('EmlClients', [{ id: 1, Nom: 'Alice', Mail: 'alice@example.org', Pj: ['L', 301], Notes: 'x' }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: 'Alice', Mail: 'alice@example.org' }, 'EmlClients');
  });
  await page.waitForTimeout(300);
  await realHover('#v2-new-template-group #btn-new');
  await realClick('#v2-btn-new-email', 900);
  check('un nouvel email est ouvert, l’éditeur écrit le texte brut du lien (gras grisé)', (await stateOf()).plain && (await stateOf()).bold, await stateOf());

  // 0) Demande d'Antoine du 12/11 : tant que le type d'export n'est pas « Email (.eml) », ni « + PJ » ni son champ ne sont montrés (ils n'y serviraient à rien et induiraient en erreur).
  const pdfShown = await page.evaluate(() => {
    const visible = id => { const el = document.getElementById(id); const rect = el.getBoundingClientRect(); return getComputedStyle(el).display !== 'none' && rect.width > 0 && rect.height > 0; };
    return { cci: visible('v2-btn-toggle-cci'), pjButton: visible('v2-btn-toggle-pj'), pjField: visible('v2-email-pj') };
  });
  check('type PDF : « + Cci » est montré, « + PJ » et le champ PJ ne le sont pas', pdfShown.cci && !pdfShown.pjButton && !pdfShown.pjField, pdfShown);

  // 1) Le type « Email (.eml) » à la souris : le survol ouvre le menu, un clic sur la ligne la choisit.
  const eml = await realHover('#v2-btn-quality').then(() => centerOf('#v2-quality-flyout .v2-hover-row[data-export-type="eml"]'));
  check('la ligne « Email (.eml) » est offerte (non grisée) dans un email et accessible à la souris', !!eml && eml.onTop && !(await page.evaluate(() => document.querySelector('#v2-quality-flyout .v2-hover-row[data-export-type="eml"]').classList.contains('v2-hover-row-disabled'))), eml);
  await realClick('#v2-quality-flyout .v2-hover-row[data-export-type="eml"]', 400);
  const afterEml = await stateOf();
  check('« Email (.eml) » choisi : l’éditeur n’écrit plus le texte brut du lien (gras dégrisé), le sommaire reste grisé', afterEml.type === 'eml' && !afterEml.plain && !afterEml.bold && afterEml.toc, afterEml);
  const typeShown = await page.evaluate(() => document.getElementById('v2-btn-quality').classList.contains('active'));
  check('le bouton du type est allumé : on sait avant de cliquer sur Exporter que le fichier ne sera pas un PDF', typeShown, typeShown);

  // 2) Le bandeau : « + PJ » après « + Cci », un clic le montre, rien ne déborde à 700 px.
  const order = await page.evaluate(() => {
    const row = document.getElementById('v2-email-fields-row');
    return { ids: Array.from(row.children).map(child => child.id).filter(Boolean), overflow: row.scrollWidth - row.clientWidth, pjHidden: document.getElementById('v2-email-pj').hidden };
  });
  check('« Email (.eml) » choisi : le bouton « + PJ » vient juste après le champ Cci, le champ PJ après lui, replié au départ', order.ids.indexOf('v2-btn-toggle-pj') === order.ids.indexOf('v2-email-cci') + 1 && order.ids.indexOf('v2-email-pj') === order.ids.indexOf('v2-btn-toggle-pj') + 1 && order.pjHidden, order);
  // Le menu du type reste ouvert tant que la souris est dessus et recouvre le bandeau à 700 px : on la retire avant de viser « + PJ ».
  await page.mouse.move(350, 330);
  await page.waitForTimeout(500);
  await realClick('#v2-btn-toggle-pj', 250);
  const shown = await page.evaluate(() => {
    const field = document.getElementById('v2-email-pj');
    const rect = field.getBoundingClientRect();
    const row = document.getElementById('v2-email-fields-row');
    return { hidden: field.hidden, inside: rect.left >= 0 && rect.right <= window.innerWidth, width: Math.round(rect.width), overflow: row.scrollWidth - row.clientWidth, barBottom: Math.round(row.getBoundingClientRect().bottom) };
  });
  check('un clic sur « + PJ » montre le champ, dans la fenêtre de 700 px, sans défilement horizontal du bandeau', !shown.hidden && shown.inside && shown.width >= 64 && shown.overflow <= 1, shown);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'eml-bandeau-700x400.png') });

  // 3) Objet, destinataire et PJ au vrai clavier : la liste « # » du champ PJ ne propose que la colonne Pièces jointes.
  await realClick('#v2-email-subject', 150);
  await page.keyboard.type('Facture ');
  await page.keyboard.type('#EmlClients.Nom');
  await page.keyboard.press('Escape');
  await realClick('#v2-email-to', 150);
  await page.keyboard.type('#EmlClients.Mail');
  await page.keyboard.press('Escape');
  await realClick('#v2-email-pj .pp-field-text', 200);
  await page.keyboard.type('#EmlClients');
  await page.waitForTimeout(350);
  const listed = await page.evaluate(() => { const box = document.getElementById('autocomplete-box'); return box && box.style.display !== 'none' ? Array.from(box.querySelectorAll('.ac-item')).map(e => e.textContent) : null; });
  check('la liste « # » du champ PJ ne propose que la colonne de pièces jointes de la table', JSON.stringify((listed || []).filter(row => row.indexOf('EmlClients.') === 0)) === '["EmlClients.Pj"]', listed);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const pjValue = await page.evaluate(() => document.getElementById('v2-email-pj').value);
  check('Entrée pose la bulle de la colonne Pièces jointes dans le champ PJ', /EmlClients\.Pj/.test(pjValue), pjValue);
  await page.evaluate(html => Editor.setHTML(html), BODY_HTML);
  await page.waitForTimeout(500);

  await realHover('#v2-btn-quality');
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'eml-type-choisi-700x400.png') });

  // 4) Le vrai clic sur Exporter : le .eml est téléchargé et relu.
  const downloading = page.waitForEvent('download', { timeout: 30000 });
  await realClick('#btn-export-pdf', 200);
  const download = await downloading;
  const filePath = await download.path();
  if (SHOTS) await writeFile(join(SHOTS, 'essai-vrai-export.eml'), readFileSync(filePath));
  const raw = readFileSync(filePath).toString('latin1');
  check('le fichier téléchargé porte l’extension .eml', /\.eml$/.test(download.suggestedFilename()), download.suggestedFilename());
  check('le fichier est de l’ASCII pur, CRLF partout', /^[\x00-\x7F]*$/.test(raw) && !/(^|[^\r])\n/.test(raw), null);
  const head = raw.slice(0, raw.indexOf('\r\n\r\n')).replace(/\r\n[ \t]+/g, ' ');
  const header = name => (new RegExp('^' + name + ': (.*)$', 'mi').exec(head) || [])[1];
  check('X-Unsent, Message-ID valable, À et objet résolus pour la ligne', header('X-Unsent') === '1' && /^<[0-9a-z.]+@publipostage\.invalid>$/.test(header('Message-ID') || '') && header('To') === 'alice@example.org' && decodeWords(header('Subject') || '') === 'Facture Alice', head);
  check('le message n’a aucun From', !/^From:/mi.test(head), head);
  const html = raw.slice(raw.indexOf('Content-Type: text/html')).replace(/=\r\n/g, '');
  check('la mise en forme est dans le HTML (gras et italique, styles dans les balises), la bulle résolue', /<strong[^>]*>Ci-joint<\/strong>/.test(html) && /<em[^>]*>mars<\/em>/.test(html) && /Bonjour Alice/.test(html), html.slice(0, 400));
  const filename = /Content-Disposition: attachment;\s+filename="([^"]*)"/.exec(raw.replace(/\r\n[ \t]+/g, ' '));
  check('la pièce jointe de la ligne est jointe avec son nom accentué', !!filename && decodeWords(filename[1]) === 'Facture été.pdf', filename && filename[1]);
  const base64 = /filename="[^"]*"\r\n\r\n([A-Za-z0-9+\/=\r\n]+)\r\n--/.exec(raw);
  const bytes = base64 ? Buffer.from(base64[1].replace(/\s+/g, ''), 'base64') : Buffer.alloc(0);
  check('le fichier joint revient octet pour octet', Buffer.compare(bytes, Buffer.from(ATTACHMENT_BYTES)) === 0, bytes.length);
  check('le fichier n’a été demandé qu’une fois au serveur de Grist', attachmentRequests.length === 1, attachmentRequests.length);
  check('le coin d’état dit que l’email est prêt', /Email \(\.eml\) généré/.test(await statusText()), await statusText());

  // 5) Le type PDF rend le texte brut du lien, sans toucher au modèle.
  await realHover('#v2-btn-quality');
  await realClick('#v2-quality-flyout .v2-hover-row[data-export-type="pdf"]', 400);
  const back = await stateOf();
  check('en revenant au PDF, l’éditeur redevient celui du texte brut (gras grisé)', back.type === 'pdf' && back.plain && back.bold, back);
  const kept = await page.evaluate(() => ({ pj: document.getElementById('v2-email-pj').value, subject: document.getElementById('v2-email-subject').value }));
  check('le champ PJ et l’objet gardent leur valeur', /EmlClients\.Pj/.test(kept.pj) && /EmlClients\.Nom/.test(kept.subject), kept);
  const hiddenAgain = await page.evaluate(() => {
    const visible = id => { const el = document.getElementById(id); const rect = el.getBoundingClientRect(); return getComputedStyle(el).display !== 'none' && rect.width > 0 && rect.height > 0; };
    return { pjButton: visible('v2-btn-toggle-pj'), pjField: visible('v2-email-pj'), cci: visible('v2-btn-toggle-cci') };
  });
  check('en revenant au PDF, « + PJ » et le champ PJ disparaissent (« + Cci » reste)', !hiddenAgain.pjButton && !hiddenAgain.pjField && hiddenAgain.cci, hiddenAgain);
  await realHover('#v2-btn-quality');
  await realClick('#v2-quality-flyout .v2-hover-row[data-export-type="eml"]', 400);
  const returned = await page.evaluate(() => { const el = document.getElementById('v2-email-pj'); return { shown: getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0, value: el.value }; });
  check('« Email (.eml) » rechoisi : le champ PJ revient avec sa valeur', returned.shown && /EmlClients\.Pj/.test(returned.value), returned);
}

await run();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
