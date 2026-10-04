#!/usr/bin/env node
// Retours d'Antoine du 2026-10-01 (carte « Prévenir avant de changer de modèle avec des modifications non enregistrées ? », réponse « Toujours demander ») : changer de modèle ou en
// créer un quand une modification attend pose la question « Enregistrer / Abandonner / Annuler » (js/main.js:askBeforeLeaving, js/dialogs.js:choose), que l'enregistrement
// automatique soit allumé ou non. Les scénarios de dev-tests/scenarios-autosave.js tournent DANS la page : la fenêtre y est bien rendue, mais ni la vraie liste des modèles, ni le focus
// rendu, ni la galerie, ni la mise en page à 700x400 n'y sont ceux d'une vraie souris ; la section « choix » de verify-dialogs-mouse.mjs ne voit que la fenêtre. Ici : la vraie liste,
// le vrai « + », la vraie galerie, le vrai clavier, à la taille du panneau Grist (~700x400).
//   1) rien n'attend : parcourir à la liste les six modèles puis trois modèles riches (tableaux, images, variables) ne pose jamais la question - un chargement ne laisse jamais « modifié » ;
//   2) enregistrement automatique coupé, une frappe attend : la fenêtre s'ouvre sur le modèle quitté, rien n'a bougé tant qu'on n'a pas répondu ; Annuler et Échap gardent le modèle, le
//      texte et la liste (le focus revient à la liste) ; Abandonner charge l'autre sans écrire ; Enregistrer, au clic comme à Entrée, écrit une fois puis charge ;
//   3) enregistrement automatique allumé : la même question dans les 2,5 s de la frappe, et pas une écriture tant qu'elle est ouverte ;
//   4) « + » et « Nouvel email » : la même question, le curseur revient dans le texte à Annuler ; un nouveau modèle sans nom n'a pas d'Enregistrer ;
//   5) la galerie : « Utiliser ce modèle » pose la question AU-DESSUS de l'aperçu, Annuler le laisse ouvert sans rien créer, Abandonner crée le modèle et ferme tout ;
//   6) sombre et anglais : la fenêtre tient dans le panneau, ses trois boutons et son message se lisent (4,5:1).
// Lancé par run-headless.mjs (groupe Node "leaveUnsavedMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-leave-unsaved-mouse.mjs
// LEAVE_UNSAVED_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.LEAVE_UNSAVED_MOUSE_PORT || 8914);
const SHOTS = process.env.LEAVE_UNSAVED_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-menu-click-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-leave-unsaved-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const nativeDialogs = [];

// Trois modèles « riches » (tableaux, images, variables, mise en page) tirés des modèles de la galerie : charger un tel modèle ne doit jamais le laisser « modifié ».
const RICH = [
  ['Riche facture', 'templates-gallery/facture/template.html'],
  ['Riche images et tableaux', 'templates-gallery-dev/test-images-tableaux/template.html'],
  ['Riche vitrine', 'templates-gallery-dev/vitrine-fonctionnalites/template.html'],
].filter(([, file]) => existsSync(join(ROOT, file)));
const TEMPLATES = `
    const m = stub.state.rows.Publipostage_Modeles;
    const add = (id, nom, html, def) => { m.id.push(id); m.Nom.push(nom); m.Contenu.push(html); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(def); };
    add(1, 'Bail habitation', '<p>a</p>', false); add(2, 'Contrat de vente', '<p>b</p>', true); add(3, 'Avenant loyer', '<p>c</p>', false);
    add(4, 'Mise en demeure', '<p>d</p>', false); add(5, 'Quittance', '<p>e</p>', false); add(6, 'Sans dossier', '<p>f</p>', false);
    ${RICH.map(([nom, file], i) => `add(${7 + i}, ${JSON.stringify(nom)}, ${JSON.stringify(readFileSync(join(ROOT, file), 'utf8'))}, false);`).join('\n    ')}
    stub.state.nextRowId.Publipostage_Modeles = ${7 + RICH.length};
`;

async function openPage() {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });
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
  await page.addInitScript(`window.__preSeedGristStub = (stub) => { ${TEMPLATES} };`);
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  return page;
}

const rectOf = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, onTop: !!top && (top === e || e.contains(top)) };
}, sel);

console.log('\n== Panneau 700x400, clair, français ==');
const page = await openPage();
const hover = async (sel) => {
  const c = await rectOf(page, sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 14, c.y - 6, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(150);
  return c;
};
const realClick = async (sel, wait = 250) => { const c = await hover(sel); await page.mouse.click(c.x, c.y); await page.waitForTimeout(wait); return c; };
const away = async () => { await page.mouse.move(350, 340, { steps: 6 }); await page.waitForTimeout(250); };
// Ouvre un menu au survol (« + » ou Enregistrer) puis descend tout droit sous le bouton avant d'aller à la ligne : le menu reste ouvert tout du long.
async function clickMenuRow(buttonSel, rowSel, wait = 400) {
  const from = await hover(buttonSel);
  const to = await rectOf(page, rowSel);
  await page.mouse.move(from.x, to.y, { steps: 12 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.waitForTimeout(150);
  await page.mouse.click(to.x, to.y);
  await page.waitForTimeout(wait);
  await away();
}

const snapshot = () => page.evaluate(() => {
  const a = document.activeElement;
  const popup = document.querySelector('.tts-popup');
  return {
    label: document.querySelector('.tts-trigger-label').textContent.replace(/\s*★\s*$/, '').trim(),
    text: document.querySelector('.ProseMirror').textContent,
    current: Templates.getCurrentId(),
    status: document.getElementById('status-msg').textContent,
    updates: window.__gristStub.countActions('UpdateRecord', 'Publipostage_Modeles'),
    adds: window.__gristStub.countActions('AddRecord', 'Publipostage_Modeles'),
    focus: !a ? null : (a.classList && a.classList.contains('tts-trigger') ? 'tts-trigger' : (a.closest && a.closest('.ProseMirror') ? 'editor' : (a.id || a.className || a.tagName))),
    popupOpen: !!popup && !popup.hidden && getComputedStyle(popup).display !== 'none' && getComputedStyle(popup).visibility !== 'hidden',
  };
});
const dialogState = () => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  if (!ov || getComputedStyle(ov).display === 'none') return { open: false };
  const box = ov.querySelector('.modal-content').getBoundingClientRect();
  const buttons = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden);
  const rects = buttons.map(b => {
    const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { label: b.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: !!top && (top === b || b.contains(top)), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
  });
  const a = document.activeElement;
  const middle = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  return {
    open: true, title: ov.querySelector('h3').textContent, message: ov.querySelector('.pp-dialog-message').textContent, labels: buttons.map(b => b.textContent), rects,
    focus: a && ov.contains(a) ? a.textContent : 'hors de la fenêtre : ' + (a && (a.id || a.className || a.tagName)),
    box: { l: box.left, t: box.top, r: box.right, b: box.bottom }, onTop: !!middle && ov.contains(middle),
  };
});
const inPanel = (box) => box.l >= 0 && box.t >= 0 && box.r <= WIDTH && box.b <= HEIGHT;
async function clickDialog(label, wait = 500) {
  const s = await dialogState();
  const b = s.open && s.rects.find(r => r.label === label);
  if (!b) throw new Error('bouton « ' + label + ' » absent : ' + JSON.stringify(s));
  await page.mouse.move(b.x - 10, b.y, { steps: 2 }); await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(wait);
}
// Choisit un modèle dans la liste, à la vraie souris (la liste s'ouvre au clic sur son bouton, la ligne se clique).
async function pickTemplate(name, wait = 600) {
  await realClick('.tts-trigger', 250);
  const pos = await page.evaluate(n => {
    const row = Array.from(document.querySelectorAll('.tts-popup .tts-row-leaf')).find(e => e.querySelector('.tts-row-label').textContent.replace(' ★', '').trim() === n);
    if (!row) return null;
    row.scrollIntoView({ block: 'nearest' });
    const b = row.getBoundingClientRect();
    return { x: b.left + 60, y: b.top + b.height / 2 };
  }, name);
  if (!pos) throw new Error('ligne introuvable dans la liste : ' + name);
  await page.mouse.move(pos.x - 20, pos.y, { steps: 3 }); await page.mouse.move(pos.x, pos.y, { steps: 3 });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(wait);
}
// Une vraie frappe à la fin du premier paragraphe.
async function typeAtEnd(text) {
  const para = await rectOf(page, '.ProseMirror p');
  await page.mouse.click(para.r - 3, para.y); await page.keyboard.press('End'); await page.keyboard.type(text);
}
async function setAutosave(on) {
  const now = await page.evaluate(() => document.getElementById('v2-btn-autosave').getAttribute('aria-checked') === 'true');
  if (now !== on) await clickMenuRow('#btn-save', '#v2-btn-autosave', 300);
  return page.evaluate(() => ({ checked: document.getElementById('v2-btn-autosave').getAttribute('aria-checked'), stored: (() => { try { return localStorage.getItem('pp_autosave_enabled'); } catch (e) { return 'x'; } })() }));
}
const UNSAVED = /^(Modifications non enregistrées\.|Unsaved changes\.)$/;
const SAVED = /^(Enregistré à |Saved at )/;
const stored = (id) => page.evaluate((i) => { const m = window.__gristStub.state.rows.Publipostage_Modeles; return String(m.Contenu[m.id.indexOf(i)]); }, id);
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 1) Rien n'attend : parcourir les modèles à la liste ne pose jamais la question (un chargement ne laisse jamais « modifié »). Enregistrement automatique COUPÉ pour ce parcours : un
//    indicateur « modifié » laissé par un chargement resterait alors affiché (allumé, le passage suivant l'écrirait en silence).
// ---------------------------------------------------------------------------------------------------------------------------------------------------
const auto0 = await setAutosave(false);
check('enregistrement automatique coupé par le vrai menu : ligne décochée, choix gardé', auto0.checked === 'false' && auto0.stored === 'false', auto0);
const START = await snapshot();
check('au départ, le modèle par défaut est chargé et rien n’attend', START.label === 'Contrat de vente' && START.text === 'b' && !UNSAVED.test(START.status), START);
const walk = ['Avenant loyer', 'Mise en demeure', 'Quittance', 'Sans dossier', 'Bail habitation', ...RICH.map(([nom]) => nom), 'Contrat de vente'];
const walkProblems = [];
for (const name of walk) {
  await pickTemplate(name, 900);
  const d = await dialogState(); const s = await snapshot();
  if (d.open) { walkProblems.push({ name, why: 'question posée', dialog: d.message }); await clickDialog('Abandonner'); continue; }
  if (s.label !== name) walkProblems.push({ name, why: 'modèle non chargé', label: s.label });
  if (UNSAVED.test(s.status)) walkProblems.push({ name, why: 'indicateur « modifié » laissé par le chargement', status: s.status });
}
await page.waitForTimeout(500);
const WALKED = await snapshot();
check(`rien n’attend : parcourir à la liste les ${walk.length} modèles (six simples, ${RICH.length} riches) charge chacun aussitôt, sans fenêtre et sans « Modifications non enregistrées. »`, walkProblems.length === 0 && WALKED.updates === 0, { walkProblems, updates: WALKED.updates });

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 2) Enregistrement automatique coupé, une frappe attend.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
await typeAtEnd(' vers Bail');
const typed = await snapshot();
check('une frappe : le coin d’état dit « Modifications non enregistrées. »', UNSAVED.test(typed.status) && typed.text.endsWith(' vers Bail'), typed);
await pickTemplate('Bail habitation', 600);
let d = await dialogState();
check('liste : la fenêtre « Modifications non enregistrées » s’ouvre dans le panneau, avec le nom du modèle quitté, Annuler / Abandonner / Enregistrer, le focus sur Enregistrer',
  d.open && d.title === 'Modifications non enregistrées' && d.message.includes('« Contrat de vente »') && JSON.stringify(d.labels) === '["Annuler","Abandonner","Enregistrer"]' && d.focus === 'Enregistrer' && inPanel(d.box), d);
check('liste : la fenêtre est au premier plan, ses trois boutons sont visibles et atteignables', d.open && d.onTop && d.rects.length === 3 && d.rects.every(r => r.onTop && r.inView), d);
await shot('1-question');
let s = await snapshot();
// Le bouton de la liste montre déjà le modèle choisi (la liste écrit sa valeur avant l'évènement) : c'est le modèle chargé, lui, qui n'a pas changé.
check('liste : pendant que la question est ouverte, rien n’a bougé - même modèle chargé, texte gardé, aucune écriture, liste refermée',
  String(s.current) === '2' && s.text.endsWith(' vers Bail') && s.updates === 0 && s.adds === 0 && !s.popupOpen, s);
await clickDialog('Annuler');
s = await snapshot();
check('Annuler (clic réel) : fenêtre fermée, même modèle, texte gardé, l’indicateur « modifié » reste, rien d’écrit, le focus est revenu sur la liste des modèles',
  !(await dialogState()).open && s.label === 'Contrat de vente' && s.text.endsWith(' vers Bail') && UNSAVED.test(s.status) && s.updates === 0 && s.focus === 'tts-trigger', s);
await pickTemplate('Bail habitation', 600);
check('Échap : la même question s’ouvre à nouveau', (await dialogState()).open);
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
s = await snapshot();
check('Échap : fenêtre fermée, même modèle, texte gardé, rien d’écrit, le focus est revenu sur la liste des modèles',
  !(await dialogState()).open && s.label === 'Contrat de vente' && s.text.endsWith(' vers Bail') && s.updates === 0 && s.focus === 'tts-trigger', s);
await pickTemplate('Bail habitation', 600);
await clickDialog('Abandonner', 800);
s = await snapshot();
check('Abandonner (clic réel) : « Bail habitation » est chargé avec son texte, la frappe est perdue, aucune écriture, plus d’indicateur « modifié »',
  !(await dialogState()).open && s.label === 'Bail habitation' && s.text === 'a' && s.updates === 0 && !UNSAVED.test(s.status), s);
const afterDiscard = await snapshot();
await pickTemplate('Avenant loyer', 700);
const noAsk = await dialogState();
check('Abandonner : rien n’attend plus, le modèle suivant se charge sans nouvelle question', !noAsk.open && (await snapshot()).label === 'Avenant loyer', { noAsk, afterDiscard });

// Enregistrer : au clic puis à Entrée (le focus arrive sur Enregistrer).
await typeAtEnd(' signé');
await pickTemplate('Quittance', 600);
d = await dialogState();
await clickDialog('Enregistrer', 1000);
s = await snapshot();
check('Enregistrer (clic réel) : une seule écriture, la frappe est en base sur le modèle quitté, « Quittance » est chargé, plus de fenêtre ni d’indicateur « modifié »',
  d.open && s.updates === 1 && (await stored(3)).includes('signé') && s.label === 'Quittance' && s.text === 'e' && !UNSAVED.test(s.status) && !(await dialogState()).open, { d: d.open, s, content: await stored(3) });
const before = await snapshot();
await typeAtEnd(' reçu');
await pickTemplate('Sans dossier', 600);
d = await dialogState();
await page.keyboard.press('Enter'); await page.waitForTimeout(1000);
s = await snapshot();
check('Entrée à l’ouverture (focus sur Enregistrer) : une seule écriture de plus, la frappe est en base, « Sans dossier » est chargé',
  d.open && d.focus === 'Enregistrer' && s.updates === before.updates + 1 && (await stored(5)).includes('reçu') && s.label === 'Sans dossier' && s.text === 'f' && !(await dialogState()).open, { d: d.open, focus: d.focus, before: before.updates, s });

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 3) Enregistrement automatique allumé : la même question dans les 2,5 s de la frappe, et pas une écriture tant qu'elle est ouverte.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
const auto1 = await setAutosave(true);
check('enregistrement automatique rallumé par le vrai menu', auto1.checked === 'true' && auto1.stored === 'true', auto1);
// Si le passage de l'enregistrement automatique (toutes les 2,5 s) tombe entre la frappe et la liste, la frappe est déjà en base et la question n'a plus lieu d'être : on
// recommence (quatre essais au plus) au lieu de rendre le test dépendant du hasard. Chaque essai part du modèle où le précédent a fini.
const TARGETS = ['Mise en demeure', 'Bail habitation', 'Mise en demeure', 'Bail habitation'];
let asked = null, attempts = 0, fromName = null, fromId = null;
for (const target of TARGETS) {
  attempts++;
  ({ label: fromName, current: fromId } = await snapshot());
  if (fromName === target) continue;
  await typeAtEnd(' vite');
  await pickTemplate(target, 350);
  const state = await dialogState();
  if (state.open) { asked = { target, state }; break; }
}
check('enregistrement automatique allumé : une frappe encore dans les 2,5 s pose la même question, avec le nom du modèle quitté', !!asked && asked.state.title === 'Modifications non enregistrées' && asked.state.message.includes('« ' + fromName + ' »') && asked.state.labels.length === 3, { attempts, asked, fromName });
if (asked) {
  const w0 = (await snapshot()).updates;
  await page.waitForTimeout(3300); // plus d'un passage de l'enregistrement automatique
  s = await snapshot();
  check('... pendant que la question est ouverte, l’enregistrement automatique n’écrit rien (plus d’un passage attendu) : « Abandonner » a vraiment quelque chose à abandonner',
    (await dialogState()).open && s.updates === w0 && String(s.current) === String(fromId) && s.text.endsWith(' vite'), { w0, s });
  await clickDialog('Abandonner', 700);
  await page.waitForTimeout(3300);
  s = await snapshot();
  check('... Abandonner charge le modèle choisi, et rien n’est écrit après coup (la frappe a bien été abandonnée, pas enregistrée)', s.label === asked.target && s.updates === w0 && !(await stored(fromId)).includes('vite'), { s, w0, fromId });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 4) « + », « Nouvel email », et un nouveau modèle sans nom. Enregistrement automatique coupé : une frappe reste en attente le temps du geste.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
await setAutosave(false);
await pickTemplate('Bail habitation', 700);
await typeAtEnd(' nouveau');
const plus = await hover('#btn-new');
await page.mouse.click(plus.x, plus.y); await page.waitForTimeout(500);
d = await dialogState();
check('« + » (le bouton lui-même) : la même question, avec le nom du modèle quitté, dans le panneau', d.open && d.title === 'Modifications non enregistrées' && d.message.includes('« Bail habitation »') && JSON.stringify(d.labels) === '["Annuler","Abandonner","Enregistrer"]' && inPanel(d.box), d);
await away();
await clickDialog('Annuler');
s = await snapshot();
check('« + » : Annuler garde le modèle et le texte, et le curseur est resté dans l’éditeur (le bouton ne l’avait pas pris)', !(await dialogState()).open && s.label === 'Bail habitation' && s.text.endsWith(' nouveau') && s.focus === 'editor', s);
const u0 = (await snapshot()).updates;
await realClick('#btn-new', 500);
await clickDialog('Abandonner');
s = await snapshot();
check('« + » : Abandonner ouvre un document vide, sans modèle courant, sans écriture', s.current == null && s.text === '' && s.updates === u0 && !(await dialogState()).open, { s, u0 });
// Un nouveau modèle sans nom : pas d'Enregistrer (il échouerait sur « donnez un nom »).
await typeAtEnd('brouillon sans nom');
await pickTemplate('Quittance', 600);
d = await dialogState();
check('nouveau modèle sans nom : la question n’a que Annuler et Abandonner, son message dit pourquoi, le focus arrive sur Annuler',
  d.open && JSON.stringify(d.labels) === '["Annuler","Abandonner"]' && /pas de nom/.test(d.message) && d.focus === 'Annuler' && inPanel(d.box), d);
await shot('2-sans-nom');
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
s = await snapshot();
check('nouveau modèle sans nom : Échap garde le brouillon et son texte', !(await dialogState()).open && s.current == null && s.text === 'brouillon sans nom' && s.focus === 'tts-trigger', s);
// « Nouvel email » : une ligne de menu (un <span> sans focus) - Annuler rend le curseur au texte.
await clickMenuRow('#btn-new', '#v2-btn-new-email', 500);
d = await dialogState();
check('« Nouvel email » (ligne du menu « + ») : la même question, sans Enregistrer pour un brouillon sans nom', d.open && JSON.stringify(d.labels) === '["Annuler","Abandonner"]', d);
await clickDialog('Annuler');
s = await snapshot();
check('« Nouvel email » : Annuler garde le brouillon et le curseur revient dans l’éditeur (la ligne de menu n’a pas de focus à rendre)', !(await dialogState()).open && s.text === 'brouillon sans nom' && s.focus === 'editor' && s.adds === 0, s);
await clickMenuRow('#btn-new', '#v2-btn-new-email', 500);
await clickDialog('Abandonner', 700);
const mail = await page.evaluate(() => ({ createBtn: getComputedStyle(document.getElementById('btn-create-email')).display, text: document.querySelector('.ProseMirror').textContent, current: Templates.getCurrentId() }));
check('« Nouvel email » : Abandonner ouvre un email vide (le bouton « Créer l’email » est là)', mail.createBtn !== 'none' && mail.text === '' && mail.current == null, mail);

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 5) La galerie : « Utiliser ce modèle » pose la question au-dessus de l'aperçu.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
await pickTemplate('Bail habitation', 800);
await typeAtEnd(' galerie');
await clickMenuRow('#btn-new', '#v2-btn-new-from-template', 400);
await page.waitForSelector('#tpl-gallery-grid .tpl-gallery-card', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(300);
await realClick('#tpl-gallery-grid .tpl-gallery-card', 400);
await page.waitForFunction(() => document.getElementById('tpl-preview-tiptap').children.length > 0, null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(300);
const previewShown = () => page.evaluate(() => getComputedStyle(document.getElementById('template-preview-modal')).display !== 'none');
const galleryShown = () => page.evaluate(() => getComputedStyle(document.getElementById('template-gallery-modal')).display !== 'none');
const g0 = await snapshot();
check('galerie : l’aperçu d’un modèle est ouvert, la modification en attente est toujours là', (await previewShown()) && g0.text.endsWith(' galerie'), { preview: await previewShown(), g0 });
await realClick('#tpl-preview-use-empty', 600);
d = await dialogState();
check('galerie : « Utiliser ce modèle » pose la question, AU-DESSUS de l’aperçu (fenêtre au premier plan, boutons atteignables, aperçu toujours ouvert dessous)', d.open && d.onTop && d.rects.every(r => r.onTop && r.inView) && inPanel(d.box) && (await previewShown()), { d, preview: await previewShown() });
await shot('3-galerie');
await clickDialog('Annuler');
s = await snapshot();
const focusUse = await page.evaluate(() => document.activeElement && document.activeElement.id);
check('galerie : Annuler laisse l’aperçu ouvert, ne crée rien (aucun modèle ajouté), garde le modèle et son texte, le focus revient sur « Utiliser ce modèle »',
  !(await dialogState()).open && (await previewShown()) && s.adds === 0 && s.label === 'Bail habitation' && s.text.endsWith(' galerie') && focusUse === 'tpl-preview-use-empty', { s, focusUse, preview: await previewShown() });
await realClick('#tpl-preview-use-empty', 600);
await clickDialog('Abandonner', 1200);
s = await snapshot();
const galleryName = await page.evaluate(() => document.getElementById('tpl-preview-name').textContent);
check('galerie : Abandonner crée le modèle de la galerie (une ligne ajoutée, sous son nom) et ferme l’aperçu et la galerie', !(await dialogState()).open && s.adds === 1 && s.label === galleryName && !(await previewShown()) && !(await galleryShown()) && !s.text.includes(' galerie'), { s, galleryName });

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 6) Sombre puis anglais : la fenêtre tient dans le panneau, ses boutons et son message se lisent (4,5:1).
// ---------------------------------------------------------------------------------------------------------------------------------------------------
const contrastOf = () => page.evaluate(() => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.a === 1) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const ov = document.getElementById('pp-dialog-modal');
  const out = {};
  Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).forEach(b => { out[b.textContent] = Math.round(ratio(parse(getComputedStyle(b).color), bgOf(b)) * 100) / 100; });
  const msg = ov.querySelector('.pp-dialog-message'); out.message = Math.round(ratio(parse(getComputedStyle(msg).color), bgOf(msg)) * 100) / 100;
  const title = ov.querySelector('h3'); out.title = Math.round(ratio(parse(getComputedStyle(title).color), bgOf(title)) * 100) / 100;
  return out;
});
for (const [theme, lang] of [['dark', 'fr'], ['light', 'en'], ['dark', 'en']]) {
  const T = `${theme === 'dark' ? 'sombre' : 'clair'}, ${lang === 'en' ? 'anglais' : 'français'}`;
  await page.evaluate(([t, l]) => { Settings.setTheme(t); I18n.setLang(l); }, [theme, lang]);
  await page.waitForTimeout(300);
  await pickTemplate('Avenant loyer', 700);
  await typeAtEnd(' lisible');
  await pickTemplate('Quittance', 600);
  d = await dialogState();
  const labels = lang === 'en' ? ['Cancel', 'Discard', 'Save'] : ['Annuler', 'Abandonner', 'Enregistrer'];
  const title = lang === 'en' ? 'Unsaved changes' : 'Modifications non enregistrées';
  check(`${T} : la fenêtre s’ouvre dans le panneau avec son titre, le nom du modèle et les trois boutons, tout au premier plan`, d.open && d.title === title && JSON.stringify(d.labels) === JSON.stringify(labels) && d.message.includes('Avenant loyer') && inPanel(d.box) && d.onTop && d.rects.every(r => r.onTop && r.inView), d);
  const c = await contrastOf();
  check(`${T} : titre, message et boutons se lisent (4,5:1 au moins)`, Object.values(c).every(v => v >= 4.5), c);
  await shot(`4-${theme}-${lang}`);
  await clickDialog(labels[0]);
  await page.evaluate(() => {});
  // Abandonner pour repartir d'un état propre : le prochain tour retape dans un modèle neuf.
  await pickTemplate('Quittance', 600);
  if ((await dialogState()).open) await clickDialog(labels[1], 700);
}
await page.evaluate(() => { Settings.setTheme('light'); I18n.setLang('fr'); });

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
await page.context().close();
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
