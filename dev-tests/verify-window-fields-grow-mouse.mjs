#!/usr/bin/env node
// Les champs d'une fenêtre qui grandissent sur place (js/field-editor.js : `pp-field-grows`, `unfold` ; css/field-editor.css), suite de la demande d'Antoine du 24/11 (« champs titre PDF à agrandir au clic comme les
// emails. À généraliser sur les champs similaires ») : le « Sinon afficher » d'une valeur (fenêtre de condition) et le « Si aucune ligne » d'une boucle. À 700x400, à la VRAIE souris (page.mouse) et au vrai clavier
// (page.keyboard). Un texte court ne change rien (le champ garde sa ligne de 26 px) ; un texte long, tapé caractère par caractère, fait passer le champ sur plusieurs lignes, sur place, à sa largeur, entier dans
// la fenêtre, tout le texte lisible, son curseur au-dessus du résultat collé au bas de la fenêtre ; Tab le referme, il montre alors le DÉBUT de son texte coupé par « … », à sa taille d'avant ; un clic dans le champ le
// rouvre et un clic ailleurs dans la fenêtre le referme ; la valeur reste UNE ligne. Et le défaut que la fenêtre ouverte révélait : avec des champs d'email trop longs pour leur ligne, ouvrir une fenêtre de variable
// depuis le document n'ouvre AUCUN d'eux derrière elle (seul un champ déjà ouvert, celui d'où vient la fenêtre, le reste). En français clair puis en anglais sombre.
// Lancé par run-headless.mjs (groupe Node "windowFieldsGrowMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-window-fields-grow-mouse.mjs
// WINDOW_FIELDS_GROW_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.WINDOW_FIELDS_GROW_MOUSE_PORT || 9521);
const SHOTS = process.env.WINDOW_FIELDS_GROW_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-email-fields-open-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-window-fields-grow-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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


const SHOT = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };
const typeSlow = async (text, delay = 4) => { await page.keyboard.type(text, { delay }); await page.waitForTimeout(300); };
const pressKey = async (key, wait = 250) => { await page.keyboard.press(key); await page.waitForTimeout(wait); };
const park = () => page.mouse.move(400, 330);

// Les champs de la barre (Objet, À, Cc, Cci, PJ, nom du PDF) qui sont ouverts en ce moment.
const barOpenIds = () => page.evaluate(() => Array.from(document.querySelectorAll('.pp-field-opens.is-open')).map(e => e.id));

// Le champ de la fenêtre : ouvert ?, sa boîte, ses lignes, son texte, la place du curseur et celle du résultat collé au bas de la fenêtre.
const winField = (id, modal) => page.evaluate(({ id, modal }) => {
  const host = document.getElementById(id);
  const text = host.querySelector('.pp-field-text');
  const line = text.firstElementChild;
  const h = host.getBoundingClientRect();
  const win = document.querySelector(modal + ' .var-modal-content').getBoundingClientRect();
  const body = document.querySelector(modal + ' .pp-modal-body');
  const bodyBox = body.getBoundingClientRect();
  const res = body.querySelector(':scope > .var-result');
  const sel = window.getSelection();
  let caretBottom = null;
  if (sel && sel.rangeCount && host.contains(sel.anchorNode)) {
    const r = sel.getRangeAt(0).cloneRange(); r.collapse(false);
    const cr = r.getClientRects()[0];
    if (cr) caretBottom = cr.bottom;
  }
  return {
    open: host.classList.contains('is-open'), focused: host.contains(document.activeElement), value: host.value,
    left: h.left, right: h.right, top: h.top, bottom: h.bottom, width: h.width, height: h.height,
    insideWindow: h.left >= win.left && h.right <= win.right, aboveBodyTop: h.top < bodyBox.top - 0.5,
    resultTop: res ? res.getBoundingClientRect().top : null, caretBottom,
    allShown: host.scrollHeight <= host.clientHeight + 1 && text.scrollWidth <= text.clientWidth + 1,
    lineClipped: line ? line.scrollWidth > line.clientWidth + 1 : false, ellipsis: line ? getComputedStyle(line).textOverflow : '',
    bodyOverflowX: body.scrollWidth - body.clientWidth, sideScroll: document.documentElement.scrollWidth > innerWidth + 0.5,
  };
}, { id, modal });

const SHORT = 'À confirmer ';
const LONG = 'auprès du service instructeur avant la fin du mois, pièces justificatives manquantes et attestation sur l’honneur à signer';

// Le champ `id` de la fenêtre `modal`, amené sous la molette puis testé de bout en bout.
async function growChecks(T, name, id, modal, tag) {
  await page.evaluate(({ id }) => document.getElementById(id).scrollIntoView({ block: 'center' }), { id });
  await page.waitForTimeout(150);
  const closed = await winField(id, modal);
  check(`${T}, ${name} : fermé, une ligne de ${Math.round(closed.height)} px, vide`, !closed.open && closed.height >= 24 && closed.height <= 30 && closed.value === '' && closed.insideWindow, closed);
  await realClick(`#${id} .pp-field-text`, 200);
  await typeSlow(SHORT);
  const short = await winField(id, modal);
  check(`${T}, ${name} : « ${SHORT.trim()} » tient sur la ligne : le champ a le curseur mais ne s'ouvre pas, sa hauteur ne change pas`, short.focused && !short.open && Math.abs(short.height - closed.height) < 1, short);
  await typeSlow(LONG);
  const long = await winField(id, modal);
  await SHOT(`${tag}-ouvert`);
  check(`${T}, ${name} : un texte long l'ouvre SUR PLACE : plusieurs lignes (${Math.round(long.height)} px, au plus cinq et leurs marges), même largeur, même bord gauche, entier dans la fenêtre, sans défilement de côté`,
    long.open && long.height > closed.height + 20 && long.height <= 140 && Math.abs(long.width - closed.width) < 1 && Math.abs(long.left - closed.left) < 1 && long.insideWindow && long.bodyOverflowX <= 0 && !long.sideScroll, { closed, long });
  check(`${T}, ${name} : tout le texte se lit dans le champ ouvert, et la valeur reste UNE ligne`, long.allShown && long.value === SHORT + LONG && !long.value.includes('\n'), long);
  check(`${T}, ${name} : le curseur reste à l'écran, au-dessus du résultat collé au bas de la fenêtre`, long.caretBottom !== null && long.caretBottom <= innerHeightOf(long) && (long.resultTop === null || long.caretBottom <= long.resultTop + 1), long);
  await pressKey('Tab', 350);
  const folded = await winField(id, modal);
  check(`${T}, ${name} : Tab le referme : une ligne comme avant, le DÉBUT du texte coupé par « … », la valeur entière gardée`,
    !folded.open && Math.abs(folded.height - closed.height) < 1 && folded.lineClipped && folded.ellipsis === 'ellipsis' && folded.value === SHORT + LONG, folded);
  await SHOT(`${tag}-ferme`);
  await realClick(`#${id} .pp-field-text`, 300);
  check(`${T}, ${name} : un clic dans le champ le rouvre`, (await winField(id, modal)).open, await winField(id, modal));
  await realClick(`${modal} .var-modal-content h3`, 300);
  const outside = await winField(id, modal);
  check(`${T}, ${name} : un clic ailleurs dans la fenêtre le referme, le texte est intact`, !outside.open && outside.value === SHORT + LONG, outside);
}
const innerHeightOf = () => HEIGHT;

const CONTACTS = [{ id: 1, Prenom: 'Marie', Email: 'marie@exemple.fr' }];
const SUBJECT_LONG = 'Relance n°7 — dossier de candidature à compléter avant le 30 novembre : pièces justificatives et attestation sur l’honneur';
const TO_LONG = 'marie.dupont@exemple.fr, jean.martin@exemple.fr, equipe-rh@exemple.fr, direction@exemple.fr, comptabilite@exemple.fr';
const CC_LONG = 'archives@exemple.fr, comptabilite@exemple.fr, pierre.durand@exemple.fr';

// Le point d'une lettre de la valeur conditionnelle du document, pour un vrai clic.
const valuePoint = index => page.evaluate(index => {
  const v = document.querySelector('.tiptap .conditional-value');
  v.scrollIntoView({ block: 'center' });
  const r = document.createRange(); r.setStart(v.firstChild, index); r.setEnd(v.firstChild, index + 1);
  const b = r.getBoundingClientRect();
  return { x: b.left + 1, y: b.top + b.height / 2 };
}, index);
const clickAt = async p => { await page.mouse.move(p.x - 6, p.y, { steps: 2 }); await page.mouse.move(p.x, p.y, { steps: 3 }); await page.mouse.click(p.x, p.y); await page.waitForTimeout(300); };

async function run(theme, lang) {
  const T = `${theme}/${lang}`;
  const tag = `${theme}-${lang}`;
  await page.evaluate(async contacts => {
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setVariables('Contacts', { Prenom: 'Text', Email: 'Text' });
    stub.setRows('Contacts', contacts);
    stub.setVariables('CvDossiers', { Titre: 'Text', Statut: 'Text', Montant: 'Numeric' });
    stub.setRows('CvDossiers', [{ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 }, { id: 2, Titre: 'Dossier B', Statut: 'Normal', Montant: 50 }]);
    stub.setVariables('MsFactures', { Numero: 'Text', Client: 'Text' });
    stub.setVariables('MsLignes', { Facture: 'Ref:MsFactures', Designation: 'Text', Qte: 'Numeric' });
    stub.setRows('MsFactures', [{ id: 1, Numero: 'F-1', Client: 'Atelier Durand' }, { id: 3, Numero: 'F-3', Client: 'Cabinet Morel' }]);
    stub.setRows('MsLignes', [{ id: 1, Facture: 1, Designation: 'Audit', Qte: 1 }, { id: 2, Facture: 1, Designation: 'Livret', Qte: 12 }]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('MsLignes');
    await GristAPI.saveLinkRule('MsLignes', { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(contacts[0], 'Contacts');
  }, CONTACTS);
  await page.waitForTimeout(300);

  // 1) Un email dont les trois champs sont plus longs que leur ligne, puis refermés : un clic dans le document.
  await realHover('#v2-new-template-group #btn-new');
  await realClick('#v2-btn-new-email', 900);
  await realClick('#v2-email-subject', 150); await typeSlow(SUBJECT_LONG);
  await pressKey('Tab'); await typeSlow(TO_LONG);
  await pressKey('Tab'); await typeSlow(CC_LONG);
  await page.evaluate(() => Editor.setHTML('<p>Madame, Monsieur,</p><p>Le dossier est <span class="conditional-value">traité</span> ce jour.</p><p>Fin du courrier</p>'));
  await page.waitForTimeout(500);
  await realClick('.tiptap p', 300);
  check(`${T}, un email aux champs Objet, À et Cc plus longs que leur ligne : tous fermés après un clic dans le document`, (await barOpenIds()).length === 0, await barOpenIds());

  // 2) La fenêtre de condition ouverte depuis le document : aucun champ de l'email ne s'ouvre derrière elle (le défaut : tous s'ouvraient, l'un sur l'autre).
  await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 }, 'CvDossiers'));
  await page.waitForTimeout(200);
  await park();
  await clickAt(await valuePoint(2));
  await realClick('.v2-varfmt-toolbar.visible button[data-action="var-condition"]', 500);
  const shown = await page.evaluate(() => { const m = document.getElementById('var-condition-modal'); return !!m && getComputedStyle(m).display !== 'none' && m.getClientRects().length > 0; });
  check(`${T}, un clic sur la valeur puis sur l'icône de condition ouvre la fenêtre`, shown);
  check(`${T}, la fenêtre ouverte, AUCUN champ de l'email n'est ouvert derrière elle`, (await barOpenIds()).length === 0, await barOpenIds());

  // 3) « Sinon afficher » : une colonne et une valeur choisies à la souris, le champ se dégrise.
  await realClick('#var-condition-modal .macro-rule-column-wrap .ss-trigger', 200);
  await page.keyboard.type('Statut'); await page.waitForTimeout(100);
  const option = await page.evaluate(() => {
    const f = Array.from(document.querySelectorAll('#var-condition-modal .ss-panel:not([hidden]) .ss-option')).find(r => r.querySelector('.ss-name').textContent === 'Statut');
    if (!f) return null;
    const r = f.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  check(`${T}, colonne Statut choisie à la vraie souris`, !!option);
  if (option) await page.mouse.click(option.x, option.y);
  await page.waitForTimeout(200);
  await realClick('#var-condition-modal .macro-rule-value', 150);
  await page.keyboard.type('Normal'); await page.waitForTimeout(300);
  await growChecks(T, '« Sinon afficher » de la valeur', 'var-condition-otherwise-text', '#var-condition-modal', `${tag}-1-sinon`);
  check(`${T}, pendant tout cela aucun champ de l'email ne s'est ouvert`, (await barOpenIds()).length === 0, await barOpenIds());
  await pressKey('Escape', 400);
  const gone = await page.evaluate(() => { const m = document.getElementById('var-condition-modal'); return !m || getComputedStyle(m).display === 'none' || m.getClientRects().length === 0; });
  check(`${T}, Échap ferme la fenêtre de condition`, gone);

  // 4) La fenêtre de la boucle : « Si aucune ligne » sur « Afficher un texte ».
  await page.evaluate(() => {
    const loop = JSON.stringify({ repeat: 'inline', table: 'MsLignes', empty: 'hide', separator: ', ' }).replace(/"/g, '&quot;');
    Editor.setHTML('<p>Madame, Monsieur,</p><p>Lignes : <span class="var-badge" data-table="MsLignes" data-column="Designation" data-key="MsLignes.Designation" data-loop="' + loop + '" data-loop-repeat="inline"></span>.</p><p>Fin du courrier</p>');
    window.__gristStub.fireRecord({ id: 3, Numero: 'F-3', Client: 'Cabinet Morel' }, 'MsFactures');
  });
  await page.waitForTimeout(500);
  await park();
  await realClick('.tiptap .var-badge', 300);
  await realClick('.v2-varfmt-toolbar.visible button[data-action="var-loop"]', 500);
  check(`${T}, la fenêtre de la boucle ouverte, AUCUN champ de l'email n'est ouvert derrière elle`, (await barOpenIds()).length === 0, await barOpenIds());
  await page.evaluate(() => { const d = document.querySelector('#var-loop-modal details.var-fold'); if (d) d.open = true; });
  await page.selectOption('#var-loop-modal #var-loop-empty', 'text');
  await page.waitForTimeout(250);
  await growChecks(T, '« Si aucune ligne » de la boucle', 'var-loop-empty-text', '#var-loop-modal', `${tag}-2-boucle`);
  check(`${T}, la boucle : aucun champ de l'email ne s'est ouvert`, (await barOpenIds()).length === 0, await barOpenIds());
}

async function restartIn(lang) {
  await page.evaluate(next => I18n.storeLang(next), lang);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
}

await run('light', 'fr');
await restartIn('en');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(250);
await run('dark', 'en');

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
