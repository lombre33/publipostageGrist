#!/usr/bin/env node
// Champs à bulles du mode Email (Objet, À, Cc, Cci) et nom du fichier PDF (js/field-editor.js) à 700x400 (le panneau d'Antoine), au VRAI clavier et à la VRAIE souris (page.mouse, page.keyboard) :
// demande d'Antoine du 08/10 (« dans les champs d'email et de nomenclature, les variables avec leur bulle bleue et les mêmes fonctions que les variables du document : conditions, changement
// d'attribut… »). Un nouvel email créé à la souris ; dans l'Objet, du texte puis « # » (la liste ne propose que des variables) et Entrée posent une bulle, un clic dessus ouvre la barre flottante
// (entièrement dans le panneau, au-dessus de tout), la condition « Statut = Urgent » et le texte « Avant » / « Après » (les guillemets de la valeur) se règlent dans sa fenêtre, « Autres attributs » ajoute le téléphone du responsable ; dans À, la liste « # »
// au clavier (flèches, Échap, clé tapée en entier qui devient bulle en quittant le champ, Retour arrière sur une bulle) ; dans Cc, une adresse plus longue que le champ garde le curseur
// visible, Entrée y envoie `fieldenter` sans retour à la ligne ; dans Cci, un copier-coller au clavier d'une bulle réglée et un collage de texte mis en forme ; dans le nom du PDF (crayon),
// une bulle réglée, la barre qui laisse le champ ouvert, Entrée qui valide le nom sans replier un champ qui a une valeur. Puis le résultat : « Créer l'email » ouvre le lien mailto: capté (objet, À, Cc résolus pour la ligne courante,
// la condition fait disparaître la bulle d'une autre ligne, avec ses guillemets), la Lecture montre les valeurs résolues sans curseur ni barre et rend les bulles au retour, l'enregistrement puis la réouverture du modèle
// rendent les cinq champs tels quels (texte brut pour les valeurs sans réglage, HTML pour la bulle réglée).
// Lancé par run-headless.mjs (groupe Node "fieldEditorMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-field-editor-mouse.mjs
// FIELD_EDITOR_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.FIELD_EDITOR_MOUSE_PORT || 8942);
const SHOTS = process.env.FIELD_EDITOR_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-email-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-field-editor-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
// Un élément : où il est, s'il est entièrement dans le panneau, et si rien ne le recouvre en son centre.
async function hitTest(selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)) };
  }, selector);
}
// Le champ et son point d'accueil : un clic sur le bord droit (hors de tout texte) doit y poser le curseur.
async function fieldEdge(id, side) {
  return page.evaluate(({ id, side }) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return { x: side === 'right' ? r.right - 4 : r.left + 4, y: r.top + r.height / 2 };
  }, { id, side });
}
// Centre de la partie VISIBLE d'une bulle de champ (le texte défile : une bulle peut dépasser à gauche ou à droite).
async function badgePoint(selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const host = el.closest('.pp-field-editor');
    const hr = host.getBoundingClientRect(); const r = el.getBoundingClientRect();
    const left = Math.max(r.left, hr.left + 9), right = Math.min(r.right, hr.right - 9);
    const x = (left + right) / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { found: true, x, y, left, right, onTop: right > left && !!top && (top === el || el.contains(top)) };
  }, selector);
}
async function pickColumn(scope, name) {
  const field = await hitTest(scope + ' .macro-rule-column-wrap .ss-trigger');
  await page.mouse.click(field.x, field.y);
  await page.waitForTimeout(120);
  await page.keyboard.type(name);
  await page.waitForTimeout(80);
  const row = await page.evaluate(({ scope, name }) => {
    const found = Array.from(document.querySelectorAll(scope + ' .ss-panel:not([hidden]) .ss-option')).find(r => r.querySelector('.ss-name').textContent === name);
    if (!found) return null;
    const r = found.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { scope, name });
  if (row) await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(150);
  return !!row;
}
const statusText = () => page.evaluate(() => document.getElementById('status-msg').textContent.trim());
const shot = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };

const SUBJECT = 'v2-email-subject', TO = 'v2-email-to', CC = 'v2-email-cc', CCI = 'v2-email-cci', FILE = 'pdf-filename-template';
const IDS = [SUBJECT, TO, CC, CCI, FILE];
// L'état d'un champ : sa valeur enregistrée, le texte affiché, ses bulles (clé, condition, format), s'il est lisible seulement et si le curseur y est.
const fieldInfo = id => page.evaluate(id => {
  const host = document.getElementById(id);
  const view = host.querySelector('[role="textbox"]');
  const clone = view.cloneNode(true);
  clone.querySelectorAll('.var-badge').forEach(b => b.remove());
  return { hidden: host.hidden, value: host.value, text: view.textContent, outside: clone.textContent, readOnly: host.readOnly, editable: view.getAttribute('contenteditable'),
    bubbles: Array.from(host.querySelectorAll('.var-badge')).map(b => ({ key: b.dataset.key, condition: b.dataset.condition || null, format: b.dataset.format || null, before: b.dataset.before || null, after: b.dataset.after || null })),
    focused: !!document.activeElement && host.contains(document.activeElement) };
}, id);
// La liste « # » : ses lignes (la sélectionnée porte « * »), la barre d'onglets Variables / Puces cachée ou non, sa place.
const listNow = () => page.evaluate(() => {
  const box = document.getElementById('autocomplete-box');
  if (!box || box.style.display === 'none') return null;
  const r = box.getBoundingClientRect(); const tabs = box.querySelector('.ac-tabs');
  return { items: Array.from(box.querySelectorAll('.ac-item')).map(e => e.textContent + (e.classList.contains('selected') ? '*' : '')),
    tabsHidden: !tabs || getComputedStyle(tabs).display === 'none', inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 };
});
const isRichField = value => typeof value === 'string' && value.startsWith('<p class="pp-field">') && value.endsWith('</p>');
const conditionOf = bubble => { try { return JSON.parse(bubble.condition); } catch { return null; } };

// Les lignes de l'exemple : un dossier, son responsable (colonne de référence, résolu par la règle de liaison de l'annuaire).
const REC_1 = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200.5 };
const REC_2 = { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 'Martin Anne', Montant: 50 };
const readMailto = url => {
  const [head, query = ''] = url.split('?');
  const params = {};
  query.split('&').filter(Boolean).forEach(pair => { const i = pair.indexOf('='); params[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1)); });
  return { to: decodeURIComponent(head.replace(/^mailto:/, '')), cc: params.cc, bcc: params.bcc, subject: params.subject, keys: Object.keys(params) };
};

async function run() {
  await page.evaluate(async ({ REC_1, REC_2 }) => {
    const stub = window.__gristStub;
    stub.setVariables('MfAnnuaire', { NomPrenom: 'Text', Telephone: 'Text', Email: 'Text' });
    stub.setVariables('MfDossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:MfAnnuaire', Montant: 'Numeric' });
    stub.setRows('MfAnnuaire', [
      { id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44', Email: 'jean@ex.fr' },
      { id: 8, NomPrenom: 'Martin Anne', Telephone: '06 55 66 77 88', Email: 'anne@ex.fr' },
    ]);
    stub.setRows('MfDossiers', [{ ...REC_1, Responsable: 7 }, { ...REC_2, Responsable: 8 }]);
    await GristAPI.refreshSchema();
    await GristAPI.saveLinkRule('MfAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
    stub.fireRecord(REC_1, 'MfDossiers');
    // « Créer l'email » ouvre un lien mailto: : capté au clic de l'ancre (phase de capture), jamais suivi.
    window.__mailtos = [];
    document.addEventListener('click', e => {
      const a = e.target && e.target.closest && e.target.closest('a[href^="mailto:"]');
      if (a) { window.__mailtos.push(a.getAttribute('href')); e.preventDefault(); }
    }, true);
  }, { REC_1, REC_2 });
  await page.waitForTimeout(300);

  // ===== 1) Un nouvel email à la souris, les cinq champs dépliés : même place, même hauteur, dans le panneau =====
  await realHover('#v2-new-template-group #btn-new');
  await realClick('#v2-btn-new-email', 900);
  await realClick('#v2-btn-toggle-cci', 300);
  await realClick('#btn-toggle-pdf-filename', 300);
  const geo = await page.evaluate(ids => ids.map(id => {
    const e = document.getElementById(id); const r = e.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { id, hidden: e.hidden, h: Math.round(r.height * 10) / 10, w: Math.round(r.width), inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && e.contains(top) };
  }), IDS);
  check('les cinq champs (Objet, À, Cc, Cci, nom du PDF) sont affichés, dans le panneau, sans rien qui les recouvre', geo.every(g => !g.hidden && g.w > 40 && g.inViewport && g.onTop), geo);
  check('les cinq champs ont la même hauteur (celle des champs texte d’avant)', geo.every(g => g.h === geo[0].h) && geo[0].h === 38, geo.map(g => g.h));
  check('aucun défilement horizontal de la page', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 0.5), await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]));
  check('le crayon du nom du PDF met le curseur dans le champ', (await fieldInfo(FILE)).focused);
  await shot('1-champs-deplies');
  await realClick('#btn-toggle-pdf-filename', 300);
  check('un second clic sur le crayon replie le nom du PDF', (await fieldInfo(FILE)).hidden);

  // ===== 2) L'Objet : du texte, « # », la liste des variables, Entrée -> une bulle ; deux bulles, une phrase =====
  await realClick('#' + SUBJECT, 150);
  check('un clic dans le champ y met le curseur', (await fieldInfo(SUBJECT)).focused);
  await page.keyboard.type('Suivi ');
  await page.keyboard.type('#MfDossiers.Tit');
  await page.waitForTimeout(300);
  const list1 = await listNow();
  check('« # » ouvre la liste des variables, sans les onglets du document (ni Puces), dans le panneau', !!list1 && list1.items.length > 0 && list1.tabsHidden && list1.inViewport && list1.items.some(i => /Titre/.test(i)), list1);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  await page.keyboard.type(' par ');
  await page.keyboard.type('#MfAnnuaire.Nom');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  let subject = await fieldInfo(SUBJECT);
  check('Entrée choisit la variable : une bulle bleue à la place de « #… », deux bulles dans l’Objet', subject.bubbles.length === 2 && subject.bubbles[0].key === 'MfDossiers.Titre' && subject.bubbles[1].key === 'MfAnnuaire.NomPrenom', subject.bubbles);
  check('la liste est refermée et ce qui a été tapé pour la chercher (« #… ») a disparu : il ne reste que le texte et les bulles', (await listNow()) === null && subject.outside === 'Suivi  par ', subject);
  check('sans réglage, la valeur enregistrée reste le texte brut d’avant (« #Table.Colonne »)', subject.value === 'Suivi #MfDossiers.Titre par #MfAnnuaire.NomPrenom', subject.value);
  await page.mouse.move(650, 390, { steps: 3 });
  await shot('2-objet-deux-bulles');

  // ===== 3) La barre flottante d'une bulle de l'Objet, la condition « Statut = Urgent » =====
  await page.keyboard.press('Home');
  await page.waitForTimeout(150);
  const textBeforeCondition = (await fieldInfo(SUBJECT)).text;
  const first = await badgePoint('#' + SUBJECT + ' .var-badge[data-column="Titre"]');
  check('la première bulle est visible dans le champ (à portée du clic)', first.found && first.onTop, first);
  await page.mouse.move(first.x - 20, first.y + 8, { steps: 3 });
  await page.mouse.click(first.x, first.y);
  await page.waitForTimeout(350);
  const bar = await hitTest('.v2-varfmt-toolbar.visible');
  check('un clic sur la bulle ouvre la barre flottante, entièrement dans le panneau et au-dessus de tout', bar.found && bar.inViewport && bar.onTop, bar);
  await shot('3-barre-sur-la-bulle');
  const condButton = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-condition"]');
  check('la barre propose la condition, cliquable', condButton.found && condButton.inViewport && condButton.onTop, condButton);
  await page.mouse.move(condButton.x - 10, condButton.y, { steps: 3 });
  await page.mouse.click(condButton.x, condButton.y);
  await page.waitForTimeout(300);
  const modal = await hitTest('#var-condition-modal .var-modal-content');
  check('la fenêtre « Condition » s’ouvre dans le panneau', modal.found && modal.inViewport, modal);
  check('on y choisit la colonne Statut dans la liste avec recherche', await pickColumn('#var-condition-modal', 'Statut'));
  const valueField = await hitTest('#var-condition-modal .macro-rule-value');
  await page.mouse.click(valueField.x, valueField.y);
  await page.keyboard.type('Urgent');
  await page.waitForTimeout(300);
  const beforeInput = await hitTest('#var-condition-before'), afterInput = await hitTest('#var-condition-after');
  check('la même fenêtre a les champs « Avant » et « Après », dans le panneau et cliquables', beforeInput.found && afterInput.found && beforeInput.inViewport && afterInput.inViewport && beforeInput.onTop && afterInput.onTop, { beforeInput, afterInput });
  await page.mouse.click(beforeInput.x, beforeInput.y);
  await page.keyboard.type('« ');
  await page.mouse.click(afterInput.x, afterInput.y);
  await page.keyboard.type(' »');
  await page.waitForTimeout(400);
  await shot('3-fenetre-condition');
  const saveButton = await hitTest('#var-condition-modal .var-modal-primary');
  await page.mouse.click(saveButton.x, saveButton.y);
  await page.waitForTimeout(350);
  subject = await fieldInfo(SUBJECT);
  const cond = conditionOf(subject.bubbles[0] || {});
  check('la bulle porte la condition « Statut = Urgent » et le texte « Avant » / « Après » saisis', !!cond && cond.rules.length === 1 && cond.rules[0].column === 'Statut' && cond.rules[0].value === 'Urgent' && subject.bubbles[0].before === '« ' && subject.bubbles[0].after === ' »', subject.bubbles[0]);
  check('le champ s’enregistre alors en HTML (la bulle réglée ne tient pas dans un texte brut), l’autre bulle y reste', subject.value.startsWith('<p class="pp-field">') && subject.bubbles.length === 2 && subject.bubbles[1].condition === null, subject.value);
  check('la condition et le texte autour ne changent pas ce que le champ affiche', subject.text === textBeforeCondition, { before: textBeforeCondition, after: subject.text });

  // ===== 4) « Autres attributs » sur la seconde bulle : le téléphone du responsable s'ajoute à la suite =====
  await realClick('#' + SUBJECT, 150);
  await page.keyboard.press('End');
  await page.waitForTimeout(150);
  const second = await badgePoint('#' + SUBJECT + ' .var-badge[data-column="NomPrenom"]');
  check('la seconde bulle est visible dans le champ', second.found && second.onTop, second);
  await page.mouse.click(second.x, second.y);
  await page.waitForTimeout(350);
  const linkedButton = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-linked"]');
  check('la barre de cette bulle propose « Autres attributs »', linkedButton.found && linkedButton.inViewport && linkedButton.onTop, linkedButton);
  await page.mouse.click(linkedButton.x, linkedButton.y);
  await page.waitForTimeout(400);
  await shot('4-autres-attributs');
  const phone = await hitTest('#var-linked-modal .var-linked-row[data-col="Telephone"] .var-linked-pick');
  check('la fenêtre liste les colonnes de l’annuaire, le téléphone en fait partie', phone.found && phone.inViewport, phone);
  await page.mouse.click(phone.x, phone.y);
  await page.waitForTimeout(200);
  const insert = await hitTest('#var-linked-modal .var-modal-primary');
  await page.mouse.click(insert.x, insert.y);
  await page.waitForTimeout(450);
  subject = await fieldInfo(SUBJECT);
  check('« Insérer » ajoute la bulle du téléphone à la suite des deux autres', subject.bubbles.length === 3 && subject.bubbles[2].key === 'MfAnnuaire.Telephone', subject.bubbles);
  const subjectRow1 = await page.evaluate(({ value, rec }) => Variables.resolveTextVariables(value, 'MfDossiers', rec), { value: subject.value, rec: REC_1 });
  const subjectRow2 = await page.evaluate(({ value, rec }) => Variables.resolveTextVariables(value, 'MfDossiers', rec), { value: subject.value, rec: REC_2 });
  check('ligne « Urgent » : l’Objet est écrit en entier, la valeur entre ses guillemets, avec le téléphone', subjectRow1 === 'Suivi « Dossier A » par Dupont Jean 06 11 22 33 44', subjectRow1);
  check('ligne « Normal » : la condition retire la première bulle ET ses guillemets, le reste de l’Objet est écrit', subjectRow2 === 'Suivi  par Martin Anne 06 55 66 77 88', subjectRow2);

  // ===== 5) Le champ À au clavier : « # » seul, flèches, Échap, clé tapée en entier, Retour arrière sur une bulle =====
  const toEdge = await fieldEdge(TO, 'right');
  await page.mouse.move(toEdge.x - 20, toEdge.y, { steps: 2 });
  await page.mouse.click(toEdge.x, toEdge.y);
  await page.waitForTimeout(150);
  check('un clic au bord droit d’un champ vide y met le curseur', (await fieldInfo(TO)).focused);
  await page.keyboard.type('#');
  await page.waitForTimeout(300);
  const hashAlone = await listNow();
  check('« # » seul ouvre la liste de toutes les variables, la première ligne choisie', !!hashAlone && hashAlone.items.length > 3 && hashAlone.items[0].endsWith('*') && hashAlone.tabsHidden, hashAlone);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const moved = await listNow();
  check('deux flèches vers le bas descendent la sélection de deux lignes', !!moved && moved.items[2].endsWith('*') && !moved.items[0].endsWith('*'), moved && moved.items.slice(0, 4));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check('Échap ferme la liste et laisse le « # » tapé', (await listNow()) === null && (await fieldInfo(TO)).value === '#');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('#MfAnnuaire.Email');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await realClick('#' + SUBJECT, 200);
  const toAfter = await fieldInfo(TO);
  check('une clé tapée en entier devient une bulle quand on quitte le champ', toAfter.bubbles.length === 1 && toAfter.bubbles[0].key === 'MfAnnuaire.Email' && toAfter.value === '#MfAnnuaire.Email', toAfter);
  await realClick('#' + TO, 150);
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(150);
  check('Retour arrière efface la bulle d’un coup', (await fieldInfo(TO)).bubbles.length === 0 && (await fieldInfo(TO)).value === '');
  await page.keyboard.type('#MfAnnuaire.Ema');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check('la bulle de l’e-mail du responsable est posée dans À', (await fieldInfo(TO)).bubbles.map(b => b.key).join() === 'MfAnnuaire.Email');

  // ===== 6) Cc : une adresse plus longue que le champ garde le curseur visible ; Entrée n'ajoute pas de ligne =====
  await realClick('#' + CC, 150);
  await page.evaluate(() => { window.__enters = 0; document.getElementById('v2-email-cc').addEventListener('fieldenter', () => window.__enters++); });
  await page.keyboard.type('copie@exemple-tres-long.fr');
  await page.waitForTimeout(200);
  const caret = await page.evaluate(id => {
    const host = document.getElementById(id); const sel = getSelection();
    const range = sel.rangeCount ? sel.getRangeAt(0) : null; const rects = range ? range.getClientRects() : [];
    const box = host.getBoundingClientRect(); const c = rects.length ? rects[0] : (range ? range.startContainer.parentElement.getBoundingClientRect() : null);
    return { text: host.querySelector('[role="textbox"]').scrollWidth > host.clientWidth, inside: !!c && c.right <= box.right + 1 && c.left >= box.left - 1 };
  }, CC);
  check('l’adresse tapée est plus large que le champ et le curseur reste dans le champ (le texte défile)', caret.text && caret.inside, caret);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const ccInfo = await fieldInfo(CC);
  check('Entrée sans liste ouverte envoie « fieldenter » une fois et n’ajoute pas de ligne', (await page.evaluate(() => window.__enters)) === 1 && ccInfo.value === 'copie@exemple-tres-long.fr' && !/\n/.test(ccInfo.value), ccInfo.value);

  // ===== 7) Cci : copier-coller d'une bulle réglée au clavier, puis collage de texte mis en forme =====
  await realClick('#' + SUBJECT, 150);
  await page.keyboard.press('Home');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+C');
  await realClick('#' + CCI, 150);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(300);
  const cci = await fieldInfo(CCI);
  check('Ctrl+C dans l’Objet puis Ctrl+V dans Cci : les trois bulles viennent avec leurs réglages (la condition y est)', cci.bubbles.length === 3 && !!conditionOf(cci.bubbles[0]) && cci.bubbles[0].key === 'MfDossiers.Titre', cci.bubbles);
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.evaluate(() => {
    const view = FieldEditor.of(document.getElementById('v2-email-cci')).view; view.focus();
    const dt = new DataTransfer(); dt.setData('text/plain', 'ligne 1\r\nligne 2'); dt.setData('text/html', '<p><b>gras</b> et <i>italique</i></p><p>deuxième</p>');
    view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(250);
  const pasted = await fieldInfo(CCI);
  check('un texte mis en forme collé devient du texte simple sur une ligne (ni gras, ni retour à la ligne)', pasted.value === 'gras et italique deuxième' && !(await page.evaluate(() => !!document.querySelector('#v2-email-cci b, #v2-email-cci i, #v2-email-cci strong, #v2-email-cci em'))), pasted.value);
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(150);
  check('le champ vidé retrouve son indication grisée', await page.evaluate(() => document.getElementById('v2-email-cci').classList.contains('is-empty')));

  // ===== 8) Le nom du PDF : crayon, texte, bulle, barre qui laisse le champ ouvert, Entrée le referme =====
  await realClick('#btn-toggle-pdf-filename', 300);
  await page.keyboard.type('Suivi_');
  await page.keyboard.type('#MfDossiers.Tit');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  let file = await fieldInfo(FILE);
  check('dans le nom du PDF aussi, Entrée choisit la variable : une bulle', file.bubbles.length === 1 && file.bubbles[0].key === 'MfDossiers.Titre' && file.value === 'Suivi_#MfDossiers.Titre', file);
  const fileBadge = await badgePoint('#' + FILE + ' .var-badge');
  await page.mouse.click(fileBadge.x, fileBadge.y);
  await page.waitForTimeout(350);
  const fileBar = await hitTest('.v2-varfmt-toolbar.visible');
  check('un clic sur sa bulle ouvre la barre flottante, dans le panneau', fileBar.found && fileBar.inViewport && fileBar.onTop, fileBar);
  const fileCond = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-condition"]');
  await page.mouse.move(fileCond.x - 10, fileCond.y, { steps: 3 });
  await page.mouse.click(fileCond.x, fileCond.y);
  await page.waitForTimeout(300);
  check('la souris sur la barre ne referme pas le champ : il reste ouvert pendant la fenêtre de condition', !(await fieldInfo(FILE)).hidden && (await hitTest('#var-condition-modal .var-modal-content')).found);
  check('la colonne Statut se choisit dans cette fenêtre aussi', await pickColumn('#var-condition-modal', 'Statut'));
  const fileValue = await hitTest('#var-condition-modal .macro-rule-value');
  await page.mouse.click(fileValue.x, fileValue.y);
  await page.keyboard.type('Urgent');
  await page.waitForTimeout(400);
  const fileSave = await hitTest('#var-condition-modal .var-modal-primary');
  await page.mouse.click(fileSave.x, fileSave.y);
  await page.waitForTimeout(350);
  file = await fieldInfo(FILE);
  check('la condition est enregistrée dans le nom du PDF (HTML, bulle réglée)', file.value.startsWith('<p class="pp-field">') && !!conditionOf(file.bubbles[0] || {}), file.value);
  const file1 = await page.evaluate(({ value, rec }) => ReaderMode.resolveFilename(value, 'MfDossiers', rec), { value: file.value, rec: REC_1 });
  const file2 = await page.evaluate(({ value, rec }) => ReaderMode.resolveFilename(value, 'MfDossiers', rec), { value: file.value, rec: REC_2 });
  check('ligne « Urgent » : le nom du PDF contient le titre ; ligne « Normal » : la condition le retire', file1 === 'Suivi_Dossier A' && file2 === 'Suivi_', { file1, file2 });
  check('la fenêtre refermée, le curseur est revenu dans le champ', file.focused, file);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const validated = await fieldInfo(FILE);
  check('Entrée valide le nom : le curseur quitte le champ, qui reste affiché avec sa bulle puisqu’il a une valeur', !validated.focused && !validated.hidden && validated.bubbles.length === 1 && validated.value === file.value, validated);
  await realClick('#btn-toggle-pdf-filename', 300);
  check('le crayon ne replie pas un nom de PDF qui a une valeur', !(await fieldInfo(FILE)).hidden);
  await shot('8-nom-du-pdf');

  // ===== 9) « Créer l'email » : les champs sont résolus pour la ligne courante, la condition joue =====
  await realClick('#btn-create-email', 900);
  let urls = await page.evaluate(() => window.__mailtos.slice());
  let mail = readMailto(urls[0] || 'mailto:');
  check('ligne « Urgent » : le lien mailto: porte l’adresse du responsable, la copie et l’objet complet', mail.to === 'jean@ex.fr' && mail.cc === 'copie@exemple-tres-long.fr' && mail.subject === 'Suivi « Dossier A » par Dupont Jean 06 11 22 33 44', mail);
  check('Cci vide : pas de paramètre cci dans le lien', !mail.keys.includes('bcc') && !mail.keys.includes('cci'), mail.keys);
  const gauge = await page.evaluate(() => document.getElementById('v2-email-char-counter').textContent.trim());
  check('la jauge de la barre est celle du lien ouvert', gauge === `${urls[0].length} / 2000 caractères`, { gauge, length: urls[0].length });
  await page.evaluate(rec => window.__gristStub.fireRecord(rec, 'MfDossiers'), REC_2);
  await page.waitForTimeout(500);
  await realClick('#btn-create-email', 900);
  urls = await page.evaluate(() => window.__mailtos.slice());
  mail = readMailto(urls[1] || 'mailto:');
  check('ligne « Normal » : autre adresse, et la condition retire le titre de l’objet', mail.to === 'anne@ex.fr' && mail.subject === 'Suivi  par Martin Anne 06 55 66 77 88', mail);
  await page.evaluate(rec => window.__gristStub.fireRecord(rec, 'MfDossiers'), REC_1);
  await page.waitForTimeout(400);

  // ===== 10) Lecture : les valeurs résolues, lisibles et sans curseur ; au retour, les bulles et leurs réglages =====
  const editing = { subject: (await fieldInfo(SUBJECT)).value, to: (await fieldInfo(TO)).value, cc: (await fieldInfo(CC)).value };
  await realClick('#btn-mode-read', 700);
  const reading = { subject: await fieldInfo(SUBJECT), to: await fieldInfo(TO), cc: await fieldInfo(CC) };
  check('en Lecture, l’Objet, À et Cc montrent les valeurs de la ligne, sans bulle', reading.subject.text === 'Suivi « Dossier A » par Dupont Jean 06 11 22 33 44' && reading.to.text === 'jean@ex.fr' && reading.cc.text === 'copie@exemple-tres-long.fr' && reading.subject.bubbles.length === 0, reading);
  check('ces champs ne s’écrivent pas en Lecture', reading.subject.readOnly && reading.subject.editable === 'false' && reading.to.readOnly);
  await shot('10-lecture');
  const subjectBox = await hitTest('#' + SUBJECT);
  await page.mouse.click(subjectBox.x, subjectBox.y);
  await page.keyboard.type('x');
  await page.waitForTimeout(250);
  check('un clic puis une frappe dans un champ en Lecture ne change rien et n’ouvre aucune barre', (await fieldInfo(SUBJECT)).text === reading.subject.text && !(await page.evaluate(() => !!document.querySelector('.v2-varfmt-toolbar.visible'))));
  await page.evaluate(rec => window.__gristStub.fireRecord(rec, 'MfDossiers'), REC_2);
  await page.waitForTimeout(600);
  check('changer de ligne met à jour les valeurs lues', (await fieldInfo(SUBJECT)).text === 'Suivi  par Martin Anne 06 55 66 77 88' && (await fieldInfo(TO)).text === 'anne@ex.fr', await fieldInfo(SUBJECT));
  await realClick('#btn-mode-edit', 700);
  const back = { subject: (await fieldInfo(SUBJECT)).value, to: (await fieldInfo(TO)).value, cc: (await fieldInfo(CC)).value };
  check('au retour à l’édition, les bulles reprennent leurs réglages : les trois valeurs enregistrées sont intactes', JSON.stringify(back) === JSON.stringify(editing) && (await fieldInfo(SUBJECT)).bubbles.length === 3 && !!conditionOf((await fieldInfo(SUBJECT)).bubbles[0]), { back, editing });
  check('les champs sont de nouveau modifiables', (await fieldInfo(SUBJECT)).editable === 'true' && !(await fieldInfo(SUBJECT)).readOnly);
  await page.evaluate(rec => window.__gristStub.fireRecord(rec, 'MfDossiers'), REC_1);
  await page.waitForTimeout(400);

  // ===== 11) Enregistrer, repartir d'un modèle vide, rouvrir : les champs reviennent tels qu'ils étaient =====
  const before = Object.fromEntries(await Promise.all(IDS.map(async id => [id, (await fieldInfo(id)).value])));
  await realClick('#btn-rename-template', 250);
  await page.keyboard.type('Suivi des dossiers');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  await realClick('#btn-save', 900);
  const saved = await page.evaluate(async () => {
    const all = await Templates.loadAll();
    const row = (Array.isArray(all) ? all : Templates.getCached()).find(t => t.nom === 'Suivi des dossiers');
    return row && { objet: row.objet, destinataires: row.destinataires, cc: row.cc, cci: row.cci, nomFichierPDF: row.nomFichierPDF, typeModele: row.typeModele };
  });
  check('le modèle est enregistré en tant qu’email', !!saved && saved.typeModele === 'email', saved);
  check('Objet et nom du PDF (bulle réglée) sont enregistrés en HTML', !!saved && isRichField(saved.objet) && isRichField(saved.nomFichierPDF), saved && [saved.objet.slice(0, 40), saved.nomFichierPDF.slice(0, 40)]);
  check('À et Cc (rien de réglé) sont enregistrés en texte brut, lisibles dans la table', !!saved && saved.destinataires === '#MfAnnuaire.Email' && saved.cc === 'copie@exemple-tres-long.fr', saved && [saved.destinataires, saved.cc]);
  await page.evaluate(() => { const sel = document.getElementById('template-select'); sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(900);
  const blank = await Promise.all(IDS.map(fieldInfo));
  check('un nouveau document vide les cinq champs', blank.every(f => f.value === '' && f.bubbles.length === 0), blank.map(f => f.value));
  await page.evaluate(() => {
    const sel = document.getElementById('template-select');
    const opt = Array.from(sel.options).find(o => /Suivi des dossiers/.test(o.textContent));
    sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(1100);
  const after = Object.fromEntries(await Promise.all(IDS.map(async id => [id, (await fieldInfo(id)).value])));
  check('rouvert, le modèle rend les cinq champs à l’identique', JSON.stringify(after) === JSON.stringify(before), { before, after });
  const reopened = await fieldInfo(SUBJECT);
  check('l’Objet rouvert a ses trois bulles, la première avec sa condition', reopened.bubbles.length === 3 && !!conditionOf(reopened.bubbles[0]), reopened.bubbles);
  await shot('11-modele-rouvert');
}
try { await run(); } catch (e) { check('le parcours va jusqu’au bout', false, String(e && e.stack || e)); }

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
