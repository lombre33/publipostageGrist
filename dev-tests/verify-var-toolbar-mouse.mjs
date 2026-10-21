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
// Choisit une colonne dans le champ d'une règle comme le fait une personne : clic sur le champ visible (le <select> est masqué par la liste avec recherche,
// js/search-select.js), frappe du nom, clic sur la ligne au nom exact. Rend faux si la ligne n'est pas dans la liste.
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
check('colonne Statut choisie à la vraie souris dans la liste avec recherche', await pickColumn('#var-condition-modal', 'Statut'));
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
check('colonne VcContacts.Role choisie à la vraie souris dans la liste avec recherche', await pickColumn('#var-condition-modal', 'VcContacts.Role'));
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
// même police. « Trier par » est un champ avec recherche : son <select> reste masqué, le champ visible coupe son texte par des points de suspension
// (`.ss-value`) - on y compare la largeur du texte à celle du champ.
const loopSelects = await page.evaluate(() => ['#var-loop-sort', '.var-loop-sort-row select:last-child', '#var-loop-empty'].map(sel => {
  const el = document.querySelector('#var-loop-modal ' + sel);
  const searchField = el.style.display === 'none' && el.nextElementSibling ? el.nextElementSibling.querySelector('.ss-value') : null;
  if (searchField) return { sel, text: el.options[el.selectedIndex].text, width: searchField.clientWidth, natural: searchField.scrollWidth };
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

// 4 bis) Boucle dans une boucle (demande d'Antoine du 2026-10-09, point 5.2) : dans la ligne répétée des tâches, les notes de chaque tâche - rattachées à la
// tâche par une colonne Référence (aucune règle de liaison) - se répètent en liste dans la seconde case. Deux colonnes de VcNotes mènent à VcTaches (Tache,
// Auteur) : la fenêtre en montre la liste avec recherche. À la vraie souris et à 700x400 : l'icône de la bulle de la case est atteignable, la fenêtre et sa
// liste tiennent dans le panneau, le choix de la colonne change l'aperçu, « Enregistrer » écrit table englobante et colonne ; l'icône d'une variable sans
// colonne vers la tâche reste grisée avec sa raison.
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('VcNotes', { Tache: 'Ref:VcTaches', Auteur: 'Ref:VcTaches', Texte: 'Text' });
  stub.setRows('VcNotes', [
    { id: 1, Tache: 1, Auteur: 2, Texte: 'Appeler le greffe' },
    { id: 2, Tache: 1, Auteur: 1, Texte: 'Relire les pièces' },
    { id: 3, Tache: 2, Auteur: 1, Texte: 'Signer' },
  ]);
  await GristAPI.refreshSchema();
  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const badge = (table, col, loop) => `<span class="var-badge" data-table="${table}" data-column="${col}" data-key="${table}.${col}"${loop ? attr('data-loop', loop) + ` data-loop-repeat="${loop.repeat}"` : ''}></span>`;
  document.getElementById('editor-container').classList.add('a4-preview');
  Editor.setHTML('<p>Tâches du dossier :</p><table><tbody><tr><th><p>Tâche</p></th><th><p>Notes</p></th></tr>'
    + `<tr><td><p>${badge('VcTaches', 'Libelle', { repeat: 'row', table: 'VcTaches', empty: 'header' })}</p></td>`
    + `<td><ul><li><p>${badge('VcNotes', 'Texte')}</p></li></ul><p>${badge('VcDossiers', 'Titre')}</p></td></tr></tbody></table>`);
});
await page.waitForTimeout(300);
const noteBadge = await hitTest('.tiptap td .var-badge[data-column="Texte"]');
check('bulle de la liste, dans la case de la ligne répétée, visible dans le panneau', noteBadge.found && noteBadge.inViewport && noteBadge.onTop, noteBadge);
if (noteBadge.found) await page.mouse.click(noteBadge.x, noteBadge.y);
await page.waitForTimeout(250);
const nestedIcon = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-loop"]');
const nestedIconState = await page.evaluate(() => {
  const b = document.querySelector('.v2-varfmt-toolbar button[data-action="var-loop"]');
  return { disabled: b.getAttribute('aria-disabled'), title: b.title, expected: I18n.t('varToolbar.loop') };
});
check('dans la ligne répétée, la Boucle d’une variable rattachée à la tâche est active et atteignable à la souris',
  nestedIcon.found && nestedIcon.inViewport && nestedIcon.onTop && nestedIconState.disabled === 'false' && nestedIconState.title === nestedIconState.expected, { nestedIcon, nestedIconState });
if (nestedIcon.found) await page.mouse.click(nestedIcon.x, nestedIcon.y);
await page.waitForTimeout(700);
const nestedBox = await hitTest('#var-loop-modal .var-modal-content');
check('fenêtre Boucle d’une boucle dans une boucle ouverte et entièrement dans le panneau', nestedBox.found && nestedBox.inViewport, nestedBox);
const nestedInfo = () => page.evaluate(() => {
  const m = document.getElementById('var-loop-modal');
  const src = m.querySelector('.var-loop-source');
  const by = m.querySelector('.var-loop-by');
  const trigger = by && by.querySelector('.ss-trigger');
  const link = m.querySelector('.var-loop-link');
  const r = src.getBoundingClientRect();
  return {
    text: src.children[0].textContent,
    expected: I18n.t('varLoop.source.withinPick', { table: 'VcNotes', within: 'VcTaches' }),
    pickShown: !!by && by.getClientRects().length > 0, triggerText: trigger ? trigger.textContent : null,
    linkShown: link.getClientRects().length > 0,
    sourceInside: r.left >= 0 && r.right <= innerWidth + 0.5, triggerInside: !!trigger && trigger.getBoundingClientRect().right <= innerWidth + 0.5 && trigger.getBoundingClientRect().left >= 0,
    lines: Array.from(m.querySelectorAll('.var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent),
    segs: Array.from(m.querySelectorAll('.var-loop-seg button')).map(b => b.dataset.repeat + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')),
  };
});
const nestedFirst = await nestedInfo();
check('la fenêtre dit « lignes rattachées à chaque ligne de VcTaches par », sans « Modifier le lien », et montre la liste des deux colonnes',
  nestedFirst.text === nestedFirst.expected && nestedFirst.pickShown && !nestedFirst.linkShown && /Tache/.test(nestedFirst.triggerText || '') && nestedFirst.sourceInside && nestedFirst.triggerInside, nestedFirst);
check('« L’élément de liste » est choisi d’office, la ligne répétée de la case n’est pas proposée', JSON.stringify(nestedFirst.segs) === JSON.stringify(['item*', 'inline']), nestedFirst.segs);
check('aperçu sur la première tâche qui a des notes (colonne Tache) : deux notes', nestedFirst.lines.length > 0 && /Appeler le greffe, Relire les pièces/.test(nestedFirst.lines[0]) && /n° 1/.test(nestedFirst.lines[0]), nestedFirst.lines);
// La liste avec recherche à la vraie souris : clic sur le champ, clic sur la ligne « Auteur ».
const byTrigger = await hitTest('#var-loop-modal .var-loop-by .ss-trigger');
check('le champ « par » est atteignable à la souris', byTrigger.found && byTrigger.inViewport && byTrigger.onTop, byTrigger);
if (byTrigger.found) await page.mouse.click(byTrigger.x, byTrigger.y);
await page.waitForTimeout(250);
const authorRow = await page.evaluate(() => {
  const panel = Array.from(document.querySelectorAll('.ss-panel')).find(p => !p.hidden);
  const rows = panel ? Array.from(panel.querySelectorAll('.ss-option')) : [];
  const found = rows.find(r => r.querySelector('.ss-name').textContent === 'Auteur');
  if (!found) return { names: rows.map(r => r.querySelector('.ss-name').textContent) };
  const r = found.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: !!top && found.contains(top), inViewport: r.top >= 0 && r.bottom <= innerHeight + 0.5, names: rows.map(x => x.querySelector('.ss-name').textContent) };
});
check('la liste montre les deux colonnes qui mènent à la tâche, « Auteur » atteignable', !!authorRow.x && authorRow.onTop && authorRow.inViewport && JSON.stringify(authorRow.names) === JSON.stringify(['Tache', 'Auteur']), authorRow);
if (authorRow.x) await page.mouse.click(authorRow.x, authorRow.y);
await page.waitForTimeout(800);
const nestedSecond = await nestedInfo();
check('choisir « Auteur » change l’aperçu : les notes de la tâche 1 écrites par l’auteur 1', /Relire les pièces/.test(nestedSecond.lines[0] || '') && !/Appeler le greffe/.test(nestedSecond.lines[0] || '') && /Auteur/.test(nestedSecond.triggerText || ''), nestedSecond);
const nestedSave = await hitTest('#var-loop-modal .var-modal-primary');
check('Enregistrer de la fenêtre visible et non recouvert à 700x400', nestedSave.found && nestedSave.inViewport && nestedSave.onTop, nestedSave);
if (nestedSave.found) await page.mouse.click(nestedSave.x, nestedSave.y);
await page.waitForTimeout(300);
const nestedSaved = await page.evaluate(() => {
  let loop = null;
  EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge' && n.attrs.column === 'Texte') loop = n.attrs.loop; });
  const li = document.querySelector('.tiptap td li');
  return { loop, modalOpen: document.getElementById('var-loop-modal').style.display !== 'none', liMarked: !!li && !!document.querySelector('.tiptap td li .var-badge[data-loop-repeat="item"]') };
});
check('Enregistrer (vrai clic) écrit la boucle avec la table de la zone et la colonne choisie, et ferme la fenêtre',
  !nestedSaved.modalOpen && !!nestedSaved.loop && nestedSaved.loop.repeat === 'item' && nestedSaved.loop.table === 'VcNotes' && nestedSaved.loop.within === 'VcTaches' && nestedSaved.loop.by === 'Auteur', nestedSaved);
// Une variable de la même case dont la table n'a aucune colonne vers la tâche : la Boucle reste grisée, avec sa raison.
const titleBadge = await hitTest('.tiptap td .var-badge[data-column="Titre"]');
if (titleBadge.found) await page.mouse.click(titleBadge.x, titleBadge.y);
await page.waitForTimeout(250);
const noWayIcon = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-loop"]');
if (noWayIcon.found) await page.mouse.click(noWayIcon.x, noWayIcon.y);
await page.waitForTimeout(200);
const noWayState = await page.evaluate(() => {
  const b = document.querySelector('.v2-varfmt-toolbar button[data-action="var-loop"]');
  return { disabled: b.getAttribute('aria-disabled'), title: b.title, expected: I18n.t('varToolbar.loopNestedNone', { table: 'VcDossiers', within: 'VcTaches' }), modalOpen: document.getElementById('var-loop-modal').style.display !== 'none' };
});
check('une variable sans colonne qui mène à la tâche : Boucle grisée avec sa raison, un vrai clic n’ouvre rien', noWayIcon.found && noWayState.disabled === 'true' && noWayState.title === noWayState.expected && !noWayState.modalOpen, noWayState);
// En anglais : mêmes phrases, dans la langue de l'interface.
await page.evaluate(() => I18n.setLang('en'));
await page.waitForTimeout(200);
// La barre de « Titre » (ouverte plus haut) recouvre le bas de la bulle de la liste : un clic dans le texte au-dessus la ferme, comme pour une personne.
const introText = await hitTest('.tiptap > p:first-child');
if (introText.found) await page.mouse.click(introText.left + 10, introText.y);
await page.waitForTimeout(250);
const noteBadgeEn = await hitTest('.tiptap td .var-badge[data-column="Texte"]');
if (noteBadgeEn.found) await page.mouse.click(noteBadgeEn.x, noteBadgeEn.y);
await page.waitForTimeout(250);
const iconEn = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-loop"]');
if (iconEn.found) await page.mouse.click(iconEn.x, iconEn.y);
await page.waitForTimeout(700);
const english = await page.evaluate(() => {
  const m = document.getElementById('var-loop-modal');
  const src = m.querySelector('.var-loop-source');
  return {
    text: src.children[0].textContent, lines: Array.from(m.querySelectorAll('.var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent),
    inside: m.querySelector('.var-modal-content').getBoundingClientRect().right <= innerWidth + 0.5, open: m.style.display !== 'none', lang: I18n.getLang(),
  };
});
english.badge = noteBadgeEn;
english.icon = iconEn;
check('en anglais : la phrase de la source et l’aperçu sont traduits et tiennent dans le panneau',
  english.text === 'Rows of “VcNotes” attached to each row of “VcTaches” by' && /^Example, row #1 of “VcTaches”: /.test(english.lines[0] || '') && english.inside, english);
const cancelEn = await hitTest('#var-loop-modal .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
if (cancelEn.found) await page.mouse.click(cancelEn.x, cancelEn.y);
await page.waitForTimeout(200);
await page.evaluate(() => I18n.setLang('fr'));
await page.waitForTimeout(200);

// 4 ter) Boucle sur TOUTES les lignes (demande d'Antoine du 2026-10-20) : une colonne ordinaire de la page - la Boucle y était grisée - parcourt la vue Grist du
// widget ou toute la table, sans lien. À la vraie souris et à 700x400 : l'icône est active et atteignable, la fenêtre et sa liste « Comme la vue Grist / Toute la
// table » tiennent dans le panneau (texte non coupé, en français et en anglais), le choix change l'aperçu, « Enregistrer » écrit `all` ; dans la ligne répétée,
// la Boucle d'une autre variable de la ligne reste grisée.
await page.evaluate(() => {
  const badge = col => `<span class="var-badge" data-table="VcDossiers" data-column="${col}" data-key="VcDossiers.${col}"></span>`;
  document.getElementById('editor-container').classList.add('a4-preview');
  Editor.setHTML('<p>Tous les dossiers :</p><table><tbody><tr><th><p>Dossier</p></th><th><p>Statut</p></th></tr>'
    + `<tr><td><p>${badge('Titre')}</p></td><td><p>${badge('Statut')}</p></td></tr></tbody></table>`);
});
await page.waitForTimeout(300);
const allBadge = await hitTest('.tiptap td .var-badge[data-column="Titre"]');
if (allBadge.found) await page.mouse.click(allBadge.x, allBadge.y);
await page.waitForTimeout(250);
const allIcon = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-loop"]');
const allIconState = await page.evaluate(() => {
  const b = document.querySelector('.v2-varfmt-toolbar button[data-action="var-loop"]');
  return { disabled: b.getAttribute('aria-disabled'), title: b.title, expected: I18n.t('varToolbar.loop') };
});
check('colonne ordinaire de la page (VcDossiers.Titre) : la Boucle n’est plus grisée, atteignable à la souris, info-bulle « pour chaque ligne »',
  allIcon.found && allIcon.inViewport && allIcon.onTop && allIconState.disabled === 'false' && allIconState.title === allIconState.expected, { allIcon, allIconState });
if (allIcon.found) await page.mouse.click(allIcon.x, allIcon.y);
await page.waitForTimeout(700);
const allBox = await hitTest('#var-loop-modal .var-modal-content');
check('fenêtre Boucle sur toutes les lignes ouverte et entièrement dans le panneau', allBox.found && allBox.inViewport, allBox);
const allInfo = () => page.evaluate(() => {
  const m = document.getElementById('var-loop-modal');
  const select = m.querySelector('#var-loop-scope');
  const clone = select.cloneNode(false);
  clone.removeAttribute('id');
  clone.appendChild(new Option(select.options[select.selectedIndex].text));
  Object.assign(clone.style, { position: 'absolute', visibility: 'hidden', width: 'auto', flex: 'none' });
  select.parentNode.appendChild(clone);
  const natural = clone.getBoundingClientRect().width;
  clone.remove();
  const box = select.getBoundingClientRect();
  return {
    choiceHidden: m.querySelector('.var-loop-source-seg').getClientRects().length === 0,
    text: m.querySelector('.var-loop-source').children[0].textContent,
    scopeShown: select.getClientRects().length > 0, scope: select.value, shown: select.options[select.selectedIndex].text,
    fits: natural <= box.width + 0.5, inside: box.left >= 0 && box.right <= innerWidth + 0.5, widths: { natural, select: box.width, source: m.querySelector('.var-loop-source').getBoundingClientRect().width, text: m.querySelector('.var-loop-source').children[0].getBoundingClientRect().width, scopeBox: select.parentNode.getBoundingClientRect().width },
    lines: Array.from(m.querySelectorAll('.var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent),
    expectedText: I18n.t('varLoop.source.allPage', { table: 'VcDossiers' }),
  };
});
const allFirst = await allInfo();
check('une seule source (aucune ligne rattachée) : pas de choix « Rattachées », « Lignes de VcDossiers : » et la liste « Comme la vue Grist » choisie d’office',
  allFirst.choiceHidden && allFirst.text === allFirst.expectedText && allFirst.scopeShown && allFirst.scope === 'view' && allFirst.shown === await page.evaluate(() => I18n.t('varLoop.scope.view')), allFirst);
check('la liste « Comme la vue Grist » montre son choix en entier et tient dans la fenêtre', allFirst.fits && allFirst.inside, allFirst);
check('aperçu : les deux dossiers de la vue Grist', allFirst.lines.length > 0 && /Vue Grist de « VcDossiers » : 2 lignes sur 2/.test(allFirst.lines[0]) && /Dossier A, Dossier B/.test(allFirst.lines[0]), allFirst.lines);
const scopeField = await hitTest('#var-loop-modal #var-loop-scope');
check('la liste du choix des lignes est atteignable à la souris (au premier plan, dans le panneau)', scopeField.found && scopeField.inViewport && scopeField.onTop, scopeField);
await page.selectOption('#var-loop-modal #var-loop-scope', 'table');
await page.waitForTimeout(800);
const allSecond = await allInfo();
check('« Toute la table » : le choix change l’aperçu (« Toute la table VcDossiers : 2 lignes ») et tient dans la fenêtre',
  allSecond.scope === 'table' && /Toute la table « VcDossiers » : 2 lignes/.test(allSecond.lines[0] || '') && allSecond.fits && allSecond.inside, allSecond);
await page.evaluate(() => I18n.setLang('en'));
await page.evaluate(() => { VariableLoop.open(EditorCore.getEditor(), (() => { let at = 0; EditorCore.getEditor().state.doc.descendants((n, pos) => { if (n.type.name === 'varBadge' && n.attrs.column === 'Titre') at = pos; }); return at; })()); });
await page.waitForTimeout(700);
const allEnglish = await allInfo();
check('en anglais : la phrase et la liste sont traduites, entières et dans le panneau', allEnglish.text === 'Rows of “VcDossiers”:' && /^As the Grist view/.test(allEnglish.shown) && allEnglish.fits && allEnglish.inside
  && /^Grist view of “VcDossiers”: 2 of 2 rows\./.test(allEnglish.lines[0] || ''), allEnglish);
await page.evaluate(() => I18n.setLang('fr'));
await page.waitForTimeout(200);
await page.evaluate(() => VariableLoop.open(EditorCore.getEditor(), (() => { let at = 0; EditorCore.getEditor().state.doc.descendants((n, pos) => { if (n.type.name === 'varBadge' && n.attrs.column === 'Titre') at = pos; }); return at; })()));
await page.waitForTimeout(700);
await page.selectOption('#var-loop-modal #var-loop-scope', 'table');
await page.waitForTimeout(400);
const allSave = await hitTest('#var-loop-modal .var-modal-primary');
check('Enregistrer de la fenêtre visible et non recouvert à 700x400', allSave.found && allSave.inViewport && allSave.onTop, allSave);
if (allSave.found) await page.mouse.click(allSave.x, allSave.y);
await page.waitForTimeout(300);
const allSaved = await page.evaluate(() => {
  let loop = null;
  EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge' && n.attrs.column === 'Titre') loop = n.attrs.loop; });
  const td = document.querySelector('.tiptap tr:nth-child(2) > td');
  return { loop, modalOpen: document.getElementById('var-loop-modal').style.display !== 'none', tint: getComputedStyle(td).backgroundColor };
});
check('Enregistrer (vrai clic) écrit la boucle « ligne du tableau » sur toute la table et ferme la fenêtre ; la ligne est teintée',
  !allSaved.modalOpen && !!allSaved.loop && allSaved.loop.repeat === 'row' && allSaved.loop.table === 'VcDossiers' && allSaved.loop.all === 'table' && allSaved.tint === 'rgb(245, 249, 255)', allSaved);
const statutBadge = await hitTest('.tiptap td .var-badge[data-column="Statut"]');
if (statutBadge.found) await page.mouse.click(statutBadge.x, statutBadge.y);
await page.waitForTimeout(250);
const statutIcon = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-loop"]');
if (statutIcon.found) await page.mouse.click(statutIcon.x, statutIcon.y);
await page.waitForTimeout(200);
const statutState = await page.evaluate(() => ({
  disabled: document.querySelector('.v2-varfmt-toolbar button[data-action="var-loop"]').getAttribute('aria-disabled'),
  title: document.querySelector('.v2-varfmt-toolbar button[data-action="var-loop"]').title, expected: I18n.t('varToolbar.loopNested', { table: 'VcDossiers' }),
  modalOpen: document.getElementById('var-loop-modal').style.display !== 'none',
}));
check('dans la ligne répétée pour toutes les lignes, la Boucle de l’autre variable de la ligne est grisée (déjà dans la zone) et un vrai clic n’ouvre rien',
  statutIcon.found && statutState.disabled === 'true' && statutState.title === statutState.expected && !statutState.modalOpen, statutState);

// 4 quater) « La variable, dans sa cellule » dans une ligne de tableau qui porte d'autres variables (demande d'Antoine du 2026-10-20) : les autres colonnes de la
// ligne ne suivent pas la boucle, la fenêtre le dit sous le choix et montre comment les faire suivre. À la vraie souris et à 700x400 : la fenêtre s'ouvre sur « La
// ligne du tableau » sans note, un vrai clic sur « La variable, dans sa cellule » la fait paraître sous le choix (texte entier, dans la fenêtre, en français et en
// anglais), « Enregistrer » reste atteignable, et un clic sur « La ligne du tableau » la retire.
await page.evaluate(() => {
  const badge = col => `<span class="var-badge" data-table="VcDossiers" data-column="${col}" data-key="VcDossiers.${col}"></span>`;
  Editor.setHTML('<table><tbody><tr><th><p>Dossier</p></th><th><p>Statut</p></th><th><p>Montant</p></th></tr>'
    + `<tr><td><p>${badge('Titre')}</p></td><td><p>${badge('Statut')}</p></td><td><p>${badge('Montant')}</p></td></tr></tbody></table>`);
});
await page.waitForTimeout(300);
const ROW_NOTE_SEL = '#var-loop-modal .var-loop-row-note';
const LOOP_REPEAT_BUTTON = repeat => `#var-loop-modal .var-loop-seg button[data-repeat="${repeat}"]`;
// Fait défiler le corps de la fenêtre à la molette réelle jusqu'à ce que l'élément reçoive le clic (un élément rogné par la zone de défilement ne le reçoit pas).
async function revealInLoopWindow(selector) {
  let box = await hitTest(selector);
  const body = await hitTest('#var-loop-modal .pp-modal-body');
  for (let i = 0; i < 8 && box.found && !(box.onTop && box.inViewport) && body.found; i++) {
    await page.mouse.move(body.x, body.y);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(100);
    box = await hitTest(selector);
  }
  return box;
}
const rnInfo = () => page.evaluate(() => {
  const m = document.getElementById('var-loop-modal');
  const note = m.querySelector('.var-loop-row-note');
  const seg = m.querySelector('.var-loop-seg');
  const content = m.querySelector('.var-modal-content').getBoundingClientRect();
  const r = note.getBoundingClientRect();
  return {
    shown: note.getClientRects().length > 0, text: note.textContent,
    repeat: seg.querySelector('button[aria-pressed="true"]').dataset.repeat,
    inside: r.left >= content.left - 0.5 && r.right <= content.right + 0.5 && r.right <= innerWidth + 0.5,
    unclipped: note.scrollWidth <= note.clientWidth + 1,
    below: r.top >= seg.getBoundingClientRect().bottom - 0.5,
  };
});
const rnBadge = await hitTest('.tiptap td .var-badge[data-column="Titre"]');
if (rnBadge.found) await page.mouse.click(rnBadge.x, rnBadge.y);
await page.waitForTimeout(250);
const rnIcon = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-loop"]');
if (rnIcon.found) await page.mouse.click(rnIcon.x, rnIcon.y);
await page.waitForTimeout(700);
const rnFresh = await rnInfo();
const rnWindow = await hitTest('#var-loop-modal .var-modal-content');
check('ligne de tableau à trois variables : la fenêtre Boucle s’ouvre entière dans 700x400, sur « La ligne du tableau », sans note', rnWindow.found && rnWindow.inViewport && rnFresh.repeat === 'row' && !rnFresh.shown, { rnWindow, rnFresh });
const rnCellButton = await revealInLoopWindow(LOOP_REPEAT_BUTTON('inline'));
check('« La variable, dans sa cellule » est atteignable à la souris (au premier plan, dans le panneau)', rnCellButton.found && rnCellButton.onTop && rnCellButton.inViewport, rnCellButton);
if (rnCellButton.found) await page.mouse.click(rnCellButton.x, rnCellButton.y);
await page.waitForTimeout(300);
const rnFr = await page.evaluate(() => ({
  first: I18n.t('varLoop.repeat.rowOthers', { count: 2 }), how: I18n.t('varLoop.repeat.rowOthersHow', { row: I18n.t('varLoop.repeat.row') }),
}));
const rnCell = await rnInfo();
check('un vrai clic sur « La variable, dans sa cellule » : la note dit que les 2 autres variables de la ligne ne suivent pas, et comment les faire suivre',
  rnCell.repeat === 'inline' && rnCell.shown && rnCell.text === rnFr.first + ' ' + rnFr.how && rnCell.text.startsWith('2 autres variables de la ligne ne suivront pas la boucle'), { rnCell, rnFr });
check('la note est sous le choix, entière dans la fenêtre, sans texte coupé', rnCell.below && rnCell.inside && rnCell.unclipped, rnCell);
const rnBox = await revealInLoopWindow(ROW_NOTE_SEL);
check('la note se lit en entier à la molette (au premier plan, dans le panneau)', rnBox.found && rnBox.onTop && rnBox.inViewport, rnBox);
const rnSave = await hitTest('#var-loop-modal .var-modal-primary');
check('« Enregistrer » reste visible et non recouvert avec la note', rnSave.found && rnSave.inViewport && rnSave.onTop, rnSave);
const rnRowButton = await revealInLoopWindow(LOOP_REPEAT_BUTTON('row'));
if (rnRowButton.found) await page.mouse.click(rnRowButton.x, rnRowButton.y);
await page.waitForTimeout(300);
const rnRow = await rnInfo();
check('un vrai clic sur « La ligne du tableau » retire la note', rnRow.repeat === 'row' && !rnRow.shown, rnRow);
await page.evaluate(() => I18n.setLang('en'));
await page.evaluate(() => VariableLoop.open(EditorCore.getEditor(), (() => { let at = 0; EditorCore.getEditor().state.doc.descendants((n, pos) => { if (n.type.name === 'varBadge' && n.attrs.column === 'Titre') at = pos; }); return at; })()));
await page.waitForTimeout(700);
const rnEnButton = await revealInLoopWindow(LOOP_REPEAT_BUTTON('inline'));
if (rnEnButton.found) await page.mouse.click(rnEnButton.x, rnEnButton.y);
await page.waitForTimeout(300);
const rnEn = await rnInfo();
check('en anglais : la note est traduite, entière et dans la fenêtre',
  rnEn.shown && rnEn.text === '2 other variables in the row will not follow the loop: only this cell is repeated. To repeat the whole row, choose “The table row”.' && rnEn.below && rnEn.inside && rnEn.unclipped, rnEn);
await page.evaluate(() => I18n.setLang('fr'));
await page.waitForTimeout(200);
const rnCancel = await hitTest('#var-loop-modal .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
if (rnCancel.found) await page.mouse.click(rnCancel.x, rnCancel.y);
await page.waitForTimeout(300);

// 4 quinquies) « Répéter la ligne » dans la barre du tableau (demande d'Antoine du 2026-10-20) : le curseur dans une case, la barre du tableau porte le bouton (toujours sur une seule
// ligne, entière dans 700x400), un vrai clic ouvre la fenêtre Boucle sur « La ligne du tableau » de la première variable de la ligne, « Enregistrer » pose la boucle et allume le bouton
// pour toute la ligne, un second clic rouvre la fenêtre ; sur une ligne sans variable le bouton est grisé avec sa raison et un vrai clic n'ouvre rien ; en anglais les info-bulles suivent.
await page.evaluate(() => {
  const badge = col => `<span class="var-badge" data-table="VcDossiers" data-column="${col}" data-key="VcDossiers.${col}"></span>`;
  Editor.setHTML('<table><tbody><tr><th><p>Dossier</p></th><th><p>Statut</p></th><th><p>Montant</p></th></tr>'
    + `<tr><td><p>${badge('Titre')}</p></td><td><p>${badge('Statut')}</p></td><td><p>${badge('Montant')}</p></td></tr>`
    + '<tr><td><p>Total</p></td><td><p></p></td><td><p></p></td></tr></tbody></table><p>Fin</p>');
});
await page.waitForTimeout(300);
const TABLE_BAR = '.v2-table-toolbar.visible';
const REPEAT_BUTTON = `${TABLE_BAR} button[data-action="row-repeat"]`;
// Un vrai clic dans la case (`row`, `cell` : depuis 0, l'en-tête est la ligne 0), à droite de ce qu'elle contient : le curseur y est, aucune bulle n'est choisie.
async function clickInCell(row, cell) {
  const spot = await page.evaluate(([r, c]) => {
    const box = document.querySelectorAll('.tiptap tr')[r].children[c].getBoundingClientRect();
    return { x: box.right - 8, y: box.top + box.height / 2 };
  }, [row, cell]);
  await page.mouse.click(spot.x, spot.y);
  await page.waitForTimeout(300);
}
const repeatInfo = () => page.evaluate(([barSelector, buttonSelector]) => {
  const bar = document.querySelector(barSelector);
  const button = document.querySelector(buttonSelector);
  if (!bar || !button) return null;
  const barBox = bar.getBoundingClientRect();
  const box = button.getBoundingClientRect();
  return {
    barHeight: barBox.height, barInside: barBox.left >= 0 && barBox.right <= innerWidth && barBox.top >= 0 && barBox.bottom <= innerHeight,
    buttonInside: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
    grey: button.getAttribute('aria-disabled') === 'true', opacity: Number(getComputedStyle(button).opacity), on: button.classList.contains('is-active'), title: button.title,
  };
}, [TABLE_BAR, REPEAT_BUTTON]);
const loopWindow = () => page.evaluate(() => {
  const m = document.getElementById('var-loop-modal');
  const pressed = m.querySelector('.var-loop-seg button[aria-pressed="true"]');
  return { open: m.style.display !== 'none', repeat: pressed ? pressed.dataset.repeat : null, title: m.querySelector('h3').textContent, remove: !m.querySelector('.var-modal-danger').hidden, barShown: !!document.querySelector('.v2-table-toolbar.visible') };
});
await clickInCell(1, 2);
const rpFresh = await repeatInfo();
const rpButton = await hitTest(REPEAT_BUTTON);
check('curseur dans une ligne à trois variables : la barre du tableau porte « Répéter la ligne », libre, sur une seule ligne et entière dans 700x400',
  !!rpFresh && !rpFresh.grey && !rpFresh.on && rpFresh.title === 'Répéter la ligne (Boucle)' && rpFresh.barHeight <= 40 && rpFresh.barInside && rpFresh.buttonInside, rpFresh);
check('le bouton est atteignable à la vraie souris (au premier plan, dans le panneau)', rpButton.found && rpButton.onTop && rpButton.inViewport, rpButton);
if (rpButton.found) await page.mouse.click(rpButton.x, rpButton.y);
await page.waitForTimeout(700);
const rpBox = await hitTest('#var-loop-modal .var-modal-content');
const rpOpen = await loopWindow();
check('un vrai clic ouvre la fenêtre Boucle sur « La ligne du tableau », entière dans le panneau, la barre du tableau cachée',
  rpBox.found && rpBox.inViewport && rpOpen.open && rpOpen.repeat === 'row' && /VcDossiers/.test(rpOpen.title) && !rpOpen.remove && !rpOpen.barShown, { rpBox, rpOpen });
const rpSave = await hitTest('#var-loop-modal .var-modal-primary');
check('« Enregistrer » visible et non recouvert à 700x400', rpSave.found && rpSave.inViewport && rpSave.onTop, rpSave);
if (rpSave.found) await page.mouse.click(rpSave.x, rpSave.y);
await page.waitForTimeout(400);
const rpSaved = await page.evaluate(() => {
  const loops = [];
  EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge') loops.push([n.attrs.column, n.attrs.loop ? n.attrs.loop.repeat + '/' + n.attrs.loop.all : null]); });
  return { loops, modalOpen: document.getElementById('var-loop-modal').style.display !== 'none' };
});
check('« Enregistrer » pose « La ligne du tableau » sur la première variable de la ligne seule : les deux autres la suivent sans boucle à elles',
  !rpSaved.modalOpen && JSON.stringify(rpSaved.loops) === JSON.stringify([['Titre', 'row/view'], ['Statut', null], ['Montant', null]]), rpSaved);
await clickInCell(1, 1);
const rpLit = await repeatInfo();
check('la ligne est répétée : le bouton est allumé depuis n’importe quelle case de la ligne, son info-bulle le dit', !!rpLit && rpLit.on && !rpLit.grey && rpLit.title === 'Répéter la ligne (Boucle) : réglée, cliquez pour la modifier', rpLit);
const rpAgain = await hitTest(REPEAT_BUTTON);
if (rpAgain.found) await page.mouse.click(rpAgain.x, rpAgain.y);
await page.waitForTimeout(700);
const rpReopened = await loopWindow();
check('un second clic rouvre la fenêtre de la bulle qui répète la ligne, avec « Retirer la boucle »', rpReopened.open && rpReopened.repeat === 'row' && rpReopened.remove, rpReopened);
const rpCancel = await hitTest('#var-loop-modal .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
if (rpCancel.found) await page.mouse.click(rpCancel.x, rpCancel.y);
await page.waitForTimeout(300);
await clickInCell(2, 0);
const rpGrey = await repeatInfo();
const rpGreyButton = await hitTest(REPEAT_BUTTON);
if (rpGreyButton.found) await page.mouse.click(rpGreyButton.x, rpGreyButton.y);
await page.waitForTimeout(400);
const rpGreyOpen = (await loopWindow()).open;
check('une ligne sans variable : le bouton est grisé (pas retiré), sa raison en info-bulle, et un vrai clic n’ouvre rien',
  !!rpGrey && rpGrey.grey && rpGrey.opacity < 0.5 && rpGrey.title === 'Répéter la ligne : cette ligne n’a aucune variable (insérez-en une avec #)' && rpGreyButton.found && !rpGreyOpen, { rpGrey, rpGreyOpen });
await page.evaluate(() => I18n.setLang('en'));
await page.waitForTimeout(200);
await clickInCell(1, 2);
const rpEn = await repeatInfo();
await clickInCell(2, 0);
const rpEnGrey = await repeatInfo();
check('en anglais : l’info-bulle du bouton allumé et la raison du bouton grisé sont traduites',
  !!rpEn && rpEn.on && rpEn.title === 'Repeat the row (Loop): set, click to change it' && !!rpEnGrey && rpEnGrey.grey && rpEnGrey.title === 'Repeat the row: this row has no variable (insert one with #)', { rpEn, rpEnGrey });
await page.evaluate(() => I18n.setLang('fr'));
await page.waitForTimeout(200);

// 5) Copier / Coller la condition d'une variable sur une autre (demande d'Antoine, 2026-09-29), à la vraie souris à 700x400 : deux règles saisies dans la
// fenêtre de « Titre » (« au moins une »), Copier au clic, puis Coller dans la fenêtre de « Montant » - au clavier, le focus doit rester sur le bouton -, et
// Enregistrer pose la même condition sur la seconde bulle. Les deux boutons partagent la ligne de « + Ajouter une condition » : sans chevauchement, dans la
// fenêtre, sans débordement latéral, y compris dans un panneau étroit où la ligne passe à la suivante.
await page.evaluate(async () => {
  const badge = col => `<span class="var-badge" data-table="VcDossiers" data-column="${col}" data-key="VcDossiers.${col}"></span>`;
  Editor.setHTML(`<p>Titre : ${badge('Titre')}</p><p>Montant : ${badge('Montant')}</p>`);
});
await page.waitForTimeout(300);
const MODAL = '#var-condition-modal';
const clipSel = n => `${MODAL} .var-condition-clip button:nth-of-type(${n})`;
async function openConditionFor(column) {
  const box = await hitTest(`.tiptap .var-badge[data-column="${column}"]`);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(250);
  const icon = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-condition"]');
  if (icon.found) await page.mouse.click(icon.x, icon.y);
  await page.waitForTimeout(300);
}
const clipInfo = n => page.evaluate(sel => {
  const b = document.querySelector(sel);
  return b ? { text: b.textContent, disabled: b.getAttribute('aria-disabled'), title: b.title, done: b.classList.contains('is-done'), focused: document.activeElement === b }
    : { text: null, disabled: null, title: '', done: false, focused: false, missing: true };
}, clipSel(n));
const conditionOn = column => page.evaluate(col => {
  let cond;
  EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge' && n.attrs.column === col) cond = n.attrs.condition; });
  return cond;
}, column);
const footLayout = () => page.evaluate(sel => {
  // Élément absent (bouton pas encore là) : coordonnées NaN, donc des comparaisons fausses et un check en échec plutôt qu'une exception.
  const rect = q => { const e = document.querySelector(q); if (!e) return { l: NaN, r: NaN, t: NaN, b: NaN }; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  const content = document.querySelector('#var-condition-modal .var-modal-content');
  const box = content.getBoundingClientRect();
  return {
    add: rect('#var-condition-modal .var-condition-add'), copy: rect(sel.copy), paste: rect(sel.paste), box: { l: box.left, r: box.right },
    overflowX: content.scrollWidth - content.clientWidth, docOverflowX: document.documentElement.scrollWidth - innerWidth,
  };
}, { copy: clipSel(1), paste: clipSel(2) });

await openConditionFor('Titre');
const clipEmpty = [await clipInfo(1), await clipInfo(2)];
check('fenêtre de « Titre » sans condition : Copier et Coller sont là et grisés', !clipEmpty[0].missing && !clipEmpty[1].missing && clipEmpty[0].disabled === 'true' && clipEmpty[1].disabled === 'true', clipEmpty);
check('colonne Statut choisie à la vraie souris dans la liste avec recherche (condition de « Titre »)', await pickColumn(MODAL, 'Statut'));
await page.waitForTimeout(100);
const firstValue = await hitTest(`${MODAL} .macro-rule-value`);
if (firstValue.found) { await page.mouse.click(firstValue.x, firstValue.y); await page.keyboard.type('Urgent'); }
const addRule = await hitTest(`${MODAL} .var-condition-add`);
check('« + Ajouter une condition » visible et non recouvert', addRule.found && addRule.inViewport && addRule.onTop, addRule);
if (addRule.found) await page.mouse.click(addRule.x, addRule.y);
await page.waitForTimeout(150);
check('colonne Montant choisie à la vraie souris dans la liste avec recherche (deuxième règle)', await pickColumn(`${MODAL} .macro-rule-row:nth-of-type(2)`, 'Montant'));
await page.waitForTimeout(100);
await page.selectOption(`${MODAL} .macro-rule-row:nth-of-type(2) > select`, '≥');
const secondValue = await hitTest(`${MODAL} .macro-rule-row:nth-of-type(2) .macro-rule-value`);
if (secondValue.found) { await page.mouse.click(secondValue.x, secondValue.y); await page.keyboard.type('100'); }
await page.selectOption(`${MODAL} .var-condition-mode select`, 'any');
await page.waitForTimeout(500);
const copyBtnBox = await hitTest(clipSel(1));
const pasteBtnBox = await hitTest(clipSel(2));
check('Copier et Coller visibles, dans le panneau et au premier plan (à côté de « + Ajouter »)',
  copyBtnBox.found && copyBtnBox.inViewport && copyBtnBox.onTop && pasteBtnBox.found && pasteBtnBox.inViewport && pasteBtnBox.onTop, { copyBtnBox, pasteBtnBox });
const wide = await footLayout();
check('à 700x400 : « + Ajouter », Copier et Coller se suivent sur la même ligne sans se chevaucher, dans la fenêtre, sans débordement latéral',
  wide.add.r <= wide.copy.l && wide.copy.r <= wide.paste.l && wide.paste.r <= wide.box.r && wide.add.l >= wide.box.l
  && Math.abs(wide.add.t - wide.copy.t) < 4 && wide.overflowX <= 0 && wide.docOverflowX <= 0, wide);
const beforeCopy = [await clipInfo(1), await clipInfo(2)];
check('deux règles saisies : Copier est actif, Coller reste grisé tant que rien n’est copié', beforeCopy[0].disabled === 'false' && beforeCopy[1].disabled === 'true', beforeCopy);
if (copyBtnBox.found) await page.mouse.click(copyBtnBox.x, copyBtnBox.y);
await page.waitForTimeout(150);
const afterCopy = [await clipInfo(1), await clipInfo(2)];
check('vrai clic sur Copier : « Copiée » un instant, Coller devient actif et son info-bulle résume la condition',
  afterCopy[0].text === 'Copiée' && afterCopy[0].done && afterCopy[1].disabled === 'false' && afterCopy[1].title.includes('Statut = Urgent ou Montant ≥ 100'), afterCopy);
// Panneau étroit : la ligne des trois boutons passe à la suivante au lieu de déborder.
await page.setViewportSize({ width: 360, height: HEIGHT });
await page.waitForTimeout(250);
const narrow = await footLayout();
check('panneau de 360 px : Copier et Coller restent dans la fenêtre, sans débordement latéral de la fenêtre ni de la page',
  narrow.copy.l >= narrow.box.l && narrow.paste.r <= narrow.box.r && narrow.copy.r <= narrow.paste.l && narrow.overflowX <= 0 && narrow.docOverflowX <= 0, narrow);
await page.setViewportSize({ width: WIDTH, height: HEIGHT });
await page.waitForTimeout(250);
const cancelClip = await hitTest(`${MODAL} .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)`);
if (cancelClip.found) await page.mouse.click(cancelClip.x, cancelClip.y);
await page.waitForTimeout(200);
check('Annuler (vrai clic) ferme la fenêtre sans rien écrire : « Titre » reste sans condition', (await conditionOn('Titre')) == null && await page.evaluate(() => document.getElementById('var-condition-modal').style.display === 'none'));

// Fenêtre de « Montant » : Coller au clavier (Tab depuis Copier), le focus reste sur le bouton même si les règles sont retracées, puis Enregistrer à la souris.
await openConditionFor('Montant');
const otherWindow = [await clipInfo(1), await clipInfo(2)];
check('fenêtre de « Montant » : Copier revient à « Copier » et grisé, Coller est actif', otherWindow[0].text === 'Copier' && !otherWindow[0].done && otherWindow[0].disabled === 'true' && otherWindow[1].disabled === 'false', otherWindow);
await page.focus(clipSel(1));
await page.keyboard.press('Tab');
const onPaste = await clipInfo(2);
check('Tab depuis Copier amène sur Coller', onPaste.focused, onPaste);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
const afterPaste = await page.evaluate(() => ({
  rules: Array.from(document.querySelectorAll('#var-condition-modal .macro-rule-row')).map(row => ({
    column: row.querySelector('select.macro-rule-column').value, operator: row.querySelector(':scope > select').value, value: row.querySelector('.macro-rule-value').value,
  })),
  // Ce que la personne lit dans le champ fermé de chaque règle (liste avec recherche, js/search-select.js) : la colonne collée doit s'y voir, pas seulement dans le <select> masqué.
  shown: Array.from(document.querySelectorAll('#var-condition-modal .macro-rule-row')).map(row => { const name = row.querySelector('.macro-rule-column-wrap .ss-trigger .ss-name'); return name ? name.textContent : null; }),
  mode: (() => { const r = document.querySelector('#var-condition-modal .var-condition-mode'); return { shown: !r.hidden, value: r.querySelector('select').value }; })(),
  focusInWindow: document.getElementById('var-condition-modal').contains(document.activeElement) && document.activeElement !== document.body,
}));
const pasteFocus = await clipInfo(2);
check('Entrée sur Coller : chaque colonne collée se lit dans son champ fermé (Statut, Montant)', JSON.stringify(afterPaste.shown) === JSON.stringify(['Statut', 'Montant']), afterPaste.shown);
check('Entrée sur Coller : les deux règles et « au moins une » arrivent dans la fenêtre, le focus reste sur Coller',
  JSON.stringify(afterPaste.rules) === JSON.stringify([{ column: 'Statut', operator: '=', value: 'Urgent' }, { column: 'Montant', operator: '≥', value: '100' }])
  && afterPaste.mode.shown && afterPaste.mode.value === 'any' && afterPaste.focusInWindow && pasteFocus.focused, { afterPaste, pasteFocus });
check('... sans rien écrire sur la bulle avant Enregistrer', (await conditionOn('Montant')) == null);
const saveClip = await hitTest(`${MODAL} .var-modal-primary`);
check('Enregistrer visible et non recouvert avec deux règles', saveClip.found && saveClip.inViewport && saveClip.onTop, saveClip);
if (saveClip.found) await page.mouse.click(saveClip.x, saveClip.y);
await page.waitForTimeout(250);
const expectedCondition = { mode: 'any', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }, { column: 'Montant', operator: '≥', value: '100' }] };
const montantCondition = await conditionOn('Montant');
check('Enregistrer (vrai clic) pose sur « Montant » la même condition que celle copiée sur « Titre »',
  JSON.stringify(montantCondition) === JSON.stringify(expectedCondition) && (await conditionOn('Titre')) == null && await page.evaluate(() => document.getElementById('var-condition-modal').style.display === 'none'), montantCondition);

// 6) Attributs insérés depuis une variable qui a une condition (demande d'Antoine, 2026-09-29), à la vraie souris à 700x400 : la ligne « Reprendre la
// condition d'affichage » est visible, cochée d'office, au premier plan, sans faire défiler la fenêtre ni déborder (même avec une condition longue, même à 360 px) ;
// un vrai clic sur son texte la décoche puis la recoche ; Insérer reste atteignable, et les bulles insérées portent la condition - ou aucune, case décochée.
const COND_STATUT = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] };
const setOriginBubble = condition => page.evaluate(cond => {
  const attr = cond ? ` data-condition="${JSON.stringify(cond).replace(/"/g, '&quot;')}"` : '';
  Editor.setHTML(`<p>Dossier suivi par <span class="var-badge" data-table="VcAnnuaire" data-column="NomPrenom" data-key="VcAnnuaire.NomPrenom"${attr}></span> jusqu’à la clôture.</p>`);
}, condition);
const inheritState = () => page.evaluate(() => {
  const modal = document.getElementById('var-linked-modal');
  const row = modal.querySelector('.var-linked-inherit');
  if (!row) return { missing: true };
  const content = modal.querySelector('.var-modal-content');
  const r = row.getBoundingClientRect(), c = content.getBoundingClientRect();
  return {
    shown: !row.hidden && r.height > 0, checked: row.querySelector('input').checked, text: row.querySelector('.var-linked-inherit-text').textContent,
    summary: row.querySelector('.var-linked-inherit-summary').textContent, title: row.title, height: Math.round(r.height),
    inside: r.left >= c.left - 0.5 && r.right <= c.right + 0.5, scrolls: content.scrollHeight - content.clientHeight,
    contentOverflowX: content.scrollWidth - content.clientWidth, docOverflowX: document.documentElement.scrollWidth - innerWidth,
  };
});
const bubbleConditions = () => page.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge') out.push({ key: n.attrs.key, condition: n.attrs.condition }); });
  return out;
});
const cancelLinkedWindow = async () => {
  const cancel = await hitTest('#var-linked-modal .var-modal-actions button:not(.var-modal-primary)');
  if (cancel.found) await page.mouse.click(cancel.x, cancel.y);
  await page.waitForTimeout(200);
};

await setOriginBubble(COND_STATUT);
await page.waitForTimeout(300);
await openLinkedFor('NomPrenom');
const inheritOpen = await inheritState();
check('Autres attributs sur une variable à condition : « Reprendre la condition d’affichage » est là, cochée d’office, avec le résumé « Statut = Urgent »',
  !inheritOpen.missing && inheritOpen.shown && inheritOpen.checked && inheritOpen.text === 'Reprendre la condition d’affichage' && inheritOpen.summary === '· Statut = Urgent', inheritOpen);
const inheritText = await hitTest('#var-linked-modal .var-linked-inherit-text');
const inheritBox = await hitTest('#var-linked-modal .var-linked-inherit input');
check('la ligne est visible, dans la fenêtre et au premier plan (case et texte atteignables) ; fenêtre sans défilement ni débordement à 700x400',
  inheritText.found && inheritText.inViewport && inheritText.onTop && inheritBox.found && inheritBox.inViewport && inheritBox.onTop
  && inheritOpen.inside && inheritOpen.scrolls <= 0 && inheritOpen.contentOverflowX <= 0 && inheritOpen.docOverflowX <= 0 && inheritOpen.height < 32, { inheritText, inheritBox, inheritOpen });
const telephoneRow = await hitTest('#var-linked-modal .var-linked-row[data-col="Telephone"] .var-linked-pick');
if (telephoneRow.found) await page.mouse.click(telephoneRow.x, telephoneRow.y);
await page.waitForTimeout(80);
if (inheritText.found) await page.mouse.click(inheritText.x, inheritText.y);
await page.waitForTimeout(80);
const unticked = await inheritState();
if (inheritText.found) await page.mouse.click(inheritText.x, inheritText.y);
await page.waitForTimeout(80);
const reticked = await inheritState();
check('un vrai clic sur le texte de la ligne décoche la case, un second la recoche', !unticked.missing && !unticked.checked && !reticked.missing && reticked.checked, { unticked, reticked });
const insertInherit = await hitTest('#var-linked-modal .var-modal-primary');
check('Insérer reste visible, au premier plan et actif avec la ligne en plus', insertInherit.found && insertInherit.inViewport && insertInherit.onTop
  && await page.evaluate(() => !document.querySelector('#var-linked-modal .var-modal-primary').disabled), insertInherit);
if (insertInherit.found) await page.mouse.click(insertInherit.x, insertInherit.y);
await page.waitForTimeout(250);
const inheritedBubbles = await bubbleConditions();
check('Insérer (vrai clic, case cochée) : #VcAnnuaire.Telephone reçoit la condition de #VcAnnuaire.NomPrenom, qui garde la sienne',
  inheritedBubbles.length === 2 && inheritedBubbles[0].key === 'VcAnnuaire.NomPrenom' && inheritedBubbles[1].key === 'VcAnnuaire.Telephone'
  && inheritedBubbles.every(b => JSON.stringify(b.condition) === JSON.stringify(COND_STATUT)), inheritedBubbles);
const conditionalInDom = await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap .var-badge[data-condition]')).map(b => b.dataset.key));
check('... et les deux bulles sont marquées conditionnelles dans l’éditeur', JSON.stringify(conditionalInDom) === JSON.stringify(['VcAnnuaire.NomPrenom', 'VcAnnuaire.Telephone']), conditionalInDom);

// Deuxième ouverture, case décochée à la souris : l'attribut est inséré sans condition, la case est de nouveau cochée à l'ouverture suivante.
await openLinkedFor('NomPrenom');
const inheritAgain = await inheritState();
check('à l’ouverture suivante la case est de nouveau cochée', !inheritAgain.missing && inheritAgain.shown && inheritAgain.checked, inheritAgain);
const naissanceRow = await hitTest('#var-linked-modal .var-linked-row[data-col="Naissance"] .var-linked-pick');
if (naissanceRow.found) await page.mouse.click(naissanceRow.x, naissanceRow.y);
const inheritBox2 = await hitTest('#var-linked-modal .var-linked-inherit input');
if (inheritBox2.found) await page.mouse.click(inheritBox2.x, inheritBox2.y);
await page.waitForTimeout(80);
const untickedByBox = await inheritState();
check('un vrai clic sur la case elle-même la décoche', !untickedByBox.missing && !untickedByBox.checked, untickedByBox);
const insertPlain = await hitTest('#var-linked-modal .var-modal-primary');
if (insertPlain.found) await page.mouse.click(insertPlain.x, insertPlain.y);
await page.waitForTimeout(250);
const plainBubbles = await bubbleConditions();
check('Insérer (vrai clic, case décochée) : #VcAnnuaire.Naissance arrive sans condition, les autres bulles gardent la leur',
  plainBubbles.length === 3 && plainBubbles[0].key === 'VcAnnuaire.NomPrenom' && plainBubbles[1].key === 'VcAnnuaire.Naissance' && plainBubbles[2].key === 'VcAnnuaire.Telephone'
  && JSON.stringify(plainBubbles[0].condition) === JSON.stringify(COND_STATUT) && plainBubbles[1].condition == null && JSON.stringify(plainBubbles[2].condition) === JSON.stringify(COND_STATUT), plainBubbles);

// Condition longue (trois règles, valeurs longues) : le résumé est tronqué avec « … » sur la même ligne, sans rien faire déborder, à 700 px comme à 360 px.
await setOriginBubble({ mode: 'any', rules: [
  { column: 'Statut', operator: '=', value: 'Urgent à traiter avant la fin de la semaine prochaine' },
  { column: 'Titre', operator: 'contient', value: 'Convocation devant le tribunal judiciaire de Paris' },
  { column: 'Montant', operator: '≥', value: '1000000' },
] });
await page.waitForTimeout(300);
await openLinkedFor('NomPrenom');
const inheritLong = await inheritState();
check('condition longue à 700 px : la ligne reste sur une seule ligne, dans la fenêtre, sans défilement ni débordement',
  !inheritLong.missing && inheritLong.shown && inheritLong.inside && inheritLong.height < 32 && inheritLong.scrolls <= 0 && inheritLong.contentOverflowX <= 0 && inheritLong.docOverflowX <= 0, inheritLong);
check('... et l’info-bulle de la ligne donne la condition en entier', !inheritLong.missing && inheritLong.title.includes('Convocation devant le tribunal judiciaire de Paris') && inheritLong.title.includes('1000000'), inheritLong);
await page.setViewportSize({ width: 360, height: HEIGHT });
await page.waitForTimeout(250);
const inheritNarrow = await inheritState();
check('condition longue à 360 px : la ligne reste dans la fenêtre, sans débordement latéral de la fenêtre ni de la page',
  !inheritNarrow.missing && inheritNarrow.shown && inheritNarrow.inside && inheritNarrow.contentOverflowX <= 0 && inheritNarrow.docOverflowX <= 0, inheritNarrow);
await page.setViewportSize({ width: WIDTH, height: HEIGHT });
await page.waitForTimeout(250);
await cancelLinkedWindow();
// Variable sans condition : pas de ligne du tout (la fenêtre reste telle qu'avant).
await setOriginBubble(null);
await page.waitForTimeout(300);
await openLinkedFor('NomPrenom');
const inheritNone = await inheritState();
check('variable sans condition : la ligne « Reprendre la condition d’affichage » n’est pas montrée', inheritNone.missing || !inheritNone.shown, inheritNone);
await cancelLinkedWindow();

// 6 bis) « Remplacer » (demande d'Antoine du 2026-10-01), à la vraie souris à 700x400 : le bouton est entre « Annuler » et « Insérer », sur la même ligne, dans la fenêtre,
// au premier plan, grisé tant que rien n'est coché ; un vrai clic le fait mettre l'attribut coché à la place de la bulle - qui reste sélectionnée, sa barre revenant à côté
// d'elle - et un seul Ctrl+Z rend l'ancienne ; au clavier, Tab jusqu'à lui puis Entrée fait la même chose ; dans un panneau de 360 px les trois boutons ne tiennent pas côte à
// côte : « Insérer » passe sur sa propre ligne, à droite, et rien ne sort de la fenêtre ni du panneau.
const replaceState = () => page.evaluate(() => {
  const modal = document.getElementById('var-linked-modal');
  const actions = Array.from(modal.querySelectorAll('.var-modal-actions button'));
  const rects = actions.map(b => b.getBoundingClientRect());
  const content = modal.querySelector('.var-modal-content').getBoundingClientRect();
  const replace = modal.querySelector('button.var-linked-replace');
  return {
    labels: actions.map(b => b.textContent), leftToRight: rects.every((r, i) => i === 0 || r.left >= rects[i - 1].right - 0.5),
    inside: rects.every(r => r.left >= content.left - 0.5 && r.right <= content.right + 0.5), oneRow: new Set(rects.map(r => Math.round(r.top))).size === 1,
    replaceDisabled: replace ? replace.disabled : null, docOverflowX: document.documentElement.scrollWidth - innerWidth,
    contentOverflowX: modal.querySelector('.var-modal-content').scrollWidth - modal.querySelector('.var-modal-content').clientWidth,
    boxInViewport: content.left >= 0 && content.top >= 0 && content.right <= innerWidth + 0.5 && content.bottom <= innerHeight + 0.5,
    rows: new Set(rects.map(r => Math.round(r.top))).size,
  };
});
const paragraphSequence = () => page.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.firstChild.forEach(n => out.push(n.type.name === 'varBadge' ? '#' + n.attrs.key : n.text));
  return out;
});
const SEQ_ORIGIN = ['Dossier suivi par ', '#VcAnnuaire.NomPrenom', ' jusqu’à la clôture.'];
const SEQ_REPLACED = ['Dossier suivi par ', '#VcAnnuaire.Telephone', ' jusqu’à la clôture.'];
await setOriginBubble(null);
await page.waitForTimeout(300);
await openLinkedFor('NomPrenom');
const replaceAtZero = await replaceState();
check('« Remplacer » : trois boutons Annuler, Remplacer, Insérer de gauche à droite, sur une ligne, dans la fenêtre, page sans débordement, grisé tant que rien n’est coché',
  JSON.stringify(replaceAtZero.labels.slice(0, 2)) === JSON.stringify(['Annuler', 'Remplacer']) && replaceAtZero.labels.length === 3 && replaceAtZero.labels[2].startsWith('Insérer')
  && replaceAtZero.leftToRight && replaceAtZero.inside && replaceAtZero.oneRow && replaceAtZero.docOverflowX <= 0 && replaceAtZero.replaceDisabled === true, replaceAtZero);
const replaceTelRow = await hitTest('#var-linked-modal .var-linked-row[data-col="Telephone"] .var-linked-pick');
if (replaceTelRow.found) await page.mouse.click(replaceTelRow.x, replaceTelRow.y);
await page.waitForTimeout(80);
const replaceBtn = await hitTest('#var-linked-modal .var-linked-replace');
const replaceTitle = await page.evaluate(() => document.querySelector('#var-linked-modal .var-linked-replace').title);
check('« Remplacer » est visible, au premier plan et actif après un clic sur la ligne Telephone ; son info-bulle dit ce qu’il fait',
  replaceBtn.found && replaceBtn.inViewport && replaceBtn.onTop && (await replaceState()).replaceDisabled === false
  && replaceTitle === 'Remplace #VcAnnuaire.NomPrenom par les attributs cochés, au lieu de les insérer après elle.', { replaceBtn, replaceTitle });
if (replaceBtn.found) await page.mouse.click(replaceBtn.x, replaceBtn.y);
await page.waitForTimeout(400);
const afterReplace = await page.evaluate(() => {
  const selected = EditorCore.getEditor().state.selection.node;
  const bar = document.querySelector('.v2-varfmt-toolbar.visible');
  const badge = document.querySelector('.tiptap .var-badge[data-column="Telephone"]');
  const b = badge && badge.getBoundingClientRect();
  const r = bar && bar.getBoundingClientRect();
  return {
    windowClosed: document.getElementById('var-linked-modal').style.display === 'none',
    selected: selected && selected.type.name === 'varBadge' ? selected.attrs.key : null,
    focusInEditor: document.querySelector('.tiptap').contains(document.activeElement),
    bar: r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null, badge: b ? { left: b.left, top: b.top, right: b.right, bottom: b.bottom } : null,
  };
});
check('« Remplacer » (vrai clic) met #VcAnnuaire.Telephone à la place de #VcAnnuaire.NomPrenom, ferme la fenêtre et rend le focus à l’éditeur',
  JSON.stringify(await paragraphSequence()) === JSON.stringify(SEQ_REPLACED) && afterReplace.windowClosed && afterReplace.focusInEditor, afterReplace);
check('... la bulle reste sélectionnée et sa barre est de retour à côté d’elle (pas en haut à gauche)',
  afterReplace.selected === 'VcAnnuaire.Telephone' && !!afterReplace.bar && !!afterReplace.badge && !(afterReplace.bar.left <= 9 && afterReplace.bar.top <= 9)
  && afterReplace.bar.left <= afterReplace.badge.right && afterReplace.bar.right >= afterReplace.badge.left, afterReplace);
await page.keyboard.press('Control+z');
await page.waitForTimeout(250);
check('un seul Ctrl+Z (vrai clavier) rend #VcAnnuaire.NomPrenom', JSON.stringify(await paragraphSequence()) === JSON.stringify(SEQ_ORIGIN), await paragraphSequence());

// Au clavier : la fenêtre s'ouvre sur le filtre, la case se coche à la souris, puis Tab jusqu'à « Remplacer » (après « Annuler ») et Entrée.
await setOriginBubble(null);
await page.waitForTimeout(300);
await openLinkedFor('NomPrenom');
const keyboardTelRow = await hitTest('#var-linked-modal .var-linked-row[data-col="Telephone"] .var-linked-pick');
if (keyboardTelRow.found) await page.mouse.click(keyboardTelRow.x, keyboardTelRow.y);
await page.waitForTimeout(80);
const focusedName = () => page.evaluate(() => {
  const a = document.activeElement;
  return a === document.querySelector('#var-linked-modal .var-linked-replace') ? 'replace' : a === document.querySelector('#var-linked-modal .var-modal-primary') ? 'insert'
    : a && a.closest && a.closest('#var-linked-modal .var-modal-actions') ? 'cancel' : 'other';
});
const tabbedThrough = [];
for (let i = 0; i < 14 && (await focusedName()) !== 'replace'; i++) { await page.keyboard.press('Tab'); tabbedThrough.push(await focusedName()); }
check('Tab atteint « Remplacer » juste après « Annuler » et avant « Insérer »', (await focusedName()) === 'replace' && tabbedThrough[tabbedThrough.length - 2] === 'cancel', tabbedThrough);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check('Entrée sur « Remplacer » (vrai clavier) remplace la bulle comme un clic',
  JSON.stringify(await paragraphSequence()) === JSON.stringify(SEQ_REPLACED) && await page.evaluate(() => document.getElementById('var-linked-modal').style.display === 'none'), await paragraphSequence());

// Panneau de 360 px : les trois boutons restent dans la fenêtre et atteignables, « Insérer » passe sur sa propre ligne, à droite.
await setOriginBubble(null);
await page.waitForTimeout(300);
await openLinkedFor('NomPrenom');
await page.setViewportSize({ width: 360, height: HEIGHT });
await page.waitForTimeout(300);
const narrowTelRow = await hitTest('#var-linked-modal .var-linked-row[data-col="Telephone"] .var-linked-pick');
if (narrowTelRow.found) await page.mouse.click(narrowTelRow.x, narrowTelRow.y);
await page.waitForTimeout(80);
const replaceNarrow = await replaceState();
const replaceNarrowHit = await hitTest('#var-linked-modal .var-linked-replace');
const insertNarrowHit = await hitTest('#var-linked-modal .var-modal-primary');
check('360 px : Annuler, Remplacer et Insérer restent dans la fenêtre et dans le panneau, ni la fenêtre ni la page ne débordent sur le côté',
  replaceNarrow.inside && replaceNarrow.docOverflowX <= 0 && replaceNarrow.contentOverflowX <= 0 && replaceNarrow.boxInViewport && replaceNarrowHit.found && replaceNarrowHit.inViewport
  && replaceNarrowHit.onTop && insertNarrowHit.found && insertNarrowHit.inViewport && insertNarrowHit.onTop, { replaceNarrow, replaceNarrowHit, insertNarrowHit });
check('360 px : « Insérer » passe sur sa propre ligne, alignée à droite avec « Remplacer » au lieu de sortir ; Annuler et Remplacer restent ensemble',
  replaceNarrow.rows === 2 && insertNarrowHit.top > replaceNarrowHit.top && Math.abs(insertNarrowHit.right - replaceNarrowHit.right) < 1
  && replaceNarrowHit.top === (await hitTest('#var-linked-modal .var-modal-actions button')).top, { replaceNarrow, replaceNarrowHit, insertNarrowHit });
if (replaceNarrowHit.found) await page.mouse.click(replaceNarrowHit.x, replaceNarrowHit.y);
await page.waitForTimeout(300);
check('360 px : un vrai clic sur « Remplacer » remplace la bulle', JSON.stringify(await paragraphSequence()) === JSON.stringify(SEQ_REPLACED), await paragraphSequence());
await page.setViewportSize({ width: WIDTH, height: HEIGHT });
await page.waitForTimeout(250);

// Nombres (demandes d'Antoine du 2026-09-30 « Si la valeur vaut zéro », puis du 2026-10-01 : une icône en bascule, 0 masqué par défaut, écriture FR par défaut).
// La barre d'une bulle Numérique a un bouton en bascule pour le zéro - 0 barré et enfoncé : le zéro ne s'écrit pas (le défaut) ; 0 et relâché : la bulle l'affiche. À la
// vraie souris et à 700x400 : il est atteignable et non recouvert ; un vrai clic pose {zero:'show'} SANS activer la mise en forme des nombres, les autres réglages le
// gardent, la barre reste ouverte ; la Lecture écrit ce que la barre annonce (FR allumé : « 1 200 » ; zéro masqué : rien, sans avoir recliqué sur rien) ; et dans une
// fenêtre étroite la barre passe à la ligne au lieu de déborder du panneau.
const NUM_BADGE = '.tiptap .var-badge[data-column="Montant"]';
async function openNumberBar() {
  await page.evaluate(() => {
    document.querySelector('.tiptap').blur();
    Editor.setHTML('<p>Montant dû : <span class="var-badge" data-table="VcDossiers" data-column="Montant" data-key="VcDossiers.Montant"></span> TTC.</p>');
    document.querySelector('.tiptap .var-badge[data-column="Montant"]').scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
  const box = await hitTest(NUM_BADGE);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(600);
}
// Reclique la bulle déjà là (sans refaire le modèle : son format est gardé), pour rouvrir sa barre.
async function reselectNumberBadge() {
  const box = await hitTest(NUM_BADGE);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(500);
}
const numberFormat = () => page.evaluate(() => {
  let format = null;
  EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge') format = n.attrs.format || null; });
  return format;
});
const numberBar = () => page.evaluate(() => {
  const bar = document.querySelector('.v2-varfmt-toolbar.visible');
  if (!bar) return null;
  const r = bar.getBoundingClientRect();
  const panel = bar.querySelector('[data-var-panel="number"]');
  const zero = bar.querySelector('button[data-action="num-zero"]');
  return {
    left: r.left, right: r.right, height: r.height, viewport: innerWidth, docOverflowX: document.scrollingElement.scrollWidth - innerWidth, panelShown: !!panel && !panel.hidden,
    zeroPressed: zero ? zero.getAttribute('aria-pressed') : null, zeroActive: zero ? zero.classList.contains('is-active') : null, zeroSlash: zero ? (() => { const path = zero.querySelector('svg path'); return !!path && path.getAttribute('display') !== 'none'; })() : null,
    menus: bar.querySelectorAll('select[data-role="num-zero"]').length,
  };
});
// Bascule du zéro comme une personne : un vrai clic sur le bouton.
async function clickZero() {
  const button = await hitTest('.v2-varfmt-toolbar.visible button[data-action="num-zero"]');
  if (button.found) await page.mouse.click(button.x, button.y);
  await page.waitForTimeout(250);
  return button;
}
const fireDossier = montant => page.evaluate(m => window.__gristStub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: m }, 'VcDossiers'), montant);
// Ce que la Lecture écrit pour la bulle, la bulle restant sélectionnée : le bouton Lecture à la vraie souris, puis le retour à l'édition en glissant d'abord vers le bouton
// (l'info-bulle du bouton Lecture, encore sous le pointeur, couvrirait sinon son voisin).
async function readBubbleInReaderMode(selector = '.resolved-var') {
  const readButton = await hitTest('#btn-mode-read');
  if (readButton.found) await page.mouse.click(readButton.x, readButton.y);
  await page.waitForTimeout(900);
  const text = await page.evaluate(sel => { const e = document.querySelector('#reader-container .reader-content ' + sel); return e ? e.textContent : null; }, selector);
  let editButton = await hitTest('#btn-mode-edit');
  if (editButton.found) {
    await page.mouse.move(editButton.x - 6, editButton.y, { steps: 2 });
    await page.mouse.move(editButton.x, editButton.y, { steps: 3 });
    await page.waitForTimeout(200);
    editButton = await hitTest('#btn-mode-edit');
    await page.mouse.click(editButton.x, editButton.y);
  }
  await page.waitForTimeout(500);
  const backToEdit = await page.evaluate(() => getComputedStyle(document.getElementById('editor-container')).display !== 'none');
  return { text, readButton, backToEdit };
}

await openNumberBar();
const zeroButton = await hitTest('.v2-varfmt-toolbar.visible button[data-action="num-zero"]');
const barAt700 = await numberBar();
check('clic sur une bulle Numérique : le bouton du zéro est dans la barre, visible et non recouvert à 700x400', zeroButton.found && zeroButton.inViewport && zeroButton.onTop, zeroButton);
check('... enfoncé avec un 0 barré tant que rien n\'est réglé (le zéro ne s\'écrit pas, c\'est le défaut), et plus de menu', !!barAt700 && barAt700.zeroPressed === 'true' && barAt700.zeroActive && barAt700.zeroSlash && barAt700.menus === 0, barAt700);
check('... et la barre reste sur une seule ligne, dans le panneau', !!barAt700 && barAt700.height < 50 && barAt700.left >= 0 && barAt700.right <= barAt700.viewport + 0.5 && barAt700.docOverflowX <= 0, barAt700);
check('bulle sans mise en forme : le bouton n\'en crée pas (format encore vide)', (await numberFormat()) === null);

// Retour d'Antoine du 2026-10-01 : pour un nombre sans réglage la barre montre FR allumé, et la Lecture doit déjà écrire les espaces des milliers - sans qu'il
// ait à recliquer sur FR. La valeur de la page est 1200 (VcDossiers, ligne 1).
const litAtStart = await page.evaluate(() => {
  const lit = a => { const b = document.querySelector(`.v2-varfmt-toolbar.visible button[data-action="num-style:${a}"]`); return !!b && b.classList.contains('is-active'); };
  return { fr: lit('fr'), us: lit('us'), none: lit('none') };
});
check('bulle sans mise en forme : la barre montre FR allumé (US et « — » éteints)', litAtStart.fr && !litAtStart.us && !litAtStart.none, litAtStart);
const readNumber = await readBubbleInReaderMode();
check('Lecture, bouton cliqué à la vraie souris : ce nombre s\'écrit « 1 200 » (espace insécable) sans avoir recliqué sur FR', readNumber.readButton.found && readNumber.text === '1 200', readNumber);
check('... et le bouton Édition, à la vraie souris, ramène l\'éditeur', readNumber.backToEdit, readNumber);

// Zéro : par défaut la Lecture n'écrit rien, comme le bouton enfoncé l'annonce ; un vrai clic sur le bouton fait écrire le 0.
await fireDossier(0);
await page.waitForTimeout(250);
await reselectNumberBadge();
const zeroDefaultBar = await numberBar();
const readZeroHidden = await readBubbleInReaderMode();
check('valeur 0, bulle sans réglage (bouton enfoncé) : la Lecture n\'écrit rien', !!zeroDefaultBar && zeroDefaultBar.zeroPressed === 'true' && readZeroHidden.readButton.found && readZeroHidden.text === '', { zeroDefaultBar, readZeroHidden });

await reselectNumberBadge();
await clickZero();
const shown = await numberFormat();
const barShown = await numberBar();
check('vrai clic sur le bouton : la bulle porte {zero:"show"} seul, sans activer la mise en forme des nombres', !!shown && JSON.stringify(shown) === '{"zero":"show"}', shown);
check('... la barre reste ouverte sur le panneau des nombres, le bouton est relâché et montre un 0 sans barre', !!barShown && barShown.panelShown && barShown.zeroPressed === 'false' && !barShown.zeroActive && !barShown.zeroSlash, barShown);
const readZeroShown = await readBubbleInReaderMode();
check('valeur 0, bouton relâché : la Lecture écrit « 0 »', readZeroShown.readButton.found && readZeroShown.text === '0', readZeroShown);

await reselectNumberBadge();
const styleFr = await hitTest('.v2-varfmt-toolbar.visible button[data-action="num-style:fr"]');
check('le bouton FR voisin est atteignable', styleFr.found && styleFr.inViewport && styleFr.onTop, styleFr);
if (styleFr.found) await page.mouse.click(styleFr.x, styleFr.y);
await page.waitForTimeout(250);
const frShown = await numberFormat();
check('vrai clic sur FR : le style est posé et le réglage zéro est gardé', !!frShown && frShown.type === 'number' && frShown.style === 'fr' && frShown.zero === 'show', frShown);

await clickZero();
const hiddenAgain = await numberFormat();
const barHiddenAgain = await numberBar();
check('second vrai clic : le réglage zéro disparaît (retour au défaut), FR reste, le bouton est de nouveau enfoncé', !!hiddenAgain && hiddenAgain.type === 'number' && hiddenAgain.style === 'fr' && !('zero' in hiddenAgain)
  && !!barHiddenAgain && barHiddenAgain.zeroPressed === 'true' && barHiddenAgain.zeroSlash, { hiddenAgain, barHiddenAgain });
await fireDossier(1200);

// Bulle sélectionnée puis Lecture (choix « Corriger » d'Antoine, 2026-10-01) : la barre flottante de la bulle se ferme quand l'éditeur se masque. Avant, un vrai clic sur
// « Lecture » la fermait (clic hors de l'éditeur) puis le blur de l'éditeur la rouvrait aussitôt, et l'éditeur masqué la faisait sauter en haut à gauche (8, 8), par-dessus la
// barre du haut ; au clavier (Entrée sur le bouton) rien ne la fermait. De retour en Édition, un clic sur la bulle la rouvre.
const visibleBars = () => page.evaluate(() => ({
  open: document.querySelectorAll('.v2-floating-toolbar.visible').length,
  coversTopLeft: !!document.elementFromPoint(24, 24)?.closest('.v2-floating-toolbar'),
  editorShown: getComputedStyle(document.getElementById('editor-container')).display !== 'none',
}));
await openNumberBar();
const openBar = await visibleBars();
check('bulle nombre sélectionnée : sa barre est ouverte avant de passer en Lecture', openBar.open === 1 && openBar.editorShown, openBar);
const readNow = await hitTest('#btn-mode-read');
await page.mouse.click(readNow.x, readNow.y);
await page.waitForTimeout(800);
const inReader = await visibleBars();
check('vrai clic sur « Lecture » avec la bulle sélectionnée : aucune barre flottante n\'est affichée (éditeur masqué, rien en haut à gauche)', !inReader.editorShown && inReader.open === 0 && !inReader.coversTopLeft, inReader);
let backButton = await hitTest('#btn-mode-edit');
await page.mouse.move(backButton.x - 6, backButton.y, { steps: 2 });
await page.mouse.move(backButton.x, backButton.y, { steps: 3 });
await page.waitForTimeout(200);
backButton = await hitTest('#btn-mode-edit');
check('... le bouton Édition est atteignable, non recouvert', backButton.found && backButton.inViewport && backButton.onTop, backButton);
await page.mouse.click(backButton.x, backButton.y);
await page.waitForTimeout(600);
const backInEdit = await visibleBars();
check('vrai clic sur « Édition » : l\'éditeur revient', backInEdit.editorShown, backInEdit);
await reselectNumberBadge();
const reopened = await visibleBars();
check('... un clic sur la bulle rouvre sa barre', reopened.open === 1 && reopened.editorShown, reopened);
await page.focus('#btn-mode-read');
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
const keyboardReader = await visibleBars();
check('Entrée sur le bouton « Lecture » (clavier, sans clic) : la barre se ferme aussi', !keyboardReader.editorShown && keyboardReader.open === 0 && !keyboardReader.coversTopLeft, keyboardReader);
await page.focus('#btn-mode-edit');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
const keyboardBack = await visibleBars();
check('... et Entrée sur « Édition » ramène l\'éditeur', keyboardBack.editorShown, keyboardBack);

// Clic ailleurs dans la page (choix « Corriger » d'Antoine, 2026-10-01) : une bulle ou une image sélectionnée, un vrai clic hors de l'éditeur et hors de la barre - le texte d'état -
// ferme sa barre. Avant, le blur de l'éditeur qui suit le clic la rouvrait juste après le filet de js/editor-core.js (seule la barre d'un tableau se fermait). Un clic DANS la barre
// (FR, curseur d'opacité) ne la ferme pas, et un clic sur l'objet la rouvre.
const statusText = await hitTest('#status-msg');
await openNumberBar();
const numberOpen = await visibleBars();
await page.mouse.click(statusText.x, statusText.y);
await page.waitForTimeout(500);
const numberAway = await visibleBars();
check('bulle nombre sélectionnée, vrai clic sur le texte d\'état : sa barre se ferme', numberOpen.open === 1 && numberAway.open === 0, { numberOpen, numberAway });
await reselectNumberBadge();
const numberAgain = await visibleBars();
check('... un clic sur la bulle la rouvre', numberAgain.open === 1, numberAgain);
const frInside = await hitTest('.v2-varfmt-toolbar.visible button[data-action="num-style:fr"]');
if (frInside.found) await page.mouse.click(frInside.x, frInside.y);
await page.waitForTimeout(300);
const afterInside = await visibleBars();
check('... et un clic dans la barre elle-même (FR) ne la ferme pas', frInside.found && afterInside.open === 1, { frInside, afterInside });

await page.evaluate(() => {
  document.querySelector('.tiptap').blur();
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  Editor.setHTML('<p>Texte avant.</p><p><img class="editor-image" src="' + png + '" alt="" style="width:120px"></p><p>Texte après.</p>');
});
await page.waitForTimeout(500);
const IMAGE = '.tiptap img.editor-image';
let imageBox = await hitTest(IMAGE);
await page.mouse.click(imageBox.x, imageBox.y);
await page.waitForTimeout(500);
const imageOpen = await visibleBars();
const opacity = await hitTest('.v2-floating-toolbar.visible input[data-role="opacity"]');
check('image sélectionnée à la vraie souris : sa barre est ouverte, le curseur d\'opacité atteignable', imageOpen.open === 1 && opacity.found && opacity.inViewport && opacity.onTop, { imageOpen, opacity });
if (opacity.found) await page.mouse.click(opacity.x, opacity.y);
await page.waitForTimeout(300);
const imageInside = await visibleBars();
check('... un clic dans la barre (curseur d\'opacité) ne la ferme pas', imageInside.open === 1, imageInside);
imageBox = await hitTest(IMAGE);
await page.mouse.click(imageBox.x, imageBox.y);
await page.waitForTimeout(400);
await page.mouse.click(statusText.x, statusText.y);
await page.waitForTimeout(500);
const imageAway = await visibleBars();
check('image sélectionnée, vrai clic sur le texte d\'état : sa barre se ferme', imageAway.open === 0, imageAway);
imageBox = await hitTest(IMAGE);
await page.mouse.click(imageBox.x, imageBox.y);
await page.waitForTimeout(500);
const imageAgain = await visibleBars();
check('... un clic sur l\'image la rouvre', imageAgain.open === 1, imageAgain);

// « Colonne… » (point 11 des retours du 2026-10-02 : une variable cassée par un renommage dans Grist se répare en choisissant la bonne colonne ; le 2026-10-04 : « pas à chaque fois,
// uniquement quand une variable est cassée ») : un bouton de la barre d'une variable CASSÉE (bulle rouge) ouvre la liste avec recherche de toutes les colonnes ; une variable saine ne l'a pas.
// À la vraie souris et à 700x400 : la barre de la bulle nombre saine n'a pas le bouton et reste dans la fenêtre ; sur la bulle rouge il est atteignable, la liste s'ouvre entière dans la
// fenêtre et au-dessus de la barre, la frappe filtre, un vrai clic sur la ligne remplace la colonne de la bulle cassée en gardant sa condition, sa barre revient SANS le bouton.
const COLUMN_BUTTON = '.v2-varfmt-toolbar.visible button[data-action="var-column"]';
// Le bouton dans la barre ouverte : posé ou non, et rendu ou non (un bouton `hidden` n'a aucune boîte, donc rien à cliquer).
const columnButtonState = () => page.evaluate(() => {
  const bar = document.querySelector('.v2-varfmt-toolbar.visible');
  const b = bar && bar.querySelector('button[data-action="var-column"]');
  return { bar: !!bar, present: !!b, hidden: !!b && b.hidden, boxes: b ? b.getClientRects().length : -1 };
});
await openNumberBar();
const columnOnNumberBar = await columnButtonState();
const numberBarSane = await numberBar();
check('700 px : la barre d\'une bulle nombre saine n\'a pas « Colonne… » (le bouton est caché, sans boîte) et reste dans la fenêtre', columnOnNumberBar.bar && columnOnNumberBar.present && columnOnNumberBar.hidden && columnOnNumberBar.boxes === 0
  && !!numberBarSane && numberBarSane.left >= 0 && numberBarSane.right <= numberBarSane.viewport + 0.5 && numberBarSane.panelShown, { columnOnNumberBar, numberBarSane });
await page.evaluate(() => {
  document.querySelector('.tiptap').blur();
  const condition = JSON.stringify({ mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] }).replace(/"/g, '&quot;');
  Editor.setHTML('<p>Dossier <span class="var-badge" data-table="VcDossiers" data-column="Intitule" data-key="VcDossiers.Intitule" data-condition="' + condition + '"></span> suivi.</p>');
});
await page.waitForTimeout(500);
const BROKEN_BADGE = '.tiptap .var-badge[data-column="Intitule"]';
const brokenBox = await hitTest(BROKEN_BADGE);
await page.mouse.click(brokenBox.x, brokenBox.y);
await page.waitForTimeout(500);
const brokenButton = await hitTest(COLUMN_BUTTON);
const brokenTitle = await page.evaluate(sel => { const b = document.querySelector(sel); return b ? b.title : null; }, COLUMN_BUTTON);
check('bulle cassée à la vraie souris : « Colonne… » est atteignable et son info-bulle propose de choisir la bonne', brokenButton.found && brokenButton.inViewport && brokenButton.onTop && /choisir la bonne/.test(brokenTitle || ''), { brokenButton, brokenTitle });
if (brokenButton.found) await page.mouse.click(brokenButton.x, brokenButton.y);
await page.waitForTimeout(400);
const columnList = await page.evaluate(() => {
  const panel = Array.from(document.querySelectorAll('.ss-panel')).find(p => !p.hidden);
  if (!panel) return null;
  const r = panel.getBoundingClientRect();
  const first = panel.querySelector('.ss-option');
  const fr = first ? first.getBoundingClientRect() : null;
  const hit = fr ? document.elementFromPoint(fr.left + fr.width / 2, fr.top + fr.height / 2) : null;
  const names = Array.from(panel.querySelectorAll('.ss-option .ss-name')).map(n => n.textContent);
  return {
    left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight, docOverflowX: document.scrollingElement.scrollWidth - innerWidth,
    firstOnTop: !!first && !!hit && (hit === first || first.contains(hit)), firstNames: names.slice(0, 3), focusInSearch: document.activeElement === panel.querySelector('.ss-input'),
  };
});
check('un vrai clic sur « Colonne… » ouvre la liste : entière dans la fenêtre, au-dessus de la barre, la zone de recherche prend le focus', !!columnList && columnList.left >= 0 && columnList.top >= 0
  && columnList.right <= columnList.width + 0.5 && columnList.bottom <= columnList.height + 0.5 && columnList.docOverflowX <= 0 && columnList.firstOnTop && columnList.focusInSearch, columnList);
check('... la table de la page vient en tête', !!columnList && columnList.firstNames.length > 0 && columnList.firstNames.every(n => n.indexOf('VcDossiers.') === 0), columnList && columnList.firstNames);
await page.keyboard.type('Titre');
await page.waitForTimeout(200);
const titleRow = await page.evaluate(() => {
  const panel = Array.from(document.querySelectorAll('.ss-panel')).find(p => !p.hidden);
  const row = panel && Array.from(panel.querySelectorAll('.ss-option')).find(r => r.querySelector('.ss-name').textContent === 'VcDossiers.Titre');
  if (!row) return null;
  const r = row.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, shown: Array.from(panel.querySelectorAll('.ss-option .ss-name')).map(n => n.textContent) };
});
check('la frappe filtre la liste : « Titre » ne laisse que les colonnes qui le contiennent', !!titleRow && titleRow.shown.every(n => /titre/i.test(n)), titleRow);
if (titleRow) await page.mouse.click(titleRow.x, titleRow.y);
await page.waitForTimeout(500);
const repairedBadge = await page.evaluate(() => {
  const el = document.querySelector('.tiptap .var-badge');
  return { column: el.dataset.column, key: el.dataset.key, broken: el.classList.contains('var-badge-broken'), condition: el.dataset.condition || '', barOpen: !!document.querySelector('.v2-varfmt-toolbar.visible'), listOpen: !!Array.from(document.querySelectorAll('.ss-panel')).find(p => !p.hidden) };
});
check('un vrai clic sur la ligne : la bulle prend la colonne, n’est plus rouge, garde sa condition, la liste se ferme et la barre revient', repairedBadge.column === 'Titre' && repairedBadge.key === 'VcDossiers.Titre'
  && !repairedBadge.broken && /Statut/.test(repairedBadge.condition) && repairedBadge.barOpen && !repairedBadge.listOpen, repairedBadge);
const columnAfterRepair = await columnButtonState();
check('... et la barre revenue n\'a plus « Colonne… » : la variable n\'est plus cassée', columnAfterRepair.bar && columnAfterRepair.present && columnAfterRepair.hidden && columnAfterRepair.boxes === 0, columnAfterRepair);

// Variable sans lien (demande d'Antoine du 20/10 : « la variable est en bleu, il faut qu'elle soit en orange quand il n'y a plus de lien avec sa table ») : la bulle d'une table que rien ne
// relie à la page (VcContacts : ni règle, ni colonne Référence de la page vers elle) est ORANGE - pas rouge -, celle d'une table liée reste bleue. À la vraie souris et à 700x400 :
// « Colonne… » est atteignable sur la bulle orange comme sur une rouge, la liste s'ouvre, choisir la même colonne ouvre le choix de la clé (boutons non recouverts), Valider pose la règle
// et la bulle redevient bleue, sans « Colonne… » dans sa barre revenue.
const UNLINKED_BADGE = '.tiptap .var-badge[data-table="VcContacts"]';
await page.evaluate(async () => {
  document.querySelector('.tiptap').blur();
  await GristAPI.deleteLinkRule('VcContacts');
  Editor.setHTML('<p>Contact <span class="var-badge" data-table="VcContacts" data-column="Role" data-key="VcContacts.Role"></span> et <span class="var-badge" data-table="VcAnnuaire" data-column="NomPrenom" data-key="VcAnnuaire.NomPrenom"></span>.</p>');
});
await page.waitForTimeout(500);
const bubblePaint = () => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap .var-badge')).map(b => ({
  table: b.dataset.table, orange: b.classList.contains('var-badge-unlinked'), red: b.classList.contains('var-badge-broken'), background: getComputedStyle(b).backgroundColor, color: getComputedStyle(b).color, title: b.title,
})));
const paintedBefore = await bubblePaint();
check('variable sans lien : la bulle de VcContacts est orange (ambre, pas le rouge ni le bleu), celle de VcAnnuaire, liée, reste bleue',
  paintedBefore.length === 2 && paintedBefore[0].orange && !paintedBefore[0].red && !paintedBefore[1].orange && !paintedBefore[1].red && paintedBefore[0].background === 'rgb(255, 230, 199)'
  && paintedBefore[0].color === 'rgb(135, 54, 0)' && paintedBefore[1].background !== paintedBefore[0].background && /Aucun lien entre « VcContacts » et « VcDossiers »/.test(paintedBefore[0].title) && !paintedBefore[1].title, paintedBefore);
const unlinkedBox = await hitTest(UNLINKED_BADGE);
await page.mouse.click(unlinkedBox.x, unlinkedBox.y);
await page.waitForTimeout(500);
const unlinkedButton = await hitTest(COLUMN_BUTTON);
const unlinkedTitle = await page.evaluate(sel => { const b = document.querySelector(sel); return b ? b.title : null; }, COLUMN_BUTTON);
check('... un vrai clic sur la bulle orange : « Colonne… » est atteignable, son info-bulle propose de refaire le lien', unlinkedButton.found && unlinkedButton.inViewport && unlinkedButton.onTop && /refaire le lien/.test(unlinkedTitle || ''), { unlinkedButton, unlinkedTitle });
if (unlinkedButton.found) await page.mouse.click(unlinkedButton.x, unlinkedButton.y);
await page.waitForTimeout(400);
await page.keyboard.type('Role');
await page.waitForTimeout(200);
const roleRow = await page.evaluate(() => {
  const panel = Array.from(document.querySelectorAll('.ss-panel')).find(p => !p.hidden);
  const row = panel && Array.from(panel.querySelectorAll('.ss-option')).find(r => r.querySelector('.ss-name').textContent === 'VcContacts.Role');
  if (!row) return null;
  const r = row.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
if (roleRow) await page.mouse.click(roleRow.x, roleRow.y);
await page.waitForTimeout(500);
const unlinkedKeyConfirm = await hitTest('#link-config-confirm');
const unlinkedKeyCancel = await hitTest('#link-config-cancel');
check('... choisir la colonne de la bulle ouvre le choix de la clé de VcContacts, Valider et Annuler dans la fenêtre et non recouverts', unlinkedKeyConfirm.found && unlinkedKeyConfirm.inViewport && unlinkedKeyConfirm.onTop
  && unlinkedKeyCancel.found && unlinkedKeyCancel.inViewport && unlinkedKeyCancel.onTop, { unlinkedKeyConfirm, unlinkedKeyCancel });
if (unlinkedKeyConfirm.found) await page.mouse.click(unlinkedKeyConfirm.x, unlinkedKeyConfirm.y);
await page.waitForTimeout(600);
const paintedAfter = await bubblePaint();
const ruleAfter = await page.evaluate(() => { const r = GristAPI.getLinkRule('VcContacts'); return r ? [r.mode, r.colonneCible, r.colonneSource] : null; });
// La bulle de VcContacts reste choisie (fond bleu soutenu) : ce n'est plus l'ambre ; l'autre bulle garde son bleu ordinaire.
check('... Valider (vrai clic) pose la règle : la bulle redevient bleue, sans info-bulle, d\'elle-même', !!ruleAfter && paintedAfter.every(p => !p.orange && !p.red && !p.title) && paintedAfter[0].background === 'rgb(185, 210, 248)'
  && paintedAfter[1].background === 'rgb(234, 242, 255)', { ruleAfter, paintedAfter });
const columnAfterLink = await columnButtonState();
check('... et sa barre, restée ouverte, n\'a plus « Colonne… » sans nouveau clic : la variable est liée', columnAfterLink.bar && columnAfterLink.present && columnAfterLink.hidden && columnAfterLink.boxes === 0, columnAfterLink);
await page.evaluate(async () => {
  document.querySelector('.tiptap').blur();
  await GristAPI.deleteLinkRule('VcContacts');
  Editor.setHTML('<p>Contact <span class="var-badge" data-table="VcContacts" data-column="Role" data-key="VcContacts.Role"></span>.</p>');
});
await page.setViewportSize({ width: 360, height: HEIGHT });
await page.waitForTimeout(500);
const unlinkedNarrowBox = await hitTest(UNLINKED_BADGE);
await page.mouse.click(unlinkedNarrowBox.x, unlinkedNarrowBox.y);
await page.waitForTimeout(500);
const unlinkedNarrow = await hitTest(COLUMN_BUTTON);
const unlinkedBarNarrow = await page.evaluate(() => { const r = document.querySelector('.v2-varfmt-toolbar.visible').getBoundingClientRect(); return { left: r.left, right: r.right, viewport: innerWidth, docOverflowX: document.scrollingElement.scrollWidth - innerWidth }; });
check('fenêtre de 360 px, bulle orange : « Colonne… » est atteignable à la vraie souris, la barre dans la fenêtre', unlinkedNarrow.found && unlinkedNarrow.inViewport && unlinkedNarrow.onTop
  && unlinkedBarNarrow.left >= 0 && unlinkedBarNarrow.right <= unlinkedBarNarrow.viewport + 0.5 && unlinkedBarNarrow.docOverflowX <= 0, { unlinkedNarrow, unlinkedBarNarrow });
await page.setViewportSize({ width: WIDTH, height: HEIGHT });
await page.waitForTimeout(300);

// Les boucles (21/10, carte « Oui, la boucle et le calcul ») : la variable d'une ligne de tableau répétée dont la table n'a plus de lien ne se déroule pas - la Lecture y écrit l'erreur - et sa
// bulle est ambre comme hors de la zone, avec « Colonne… » atteignable à la vraie souris ; la même ligne répétée sur TOUTES les lignes de la table trouve sa source : la bulle reste bleue.
const zoneMarkup = extra => {
  const loop = JSON.stringify(Object.assign({ repeat: 'row', table: 'VcContacts', via: null, within: null, by: null, all: null, filter: null, sort: { column: '', direction: 'asc' }, empty: 'header', emptyText: '', separator: ', ', lastSeparator: null }, extra)).replace(/"/g, '&quot;');
  return `<table><tbody><tr><td><p><span class="var-badge" data-table="VcContacts" data-column="Role" data-key="VcContacts.Role" data-loop="${loop}" data-loop-repeat="row"></span></p></td></tr></tbody></table>`;
};
await page.evaluate(async html => {
  document.querySelector('.tiptap').blur();
  await GristAPI.deleteLinkRule('VcContacts');
  Editor.setHTML(html);
}, zoneMarkup({}));
await page.waitForTimeout(500);
const zonePainted = await bubblePaint();
check('zone répétée dont la table n\'a plus de lien : la bulle de la ligne du tableau est ambre comme hors de la zone (la Lecture n\'y déroule rien)',
  zonePainted.length === 1 && zonePainted[0].orange && !zonePainted[0].red && zonePainted[0].background === 'rgb(255, 230, 199)' && /Aucun lien entre « VcContacts » et « VcDossiers »/.test(zonePainted[0].title), zonePainted);
const zoneBox = await hitTest(UNLINKED_BADGE);
await page.mouse.click(zoneBox.x, zoneBox.y);
await page.waitForTimeout(500);
const zoneButton = await hitTest(COLUMN_BUTTON);
check('... un vrai clic sur la bulle de la zone : « Colonne… » est atteignable à 700×400', zoneButton.found && zoneButton.inViewport && zoneButton.onTop, zoneButton);
await page.evaluate(async html => {
  document.querySelector('.tiptap').blur();
  Editor.setHTML(html);
}, zoneMarkup({ all: 'table' }));
await page.waitForTimeout(500);
const allPainted = await bubblePaint();
check('la même zone sur toutes les lignes de la table : sa source est là, la bulle reste bleue (ni ambre, ni rouge, sans info-bulle)',
  allPainted.length === 1 && !allPainted[0].orange && !allPainted[0].red && !allPainted[0].title && allPainted[0].background === 'rgb(234, 242, 255)', allPainted);
const allRowsBox = await hitTest(UNLINKED_BADGE);
await page.mouse.click(allRowsBox.x, allRowsBox.y);
await page.waitForTimeout(500);
const allRowsButton = await columnButtonState();
check('... et sa barre n\'a pas « Colonne… » : la variable est lue', allRowsButton.bar && allRowsButton.present && allRowsButton.hidden && allRowsButton.boxes === 0, allRowsButton);

// Panneau étroit : la barre nombre passe à la ligne si elle ne tient pas, ne dépasse pas la fenêtre, le bouton reste atteignable.
await page.setViewportSize({ width: 360, height: HEIGHT });
await page.waitForTimeout(300);
await openNumberBar();
const barNarrow = await numberBar();
const zeroNarrow = await hitTest('.v2-varfmt-toolbar.visible button[data-action="num-zero"]');
check('fenêtre de 360 px : la barre nombre reste dans la fenêtre et ne fait pas défiler la page', !!barNarrow && barNarrow.left >= 0 && barNarrow.right <= barNarrow.viewport + 0.5 && barNarrow.docOverflowX <= 0, barNarrow);
check('... et le bouton du zéro y reste atteignable', zeroNarrow.found && zeroNarrow.inViewport && zeroNarrow.onTop, zeroNarrow);
const columnNarrowSane = await columnButtonState();
check('... sans « Colonne… » sur cette bulle saine', columnNarrowSane.bar && columnNarrowSane.present && columnNarrowSane.hidden && columnNarrowSane.boxes === 0, columnNarrowSane);
await page.evaluate(() => {
  document.querySelector('.tiptap').blur();
  Editor.setHTML('<p>Dossier <span class="var-badge" data-table="VcDossiers" data-column="Intitule" data-key="VcDossiers.Intitule"></span> suivi.</p>');
  document.querySelector('.tiptap .var-badge[data-column="Intitule"]').scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(500);
const brokenNarrowBox = await hitTest(BROKEN_BADGE);
await page.mouse.click(brokenNarrowBox.x, brokenNarrowBox.y);
await page.waitForTimeout(500);
const columnNarrow = await hitTest(COLUMN_BUTTON);
const brokenBarNarrow = await page.evaluate(() => { const r = document.querySelector('.v2-varfmt-toolbar.visible').getBoundingClientRect(); return { left: r.left, right: r.right, viewport: innerWidth, docOverflowX: document.scrollingElement.scrollWidth - innerWidth }; });
check('... et sur une bulle cassée « Colonne… » est atteignable à la vraie souris, la barre dans la fenêtre', columnNarrow.found && columnNarrow.inViewport && columnNarrow.onTop
  && brokenBarNarrow.left >= 0 && brokenBarNarrow.right <= brokenBarNarrow.viewport + 0.5 && brokenBarNarrow.docOverflowX <= 0, { columnNarrow, brokenBarNarrow });
await page.setViewportSize({ width: WIDTH, height: HEIGHT });
await page.waitForTimeout(300);

// Texte « Avant » / « Après » d'une variable conditionnelle (demande d'Antoine, 2026-10-08 : « mettre une virgule que si la variable est activée par sa condition »), à la vraie
// souris et au clavier dans 700x400 : les deux champs de la fenêtre se trouvent (le corps défile, le titre et les boutons restent), la frappe réelle les remplit, l'aperçu cite la
// valeur avec son texte, Enregistrer le pose, la pastille de l'éditeur le montre et l'icône Condition s'allume ; rouverte, la fenêtre le reprend ; à 360 px de large, rien ne déborde.
await page.evaluate(() => {
  document.querySelector('.tiptap').blur();
  Editor.setHTML('<p>Projet <span class="var-badge" data-table="VcDossiers" data-column="Titre" data-key="VcDossiers.Titre"></span>porté par Dupont.</p>');
  document.querySelector('.tiptap .var-badge[data-column="Titre"]').scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(400);
const AFFIX_BADGE = '.tiptap .var-badge[data-column="Titre"]';
async function openAffixWindow() {
  const badgeBox = await hitTest(AFFIX_BADGE);
  await page.mouse.click(badgeBox.x, badgeBox.y);
  await page.waitForTimeout(300);
  const icon = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-condition"]');
  if (icon.found) await page.mouse.click(icon.x, icon.y);
  await page.waitForTimeout(300);
  return icon;
}
// Fait défiler le corps de la fenêtre à la molette réelle jusqu'à ce que le champ reçoive le clic (un champ rogné par la zone de défilement ne le reçoit pas).
async function revealField(selector) {
  let box = await hitTest(selector);
  const body = await hitTest('#var-condition-modal .pp-modal-body');
  for (let i = 0; i < 6 && box.found && !box.onTop && body.found; i++) {
    await page.mouse.move(body.x, body.y);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(100);
    box = await hitTest(selector);
  }
  return box;
}
const affixIcon = await openAffixWindow();
check('bulle Titre sans condition : l’icône Condition est atteignable', affixIcon.found && affixIcon.inViewport && affixIcon.onTop, affixIcon);
const affixWindow = await hitTest('#var-condition-modal .var-modal-content');
check('fenêtre de condition ouverte, entière dans 700x400', affixWindow.found && affixWindow.inViewport, affixWindow);
const beforeField = await revealField('#var-condition-before');
check('« Avant » : le champ est atteignable à la molette puis au clic', beforeField.found && beforeField.onTop && beforeField.inViewport, beforeField);
if (beforeField.found) { await page.mouse.click(beforeField.x, beforeField.y); await page.keyboard.type('('); }
const afterField = await revealField('#var-condition-after');
check('« Après » : le champ est atteignable', afterField.found && afterField.onTop && afterField.inViewport, afterField);
if (afterField.found) { await page.mouse.click(afterField.x, afterField.y); await page.keyboard.type('), '); }
await page.waitForTimeout(700);
const affixPreview = await page.evaluate(() => Array.from(document.querySelectorAll('#var-condition-modal .var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent));
check('la frappe réelle remplit les deux champs, espaces comprises, et l’aperçu cite la valeur avec son texte',
  (await page.evaluate(() => [document.getElementById('var-condition-before').value, document.getElementById('var-condition-after').value])).join('|') === '(|), '
  && affixPreview.length === 1 && /^Ligne sélectionnée \(n° 1\) : la variable affiche « \(Dossier A\), {2}»\.$/.test(affixPreview[0]), affixPreview);
const affixSave = await hitTest('#var-condition-modal .var-modal-primary');
const affixTitle = await hitTest('#var-condition-title');
check('titre et Enregistrer restent visibles et non recouverts pendant que le corps défile', affixSave.found && affixSave.inViewport && affixSave.onTop && affixTitle.found && affixTitle.inViewport && affixTitle.onTop, { affixSave, affixTitle });
if (affixSave.found) await page.mouse.click(affixSave.x, affixSave.y);
await page.waitForTimeout(300);
const affixSaved = await page.evaluate(() => {
  let attrs = null;
  EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge') attrs = { before: n.attrs.before, after: n.attrs.after, condition: n.attrs.condition }; });
  const badge = document.querySelector('.tiptap .var-badge[data-column="Titre"]');
  const br = badge.getBoundingClientRect();
  const chips = Array.from(badge.querySelectorAll('.var-badge-affix')).map(c => {
    const r = c.getBoundingClientRect();
    return { text: c.getAttribute('data-text'), shown: getComputedStyle(c, '::before').content, width: Math.round(r.width), inside: r.left >= br.left - 0.5 && r.right <= br.right + 0.5 && r.top >= br.top - 0.5 && r.bottom <= br.bottom + 0.5 };
  });
  return { attrs, chips, closed: document.getElementById('var-condition-modal').style.display === 'none' };
});
check('Enregistrer (vrai clic) pose le texte sur la bulle sans condition et ferme la fenêtre', affixSaved.closed && !!affixSaved.attrs && affixSaved.attrs.before === '(' && affixSaved.attrs.after === '), ' && !affixSaved.attrs.condition, affixSaved);
check('la pastille de l’éditeur montre « ( » avant et « ), » après, dans la bulle', affixSaved.chips.length === 2 && affixSaved.chips[0].text === '(' && affixSaved.chips[1].text === '), '
  && affixSaved.chips[0].shown === '"("' && affixSaved.chips[1].shown === '"), "' && affixSaved.chips.every(c => c.width > 0 && c.inside), affixSaved.chips);
const affixBadgeBox = await hitTest(AFFIX_BADGE);
await page.mouse.click(affixBadgeBox.x, affixBadgeBox.y);
await page.waitForTimeout(300);
const affixLit = await page.evaluate(() => { const b = document.querySelector('.v2-varfmt-toolbar.visible button[data-action="var-condition"]'); return !!b && b.classList.contains('is-active'); });
check('l’icône Condition est allumée sur une bulle qui a du texte « Avant » / « Après », sans condition', affixLit);
await openAffixWindow();
const reopenedAffix = await page.evaluate(() => [document.getElementById('var-condition-before').value, document.getElementById('var-condition-after').value]);
check('rouverte, la fenêtre reprend le texte enregistré', reopenedAffix.join('|') === '(|), ', reopenedAffix);
// Panneau étroit : la rangée passe sur deux colonnes, rien ne déborde de la fenêtre ni de la page, les champs restent atteignables.
await page.setViewportSize({ width: 360, height: HEIGHT });
await page.waitForTimeout(400);
const narrowWindow = await page.evaluate(() => {
  const content = document.querySelector('#var-condition-modal .var-modal-content');
  const r = content.getBoundingClientRect();
  const fields = ['var-condition-before', 'var-condition-after'].map(id => { const f = document.getElementById(id).getBoundingClientRect(); return { left: f.left, right: f.right, width: Math.round(f.width) }; });
  return { left: r.left, right: r.right, viewport: innerWidth, docOverflowX: document.scrollingElement.scrollWidth - innerWidth, contentOverflowX: content.scrollWidth - content.clientWidth, fields };
});
check('fenêtre de 360 px : la fenêtre et les deux champs restent dans la fenêtre, sans défilement horizontal', narrowWindow.left >= 0 && narrowWindow.right <= narrowWindow.viewport + 0.5 && narrowWindow.docOverflowX <= 0
  && narrowWindow.contentOverflowX <= 0 && narrowWindow.fields.every(f => f.left >= 0 && f.right <= narrowWindow.viewport + 0.5 && f.width >= 60), narrowWindow);
await page.setViewportSize({ width: WIDTH, height: HEIGHT });
await page.waitForTimeout(300);
const affixCancel = await hitTest('#var-condition-modal .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
if (affixCancel.found) await page.mouse.click(affixCancel.x, affixCancel.y);
await page.waitForTimeout(200);

// « Sinon afficher » (demande d'Antoine, 2026-10-08 : afficher une autre variable plutôt que de poser deux bulles aux conditions opposées), à la vraie souris et au clavier dans 700x400 :
// la ligne est là mais grisée tant qu'aucune règle n'est complète - la souris traverse le champ grisé, pour que l'info-bulle de la ligne dise pourquoi -, elle se dégrise dès que la règle
// est complète, sa liste avec recherche s'ouvre entière dans le panneau, un vrai clic choisit la variable, son « Avant » / « Après » reprennent ceux de la bulle et se modifient au clavier,
// l'aperçu dit ce que la ligne écrit, Enregistrer pose le sinon et la pastille « sinon » s'affiche DANS la bulle (un clic dessus sélectionne la bulle) ; rouverte, la fenêtre le reprend ;
// à 360 px de large, rien ne déborde.
await page.evaluate(() => {
  document.querySelector('.tiptap').blur();
  Editor.setHTML('<p>Dossier <span class="var-badge" data-table="VcDossiers" data-column="Titre" data-key="VcDossiers.Titre"></span> suivi.</p>');
  document.querySelector('.tiptap .var-badge[data-column="Titre"]').scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(400);
const OTHERWISE_FIELD = '#var-condition-modal .var-condition-otherwise-field';
// Le corps de la fenêtre défile à la molette réelle, titre et boutons en place : vers le bas, ou vers le haut avec un nombre négatif.
async function scrollWindowBody(dy) {
  const body = await hitTest('#var-condition-modal .pp-modal-body');
  await page.mouse.move(body.x, body.y);
  await page.mouse.wheel(0, dy);
  await page.waitForTimeout(120);
}
// La ligne « Sinon afficher » telle qu'une personne la voit : grisée ou non, valeur affichée, info-bulle, « Avant » / « Après » du sinon.
const otherwiseState = () => page.evaluate(() => {
  const byId = id => document.getElementById(id);
  const field = document.querySelector('#var-condition-modal .var-condition-otherwise-field');
  const trigger = field.querySelector('.ss-trigger');
  const label = document.querySelector('#var-condition-modal label[for="var-condition-otherwise"]');
  const shown = node => !node.hidden && node.getClientRects().length > 0;
  const r = field.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    label: label.textContent, greyed: byId('var-condition-otherwise').disabled && trigger.disabled, value: byId('var-condition-otherwise').value, shown: trigger.textContent,
    fieldTitle: field.title, labelTitle: label.title, mouseReachesRow: !!top && field.contains(top),
    couple: [shown(byId('var-condition-otherwise-before')), shown(byId('var-condition-otherwise-after'))],
    texts: [byId('var-condition-otherwise-before').value, byId('var-condition-otherwise-after').value],
  };
});
await openAffixWindow();
const otherwiseWindow = await hitTest('#var-condition-modal .var-modal-content');
check('Sinon afficher : la fenêtre de condition d’une bulle s’ouvre entière dans 700x400', otherwiseWindow.found && otherwiseWindow.inViewport, otherwiseWindow);
const greyedBox = await revealField(OTHERWISE_FIELD);
const greyed = await otherwiseState();
check('... la ligne est là, grisée sans règle complète : « — Aucune — » affiché, ni « Avant » ni « Après » du sinon', greyedBox.found && greyedBox.inViewport && greyed.label === 'Sinon afficher' && greyed.greyed
  && greyed.shown === '— Aucune —' && greyed.couple.join() === 'false,false', { greyedBox, greyed });
check('... la souris traverse le champ grisé jusqu’à la ligne, dont l’info-bulle (champ et étiquette) dit quoi faire', greyed.mouseReachesRow && /^Complétez d.abord une condition/.test(greyed.fieldTitle)
  && greyed.labelTitle === greyed.fieldTitle, greyed);
await page.mouse.click(greyedBox.x, greyedBox.y);
await page.waitForTimeout(150);
const greyedClick = await page.evaluate(() => ({ list: !!Array.from(document.querySelectorAll('.ss-panel')).find(p => !p.hidden), open: document.getElementById('var-condition-modal').style.display !== 'none' }));
check('... un vrai clic sur le champ grisé n’ouvre pas la liste et laisse la fenêtre ouverte', !greyedClick.list && greyedClick.open, greyedClick);
await scrollWindowBody(-1000);
check('... colonne Statut de la règle choisie à la vraie souris', await pickColumn('#var-condition-modal', 'Statut'));
const normalValue = await hitTest('#var-condition-modal .macro-rule-value');
if (normalValue.found) { await page.mouse.click(normalValue.x, normalValue.y); await page.keyboard.type('Normal'); }
await page.waitForTimeout(60);
const ungreyed = await otherwiseState();
check('... la règle complète (« Statut = Normal » tapée au clavier) dégrise la ligne tout de suite, sans attendre l’aperçu, et l’info-bulle change', !ungreyed.greyed
  && /^La variable écrite à la place/.test(ungreyed.fieldTitle) && ungreyed.labelTitle === ungreyed.fieldTitle, ungreyed);
// À l'ouverture, dans le panneau bas, ce qui se voyait AVANT le sinon doit rester où c'était : les règles, « Avant » / « Après » et la première ligne de l'aperçu entiers dans le corps
// de la fenêtre, sans défiler ; la ligne « Sinon afficher » vient en dessous de l'aperçu (un premier jet remontait l'aperçu sous les règles et faisait descendre « Avant » / « Après »
// sous le pli : seule une mesure l'a montré).
await page.waitForTimeout(450);
const openingView = await page.evaluate(() => {
  const body = document.querySelector('#var-condition-modal .pp-modal-body');
  const view = body.getBoundingClientRect();
  const inView = node => { const r = node.getBoundingClientRect(); return r.top >= view.top - 0.5 && r.bottom <= view.bottom + 0.5; };
  const lines = Array.from(document.querySelectorAll('#var-condition-modal .var-condition-debug-line')).filter(line => !line.hidden);
  const field = document.querySelector('#var-condition-modal .var-condition-otherwise-field');
  return {
    scrollTop: body.scrollTop,
    rules: inView(document.querySelector('#var-condition-modal .var-condition-rules')),
    affix: inView(document.getElementById('var-condition-before')) && inView(document.getElementById('var-condition-after')),
    firstLine: lines.length > 0 && inView(lines[0]),
    sinonUnderPreview: lines.length > 0 && field.getBoundingClientRect().top >= lines[lines.length - 1].getBoundingClientRect().bottom,
  };
});
check('... à l’ouverture, les règles, « Avant » / « Après » et la première ligne de l’aperçu tiennent entiers sans défiler, la ligne « Sinon afficher » vient sous l’aperçu',
  openingView.scrollTop === 0 && openingView.rules && openingView.affix && openingView.firstLine && openingView.sinonUnderPreview, openingView);
const mainBefore = await revealField('#var-condition-before');
if (mainBefore.found) { await page.mouse.click(mainBefore.x, mainBefore.y); await page.keyboard.type('('); }
const mainAfter = await revealField('#var-condition-after');
if (mainAfter.found) { await page.mouse.click(mainAfter.x, mainAfter.y); await page.keyboard.type('), '); }
const sinonTrigger = await revealField(OTHERWISE_FIELD);
check('... le champ est atteignable à la molette puis au clic, une fois la règle complète', sinonTrigger.found && sinonTrigger.inViewport && sinonTrigger.onTop, sinonTrigger);
if (sinonTrigger.found) await page.mouse.click(sinonTrigger.x, sinonTrigger.y);
await page.waitForTimeout(250);
const sinonList = await page.evaluate(() => {
  const panel = Array.from(document.querySelectorAll('.ss-panel')).find(p => !p.hidden);
  if (!panel) return null;
  const r = panel.getBoundingClientRect();
  const first = panel.querySelector('.ss-option');
  const fr = first ? first.getBoundingClientRect() : null;
  const hit = fr ? document.elementFromPoint(fr.left + fr.width / 2, fr.top + fr.height / 2) : null;
  const names = Array.from(panel.querySelectorAll('.ss-option .ss-name')).map(n => n.textContent);
  return {
    left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight, docOverflowX: document.scrollingElement.scrollWidth - innerWidth,
    firstOnTop: !!first && !!hit && (hit === first || first.contains(hit)), names: names.slice(0, 4), focusInSearch: document.activeElement === panel.querySelector('.ss-input'),
  };
});
check('un vrai clic sur le champ ouvre la liste : entière dans la fenêtre, première ligne au premier plan, la zone de recherche prend le focus', !!sinonList && sinonList.left >= 0 && sinonList.top >= 0
  && sinonList.right <= sinonList.width + 0.5 && sinonList.bottom <= sinonList.height + 0.5 && sinonList.docOverflowX <= 0 && sinonList.firstOnTop && sinonList.focusInSearch, sinonList);
check('... « — Aucune — » vient en tête, puis les colonnes de la table de la page', !!sinonList && sinonList.names[0] === '— Aucune —' && sinonList.names.slice(1).every(n => n.indexOf('VcDossiers.') === 0), sinonList && sinonList.names);
await page.keyboard.type('NomPrenom');
await page.waitForTimeout(200);
const sinonRow = await page.evaluate(() => {
  const panel = Array.from(document.querySelectorAll('.ss-panel')).find(p => !p.hidden);
  const row = panel && Array.from(panel.querySelectorAll('.ss-option')).find(r => r.querySelector('.ss-name').textContent === 'VcAnnuaire.NomPrenom');
  if (!row) return null;
  const r = row.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, shown: Array.from(panel.querySelectorAll('.ss-option .ss-name')).map(n => n.textContent) };
});
check('... la frappe filtre la liste : « NomPrenom » ne laisse que les colonnes qui le contiennent', !!sinonRow && sinonRow.shown.every(n => /nomprenom/i.test(n)), sinonRow);
if (sinonRow) await page.mouse.click(sinonRow.x, sinonRow.y);
await page.waitForTimeout(400);
const chosen = await otherwiseState();
const listClosed = await page.evaluate(() => !Array.from(document.querySelectorAll('.ss-panel')).find(p => !p.hidden));
check('... un vrai clic sur la ligne choisit la variable : liste fermée, « Avant » / « Après » du sinon visibles et repris de ceux de la bulle', chosen.value === 'VcAnnuaire.NomPrenom'
  && chosen.shown === 'VcAnnuaire.NomPrenom' && listClosed && chosen.couple.join() === 'true,true' && chosen.texts.join('|') === '(|), ', { chosen, listClosed });
const sinonBefore = await revealField('#var-condition-otherwise-before');
if (sinonBefore.found) { await page.mouse.click(sinonBefore.x, sinonBefore.y); await page.keyboard.press('Control+A'); await page.keyboard.type('['); }
const sinonAfter = await revealField('#var-condition-otherwise-after');
if (sinonAfter.found) { await page.mouse.click(sinonAfter.x, sinonAfter.y); await page.keyboard.press('Control+A'); await page.keyboard.type('], '); }
const typed = await otherwiseState();
check('... « Avant » et « Après » du sinon sont atteignables à la molette et se remplacent au clavier, espaces comprises', sinonBefore.found && sinonBefore.onTop && sinonAfter.found && sinonAfter.onTop
  && typed.texts.join('|') === '[|], ', { sinonBefore, sinonAfter, typed });
await page.waitForTimeout(700);
const sinonPreview = await page.evaluate(() => ({
  lines: Array.from(document.querySelectorAll('#var-condition-modal .var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent),
  expected: I18n.t('varCond.debug.currentNotMetOtherwise', { id: 1, value: '[Dupont Jean], ' }),
}));
check('l’aperçu dit ce que la ligne écrit : la ligne sélectionnée (Urgent) ne remplit pas « Statut = Normal », la variable affiche le sinon avec son texte, et il compte les autres lignes',
  sinonPreview.lines.length === 2 && sinonPreview.lines[0] === sinonPreview.expected && /1 ligne sur 2 remplit la condition ; 1 autre affiche le sinon\./.test(sinonPreview.lines[1]), sinonPreview);
const sinonSave = await hitTest('#var-condition-modal .var-modal-primary');
const sinonTitle = await hitTest('#var-condition-title');
const sinonWindow = await hitTest('#var-condition-modal .var-modal-content');
check('titre et Enregistrer restent visibles et non recouverts, la fenêtre entière dans le panneau, la ligne du sinon remplie', sinonSave.found && sinonSave.inViewport && sinonSave.onTop
  && sinonTitle.found && sinonTitle.inViewport && sinonTitle.onTop && sinonWindow.found && sinonWindow.inViewport, { sinonSave, sinonTitle, sinonWindow });
if (sinonSave.found) await page.mouse.click(sinonSave.x, sinonSave.y);
await page.waitForTimeout(300);
const sinonSaved = await page.evaluate(() => {
  let attrs = null;
  EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge') attrs = { condition: n.attrs.condition, before: n.attrs.before, after: n.attrs.after, otherwise: n.attrs.otherwise }; });
  const badge = document.querySelector('.tiptap .var-badge[data-column="Titre"]');
  const part = badge.querySelector('.var-badge-otherwise');
  const br = badge.getBoundingClientRect();
  const pr = part ? part.getBoundingClientRect() : null;
  const drawn = selector => { const node = badge.querySelector(selector); return node ? getComputedStyle(node, '::before').content : null; };
  return {
    attrs, closed: document.getElementById('var-condition-modal').style.display === 'none', word: drawn('.var-badge-otherwise-word'), name: drawn('.var-badge-otherwise-name'),
    chips: Array.from(badge.querySelectorAll('.var-badge-otherwise .var-badge-affix')).map(c => c.getAttribute('data-text')),
    inside: !!pr && pr.width > 0 && pr.left >= br.left - 0.5 && pr.right <= br.right + 0.5 && pr.right <= innerWidth + 0.5, ownText: badge.textContent,
  };
});
const sinonAttrs = sinonSaved.attrs;
check('Enregistrer (vrai clic) pose la condition, le texte de la bulle et le sinon d’un seul geste, et ferme la fenêtre', sinonSaved.closed && !!sinonAttrs && !!sinonAttrs.condition
  && sinonAttrs.condition.rules.length === 1 && sinonAttrs.condition.rules[0].column === 'Statut' && sinonAttrs.condition.rules[0].value === 'Normal' && sinonAttrs.before === '(' && sinonAttrs.after === '), '
  && JSON.stringify(sinonAttrs.otherwise) === JSON.stringify({ table: 'VcAnnuaire', column: 'NomPrenom', key: 'VcAnnuaire.NomPrenom', before: '[', after: '], ' }), sinonSaved);
check('la pastille de l’éditeur montre « sinon », « [ », la variable du sinon et « ], » dans la bulle, sans ajouter de texte à la bulle', sinonSaved.word === '"sinon"' && sinonSaved.name === '"#VcAnnuaire.NomPrenom"'
  && sinonSaved.chips.join('|') === '[|], ' && sinonSaved.inside && !/sinon|NomPrenom/.test(sinonSaved.ownText), sinonSaved);
const pastilleBox = await hitTest(AFFIX_BADGE + ' .var-badge-otherwise');
if (pastilleBox.found) await page.mouse.click(pastilleBox.x, pastilleBox.y);
await page.waitForTimeout(300);
const reopenIcon = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-condition"]');
const reopenLit = await page.evaluate(() => { const b = document.querySelector('.v2-varfmt-toolbar.visible button[data-action="var-condition"]'); return !!b && b.classList.contains('is-active'); });
check('un vrai clic sur la pastille « sinon » sélectionne la bulle : sa barre s’ouvre, l’icône Condition est atteignable et allumée', pastilleBox.found && pastilleBox.onTop && reopenIcon.found
  && reopenIcon.inViewport && reopenIcon.onTop && reopenLit, { pastilleBox, reopenIcon, reopenLit });
if (reopenIcon.found) await page.mouse.click(reopenIcon.x, reopenIcon.y);
await page.waitForTimeout(300);
const reopenedBox = await revealField(OTHERWISE_FIELD);
const reopenedOtherwise = await otherwiseState();
check('rouverte, la fenêtre reprend le sinon : variable, « Avant » / « Après », ligne dégrisée', reopenedBox.found && reopenedBox.inViewport && !reopenedOtherwise.greyed
  && reopenedOtherwise.value === 'VcAnnuaire.NomPrenom' && reopenedOtherwise.shown === 'VcAnnuaire.NomPrenom' && reopenedOtherwise.couple.join() === 'true,true' && reopenedOtherwise.texts.join('|') === '[|], ', reopenedOtherwise);
// Panneau étroit : la ligne et ses deux champs restent dans la fenêtre, rien ne fait défiler la page.
await page.setViewportSize({ width: 360, height: HEIGHT });
await page.waitForTimeout(400);
const sinonNarrow = await page.evaluate(() => {
  const content = document.querySelector('#var-condition-modal .var-modal-content');
  const r = content.getBoundingClientRect();
  const boxes = ['.var-condition-otherwise-field', '#var-condition-otherwise-before', '#var-condition-otherwise-after'].map(selector => {
    const f = document.querySelector('#var-condition-modal ' + selector).getBoundingClientRect();
    return { left: f.left, right: f.right, width: Math.round(f.width) };
  });
  return { left: r.left, right: r.right, viewport: innerWidth, docOverflowX: document.scrollingElement.scrollWidth - innerWidth, contentOverflowX: content.scrollWidth - content.clientWidth, boxes };
});
check('fenêtre de 360 px : la ligne du sinon et ses deux champs restent dans la fenêtre, sans défilement horizontal', sinonNarrow.left >= 0 && sinonNarrow.right <= sinonNarrow.viewport + 0.5
  && sinonNarrow.docOverflowX <= 0 && sinonNarrow.contentOverflowX <= 0 && sinonNarrow.boxes.every(b => b.left >= 0 && b.right <= sinonNarrow.viewport + 0.5 && b.width >= 60), sinonNarrow);
await page.setViewportSize({ width: WIDTH, height: HEIGHT });
await page.waitForTimeout(300);
const sinonCancel = await hitTest('#var-condition-modal .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
if (sinonCancel.found) await page.mouse.click(sinonCancel.x, sinonCancel.y);
await page.waitForTimeout(200);

// 3c) Deux colonnes Référence vers la même table (demande d'Antoine, 2026-10-08 : « Demandeur » et « Valideur » désignent deux personnes de l'annuaire dans la même ligne) :
// « Autres attributs » d'une bulle Référence de la page suit la colonne cliquée - la personne de Valideur, pas celle du lien de VcAnnuaire (Demandeur) -, sans toucher à ce lien. Tout
// à la vraie souris à 700x400 : la fenêtre tient dans le panneau, le fil d'Ariane (VcBinome › Valideur) est affiché, la case et Insérer se cliquent, la bulle posée porte le chemin.
await page.evaluate(async () => {
  document.querySelector('.tiptap').blur();
  const stub = window.__gristStub;
  stub.setVariables('VcBinome', { Titre: 'Text', Demandeur: 'Ref:VcAnnuaire', Valideur: 'Ref:VcAnnuaire', gristHelper_Display: 'Text', gristHelper_Display2: 'Text' },
    null, { Demandeur: 'gristHelper_Display', Valideur: 'gristHelper_Display2' });
  stub.setRows('VcBinome', [{ id: 1, Titre: 'Binôme 1', Demandeur: 7, Valideur: 8, gristHelper_Display: 'Dupont Jean', gristHelper_Display2: 'Martin Anne' }]);
  await GristAPI.refreshSchema();
  await GristAPI.deleteLinkRule('VcAnnuaire');
  await GristAPI.saveLinkRule('VcAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Demandeur' });
  stub.fireRecord({ id: 1, Titre: 'Binôme 1', Demandeur: 'Dupont Jean', Valideur: 'Martin Anne' }, 'VcBinome');
  const badge = col => `<span class="var-badge" data-table="VcBinome" data-column="${col}" data-key="VcBinome.${col}"></span>`;
  Editor.setHTML(`<p>Demandeur ${badge('Demandeur')}.</p><p>Valideur : ${badge('Valideur')} fin.</p>`);
  document.querySelector('.tiptap .var-badge[data-column="Valideur"]').scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(400);
const linkedValues = () => page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('#var-linked-modal .var-linked-row')).map(r => [r.dataset.col, r.querySelector('.var-linked-value').textContent])));
await openLinkedFor('Valideur');
const twoRefs = await linkedState();
const twoRefsValues = await linkedValues();
check('deux Références vers VcAnnuaire : Autres attributs sur #VcBinome.Valideur s’ouvre sur les colonnes de VcAnnuaire, fil d’Ariane VcBinome › Valideur, fenêtre dans le panneau',
  twoRefs.open && twoRefs.title.includes('VcAnnuaire') && JSON.stringify(twoRefs.cols) === JSON.stringify(['NomPrenom', 'Telephone', 'Naissance', 'Service']) && !twoRefs.crumbsHidden
  && JSON.stringify(twoRefs.crumbs) === JSON.stringify(['VcBinome', 'Valideur']) && twoRefs.inViewport && twoRefs.overflow <= 0, twoRefs);
check('... avec les valeurs de la personne de Valideur (Martin Anne), pas celles du lien de VcAnnuaire (Demandeur, Dupont Jean)',
  twoRefsValues.NomPrenom === 'Martin Anne' && twoRefsValues.Telephone === '06 55 66 77 88', twoRefsValues);
const binomePhone = await hitTest('#var-linked-modal .var-linked-row[data-col="Telephone"] .var-linked-pick');
check('la ligne Telephone est visible et au premier plan', binomePhone.found && binomePhone.inViewport && binomePhone.onTop, binomePhone);
if (binomePhone.found) await page.mouse.click(binomePhone.x, binomePhone.y);
await page.waitForTimeout(100);
const binomeInsert = await hitTest('#var-linked-modal .var-modal-primary');
check('Insérer est visible, au premier plan et actif', binomeInsert.found && binomeInsert.inViewport && binomeInsert.onTop && (await linkedState()).insert.includes('1'), binomeInsert);
if (binomeInsert.found) await page.mouse.click(binomeInsert.x, binomeInsert.y);
await page.waitForTimeout(250);
const binomeSeq = await page.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.lastChild.forEach(n => out.push(n.type.name === 'varBadge' ? '#' + n.attrs.key : n.text));
  return out;
});
check('Insérer (vrai clic) ajoute #VcBinome.Valideur.Telephone (un chemin) juste après la variable, pas #VcAnnuaire.Telephone',
  JSON.stringify(binomeSeq) === JSON.stringify(['Valideur : ', '#VcBinome.Valideur', ' ', '#VcBinome.Valideur.Telephone', ' fin.']), binomeSeq);
const binomeAfter = await page.evaluate(async () => {
  const box = document.createElement('div');
  box.innerHTML = await ReaderMode.preview(Editor.getHTML(), 'VcBinome', GristAPI.getCurrentRecord());
  const rule = GristAPI.getLinkRule('VcAnnuaire');
  return { text: box.textContent, rule: rule ? rule.colonneSource : null };
});
check('la bulle se lit avec la personne de Valideur (Martin Anne 06 55 66 77 88) et le lien de VcAnnuaire reste celui de Demandeur',
  binomeAfter.text.includes('Valideur : Martin Anne 06 55 66 77 88 fin.') && binomeAfter.text.includes('Demandeur Dupont Jean.') && binomeAfter.rule === 'Demandeur', binomeAfter);
await openLinkedFor('Demandeur');
const demandeurState = await linkedState();
const demandeurValues = await linkedValues();
check('Autres attributs sur #VcBinome.Demandeur : la personne de Demandeur (Dupont Jean), fil d’Ariane VcBinome › Demandeur',
  demandeurState.open && demandeurValues.NomPrenom === 'Dupont Jean' && JSON.stringify(demandeurState.crumbs) === JSON.stringify(['VcBinome', 'Demandeur']), { demandeurState, demandeurValues });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// 2b) « Et » / « Ou » devant la deuxième règle (demande d'Antoine du 2026-10-13 : « pouvoir choisir en cliquant dessus si je veux un "ou" »), à la vraie souris et au
// vrai clavier à 700x400 : le mot est un bouton - « Si » reste un texte -, visible et au premier plan, sur les 34 px du connecteur (les champs des deux règles
// restent alignés, la colonne n'est pas poussée), y compris dans un panneau de 360 px ; un vrai clic le met sur « Ou » (la liste « au moins une » du haut, l'aperçu,
// la bulle enregistrée et sa Lecture suivent), Entrée puis Espace le font basculer au clavier et le focus reste sur lui ; l'info-bulle et le nom accessible disent ce que fait
// le clic ; la liste du haut et le bouton restent d'accord. Ligne 1 : Urgent, 1200 ; ligne 2 : Normal, 50 ; « Statut = Normal » est fausse pour la 1 et vraie pour la 2, « Montant ≥ 1000 » l'inverse : « Et » ne retient
// aucune ligne, « Ou » les retient toutes les deux.
{
await fireDossier(1200);
await page.evaluate(() => Editor.setHTML('<p>Titre : <span class="var-badge" data-table="VcDossiers" data-column="Titre" data-key="VcDossiers.Titre"></span></p>'));
await page.waitForTimeout(300);
const andOrWords = await page.evaluate(() => ({
  and: I18n.t('varCond.ruleAnd'), or: I18n.t('varCond.ruleOr'), toOr: I18n.t('varCond.connectorToOr'), toAnd: I18n.t('varCond.connectorToAnd'), first: I18n.t('macro.modal.ruleIf'),
  met: I18n.t('varCond.debug.currentMet', { id: 1, value: 'Dossier A' }), notMet: I18n.t('varCond.debug.currentNotMet', { id: 1 }),
  count: I18n.t('varCond.debug.count', { table: 'VcDossiers', count: 2, total: 2 }), none: I18n.t('varCond.debug.none', { table: 'VcDossiers', total: 2 }),
}));
await openConditionFor('Titre');
await pickColumn(MODAL, 'Statut');
await page.waitForTimeout(100);
const andOrFirst = await hitTest(`${MODAL} .macro-rule-value`);
if (andOrFirst.found) { await page.mouse.click(andOrFirst.x, andOrFirst.y); await page.keyboard.type('Normal'); }
const andOrAdd = await hitTest(`${MODAL} .var-condition-add`);
if (andOrAdd.found) await page.mouse.click(andOrAdd.x, andOrAdd.y);
await page.waitForTimeout(150);
await pickColumn(`${MODAL} .macro-rule-row:nth-of-type(2)`, 'Montant');
await page.waitForTimeout(100);
await page.selectOption(`${MODAL} .macro-rule-row:nth-of-type(2) > select`, '≥');
const andOrSecond = await hitTest(`${MODAL} .macro-rule-row:nth-of-type(2) .macro-rule-value`);
if (andOrSecond.found) { await page.mouse.click(andOrSecond.x, andOrSecond.y); await page.keyboard.type('1000'); }
await page.waitForTimeout(700);
const TOGGLE = `${MODAL} .macro-rule-row:nth-of-type(2) .macro-rule-connector-toggle`;
const andOrState = () => page.evaluate(() => {
  const modal = document.getElementById('var-condition-modal');
  const rows = Array.from(modal.querySelectorAll('.macro-rule-row'));
  const rect = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, mid: (r.top + r.bottom) / 2, w: r.width }; };
  const content = modal.querySelector('.var-modal-content').getBoundingClientRect();
  const toggle = modal.querySelector('.macro-rule-connector-toggle');
  return {
    tags: rows.map(r => r.querySelector('.macro-rule-connector').tagName), words: rows.map(r => r.querySelector('.macro-rule-connector').textContent),
    toggles: modal.querySelectorAll('.macro-rule-connector-toggle').length, title: toggle ? toggle.title : null, aria: toggle ? toggle.getAttribute('aria-label') : null,
    mode: modal.querySelector('.var-condition-mode select').value, modeText: modal.querySelector('.var-condition-mode select').selectedOptions[0].textContent,
    lines: Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent),
    connectors: rows.map(r => rect(r.querySelector('.macro-rule-connector'))), columns: rows.map(r => rect(r.querySelector('.macro-rule-column-wrap'))),
    window: { l: content.left, r: content.right }, focusedToggle: !!toggle && document.activeElement === toggle,
    overflowX: modal.querySelector('.var-modal-content').scrollWidth - modal.querySelector('.var-modal-content').clientWidth, docOverflowX: document.documentElement.scrollWidth - innerWidth,
  };
});
const layoutOk = st => st.connectors.every((c, i) => Math.abs(c.w - 34) < 1.5 && c.r <= st.columns[i].l && Math.abs(c.mid - st.columns[i].mid) < 4 && c.l >= st.window.l && c.r <= st.window.r)
  && Math.abs(st.columns[0].l - st.columns[1].l) < 1.5 && st.overflowX <= 0 && st.docOverflowX <= 0;
const andOrToggle = await hitTest(TOGGLE);
const asAnd = await andOrState();
check('deux règles : le « Et » de la deuxième est un bouton visible, dans le panneau et au premier plan ; « Si » reste un texte',
  andOrToggle.found && andOrToggle.inViewport && andOrToggle.onTop && JSON.stringify(asAnd.tags) === '["SPAN","BUTTON"]' && asAnd.words[0] === andOrWords.first && asAnd.words[1] === andOrWords.and && asAnd.toggles === 1, { andOrToggle, asAnd });
check('... sur les 34 px du connecteur : les deux colonnes restent alignées, rien n\'est poussé ni coupé, pas de débordement latéral', layoutOk(asAnd), asAnd);
check('... son info-bulle et son nom accessible disent ce que fait le clic (« relier toutes les conditions par « Ou » »)', asAnd.title === andOrWords.toOr && asAnd.aria === andOrWords.and + ' : ' + andOrWords.toOr, asAnd);
check('« Et » : la liste du haut dit « toutes » et l\'aperçu masque la variable (aucune des 2 lignes)', asAnd.mode === 'all' && asAnd.lines[0] === andOrWords.notMet && asAnd.lines[1] === andOrWords.none, asAnd);
await page.setViewportSize({ width: 360, height: HEIGHT });
await page.waitForTimeout(250);
const narrowToggle = await hitTest(TOGGLE);
const narrowAnd = await andOrState();
check('panneau de 360 px : le bouton reste visible, au premier plan, dans la fenêtre et sans débordement latéral', narrowToggle.found && narrowToggle.inViewport && narrowToggle.onTop
  && narrowAnd.connectors[1].l >= narrowAnd.window.l && narrowAnd.connectors[1].r <= narrowAnd.window.r && narrowAnd.overflowX <= 0 && narrowAnd.docOverflowX <= 0, { narrowToggle, narrowAnd });
await page.setViewportSize({ width: WIDTH, height: HEIGHT });
await page.waitForTimeout(250);
const clickToggle = await hitTest(TOGGLE);
if (clickToggle.found) await page.mouse.click(clickToggle.x, clickToggle.y);
await page.waitForTimeout(700);
const asOr = await andOrState();
check('vrai clic sur « Et » : le mot devient « Ou », la liste du haut dit « au moins une » et l\'info-bulle propose « Et »',
  asOr.words[1] === andOrWords.or && asOr.mode === 'any' && asOr.title === andOrWords.toAnd && asOr.aria === andOrWords.or + ' : ' + andOrWords.toAnd, asOr);
check('... l\'aperçu suit : la ligne 1 remplit la condition (« Montant ≥ 1000 »), les 2 lignes la remplissent',
  asOr.lines[0] === andOrWords.met && asOr.lines[1].startsWith(andOrWords.count), asOr);
check('... le focus reste sur le bouton retracé, et la mise en page ne bouge pas (34 px, colonnes alignées)', asOr.focusedToggle && layoutOk(asOr), asOr);
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
const byEnter = await andOrState();
check('Entrée sur le bouton (au clavier) : retour à « Et », la liste du haut dit « toutes », le focus reste sur lui',
  byEnter.words[1] === andOrWords.and && byEnter.mode === 'all' && byEnter.focusedToggle && byEnter.lines[0] === andOrWords.notMet, byEnter);
await page.keyboard.press('Space');
await page.waitForTimeout(700);
const bySpace = await andOrState();
check('Espace sur le bouton : « Ou » de nouveau, le focus reste sur lui', bySpace.words[1] === andOrWords.or && bySpace.mode === 'any' && bySpace.focusedToggle, bySpace);
// La liste du haut change le mot, comme le bouton change la liste.
await page.selectOption(`${MODAL} .var-condition-mode select`, 'all');
await page.waitForTimeout(400);
const byList = await andOrState();
await page.selectOption(`${MODAL} .var-condition-mode select`, 'any');
await page.waitForTimeout(400);
const byListBack = await andOrState();
check('la liste du haut et le bouton restent d\'accord : « toutes » met « Et », « au moins une » met « Ou »', byList.words[1] === andOrWords.and && byListBack.words[1] === andOrWords.or, { byList: byList.words, byListBack: byListBack.words });
check('rien n\'est écrit sur la bulle avant Enregistrer', (await conditionOn('Titre')) == null);
const andOrSave = await hitTest(`${MODAL} .var-modal-primary`);
if (andOrSave.found) await page.mouse.click(andOrSave.x, andOrSave.y);
await page.waitForTimeout(300);
const orRules = [{ column: 'Statut', operator: '=', value: 'Normal' }, { column: 'Montant', operator: '≥', value: '1000' }];
check('Enregistrer (vrai clic) pose « au moins une » avec les deux règles sur la bulle', JSON.stringify(await conditionOn('Titre')) === JSON.stringify({ mode: 'any', rules: orRules }), await conditionOn('Titre'));
const readOr = await readBubbleInReaderMode();
check('Lecture : « Ou » - la ligne 1 remplit « Montant ≥ 1000 » - la variable s\'affiche (Dossier A)', readOr.text === 'Dossier A' && readOr.backToEdit, readOr);
// Retour sur « Et » depuis la fenêtre rouverte : la variable disparaît en Lecture.
await openConditionFor('Titre');
const reopened = await andOrState();
const reopenedToggle = await hitTest(TOGGLE);
if (reopenedToggle.found) await page.mouse.click(reopenedToggle.x, reopenedToggle.y);
await page.waitForTimeout(500);
const reopenedAfter = await andOrState();
check('fenêtre rouverte : « Ou » est relu de la bulle ; un clic le remet sur « Et »', reopened.words[1] === andOrWords.or && reopened.mode === 'any' && reopenedAfter.words[1] === andOrWords.and && reopenedAfter.mode === 'all', { reopened: reopened.words, after: reopenedAfter.words });
const andOrSave2 = await hitTest(`${MODAL} .var-modal-primary`);
if (andOrSave2.found) await page.mouse.click(andOrSave2.x, andOrSave2.y);
await page.waitForTimeout(300);
const readAnd = await readBubbleInReaderMode();
check('Lecture : « Et » - une seule des deux règles est vraie - la variable disparaît', readAnd.text === null && readAnd.backToEdit && JSON.stringify(await conditionOn('Titre')) === JSON.stringify({ mode: 'all', rules: orRules }), { readAnd, saved: await conditionOn('Titre') });
}

// 2c) Groupes « A et (B ou C) » (demande d'Antoine du 2026-10-14 : « des conditions plus complexes avec des parenthèses ») à la vraie souris et au vrai clavier à 700x400 : « + Groupe »
// partage la ligne de « + Ajouter une condition » et de Copier / Coller sans la faire passer à la suivante (la fenêtre d'une condition sans groupe garde sa hauteur) ; un vrai clic
// pose l'encadré (« Et » bouton devant lui, sa liste, sa croix, ses deux lignes alignées, son « + Ajouter une condition »), dans la fenêtre et sans débordement latéral, y compris à
// 360 px où le « Et » passe au-dessus de l'encadré ; les vrais clics sur le « Ou » du groupe, sur le « Et » de devant et sur « + Ajouter une condition » de l'encadré changent chacun
// ce qu'ils disent (le groupe, le premier niveau, une ligne de plus), l'aperçu lit les parenthèses, Enregistrer les écrit et la Lecture les suit. Ligne 1 : Urgent, 1200 ; ligne 2 :
// Normal, 50 ; « Statut = Urgent » (A), « Montant ≥ 1000 » (B), « Montant < 100 » (C) : « A et (B ou C) » retient la 1 seule, à plat « et » aucune, à plat « ou » les deux.
{
await fireDossier(1200);
await page.evaluate(() => Editor.setHTML('<p>Titre : <span class="var-badge" data-table="VcDossiers" data-column="Titre" data-key="VcDossiers.Titre"></span></p>'));
await page.waitForTimeout(300);
const gw = await page.evaluate(() => ({
  and: I18n.t('varCond.ruleAnd'), or: I18n.t('varCond.ruleOr'), first: I18n.t('macro.modal.ruleIf'), toOr: I18n.t('varCond.connectorToOr'), toAndInGroup: I18n.t('varCond.group.connectorToAnd'),
  met: I18n.t('varCond.debug.currentMet', { id: 1, value: 'Dossier A' }), notMet: I18n.t('varCond.debug.currentNotMet', { id: 1 }),
  count1: I18n.t('varCond.debug.count', { table: 'VcDossiers', count: 1, total: 2 }), count2: I18n.t('varCond.debug.count', { table: 'VcDossiers', count: 2, total: 2 }),
  none: I18n.t('varCond.debug.none', { table: 'VcDossiers', total: 2 }),
}));
const GROUP_ROW = i => `${MODAL} [data-rule-path="1.${i}"]`;
const rectOf = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, mid: (r.top + r.bottom) / 2, w: r.width, h: r.height }; };
// Fait défiler le corps de la fenêtre à la molette réelle, vers le bas ou vers le haut, jusqu'à ce que l'élément soit entièrement dans sa zone visible.
async function bringIntoView(selector) {
  for (let i = 0; i < 12; i++) {
    const info = await page.evaluate(sel => {
      const el = document.querySelector(sel), body = document.querySelector('#var-condition-modal .pp-modal-body');
      if (!el || !body) return null;
      const r = el.getBoundingClientRect(), b = body.getBoundingClientRect();
      return { above: r.top < b.top + 2, below: r.bottom > b.bottom - 2, x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, selector);
    if (!info || (!info.above && !info.below)) break;
    await page.mouse.move(info.x, info.y);
    await page.mouse.wheel(0, info.below ? 90 : -90);
    await page.waitForTimeout(80);
  }
  return hitTest(selector);
}
const clickOn = async selector => { const box = await bringIntoView(selector); if (box.found) await page.mouse.click(box.x, box.y); await page.waitForTimeout(200); return box; };
const typeInto = async (selector, text) => { const box = await bringIntoView(selector); if (box.found) { await page.mouse.click(box.x, box.y); await page.keyboard.type(text); } return box; };
const groupState = () => page.evaluate(() => {
  const rectOf2 = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, mid: (r.top + r.bottom) / 2, w: r.width, h: r.height }; };
  const modal = document.getElementById('var-condition-modal');
  const content = modal.querySelector('.var-modal-content');
  const win = content.getBoundingClientRect();
  const box = modal.querySelector('.cond-group');
  const head = box && box.querySelector(':scope > .cond-group-head');
  const outer = modal.querySelector('.cond-group-row > .macro-rule-connector');
  const rows = box ? Array.from(box.querySelectorAll(':scope > .macro-rule-row')) : [];
  const foot = modal.querySelector('.var-condition-foot');
  const active = document.activeElement;
  return {
    window: { l: win.left, r: win.right },
    rulesBox: rectOf2(modal.querySelector('.var-condition-rules')), box: rectOf2(box), outer: rectOf2(outer), outerWord: outer ? outer.textContent : null, outerTag: outer ? outer.tagName : null,
    head: head && { select: rectOf2(head.querySelector('select')), cross: rectOf2(head.querySelector('.macro-rule-remove')) },
    groupMode: head ? head.querySelector('select').value : null, groupModeText: head ? head.querySelector('select').selectedOptions[0].textContent : null,
    rows: rows.map(r => ({
      word: r.querySelector('.macro-rule-connector').textContent, tag: r.querySelector('.macro-rule-connector').tagName, connector: rectOf2(r.querySelector('.macro-rule-connector')),
      column: rectOf2(r.querySelector('.macro-rule-column-wrap')), operator: rectOf2(r.querySelector(':scope > select')), value: rectOf2(r.querySelector('.macro-rule-value-slot')),
      cross: rectOf2(r.querySelector(':scope > .macro-rule-remove')),
    })),
    foot: foot ? Array.from(foot.children).map(rectOf2) : [], footBox: rectOf2(foot), topMode: modal.querySelector('.var-condition-mode select').value, topModeShown: !modal.querySelector('.var-condition-mode').hidden,
    lines: Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent),
    allWords: Array.from(modal.querySelectorAll('.var-condition-rules .macro-rule-connector')).map(c => c.textContent),
    focusedToggle: active && active.dataset ? active.dataset.togglePath || null : null, focusedHead: !!(head && active === head.querySelector('select')),
    focusedRow: active && active.closest && active.closest('[data-rule-path]') ? active.closest('[data-rule-path]').dataset.rulePath : null,
    overflowX: content.scrollWidth - content.clientWidth, docOverflowX: document.documentElement.scrollWidth - innerWidth,
    body: { client: modal.querySelector('.pp-modal-body').clientHeight, scroll: modal.querySelector('.pp-modal-body').scrollHeight },
  };
});
const sameLine = (a, b) => !!a && !!b && Math.abs(a.mid - b.mid) < 4;
// Mise en page de l'encadré à large : le « Et » à gauche, à hauteur de la liste de l'en-tête ; la liste et la croix sur une ligne ; les deux lignes alignées sur 34 px de connecteur.
const wideLayoutOk = st => !!st.box && !!st.head && st.rows.length >= 2 && st.box.l >= st.rulesBox.l - 0.5 && st.box.r <= st.rulesBox.r + 0.5 && st.box.r <= st.window.r && st.outer.r <= st.box.l
  && sameLine(st.outer, st.head.select) && sameLine(st.head.select, st.head.cross) && st.head.cross.r <= st.box.r
  && st.rows.every(r => Math.abs(r.connector.w - 34) < 1.5 && r.connector.r <= r.column.l && sameLine(r.connector, r.column) && r.cross.r <= st.box.r && r.value.r <= st.box.r)
  && Math.abs(st.rows[0].column.l - st.rows[1].column.l) < 1.5 && st.overflowX <= 0 && st.docOverflowX <= 0;
// Mise en page à 360 px : le « Et » au-dessus de l'encadré, qui prend toute la largeur ; la colonne, l'opérateur et la croix de chaque ligne sur une ligne sans se recouvrir.
const narrowLayoutOk = st => !!st.box && !!st.head && st.rows.length >= 2 && st.outer.b <= st.box.t + 1 && st.outer.l >= st.window.l && st.box.l >= st.rulesBox.l - 0.5 && st.box.r <= st.rulesBox.r + 0.5
  && st.box.r <= st.window.r && sameLine(st.head.select, st.head.cross) && st.head.cross.r <= st.box.r
  && st.rows.every(r => sameLine(r.column, r.operator) && r.column.r <= r.operator.l + 1 && r.operator.r <= r.cross.l + 1 && r.cross.r <= st.box.r && r.value.r <= st.box.r && r.value.l >= st.box.l)
  && Math.abs(st.rows[0].column.l - st.rows[1].column.l) < 1.5 && st.overflowX <= 0 && st.docOverflowX <= 0;

await openConditionFor('Titre');
check('colonne Statut choisie à la vraie souris (condition de « Titre »)', await pickColumn(MODAL, 'Statut'));
await page.waitForTimeout(100);
await typeInto(`${MODAL} .macro-rule-value`, 'Urgent');
await page.waitForTimeout(150);
// Sans groupe, la ligne du pied porte quatre commandes sur UNE ligne : « + Ajouter une condition », « + Groupe », Copier, Coller - la fenêtre garde sa hauteur.
const plain = await groupState();
const footKids = plain.foot;
check('sans groupe : « + Ajouter une condition », « + Groupe » et Copier / Coller sont sur une seule ligne, dans la fenêtre, sans se recouvrir',
  footKids.length === 3 && footKids.every(k => sameLine(k, footKids[0])) && footKids[0].r <= footKids[1].l && footKids[1].r <= footKids[2].l && plain.footBox.h < 32
  && plain.footBox.r <= plain.window.r && plain.overflowX <= 0 && plain.docOverflowX <= 0 && plain.box === null && !plain.topModeShown, plain);
const groupButton = await bringIntoView(`${MODAL} .var-condition-add-group`);
check('« + Groupe » est visible, dans le panneau et au premier plan', groupButton.found && groupButton.inViewport && groupButton.onTop, groupButton);
if (groupButton.found) await page.mouse.click(groupButton.x, groupButton.y);
await page.waitForTimeout(250);
const posed = await groupState();
check('vrai clic sur « + Groupe » : un encadré de deux lignes, « Si » puis « Ou » dans l\'encadré, « Et » bouton devant lui, sa liste dit « au moins une », la liste du haut « toutes »',
  !!posed.box && posed.rows.length === 2 && posed.outerTag === 'BUTTON' && posed.outerWord === gw.and && posed.rows[0].word === gw.first && posed.rows[0].tag === 'SPAN' && posed.rows[1].word === gw.or && posed.rows[1].tag === 'BUTTON'
  && posed.groupMode === 'any' && posed.topMode === 'all' && posed.topModeShown, posed);
check('... le focus est sur la colonne de la première ligne de l\'encadré', posed.focusedRow === '1.0', posed.focusedRow);
await pickColumn(GROUP_ROW(0), 'Montant');
await page.selectOption(`${GROUP_ROW(0)} > select`, '≥');
await typeInto(`${GROUP_ROW(0)} .macro-rule-value`, '1000');
await bringIntoView(`${GROUP_ROW(1)} .macro-rule-column-wrap .ss-trigger`);
await pickColumn(GROUP_ROW(1), 'Montant');
await page.selectOption(`${GROUP_ROW(1)} > select`, '<');
await typeInto(`${GROUP_ROW(1)} .macro-rule-value`, '100');
await page.waitForTimeout(800);
const built = await groupState();
check('les deux lignes de l\'encadré se remplissent à la vraie souris et au clavier ; l\'aperçu lit « A et (B ou C) » : la ligne 1 remplit la condition, 1 ligne sur 2 la remplit (et non les 2 d\'un « ou » à plat)',
  built.lines[0] === gw.met && built.lines[1].startsWith(gw.count1), built.lines);
check('l\'encadré à 700x400 : « Et » à hauteur de sa liste, liste et croix sur une ligne, lignes alignées sur 34 px de connecteur, tout dans la fenêtre, sans débordement latéral', wideLayoutOk(built), built);
await page.setViewportSize({ width: 360, height: HEIGHT });
await page.waitForTimeout(300);
const narrow = await groupState();
check('panneau de 360 px : le « Et » passe au-dessus de l\'encadré, qui prend toute la largeur ; colonne, opérateur et croix de chaque ligne sans recouvrement, pas de débordement latéral', narrowLayoutOk(narrow), narrow);
const narrowGroupButton = await bringIntoView(`${MODAL} .var-condition-add-group`);
check('... « + Groupe » et Copier / Coller passent à la ligne sans sortir de la fenêtre', narrowGroupButton.found && narrowGroupButton.onTop && narrowGroupButton.inViewport && narrow.foot.every(k => k.r <= narrow.window.r + 0.5 && k.l >= narrow.window.l - 0.5), narrow.foot);
await page.setViewportSize({ width: WIDTH, height: HEIGHT });
await page.waitForTimeout(300);
// Le « Ou » de l'encadré : vrai clic - le groupe passe en « toutes », le premier niveau ne bouge pas ; l'aperçu lit « A et (B et C) » (aucune ligne).
await clickOn(`${MODAL} [data-toggle-path="1.1"]`);
await page.waitForTimeout(700);
const innerAnd = await groupState();
check('vrai clic sur le « Ou » de l\'encadré : « Et » entre ses lignes et dans sa liste (« toutes »), le « Et » de devant et la liste du haut ne bougent pas, le focus reste sur le bouton retracé',
  innerAnd.rows[1].word === gw.and && innerAnd.groupMode === 'all' && innerAnd.outerWord === gw.and && innerAnd.topMode === 'all' && innerAnd.focusedToggle === '1.1', innerAnd);
check('... l\'aperçu lit « A et (B et C) » : la condition n\'est remplie par aucune des 2 lignes', innerAnd.lines[0] === gw.notMet && innerAnd.lines[1] === gw.none, innerAnd.lines);
await page.keyboard.press('Space');
await page.waitForTimeout(500);
const innerBack = await groupState();
check('Espace sur le même bouton : retour à « Ou », le groupe repasse en « au moins une », le focus reste sur lui', innerBack.rows[1].word === gw.or && innerBack.groupMode === 'any' && innerBack.focusedToggle === '1.1', innerBack);
// Le « Et » de devant l'encadré : le premier niveau passe en « au moins une » (la liste du haut suit), l'encadré ne bouge pas ; « A ou (B ou C) » retient les 2 lignes.
await clickOn(`${MODAL} [data-toggle-path="1"]`);
await page.waitForTimeout(700);
const outerOr = await groupState();
check('vrai clic sur le « Et » de devant l\'encadré : « Ou », la liste du haut dit « au moins une », l\'encadré garde sa combinaison, le focus reste sur le bouton',
  outerOr.outerWord === gw.or && outerOr.topMode === 'any' && outerOr.groupMode === 'any' && outerOr.rows[1].word === gw.or && outerOr.focusedToggle === '1', outerOr);
check('... l\'aperçu lit « A ou (B ou C) » : les 2 lignes remplissent la condition', outerOr.lines[1].startsWith(gw.count2), outerOr.lines);
await clickOn(`${MODAL} [data-toggle-path="1"]`);
await page.waitForTimeout(700);
const outerBack = await groupState();
check('un second clic remet « Et » devant l\'encadré et « toutes » dans la liste du haut', outerBack.outerWord === gw.and && outerBack.topMode === 'all' && outerBack.groupMode === 'any' && outerBack.lines[1].startsWith(gw.count1), outerBack);
// « + Ajouter une condition » de l'encadré : une ligne de plus dans l'encadré, que sa croix retire.
const innerAdd = await clickOn(`${MODAL} .cond-group > .var-condition-add`);
const added = await groupState();
check('vrai clic sur le « + Ajouter une condition » de l\'encadré : une troisième ligne DANS l\'encadré (« Ou »), le focus sur sa colonne', innerAdd.found && added.rows.length === 3 && added.rows[2].word === gw.or && added.focusedRow === '1.2', added);
await clickOn(`${GROUP_ROW(2)} > .macro-rule-remove`);
const removedRow = await groupState();
check('la croix de la ligne ajoutée la retire : l\'encadré a de nouveau deux lignes', removedRow.rows.length === 2 && !!removedRow.box, removedRow);
const saveGroup = await bringIntoView(`${MODAL} .var-modal-primary`);
if (saveGroup.found) await page.mouse.click(saveGroup.x, saveGroup.y);
await page.waitForTimeout(300);
const groupRules = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }, { mode: 'any', rules: [{ column: 'Montant', operator: '≥', value: '1000' }, { column: 'Montant', operator: '<', value: '100' }] }] };
check('Enregistrer (vrai clic) pose { mode, rules: [règle, { mode, rules }] } sur la bulle', JSON.stringify(await conditionOn('Titre')) === JSON.stringify(groupRules), await conditionOn('Titre'));
// Lecture : 1200 (B) affiche, 500 (ni B ni C) masque - à plat en « ou » il s'afficherait -, 50 (C) affiche.
const readAt = async montant => { await fireDossier(montant); await page.waitForTimeout(300); return readBubbleInReaderMode(); };
const read1200 = await readAt(1200), read500 = await readAt(500), read50 = await readAt(50);
check('Lecture : Statut = Urgent et (Montant ≥ 1000 ou Montant < 100) - 1200 affiche, 500 masque, 50 affiche', read1200.text === 'Dossier A' && read500.text === null && read50.text === 'Dossier A' && read1200.backToEdit && read500.backToEdit && read50.backToEdit, { read1200, read500, read50 });
await fireDossier(1200);
await page.waitForTimeout(300);
// Rouverte : l'encadré est relu ; sa croix (vrai clic) le retire avec ses lignes, Annuler n'écrit rien.
await openConditionFor('Titre');
await page.waitForTimeout(300);
const reopenedGroup = await groupState();
check('fenêtre rouverte : l\'encadré et ses deux lignes sont relus de la bulle (« Ou » dans l\'encadré, « Et » devant lui)', !!reopenedGroup.box && reopenedGroup.rows.length === 2 && reopenedGroup.groupMode === 'any' && reopenedGroup.outerWord === gw.and && reopenedGroup.rows[1].word === gw.or && reopenedGroup.topMode === 'all', reopenedGroup);
await clickOn(`${MODAL} .cond-group-head .macro-rule-remove`);
const crossed = await groupState();
check('vrai clic sur la croix de l\'en-tête : l\'encadré disparaît avec ses lignes, la règle reste et la liste du haut se masque', crossed.box === null && !crossed.topModeShown && crossed.allWords.length === 1, crossed);
const cancelGroup = await bringIntoView(`${MODAL} .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)`);
if (cancelGroup.found) await page.mouse.click(cancelGroup.x, cancelGroup.y);
await page.waitForTimeout(300);
check('Annuler n\'écrit rien : la bulle garde son groupe', JSON.stringify(await conditionOn('Titre')) === JSON.stringify(groupRules), await conditionOn('Titre'));
}

// Colonne « Date et heure » (choix d'Antoine du 21/10 : corriger le format de date de ces colonnes et ajouter une liste « Heure » dans la barre, sans heure par défaut). Le type
// que reçoit le widget est « DateTime:Europe/Paris », jamais « DateTime » nu (essayé dans un vrai Grist). À la vraie souris et à 700x400 : un clic sur la bulle ouvre la barre avec les
// réglages de date ET la liste « Heure », atteignable et dans le panneau ; un choix pose { type: "date", time: "colon" }, la barre reste ouverte et la Lecture écrit la date et l'heure du
// fuseau de la colonne ; sur une colonne Date, la liste n'y est pas.
const RDV_SECONDS = Date.UTC(2026, 8, 12, 21, 30) / 1000; // 23 h 30 à Paris le 12/09/2026
await page.evaluate(async seconds => {
  const stub = window.__gristStub;
  stub.setVariables('VcRdv', { Titre: 'Text', Rdv: 'DateTime:Europe/Paris', Jour: 'Date' });
  stub.setRows('VcRdv', [{ id: 1, Titre: 'Rendez-vous', Rdv: seconds, Jour: Date.UTC(2026, 8, 12) / 1000 }]);
  await GristAPI.refreshSchema();
  stub.fireRecord({ id: 1, Titre: 'Rendez-vous', Rdv: new Date(seconds * 1000), Jour: new Date(Date.UTC(2026, 8, 12)) }, 'VcRdv');
  document.querySelector('.tiptap').blur();
  Editor.setHTML('<p>Rendez-vous le <span class="var-badge" data-table="VcRdv" data-column="Rdv" data-key="VcRdv.Rdv"></span>.</p><p>Jour : <span class="var-badge" data-table="VcRdv" data-column="Jour" data-key="VcRdv.Jour"></span></p>');
}, RDV_SECONDS);
await page.waitForTimeout(500);
const RDV_BADGE = '.tiptap .var-badge[data-column="Rdv"]';
const JOUR_BADGE = '.tiptap .var-badge[data-column="Jour"]';
const formatOf = column => page.evaluate(col => {
  let format;
  EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge' && n.attrs.column === col) format = n.attrs.format || null; });
  return format;
}, column);
const dateBar = () => page.evaluate(() => {
  const bar = document.querySelector('.v2-varfmt-toolbar.visible');
  if (!bar) return null;
  const r = bar.getBoundingClientRect();
  const time = bar.querySelector('select[data-role="date-time"]');
  const preset = bar.querySelector('select[data-role="date-preset"]');
  return {
    left: r.left, right: r.right, bottom: r.bottom, viewport: innerWidth, viewportHeight: innerHeight, docOverflowX: document.scrollingElement.scrollWidth - innerWidth,
    datePanelShown: !bar.querySelector('[data-var-panel="date"]').hidden, hourListShown: !!time && !time.hidden && time.offsetParent !== null, hourValue: time ? time.value : null,
    hourOptions: time ? Array.from(time.options).map(o => o.textContent) : null, hourTitle: time ? time.title : null, presetShown: !!preset && preset.offsetParent !== null,
  };
});
const rdvBox = await hitTest(RDV_BADGE);
await page.mouse.click(rdvBox.x, rdvBox.y);
await page.waitForTimeout(500);
const rdvBar = await dateBar();
const hourList = await hitTest('.v2-varfmt-toolbar.visible select[data-role="date-time"]');
check('clic sur une bulle Date et heure : la barre montre les réglages de date et la liste « Heure » (Sans heure, 23:30, 23 h 30, 11:30 PM, 11:30pm)',
  !!rdvBar && rdvBar.datePanelShown && rdvBar.presetShown && rdvBar.hourListShown && rdvBar.hourValue === '' && rdvBar.hourTitle === 'Heure'
  && JSON.stringify(rdvBar.hourOptions) === JSON.stringify(['Sans heure', '23:30', '23 h 30', '11:30 PM', '11:30pm']), rdvBar);
check('... la liste « Heure » est atteignable et non recouverte à 700x400, la barre reste dans le panneau', hourList.found && hourList.inViewport && hourList.onTop && rdvBar.left >= 0 && rdvBar.right <= rdvBar.viewport + 0.5 && rdvBar.bottom <= rdvBar.viewportHeight + 0.5 && rdvBar.docOverflowX <= 0, { hourList, rdvBar });
check('bulle sans réglage : le format reste vide', (await formatOf('Rdv')) === null);
await page.selectOption('.v2-varfmt-toolbar.visible select[data-role="date-time"]', 'colon');
await page.waitForTimeout(300);
const withHour = await formatOf('Rdv');
const barWithHour = await dateBar();
check('choisir « 23:30 » dans la liste : la bulle porte { type: "date", time: "colon" } et la barre reste ouverte sur la liste', JSON.stringify(withHour) === '{"type":"date","time":"colon"}' && !!barWithHour && barWithHour.hourListShown && barWithHour.hourValue === 'colon', { withHour, barWithHour });
const readRdv = await readBubbleInReaderMode();
check('Lecture, bouton cliqué à la vraie souris : « 12/09/2026 23:30 » (le jour et l\'heure de Paris, pas ceux de l\'instant UTC)', readRdv.readButton.found && readRdv.text === '12/09/2026 23:30' && readRdv.backToEdit, readRdv);
// 12 heures (demande du 21/10 : « les heures format am/pm et le format 12/24h ») : « 11:30 PM » pose { time: "ampm" }, la barre reste ouverte et la Lecture écrit l'heure à 12 heures.
const rdvBoxTwelve = await hitTest(RDV_BADGE);
await page.mouse.click(rdvBoxTwelve.x, rdvBoxTwelve.y);
await page.waitForTimeout(400);
await page.selectOption('.v2-varfmt-toolbar.visible select[data-role="date-time"]', 'ampm');
await page.waitForTimeout(300);
const withTwelve = await formatOf('Rdv');
const barWithTwelve = await dateBar();
check('choisir « 11:30 PM » dans la liste : la bulle porte { type: "date", time: "ampm" } et la barre reste ouverte sur la liste', JSON.stringify(withTwelve) === '{"type":"date","time":"ampm"}' && !!barWithTwelve && barWithTwelve.hourListShown && barWithTwelve.hourValue === 'ampm', { withTwelve, barWithTwelve });
const readTwelve = await readBubbleInReaderMode();
check('Lecture, bouton cliqué à la vraie souris : « 12/09/2026 11:30 PM » (l\'heure de Paris, à 12 heures)', readTwelve.readButton.found && readTwelve.text === '12/09/2026 11:30 PM' && readTwelve.backToEdit, readTwelve);
// Les minuscules collées (carte « Les deux », 21/10) : « 11:30pm », l'écriture de départ de Grist.
const rdvBoxLower = await hitTest(RDV_BADGE);
await page.mouse.click(rdvBoxLower.x, rdvBoxLower.y);
await page.waitForTimeout(400);
await page.selectOption('.v2-varfmt-toolbar.visible select[data-role="date-time"]', 'ampmlower');
await page.waitForTimeout(300);
const withLower = await formatOf('Rdv');
const barWithLower = await dateBar();
check('choisir « 11:30pm » dans la liste : la bulle porte { type: "date", time: "ampmlower" } et la barre reste ouverte sur la liste', JSON.stringify(withLower) === '{"type":"date","time":"ampmlower"}' && !!barWithLower && barWithLower.hourListShown && barWithLower.hourValue === 'ampmlower', { withLower, barWithLower });
const readLower = await readBubbleInReaderMode();
check('Lecture, bouton cliqué à la vraie souris : « 12/09/2026 11:30pm » (l\'heure de Paris, en minuscules collées)', readLower.readButton.found && readLower.text === '12/09/2026 11:30pm' && readLower.backToEdit, readLower);
// Sans heure : la clé disparaît, la Lecture retrouve la date seule.
const rdvBoxAgain = await hitTest(RDV_BADGE);
await page.mouse.click(rdvBoxAgain.x, rdvBoxAgain.y);
await page.waitForTimeout(400);
await page.selectOption('.v2-varfmt-toolbar.visible select[data-role="date-time"]', '');
await page.waitForTimeout(300);
const withoutHour = await formatOf('Rdv');
check('« Sans heure » : la clé « time » est retirée du format', JSON.stringify(withoutHour) === '{"type":"date"}', withoutHour);
const readNoHour = await readBubbleInReaderMode();
check('... et la Lecture écrit la date seule', readNoHour.text === '12/09/2026' && readNoHour.backToEdit, readNoHour);
// Colonne Date : les réglages de date, sans la liste « Heure ».
const jourBox = await hitTest(JOUR_BADGE);
await page.mouse.click(jourBox.x, jourBox.y);
await page.waitForTimeout(400);
const jourBar = await dateBar();
check('clic sur une bulle Date : les réglages de date sont là, la liste « Heure » n\'y est pas', !!jourBar && jourBar.datePanelShown && jourBar.presetShown && !jourBar.hourListShown, jourBar);


// « Comme dans Grist » (choix d'Antoine du 21/10, sujet « Bouton « Comme dans Grist » ») : la pipette de la barre d'un nombre ou d'une date lit le format d'affichage de la colonne dans
// Grist (widgetOptions) et pose le réglage de bulle qui écrit pareil. À la vraie souris et à 700x400 : la pipette et la case « % » sont atteignables et non recouvertes, la barre
// reste dans le panneau, un vrai clic pose le format (la barre reste ouverte), la Lecture écrit le texte de Grist, et le bouton se grise ensuite (« Déjà écrit comme dans Grist »).
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setDocumentSettings({ locale: 'fr-FR', currency: 'EUR' });
  stub.setColumnFormats('VcRdv', { Rdv: { dateFormat: 'DD/MM/YYYY', timeFormat: 'HH:mm' }, Jour: { dateFormat: 'D MMMM YYYY' } });
  stub.setColumnFormats('VcDossiers', { Montant: { numMode: 'currency', currency: 'EUR', decimals: 2 } });
  await GristAPI.refreshSchema();
});
const gristButton = () => page.evaluate(() => {
  const bar = document.querySelector('.v2-varfmt-toolbar.visible');
  const b = bar && bar.querySelector('button[data-action="grist-format"]');
  const r = bar && bar.getBoundingClientRect();
  return b ? { title: b.title, label: b.getAttribute('aria-label'), disabled: b.getAttribute('aria-disabled'), barLeft: r.left, barRight: r.right, barBottom: r.bottom, barHeight: r.height, viewport: innerWidth, viewportHeight: innerHeight } : null;
});
// Une seule bulle dans la page, sans réglage, puis un clic dessus : la barre d'une bulle voisine ne recouvre pas celle qu'on vise (à 700x400, la barre de la bulle du bas couvre le paragraphe du haut).
const openDateBadge = async column => {
  await page.evaluate(col => {
    document.querySelector('.tiptap').blur();
    Editor.setHTML('<p>Date : <span class="var-badge" data-table="VcRdv" data-column="' + col + '" data-key="VcRdv.' + col + '"></span>.</p>');
  }, column);
  await page.waitForTimeout(400);
  const box = await hitTest('.tiptap .var-badge[data-column="' + column + '"]');
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(500);
};
const clickGrist = async () => {
  const pipette = await hitTest('.v2-varfmt-toolbar.visible button[data-action="grist-format"]');
  if (pipette.found) await page.mouse.click(pipette.x, pipette.y);
  await page.waitForTimeout(500);
  return pipette;
};
const sameKeys = (format, wanted) => !!format && JSON.stringify(Object.entries(format).sort()) === JSON.stringify(Object.entries(wanted).sort());
// Date et heure : « 12/09/2026 23:30 » (jj/mm/aaaa et HH:mm sont les mêmes dans Grist et dans le widget).
await openDateBadge('Rdv');
const rdvPipette = await hitTest('.v2-varfmt-toolbar.visible button[data-action="grist-format"]');
const rdvPipetteState = await gristButton();
check('Comme dans Grist, bulle Date et heure : la pipette est atteignable et non recouverte à 700x400, la barre reste dans le panneau',
  rdvPipette.found && rdvPipette.inViewport && rdvPipette.onTop && !!rdvPipetteState && rdvPipetteState.barLeft >= 0 && rdvPipetteState.barRight <= rdvPipetteState.viewport + 0.5 && rdvPipetteState.barBottom <= rdvPipetteState.viewportHeight + 0.5, { rdvPipette, rdvPipetteState });
check('... son info-bulle (et son nom accessible) dit ce que le clic écrit', !!rdvPipetteState && rdvPipetteState.title === 'Comme dans Grist : 12/09/2026 21:30' && rdvPipetteState.label === rdvPipetteState.title && rdvPipetteState.disabled === 'false', rdvPipetteState);
await clickGrist();
const rdvFormat = await formatOf('Rdv');
const rdvAfter = await gristButton();
check('vrai clic sur la pipette : la bulle porte jj/mm/aaaa et l\'heure sur 24 h, la barre reste ouverte et le bouton se grise', sameKeys(rdvFormat, { type: 'date', preset: 'dmy_slash_full', time: 'colon' }) && !!rdvAfter && rdvAfter.disabled === 'true' && rdvAfter.title === 'Déjà écrit comme dans Grist', { rdvFormat, rdvAfter });
const readRdvGrist = await readBubbleInReaderMode();
check('Lecture : « 12/09/2026 23:30 » (l\'heure de Paris), comme la colonne dans Grist', readRdvGrist.text === '12/09/2026 23:30' && readRdvGrist.backToEdit, readRdvGrist);
// Une date en lettres : approchée en français (« 12 septembre 2026 » là où Grist écrit « 12 September 2026 »), et le dit.
await openDateBadge('Jour');
const jourPipetteState = await gristButton();
check('Comme dans Grist, bulle Date en lettres : l\'info-bulle annonce un texte approché', !!jourPipetteState && jourPipetteState.title === 'Comme dans Grist : 12 septembre 2026 (approché)' && jourPipetteState.disabled === 'false', jourPipetteState);
await clickGrist();
const jourFormat = await formatOf('Jour');
check('vrai clic : la bulle porte « 12 septembre 2026 » (jour et mois en lettres)', sameKeys(jourFormat, { type: 'date', preset: 'd_mmmm_yyyy' }), jourFormat);
const readJourGrist = await readBubbleInReaderMode();
check('Lecture : « 12 septembre 2026 »', readJourGrist.text === '12 septembre 2026' && readJourGrist.backToEdit, readJourGrist);
// Nombre : la pipette ET la case « % » dans la barre, toujours sur une ligne.
await openNumberBar();
await fireDossier(1200);
const montantPipette = await hitTest('.v2-varfmt-toolbar.visible button[data-action="grist-format"]');
const percentButton = await hitTest('.v2-varfmt-toolbar.visible button[data-action="num-percent"]');
const montantBar = await gristButton();
check('Comme dans Grist, bulle Numérique : la pipette et la case « % » sont atteignables et non recouvertes, la barre tient sur une ligne dans le panneau',
  montantPipette.found && montantPipette.inViewport && montantPipette.onTop && percentButton.found && percentButton.inViewport && percentButton.onTop && montantBar.barHeight < 50 && montantBar.barLeft >= 0 && montantBar.barRight <= montantBar.viewport + 0.5,
  { montantPipette, percentButton, montantBar });
check('... l\'info-bulle annonce « 1 234,57 € » (euro, deux décimales, de la colonne Grist)', montantBar.title === 'Comme dans Grist : 1 234,57 €', montantBar);
await clickGrist();
const montantFormat = await numberFormat();
check('vrai clic : { currency: "€", decimals: 2 }, sans autre réglage', JSON.stringify(Object.entries(montantFormat || {}).sort()) === JSON.stringify(Object.entries({ type: 'number', currency: '€', decimals: 2 }).sort()), montantFormat);
const readMontant = await readBubbleInReaderMode();
check('Lecture : « 1 200,00 € » (le texte de la colonne dans Grist)', readMontant.text === '1 200,00 €' && readMontant.backToEdit, readMontant);
await reselectNumberBadge();
const percentClick = await hitTest('.v2-varfmt-toolbar.visible button[data-action="num-percent"]');
if (percentClick.found) await page.mouse.click(percentClick.x, percentClick.y);
await page.waitForTimeout(300);
const percentFormat = await numberFormat();
const percentBar = await page.evaluate(() => { const b = document.querySelector('.v2-varfmt-toolbar.visible button[data-action="num-percent"]'); return b ? { pressed: b.getAttribute('aria-pressed'), active: b.classList.contains('is-active') } : null; });
check('vrai clic sur « % » : le pourcentage remplace la devise, les décimales restent, le bouton est allumé et enfoncé', !!percentFormat && percentFormat.percent === true && !('currency' in percentFormat) && percentFormat.decimals === 2 && !!percentBar && percentBar.pressed === 'true' && percentBar.active, { percentFormat, percentBar });
const readPercent = await readBubbleInReaderMode();
check('Lecture : « 120 000,00 % » (1200 fois cent, deux décimales)', readPercent.text === '120 000,00 %' && readPercent.backToEdit, readPercent);

// Puce « Heure actuelle » (carte « Les deux » d'Antoine, 21/10) : sa barre dans le document, à la vraie souris et à 700x400. Un clic sur la puce ouvre la liste « Heure » (23:30, 23 h 30,
// 11:30 PM, 11:30pm), atteignable dans le panneau et sans recouvrir la puce ; le choix se range dans la puce (data-chip-time), la barre reste ouverte et la Lecture écrit l'heure ainsi ;
// « 23:30 » retire le réglage ; la puce « Date du jour » n'a pas de barre. L'heure de la page est figée à 23 h 30 pour que la Lecture ait un texte sûr.
await page.evaluate(() => {
  const RealDate = Date;
  const frozen = new RealDate(2026, 8, 12, 23, 30, 0).getTime();
  window.__RealDate = RealDate;
  window.Date = class extends RealDate { constructor(...args) { if (args.length) super(...args); else super(frozen); } static now() { return frozen; } };
  document.querySelector('.tiptap').blur();
  Editor.setHTML('<p>Reçu à ' + EditorNodes.smartChipHtml({ kind: 'time' }) + ' et le ' + EditorNodes.smartChipHtml({ kind: 'date' }) + '.</p>');
});
await page.waitForTimeout(500);
const TIME_CHIP = '.tiptap .smart-chip[data-chip-kind="time"]';
const DATE_CHIP = '.tiptap .smart-chip[data-chip-kind="date"]';
const chipTimeOf = () => page.evaluate(() => { let found; EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'smartChip' && n.attrs.kind === 'time') found = n.attrs.time; }); return found; });
const chipBar = () => page.evaluate(() => {
  const bar = document.querySelector('.v2-timechip-toolbar.visible');
  if (!bar) return null;
  const r = bar.getBoundingClientRect(); const select = bar.querySelector('select[data-role="chip-time"]');
  const sr = select.getBoundingClientRect(); const topEl = document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2);
  const chip = document.querySelector('.tiptap .smart-chip[data-chip-kind="time"]').getBoundingClientRect();
  const cx = chip.left + chip.width / 2, cy = chip.top + chip.height / 2;
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, viewport: innerWidth, viewportHeight: innerHeight, docOverflowX: document.scrollingElement.scrollWidth - innerWidth,
    selectOnTop: !!topEl && (topEl === select || select.contains(topEl)), coversChip: cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom,
    options: Array.from(select.options).map(o => o.textContent), value: select.value, title: select.title, bubbleBars: document.querySelectorAll('.v2-varfmt-toolbar.visible').length };
});
const dateChipBox = await hitTest(DATE_CHIP);
await page.mouse.click(dateChipBox.x, dateChipBox.y);
await page.waitForTimeout(400);
check('clic sur la puce « Date du jour » : aucune barre', (await chipBar()) === null && (await page.evaluate(() => !document.querySelector('.v2-varfmt-toolbar.visible'))));
const timeChipBox = await hitTest(TIME_CHIP);
await page.mouse.click(timeChipBox.x, timeChipBox.y);
await page.waitForTimeout(500);
const chipBarOpened = await chipBar();
check('clic sur la puce « Heure actuelle » : sa barre montre la liste « Heure » (23:30, 23 h 30, 11:30 PM, 11:30pm) sur « 23:30 », sans la barre d\'une bulle',
  !!chipBarOpened && JSON.stringify(chipBarOpened.options) === JSON.stringify(['23:30', '23 h 30', '11:30 PM', '11:30pm']) && chipBarOpened.value === 'colon' && chipBarOpened.title === 'Heure' && chipBarOpened.bubbleBars === 0, chipBarOpened);
check('... la barre est dans le panneau à 700x400, la liste atteignable et non recouverte, la puce découverte, la page ne défile pas de côté',
  !!chipBarOpened && chipBarOpened.left >= 0 && chipBarOpened.right <= chipBarOpened.viewport + 0.5 && chipBarOpened.bottom <= chipBarOpened.viewportHeight + 0.5 && chipBarOpened.selectOnTop && !chipBarOpened.coversChip && chipBarOpened.docOverflowX <= 0, chipBarOpened);
check('puce sans réglage : le modèle n\'en garde aucun (l\'heure s\'écrit sur 24 h comme avant)', (await chipTimeOf()) === null);
await page.selectOption('.v2-timechip-toolbar.visible select[data-role="chip-time"]', 'ampm');
await page.waitForTimeout(350);
const chipAfterAmpm = { time: await chipTimeOf(), bar: await chipBar() };
check('choisir « 11:30 PM » : la puce porte { time: "ampm" } et la barre reste ouverte sur ce choix', chipAfterAmpm.time === 'ampm' && !!chipAfterAmpm.bar && chipAfterAmpm.bar.value === 'ampm', chipAfterAmpm);
const readChipAmpm = await readBubbleInReaderMode('p');
check('Lecture, bouton cliqué à la vraie souris : « Reçu à 11:30 PM et le 12/09/2026. »', readChipAmpm.readButton.found && readChipAmpm.text === 'Reçu à 11:30 PM et le 12/09/2026.' && readChipAmpm.backToEdit, readChipAmpm);
const timeChipAgain = await hitTest(TIME_CHIP);
await page.mouse.click(timeChipAgain.x, timeChipAgain.y);
await page.waitForTimeout(450);
const chipBarAgain = await chipBar();
check('la puce rouverte : la barre relit le réglage « 11:30 PM »', !!chipBarAgain && chipBarAgain.value === 'ampm', chipBarAgain);
await page.selectOption('.v2-timechip-toolbar.visible select[data-role="chip-time"]', 'ampmlower');
await page.waitForTimeout(300);
const readChipLower = await readBubbleInReaderMode('p');
check('« 11:30pm » : la Lecture écrit « Reçu à 11:30pm et le 12/09/2026. »', (await chipTimeOf()) === 'ampmlower' && readChipLower.text === 'Reçu à 11:30pm et le 12/09/2026.' && readChipLower.backToEdit, readChipLower);
const timeChipLast = await hitTest(TIME_CHIP);
await page.mouse.click(timeChipLast.x, timeChipLast.y);
await page.waitForTimeout(450);
await page.selectOption('.v2-timechip-toolbar.visible select[data-role="chip-time"]', 'colon');
await page.waitForTimeout(300);
const readChipColon = await readBubbleInReaderMode('p');
check('« 23:30 » retire le réglage de la puce et la Lecture écrit « Reçu à 23:30 et le 12/09/2026. »', (await chipTimeOf()) === null && readChipColon.text === 'Reçu à 23:30 et le 12/09/2026.' && readChipColon.backToEdit, { time: await chipTimeOf(), readChipColon });
await page.evaluate(() => { window.Date = window.__RealDate; });

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
