#!/usr/bin/env node
// Les champs Objet, À, Cc, Cci du mode Email s'ouvrent quand leur texte ne tient plus (js/field-editor.js : `unfold`, css/field-editor.css : `.pp-field-opens.is-open`), demande d'Antoine du 23/11
// (« mode email : les champs Objet, À et Cc, c'est compliqué de bien voir, possible de pouvoir l'agrandir ? que ça soit plus simple à éditer ? ») ; choix de la carte : « Le champ s'ouvre quand je clique »,
// à 700x400 (le panneau d'Antoine), à la VRAIE souris (page.mouse) et au vrai clavier (page.keyboard). Un nouvel email créé par le menu « + » ; un texte court tapé dans l'Objet ne l'ouvre pas (le champ garde sa taille
// et son voisin À se clique au premier coup) ; un objet de plus de cent signes, tapé caractère par caractère, l'ouvre : le cadre va du retrait gauche au retrait droit du bandeau, passe sur plusieurs lignes, écrit
// son étiquette (Objet, Subject), montre TOUT le texte, garde le curseur à l'écran, et la barre d'outils et le document ne se décalent pas d'un pixel (le champ garde sa place dans la ligne) ; la valeur reste une seule ligne ;
// Tab referme l'Objet et passe à À, des adresses plus longues que sa ligne l'ouvrent à leur tour ; un clic ailleurs referme tout, le champ montre alors le DÉBUT de son texte, coupé par « … » ; une bulle « # » posée dans
// un champ ouvert garde sa barre devant le cadre et le champ ouvert ; la liste « # » passe devant le cadre ; le cadre suit un panneau plus étroit ; « Créer l'email » ouvre le lien mailto: avec l'objet entier ; en Lecture, un
// clic sur la valeur résolue trop longue l'ouvre (Échap, un clic ailleurs ou le retour en édition la referment) ; le champ Cci (Copie cachée) s'ouvre sous son étiquette ; le nom du PDF, lui, ne s'ouvre jamais ; la page ne défile
// jamais de côté et le cadre se lit en clair comme en sombre (4,5:1). En français clair puis en anglais sombre.
// Lancé par run-headless.mjs (groupe Node "emailFieldsOpenMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-email-fields-open-mouse.mjs
// EMAIL_FIELDS_OPEN_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.EMAIL_FIELDS_OPEN_MOUSE_PORT || 9520);
const SHOTS = process.env.EMAIL_FIELDS_OPEN_SHOTS || '';
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/vfs_fonts\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@[\d.]+\/dist\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-email-drafts-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Les liens mailto: que la page ouvre : captés au clic de l'ancre (phase de capture, avant tout traitement), jamais suivis. À reposer après chaque rechargement de la page.
const installCapture = () => page.evaluate(() => {
  window.__mailtos = [];
  document.addEventListener('click', e => {
    const a = e.target && e.target.closest && e.target.closest('a[href^="mailto:"]');
    if (a) { window.__mailtos.push(a.getAttribute('href')); (window.__mailtoTargets = window.__mailtoTargets || []).push(a.getAttribute('target')); e.preventDefault(); }
  }, true);
});
await installCapture();

// Ce que lit un logiciel de messagerie : « mailto:à?cc=…&subject=…&body=… », chaque valeur décodée.
function readMailto(url) {
  const [head, query = ''] = url.split('?');
  const params = {};
  query.split('&').filter(Boolean).forEach(pair => { const i = pair.indexOf('='); params[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1)); });
  return { to: decodeURIComponent(head.replace(/^mailto:/, '')), cc: params.cc, bcc: params.bcc, subject: params.subject, body: params.body, keys: Object.keys(params) };
}




const SHOT = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };
const tr = (key, vars) => page.evaluate(({ key, vars }) => I18n.t(key, vars), { key, vars });
const contrastOf = (fg, bg) => {
  const lum = css => { const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};


const CONTACTS = [{ id: 1, Prenom: 'Marie', Email: 'marie@exemple.fr' }];
const SUBJECT_SHORT = 'Relance n°7';
const SUBJECT_LONG = 'Relance n°7 — dossier de candidature à compléter avant le 30 novembre : pièces justificatives et attestation sur l’honneur';
const TO_LONG = 'marie.dupont@exemple.fr, jean.martin@exemple.fr, equipe-rh@exemple.fr, direction@exemple.fr, comptabilite@exemple.fr';
const CC_LONG = 'archives@exemple.fr, comptabilite@exemple.fr, pierre.durand@exemple.fr';

const typeSlow = async (text, delay = 4) => { await page.keyboard.type(text, { delay }); await page.waitForTimeout(250); };
const pressKey = async (key, wait = 200) => { await page.keyboard.press(key); await page.waitForTimeout(wait); };

// Où est tout ce qui ne doit pas bouger quand un champ s'ouvre : la barre de mise en forme, le document, le bandeau lui-même.
const layout = () => page.evaluate(() => {
  const top = id => Math.round(document.getElementById(id).getBoundingClientRect().top * 10) / 10;
  const row = document.getElementById('v2-email-fields-row').getBoundingClientRect();
  return { toolbar: top('v2-toolbar'), editor: top('editor-container'), rowTop: Math.round(row.top * 10) / 10, rowHeight: Math.round(row.height * 10) / 10, sideScroll: document.documentElement.scrollWidth > innerWidth + 0.5 };
});

// L'état d'un champ : ouvert ou non, sa boîte (celle du champ, qui ne bouge pas), celle de la zone de saisie (le cadre ouvert), l'étiquette écrite dans le cadre, le texte coupé ou non, la valeur.
const fieldState = id => page.evaluate(fieldId => {
  const host = document.getElementById(fieldId);
  const text = host.querySelector('.pp-field-text');
  const line = text.firstElementChild;
  const h = host.getBoundingClientRect(), t = text.getBoundingClientRect();
  const row = document.getElementById('v2-email-fields-row').getBoundingClientRect();
  const after = getComputedStyle(host, '::after').content;
  const afterBox = getComputedStyle(host, '::after');
  // Le dernier signe du texte et le curseur : tous deux dans le cadre et dans la fenêtre.
  const sel = window.getSelection();
  let caret = null;
  if (sel && sel.rangeCount && host.contains(sel.anchorNode)) {
    const r = sel.getRangeAt(0).cloneRange(); r.collapse(false);
    const cr = r.getClientRects()[0] || (sel.anchorNode.nodeType === 1 ? sel.anchorNode.getBoundingClientRect() : null);
    if (cr) caret = { left: cr.left, right: cr.right, top: cr.top, bottom: cr.bottom };
  }
  return {
    open: host.classList.contains('is-open'), focused: host.contains(document.activeElement), value: host.value,
    host: { left: h.left, top: h.top, width: h.width, height: h.height },
    box: { left: t.left, top: t.top, width: t.width, height: t.height, right: t.right, bottom: t.bottom },
    rowLeft: row.left, rowRight: row.right,
    preview: host.dataset.preview || '', previewShown: after !== 'none' && after !== 'normal' && after !== '""' && afterBox.position === 'absolute',
    lineClipped: line ? line.scrollWidth > line.clientWidth + 1 : false, lineScroll: line ? line.scrollLeft : 0, boxScrollLeft: text.scrollLeft,
    allShown: text.scrollHeight <= text.clientHeight + 1 && text.scrollWidth <= text.clientWidth + 1,
    ellipsis: line ? getComputedStyle(line).textOverflow : '', caret,
    insideViewport: t.left >= -0.5 && t.top >= -0.5 && t.right <= innerWidth + 0.5 && t.bottom <= innerHeight + 0.5,
    sideScroll: document.documentElement.scrollWidth > innerWidth + 0.5,
  };
}, id);
const openIds = () => page.evaluate(() => Array.from(document.querySelectorAll('.pp-field-opens.is-open')).map(e => e.id));
const topAt = (x, y) => page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e ? (e.closest('[id]') ? e.closest('[id]').id : e.tagName) : null; }, { x, y });


// Le champ du nom du fichier PDF : son état, sa boîte (celle de la ligne, qui ne bouge pas) et celle de la zone de saisie ouverte, la ligne de la barre qui le porte, l'aperçu, le texte coupé ou non.
const pdfState = () => page.evaluate(() => {
  const host = document.getElementById('pdf-filename-template');
  const text = host.querySelector('.pp-field-text');
  const line = text.firstElementChild;
  const h = host.getBoundingClientRect(), t = text.getBoundingClientRect();
  const bar = host.closest('.bar-row').getBoundingClientRect();
  const after = getComputedStyle(host, '::after');
  return {
    hidden: host.hidden || h.width === 0, open: host.classList.contains('is-open'), focused: host.contains(document.activeElement), value: host.value,
    host: { left: h.left, top: h.top, width: h.width, height: h.height, bottom: h.bottom },
    box: { left: t.left, top: t.top, width: t.width, height: t.height, right: t.right, bottom: t.bottom },
    bar: { left: bar.left, right: bar.right, bottom: bar.bottom }, preview: host.dataset.preview || '',
    previewShown: after.content !== 'none' && after.content !== 'normal' && after.position === 'absolute',
    lineClipped: line ? line.scrollWidth > line.clientWidth + 1 : false, ellipsis: line ? getComputedStyle(line).textOverflow : '',
    allShown: text.scrollHeight <= text.clientHeight + 1 && text.scrollWidth <= text.clientWidth + 1,
    insideViewport: t.left >= -0.5 && t.top >= -0.5 && t.right <= innerWidth + 0.5 && t.bottom <= innerHeight + 0.5,
    toolbar: Math.round(document.getElementById('v2-toolbar').getBoundingClientRect().top * 10) / 10,
    editor: Math.round(document.getElementById('editor-container').getBoundingClientRect().top * 10) / 10,
    sideScroll: document.documentElement.scrollWidth > innerWidth + 0.5,
  };
});
const PDF_SHORT = 'Facture_2026';
const PDF_LONG_START = 'Dossier_de_candidature_complet_pieces_justificatives_attestation_';
const PDF_LONG_END = '_2026_version_finale_a_transmettre';

// Le nom du PDF s'ouvre comme les champs de l'email : un nom court ne l'ouvre pas ; un nom long, une variable posée à la liste « # », l'ouvre sous la ligne de la barre, par-dessus elle, sur toute la largeur ;
// Entrée le referme (le nom est gardé, le champ montre son début coupé par « … ») ; un clic le rouvre, un clic ailleurs le referme. `where` : le mode (nom du fichier PDF d'un document ou d'un email).
async function pdfChecks(T, where) {
  const label = `${T}, nom du PDF (${where})`;
  await realClick('#btn-toggle-pdf-filename', 300);
  const shown = await pdfState();
  check(`${label} : le crayon montre le champ, vide et fermé`, !shown.hidden && shown.value === '' && !shown.open, shown);
  await realClick('#pdf-filename-template .pp-field-text', 150);
  await typeSlow(PDF_SHORT);
  const short = await pdfState();
  check(`${label} : « ${PDF_SHORT} » tient sur la ligne, le champ a le curseur mais ne s'ouvre pas, à sa largeur de ${Math.round(shown.host.width)} px`, short.focused && !short.open && Math.abs(short.host.width - shown.host.width) < 1, short);
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete');
  await typeSlow(PDF_LONG_START);
  await page.keyboard.type('#Contacts.Pre', { delay: 20 });
  await page.waitForTimeout(350);
  const list = await page.evaluate(() => { const b = document.getElementById('autocomplete-box'); if (!b || b.style.display === 'none') return null; const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + 12); return { onTop: !!top && b.contains(top), items: Array.from(b.querySelectorAll('.ac-item')).map(i => i.textContent).slice(0, 3) }; });
  check(`${label} : « # » dans le champ ouvre la liste des variables devant lui`, !!list && list.onTop && list.items.some(i => i.includes('Prenom')), list);
  await pressKey('Enter', 300);
  await typeSlow(PDF_LONG_END);
  const long = await pdfState();
  check(`${label} : un nom long ouvre le champ SOUS sa ligne, par-dessus la barre (le cadre commence au bas de la ligne, dans la fenêtre, plus large que la ligne)`,
    long.open && long.box.top >= long.host.bottom && long.insideViewport && long.box.width > long.host.width * 1.5 && !long.sideScroll, long);
  check(`${label} : tout le nom est lu dans le cadre, sur plusieurs lignes, et la ligne de la barre montre le début du même texte`, long.allShown && long.box.height > long.host.height && long.previewShown && long.preview === long.value && long.value.includes('#Contacts.Prenom'), long);
  check(`${label} : la valeur reste une ligne, la ligne du champ ne bouge pas (${Math.round(shown.host.width)} px de large) et la barre d'outils comme le document restent à leur place`,
    !long.value.includes('\n') && Math.abs(long.host.width - shown.host.width) < 1 && Math.abs(long.host.top - shown.host.top) < 1 && long.toolbar === shown.toolbar && long.editor === shown.editor, { long, shown });
  await SHOT(`${T.replace('/', '-')}-pdf-${where}-ouvert`);
  await pressKey('Enter', 300);
  const entered = await pdfState();
  check(`${label} : Entrée referme le champ, garde le nom entier et montre son début coupé par « … »`, !entered.open && !entered.focused && entered.value === long.value && entered.lineClipped && entered.ellipsis === 'ellipsis' && entered.preview === '', entered);
  await realClick('#pdf-filename-template', 300);
  check(`${label} : un clic dans le champ le rouvre`, (await pdfState()).open, await pdfState());
  await page.mouse.click(WIDTH / 2, HEIGHT - 20); await page.waitForTimeout(300);
  const outside = await pdfState();
  check(`${label} : un clic ailleurs le referme, le nom est intact`, !outside.open && outside.value === long.value, outside);
  await realClick('#pdf-filename-template .pp-field-text', 200);
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete');
  await page.mouse.click(WIDTH / 2, HEIGHT - 20); await page.waitForTimeout(250);
  await realClick('#btn-toggle-pdf-filename', 300);
}

const seedContacts = async () => {
  await page.evaluate(async contacts => {
    const stub = window.__gristStub;
    stub.setVariables('Contacts', { Prenom: 'Text', Email: 'Text' });
    stub.setRows('Contacts', contacts);
    await GristAPI.refreshSchema();
    stub.fireRecord(contacts[0], 'Contacts');
  }, CONTACTS);
  await page.waitForTimeout(300);
};

async function run(theme, lang) {
  const T = `${theme}/${lang}`;
  await seedContacts();

  // 0) Le nom du fichier PDF d'un document ordinaire (hors mode email). Le nom tapé rend le document « modifié » : la page est rechargée à neuf pour la suite (un nouvel email demanderait sinon de l'enregistrer).
  await pdfChecks(T, 'document');
  await restartIn(lang);
  await page.evaluate(t => Settings.setTheme(t), theme);
  await page.waitForTimeout(250);
  await seedContacts();

  // 1) Un nouvel email à la souris ; tout est fermé, à sa taille d'avant.
  await realHover('#v2-new-template-group #btn-new');
  await realClick('#v2-btn-new-email', 900);
  await page.mouse.move(WIDTH - 20, HEIGHT - 20, { steps: 4 });
  await page.waitForTimeout(400);
  const before = await layout();
  const closedSubject = await fieldState('v2-email-subject');
  const closedTo = await fieldState('v2-email-to');
  check(`${T}, un nouvel email : Objet, À et Cc sont fermés, sur une ligne de 38 px, côte à côte dans le bandeau`, (await openIds()).length === 0 && closedSubject.host.height === 38 && closedTo.host.height === 38 && closedSubject.host.top === closedTo.host.top && closedTo.host.width < 200, { closedSubject, closedTo });
  await SHOT(`${theme}-${lang}-1-ferme`);

  // 2) Un texte court ne l'ouvre pas : le champ garde sa taille, et le voisin se clique au premier coup.
  await realClick('#v2-email-subject', 150);
  await typeSlow(SUBJECT_SHORT);
  const shortState = await fieldState('v2-email-subject');
  check(`${T}, « ${SUBJECT_SHORT} » tient sur la ligne : le champ a le curseur mais ne s'ouvre pas, il garde sa largeur de ${Math.round(closedSubject.host.width)} px`, shortState.focused && !shortState.open && Math.abs(shortState.host.width - closedSubject.host.width) < 1 && shortState.box.width < closedSubject.host.width, shortState);
  await realClick('#v2-email-to', 150);
  const toFocused = await fieldState('v2-email-to');
  check(`${T}, un clic sur À pendant que l'Objet a le curseur donne le curseur à À (rien ne le recouvre)`, toFocused.focused && !(await fieldState('v2-email-subject')).focused, toFocused);
  await realClick('#v2-email-subject', 150);
  await pressKey('Control+a');
  await pressKey('Backspace');

  // 3) Un objet de plus de cent signes, tapé caractère par caractère : le champ s'ouvre.
  await typeSlow(SUBJECT_LONG, 4);
  const open = await fieldState('v2-email-subject');
  const afterOpen = await layout();
  check(`${T}, l'objet long ouvre l'Objet : la zone de saisie va du retrait gauche du bandeau à son retrait droit (10 px de chaque côté)`, open.open && Math.abs(open.box.left - (open.rowLeft + 10)) < 1.5 && Math.abs(open.box.right - (open.rowRight - 10)) < 1.5, open);
  check(`${T}, la zone ouverte est SOUS la ligne des champs (4 px plus bas), passe sur plusieurs lignes et montre TOUT l'objet (rien de caché, ni à droite ni en bas)`, open.box.top >= open.host.top + open.host.height + 3 && open.box.height >= 60 && open.allShown, open);
  check(`${T}, le champ de la ligne reste à sa place et à sa taille, avec le début de l'objet`, Math.abs(open.host.width - closedSubject.host.width) < 1 && open.host.top === closedSubject.host.top && open.host.height === 38 && open.previewShown && open.preview === SUBJECT_LONG, open);
  check(`${T}, le curseur est au bout du texte, dans le cadre et dans la fenêtre`, !!open.caret && open.caret.left >= open.box.left && open.caret.right <= open.box.right + 1 && open.caret.bottom <= open.box.bottom + 1 && open.insideViewport, { caret: open.caret, box: open.box });
  check(`${T}, ni la barre de mise en forme, ni le document, ni le bandeau ne bougent d'un pixel quand le champ s'ouvre`, afterOpen.toolbar === before.toolbar && afterOpen.editor === before.editor && afterOpen.rowTop === before.rowTop && afterOpen.rowHeight === before.rowHeight && !afterOpen.sideScroll, { before, afterOpen });
  check(`${T}, ce que le champ porte reste UNE ligne : la valeur est l'objet tapé, sans retour à la ligne`, open.value === SUBJECT_LONG && open.value.indexOf('\n') === -1, open.value);
  const centerTo = { x: closedTo.host.left + 20, y: closedTo.host.top + 18 };
  check(`${T}, la zone ouverte est devant la barre d'outils (un clic à son milieu tombe dans l'Objet) mais laisse la ligne des champs libre : À est sous la souris`, (await topAt(open.box.left + open.box.width / 2, open.box.top + 15)) === 'v2-email-subject' && (await topAt(centerTo.x, centerTo.y)) === 'v2-email-to', { frame: await topAt(open.box.left + open.box.width / 2, open.box.top + 15), to: await topAt(centerTo.x, centerTo.y) });
  await SHOT(`${theme}-${lang}-2-objet-ouvert`);
  const ink = await page.evaluate(() => {
    const host = document.getElementById('v2-email-subject');
    const text = host.querySelector('.pp-field-text');
    return { fg: getComputedStyle(text).color, bg: getComputedStyle(text).backgroundColor, preview: getComputedStyle(host, '::after').color, hostBg: getComputedStyle(host).backgroundColor };
  });
  check(`${T}, le texte de la zone ouverte et le début montré dans le champ se lisent (4,5:1 au moins sur leur fond)`, contrastOf(ink.fg, ink.bg) >= 4.5 && contrastOf(ink.preview, ink.hostBg) >= 4.5, { ink, text: contrastOf(ink.fg, ink.bg), preview: contrastOf(ink.preview, ink.hostBg) });
  // Un clic sur À pendant que l'Objet est OUVERT : À prend le curseur, l'Objet se referme.
  await realClick('#v2-email-to', 200);
  const toWhileOpen = await fieldState('v2-email-to');
  check(`${T}, un clic sur À pendant que l'Objet est ouvert donne le curseur à À et referme l'Objet`, toWhileOpen.focused && (await openIds()).every(id => id !== 'v2-email-subject') && !(await fieldState('v2-email-subject')).open, { toWhileOpen, ids: await openIds() });
  await realClick('#v2-email-subject', 200);
  await pressKey('End');

  // 4) Tab referme l'Objet et passe à À ; des adresses plus longues que la ligne l'ouvrent.
  await pressKey('Tab');
  const closedAgain = await fieldState('v2-email-subject');
  check(`${T}, Tab referme l'Objet : il montre le DÉBUT de son objet, coupé par « … », à sa taille d'avant`, !closedAgain.open && closedAgain.lineClipped && closedAgain.lineScroll === 0 && closedAgain.boxScrollLeft === 0 && closedAgain.ellipsis === 'ellipsis' && Math.abs(closedAgain.host.width - closedSubject.host.width) < 1 && closedAgain.box.width < closedAgain.host.width, closedAgain);
  await typeSlow(TO_LONG, 4);
  const toOpen = await fieldState('v2-email-to');
  check(`${T}, les adresses de À dépassent la ligne : À s'ouvre, en entier, avec le début de ses adresses dans son champ, et l'Objet reste fermé`, toOpen.open && toOpen.preview === TO_LONG && toOpen.allShown && toOpen.focused && (await openIds()).join() === 'v2-email-to', { toOpen, ids: await openIds() });
  await SHOT(`${theme}-${lang}-3-a-ouvert`);
  await pressKey('Tab');
  await typeSlow(CC_LONG, 4);
  const ccOpen = await fieldState('v2-email-cc');
  check(`${T}, Cc s'ouvre à son tour, et seul lui`, ccOpen.open && ccOpen.preview === CC_LONG && ccOpen.allShown && (await openIds()).join() === 'v2-email-cc', { ccOpen, ids: await openIds() });

  // Le « … » d'une ligne refermée : Chromium ne le redessine pas quand `text-overflow` change avec l'état du champ (ouvert : `overflow` visible) ; il ne doit donc jamais changer.
  const overflows = await page.evaluate(() => ['v2-email-subject', 'v2-email-to', 'v2-email-cc'].map(id => { const h = document.getElementById(id); return { id, open: h.classList.contains('is-open'), textOverflow: getComputedStyle(h.querySelector('.pp-field-text > p')).textOverflow }; }));
  check(`${T}, le « … » de la ligne refermée ne tient qu'à une valeur de text-overflow qui ne change jamais (« ellipsis » ouvert comme fermé)`, overflows.some(o => o.open) && overflows.every(o => o.textOverflow === 'ellipsis'), overflows);
  // 5) Un clic ailleurs referme tout ; chaque champ montre le début de son texte.
  await realClick('#editor-container', 300);
  const closedAll = await Promise.all(['v2-email-subject', 'v2-email-to', 'v2-email-cc'].map(fieldState));
  check(`${T}, un clic dans le document referme le champ ouvert : les trois montrent le début de leur texte, coupé par « … »`, (await openIds()).length === 0 && closedAll.every(f => f.lineClipped && f.lineScroll === 0 && f.ellipsis === 'ellipsis'), closedAll);
  const afterClose = await layout();
  check(`${T}, une fois refermés, la barre, le document et le bandeau sont où ils étaient`, afterClose.toolbar === before.toolbar && afterClose.editor === before.editor && afterClose.rowHeight === before.rowHeight, { before, afterClose });
  await SHOT(`${theme}-${lang}-4-referme`);

  // 6) Un champ ouvert garde la valeur au retour : le clic sur le champ fermé le rouvre, le curseur à la fin.
  await realClick('#v2-email-to', 200);
  const reopened = await fieldState('v2-email-to');
  check(`${T}, un clic sur À fermé le rouvre, avec tout son texte`, reopened.open && reopened.allShown && reopened.value === TO_LONG, reopened);

  // 7) La liste « # » passe devant le cadre ouvert ; la bulle posée garde sa barre devant lui.
  await pressKey('Control+a');
  await pressKey('Backspace');
  await typeSlow('Bonjour #Pre', 20);
  const list = await page.evaluate(() => {
    const box = document.querySelector('.suggestion-list, #variable-suggestion-box, .ex-box, #mention-box');
    const boxes = Array.from(document.querySelectorAll('[id$="-box"], .suggestion-list')).filter(e => e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none');
    const b = boxes[0];
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(20, r.height / 2));
    return { id: b.id, onTop: !!top && b.contains(top), inViewport: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 };
  });
  check(`${T}, la liste « # » ouverte depuis un champ s'affiche devant tout et dans la fenêtre`, !!list && list.onTop && list.inViewport, list);
  await pressKey('Enter', 300);
  const withBadge = await fieldState('v2-email-to');
  const badgeCount = await page.evaluate(() => document.querySelectorAll('#v2-email-to .var-badge').length);
  check(`${T}, Entrée pose la bulle #Prenom dans À`, badgeCount === 1 && withBadge.value.includes('#Contacts.Prenom'), { badgeCount, value: withBadge.value });
  await typeSlow(' — ' + SUBJECT_LONG, 2);
  await realClick('#v2-email-to .var-badge', 300);
  const bar = await page.evaluate(() => {
    const bar = Array.from(document.querySelectorAll('.v2-var-toolbar.visible, .v2-varbar.visible, [class*="toolbar"].visible')).find(b => b.getClientRects().length > 0 && !b.closest('#toolbar-top'));
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { cls: bar.className, onTop: !!top && bar.contains(top), inViewport: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 };
  });
  check(`${T}, un clic sur la bulle du champ ouvert ouvre sa barre, devant le cadre et dans la fenêtre, et le champ reste ouvert`, !!bar && bar.onTop && bar.inViewport && (await openIds()).join() === 'v2-email-to', { bar, ids: await openIds() });
  await SHOT(`${theme}-${lang}-5-bulle`);
  await realClick('#editor-container', 300);
  check(`${T}, un clic dans le document ferme la barre et le champ`, (await openIds()).length === 0, await openIds());

  // 8) Le cadre suit un panneau plus étroit.
  await realClick('#v2-email-subject', 200);
  await page.setViewportSize({ width: 560, height: HEIGHT });
  await page.waitForTimeout(400);
  const narrow = await fieldState('v2-email-subject');
  check(`${T}, à 560 px de large, le cadre ouvert suit le bandeau (10 px de chaque côté) sans faire défiler la page de côté`, narrow.open && Math.abs(narrow.box.left - (narrow.rowLeft + 10)) < 1.5 && Math.abs(narrow.box.right - (narrow.rowRight - 10)) < 1.5 && !narrow.sideScroll, narrow);
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  await page.waitForTimeout(400);
  await realClick('#editor-container', 300);

  // 9) Cci : « Copie cachée » s'ouvre sous son étiquette complète.
  await realClick('#v2-btn-toggle-cci', 300);
  await realClick('#v2-email-cci', 150);
  await typeSlow('direction@exemple.fr, archives@exemple.fr, comptabilite@exemple.fr, juridique@exemple.fr', 4);
  const cci = await fieldState('v2-email-cci');
  check(`${T}, Cci s'ouvre et montre tout son texte`, cci.open && cci.allShown, cci);
  await SHOT(`${theme}-${lang}-6-cci`);
  await realClick('#editor-container', 300);

  // 10) « Créer l'email » : l'objet entier.
  await realClick('#v2-email-subject', 150);
  await pressKey('Control+a');
  await typeSlow(SUBJECT_LONG, 2);
  await realClick('#btn-create-email', 900);
  const urls = await page.evaluate(() => window.__mailtos.slice());
  const mail = readMailto(urls[urls.length - 1] || 'mailto:');
  check(`${T}, « Créer l'email » ouvre un lien avec l'objet entier, à l'identique`, mail.subject === SUBJECT_LONG, mail.subject);

  // 11) Lecture : l'objet résolu trop long s'ouvre au clic, Échap et le clic ailleurs le referment, le retour en édition aussi.
  await realClick('#btn-mode-read', 900);
  const readClosed = await fieldState('v2-email-subject');
  check(`${T}, en Lecture l'Objet montre la valeur résolue sur sa ligne, fermé`, !readClosed.open && readClosed.lineClipped, readClosed);
  await realClick('#v2-email-subject', 300);
  const readOpen = await fieldState('v2-email-subject');
  check(`${T}, en Lecture un clic sur la valeur trop longue ouvre le champ : tout le texte sous la ligne, sans curseur`, readOpen.open && readOpen.allShown && !readOpen.focused && readOpen.box.top >= readOpen.host.top + readOpen.host.height, readOpen);
  await SHOT(`${theme}-${lang}-7-lecture`);
  await pressKey('Escape', 300);
  check(`${T}, Échap referme le champ de la Lecture`, (await openIds()).length === 0, await openIds());
  await realClick('#v2-email-subject', 300);
  await realClick('#reader-container', 300);
  check(`${T}, un clic dans le texte lu referme le champ de la Lecture`, (await openIds()).length === 0, await openIds());
  await realClick('#v2-email-to', 300);
  await realClick('#btn-mode-edit', 900);
  check(`${T}, le retour en édition referme ce qui était ouvert en Lecture`, (await openIds()).length === 0, await openIds());

  // 12) Le nom du PDF s'ouvre aussi dans un email ; la page ne défile pas de côté.
  await pdfChecks(T, 'email');
  check(`${T}, la page ne défile jamais de côté`, !(await layout()).sideScroll, await layout());
}

async function restartIn(lang) {
  await page.evaluate(next => I18n.storeLang(next), lang);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  await installCapture();
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
