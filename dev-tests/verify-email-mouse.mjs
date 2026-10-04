#!/usr/bin/env node
// Lien mailto: du mode Email (js/mailto-export.js, onCreateEmail de js/main.js) à 700x400 (le panneau d'Antoine), au VRAI clic sur « Créer l'email » (page.mouse) : retour d'Antoine du
// 02/10 (« améliorer la mise en forme conservée lors de l'envoi d'un email, par exemple les listes à puces », il ouvre le lien dans Zimbra). Un nouvel email créé à la souris, Objet et
// destinataire tapés au vrai clavier, un corps avec une bulle #Prenom, puces, sous-liste, numéros, citation et lien : le lien que le bouton ouvre est capté au moment du clic (un écouteur sur le clic de
// l'ancre que le bouton crée, sans rien ouvrir) puis décodé comme le fait un logiciel de messagerie. On y lit les puces de l'éditeur, les retraits sous le texte, « > » devant la citation,
// les retours à la ligne en CRLF, l'objet et le destinataire à l'identique, et la jauge de la barre (« n / 2000 caractères ») égale à la longueur du lien envoyé.
// Lancé par run-headless.mjs (groupe Node "emailMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-email-mouse.mjs
// EMAIL_SHOTS=<dossier> : enregistre aussi une capture (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.EMAIL_MOUSE_PORT || 8941);
const SHOTS = process.env.EMAIL_SHOTS || '';
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
if (!OFFLINE) console.log('[verify-email-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Les liens mailto: que « Créer l'email » ouvre : captés au clic de l'ancre (phase de capture, avant tout traitement), jamais suivis.
await page.evaluate(() => {
  window.__mailtos = [];
  document.addEventListener('click', e => {
    const a = e.target && e.target.closest && e.target.closest('a[href^="mailto:"]');
    if (a) { window.__mailtos.push(a.getAttribute('href')); e.preventDefault(); }
  }, true);
});

// Ce que lit un logiciel de messagerie : « mailto:à?cc=…&subject=…&body=… », chaque valeur décodée.
function readMailto(url) {
  const [head, query = ''] = url.split('?');
  const params = {};
  query.split('&').filter(Boolean).forEach(pair => { const i = pair.indexOf('='); params[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1)); });
  return { to: decodeURIComponent(head.replace(/^mailto:/, '')), cc: params.cc, bcc: params.bcc, subject: params.subject, body: params.body, keys: Object.keys(params) };
}

const badge = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;
const BODY_HTML = `<h1>Relance</h1><p>Bonjour ${badge('Contacts', 'Prenom')},</p><p>Voici la liste :</p>`
  + '<ul><li><p>Premier point</p></li><li><p>Deuxième point</p><ul data-bullet-style="circle"><li><p>Sous-point A</p></li><li><p>Sous-point B</p></li></ul></li><li><p>Troisième</p></li></ul>'
  + '<ol><li><p>Un</p></li><li><p>Deux</p><p>suite du deux</p></li></ol>'
  + '<blockquote><p>Citation ligne un</p><p>Citation ligne deux</p></blockquote>'
  + '<p>Voir <a href="https://exemple.fr/page">le site</a>.</p><p>Cordialement</p>';
const WANT_BODY = 'Relance\n\nBonjour Marie,\n\nVoici la liste :\n\n• Premier point\n• Deuxième point\n  ° Sous-point A\n  ° Sous-point B\n• Troisième\n\n1. Un\n2. Deux\n   suite du deux\n\n> Citation ligne un\n> Citation ligne deux\n\nVoir le site (https://exemple.fr/page).\n\nCordialement';
const SUBJECT = 'Relance n°7 - 100 % payé';
const TO = 'marie.dupont@exemple.fr';

async function run() {
  // Une table, une ligne courante : « Créer l'email » écrit pour la ligne sélectionnée (la bulle #Prenom du corps y est résolue avant d'être mise en texte).
  await page.evaluate(async () => {
    const stub = window.__gristStub;
    stub.setVariables('Contacts', { Prenom: 'Text' });
    stub.setRows('Contacts', [{ id: 1, Prenom: 'Marie' }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Prenom: 'Marie' }, 'Contacts');
  });
  await page.waitForTimeout(300);
  // 1) Un nouvel email, à la souris : « + » (survol) puis « Nouvel email ».
  await realHover('#v2-new-template-group #btn-new');
  await realClick('#v2-btn-new-email', 900);
  check('un nouvel email est ouvert (barre Objet / À visible, bouton « Créer l’email » affiché)', await page.evaluate(() => getComputedStyle(document.getElementById('v2-email-fields-row')).display !== 'none' && getComputedStyle(document.getElementById('btn-create-email')).display !== 'none'));
  // 2) Objet et destinataire tapés au vrai clavier, corps posé dans l'éditeur.
  await realClick('#v2-email-subject', 150);
  await page.keyboard.type(SUBJECT);
  await realClick('#v2-email-to', 150);
  await page.keyboard.type(TO);
  await page.evaluate(html => Editor.setHTML(html), BODY_HTML);
  await page.waitForTimeout(900);
  const gauge = await page.evaluate(() => { const el = document.getElementById('v2-email-char-counter'); return { hidden: el.hidden, text: el.textContent.trim(), over: el.classList.contains('is-over-limit') }; });
  check('la jauge de la barre est affichée avec une longueur et la limite de 2000', !gauge.hidden && /^\d+ \/ 2000 caractères$/.test(gauge.text), gauge);

  // 3) Le vrai clic sur « Créer l'email » : un seul lien, lu comme le lit un logiciel de messagerie.
  await realClick('#btn-create-email', 900);
  const urls = await page.evaluate(() => window.__mailtos.slice());
  check('un seul clic ouvre un seul lien mailto:', urls.length === 1 && urls[0].startsWith('mailto:'), urls.length);
  const mail = readMailto(urls[0] || 'mailto:');
  check('le destinataire et l’objet arrivent à l’identique (accents, « % », « n° »)', mail.to === TO && mail.subject === SUBJECT, { to: mail.to, subject: mail.subject });
  check('le lien n’a que l’objet et le corps comme paramètres (ni cc ni cci vides)', JSON.stringify(mail.keys) === '["subject","body"]', mail.keys);
  const crlf = (mail.body || '').indexOf('\r\n') !== -1 && (mail.body || '').replace(/\r\n/g, '').indexOf('\n') === -1;
  check('les retours à la ligne du corps sont des CRLF, tous', crlf, JSON.stringify(mail.body));
  check('le corps garde les puces de l’éditeur (• ° ), la numérotation, le retrait sous le texte de l’item, « > » devant chaque ligne de la citation et le lien écrit « texte (adresse) »',
    (mail.body || '').replace(/\r\n/g, '\n') === WANT_BODY, { got: (mail.body || '').replace(/\r\n/g, '\n'), want: WANT_BODY });
  const gaugeAfter = await page.evaluate(() => document.getElementById('v2-email-char-counter').textContent.trim());
  check('la jauge affiche la longueur exacte du lien ouvert', gaugeAfter === `${urls[0].length} / 2000 caractères`, { gaugeAfter, length: urls[0].length });
  check('le texte d’état annonce l’email créé et le bouton est de nouveau actif', (await statusText()) === 'Email créé, ouverture de votre logiciel de messagerie.' && await page.evaluate(() => !document.getElementById('btn-create-email').disabled), await statusText());
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'email-700x400.png') });
}

await run();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
