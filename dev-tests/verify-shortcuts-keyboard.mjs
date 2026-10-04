#!/usr/bin/env node
// Raccourcis clavier personnalisables (js/shortcuts.js, js/shortcuts-panel.js, css/shortcuts.css) : le panneau de 700x400 d'Antoine, au VRAI clavier (page.keyboard) et à la vraie
// souris (page.mouse), en clair, en sombre, en anglais et en mode Mac. Ce que dev-tests/scenarios-shortcuts.js ne peut pas voir depuis la page : un KeyboardEvent construit à la main
// ne passe ni par l'ordre des écouteurs d'une vraie touche (l'écouteur de Shortcuts doit arrêter Ctrl+B AVANT l'éditeur), ni par ce que le navigateur écrit dans le texte.
//  - les touches de départ (Alt+L, Alt+E, Alt+Maj+1 2 3, Alt+Entrée, Alt+Maj+D, Alt+Maj+H, Ctrl+/, F2, Alt+M, Alt+P) font ce que font leurs boutons, sans rien écrire dans le texte ;
//  - Rechercher (Ctrl+F) et Rechercher et remplacer (Ctrl+H) restent à la barre de recherche ; changés, la nouvelle touche l'ouvre (sans la refermer), l'ancienne ne fait plus rien, la loupe la dit ;
//  - une touche changée dans Réglages > Raccourcis marche tout de suite, l'ancienne ne fait plus rien (Ctrl+B ne met plus en gras), « Par défaut » les rend ;
//  - l'écoute d'une combinaison : un doublon, une touche seule, Ctrl+Alt (AltGr) sont refusés sous la touche concernée, Échap abandonne sans fermer la fenêtre ;
//  - au clavier seul : Ctrl+/ ouvre la liste, Tab passe de touche en touche, Entrée écoute, la touche tapée est prise ;
//  - la liste des touches (une ligne par action, 53) tient dans 700x400 : seul le contenu défile, le titre, les onglets et « Fermer » ne bougent pas, rien ne déborde ni ne se coupe ;
//  - les infobulles montrent la touche (« Gras (Alt+B) ») sans sortir de la fenêtre, les lignes de menu aussi ; mode Mac : ⌥L, ⌘ ; anglais : « Shift ».
// Lancé par run-headless.mjs (groupe Node "shortcutsKeyboard", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-shortcuts-keyboard.mjs
// SHORTCUTS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.SHORTCUTS_PORT || 8922);
const SHOTS = process.env.SHORTCUTS_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-text-expansion-keyboard.mjs.
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
if (!OFFLINE) console.log('[verify-shortcuts-keyboard] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Un export, un nouveau modèle ou une suppression ne sont pas ce qu'on mesure : le clic est compté et avalé avant d'aller au bout.
await page.evaluate(() => {
  window.__spy = {};
  document.addEventListener('click', event => {
    const el = event.target && event.target.closest && event.target.closest('#btn-export-pdf, #btn-new, #btn-delete');
    if (!el) return;
    window.__spy[el.id] = (window.__spy[el.id] || 0) + 1;
    event.stopImmediatePropagation();
    event.preventDefault();
  }, true);
});
const spied = id => page.evaluate(id => window.__spy[id] || 0, id);

async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const html = () => page.evaluate(() => Editor.getHTML());
const plain = () => page.evaluate(() => { const div = document.createElement('div'); div.innerHTML = Editor.getHTML(); return div.textContent; });
async function setDoc(doc) {
  await page.evaluate(d => { Editor.setHTML(d); }, doc);
  await page.waitForTimeout(250);
}
// Curseur à la fin du dernier bloc, par un vrai clic au milieu de ce bloc puis Ctrl+Fin. Pas à 20 px du haut de `.tiptap` : les 24 px du haut de la feuille sont la bande de l'en-tête
// (js/header-footer-preview.js, depuis la bande commune de l'éditeur et du PDF) - un clic dessus ouvre l'en-tête, et la frappe suivante y irait au lieu du document. Si le clavier n'est
// pas dans le document après le clic (en-tête ou pied ouvert, rien d'actif), le script s'arrête ici, sur la cause, plutôt que cinq contrôles plus loin.
async function focusEnd() {
  const box = await page.evaluate(() => {
    const root = document.querySelector('.tiptap');
    const blocks = Array.from(root.children).filter(el => el.getBoundingClientRect().height > 0 && !el.classList.contains('ProseMirror-widget') && !el.classList.contains('ProseMirror-gapcursor'));
    const last = blocks[blocks.length - 1] || root;
    last.scrollIntoView({ block: 'nearest' });
    const r = last.getBoundingClientRect();
    return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(80);
  const inDocument = await page.evaluate(() => {
    const el = document.activeElement;
    return !!el && !!el.closest && !!el.closest('.tiptap') && !HeaderFooterPreview.isEditingHeaderFooter();
  });
  if (!inDocument) throw new Error('focusEnd : après le clic, le clavier n\'est pas dans le document (en-tête ou pied ouvert ?)');
}
const mode = () => page.evaluate(() => (document.getElementById('btn-mode-read').classList.contains('active') ? 'read' : 'edit'));
const focused = () => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return 'rien';
  return el.closest && el.closest('.ProseMirror') ? 'éditeur' : (el.id || el.className || el.tagName);
});
const settingsOpen = () => page.evaluate(() => getComputedStyle(document.getElementById('settings-modal')).display !== 'none');
const text = selector => page.evaluate(sel => { const el = document.querySelector(sel); return el ? el.textContent : null; }, selector);
const visible = selector => page.evaluate(sel => { const el = document.querySelector(sel); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; }, selector);
const edge = (selector, side) => page.evaluate(({ selector, side }) => { const r = document.querySelector(selector).getBoundingClientRect(); return Math.round(r[side] * 10) / 10; }, { selector, side });
async function click(selector, wait = 150) { await page.click(selector, { timeout: 5000 }); await page.waitForTimeout(wait); }
const stored = () => page.evaluate(() => localStorage.getItem('pp_shortcuts'));
const keyBtn = id => `.settings-key-row[data-action="${id}"] .settings-key-btn`;
const resetBtn = id => `.settings-key-row[data-action="${id}"] .settings-key-reset`;
const errorOf = id => `.settings-key-row[data-action="${id}"] .settings-key-error`;
async function openKeys() {
  await click('#v2-btn-settings', 250);
  await click('#settings-modal .settings-tab[data-settings-tab="shortcuts"]', 250);
  if (!(await visible('#settings-keys-section'))) await click('#settings-switch-keys', 150);
}
async function closeSettings() { await click('#settings-close', 250); }
async function resetAll() {
  await page.evaluate(() => { Shortcuts.setPlatform(null); Shortcuts.resetAll(); });
  await page.waitForTimeout(80);
}
// L'info-bulle d'un hôte [data-tip] : le ::after (css/toolbar-v2.css), son texte et son rectangle en coordonnées fenêtre, calculés depuis les valeurs résolues du navigateur.
const tipOf = id => page.evaluate(id => {
  const host = document.getElementById(id);
  const r = host.getBoundingClientRect();
  const cs = getComputedStyle(host, '::after');
  const w = parseFloat(cs.width) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const left = r.left + host.clientLeft + parseFloat(cs.left) - w / 2;
  return { content: cs.content.replace(/^"|"$/g, ''), opacity: Number(cs.opacity), left: Math.round(left * 10) / 10, right: Math.round((left + w) * 10) / 10 };
}, id);
// L'info-bulle d'un bouton paraît .35s après le survol et se fond en .12s (css/toolbar-v2.css) : on attend qu'elle soit entière.
async function hover(id) {
  const point = await page.evaluate(id => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(id => Number(getComputedStyle(document.getElementById(id), '::after').opacity) === 1, id, { timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(60);
}

// === Les touches de départ, à la vraie frappe ==================================================================================================================
async function starterKeysPart(T) {
  await resetAll();
  await setDoc('<p>Bonjour monde</p>');
  await focusEnd();

  await page.keyboard.press('Alt+l');
  await page.waitForTimeout(250);
  check(`${T} : Alt+L passe en Lecture`, (await mode()) === 'read', await mode());
  await page.keyboard.press('Alt+Shift+1');
  await page.waitForTimeout(150);
  check(`${T} : en Lecture, une touche de mise en forme ne change pas le document (grisée comme son bouton)`, !/<h1/.test(await html()) && (await plain()) === 'Bonjour monde', await html());
  await page.keyboard.press('Alt+e');
  await page.waitForTimeout(250);
  check(`${T} : Alt+E revient en Édition, le curseur est dans le document`, (await mode()) === 'edit' && (await focused()) === 'éditeur', { mode: await mode(), focus: await focused() });
  await page.keyboard.type('!');
  check(`${T} : la frappe suivante va dans le document, pas sur le bouton`, (await plain()) === 'Bonjour monde!' || (await plain()).includes('!'), await plain());
  await setDoc('<p>Bonjour monde</p>');
  await focusEnd();

  const headings = [['Alt+Shift+1', /<h1>Bonjour monde<\/h1>/, 'titre 1'], ['Alt+Shift+2', /<h2>Bonjour monde<\/h2>/, 'titre 2'], ['Alt+Shift+3', /<h3>Bonjour monde<\/h3>/, 'titre 3']];
  for (const [combo, re, name] of headings) {
    await page.keyboard.press(combo);
    await page.waitForTimeout(150);
    check(`${T} : ${combo.replace('Shift', 'Maj')} fait un ${name}, sans rien écrire dans le texte`, re.test(await html()) && (await plain()) === 'Bonjour monde', await html());
  }
  await page.keyboard.press('Alt+Shift+3');
  await page.waitForTimeout(150);
  check(`${T} : Alt+Maj+3 une seconde fois rend le paragraphe`, /<p>Bonjour monde<\/p>/.test(await html()) && !/<h\d/.test(await html()), await html());

  await page.keyboard.press('Alt+Enter');
  await page.waitForTimeout(200);
  check(`${T} : Alt+Entrée insère un saut de page`, (await html()).includes('page-break-marker'), await html());
  await setDoc('<p>Bonjour monde</p>');
  await focusEnd();
  await page.keyboard.press('Alt+Shift+d');
  await page.waitForTimeout(200);
  check(`${T} : Alt+Maj+D insère la bulle « Date du jour », sans lettre perdue dans le texte`, (await html()).includes('data-chip-kind="date"') && (await plain()) === 'Bonjour mondeDate du jour', { html: await html(), plain: await plain() });
  await setDoc('<p>Bonjour monde</p>');
  await focusEnd();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Alt+Shift+h');
  await page.waitForTimeout(200);
  check(`${T} : Alt+Maj+H surligne la sélection`, /background-color: rgb\(255, 242, 168\)/.test(await html()), await html());
  await page.keyboard.press('ArrowRight');

  // F2, Alt+M : le champ de nom, la liste des modèles.
  await setDoc('<p>Bonjour monde</p>');
  await focusEnd();
  await page.keyboard.press('F2');
  await page.waitForTimeout(250);
  check(`${T} : F2 ouvre le champ de nom du modèle, le curseur y est`, (await visible('#template-name')) && (await focused()) === 'template-name', { shown: await visible('#template-name'), focus: await focused() });
  await page.keyboard.press('F2');
  await page.waitForTimeout(200);
  check(`${T} : F2 une seconde fois referme le champ de nom, comme le bouton (même dans ce champ de saisie)`, !(await visible('#template-name')), await focused());
  await focusEnd();
  await page.keyboard.press('Alt+m');
  await page.waitForTimeout(300);
  const list = await page.evaluate(() => { const p = document.querySelector('.tts-popup'); return { open: !!p && p.classList.contains('is-open'), focus: (document.activeElement && (document.activeElement.id || document.activeElement.className)) || '' }; });
  check(`${T} : Alt+M ouvre la liste des modèles`, list.open, list);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check(`${T} : Échap la referme`, !(await page.evaluate(() => { const p = document.querySelector('.tts-popup'); return !!p && p.classList.contains('is-open'); })));
  await focusEnd();
  const before = await spied('btn-export-pdf');
  await page.keyboard.press('Alt+p');
  await page.waitForTimeout(200);
  check(`${T} : Alt+P presse le bouton « Exporter en PDF »`, (await spied('btn-export-pdf')) === before + 1, await spied('btn-export-pdf'));

  // Ctrl+/ : la liste. Fenêtre ouverte, plus aucune autre touche ne part.
  await focusEnd();
  await page.keyboard.press('Control+/');
  await page.waitForTimeout(300);
  check(`${T} : Ctrl+/ ouvre Réglages sur les touches, le premier bouton de touche a le focus`, (await settingsOpen()) && (await visible('#settings-keys-section')) && ((await focused()) || '').includes('settings-key-btn'), { open: await settingsOpen(), focus: await focused() });
  await page.keyboard.press('Alt+l');
  await page.waitForTimeout(150);
  check(`${T} : fenêtre ouverte, Alt+L ne change pas de mode`, (await mode()) === 'edit', await mode());
  await closeSettings();
  await setDoc('<p></p>');
}

// === Rechercher (Ctrl+F) et Rechercher et remplacer (Ctrl+H) : ceux de la barre de recherche, puis ceux qu'on choisit ================================================================
// Ctrl+F et Ctrl+H sont à js/find-replace.js tant qu'on n'y touche pas (ce module ne doit ni les gêner ni les doubler) ; changés dans la liste, la nouvelle touche ouvre la même barre
// sans la refermer si elle l'est déjà, l'ancienne ne fait plus rien, et la loupe dit la touche choisie.
async function findPart(T) {
  await resetAll();
  await setDoc('<p>Bonjour monde</p>');
  await focusEnd();
  const bar = () => page.evaluate(() => {
    const el = document.getElementById('pp-find-bar');
    const row = document.getElementById('pp-find-replace-row');
    return { open: FindReplace.isOpen() && !!el && !el.hidden, replaceRow: !!row && !row.hidden, focus: document.activeElement && document.activeElement.id };
  });
  const closeBar = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };
  // La ligne « Remplacer par » reste affichée d'une ouverture à l'autre (js/find-replace.js) : on la masque avant de mesurer ce que chaque touche ouvre.
  const hideReplaceRow = async () => {
    await page.evaluate(() => { FindReplace.open({ replace: false }); const row = document.getElementById('pp-find-replace-row'); if (row && !row.hidden) document.getElementById('pp-find-toggle-replace').click(); });
    await closeBar();
    await focusEnd();
  };
  await hideReplaceRow();
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(150);
  let state = await bar();
  check(`${T} : Ctrl+F ouvre la barre de recherche, le curseur dans son champ`, state.open && state.focus === 'pp-find-input' && !state.replaceRow, state);
  await closeBar();
  check(`${T} : Échap la referme et rend le curseur au texte`, !(await bar()).open && (await focused()) === 'éditeur', { bar: await bar(), focus: await focused() });
  await hideReplaceRow();
  await page.keyboard.press('Control+h');
  await page.waitForTimeout(150);
  state = await bar();
  check(`${T} : Ctrl+H ouvre aussi la ligne « Remplacer par »`, state.open && state.replaceRow, state);
  await closeBar();

  // « Rechercher » sur Alt+F, dans la liste.
  await openKeys();
  await click(keyBtn('find'), 150);
  await page.keyboard.press('Alt+f');
  await page.waitForTimeout(150);
  check(`${T} : « Rechercher » prend Alt+F dans la liste`, (await text(keyBtn('find'))) === 'Alt+F' && (await stored()) === JSON.stringify({ find: 'Alt+f' }), { shown: await text(keyBtn('find')), stored: await stored() });
  await closeSettings();
  await setDoc('<p>Bonjour monde</p>');
  await focusEnd();
  await hideReplaceRow();
  await page.keyboard.press('Alt+f');
  await page.waitForTimeout(150);
  state = await bar();
  check(`${T} : Alt+F ouvre la barre de recherche, le curseur dans son champ, sans la ligne « Remplacer par »`, state.open && state.focus === 'pp-find-input' && !state.replaceRow, state);
  await page.keyboard.press('Alt+f');
  await page.waitForTimeout(150);
  check(`${T} : Alt+F une seconde fois ne la referme pas (une touche de recherche ne ferme rien)`, (await bar()).open, await bar());
  await closeBar();
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(150);
  check(`${T} : Ctrl+F ne fait plus rien : pas de barre de recherche, le curseur reste dans le texte`, !(await bar()).open && (await focused()) === 'éditeur', { bar: await bar(), focus: await focused() });
  await hover('v2-btn-find');
  const tip = await tipOf('v2-btn-find');
  check(`${T} : l'infobulle de la loupe dit la touche choisie (« ${tip.content} »)`, /\(Alt\+F\)$/.test(tip.content), tip.content);
  await resetAll();
}

// === Changer une touche, à la vraie souris et au vrai clavier ==================================================================================================
async function remapPart(T, fr) {
  await resetAll();
  await setDoc('<p>Bonjour monde</p>');
  await openKeys();
  const L = fr ? { listening: 'Tapez la touche…', none: 'Aucune', dupe: 'Alt+B est déjà la touche de «\u00a0Gras\u00a0».', alone: 'Ajoutez Ctrl (⌘ sur Mac) ou Alt : une touche seule s’écrirait dans le texte.', bold: 'Gras', reset: 'Par défaut' }
    : { listening: 'Press a key…', none: 'None', dupe: 'Alt+B is already the key for “Bold”.', alone: 'Add Ctrl (⌘ on Mac) or Alt: a key on its own would be typed into the text.', bold: 'Bold', reset: 'Default' };
  const rowCount = await page.evaluate(() => document.querySelectorAll('#settings-keys-list .settings-key-row').length);
  const actionCount = await page.evaluate(() => Shortcuts.ACTIONS.length);
  check(`${T} : la liste montre une ligne par action (${rowCount} sur ${actionCount})`, rowCount === actionCount && actionCount === 54, { rowCount, actionCount });
  check(`${T} : au départ rien n'est changé : « ${L.reset} » et « Tout remettre » grisés`, await page.evaluate(() => Array.from(document.querySelectorAll('.settings-key-reset')).every(b => b.disabled) && document.getElementById('settings-keys-reset-all').disabled));

  // Gras : Alt+B à la place de Ctrl+B.
  await click(keyBtn('bold'), 150);
  check(`${T} : un clic sur la touche de « ${L.bold} » écoute la suivante`, (await text(keyBtn('bold'))) === L.listening && (await page.evaluate(() => Shortcuts.isRecording())), await text(keyBtn('bold')));
  await snap(`${T}-1-ecoute`);
  await page.keyboard.press('Alt+b');
  await page.waitForTimeout(150);
  check(`${T} : Alt+B est prise : la ligne la montre, l'écoute s'arrête, « ${L.reset} » s'allume`, (await text(keyBtn('bold'))) === 'Alt+B' && !(await page.evaluate(() => Shortcuts.isRecording())) && !(await page.evaluate(sel => document.querySelector(sel).disabled, resetBtn('bold'))), await text(keyBtn('bold')));
  check(`${T} : le choix est gardé dans le navigateur (seul le gras est changé)`, (await stored()) === '{"bold":"Alt+b"}', await stored());
  check(`${T} : la touche reste sur son bouton (focus conservé)`, (await focused()).includes('settings-key-btn'), await focused());

  // Doublon : « Italique » essaie Alt+B. Le message est sous la touche, pas sous le nom de l'action.
  await click(keyBtn('italic'), 120);
  const keyLeftBefore = await edge(keyBtn('italic'), 'left');
  await page.keyboard.press('Alt+b');
  await page.waitForTimeout(150);
  check(`${T} : une touche déjà prise est refusée, la raison est écrite sous la touche`, (await text(errorOf('italic'))) === L.dupe && (await page.evaluate(sel => document.querySelector(sel).getAttribute('aria-invalid'), keyBtn('italic'))) === 'true', await text(errorOf('italic')));
  check(`${T} : l'écoute continue après un refus`, await page.evaluate(() => Shortcuts.isRecording()));
  const errLeft = await edge(errorOf('italic'), 'left'), btnLeft = await edge(keyBtn('italic'), 'left'), nameLeft = await edge(`.settings-key-row[data-action="italic"] .settings-key-name`, 'left');
  const errTop = await edge(errorOf('italic'), 'top'), btnBottom = await edge(keyBtn('italic'), 'bottom');
  const errRight = await edge(errorOf('italic'), 'right'), resetRight = await edge(resetBtn('italic'), 'right');
  check(`${T} : le message commence sous la touche (sa colonne), pas sous le nom de l'action`, Math.abs(errLeft - btnLeft) <= 1 && errLeft - nameLeft > 100 && errTop >= btnBottom - 0.5, { errLeft, btnLeft, nameLeft, errTop, btnBottom });
  check(`${T} : le message tient dans la largeur de la touche et de « ${L.reset} », sans élargir la ligne`, errRight <= resetRight + 1 && (await edge(keyBtn('italic'), 'left')) === keyLeftBefore, { errRight, resetRight, keyLeftBefore, keyLeft: await edge(keyBtn('italic'), 'left') });
  await snap(`${T}-2-refus`);
  await page.keyboard.press('a');
  await page.waitForTimeout(100);
  check(`${T} : une touche seule est refusée avec sa raison`, (await text(errorOf('italic'))) === L.alone, await text(errorOf('italic')));
  await page.keyboard.press('Control+Alt+q');
  await page.waitForTimeout(100);
  check(`${T} : Ctrl+Alt (AltGr) est refusée : elle écrit des caractères`, /AltGr/.test((await text(errorOf('italic'))) || ''), await text(errorOf('italic')));
  await page.keyboard.press('Control+e');
  await page.waitForTimeout(100);
  check(`${T} : Ctrl+E, gardée par l'éditeur, est refusée`, /Ctrl\+E/.test((await text(errorOf('italic'))) || '') && (await page.evaluate(() => Shortcuts.isRecording())), await text(errorOf('italic')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check(`${T} : Échap abandonne : plus d'écoute, le message disparaît, la fenêtre reste ouverte, Ctrl+I reste à l'italique`, !(await page.evaluate(() => Shortcuts.isRecording())) && !(await visible(errorOf('italic'))) && (await settingsOpen()) && (await text(keyBtn('italic'))) === 'Ctrl+I', { rec: await page.evaluate(() => Shortcuts.isRecording()), open: await settingsOpen(), key: await text(keyBtn('italic')) });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check(`${T} : un second Échap ferme la fenêtre`, !(await settingsOpen()), await focused());

  // La nouvelle touche marche, l'ancienne ne fait plus rien : l'éditeur ne la voit même pas.
  await setDoc('<p>Bonjour monde</p>');
  await focusEnd();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(150);
  check(`${T} : Ctrl+B, rendue, ne met plus en gras`, !/<strong|<b>/.test(await html()) && (await plain()) === 'Bonjour monde', await html());
  await page.keyboard.press('Alt+b');
  await page.waitForTimeout(150);
  check(`${T} : Alt+B met en gras`, /<strong>Bonjour monde<\/strong>/.test(await html()), await html());
  await page.keyboard.press('Alt+b');
  await page.waitForTimeout(150);
  check(`${T} : Alt+B une seconde fois retire le gras (même geste que le bouton)`, !/<strong|<b>/.test(await html()), await html());
  await page.keyboard.press('Control+i');
  await page.waitForTimeout(150);
  check(`${T} : Ctrl+I, qu'on n'a pas touchée, met toujours en italique`, /<em>Bonjour monde<\/em>/.test(await html()), await html());
  await page.keyboard.press('Control+i');

  // Infobulle du bouton, à la vraie souris.
  await hover('v2-btn-bold');
  const tip = await tipOf('v2-btn-bold');
  check(`${T} : l'infobulle du bouton Gras montre la nouvelle touche`, tip.content === `${L.bold} (Alt+B)` && tip.opacity === 1, tip);
  check(`${T} : le bouton la dit aux lecteurs d'écran (aria-keyshortcuts)`, (await page.evaluate(() => document.getElementById('v2-btn-bold').getAttribute('aria-keyshortcuts'))) === 'Alt+B');
  await snap(`${T}-3-infobulle`);

  // Retirer la touche (Retour arrière), puis la rendre (« Par défaut »), à la souris.
  await openKeys();
  await click(keyBtn('bold'), 120);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(150);
  check(`${T} : Retour arrière retire la touche : la ligne dit « ${L.none} »`, (await text(keyBtn('bold'))) === L.none && (await stored()) === '{"bold":""}', { shown: await text(keyBtn('bold')), stored: await stored() });
  await closeSettings();
  await setDoc('<p>Bonjour monde</p>');
  await focusEnd();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+b');
  await page.keyboard.press('Alt+b');
  await page.waitForTimeout(150);
  check(`${T} : sans touche, ni Ctrl+B ni Alt+B ne mettent en gras`, !/<strong|<b>/.test(await html()), await html());
  await hover('v2-btn-bold');
  check(`${T} : l'infobulle ne montre plus de touche`, (await tipOf('v2-btn-bold')).content === L.bold, await tipOf('v2-btn-bold'));
  await openKeys();
  await click(resetBtn('bold'), 150);
  check(`${T} : « ${L.reset} » rend Ctrl+B : la ligne, le navigateur et le grisé du bouton`, (await text(keyBtn('bold'))) === 'Ctrl+B' && (await stored()) === null && (await page.evaluate(sel => document.querySelector(sel).disabled, resetBtn('bold'))), { shown: await text(keyBtn('bold')), stored: await stored() });
  await closeSettings();
  await focusEnd();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(150);
  check(`${T} : Ctrl+B met de nouveau en gras`, /<strong>Bonjour monde<\/strong>/.test(await html()), await html());
  await page.keyboard.press('Control+b');

  // Tout remettre par défaut : une confirmation (Échap l'abandonne), puis tout est rendu.
  await openKeys();
  await click(keyBtn('italic'), 100);
  await page.keyboard.press('Alt+i');
  await click(keyBtn('underline'), 100);
  await page.keyboard.press('Alt+u');
  await page.waitForTimeout(100);
  check(`${T} : deux touches changées : « Tout remettre par défaut » s'allume`, !(await page.evaluate(() => document.getElementById('settings-keys-reset-all').disabled)) && (await stored()) === '{"italic":"Alt+i","underline":"Alt+u"}', await stored());
  await click('#settings-keys-reset-all', 300);
  const dialog = await page.evaluate(() => { const m = document.getElementById('pp-dialog-modal'); return { open: !!m && m.style.display !== 'none', title: (document.getElementById('pp-dialog-title') || {}).textContent }; });
  check(`${T} : une confirmation s'ouvre, dans la langue de l'interface`, dialog.open && dialog.title === (fr ? 'Remettre toutes les touches par défaut ?' : 'Reset all keys to their defaults?'), dialog);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check(`${T} : Échap abandonne : rien n'est rendu, Réglages reste ouvert`, (await stored()) === '{"italic":"Alt+i","underline":"Alt+u"}' && (await settingsOpen()), await stored());
  await click('#settings-keys-reset-all', 300);
  await click('#pp-dialog-modal .var-modal-primary', 350);
  check(`${T} : confirmée, toutes les touches reviennent à celles d'origine`, (await stored()) === null && (await text(keyBtn('italic'))) === 'Ctrl+I' && (await page.evaluate(() => document.getElementById('settings-keys-reset-all').disabled)), { stored: await stored(), italic: await text(keyBtn('italic')) });
  await closeSettings();
}

// === Au clavier seul ===========================================================================================================================================
async function keyboardOnlyPart(T) {
  await resetAll();
  await setDoc('<p>Bonjour monde</p>');
  await focusEnd();
  await page.keyboard.press('Control+/');
  await page.waitForTimeout(300);
  const first = await focused();
  await page.keyboard.press('Tab');
  const second = await focused();
  check(`${T} : Tab passe d'une touche à la suivante (les boutons « Par défaut » grisés sont sautés)`, first !== second && (await page.evaluate(() => document.activeElement.classList.contains('settings-key-btn'))), { first, second });
  const row = await page.evaluate(() => document.activeElement.closest('.settings-key-row').dataset.action);
  check(`${T} : la ligne qui a le focus est celle de « Nouveau modèle » (sans touche d'origine)`, row === 'new', row);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  check(`${T} : Entrée sur une touche l'écoute`, await page.evaluate(() => Shortcuts.isRecording()), await text(keyBtn('new')));
  await page.keyboard.press('Alt+n');
  await page.waitForTimeout(150);
  check(`${T} : Alt+N est prise, le focus reste sur la touche`, (await text(keyBtn('new'))) === 'Alt+N' && (await focused()).includes('settings-key-btn') && !(await page.evaluate(() => Shortcuts.isRecording())), { shown: await text(keyBtn('new')), focus: await focused() });
  await page.keyboard.press('Tab');
  check(`${T} : Tab mène à « Par défaut », devenu actif`, await page.evaluate(() => document.activeElement.classList.contains('settings-key-reset') && !document.activeElement.disabled), await focused());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await focusEnd();
  const before = await spied('btn-new');
  await page.keyboard.press('Alt+n');
  await page.waitForTimeout(200);
  check(`${T} : une fois la fenêtre fermée, Alt+N presse « Nouveau modèle »`, (await spied('btn-new')) === before + 1, await spied('btn-new'));
  // Retour à l'état d'origine par le clavier.
  await page.keyboard.press('Control+/');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  check(`${T} : « Par défaut », pressé au clavier, rend la ligne à « Aucune »`, (await stored()) === null, await stored());
  await closeSettings();
}

// === La liste tient dans 700x400 ===============================================================================================================================
async function layoutPart(T) {
  await resetAll();
  await openKeys();
  const geometry = () => page.evaluate(() => {
    const body = document.querySelector('#settings-modal .settings-body');
    const box = document.querySelector('#settings-modal .pp-modal-box').getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll('#settings-keys-list .settings-key-row'));
    const b = body.getBoundingClientRect();
    const last = rows[rows.length - 1].getBoundingClientRect();
    const heights = rows.map(r => Math.round(r.getBoundingClientRect().height));
    const cut = rows.map(r => r.querySelector('.settings-key-name')).filter(n => n.scrollWidth > n.clientWidth).map(n => n.textContent);
    const outside = rows.filter(r => { const k = r.querySelector('.settings-key-btn').getBoundingClientRect(); const x = r.querySelector('.settings-key-reset').getBoundingClientRect(); return k.left < b.left - 0.5 || x.right > b.right + 0.5; }).length;
    return {
      boxInPanel: box.left >= -0.5 && box.top >= -0.5 && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5,
      scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, scrollTop: Math.round(body.scrollTop), scrollWidth: body.scrollWidth, clientWidth: body.clientWidth,
      lastVisible: last.top >= b.top - 1 && last.bottom <= b.bottom + 1,
      closeTop: Math.round(document.getElementById('settings-close').getBoundingClientRect().top), tabsTop: Math.round(document.getElementById('settings-tabs').getBoundingClientRect().top),
      titleTop: Math.round(document.getElementById('settings-title').getBoundingClientRect().top),
      pageScroll: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
      minRow: Math.min(...heights), maxRow: Math.max(...heights), cut, outside,
    };
  });
  const before = await geometry();
  check(`${T} : la fenêtre tient dans le panneau`, before.boxInPanel, before);
  check(`${T} : quarante-huit lignes dépassent le cadre : le contenu de l'onglet défile (${before.scrollHeight}px pour ${before.clientHeight}px)`, before.scrollHeight > before.clientHeight + 200 && !before.lastVisible, before);
  check(`${T} : aucune ligne ne revient à la ligne (hauteurs ${before.minRow} à ${before.maxRow}px) et aucun nom n'est coupé`, before.maxRow - before.minRow <= 2 && before.maxRow <= 40 && before.cut.length === 0, { minRow: before.minRow, maxRow: before.maxRow, cut: before.cut });
  check(`${T} : rien ne déborde à droite : ni défilement latéral, touches et « Par défaut » dans le cadre`, before.scrollWidth <= before.clientWidth + 1 && before.outside === 0, { scrollWidth: before.scrollWidth, clientWidth: before.clientWidth, outside: before.outside });
  await snap(`${T}-4-liste-haut`);
  await page.mouse.move(WIDTH / 2, HEIGHT / 2);
  await page.mouse.wheel(0, 6000);
  await page.waitForTimeout(300);
  const after = await geometry();
  check(`${T} : la molette révèle la dernière ligne ; titre, onglets et « Fermer » ne bougent pas, la page non plus`, after.scrollTop > 0 && after.lastVisible && after.closeTop === before.closeTop && after.tabsTop === before.tabsTop && after.titleTop === before.titleTop && !after.pageScroll, { before, after });
  await snap(`${T}-5-liste-bas`);
  await closeSettings();
}

// === Les infobulles et les lignes de menu ======================================================================================================================
async function tooltipsPart(T, fr) {
  await resetAll();
  // Un nom de touche long sur le bouton le plus à droite : l'infobulle ne doit pas sortir de la fenêtre.
  await page.evaluate(() => Shortcuts.setKey('settings', 'Alt+Shift+Backspace'));
  await page.waitForTimeout(120);
  const hosts = await page.evaluate(() => Array.from(document.querySelectorAll('.bar-row [data-tip][data-keytip], #v2-toolbar [data-tip][data-keytip]')).filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.closest('.v2-hover-flyout') && !el.disabled && r.bottom <= innerHeight && r.right <= innerWidth && r.left >= 0 && !!el.id;
  }).map(el => el.id));
  check(`${T} : des boutons de la barre montrent une touche dans leur infobulle (${hosts.length})`, hosts.length >= 10, hosts);
  const bad = [];
  for (const id of hosts) {
    await hover(id);
    const tip = await tipOf(id);
    const expected = await page.evaluate(id => { const el = document.getElementById(id); return (el.getAttribute('data-tip') || '') + (el.getAttribute('data-keytip') || ''); }, id);
    if (tip.content !== expected || tip.opacity !== 1 || tip.left < -0.5 || tip.right > WIDTH + 0.5) bad.push({ id, expected, tip });
  }
  check(`${T} : survol à la souris : chaque infobulle dit le texte et la touche, entière, dans la fenêtre`, bad.length === 0, bad.slice(0, 3));
  await hover('v2-btn-settings');
  const long = await tipOf('v2-btn-settings');
  check(`${T} : la touche la plus longue (${long.content}) tient aussi, sur le bouton le plus à droite`, long.opacity === 1 && long.left >= -0.5 && long.right <= WIDTH + 0.5 && /\(Alt\+/.test(long.content), long);
  await snap(`${T}-6-infobulle-longue`);
  await page.evaluate(() => Shortcuts.resetKey('settings'));

  // Un menu au survol : la touche à droite de chaque ligne, rien ne déborde.
  const point = await page.evaluate(() => { const b = document.getElementById('v2-heading-flyout').closest('.v2-hover-group').querySelector('button'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(450);
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#v2-heading-flyout .v2-hover-row')).filter(r => r.dataset.keyhint).map(r => {
    const rect = r.getBoundingClientRect();
    return { level: r.dataset.level, hint: r.dataset.keyhint, shown: getComputedStyle(r, '::after').content.replace(/^"|"$/g, ''), visible: rect.width > 0 && rect.height > 0, inPanel: rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight, overflow: r.scrollWidth > r.clientWidth + 1 };
  }));
  check(`${T} : le menu Titre montre Alt+Maj+1, 2 et 3 à droite de ses lignes, sans déborder`, rows.length === 3 && rows.every(r => r.visible && r.inPanel && !r.overflow && r.shown === r.hint) && rows.map(r => r.hint).join(',') === (fr ? 'Alt+Maj+1,Alt+Maj+2,Alt+Maj+3' : 'Alt+Shift+1,Alt+Shift+2,Alt+Shift+3'), rows);
  await snap(`${T}-7-menu-titre`);
  // Un vrai clic sur « Titre 2 » : la touche affichée n'a rien changé au geste.
  await page.evaluate(() => { Editor.setHTML('<p>Bonjour monde</p>'); });
  await focusEnd();
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(450);
  const rowPoint = await page.evaluate(() => { const r = document.querySelector('#v2-heading-flyout .v2-hover-row[data-level="2"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(rowPoint.x, rowPoint.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(250);
  check(`${T} : un vrai clic sur la ligne « Titre 2 » fait toujours un titre 2`, /<h2>Bonjour monde<\/h2>/.test(await html()), await html());
  await page.mouse.move(WIDTH / 2, HEIGHT - 20);
  await page.waitForTimeout(250);
}

async function run(theme, fr) {
  const T = theme;
  await starterKeysPart(T);
  await findPart(T);
  await remapPart(T, fr);
  await keyboardOnlyPart(T);
  await layoutPart(T);
  await tooltipsPart(T, fr);
}

// === Anglais : la liste, les refus, les infobulles =============================================================================================================
async function englishPart() {
  const T = 'anglais';
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(300);
  await resetAll();
  await openKeys();
  const labels = await page.evaluate(() => ({
    tab: document.querySelector('.settings-tab[data-settings-tab="shortcuts"]').textContent,
    title: document.getElementById('settings-keys-title').textContent,
    group: Array.from(document.querySelectorAll('.settings-keys-group')).map(g => g.textContent).join('|'),
    heading: document.querySelector('.settings-key-row[data-action="heading1"] .settings-key-btn').textContent,
    name: document.querySelector('.settings-key-row[data-action="heading1"] .settings-key-name').textContent,
  }));
  check(`${T} : onglet, titre, groupes et touches de la liste sont en anglais (« Alt+Shift+1 »)`, labels.tab === 'Shortcuts' && labels.title === 'Keyboard keys' && labels.group === 'Templates|View|Formatting|Insert|History and tracking' && labels.heading === 'Alt+Shift+1', labels);
  await snap(`${T}-1-liste`);
  await closeSettings();
  await remapPart(T, false);
  await keyboardOnlyPart(T);
  await layoutPart(T);
  await tooltipsPart(T, false);
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(250);
}

// === Mode Mac : ⌥L, ⌘B, et la touche Commande de la vraie frappe ================================================================================================
async function macPart() {
  const T = 'mac';
  await resetAll();
  await page.evaluate(() => Shortcuts.setPlatform('mac'));
  await openKeys();
  const keys = await page.evaluate(() => ({ read: document.querySelector('.settings-key-row[data-action="modeRead"] .settings-key-btn').textContent, bold: document.querySelector('.settings-key-row[data-action="bold"] .settings-key-btn').textContent, h1: document.querySelector('.settings-key-row[data-action="heading1"] .settings-key-btn').textContent, enter: document.querySelector('.settings-key-row[data-action="pageBreak"] .settings-key-btn').textContent }));
  check(`${T} : la liste écrit ⌥L, ⌘B, ⌥⇧1 et ⌥↩`, keys.read === '⌥L' && keys.bold === '⌘B' && keys.h1 === '⌥⇧1' && keys.enter === '⌥↩', keys);
  await snap(`${T}-1-liste`);
  // Ctrl+lettre y sert à se déplacer dans le texte : refusé avec sa raison.
  await click(keyBtn('table'), 120);
  await page.keyboard.press('Control+t');
  await page.waitForTimeout(120);
  check(`${T} : Ctrl+lettre est refusée (elle déplace le curseur sur un Mac)`, /Ctrl/.test((await text(errorOf('table'))) || '') && (await page.evaluate(() => Shortcuts.isRecording())), await text(errorOf('table')));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  // Mode lecture n'a plus d'info-bulle : son menu au survol (« Lecture épurée », js/clean-reading.js) la remplace, et son titre dit la touche, comme celui des menus Nouveau et Exporter.
  const readPoint = await page.evaluate(() => { const r = document.getElementById('btn-mode-read').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(readPoint.x, readPoint.y);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('v2-read-flyout')).display !== 'none', null, { timeout: 2500 }).catch(() => {});
  const readTitle = await page.evaluate(() => { const l = document.querySelector('#v2-read-flyout .v2-hover-flyout-label'); return l.textContent + getComputedStyle(l, '::after').content.replace(/^"|"$/g, ''); });
  check(`${T} : le titre du menu de Mode lecture montre ⌥L`, readTitle === 'Mode lecture (⌥L)', readTitle);
  await focusEnd();
  await page.keyboard.press('Control+/');
  await page.waitForTimeout(250);
  check(`${T} : Ctrl+/ n'ouvre rien (la touche est ⌘/)`, !(await settingsOpen()));
  await page.keyboard.press('Meta+/');
  await page.waitForTimeout(300);
  check(`${T} : ⌘/ ouvre la liste des touches`, (await settingsOpen()) && (await visible('#settings-keys-section')), await settingsOpen());
  await closeSettings();
  await page.evaluate(() => Shortcuts.setPlatform(null));
  await page.waitForTimeout(120);
}

await run('clair', true);
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(250);
await run('sombre', true);
await page.evaluate(() => Settings.setTheme('light'));
await page.waitForTimeout(250);
await englishPart();
await macPart();
await resetAll();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
