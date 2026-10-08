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
async function readBubbleInReaderMode() {
  const readButton = await hitTest('#btn-mode-read');
  if (readButton.found) await page.mouse.click(readButton.x, readButton.y);
  await page.waitForTimeout(900);
  const text = await page.evaluate(() => { const e = document.querySelector('#reader-container .reader-content .resolved-var'); return e ? e.textContent : null; });
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
  const body = await hitTest('#var-condition-modal .var-modal-body');
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

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
