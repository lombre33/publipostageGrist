#!/usr/bin/env node
// Police des champs de l'interface à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400) - « Oui, tous » d'Antoine du 12/10, à la
// carte « Passer aussi le nom du modèle et les champs de l'e-mail dans la police des boutons ? ». Depuis la bascule du 04/10 sur la police du système (--font-ui), les boutons la prenaient mais pas les champs : onze
// champs de la barre du haut avaient « font-family: Arial » écrit en dur (css/style.css, `#toolbar-top select, input[type="text"], .pp-field-editor`) et tous ceux qu'aucune règle ne touchait (marges, caractère
// déclencheur, recherche de la galerie, nom du macro-modèle...) gardaient la police par défaut du navigateur, Arial elle aussi. Une règle de base (`input, select, textarea`) leur donne --font-ui ; ce script le
// mesure dans un vrai navigateur : chaque champ a EXACTEMENT la police du bouton voisin « Enregistrer » (qui commence par system-ui) et garde sa taille. Parcours : la barre du haut, un nouvel email (Objet, À, Cc, Cci
// et nom du PDF, du texte tapé au clavier), les sept onglets des Réglages (marges, caractère déclencheur), la galerie, le macro-modèle, « Organiser mes modèles », « Enregistrer sous… » ; un guetteur de DOM
// contrôle aussi tout champ apparu pendant le parcours (les fenêtres montées par script). Les boutons et les textes ne sont pas dans ce contrôle : quelques-uns gardent Arial par héritage (menu des polices et des tailles, « + Ajouter un en-tête » ; charte UX/UI, §5).
// Lancé par run-headless.mjs (groupe Node "fieldFontsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-field-fonts-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.FIELD_FONTS_MOUSE_PORT || 9020);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-settings-window-mouse.mjs.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-field-fonts-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

async function openWidget(colorScheme) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => d.accept().catch(() => {}));
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
  // Guetteur : tout champ qui entre dans la page (une fenêtre montée par script, une barre qui s'ouvre) est noté avec sa police au tour d'affichage suivant ; le contenu du document n'en fait pas partie.
  await page.addInitScript(() => {
    window.__fieldFonts = [];
    const FIELD = 'input, select, textarea, .pp-field-editor, .pp-field-text';
    const CONTENT = '.tiptap, .reader-content, #tpl-preview-sheet, #tpl-preview-tiptap';
    const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    const pending = new Set();
    const flush = () => {
      for (const el of pending) if (el.isConnected && !el.closest(CONTENT) && window.__fieldFonts.length < 5000) window.__fieldFonts.push({ desc: desc(el), ff: getComputedStyle(el).fontFamily });
      pending.clear();
    };
    new MutationObserver(list => {
      for (const m of list) for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches(FIELD)) pending.add(node);
        node.querySelectorAll(FIELD).forEach(el => pending.add(el));
      }
      if (pending.size) requestAnimationFrame(flush);
    }).observe(document, { childList: true, subtree: true });
  });
  // Semé avant le démarrage : une table de données (l'onglet Accès en liste les colonnes) et un modèle ouvert par défaut. Aucun réglage de droits.
  await page.addInitScript(() => {
    window.__preSeedGristStub = (stub) => {
      stub.setVariables('Clients', { Nom: 'Text', Email: 'Text', Actif: 'Bool' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont', Email: 'dupont@exemple.fr', Actif: true }]);
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      m.Contenu.push('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>.</p>');
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  });
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  return { context, page };
}

const FIELD = 'input, select, textarea, .pp-field-editor, .pp-field-text';

// ===== Mesures =====
// Les champs d'une zone (le document entier par défaut), hors contenu du document : l'éditeur, la Lecture et les aperçus de modèle gardent la police du contenu (Roboto), pas celle de l'interface.
const fieldsIn = (page, scope = 'body') => page.evaluate(({ scope, FIELD }) => {
  const CONTENT = '.tiptap, .reader-content, #tpl-preview-sheet, #tpl-preview-tiptap';
  const root = document.querySelector(scope);
  if (!root) return null;
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  return Array.from(root.querySelectorAll(FIELD)).filter(el => !el.closest(CONTENT)).map(el => ({ desc: desc(el), ff: getComputedStyle(el).fontFamily }));
}, { scope, FIELD });
const fontOf = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { ff: cs.fontFamily, fs: cs.fontSize };
}, selector);
const outside = (list, ref) => (list || []).filter(f => f.ff !== ref).map(f => `${f.desc} : ${f.ff}`);

// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function boxOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selector);
}
async function realHover(page, selector, wait = 300) {
  const b = await boxOf(page, selector);
  if (!b) return false;
  await page.mouse.move(b.x - 8, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.waitForTimeout(wait);
  return true;
}
async function realClick(page, selector, wait = 300) {
  const b = await boxOf(page, selector);
  if (!b) return false;
  await page.mouse.move(b.x - 6, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(wait);
  return true;
}
const shown = (page, selector) => page.evaluate(sel => { const el = document.querySelector(sel); return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0; }, selector);

console.log(`\n=== Police des champs de l'interface, ${WIDTH}x${HEIGHT}, vraie souris et vrai clavier ===`);
const { context, page } = await openWidget('light');
const ref = await page.evaluate(() => getComputedStyle(document.getElementById('btn-save')).fontFamily);
check('la police des boutons voisins (« Enregistrer ») est celle du système : --font-ui commence par system-ui', /^system-ui\b/.test(ref), ref);

// ===== 1) Au repos : la barre du haut, puis tous les champs de la page (fenêtres déjà montées comprises, même cachées) =====
const TOP = ['template-name', 'v2-export-type', 'v2-pdf-quality', 'v2-export-lines', 'v2-header-select', 'v2-heading-numbering-select'];
const top = await Promise.all(TOP.map(id => fontOf(page, '#' + id)));
check('barre du haut : le nom du modèle, les listes du type d\'export, de la qualité et des lignes, et les listes des titres ont la police des boutons', top.every((f, i) => f && f.ff === ref), TOP.map((id, i) => `${id} : ${top[i] && top[i].ff}`));
const TOP_SIZES = ['13px', '13px', '13px', '13px', '12.5px', '12.5px'];
check('barre du haut : leur taille ne change pas (13px, et 12,5px pour les deux listes de titres)', top.every((f, i) => f && f.fs === TOP_SIZES[i]), TOP.map((id, i) => `${id} : ${top[i] && top[i].fs}`));
const rest = await fieldsIn(page);
check(`au repos : les ${rest.length} champs de la page ont tous la police des boutons`, rest.length >= 60 && outside(rest, ref).length === 0, outside(rest, ref).slice(0, 8));

// ===== 2) Un nouvel email : Objet, À, Cc, Cci et nom du PDF, avec du texte tapé au clavier =====
await realHover(page, '#v2-new-template-group #btn-new');
await realClick(page, '#v2-btn-new-email', 900);
await realClick(page, '#v2-btn-toggle-cci', 300);
await realClick(page, '#btn-toggle-pdf-filename', 300);
await realClick(page, '#pdf-filename-template', 200);
await page.keyboard.type('Facture');
await realClick(page, '#v2-email-subject', 200);
await page.keyboard.type('Bonjour');
await page.waitForTimeout(150);
const MAIL = ['v2-email-subject', 'v2-email-to', 'v2-email-cc', 'v2-email-cci', 'pdf-filename-template'];
const mail = await Promise.all(MAIL.map(id => fontOf(page, '#' + id)));
const typedSubject = await fontOf(page, '#v2-email-subject .pp-field-text p');
const typedPdf = await fontOf(page, '#pdf-filename-template .pp-field-text p');
const typedTexts = await page.evaluate(() => ({ subject: document.querySelector('#v2-email-subject .pp-field-text').textContent, pdf: document.querySelector('#pdf-filename-template .pp-field-text').textContent }));
check('email : les cinq champs sont affichés (Objet, À, Cc, Cci, nom du PDF), dans le panneau', (await Promise.all(MAIL.map(id => page.evaluate(i => { const r = document.getElementById(i).getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5; }, id)))).every(Boolean));
check('email : l\'Objet, À, Cc, Cci et le nom du PDF (champs à bulles) ont la police des boutons, sans changer de taille (13px)', mail.every(f => f && f.ff === ref && f.fs === '13px'), MAIL.map((id, i) => `${id} : ${mail[i] && mail[i].ff} ${mail[i] && mail[i].fs}`));
check('email : le texte tapé au clavier dans l\'Objet et dans le nom du PDF est dans la police des boutons', typedTexts.subject.includes('Bonjour') && typedTexts.pdf.includes('Facture') && !!typedSubject && typedSubject.ff === ref && !!typedPdf && typedPdf.ff === ref, { typedTexts, typedSubject, typedPdf });

// ===== 3) Réglages : les sept onglets (marges, caractère déclencheur, listes de l'onglet Accès...) =====
await realClick(page, '#v2-btn-settings', 400);
check('Réglages : la fenêtre est ouverte', await shown(page, '#settings-modal'));
const bySettingsTab = {};
for (const tab of ['language', 'theme', 'triggerKey', 'pageMargins', 'access', 'credits', 'shortcuts']) {
  await realClick(page, `#settings-modal .settings-tab[data-settings-tab="${tab}"]`, 250);
  bySettingsTab[tab] = outside(await fieldsIn(page, '#settings-modal'), ref);
  if (tab === 'pageMargins') {
    const margins = await Promise.all(['top', 'right', 'bottom', 'left'].map(side => fontOf(page, '#settings-margin-' + side)));
    check('Réglages, Marges de page : les quatre marges (haut, droite, bas, gauche) ont la police des boutons', margins.every(f => f && f.ff === ref), margins);
  }
  if (tab === 'triggerKey') {
    const trigger = await fontOf(page, '#settings-trigger-char');
    check('Réglages, Touche de déclenchement : le caractère déclencheur a la police des boutons', !!trigger && trigger.ff === ref, trigger);
  }
}
check('Réglages : sur chacun des sept onglets, tous les champs de la fenêtre ont la police des boutons', Object.values(bySettingsTab).every(list => list.length === 0), bySettingsTab);
await realClick(page, '#settings-close', 300);

// ===== 4) Galerie de modèles, macro-modèle, « Organiser mes modèles », « Enregistrer sous… » =====
await realHover(page, '#v2-new-template-group #btn-new');
await realClick(page, '#v2-btn-new-from-template', 900);
check('Galerie : la fenêtre est ouverte', await shown(page, '#template-gallery-modal'));
const search = await fontOf(page, '#tpl-gallery-search');
check('Galerie : le champ de recherche a la police des boutons', !!search && search.ff === ref, search);
await realClick(page, '#tpl-gallery-close', 300);

await realHover(page, '#v2-new-template-group #btn-new');
await realClick(page, '#v2-btn-new-macro', 900);
check('Macro-modèle : la fenêtre est ouverte', await shown(page, '#macro-editor-modal'));
const macroName = await fontOf(page, '#macro-editor-name');
const macroCover = await fontOf(page, '#macro-editor-cover');
check('Macro-modèle : le nom et la liste de la couverture ont la police des boutons', !!macroName && !!macroCover && macroName.ff === ref && macroCover.ff === ref, { macroName, macroCover });
check('Macro-modèle : tous les champs de la fenêtre ont la police des boutons', outside(await fieldsIn(page, '#macro-editor-modal'), ref).length === 0, outside(await fieldsIn(page, '#macro-editor-modal'), ref));
await realClick(page, '#macro-editor-cancel', 300);

await realClick(page, '.tts-trigger', 300);
await realClick(page, '#btn-organize-templates', 500);
check('Organiser mes modèles : la fenêtre est ouverte', await shown(page, '#template-organize-modal'));
const organize = await fontOf(page, '#template-organize-search');
check('Organiser mes modèles : le champ de recherche a la police des boutons', !!organize && organize.ff === ref, organize);
await realClick(page, '#template-organize-close', 300);
await page.keyboard.press('Escape');

await realHover(page, '#btn-save');
await realClick(page, '#v2-btn-save-as', 500);
const askName = await page.evaluate(() => Array.from(document.querySelectorAll('.pp-dialog-input')).filter(el => el.getClientRects().length > 0).map(el => getComputedStyle(el).fontFamily));
check('Enregistrer sous… : le champ du nom de la fenêtre de saisie a la police des boutons', askName.length === 1 && askName[0] === ref, askName);
await page.keyboard.press('Escape');

// ===== 5) Tout champ apparu pendant le parcours, fenêtres montées par script comprises =====
const seen = await page.evaluate(() => window.__fieldFonts);
const seenOutside = outside(seen, ref);
check(`pendant tout le parcours, ${seen.length} champs sont apparus dans la page : tous ont la police des boutons`, seen.length >= 20 && seenOutside.length === 0, seenOutside.slice(0, 8));
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await context.close();
await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
