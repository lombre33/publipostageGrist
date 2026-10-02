#!/usr/bin/env node
// Modèle selon la ligne (js/row-template.js, onglet Réglages > Selon la ligne : js/row-template-panel.js) à 700x400 (le panneau d'Antoine), à la VRAIE souris (page.mouse) : point 16
// d'Antoine du 02/10 (« relier un modèle à une condition dans la table où est le widget pour qu'il ouvre le bon modèle en fonction de la ligne, y compris en mode édition »).
// Trois modèles créés par l'interface, puis Réglages > Selon la ligne : l'onglet se lit en entier (aucun libellé d'onglet coupé, français et anglais), la case, la colonne, la valeur
// et le modèle se choisissent dans leurs listes avec recherche au vrai clic, la fenêtre ne déborde ni en largeur ni en hauteur de plus que son défilement, et à la fermeture le modèle de la
// ligne s'ouvre ; ensuite changer de ligne ouvre le bon modèle, en Lecture comme en édition.
// Lancé par run-headless.mjs (groupe Node "rowTemplateMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-row-template-mouse.mjs
// ROW_TEMPLATE_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.ROW_TEMPLATE_MOUSE_PORT || 8947);
const SHOTS = process.env.ROW_TEMPLATE_SHOTS || '';
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/html2pdf\.bundle\.min\.js$/, 'umd/html2pdf.bundle.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-row-template-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
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
const current = () => page.evaluate(() => Templates.getCurrentId());
const fireRow = (id, statut) => page.evaluate(([i, s]) => window.__gristStub.fireRecord({ id: i, Nom: 'Ligne ' + i, Statut: s }, 'PpLignes'), [id, statut]);
async function waitCurrent(id, ms = 3000) {
  try { await page.waitForFunction(want => String(Templates.getCurrentId()) === String(want), id, { timeout: ms }); return true; } catch { return false; }
}
async function pickOption(triggerSelector, text) {
  await realClick(triggerSelector, 350);
  const target = await page.evaluate(t => {
    const row = Array.from(document.querySelectorAll('.ss-panel:not([hidden]) .ss-option')).find(r => r.querySelector('.ss-name').textContent === t);
    if (!row) return null;
    row.scrollIntoView({ block: 'nearest' });
    const r = row.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, text);
  if (!target) throw new Error('option introuvable : ' + text);
  await page.mouse.move(target.x, target.y, { steps: 3 });
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(350);
}

async function run() {
  // Table des lignes, trois modèles créés par l'interface (le premier est ★).
  await page.evaluate(async () => {
    window.__gristStub.setVariables('PpLignes', { Nom: 'Text', Statut: 'Choice' }, { Statut: ['Urgent', 'Archive', 'Autre'] });
    await GristAPI.refreshSchema();
    const make = async (nom, html) => {
      document.getElementById('v2-btn-new-document').click();
      await new Promise(r => setTimeout(r, 80));
      Editor.setHTML(html);
      document.getElementById('template-name').value = nom;
      document.getElementById('btn-save').click();
      await new Promise(r => setTimeout(r, 500));
      return Templates.getCurrentId();
    };
    const A = await make('Ligne - A défaut', '<p>Contenu A défaut</p>');
    const B = await make('Ligne - B urgent', '<p>Contenu B urgent</p>');
    const C = await make('Ligne - C archive', '<p>Contenu C archive</p>');
    const rows = window.__gristStub.state.rows.Publipostage_Modeles;
    rows.id.forEach((rowId, i) => { rows.EstParDefaut[i] = String(rowId) === String(A); });
    await Templates.loadAll();
    window.__ids = { A, B, C };
  });
  const ids = await page.evaluate(() => window.__ids);
  await fireRow(1, 'Urgent');
  await page.waitForTimeout(300);
  check('avant tout réglage, la ligne ne change pas le modèle ouvert', String(await current()) === String(ids.C), { current: await current(), ids });

  // 1) Réglages > Selon la ligne : l'onglet se lit en entier, en français puis en anglais.
  await realClick('#v2-btn-settings', 500);
  await realClick('.settings-tab[data-settings-tab="rowTemplate"]', 300);
  const measureTabs = () => page.evaluate(() => Array.from(document.querySelectorAll('.settings-tab')).map(t => {
    const range = document.createRange();
    range.selectNodeContents(t);
    const style = getComputedStyle(t);
    const content = t.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return { text: t.textContent.trim(), textW: Math.round(range.getBoundingClientRect().width * 10) / 10, boxW: Math.round(content * 10) / 10, cut: range.getBoundingClientRect().width > content + 0.5 };
  }));
  const tabsFr = await measureTabs();
  check('aucun libellé d’onglet n’est coupé (français)', tabsFr.every(t => !t.cut), tabsFr);
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  const tabsEn = await measureTabs();
  check('aucun libellé d’onglet n’est coupé (anglais)', tabsEn.every(t => !t.cut) && tabsEn.some(t => t.text === 'View'), tabsEn);
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(250);
  const off = await page.evaluate(() => {
    const body = document.getElementById('settings-rowtemplate-body');
    return { grey: body.classList.contains('is-off'), inert: body.inert, visible: body.getBoundingClientRect().height > 0, intro: document.querySelector('[data-settings-panel="rowTemplate"] .settings-panel-intro').textContent.length > 20 };
  });
  check('décoché, le cadre des règles est visible mais grisé et inerte', off.grey && off.inert && off.visible && off.intro, off);

  // 2) La case, au vrai clic : une règle vide prête à remplir.
  await realClick('.settings-rowtemplate-enable', 350);
  const on = await page.evaluate(() => ({ checked: document.getElementById('settings-rowtemplate-enabled').checked, rules: document.querySelectorAll('#settings-rowtemplate-rules .macro-rule-row').length, grey: document.getElementById('settings-rowtemplate-body').classList.contains('is-off') }));
  check('cocher la case dégrise le cadre et pose une première règle', on.checked && on.rules === 1 && !on.grey, on);

  // 3) Colonne, valeur et modèle, dans leurs listes avec recherche, au vrai clic.
  const rule = '#settings-rowtemplate-rules .macro-rule-row';
  await pickOption(rule + ' .macro-rule-column-wrap .ss-trigger', 'Statut');
  await pickOption(rule + ' .macro-rule-value-slot .ss-trigger', 'Urgent');
  await pickOption(rule + ' .macro-rule-modele + .ss-wrap .ss-trigger', 'Ligne - B urgent');
  const filled = await page.evaluate(() => {
    const t = s => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
    return { column: t('#settings-rowtemplate-rules .macro-rule-column-wrap .ss-trigger'), value: t('#settings-rowtemplate-rules .macro-rule-value-slot .ss-trigger'), modele: t('#settings-rowtemplate-rules .macro-rule-modele + .ss-wrap .ss-trigger') };
  });
  check('la règle montre Statut, Urgent et le modèle choisi', filled.column === 'Statut' && /^Urgent/.test(filled.value || '') && /Ligne - B urgent/.test(filled.modele || ''), filled);
  await page.waitForTimeout(500);
  const written = await page.evaluate(() => (window.__gristStub.state.options || {}).modeleSelonLigne || null);
  check('chaque choix écrit l’option du widget', !!written && written.enabled === true && written.rules.length === 1 && written.rules[0].column === 'Statut' && written.rules[0].value === 'Urgent', written);
  check('rien ne s’ouvre pendant la saisie de la règle', String(await current()) === String(ids.C), await current());

  // 4) Mesure de la fenêtre à 700x400 : ni débordement horizontal, tous les champs de la règle dans la fenêtre et sous le doigt (rien ne se chevauche).
  const geometry = await page.evaluate(() => {
    const modal = document.querySelector('#settings-modal .modal-content');
    const mb = modal.getBoundingClientRect();
    const body = document.querySelector('#settings-modal .settings-body');
    const fields = ['.macro-rule-column-wrap', '.macro-rule-row select.macro-rule-row-op, .macro-rule-line > select', '.macro-rule-value-slot', '.macro-rule-modele + .ss-wrap', '.macro-rule-remove'].map(s => document.querySelector('#settings-rowtemplate-rules ' + s));
    const rects = fields.filter(Boolean).map(e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; });
    return { modal: { l: mb.left, r: mb.right, t: mb.top, b: mb.bottom }, hScroll: body.scrollWidth > body.clientWidth + 1, vScrollable: body.scrollHeight > body.clientHeight, winW: innerWidth, winH: innerHeight, rects };
  });
  const inside = geometry.rects.every(r => r.l >= geometry.modal.l - 1 && r.r <= geometry.modal.r + 1 && r.w > 20);
  check('la fenêtre tient dans 700x400 sans défilement horizontal, champs de la règle dans la fenêtre', !geometry.hScroll && inside && geometry.modal.r <= geometry.winW + 1 && geometry.modal.b <= geometry.winH + 1, geometry);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'row-template-settings-700x400.png') });

  // 5) « Si aucune règle ne correspond » : la liste propose le modèle par défaut, « Laisser le modèle ouvert » et les modèles.
  await page.evaluate(() => document.getElementById('settings-rowtemplate-otherwise').closest('.macro-slot-card').scrollIntoView({ block: 'end' }));
  await page.waitForTimeout(200);
  await realClick('#settings-rowtemplate-otherwise + .ss-wrap .ss-trigger', 350);
  const offered = await page.evaluate(() => Array.from(document.querySelectorAll('.ss-panel:not([hidden]) .ss-option .ss-name')).map(n => n.textContent));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('la liste « Si aucune règle ne correspond » propose le défaut (★), « Laisser le modèle ouvert » et les modèles', offered[0] === 'Ouvrir le modèle par défaut (★)' && offered[1] === 'Laisser le modèle ouvert' && offered.length >= 5, offered);
  const stillOpen = await page.evaluate(() => document.getElementById('settings-modal').style.display === 'flex');
  check('Échap ferme la liste sans fermer les Réglages', stillOpen, stillOpen);

  // 6) Fermeture des Réglages au vrai clic : le modèle de la ligne (B) s'ouvre.
  await realClick('#settings-close', 700);
  check('à la fermeture des Réglages, le modèle de la ligne s’ouvre', await waitCurrent(ids.B), await current());

  // 7) Changer de ligne, en édition puis en Lecture.
  await fireRow(2, 'Autre');
  check('une ligne sans règle ouvre le modèle par défaut (★), en édition', await waitCurrent(ids.A), await current());
  await fireRow(3, 'Urgent');
  check('une ligne « Urgent » ouvre le modèle B, en édition', await waitCurrent(ids.B), await current());
  const editorB = await page.evaluate(() => document.querySelector('.ProseMirror').textContent);
  check('l’éditeur montre le contenu du modèle de la ligne', editorB === 'Contenu B urgent', editorB);
  await realClick('#btn-mode-read', 700);
  await fireRow(4, 'Autre');
  check('en Lecture aussi : une ligne sans règle ouvre le modèle par défaut', await waitCurrent(ids.A), await current());
  await page.waitForTimeout(500);
  const reader = await page.evaluate(() => ({ text: document.getElementById('reader-container').textContent, shown: document.getElementById('reader-container').style.display }));
  check('la Lecture montre le contenu du modèle de la ligne et reste en Lecture', /Contenu A défaut/.test(reader.text) && reader.shown === 'block', reader);
  await fireRow(5, 'Urgent');
  check('en Lecture : une ligne « Urgent » ouvre le modèle B', await waitCurrent(ids.B), await current());
  await page.waitForTimeout(500);
  const readerB = await page.evaluate(() => document.getElementById('reader-container').textContent);
  check('la Lecture suit', /Contenu B urgent/.test(readerB), readerB.slice(0, 80));
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'row-template-read-700x400.png') });
}

await run();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
