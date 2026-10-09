#!/usr/bin/env node
// Lien mailto: du mode Email (js/mailto-export.js, onCreateEmail de js/main.js) à 700x400 (le panneau d'Antoine), au VRAI clic sur « Créer l'email » (page.mouse) : retour d'Antoine du
// 02/10 (« améliorer la mise en forme conservée lors de l'envoi d'un email, par exemple les listes à puces », il ouvre le lien dans Zimbra). Un nouvel email créé à la souris, Objet et
// destinataire tapés au vrai clavier, un corps avec une bulle #Prenom, puces, sous-liste, numéros, citation et lien : le lien que le bouton ouvre est capté au moment du clic (un écouteur sur le clic de
// l'ancre que le bouton crée, sans rien ouvrir) puis décodé comme le fait un logiciel de messagerie. On y lit les puces de l'éditeur, les retraits sous le texte, « > » devant la citation,
// les retours à la ligne en CRLF, l'objet et le destinataire à l'identique, et la jauge de la barre (« n / 2000 caractères ») égale à la longueur du lien envoyé.
// Retour d'Antoine du 09/10 (« il y a un gros écart entre la vue éditeur et le mailto », « on peut encore mettre en gras avec le raccourci ») : le texte du lien a les lignes de l'éditeur
// (paragraphes vides, Entrée trois fois, Maj+Entrée dans une ligne et en fin de ligne tapés au vrai clavier) ; dans un email, Ctrl+B, I, U, E, Ctrl+Maj+S, L, E, R, J (Verr. Maj. comprise)
// ne mettent rien en forme alors qu'ils le font dans un document, un collage du VRAI presse-papiers de Chromium (HTML de Google Docs ou de Word, texte brut avec lignes vides) perd la mise
// en forme dans un email et la garde dans un document, et la mise en forme restée d'un ancien modèle email n'est plus montrée.
// Même jour, les niveaux de titre (choix « Griser » d'Antoine) : dans un email, Ctrl+Alt+1 à 6 et Alt+Maj+1 à 3 au vrai clavier ne posent aucun titre, « # Titre » tapé reste la ligne tapée, le menu
// des titres est grisé (la souris ne l'ouvre pas, il reste à sa place), un titre d'un ancien modèle s'affiche comme une ligne simple ; un document garde le tout (touches, « # », menu à la souris).
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
// Les lignes vides sont celles que la personne tape (un paragraphe vide, deux de suite pour une ligne vide double) : le texte du lien porte les lignes de l'éditeur, une pour une.
const BODY_HTML = `<h1>Relance</h1><p></p><p>Bonjour ${badge('Contacts', 'Prenom')},</p><p></p><p></p><p>Voici la liste :</p>`
  + '<ul><li><p>Premier point</p></li><li><p>Deuxième point</p><ul data-bullet-style="circle"><li><p>Sous-point A</p></li><li><p>Sous-point B</p></li></ul></li><li><p>Troisième</p></li></ul><p></p>'
  + '<ol><li><p>Un</p></li><li><p>Deux</p><p>suite du deux</p></li></ol><p></p>'
  + '<blockquote><p>Citation ligne un</p><p>Citation ligne deux</p></blockquote><p></p>'
  + '<p>Voir <a href="https://exemple.fr/page">le site</a>.</p><p>Cordialement</p>';
const WANT_BODY = 'Relance\n\nBonjour Marie,\n\n\nVoici la liste :\n• Premier point\n• Deuxième point\n  ° Sous-point A\n  ° Sous-point B\n• Troisième\n\n1. Un\n2. Deux\n   suite du deux\n\n> Citation ligne un\n> Citation ligne deux\n\nVoir le site (https://exemple.fr/page).\nCordialement';
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
  check('le corps a les lignes de l’éditeur (une ligne vide pour chaque paragraphe vide, deux de suite restent deux, des paragraphes collés restent collés), les puces de l’éditeur (• ° ), la numérotation, le retrait sous le texte de l’item, « > » devant chaque ligne de la citation et le lien écrit « texte (adresse) »',
    (mail.body || '').replace(/\r\n/g, '\n') === WANT_BODY, { got: (mail.body || '').replace(/\r\n/g, '\n'), want: WANT_BODY });
  const gaugeAfter = await page.evaluate(() => document.getElementById('v2-email-char-counter').textContent.trim());
  check('la jauge affiche la longueur exacte du lien ouvert', gaugeAfter === `${urls[0].length} / 2000 caractères`, { gaugeAfter, length: urls[0].length });
  check('le texte d’état annonce l’email créé et le bouton est de nouveau actif', (await statusText()) === 'Email créé, ouverture de votre logiciel de messagerie.' && await page.evaluate(() => !document.getElementById('btn-create-email').disabled), await statusText());
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'email-700x400.png') });

  await linesTypedOnTheKeyboard();
  await formattingKeysAndPaste();
}

// Le corps du dernier lien ouvert par « Créer l'email », CRLF ramenés à « \n ».
async function createEmailBody() {
  await realClick('#btn-create-email', 700);
  const urls = await page.evaluate(() => window.__mailtos.slice());
  return (readMailto(urls[urls.length - 1] || 'mailto:').body || '').replace(/\r\n/g, '\n');
}
const editorHtml = () => page.evaluate(() => Editor.getHTML());
// Le texte `html` dans l'éditeur, le curseur posé par un vrai clic sur sa première ligne (jamais sur le centre de la zone, qui peut être sous la barre ou hors du panneau) ; un clic qui
// n'atteint pas l'éditeur est un échec, sinon rien n'est dit.
async function editorWithCursor(html) {
  await page.evaluate(h => Editor.setHTML(h), html);
  await page.waitForTimeout(250);
  const c = await realClick('.tiptap > p', 150);
  const focused = await page.evaluate(() => !!document.activeElement && document.activeElement.closest('.tiptap') !== null);
  if (!c.onTop || !focused) check('le clic sur la première ligne met le curseur dans l’éditeur', false, { onTop: c.onTop, focused });
}
const emptyEditorWithCursor = () => editorWithCursor('<p></p>');
// Ce que fait une application qui copie : le HTML tel quel (`unsanitized`, sans quoi Chromium en retire les styles) et le texte brut dans le VRAI presse-papiers.
async function setClipboard(parts) {
  await page.evaluate(async (p) => {
    const items = {};
    if (p.html) items['text/html'] = new Blob([p.html], { type: 'text/html' });
    if (p.text) items['text/plain'] = new Blob([p.text], { type: 'text/plain' });
    await navigator.clipboard.write([new ClipboardItem(items, { unsanitized: ['text/html'] })]);
  }, parts);
}
// Un nouveau modèle par le menu « + » ; la souris le quitte ensuite : le menu à survol resterait ouvert sur le document (« Importer un Excel… » sous le premier clic).
async function newModel(rowId) {
  await realHover('#v2-new-template-group #btn-new');
  await realClick(rowId, 900);
  await page.mouse.move(WIDTH - 20, HEIGHT - 20, { steps: 4 });
  await page.waitForTimeout(500);
}

// 4) Les lignes tapées au vrai clavier : Entrée trois fois (deux lignes vides), Maj+Entrée dans une ligne, Maj+Entrée en fin de ligne - ce que l'éditeur montre est ce que le lien porte.
async function linesTypedOnTheKeyboard() {
  await emptyEditorWithCursor();
  const kb = page.keyboard;
  await kb.type('Bonjour Marie,');
  for (let i = 0; i < 3; i++) await kb.press('Enter');
  await kb.type('Voici :');
  await kb.press('Shift+Enter');
  await kb.type('la suite');
  await kb.press('Enter');
  await kb.type('Fin');
  await kb.press('Shift+Enter');
  await kb.press('Enter');
  await kb.type('Après');
  await page.waitForTimeout(300);
  const shown = await page.evaluate(() => {
    // Les lignes que l'éditeur montre : la hauteur de chaque bloc rapportée à celle d'une ligne.
    const line = parseFloat(getComputedStyle(document.querySelector('.tiptap p')).lineHeight);
    return Array.from(document.querySelectorAll('.tiptap > p')).reduce((sum, p) => sum + Math.round(p.getBoundingClientRect().height / line), 0);
  });
  const body = await createEmailBody();
  check('lignes tapées au vrai clavier (Entrée ×3, Maj+Entrée dans une ligne et en fin de ligne) : le lien porte les mêmes lignes vides que l’éditeur', body === 'Bonjour Marie,\n\n\nVoici :\nla suite\nFin\n\nAprès', JSON.stringify(body));
  check('le nombre de lignes du texte est celui des lignes que l’éditeur montre', body.split('\n').length === shown, { shown, written: body.split('\n').length });
}

// 5) Mise en forme : les touches et le collage, dans un email puis dans un document (la contre-épreuve).
const SHORTCUTS = [
  ['Control+B', /<strong>/, 'gras'], ['Control+Shift+I', /<em>/, 'italique (Ctrl+Maj+I)'], ['Control+I', /<em>/, 'italique'], ['Control+U', /<u>/, 'souligné'],
  ['Control+E', /<code>/, 'code en ligne'], ['Control+Shift+S', /<s>/, 'barré'], ['Control+Shift+L', /text-align/, 'à gauche'], ['Control+Shift+E', /text-align: center/, 'centré'],
  ['Control+Shift+R', /text-align: right/, 'à droite'], ['Control+Shift+J', /text-align: justify/, 'justifié'],
];
// Les niveaux de titre : Ctrl+Alt+1 à 6 (touches de TipTap, 4 à 6 seulement par elles) et Alt+Maj+1 à 3 (actions « Titre 1 à 3 » de js/shortcuts.js).
const HEADING_COMBOS = [1, 2, 3, 4, 5, 6].map(n => [`Control+Alt+${n}`, new RegExp(`<h${n}[ >]`), `titre ${n} (Ctrl+Alt+${n})`])
  .concat([1, 2, 3].map(n => [`Alt+Shift+${n}`, new RegExp(`<h${n}[ >]`), `titre ${n} (Alt+Maj+${n})`]));
const GOOGLE_DOCS_HTML = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr" style="line-height:1.38;"><span style="font-weight:700;">Gras</span><span> </span>'
  + '<span style="font-style:italic;">ital</span><span> </span><span style="color:#ff0000;font-size:20pt;font-family:Georgia;">rouge</span></p>'
  + '<p dir="ltr" style="text-align:center;"><span>Centré</span></p><ul><li dir="ltr"><p dir="ltr"><span>Puce</span></p></li></ul></b>';
const GOOGLE_DOCS_TEXT = 'Gras ital rouge\nCentré\nPuce';
// Des signes de Markdown tapés : dans un email ils restent du texte, que le lien écrit tel quel ; un document en fait de la mise en forme.
const MARKDOWN = 'Voici **gras**, *ital*, ~~barré~~, `code`, __gras2__ et _ital2_ fin, snake_case_nom';

async function pressAllShortcuts(startHtml) {
  const seen = {};
  // Le texte entier choisi comme le fait une personne : un clic sur la ligne, puis Ctrl+A.
  const selectAllOf = async () => { await editorWithCursor(startHtml); await page.keyboard.press('Control+A'); await page.waitForTimeout(60); };
  for (const [combo, pattern, name] of SHORTCUTS) {
    await selectAllOf();
    await page.keyboard.press(combo);
    await page.waitForTimeout(60);
    seen[name] = pattern.test(await editorHtml());
  }
  // Ctrl+B avec Verr. Maj. : la capitale, sans Maj.
  await selectAllOf();
  await page.keyboard.down('Control');
  await page.keyboard.press('B');
  await page.keyboard.up('Control');
  await page.waitForTimeout(60);
  seen['gras avec Verr. Maj.'] = /<strong>/.test(await editorHtml());
  return seen;
}

async function pressAllHeadingKeys(startHtml) {
  const seen = {};
  for (const [combo, pattern, name] of HEADING_COMBOS) {
    await editorWithCursor(startHtml);
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(60);
    await page.keyboard.press(combo);
    await page.waitForTimeout(80);
    seen[name] = pattern.test(await editorHtml());
  }
  return seen;
}
// Le menu des titres à la souris : survol du bouton (le volet s'ouvre quand le groupe est actif), puis vrai clic sur « Titre 2 » (le curseur est dans le texte).
async function headingMenuState() {
  await realHover('#v2-heading-chip');
  return page.evaluate(() => {
    const group = document.getElementById('v2-heading-group');
    return {
      locked: group.classList.contains('v2-hf-locked'), shown: group.getClientRects().length > 0, opacity: Number(getComputedStyle(group).opacity),
      flyout: getComputedStyle(document.getElementById('v2-heading-flyout')).display,
    };
  });
}

async function formattingKeysAndPaste() {
  // Quitter un modèle modifié pose la question « Enregistrer / Abandonner / Annuler » (js/main.js:askBeforeLeaving, verify-leave-unsaved-mouse.mjs) : ici le passage au document n'est pas son
  // sujet, la réponse est « Abandonner ».
  await page.evaluate(() => { Dialogs.choose = async () => 'discard'; });
  // --- dans l'email ---
  // Avant tout Ctrl+A : un bloc posé (citation, titre, puces) juste après un Ctrl+A suivi d'un changement de modèle et d'un clic perd son bloc à la première lettre, avec ou sans ce module.
  await emptyEditorWithCursor();
  await page.keyboard.press('Control+Shift+B');
  await page.keyboard.type('Cité');
  await page.waitForTimeout(100);
  check('dans un email, la citation (Ctrl+Maj+B) reste possible : le texte du lien l’écrit', /<blockquote>/.test(await editorHtml()), await editorHtml());
  const mailKeys = await pressAllShortcuts('<p>Bonjour Marie</p>');
  check('dans un email, Ctrl+B, I, U, E, Ctrl+Maj+S, I, L, E, R, J (et Ctrl+B avec Verr. Maj.) au vrai clavier ne mettent rien en forme', Object.values(mailKeys).every(v => v === false), mailKeys);
  await emptyEditorWithCursor();
  await page.keyboard.type(MARKDOWN);
  await page.waitForTimeout(150);
  const typedMarkdown = await editorHtml();
  check('dans un email, des signes de Markdown tapés au vrai clavier (**gras**, *ital*, ~~barré~~, `code`, __gras__, _ital_) restent du texte : aucune mise en forme, aucun signe mangé', typedMarkdown === `<p>${MARKDOWN}</p>`, typedMarkdown);
  const markdownBody = await createEmailBody();
  check('et le lien porte ces signes tels qu’ils ont été tapés', markdownBody === MARKDOWN, JSON.stringify(markdownBody));

  // Les niveaux de titre : le texte brut n'écrit que la ligne, pas son niveau.
  const mailHeadingKeys = await pressAllHeadingKeys('<p>Bonjour Marie</p>');
  check('dans un email, Ctrl+Alt+1 à 6 et Alt+Maj+1 à 3 au vrai clavier ne posent aucun titre', Object.values(mailHeadingKeys).every(v => v === false), mailHeadingKeys);
  await emptyEditorWithCursor();
  await page.keyboard.type('# Titre');
  await page.waitForTimeout(120);
  const typedHeading = await editorHtml();
  check('dans un email, « # Titre » tapé au vrai clavier reste la ligne tapée (aucun titre), et le lien porte « # Titre »', typedHeading === '<p># Titre</p>' && (await createEmailBody()) === '# Titre', typedHeading);
  // Entrée derrière un « # » seul : la règle de saisie des titres de TipTap la prenait pour « # » + espace et mangeait le signe sans couper la ligne. Échap ferme d'abord le panneau
  // #Variable que « # » ouvre (sinon Entrée choisit une variable).
  await emptyEditorWithCursor();
  await page.keyboard.type('#');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Suite');
  await page.waitForTimeout(120);
  const hashEnter = await editorHtml();
  check('dans un email, « # » seul puis Entrée au vrai clavier coupe la ligne et garde le signe, et le lien porte « # » puis « Suite »', hashEnter === '<p>#</p><p>Suite</p>' && (await createEmailBody()) === '#\nSuite', hashEnter);
  await editorWithCursor('<p>Bonjour Marie</p>');
  const mailMenu = await headingMenuState();
  check('dans un email, le menu des titres est grisé sans disparaître et le survol ne l’ouvre pas', mailMenu.locked && mailMenu.shown && mailMenu.opacity < 0.6 && mailMenu.flyout === 'none', mailMenu);
  await realClick('#v2-heading-chip', 250);
  await page.mouse.move(WIDTH - 20, HEIGHT - 20, { steps: 4 });
  check('et un vrai clic sur son bouton n’ouvre rien et ne pose aucun titre', (await headingMenuState()).flyout === 'none' && !/<h[1-6][ >]/.test(await editorHtml()), await editorHtml());
  await page.mouse.move(WIDTH - 20, HEIGHT - 20, { steps: 4 });

  await emptyEditorWithCursor();
  await setClipboard({ html: GOOGLE_DOCS_HTML, text: GOOGLE_DOCS_TEXT });
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(400);
  const pasted = await editorHtml();
  check('un collage de Google Docs (gras, italique, couleur, taille, police, centré) perd cette mise en forme dans un email et garde la liste', !/<(strong|em|u|s)[ >]/.test(pasted) && !/style=/.test(pasted) && /<ul><li><p>Puce<\/p><\/li><\/ul>/.test(pasted) && /Gras ital rouge/.test(pasted), pasted);
  const pastedBody = await createEmailBody();
  check('et le lien porte ce texte : trois lignes, la puce de l’éditeur', pastedBody === 'Gras ital rouge\nCentré\n• Puce', JSON.stringify(pastedBody));

  await emptyEditorWithCursor();
  await setClipboard({ text: 'A\n\nB\n\n\n  C' });
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(300);
  const plainBody = await createEmailBody();
  check('un texte brut collé garde ses lignes vides (une, puis deux) et son retrait, dans l’éditeur comme dans le lien', plainBody === 'A\n\nB\n\n\n  C' && (await editorHtml()) === '<p>A</p><p></p><p>B</p><p></p><p></p><p>  C</p>', { plainBody, html: await editorHtml() });

  // Une mise en forme restée d'un ancien modèle ne s'affiche plus ; le modèle l'a toujours.
  await page.evaluate(() => Editor.setHTML('<h2>Titre ancien</h2><p>Texte <strong>gras</strong> <span style="color: rgb(255, 0, 0); font-size: 24px">rouge</span></p><p style="text-align: center">Centré</p>'));
  await page.waitForTimeout(250);
  const old = await page.evaluate(() => {
    const css = (selector, prop) => getComputedStyle(document.querySelector(selector))[prop];
    return {
      bold: css('.tiptap strong', 'fontWeight'), color: css('.tiptap span[style]', 'color'), size: css('.tiptap span[style]', 'fontSize'), align: css('.tiptap p[style]', 'textAlign'),
      heading: css('.tiptap h2', 'fontSize'), headingWeight: css('.tiptap h2', 'fontWeight'), stored: /<strong>/.test(Editor.getHTML()) && /<h2>Titre ancien<\/h2>/.test(Editor.getHTML()),
    };
  });
  check('la mise en forme restée d’un ancien modèle email (gras, couleur, taille, centré, niveau de titre) n’est plus montrée, et le modèle enregistré la garde', old.bold === '400' && old.color === 'rgb(27, 36, 48)' && old.size === '14px' && old.align === 'start'
    && old.heading === '14px' && old.headingWeight === '400' && old.stored, old);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'email-ancienne-mise-en-forme-700x400.png') });

  // --- dans un document : la contre-épreuve, tout fonctionne comme avant ---
  await newModel('#v2-btn-new-document');
  const docKeys = await pressAllShortcuts('<p>Bonjour Marie</p>');
  check('dans un document, les mêmes touches mettent en forme comme avant', Object.values(docKeys).every(v => v === true), docKeys);
  await emptyEditorWithCursor();
  await setClipboard({ html: GOOGLE_DOCS_HTML, text: GOOGLE_DOCS_TEXT });
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(400);
  const docPasted = await editorHtml();
  check('dans un document, le collage de Google Docs garde le gras, l’italique, la couleur, la taille et le centré', /<strong>Gras<\/strong>/.test(docPasted) && /<em>ital<\/em>/.test(docPasted) && /color: rgb\(255, 0, 0\)/.test(docPasted) && /font-size: 20pt/.test(docPasted) && /text-align: center/.test(docPasted), docPasted);
  await emptyEditorWithCursor();
  await page.keyboard.type(MARKDOWN);
  await page.waitForTimeout(150);
  const docTyped = await editorHtml();
  check('dans un document, les mêmes signes tapés posent toujours la mise en forme (gras, italique, barré, code)', /<strong>gras<\/strong>/.test(docTyped) && /<em>ital<\/em>/.test(docTyped) && /<s>barré<\/s>/.test(docTyped) && /<code>code<\/code>/.test(docTyped) && /<strong>gras2<\/strong>/.test(docTyped) && /<em>ital2<\/em>/.test(docTyped), docTyped);
  await page.evaluate(() => Editor.setHTML('<p>Texte <strong>gras</strong></p>'));
  await page.waitForTimeout(250);
  const docBold = await page.evaluate(() => getComputedStyle(document.querySelector('.tiptap strong')).fontWeight);
  check('et un document montre toujours son gras', Number(docBold) >= 700, docBold);
  const docHeadingKeys = await pressAllHeadingKeys('<p>Bonjour Marie</p>');
  check('dans un document, Ctrl+Alt+1 à 6 et Alt+Maj+1 à 3 posent toujours le titre voulu', Object.values(docHeadingKeys).every(v => v === true), docHeadingKeys);
  await emptyEditorWithCursor();
  await page.keyboard.type('# Titre');
  await page.waitForTimeout(120);
  const docTypedHeading = await editorHtml();
  check('dans un document, « # Titre » tapé au vrai clavier fait toujours un titre 1', /^<h1[ >]/.test(docTypedHeading) && /Titre/.test(docTypedHeading), docTypedHeading);
  await emptyEditorWithCursor();
  await page.keyboard.type('#');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Suite');
  await page.waitForTimeout(120);
  const docHashEnter = await editorHtml();
  check('dans un document, « # » seul puis Entrée fait toujours un titre 1 (la règle de TipTap n’est touchée que dans un email)', /^<h1[ >]/.test(docHashEnter) && /Suite/.test(docHashEnter), docHashEnter);
  await editorWithCursor('<p>Bonjour Marie</p>');
  const docMenu = await headingMenuState();
  check('dans un document, le menu des titres reste actif : le survol l’ouvre', !docMenu.locked && docMenu.shown && docMenu.opacity === 1 && docMenu.flyout !== 'none', docMenu);
  await realClick('#v2-heading-flyout .v2-hover-row[data-level="2"]', 300);
  const docMenuHtml = await editorHtml();
  check('et un vrai clic sur « Titre 2 » pose le titre', /^<h2[ >]/.test(docMenuHtml) && /Bonjour Marie/.test(docMenuHtml), docMenuHtml);
}

await run();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
