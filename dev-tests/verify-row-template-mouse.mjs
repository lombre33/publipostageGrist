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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/vfs_fonts\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@[\d.]+\/dist\/jszip\.min\.js$/, 'umd/jszip.min.js'],
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

// La largeur du texte de chaque onglet de Réglages contre la place qu'il a : un libellé coupé se voit ici.
const measureTabs = () => page.evaluate(() => Array.from(document.querySelectorAll('.settings-tab')).map(t => {
  const range = document.createRange();
  range.selectNodeContents(t);
  const style = getComputedStyle(t);
  const content = t.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  return { text: t.textContent.trim(), textW: Math.round(range.getBoundingClientRect().width * 10) / 10, boxW: Math.round(content * 10) / 10, cut: range.getBoundingClientRect().width > content + 0.5 };
}));

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

  // 1) Réglages > Selon la ligne : l'onglet se lit en entier, en français ici, en anglais à la fin (runEnglish, dans une page qui repart en anglais).
  await realClick('#v2-btn-settings', 500);
  await realClick('.settings-tab[data-settings-tab="rowTemplate"]', 300);
  const tabsFr = await measureTabs();
  check('aucun libellé d’onglet n’est coupé (français)', tabsFr.every(t => !t.cut), tabsFr);
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
  check('la liste « Si aucune règle ne correspond » propose le défaut (★), « Laisser le modèle ouvert » et les modèles', offered[0] === 'Ouvrir le modèle par défaut' && offered[1] === 'Laisser le modèle ouvert' && offered.length >= 5, offered);
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

  // 8) « 16 bis » : « Modèle par défaut de cette vue », au vrai clic dans la même fenêtre. Le modèle ouvert (B, pour la ligne 5) devient celui de la vue.
  await realClick('#v2-btn-settings', 500);
  await realClick('.settings-tab[data-settings-tab="rowTemplate"]', 300);
  await page.evaluate(() => document.getElementById('settings-viewtemplate-section').scrollIntoView({ block: 'end' }));
  await page.waitForTimeout(200);
  const viewGeometry = await page.evaluate(() => {
    const modal = document.querySelector('#settings-modal .modal-content').getBoundingClientRect();
    const body = document.querySelector('#settings-modal .settings-body');
    const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width, h: r.height }; };
    return { set: rect('settings-viewtemplate-set'), clear: rect('settings-viewtemplate-clear'), modal: { l: modal.left, r: modal.right }, hScroll: body.scrollWidth > body.clientWidth + 1, label: document.getElementById('settings-viewtemplate-set').textContent, status: document.getElementById('settings-viewtemplate-status').textContent };
  });
  const within = r => r.l >= viewGeometry.modal.l && r.r <= viewGeometry.modal.r && r.w > 40 && r.h >= 24;
  check('les deux boutons de la vue tiennent dans la fenêtre 700x400, sans défilement horizontal', within(viewGeometry.set) && within(viewGeometry.clear) && !viewGeometry.hScroll, viewGeometry);
  check('l’état dit que le modèle par défaut du document s’ouvre, et le bouton nomme le modèle ouvert', /par défaut du document/.test(viewGeometry.status) && viewGeometry.label === 'Utiliser « Ligne - B urgent » pour cette vue', viewGeometry);
  await realClick('#settings-viewtemplate-set', 400);
  const chosen = await page.evaluate(() => ({ option: (window.__gristStub.state.options || {}).modeleDeLaVue, status: document.getElementById('settings-viewtemplate-status').textContent, setDisabled: document.getElementById('settings-viewtemplate-set').getAttribute('aria-disabled') === 'true', clearDisabled: document.getElementById('settings-viewtemplate-clear').getAttribute('aria-disabled') === 'true' }));
  check('un vrai clic choisit le modèle ouvert pour la vue : option du widget écrite, état mis à jour, bouton grisé', String(chosen.option) === String(ids.B) && chosen.status === 'Modèle de cette vue : « Ligne - B urgent ».' && chosen.setDisabled && !chosen.clearDisabled, chosen);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'view-template-700x400.png') });
  await realClick('#settings-viewtemplate-clear', 400);
  const cleared = await page.evaluate(() => ({ option: (window.__gristStub.state.options || {}).modeleDeLaVue || null, status: document.getElementById('settings-viewtemplate-status').textContent, clearDisabled: document.getElementById('settings-viewtemplate-clear').getAttribute('aria-disabled') === 'true' }));
  check('« Retirer » enlève le choix de la vue', cleared.option === null && /par défaut du document/.test(cleared.status) && cleared.clearDisabled, cleared);
  await realClick('#settings-close', 500);

  // 9) Demande du 08/10, « mail et macro modèle peuvent être des modèles par défaut d'une vue » : un macro-modèle puis un email ouverts, le bouton de la vue est actif, nomme le modèle, tient
  // dans la fenêtre 700x400 ; un vrai clic le choisit, « Retirer » le défait. La règle de ligne est coupée d'abord : à la fermeture des Réglages elle rouvrirait B par-dessus le modèle ouvert à la main.
  await page.evaluate(async () => {
    await RowTemplate.save(null);
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('v2-btn-new-email').click();
    await wait(80);
    Editor.setHTML('<p>Contenu mail</p>');
    document.getElementById('template-name').value = 'Ligne - M email';
    document.getElementById('btn-save').click();
    await wait(500);
    const email = Templates.getCurrentId();
    MacroEditor.openModal(null);
    document.getElementById('macro-editor-name').value = 'Ligne - N macro';
    const cover = document.querySelector('#macro-editor-slots .macro-doc-model');
    cover.value = String(window.__ids.A);
    cover.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('macro-editor-save').click();
    await wait(700);
    window.__ids.M = email;
    window.__ids.N = Templates.getCurrentId();
  });
  const more = await page.evaluate(() => window.__ids);
  for (const [kind, id, nom] of [['macro-modèle', more.N, 'Ligne - N macro'], ['email', more.M, 'Ligne - M email']]) {
    await page.evaluate(i => { const select = document.getElementById('template-select'); select.value = String(i); select.dispatchEvent(new Event('change', { bubbles: true })); }, id);
    check(`${kind} : il est ouvert`, await waitCurrent(id), await current());
    await page.waitForTimeout(300);
    await realClick('#v2-btn-settings', 500);
    await realClick('.settings-tab[data-settings-tab="rowTemplate"]', 300);
    await page.evaluate(() => document.getElementById('settings-viewtemplate-section').scrollIntoView({ block: 'end' }));
    await page.waitForTimeout(200);
    const button = await page.evaluate(() => {
      const b = document.getElementById('settings-viewtemplate-set');
      const r = b.getBoundingClientRect();
      const m = document.querySelector('#settings-modal .modal-content').getBoundingClientRect();
      return { disabled: b.getAttribute('aria-disabled') === 'true' || b.disabled, label: b.textContent, title: b.title, fits: r.left >= m.left && r.right <= m.right && r.width > 40 && r.height >= 24 };
    });
    check(`${kind} ouvert : le bouton de la vue est actif, sans infobulle d'interdit, nomme le modèle et tient dans la fenêtre`, !button.disabled && button.title === '' && button.label === `Utiliser « ${nom} » pour cette vue` && button.fits, button);
    await realClick('#settings-viewtemplate-set', 400);
    const picked = await page.evaluate(() => ({ option: (window.__gristStub.state.options || {}).modeleDeLaVue, status: document.getElementById('settings-viewtemplate-status').textContent, setDisabled: document.getElementById('settings-viewtemplate-set').getAttribute('aria-disabled') === 'true', clearDisabled: document.getElementById('settings-viewtemplate-clear').getAttribute('aria-disabled') === 'true' }));
    check(`${kind} : un vrai clic le choisit pour la vue (option écrite, état à jour, bouton grisé)`, String(picked.option) === String(id) && picked.status === `Modèle de cette vue : « ${nom} ».` && picked.setDisabled && !picked.clearDisabled, picked);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `view-template-${kind === 'email' ? 'email' : 'macro'}-700x400.png`) });
    await realClick('#settings-viewtemplate-clear', 400);
    const undone = await page.evaluate(() => ({ option: (window.__gristStub.state.options || {}).modeleDeLaVue || null, clearDisabled: document.getElementById('settings-viewtemplate-clear').getAttribute('aria-disabled') === 'true' }));
    check(`${kind} : « Retirer » défait le choix`, undone.option === null && undone.clearDisabled, undone);
    await realClick('#settings-close', 500);
  }

  // 10) Consigne 088 de GFS (demande du porteur : « indiquer pourquoi à chaque fois qu'une option est grisée ») : un modèle neuf, pas encore enregistré, est ouvert. Les deux boutons de la vue sont
  // grisés par aria-disabled (jamais `disabled`) : ils reçoivent le vrai survol et le vrai Tab, disent leur raison (info-bulle, phrase visible sous l'état, description que lit le lecteur d'écran,
  // vue par le navigateur lui-même), et ni un clic, ni Entrée, ni Espace n'écrit rien. La phrase tient dans la fenêtre 700x400. Une fois enregistré sous un nom, la phrase disparaît et le bouton
  // porte le nom, sans info-bulle.
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('Accessibility.enable');
  // Ce que le navigateur dit d'un élément à la technologie d'assistance : nom, description, grisé, atteignable.
  const axOf = async (selector) => {
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    const node = nodes[0];
    const props = Object.fromEntries((node.properties || []).map(p => [p.name, p.value.value]));
    return { role: node.role && node.role.value, name: node.name && node.name.value, description: node.description ? node.description.value : '', disabled: props.disabled === true, focusable: props.focusable === true };
  };
  const optionOfView = () => page.evaluate(() => (window.__gristStub.state.options || {}).modeleDeLaVue || null);
  const SENTENCE = 'Ce modèle n’est pas encore enregistré : donnez-lui un nom et cliquez sur Enregistrer, il pourra alors devenir celui de cette vue.';
  const NOTHING = 'Aucun modèle n’est choisi pour cette vue : il n’y a rien à retirer.';
  await page.evaluate(async () => {
    await RowTemplate.save(null);
    await ViewTemplate.clear();
    document.getElementById('v2-btn-new-document').click();
    await new Promise(r => setTimeout(r, 200));
  });
  check('un modèle neuf, pas encore enregistré, est ouvert (aucun identifiant)', (await current()) == null, await current());
  const optionBefore = await optionOfView();
  await realClick('#v2-btn-settings', 500);
  await realClick('.settings-tab[data-settings-tab="rowTemplate"]', 300);
  await page.evaluate(() => document.getElementById('settings-viewtemplate-section').scrollIntoView({ block: 'end' }));
  await page.waitForTimeout(200);
  const geo = await page.evaluate(() => {
    const modal = document.querySelector('#settings-modal .modal-content').getBoundingClientRect();
    const body = document.querySelector('#settings-modal .settings-body');
    const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
    return { status: rect('settings-viewtemplate-status'), sentence: rect('settings-viewtemplate-unsaved'), set: rect('settings-viewtemplate-set'), modal: { l: modal.left, r: modal.right }, hScroll: body.scrollWidth > body.clientWidth + 1 };
  });
  check('la phrase « pas encore enregistré » est visible, sous l’état et avant les boutons, et tient dans la fenêtre 700x400 sans défilement horizontal',
    geo.sentence.h > 10 && geo.sentence.l >= geo.modal.l && geo.sentence.r <= geo.modal.r && geo.status.b <= geo.sentence.t + 1 && geo.sentence.b <= geo.set.t + 1 && !geo.hScroll, geo);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'view-template-unsaved-700x400.png') });
  const greyedSet = await page.evaluate(() => { const b = document.getElementById('settings-viewtemplate-set'); return { aria: b.getAttribute('aria-disabled'), native: b.disabled, title: b.title, describedBy: b.getAttribute('aria-describedby'), sentence: document.getElementById('settings-viewtemplate-unsaved').textContent }; });
  check('« Utiliser… » : aria-disabled="true", pas `disabled`, sa raison en info-bulle, décrit par la phrase visible', greyedSet.aria === 'true' && !greyedSet.native && greyedSet.title === SENTENCE && greyedSet.describedBy === 'settings-viewtemplate-unsaved' && greyedSet.sentence === SENTENCE, greyedSet);
  // Le vrai Tab, de l'état aux deux boutons : un <button disabled> serait sauté.
  await page.evaluate(() => { const s = document.getElementById('settings-viewtemplate-status'); s.tabIndex = -1; s.focus(); });
  await page.keyboard.press('Tab');
  const tab1 = await page.evaluate(() => document.activeElement && document.activeElement.id);
  const axSet = await axOf('#settings-viewtemplate-set');
  await page.keyboard.press('Tab');
  const tab2 = await page.evaluate(() => document.activeElement && document.activeElement.id);
  const axClear = await axOf('#settings-viewtemplate-clear');
  await page.evaluate(() => document.getElementById('settings-viewtemplate-status').removeAttribute('tabindex'));
  check('au vrai Tab, le clavier atteint « Utiliser… » puis « Retirer » (grisés, pas sautés)', tab1 === 'settings-viewtemplate-set' && tab2 === 'settings-viewtemplate-clear', { tab1, tab2 });
  check('le navigateur les donne au lecteur d’écran comme boutons grisés, atteignables, avec leur raison pour description',
    axSet.role === 'button' && axSet.disabled && axSet.focusable && axSet.description === SENTENCE && axClear.role === 'button' && axClear.disabled && axClear.focusable && axClear.description === NOTHING, { axSet, axClear });
  // Le vrai survol : le grisé reçoit :hover mais ne s'éclaire pas, curseur par défaut.
  const bg0 = await page.evaluate(() => getComputedStyle(document.getElementById('settings-viewtemplate-set')).backgroundColor);
  await realHover('#settings-viewtemplate-set');
  const hover = await page.evaluate(() => { const b = document.getElementById('settings-viewtemplate-set'); const cs = getComputedStyle(b); return { hovered: b.matches(':hover'), bg: cs.backgroundColor, cursor: cs.cursor, opacity: cs.opacity }; });
  check('survolé à la vraie souris, « Utiliser… » grisé reçoit le survol (son info-bulle peut s’afficher) sans s’éclaircir, curseur par défaut', hover.hovered && hover.bg === bg0 && hover.cursor === 'default' && Number(hover.opacity) < 1, { bg0, hover });
  // Ni un vrai clic, ni Entrée, ni Espace sur un bouton grisé n'écrit.
  await realClick('#settings-viewtemplate-set', 250);
  await realClick('#settings-viewtemplate-clear', 250);
  await page.evaluate(() => document.getElementById('settings-viewtemplate-set').focus());
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  check('un clic, Entrée ou Espace sur un bouton grisé n’écrit rien (ni choix, ni retrait)', (await optionOfView()) === optionBefore, { before: optionBefore, after: await optionOfView() });
  await realClick('#settings-close', 500);
  // Enregistré sous un nom : la phrase disparaît, le bouton porte le nom et n'a plus d'info-bulle.
  await page.evaluate(async () => {
    Editor.setHTML('<p>Contenu Z</p>');
    document.getElementById('template-name').value = 'Ligne - Z enregistré';
    document.getElementById('btn-save').click();
    await new Promise(r => setTimeout(r, 600));
  });
  check('le modèle est enregistré (il a un identifiant)', (await current()) != null, await current());
  await realClick('#v2-btn-settings', 500);
  await realClick('.settings-tab[data-settings-tab="rowTemplate"]', 300);
  await page.evaluate(() => document.getElementById('settings-viewtemplate-section').scrollIntoView({ block: 'end' }));
  await page.waitForTimeout(200);
  const saved = await page.evaluate(() => { const b = document.getElementById('settings-viewtemplate-set'); const s = document.getElementById('settings-viewtemplate-unsaved'); return { aria: b.getAttribute('aria-disabled'), title: b.title, describedBy: b.getAttribute('aria-describedby'), label: b.textContent, sentenceHidden: s.hidden || s.getBoundingClientRect().height === 0 }; });
  const axSaved = await axOf('#settings-viewtemplate-set');
  check('une fois enregistré sous un nom : la phrase disparaît, le bouton est actif, porte le nom, sans info-bulle ni description',
    saved.aria === null && saved.title === '' && saved.describedBy === null && saved.label === 'Utiliser « Ligne - Z enregistré » pour cette vue' && saved.sentenceHidden && !axSaved.disabled && axSaved.description === '', { saved, axSaved });
  await realClick('#settings-close', 500);
}

// La page ne change plus de langue en route : Réglages garde le choix et la recharge. Le script fait pareil - il garde la langue, recharge, attend le widget -,
// puis lit les onglets de Réglages dans une page qui repart en anglais.
async function restartIn(lang) {
  await page.evaluate(next => I18n.storeLang(next), lang);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
}

async function runEnglish() {
  await restartIn('en');
  await realClick('#v2-btn-settings', 500);
  await realClick('.settings-tab[data-settings-tab="rowTemplate"]', 300);
  const tabsEn = await measureTabs();
  check('aucun libellé d’onglet n’est coupé (anglais)', tabsEn.every(t => !t.cut) && tabsEn.some(t => t.text === 'View'), tabsEn);
  await realClick('#settings-close', 500);
}

await run();
await runEnglish();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
