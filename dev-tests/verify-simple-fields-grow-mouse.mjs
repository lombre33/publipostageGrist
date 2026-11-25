#!/usr/bin/env node
// Les champs de saisie simple qui grandissent au clic quand leur texte ne tient plus (js/grow-text.js, css/field-editor.css : `pp-grow-text`), suite de la demande d'Antoine du 24/11 (« champs titre PDF à agrandir
// au clic comme les emails. À généraliser sur les champs similaires », réponse à la carte : « Oui, tous ces champs ») : le texte du QR code, la formule d'un calcul et celle du tableau croisé, à 700x400, à la
// VRAIE souris (page.mouse) et au vrai clavier (page.keyboard). Fermé, le champ est une zone de texte d'UNE ligne de 30 px, vide ; un texte court tapé ne l'ouvre pas ; un texte long, tapé caractère par
// caractère, le fait passer sur plusieurs lignes (cinq au plus) sur place, à sa largeur, entier dans la fenêtre, avec le curseur à la fin en vue ; Tab le referme (une ligne, le début du texte, la valeur gardée) ;
// un clic dans le champ le rouvre et un clic ailleurs dans la fenêtre le referme ; « # » ouvre toujours la liste des colonnes devant la fenêtre et Entrée y choisit ; la valeur ne porte jamais de retour à la ligne
// (un texte collé sur plusieurs lignes les perd, Entrée n'en pose pas). En français clair puis en anglais sombre.
// Lancé par run-headless.mjs (groupe Node "simpleFieldsGrowMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-simple-fields-grow-mouse.mjs
// SIMPLE_FIELDS_GROW_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.SIMPLE_FIELDS_GROW_MOUSE_PORT || 9522);
const SHOTS = process.env.SIMPLE_FIELDS_GROW_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-window-fields-grow-mouse.mjs.
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/vfs_fonts\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@[\d.]+\/dist\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-simple-fields-grow-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const typeSlow = async (text, delay = 3) => { await page.keyboard.type(text, { delay }); await page.waitForTimeout(300); };
const pressKey = async (key, wait = 250) => { await page.keyboard.press(key); await page.waitForTimeout(wait); };
const park = () => page.mouse.move(400, 330);

// Le champ `id` de la fenêtre `modal` : sa nature, ouvert ?, sa boîte, sa valeur, le défilement de son texte, le curseur (à la fin ? en vue ?).
const fieldState = (id, modal) => page.evaluate(({ id, modal }) => {
  const box = document.getElementById(id);
  const r = box.getBoundingClientRect();
  const win = document.querySelector(modal + ' .pp-modal-box, ' + modal + ' .var-modal-content, ' + modal + ' [role="dialog"]') || document.querySelector(modal);
  const w = win.getBoundingClientRect();
  const body = box.closest('.pp-modal-body');
  const b = body ? body.getBoundingClientRect() : w;
  return {
    tag: box.tagName, open: box.classList.contains('is-open'), focused: document.activeElement === box, value: box.value,
    left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
    insideWindow: r.left >= w.left - 0.5 && r.right <= w.right + 0.5 && r.bottom <= w.bottom + 0.5, inBody: r.top >= b.top - 1 && r.bottom <= b.bottom + 1,
    atEndVisible: box.scrollTop + box.clientHeight >= box.scrollHeight - 1, scrollLeft: box.scrollLeft, scrollTop: box.scrollTop,
    multiline: box.getAttribute('aria-multiline'), sideScroll: document.documentElement.scrollWidth > innerWidth + 0.5,
  };
}, { id, modal });

const LONG = ' + SOMME(#Contacts.Prenom) * (1 + #Contacts.Email) - 100000 + une très longue suite de termes qui ne tient jamais sur la ligne de la fenêtre';

// Le champ `id` de la fenêtre `modal`, de bout en bout.
async function growChecks(T, name, id, modal, tag, short) {
  await page.evaluate(({ id }) => document.getElementById(id).scrollIntoView({ block: 'center' }), { id });
  await page.waitForTimeout(150);
  const closed = await fieldState(id, modal);
  check(`${T}, ${name} : fermé, une zone de texte d'une ligne de ${Math.round(closed.height)} px, vide, annoncée comme un champ d'une ligne`, closed.tag === 'TEXTAREA' && !closed.open && closed.height === 30 && closed.value === '' && closed.multiline === 'false' && closed.insideWindow, closed);
  await realClick(`#${id}`, 200);
  await typeSlow(short);
  const shortState = await fieldState(id, modal);
  check(`${T}, ${name} : « ${short} » tient sur la ligne : le champ a le curseur mais ne s'ouvre pas, sa hauteur ne change pas`, shortState.focused && !shortState.open && shortState.height === closed.height, shortState);
  await typeSlow(LONG, 2);
  const long = await fieldState(id, modal);
  await SHOT(`${tag}-ouvert`);
  check(`${T}, ${name} : un texte long l'ouvre SUR PLACE : plusieurs lignes (${Math.round(long.height)} px, cinq au plus), même largeur, même bord gauche, entier dans la fenêtre, sans défilement de côté`,
    long.open && long.height >= 50 && long.height <= 110 && Math.abs(long.width - closed.width) < 1 && Math.abs(long.left - closed.left) < 1 && long.insideWindow && !long.sideScroll, { closed, long });
  check(`${T}, ${name} : le texte tapé est entier, sans retour à la ligne, et le curseur, à la fin, est en vue`, long.value === short + LONG && !long.value.includes('\n') && long.atEndVisible && long.inBody, long);
  await pressKey('Tab', 350);
  const folded = await fieldState(id, modal);
  check(`${T}, ${name} : Tab le referme : une ligne comme avant, le DÉBUT du texte, la valeur entière gardée`, !folded.open && folded.height === closed.height && folded.scrollLeft === 0 && folded.scrollTop === 0 && folded.value === short + LONG, folded);
  await SHOT(`${tag}-ferme`);
  await realClick(`#${id}`, 300);
  check(`${T}, ${name} : un clic dans le champ le rouvre`, (await fieldState(id, modal)).open, await fieldState(id, modal));
  await realClick(`${modal} h3`, 300);
  const outside = await fieldState(id, modal);
  check(`${T}, ${name} : un clic ailleurs dans la fenêtre le referme, le texte est intact`, !outside.open && outside.height === closed.height && outside.value === short + LONG, outside);
}

const windowShown = modal => page.evaluate(m => { const e = document.querySelector(m); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; }, modal);

async function seed() {
  await page.evaluate(async () => {
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setVariables('Contacts', { Prenom: 'Text', Email: 'Text' });
    stub.setRows('Contacts', [{ id: 1, Prenom: 'Marie', Email: 'marie@exemple.fr' }]);
    stub.setVariables('CxLignes', { Prix: 'Numeric', TauxTva: 'Numeric' });
    stub.setRows('CxLignes', [{ id: 1, Prix: 10, TauxTva: 0.2 }]);
    const products = [[1, 'Plomberie', 1, 10, 2.5], [2, 'Visserie', 2, 100, 0.12], [3, 'Visserie', 1, 40, 0.3]];
    stub.setVariables('PvEmplacements', { Zone: 'Choice' }, { Zone: ['Réserve', 'Picking', 'Quai'] });
    stub.setVariables('PvAtlas', { Nom: 'Text' });
    stub.setVariables('PvProduits', { Categorie: 'Choice', Emplacement: 'Ref:PvEmplacements', Stock: 'Numeric', PrixAchat: 'Numeric', Atlas: 'Ref:PvAtlas', manualSort: 'ManualSortPos' }, { Categorie: ['Visserie', 'Électricité', 'Plomberie'] });
    stub.setRows('PvEmplacements', [{ id: 1, Zone: 'Réserve' }, { id: 2, Zone: 'Picking' }, { id: 3, Zone: 'Quai' }]);
    stub.setRows('PvAtlas', [{ id: 1, Nom: 'Atlas Nord' }, { id: 2, Nom: 'Atlas Sud' }]);
    stub.setRows('PvProduits', products.map(([id, Categorie, Emplacement, Stock, PrixAchat]) => ({ id, Categorie, Emplacement, Stock, PrixAchat, manualSort: id, Atlas: id % 2 ? 1 : 2 })));
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('PvProduits');
    await GristAPI.saveLinkRule('PvProduits', { mode: 'match', colonneCible: 'Atlas', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: 'Atlas Nord' }, 'PvAtlas');
  });
  await page.waitForTimeout(250);
}

async function run(theme, lang) {
  const T = `${theme}/${lang}`;
  const tag = `${theme}-${lang}`;
  await seed();
  await page.evaluate(() => Editor.setHTML('<p>Total : x</p>'));
  await page.waitForTimeout(300);

  // 1) Le texte du QR code (le menu « Insérer » le propose ; hors mode email, l'élément de menu ouvre la fenêtre).
  await page.evaluate(() => QrCode.open());
  await page.waitForTimeout(500);
  check(`${T}, la fenêtre du QR code est ouverte`, await windowShown('#pp-qr-modal'));
  await growChecks(T, 'texte du QR code', 'pp-qr-text', '#pp-qr-modal', `${tag}-1-qr`, 'https://exemple.fr');
  // « # » dans le champ : la liste des colonnes devant la fenêtre ; Entrée choisit (sans valider la fenêtre).
  await realClick('#pp-qr-text', 200);
  await pressKey('Control+a', 100); await pressKey('Delete', 150);
  await typeSlow('Adresse : #Contacts.Pre', 15);
  const list = await page.evaluate(() => { const b = document.getElementById('autocomplete-box'); if (!b || b.style.display === 'none') return null; const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + 12); return { onTop: !!top && b.contains(top), inViewport: r.left >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, items: Array.from(b.querySelectorAll('.ac-item')).map(i => i.textContent).slice(0, 3) }; });
  check(`${T}, « # » dans le texte du QR code ouvre la liste des colonnes devant la fenêtre`, !!list && list.onTop && list.items.some(i => i.includes('Prenom')), list);
  await pressKey('Enter', 300);
  const picked = await fieldState('pp-qr-text', '#pp-qr-modal');
  check(`${T}, Entrée choisit la colonne dans la liste : « #Contacts.Prenom » est posé, la fenêtre reste ouverte`, picked.value === 'Adresse : #Contacts.Prenom' && await windowShown('#pp-qr-modal'), picked);
  // Un texte collé sur plusieurs lignes tient sur une.
  await page.evaluate(() => navigator.clipboard.writeText('premiere ligne\nseconde ligne\r\ntroisieme'));
  await pressKey('Control+a', 100); await pressKey('Control+v', 300);
  const pasted = await fieldState('pp-qr-text', '#pp-qr-modal');
  check(`${T}, un texte collé sur plusieurs lignes perd ses retours à la ligne (ils deviennent des espaces)`, pasted.value === 'premiere ligne seconde ligne troisieme', pasted);
  // Entrée ne pose jamais de retour à la ligne : l'évènement `beforeinput` d'une ligne ajoutée est refusé.
  const refused = await page.evaluate(() => { const e = new InputEvent('beforeinput', { inputType: 'insertLineBreak', cancelable: true, bubbles: true }); document.getElementById('pp-qr-text').dispatchEvent(e); return e.defaultPrevented; });
  check(`${T}, un retour à la ligne demandé dans le champ est refusé`, refused);
  await pressKey('Escape', 400);
  check(`${T}, Échap ferme la fenêtre du QR code`, !(await windowShown('#pp-qr-modal')));

  // 2) La formule d'un calcul.
  await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.setTextSelection(8); VariableCalc.insertFromPanel(ed, { from: 8, to: 8 }); });
  await page.waitForTimeout(600);
  check(`${T}, la fenêtre du calcul est ouverte`, await windowShown('#pp-calc-modal'));
  await growChecks(T, 'formule d’un calcul', 'pp-calc-formula', '#pp-calc-modal', `${tag}-2-calc`, 'SOMME(#CxLignes.Prix)');
  await pressKey('Escape', 400);

  // 3) La formule du tableau croisé : une ligne de tableau portant un tableau croisé de formule, la fenêtre ouverte sur elle.
  await page.evaluate(() => {
    const def = { v: 1, source: { table: 'PvProduits', scope: 'linked' }, rows: ['Categorie'], cols: [], value: { kind: 'formula', formula: '{PvProduits.Stock} * {PvProduits.PrixAchat}' }, agg: 'sum' };
    const attr = JSON.stringify(def).replace(/"/g, '&quot;');
    const cells = text => [0, 1, 2, 3].map(i => `<td colwidth="${[120, 90, 90, 90][i]}"><p>${i === 0 ? text : ''}</p></td>`).join('');
    Editor.setHTML('<table><tbody><tr><th colspan="4" colwidth="120,90,90,90"><p><strong>Titre</strong></p></th></tr>' + `<tr data-pivot="${attr}">${cells('')}</tr><tr>${cells('Une ligne')}</tr></tbody></table>`);
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    let pos = -1;
    ed.state.doc.descendants((node, p) => { if (pos < 0 && node.type.name === 'tableRow' && node.attrs.pivot) pos = p; });
    PivotWindow.open(ed, pos);
  });
  await page.waitForTimeout(700);
  check(`${T}, la fenêtre du tableau croisé est ouverte`, await windowShown('#pp-pivot-modal'));
  await page.evaluate(() => { document.getElementById('pp-pivot-calc').value = ''; });
  await growChecks(T, 'formule du tableau croisé', 'pp-pivot-calc', '#pp-pivot-modal', `${tag}-3-pivot`, 'Stock * PrixAchat');
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

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
