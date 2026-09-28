#!/usr/bin/env node
// Barre flottante d'une bulle #Variable et ses deux fenêtres (condition d'affichage, autres attributs), à la VRAIE souris (page.mouse, Node/Playwright)
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
  stub.setVariables('VcContacts', { Dossier: 'Ref:VcDossiers', Role: 'Text' }); // table PAS encore liée : son choix de clé s'ouvre par-dessus la fenêtre
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
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
