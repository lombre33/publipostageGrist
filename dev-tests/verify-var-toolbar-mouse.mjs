#!/usr/bin/env node
// Barre flottante d'une bulle #Variable et ses fenêtres (condition d'affichage, autres attributs, boucle), à la VRAIE souris (page.mouse, Node/Playwright)
// et à la taille du panneau Grist d'Antoine (~700x400) : les scénarios de dev-tests/scenarios-var-condition.js tournent DANS la page (dispatchEvent),
// ils ne prouvent ni qu'un vrai clic atteint l'icône, ni que la fenêtre et ses boutons tiennent dans un panneau bas sans être recouverts.
// Lancé par run-headless.mjs (groupe Node "varToolbarMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-var-toolbar-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.VAR_TOOLBAR_MOUSE_PORT || 8897);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-wheel-scroll.mjs.
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
if (!OFFLINE) console.log('[verify-var-toolbar-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Mêmes données que scenarios-var-condition.js : page sur VcDossiers, VcAnnuaire liée par la colonne Référence Responsable (valeur AFFICHÉE dans la
// ligne courante, comme grist.onRecord la livre).
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('VcAnnuaire', { NomPrenom: 'Text', Telephone: 'Text', Naissance: 'Date' });
  stub.setVariables('VcDossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:VcAnnuaire', Montant: 'Numeric' });
  // Table PAS encore liée : son choix de clé s'ouvre par-dessus la fenêtre. Assez de colonnes pour que sa liste avec recherche défile dans 400 px.
  stub.setVariables('VcContacts', {
    Dossier: 'Ref:VcDossiers', Role: 'Text', Telephone: 'Text', Courriel: 'Text', Adresse: 'Text', Ville: 'Text', CodePostal: 'Text', Pays: 'Text',
    Notes: 'Text', Origine: 'Text', Priorite: 'Text', Societe: 'Text', Service: 'Text', Fonction: 'Text', Langue: 'Text', Civilite: 'Text',
  });
  stub.setRows('VcAnnuaire', [
    { id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44', Naissance: 631152000 },
    { id: 8, NomPrenom: 'Martin Anne', Telephone: '06 55 66 77 88', Naissance: 662688000 },
  ]);
  stub.setRows('VcDossiers', [
    { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7, Montant: 1200 },
    { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 8, Montant: 50 },
  ]);
  await GristAPI.refreshSchema();
  await GristAPI.saveLinkRule('VcAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
  stub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200 }, 'VcDossiers');
  Editor.setHTML('<p>Dossier suivi par <span class="var-badge" data-table="VcAnnuaire" data-column="NomPrenom" data-key="VcAnnuaire.NomPrenom"></span> jusqu’à la clôture.</p>');
});
await page.waitForTimeout(300);

// Centre d'un élément et ce qui s'y trouve réellement au premier plan (un bouton recouvert par autre chose ne recevrait pas le clic).
async function hitTest(selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}
async function clickBadge() {
  const box = await hitTest('.tiptap .var-badge[data-column="NomPrenom"]');
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(250);
}

// 1) Clic réel sur la bulle : la barre apparaît, ses deux icônes sont visibles et cliquables.
await clickBadge();
const condBtn = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-condition"]');
const linkedBtn = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-linked"]');
check('clic sur une bulle Texte -> barre flottante visible avec l’icône Condition atteignable', condBtn.found && condBtn.inViewport && condBtn.onTop, condBtn);
check('... et l’icône Autres attributs atteignable', linkedBtn.found && linkedBtn.inViewport && linkedBtn.onTop, linkedBtn);

// 2) Condition : clic réel sur l'icône, la fenêtre tient dans 700x400, la valeur se tape au clavier, Enregistrer se clique.
if (condBtn.found) await page.mouse.click(condBtn.x, condBtn.y);
await page.waitForTimeout(200);
const condBox = await hitTest('#var-condition-modal .var-modal-content');
check('fenêtre de condition ouverte et entièrement dans le panneau', condBox.found && condBox.inViewport, condBox);
const toolbarHidden = await page.evaluate(() => !document.querySelector('.v2-varfmt-toolbar').classList.contains('visible'));
check('la barre flottante ne passe pas par-dessus la fenêtre', toolbarHidden);
await page.selectOption('#var-condition-modal select.macro-rule-column', 'Statut');
await page.waitForTimeout(100);
const valueField = await hitTest('#var-condition-modal .macro-rule-value');
if (valueField.found) { await page.mouse.click(valueField.x, valueField.y); await page.keyboard.type('Urgent'); }
await page.waitForTimeout(700);
const debugText = await page.evaluate(() => Array.from(document.querySelectorAll('#var-condition-modal .var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent));
check('aperçu : la ligne sélectionnée remplit la condition et affiche la valeur', debugText.length > 0 && /Dupont Jean/.test(debugText[0]), debugText);
const saveBtn = await hitTest('#var-condition-modal .var-modal-primary');
check('Enregistrer visible et non recouvert à 700x400', saveBtn.found && saveBtn.inViewport && saveBtn.onTop, saveBtn);
if (saveBtn.found) await page.mouse.click(saveBtn.x, saveBtn.y);
await page.waitForTimeout(200);
const afterSave = await page.evaluate(() => {
  let cond = null;
  EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge') cond = n.attrs.condition; });
  return { cond, modalOpen: document.getElementById('var-condition-modal').style.display !== 'none' };
});
check('Enregistrer (vrai clic) pose la condition sur la bulle et ferme la fenêtre',
  !afterSave.modalOpen && !!afterSave.cond && afterSave.cond.rules.length === 1 && afterSave.cond.rules[0].column === 'Statut' && afterSave.cond.rules[0].value === 'Urgent', afterSave);

// 2 bis) Colonne d'une table pas encore liée : le choix de la clé s'ouvre PAR-DESSUS la fenêtre de condition, ses boutons restent cliquables, et
// Annuler (vrai clic) remet la colonne précédente.
await clickBadge();
const condBtn2 = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-condition"]');
if (condBtn2.found) await page.mouse.click(condBtn2.x, condBtn2.y);
await page.waitForTimeout(200);
await page.selectOption('#var-condition-modal select.macro-rule-column', 'VcContacts.Role');
await page.waitForTimeout(300);
const keyConfirm = await hitTest('#link-config-confirm');
const keyCancel = await hitTest('#link-config-cancel');
check('choix de la clé ouvert au-dessus de la fenêtre de condition, Valider et Annuler non recouverts',
  keyConfirm.found && keyConfirm.inViewport && keyConfirm.onTop && keyCancel.inViewport && keyCancel.onTop, { keyConfirm, keyCancel });

// 2 ter) Listes de colonnes avec recherche (retour d'Antoine 2026-09-29) : vrai clic sur le champ de la table cible (16+ colonnes), le panneau tient dans
// les 400 px et sa liste défile à la molette réelle sans bouger la fenêtre, la frappe réelle filtre la liste, un vrai clic sur le résultat le choisit.
const cibleField = await hitTest('#link-config-modal .link-config-bridge-col:last-child .ss-trigger');
check('liste des colonnes de la table cible : champ visible, dans le panneau et au premier plan', cibleField.found && cibleField.inViewport && cibleField.onTop, cibleField);
if (cibleField.found) await page.mouse.click(cibleField.x, cibleField.y);
await page.waitForTimeout(150);
const PANEL = '#link-config-modal .ss-panel:not([hidden])';
const listPanel = await hitTest(PANEL);
const searchFocused = await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('ss-input'));
check('clic sur le champ : le panneau de recherche s’ouvre entièrement dans le panneau Grist, la zone de recherche a le focus', listPanel.found && listPanel.inViewport && searchFocused, { listPanel, searchFocused });
const listSizes = await page.evaluate(sel => { const l = document.querySelector(sel + ' .ss-list'); return { scrollHeight: l.scrollHeight, clientHeight: l.clientHeight, rows: l.children.length }; }, PANEL);
check('la liste défile dans le panneau quand les colonnes sont nombreuses (la fenêtre garde sa taille)', listSizes.scrollHeight > listSizes.clientHeight && listSizes.rows >= 17, listSizes);
const listBox = await hitTest(PANEL + ' .ss-list');
const before = await page.evaluate(sel => ({ panelTop: document.querySelector(sel).getBoundingClientRect().top, modalTop: document.querySelector('#link-config-modal .modal-content').getBoundingClientRect().top }), PANEL);
await page.mouse.move(listBox.x, listBox.y);
await page.mouse.wheel(0, 300);
await page.waitForTimeout(150);
const afterWheel = await page.evaluate(sel => ({
  listTop: document.querySelector(sel + ' .ss-list').scrollTop, docTop: document.scrollingElement.scrollTop, panelTop: document.querySelector(sel).getBoundingClientRect().top,
  modalTop: document.querySelector('#link-config-modal .modal-content').getBoundingClientRect().top,
}), PANEL);
check('molette réelle sur la liste : la liste défile, ni la page, ni la fenêtre, ni le panneau ne bougent',
  afterWheel.listTop > 0 && afterWheel.docTop === 0 && afterWheel.panelTop === before.panelTop && afterWheel.modalTop === before.modalTop, { before, afterWheel });
await page.keyboard.type('tel');
await page.waitForTimeout(100);
const typedRows = await page.evaluate(sel => Array.from(document.querySelectorAll(sel + ' .ss-option')).map(r => r.textContent), PANEL);
check('frappe réelle « tel » : la liste se réduit à la colonne Telephone, avec sa table entre parenthèses', typedRows.length === 1 && typedRows[0] === 'Telephone(VcContacts)', typedRows);
const resultRow = await hitTest(PANEL + ' .ss-option');
check('le résultat est visible et non recouvert', resultRow.found && resultRow.inViewport && resultRow.onTop, resultRow);
if (resultRow.found) await page.mouse.click(resultRow.x, resultRow.y);
await page.waitForTimeout(150);
const afterPick = await page.evaluate(() => ({
  value: document.getElementById('link-config-col-cible').value,
  shown: document.querySelector('#link-config-modal .link-config-bridge-col:last-child .ss-trigger').textContent,
  listOpen: !!document.querySelector('#link-config-modal .ss-panel:not([hidden])'),
  windowOpen: document.getElementById('link-config-modal').style.display !== 'none',
}));
check('vrai clic sur le résultat : la colonne est choisie, affichée dans le champ, la liste se referme et la fenêtre reste ouverte',
  afterPick.value === 'Telephone' && afterPick.shown.indexOf('Telephone') === 0 && !afterPick.listOpen && afterPick.windowOpen, afterPick);
// Liste de la table de la page (colonne source) : ouverte au clavier réel, Échap la referme SEULE (la fenêtre reste), Entrée choisit le 1er résultat.
const sourceField = await hitTest('#link-config-modal .link-config-bridge-col:first-child .ss-trigger');
if (sourceField.found) await page.mouse.click(sourceField.x, sourceField.y);
await page.waitForTimeout(150);
const sourcePanel = await hitTest(PANEL);
check('liste de la table de la page : panneau entièrement dans le panneau Grist', sourcePanel.found && sourcePanel.inViewport, sourcePanel);
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
const afterEscape = await page.evaluate(() => ({
  listOpen: !!document.querySelector('#link-config-modal .ss-panel:not([hidden])'),
  windowOpen: document.getElementById('link-config-modal').style.display !== 'none',
  focusOnField: document.activeElement === document.querySelector('#link-config-modal .link-config-bridge-col:first-child .ss-trigger'),
}));
check('Échap referme la liste seule : la fenêtre reste ouverte et le champ reprend le focus', !afterEscape.listOpen && afterEscape.windowOpen && afterEscape.focusOnField, afterEscape);
await page.keyboard.press('ArrowDown');
await page.keyboard.type('stat');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
const afterEnter = await page.evaluate(() => ({ value: document.getElementById('link-config-col-source').value, listOpen: !!document.querySelector('#link-config-modal .ss-panel:not([hidden])') }));
check('au clavier réel : ↓ ouvre, « stat » filtre, Entrée choisit Statut', afterEnter.value === 'Statut' && !afterEnter.listOpen, afterEnter);
if (keyCancel.found) await page.mouse.click(keyCancel.x, keyCancel.y);
await page.waitForTimeout(200);
const afterKeyCancel = await page.evaluate(() => ({
  column: document.querySelector('#var-condition-modal select.macro-rule-column').value,
  conditionOpen: document.getElementById('var-condition-modal').style.display !== 'none',
  keyOpen: document.getElementById('link-config-modal').style.display !== 'none',
}));
check('Annuler du choix de la clé remet la colonne précédente, fenêtre de condition toujours ouverte',
  afterKeyCancel.column === 'Statut' && afterKeyCancel.conditionOpen && !afterKeyCancel.keyOpen, afterKeyCancel);
const condCancel = await hitTest('#var-condition-modal .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
if (condCancel.found) await page.mouse.click(condCancel.x, condCancel.y);
await page.waitForTimeout(200);

// 3) Autres attributs : clic réel sur l'icône, cocher Téléphone à la souris, Insérer.
await clickBadge();
const linkedBtn2 = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-linked"]');
if (linkedBtn2.found) await page.mouse.click(linkedBtn2.x, linkedBtn2.y);
await page.waitForTimeout(400);
const linkedBox = await hitTest('#var-linked-modal .var-modal-content');
check('fenêtre des autres attributs ouverte et entièrement dans le panneau', linkedBox.found && linkedBox.inViewport, linkedBox);
const telRow = await hitTest('#var-linked-modal .var-linked-row[data-col="Telephone"]');
check('ligne Telephone visible et cliquable', telRow.found && telRow.inViewport && telRow.onTop, telRow);
if (telRow.found) await page.mouse.click(telRow.x, telRow.y);
await page.waitForTimeout(100);
const insertBtn = await hitTest('#var-linked-modal .var-modal-primary');
const insertState = await page.evaluate(() => {
  const b = document.querySelector('#var-linked-modal .var-modal-primary');
  return b ? { disabled: b.disabled, text: b.textContent } : null;
});
check('Insérer visible, non recouvert et actif après un clic sur la ligne', insertBtn.found && insertBtn.inViewport && insertBtn.onTop && insertState && !insertState.disabled, { insertBtn, insertState });
if (insertBtn.found) await page.mouse.click(insertBtn.x, insertBtn.y);
await page.waitForTimeout(200);
const seq = await page.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.firstChild.forEach(n => out.push(n.type.name === 'varBadge' ? '#' + n.attrs.key : n.text));
  return out;
});
check('Insérer (vrai clic) ajoute #VcAnnuaire.Telephone juste après la variable', JSON.stringify(seq) === JSON.stringify(['Dossier suivi par ', '#VcAnnuaire.NomPrenom', ' ', '#VcAnnuaire.Telephone', ' jusqu’à la clôture.']), seq);
// 3b) Descente de référence en référence (retour d'Antoine du 2026-09-29) : dans « Autres attributs », la flèche d'une colonne Référence ouvre les colonnes
// de la table qu'elle désigne (fil d'Ariane pour remonter), les cases se gardent d'un niveau à l'autre, et la bulle insérée porte le chemin
// (#VcAnnuaire.Service.Nom). Tout à la vraie souris à 700x400 : flèche visible et au premier plan, fenêtre dans le panneau, pas de débordement de page.
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('VcServices', { Nom: 'Text', Responsable: 'Text' });
  stub.setRows('VcServices', [{ id: 3, Nom: 'Juridique', Responsable: 'Me Lefevre' }, { id: 4, Nom: 'Fiscal', Responsable: 'Me Roux' }]);
  stub.setVariables('VcAnnuaire', { NomPrenom: 'Text', Telephone: 'Text', Naissance: 'Date', Service: 'Ref:VcServices', gristHelper_Display: 'Text' }, null, { Service: 'gristHelper_Display' });
  stub.setRows('VcAnnuaire', [
    { id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44', Naissance: 631152000, Service: 3, gristHelper_Display: 'Juridique' },
    { id: 8, NomPrenom: 'Martin Anne', Telephone: '06 55 66 77 88', Naissance: 662688000, Service: 4, gristHelper_Display: 'Fiscal' },
  ]);
  await GristAPI.refreshSchema();
  const badge = col => `<span class="var-badge" data-table="VcAnnuaire" data-column="${col}" data-key="VcAnnuaire.${col}"></span>`;
  Editor.setHTML(`<p>Suivi par ${badge('NomPrenom')} jusqu’au bout.</p><p>Service : ${badge('Service')}</p>`);
});
await page.waitForTimeout(300);
async function openLinkedFor(column) {
  const box = await hitTest(`.tiptap .var-badge[data-column="${column}"]`);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(250);
  const icon = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-linked"]');
  if (icon.found) await page.mouse.click(icon.x, icon.y);
  await page.waitForTimeout(400);
}
const linkedState = () => page.evaluate(() => {
  const modal = document.getElementById('var-linked-modal');
  const nav = modal.querySelector('.var-linked-path');
  const box = modal.querySelector('.var-modal-content').getBoundingClientRect();
  return {
    open: modal.style.display !== 'none', title: modal.querySelector('h3').textContent,
    cols: Array.from(modal.querySelectorAll('.var-linked-row')).map(r => r.dataset.col),
    arrows: Array.from(modal.querySelectorAll('.var-linked-row')).filter(r => r.querySelector('.var-linked-descend')).map(r => r.dataset.col),
    crumbsHidden: nav.hidden, crumbs: Array.from(nav.querySelectorAll('.var-linked-crumb')).map(c => c.textContent),
    checked: Array.from(modal.querySelectorAll('.var-linked-row input:checked')).map(i => i.value),
    insert: modal.querySelector('.var-modal-primary').textContent, filterFocused: document.activeElement === modal.querySelector('.var-linked-filter'),
    inViewport: box.left >= 0 && box.top >= 0 && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5,
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
});
const overflowBeforeDescent = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
await openLinkedFor('NomPrenom');
const level0 = await linkedState();
check('Autres attributs sur #VcAnnuaire.NomPrenom : la colonne Référence Service a une flèche, les autres colonnes non',
  level0.open && level0.title.includes('VcAnnuaire') && JSON.stringify(level0.arrows) === JSON.stringify(['Service']) && level0.crumbsHidden, level0);
const arrow = await hitTest('#var-linked-modal .var-linked-row[data-col="Service"] .var-linked-descend');
check('la flèche de Service est visible, assez large pour la souris et au premier plan (pas recouverte par la ligne)',
  arrow.found && arrow.inViewport && arrow.onTop && arrow.right - arrow.left >= 24, arrow);
const telephone = await hitTest('#var-linked-modal .var-linked-row[data-col="Telephone"] .var-linked-pick');
if (telephone.found) await page.mouse.click(telephone.x, telephone.y);
await page.waitForTimeout(80);
if (arrow.found) await page.mouse.click(arrow.x, arrow.y);
await page.waitForTimeout(350);
const level1 = await linkedState();
check('un vrai clic sur la flèche ouvre les colonnes de VcServices : fil d’Ariane VcAnnuaire › Service, focus sur le filtre, fenêtre dans le panneau, page sans débordement',
  level1.title.includes('VcServices') && JSON.stringify(level1.cols) === JSON.stringify(['Nom', 'Responsable']) && !level1.crumbsHidden
  && JSON.stringify(level1.crumbs) === JSON.stringify(['VcAnnuaire', 'Service']) && level1.filterFocused && level1.inViewport && level1.overflow <= overflowBeforeDescent, { level1, overflowBeforeDescent });
check('la case Telephone cochée au niveau du dessus compte déjà, et le clic sur la flèche n’a pas coché Service',
  level1.insert.includes('1') && !level1.checked.includes('Service'), level1);
const crumb = await hitTest('#var-linked-modal .var-linked-path button.var-linked-crumb');
check('le bouton VcAnnuaire du fil d’Ariane est visible et au premier plan', crumb.found && crumb.inViewport && crumb.onTop, crumb);
const nomRow = await hitTest('#var-linked-modal .var-linked-row[data-col="Nom"] .var-linked-pick');
if (nomRow.found) await page.mouse.click(nomRow.x, nomRow.y);
await page.waitForTimeout(80);
if (crumb.found) await page.mouse.click(crumb.x, crumb.y);
await page.waitForTimeout(350);
const backUp = await linkedState();
check('remonter par le fil d’Ariane (vrai clic) revient sur VcAnnuaire, Telephone toujours coché, 2 attributs comptés, fil d’Ariane caché',
  backUp.title.includes('VcAnnuaire') && backUp.crumbsHidden && JSON.stringify(backUp.checked) === JSON.stringify(['Telephone']) && backUp.insert.includes('2'), backUp);
const insertDescent = await hitTest('#var-linked-modal .var-modal-primary');
check('Insérer visible, au premier plan et actif après la descente', insertDescent.found && insertDescent.inViewport && insertDescent.onTop, insertDescent);
if (insertDescent.found) await page.mouse.click(insertDescent.x, insertDescent.y);
await page.waitForTimeout(250);
const seqDescent = await page.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.firstChild.forEach(n => out.push(n.type.name === 'varBadge' ? '#' + n.attrs.key : n.text));
  return out;
});
check('Insérer (vrai clic) ajoute #VcAnnuaire.Telephone puis le chemin #VcAnnuaire.Service.Nom, sans lien pour VcServices',
  JSON.stringify(seqDescent) === JSON.stringify(['Suivi par ', '#VcAnnuaire.NomPrenom', ' ', '#VcAnnuaire.Telephone', ' ', '#VcAnnuaire.Service.Nom', ' jusqu’au bout.'])
  && await page.evaluate(() => !GristAPI.getLinkRule('VcServices')), seqDescent);
const pathText = await page.evaluate(async () => {
  const box = document.createElement('div');
  box.innerHTML = await ReaderMode.preview(Editor.getHTML(), 'VcDossiers', GristAPI.getCurrentRecord());
  return box.textContent;
});
check('la bulle en chemin se lit : Dupont Jean 06 11 22 33 44 Juridique', pathText.includes('Dupont Jean 06 11 22 33 44 Juridique'), pathText);
// Variable elle-même Référence : la fenêtre s'ouvre d'emblée sur la ligne qu'elle désigne ; Échap (vrai clavier) la ferme sans rien insérer.
await openLinkedFor('Service');
const onReference = await linkedState();
check('Autres attributs sur #VcAnnuaire.Service (une Référence) : ouverte sur les colonnes de VcServices, fil d’Ariane VcAnnuaire › Service',
  onReference.open && onReference.title.includes('VcServices') && JSON.stringify(onReference.cols) === JSON.stringify(['Nom', 'Responsable'])
  && JSON.stringify(onReference.crumbs) === JSON.stringify(['VcAnnuaire', 'Service']) && onReference.inViewport, onReference);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const afterEscapeOnReference = await page.evaluate(() => ({
  open: document.getElementById('var-linked-modal').style.display !== 'none',
  badges: (() => { let n = 0; EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'varBadge') n += 1; }); return n; })(),
}));
check('Échap (vrai clavier) ferme la fenêtre sans rien insérer', !afterEscapeOnReference.open && afterEscapeOnReference.badges === 4, afterEscapeOnReference);
// 4) Boucle (maquette validée le 2026-09-28) : 3e icône de la barre, sur une variable d'une cellule de tableau, en aperçu A4 (réglage par défaut du
// widget) - l'icône est atteignable, la barre ne fait pas déborder la page, la fenêtre tient dans le panneau et « Enregistrer » se clique ; l'onglet de
// la ligne répétée reste dans la partie visible de l'éditeur ; dans cette ligne, la Boucle d'une autre variable est grisée.
const overflowBefore = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('VcTaches', { Dossier: 'Ref:VcDossiers', Libelle: 'Text', Echeance: 'Date' });
  stub.setRows('VcTaches', [
    { id: 1, Dossier: 1, Libelle: 'Relancer le client', Echeance: 1790208000 },
    { id: 2, Dossier: 1, Libelle: 'Préparer l’audience', Echeance: 1790812800 },
    { id: 3, Dossier: 2, Libelle: 'Archiver', Echeance: 1791417600 },
  ]);
  await GristAPI.refreshSchema();
  await GristAPI.saveLinkRule('VcTaches', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
  document.getElementById('editor-container').classList.add('a4-preview');
  const badge = col => `<span class="var-badge" data-table="VcTaches" data-column="${col}" data-key="VcTaches.${col}"></span>`;
  Editor.setHTML('<p>Tâches du dossier :</p><table><tbody><tr><th><p>Tâche</p></th><th><p>Échéance</p></th></tr>'
    + `<tr><td><p>${badge('Libelle')}</p></td><td><p>${badge('Echeance')}</p></td></tr></tbody></table>`);
});
await page.waitForTimeout(300);
const taskBadge = await hitTest('.tiptap td .var-badge[data-column="Libelle"]');
check('bulle d’une cellule de tableau visible dans le panneau (aperçu A4)', taskBadge.found && taskBadge.inViewport && taskBadge.onTop, taskBadge);
if (taskBadge.found) await page.mouse.click(taskBadge.x, taskBadge.y);
await page.waitForTimeout(250);
const loopBtn = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-loop"]');
const loopBtnState = await page.evaluate(() => {
  const b = document.querySelector('.v2-varfmt-toolbar button[data-action="var-loop"]');
  const bar = document.querySelector('.v2-varfmt-toolbar.visible');
  const r = bar ? bar.getBoundingClientRect() : null;
  return { disabled: b && b.getAttribute('aria-disabled'), bar: r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, overflow: document.documentElement.scrollWidth - innerWidth };
});
check('icône Boucle (3e de la barre) visible, au premier plan et active pour une variable liée à plusieurs lignes',
  loopBtn.found && loopBtn.inViewport && loopBtn.onTop && loopBtnState.disabled === 'false', { loopBtn, loopBtnState });
check('la barre à trois icônes tient dans le panneau, sans débordement de page en plus',
  !!loopBtnState.bar && loopBtnState.bar.left >= 0 && loopBtnState.bar.right <= WIDTH && loopBtnState.bar.top >= 0 && loopBtnState.bar.bottom <= HEIGHT
  && loopBtnState.overflow <= overflowBefore, { loopBtnState, overflowBefore });
if (loopBtn.found) await page.mouse.click(loopBtn.x, loopBtn.y);
await page.waitForTimeout(700);
const loopBox = await hitTest('#var-loop-modal .var-modal-content');
check('fenêtre Boucle ouverte et entièrement dans le panneau', loopBox.found && loopBox.inViewport, loopBox);
const loopPreview = await page.evaluate(() => Array.from(document.querySelectorAll('#var-loop-modal .var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent));
check('aperçu : les deux tâches du dossier sélectionné', loopPreview.length > 0 && /Relancer le client/.test(loopPreview[0]) && /Préparer l’audience/.test(loopPreview[0]), loopPreview);
// « Trier par » et « Si aucune ligne » se partagent la largeur de la fenêtre : chaque liste doit montrer son choix en entier (« Ordre de la table »
// y était coupé en « Ordre de la ta »). Largeur naturelle mesurée sur un clone réduit à l'option choisie et posé dans le même parent, donc avec la
// même police.
const loopSelects = await page.evaluate(() => ['#var-loop-sort', '.var-loop-sort-row select:last-child', '#var-loop-empty'].map(sel => {
  const el = document.querySelector('#var-loop-modal ' + sel);
  const clone = el.cloneNode(false);
  clone.removeAttribute('id');
  clone.appendChild(new Option(el.options[el.selectedIndex].text));
  Object.assign(clone.style, { position: 'absolute', visibility: 'hidden', width: 'auto', flex: 'none' });
  el.parentNode.appendChild(clone);
  const natural = clone.getBoundingClientRect().width;
  clone.remove();
  return { sel, text: el.options[el.selectedIndex].text, width: el.getBoundingClientRect().width, natural };
}));
check('listes « Trier par », sens du tri et « Si aucune ligne » : le choix affiché n’est pas coupé', loopSelects.every(s => s.natural <= s.width + 0.5), loopSelects);
const loopSave = await hitTest('#var-loop-modal .var-modal-primary');
check('Enregistrer de la fenêtre Boucle visible et non recouvert à 700x400', loopSave.found && loopSave.inViewport && loopSave.onTop, loopSave);
if (loopSave.found) await page.mouse.click(loopSave.x, loopSave.y);
await page.waitForTimeout(250);
const afterLoop = await page.evaluate(() => {
  let loop = null;
  EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge' && n.attrs.column === 'Libelle') loop = n.attrs.loop; });
  const td = document.querySelector('.tiptap tr:nth-child(2) > td');
  const r = td.getBoundingClientRect();
  const tab = getComputedStyle(td, '::before');
  return {
    loop, modalOpen: document.getElementById('var-loop-modal').style.display !== 'none', tint: getComputedStyle(td).backgroundColor,
    tabContent: tab.content, tabLeft: r.left - 30, editorLeft: document.getElementById('editor-container').getBoundingClientRect().left,
  };
});
check('Enregistrer (vrai clic) pose la boucle « ligne du tableau » et ferme la fenêtre',
  !afterLoop.modalOpen && !!afterLoop.loop && afterLoop.loop.repeat === 'row' && afterLoop.loop.table === 'VcTaches', afterLoop);
check('repère de la ligne répétée : teinte, onglet dans la partie visible de l’éditeur',
  afterLoop.tint === 'rgb(245, 249, 255)' && afterLoop.tabContent !== 'none' && afterLoop.tabLeft >= afterLoop.editorLeft, afterLoop);
const echeance = await hitTest('.tiptap td .var-badge[data-column="Echeance"]');
if (echeance.found) await page.mouse.click(echeance.x, echeance.y);
await page.waitForTimeout(250);
const nestedBtn = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-loop"]');
if (nestedBtn.found) await page.mouse.click(nestedBtn.x, nestedBtn.y);
await page.waitForTimeout(200);
const nestedState = await page.evaluate(() => ({
  disabled: document.querySelector('.v2-varfmt-toolbar button[data-action="var-loop"]').getAttribute('aria-disabled'),
  modalOpen: document.getElementById('var-loop-modal').style.display !== 'none',
}));
check('dans la ligne répétée, la Boucle d’une autre variable est grisée et un vrai clic n’ouvre rien', nestedBtn.found && nestedState.disabled === 'true' && !nestedState.modalOpen, { nestedBtn, nestedState });

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
