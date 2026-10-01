#!/usr/bin/env node
// Expansion de texte « §ub » (js/text-expansion.js, css/text-expansion.css) : le panneau de 700x400 d'Antoine, au VRAI clavier (page.keyboard : frappe, Tab, Entrée, flèches,
// Échap, Retour arrière) et à la vraie souris (page.mouse), en clair et en sombre. Ce que dev-tests/scenarios-text-expansion.js ne peut pas voir depuis la page : une frappe
// réelle passe par les évènements du navigateur (keydown, beforeinput) et l'ordre des plugins ProseMirror, qu'un execCommand('insertText') ne rejoue pas.
//  - « § » ouvre la liste sous le curseur, dans le panneau et au premier plan ; elle se filtre à la frappe ;
//  - « §ub » + espace (ou ponctuation) remplace l'abréviation par son texte, la mise en forme suit, Retour arrière rend la saisie d'origine ;
//  - Tab, Entrée, flèches et Échap dans la liste, y compris dans un élément de liste à puces (où Tab veut dire « descendre d'un cran ») ;
//  - l'onglet Réglages > Raccourcis : ajout, modification, suppression à la souris, sept onglets sur une ligne, tout tient dans 700x400 ;
//  - l'interface en anglais.
// Lancé par run-headless.mjs (groupe Node "textExpansionKeyboard", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-text-expansion-keyboard.mjs
// EXPANSION_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.EXPANSION_KEYBOARD_PORT || 8914);
const SHOTS = process.env.EXPANSION_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-links-blocks-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-text-expansion-keyboard] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const html = () => page.evaluate(() => Editor.getHTML());
// Texte brut du document (les retours à la ligne internes d'un paragraphe sont écrits « ⏎ »).
const plain = () => page.evaluate(() => {
  const clone = document.createElement('div');
  clone.innerHTML = Editor.getHTML();
  clone.querySelectorAll('br').forEach(b => b.replaceWith('⏎'));
  return clone.textContent;
});
const boxState = () => page.evaluate(() => {
  const box = document.getElementById('expansion-box');
  if (!box || box.style.display === 'none') return { open: false };
  const r = box.getBoundingClientRect();
  const items = Array.from(box.querySelectorAll('.ex-item')).map(i => ({ abbr: i.querySelector('.ex-abbr').textContent, text: i.querySelector('.ex-text').textContent, selected: i.classList.contains('selected') }));
  const x = r.left + 10, y = r.top + 10;
  const top = document.elementFromPoint(x, y);
  return { open: true, items, inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && box.contains(top), l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
});
async function setDoc(doc) {
  await page.evaluate(d => { Editor.setHTML(d); }, doc);
  await page.waitForTimeout(250);
}
// Pointe un texte de l'éditeur (milieu par défaut) pour y cliquer pour de vrai.
const pointOf = (text, at = 0.5) => page.evaluate(({ text, at }) => {
  const walker = document.createTreeWalker(document.querySelector('.tiptap'), NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const i = n.textContent.indexOf(text);
    if (i < 0) continue;
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width * at, y: b.top + b.height / 2 };
  }
  return null;
}, { text, at });
// Curseur à la fin du dernier paragraphe, par un vrai clic dans l'éditeur puis Ctrl+Fin.
async function focusEnd() {
  const box = await page.evaluate(() => { const r = document.querySelector('.tiptap').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 20 }; });
  await page.mouse.click(box.x, box.y);
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(80);
}

// Abréviations de la personne, posées par l'API du module (la table est créée à la première, comme pour une vraie personne).
await page.evaluate(async () => {
  await TextExpansion.add('ub', 'université de Bordeaux');
  await TextExpansion.add('adr', '12 rue des Lilas, 33000 Bordeaux');
  await TextExpansion.add('sig', 'Cordialement,\nAntoine');
  await TextExpansion.add('bj', 'Bonjour,');
});


// === Réglages > Raccourcis : abréviations, à la vraie souris et au vrai clavier ===============================================================================
const hit = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { found: true, w: Math.round(r.width), h: Math.round(r.height), inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === el || el.contains(top)) };
}, selector);
const text = selector => page.evaluate(sel => { const el = document.querySelector(sel); return el ? el.textContent : null; }, selector);
const visible = selector => page.evaluate(sel => { const el = document.querySelector(sel); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; }, selector);
const rows = () => page.evaluate(() => Array.from(document.querySelectorAll('#settings-expansion-list .settings-expansion-row')).map(r => r.querySelector('.settings-expansion-abbr').textContent + ' = ' + r.querySelector('.settings-expansion-text').textContent));
const tableRows = () => page.evaluate(() => { const t = __gristStub.state.rows.Publipostage_Abreviations; return t.id.map((id, i) => ({ id, user: t.Utilisateur[i], abbr: t.Abreviation[i], text: t.Texte[i] })); });
const focusedId = () => page.evaluate(() => (document.activeElement && (document.activeElement.id || document.activeElement.tagName)) || 'rien');
// Bord gauche ou droit (en px, arrondi au dixième) de l'élément : la position d'un message par rapport à son champ se compare à la vraie mise en page.
const edge = (selector, side) => page.evaluate(({ selector, side }) => { const r = document.querySelector(selector).getBoundingClientRect(); return Math.round(r[side] * 10) / 10; }, { selector, side });
async function click(selector, wait = 150) { await page.click(selector, { timeout: 5000 }); await page.waitForTimeout(wait); }
async function openShortcutsTab() {
  await click('#v2-btn-settings', 250);
  await click('#settings-modal .settings-tab[data-settings-tab="shortcuts"]', 300);
}
async function closeSettings() { await click('#settings-close', 250); }

async function settingsPart(T, fr) {
  await openShortcutsTab();
  const L = fr ? {
    add: 'Ajouter', save: 'Enregistrer', edit: 'Modifier', del: 'Supprimer', tab: 'Raccourcis', title: 'Abréviations',
    dup: 'Cette abréviation existe déjà.', chars: 'Lettres, chiffres, tiret et tiret bas seulement, sans espace.', textEmpty: 'Saisissez le texte à écrire.', empty: 'Saisissez une abréviation.',
    sameVars: 'Ce caractère ouvre déjà le panneau des variables (onglet Déclencheur) : choisissez-en un autre.', confirm: 'Supprimer l’abréviation §merci ?',
  } : {
    add: 'Add', save: 'Save', edit: 'Edit', del: 'Delete', tab: 'Shortcuts', title: 'Abbreviations',
    dup: 'This abbreviation already exists.', chars: 'Letters, digits, hyphen and underscore only, no spaces.', textEmpty: 'Enter the text to write.', empty: 'Enter an abbreviation.',
    sameVars: 'This character already opens the variables panel (Trigger tab): pick another one.', confirm: 'Delete abbreviation §merci?',
  };
  const tab = await page.evaluate(() => document.querySelector('.settings-tab[data-settings-tab="shortcuts"]').textContent);
  check(`${T} : l'onglet s'appelle « ${L.tab} » et son panneau est seul affiché`, tab === L.tab && (await page.evaluate(() => Array.from(document.querySelectorAll('.settings-panel')).filter(p => !p.hidden).map(p => p.dataset.settingsPanel).join())) === 'shortcuts', tab);
  check(`${T} : le titre de la section est « ${L.title} »`, (await text('#settings-expansion-title')) === L.title, await text('#settings-expansion-title'));
  const listed = await rows();
  check(`${T} : la liste montre les quatre abréviations de la personne, classées`, listed.join(' | ') === '§adr = 12 rue des Lilas, 33000 Bordeaux | §bj = Bonjour, | §sig = Cordialement,\nAntoine | §ub = université de Bordeaux', listed);
  check(`${T} : l'explication cite le caractère réglé (« §ub »)`, (await text('#settings-expansion-intro')).includes('§ub'), await text('#settings-expansion-intro'));
  check(`${T} : le champ du caractère montre « § »`, (await page.inputValue('#settings-expansion-char')) === '§');
  const closeBox = await hit('#settings-close');
  const boxBox = await hit('#settings-modal .pp-modal-box');
  check(`${T} : la fenêtre tient dans le panneau et « Fermer » est visible, au premier plan`, boxBox.found && boxBox.inPanel && closeBox.found && closeBox.inPanel && closeBox.onTop, { boxBox, closeBox });
  await snap(`${T}-2-reglages-${fr ? 'fr' : 'en'}`);

  // Ajout : champ Abréviation, Tab, champ Texte (Entrée y passe à la ligne), Ctrl+Entrée enregistre.
  await click('#settings-expansion-abbr');
  await page.keyboard.type('§merci');
  await page.keyboard.press('Tab');
  check(`${T} : Tab mène de l'abréviation au texte`, (await focusedId()) === 'settings-expansion-text', await focusedId());
  await page.keyboard.type('Merci beaucoup');
  await page.keyboard.press('Enter');
  await page.keyboard.type('et bonne journée');
  check(`${T} : Entrée dans le texte passe à la ligne sans rien enregistrer`, (await tableRows()).length === 4 && (await page.inputValue('#settings-expansion-text')) === 'Merci beaucoup\net bonne journée', await tableRows());
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(250);
  let table = await tableRows();
  check(`${T} : Ctrl+Entrée ajoute la ligne dans la table du document, pour la personne courante, sans le « § » collé`, table.length === 5 && table[4].abbr === 'merci' && table[4].text === 'Merci beaucoup\net bonne journée' && table[4].user === '', table);
  check(`${T} : la ligne apparaît dans la liste et le formulaire est vidé, le focus revient à l'abréviation`, (await rows()).includes('§merci = Merci beaucoup\net bonne journée') && (await page.inputValue('#settings-expansion-abbr')) === '' && (await focusedId()) === 'settings-expansion-abbr', { rows: await rows(), focus: await focusedId() });

  // Refus : doublon (casse ignorée), caractères interdits, texte vide, abréviation vide.
  await page.keyboard.type('UB');
  await page.keyboard.press('Tab');
  await page.keyboard.type('autre');
  await click(`#settings-expansion-submit`, 250);
  check(`${T} : une abréviation déjà prise est refusée (casse ignorée), le message le dit`, (await text('#settings-expansion-status')) === L.dup && (await tableRows()).length === 5, { msg: await text('#settings-expansion-status'), n: (await tableRows()).length });
  check(`${T} : le focus retourne au champ fautif`, (await focusedId()) === 'settings-expansion-abbr', await focusedId());
  await snap(`${T}-4-erreur-formulaire`);
  const fieldLeft = await edge('#settings-expansion-abbr', 'left');
  const labelLeft = await edge('label[for="settings-expansion-abbr"]', 'left');
  const messageLeft = await edge('#settings-expansion-status', 'left');
  check(`${T} : le message du formulaire commence sous les champs (colonne des champs), pas sous leur libellé`, Math.abs(messageLeft - fieldLeft) <= 1 && messageLeft - labelLeft > 40, { fieldLeft, labelLeft, messageLeft });
  const textBottom = await edge('#settings-expansion-text', 'bottom');
  const messageTop = await edge('#settings-expansion-status', 'top');
  const submitTop = await edge('#settings-expansion-submit', 'top');
  check(`${T} : le message est entre le champ de texte et les boutons`, messageTop >= textBottom && messageTop < submitTop, { textBottom, messageTop, submitTop });
  await page.fill('#settings-expansion-abbr', 'a b');
  await click('#settings-expansion-submit', 250);
  check(`${T} : un espace dans l'abréviation est refusé`, (await text('#settings-expansion-status')) === L.chars, await text('#settings-expansion-status'));
  await page.fill('#settings-expansion-abbr', 'ok');
  await page.fill('#settings-expansion-text', '   ');
  await click('#settings-expansion-submit', 250);
  check(`${T} : un texte vide est refusé`, (await text('#settings-expansion-status')) === L.textEmpty && (await focusedId()) === 'settings-expansion-text', { msg: await text('#settings-expansion-status'), focus: await focusedId() });
  await page.fill('#settings-expansion-abbr', '');
  await page.fill('#settings-expansion-text', 'x');
  await click('#settings-expansion-submit', 250);
  check(`${T} : une abréviation vide est refusée`, (await text('#settings-expansion-status')) === L.empty, await text('#settings-expansion-status'));
  await page.fill('#settings-expansion-abbr', '');
  await page.fill('#settings-expansion-text', '');

  // Modification : « Modifier » charge la ligne dans le formulaire, « Enregistrer » la met à jour, « Annuler » abandonne.
  await click(`#settings-expansion-list [aria-label="${fr ? 'Modifier l’abréviation §merci' : 'Edit abbreviation §merci'}"]`, 200);
  check(`${T} : « ${L.edit} » charge la ligne dans le formulaire, le bouton devient « ${L.save} » et « Annuler » apparaît`, (await page.inputValue('#settings-expansion-abbr')) === 'merci' && (await page.inputValue('#settings-expansion-text')) === 'Merci beaucoup\net bonne journée' && (await text('#settings-expansion-submit')) === L.save && (await visible('#settings-expansion-cancel')), { abbr: await page.inputValue('#settings-expansion-abbr'), submit: await text('#settings-expansion-submit') });
  await click('#settings-expansion-cancel', 200);
  check(`${T} : « Annuler » vide le formulaire et rend le bouton « ${L.add} »`, (await page.inputValue('#settings-expansion-abbr')) === '' && (await text('#settings-expansion-submit')) === L.add && !(await visible('#settings-expansion-cancel')), await text('#settings-expansion-submit'));
  await click(`#settings-expansion-list [aria-label="${fr ? 'Modifier l’abréviation §merci' : 'Edit abbreviation §merci'}"]`, 200);
  await page.fill('#settings-expansion-text', 'Merci !');
  await click('#settings-expansion-submit', 300);
  table = await tableRows();
  check(`${T} : « ${L.save} » met la ligne à jour dans le document (même ligne, pas un doublon)`, table.length === 5 && table[4].text === 'Merci !' && table[4].abbr === 'merci', table);

  // Suppression : une confirmation, au premier plan de Réglages.
  await click(`#settings-expansion-list [aria-label="${fr ? 'Supprimer l’abréviation §merci' : 'Delete abbreviation §merci'}"]`, 300);
  const dialog = await page.evaluate(() => { const m = document.getElementById('pp-dialog-modal'); return { open: !!m && m.style.display !== 'none', title: (document.getElementById('pp-dialog-title') || {}).textContent }; });
  check(`${T} : « ${L.del} » demande confirmation, dans la langue de l'interface`, dialog.open && dialog.title === L.confirm, dialog);
  const ok = await hit('#pp-dialog-modal .var-modal-primary');
  check(`${T} : la confirmation est dans le panneau, au premier plan`, ok.found && ok.inPanel && ok.onTop, ok);
  await click('#pp-dialog-modal .var-modal-primary', 350);
  table = await tableRows();
  check(`${T} : une fois confirmée, la ligne disparaît de la liste et du document`, table.length === 4 && !(await rows()).some(r => r.startsWith('§merci')), { table, rows: await rows() });
}

// Le caractère déclencheur, réglé dans Réglages puis tapé dans l'éditeur.
async function triggerCharPart(T, fr) {
  await openShortcutsTab();
  await click('#settings-expansion-char');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('a');
  const bad = await text('#settings-expansion-char-status');
  check(`${T} : une lettre est refusée comme caractère déclencheur, le message le dit`, !!bad && (await visible('#settings-expansion-char-status')) && (await page.evaluate(() => TextExpansion.storedChar())) === '§', { bad, stored: await page.evaluate(() => TextExpansion.storedChar()) });
  await snap(`${T}-5-erreur-caractere`);
  const charRight = await edge('#settings-expansion-char', 'right');
  const charStatusRight = await edge('#settings-expansion-char-status', 'right');
  const charTop = await edge('#settings-expansion-char', 'bottom');
  const charStatusTop = await edge('#settings-expansion-char-status', 'top');
  check(`${T} : le message du caractère s'aligne sur le bord droit de son champ, juste dessous`, Math.abs(charStatusRight - charRight) <= 1 && charStatusTop >= charTop && charStatusTop - charTop < 16, { charRight, charStatusRight, charTop, charStatusTop });
  await page.keyboard.press('Control+a');
  await page.keyboard.type('#');
  check(`${T} : « # » est refusé : il ouvre déjà le panneau des variables`, (await text('#settings-expansion-char-status')) === (fr ? 'Ce caractère ouvre déjà le panneau des variables (onglet Déclencheur) : choisissez-en un autre.' : 'This character already opens the variables panel (Trigger tab): pick another one.') && (await page.evaluate(() => TextExpansion.storedChar())) === '§', await text('#settings-expansion-char-status'));
  await page.keyboard.press('Tab');
  check(`${T} : en quittant le champ, le caractère refusé est remplacé par celui qui est en vigueur`, (await page.inputValue('#settings-expansion-char')) === '§' && !(await visible('#settings-expansion-char-status')), { value: await page.inputValue('#settings-expansion-char') });
  await click('#settings-expansion-char');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('$');
  check(`${T} : « $ » est retenu tout de suite, l'explication et la liste le montrent`, (await page.evaluate(() => TextExpansion.storedChar())) === '$' && (await text('#settings-expansion-intro')).includes('$ub') && (await rows()).every(r => r.startsWith('$')), { intro: await text('#settings-expansion-intro'), rows: await rows() });
  await closeSettings();
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('$ub ');
  await page.waitForTimeout(120);
  check(`${T} : avec « $ », « $ub » + espace s'étend sans recharger la page`, (await plain()) === 'université de Bordeaux ', await plain());
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('§ub ');
  await page.waitForTimeout(120);
  check(`${T} : l'ancien caractère « § » n'étend plus rien`, (await plain()) === '§ub ', await plain());
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('$');
  await page.waitForTimeout(150);
  const state = await boxState();
  check(`${T} : avec « $ », la liste s'ouvre sur « $ » et montre « $ub »`, state.open && state.items.some(i => i.abbr === '$ub'), state);
  await page.keyboard.press('Escape');
  // Retour à « § » pour la suite.
  await openShortcutsTab();
  await click('#settings-expansion-char');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('§');
  await closeSettings();
  check(`${T} : le caractère est rétabli à « § »`, (await page.evaluate(() => TextExpansion.storedChar())) === '§');
}


// Beaucoup de lignes : la liste défile dans le contenu de l'onglet, le titre, les onglets et « Fermer » restent en place.
async function manyRowsPart(T) {
  await page.evaluate(async () => { for (let i = 1; i <= 12; i++) await TextExpansion.add('r' + String(i).padStart(2, '0'), 'ligne numéro ' + i); });
  await openShortcutsTab();
  const geometry = () => page.evaluate(() => {
    const body = document.querySelector('#settings-modal .settings-body');
    const last = document.querySelector('#settings-expansion-list .settings-expansion-row:last-child');
    const close = document.getElementById('settings-close').getBoundingClientRect();
    const tabs = document.getElementById('settings-tabs').getBoundingClientRect();
    const b = body.getBoundingClientRect(), l = last.getBoundingClientRect();
    return { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, scrollTop: Math.round(body.scrollTop), lastVisible: l.top >= b.top - 1 && l.bottom <= b.bottom + 1, closeTop: Math.round(close.top), tabsTop: Math.round(tabs.top), pageScroll: document.documentElement.scrollHeight > innerHeight };
  });
  const before = await geometry();
  check(`${T} : douze lignes dépassent le cadre : le contenu de l'onglet défile (${before.scrollHeight}px pour ${before.clientHeight}px)`, before.scrollHeight > before.clientHeight + 20 && !before.lastVisible, before);
  await page.mouse.move(WIDTH / 2, HEIGHT / 2);
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(300);
  const after = await geometry();
  check(`${T} : la molette révèle la dernière ligne, « Fermer » et les onglets ne bougent pas, la page ne défile pas`, after.scrollTop > 0 && after.lastVisible && after.closeTop === before.closeTop && after.tabsTop === before.tabsTop && !after.pageScroll, { before, after });
  await snap(`${T}-3-reglages-defilement`);
  await closeSettings();
  await page.evaluate(async () => { for (const e of TextExpansion.list().filter(x => /^r\d\d$/.test(x.abbreviation))) await TextExpansion.remove(e.rowId); });
}

// Suivi des modifications, à la vraie frappe : une seule insertion, rien de « §ub » ne reste.
async function trackChangesPart(T) {
  await setDoc('<p>Début</p>');
  await click('#v2-btn-track-changes', 250);
  await focusEnd();
  await page.keyboard.type(' §ub ');
  await page.waitForTimeout(200);
  const tracked = await html();
  check(`${T} : suivi des modifications actif, « §ub » + espace laisse une seule insertion « université de Bordeaux »`, /<ins[^>]*> université de Bordeaux <\/ins>/.test(tracked) && (tracked.match(/<ins\b/g) || []).length === 1 && !/<del|§/.test(tracked), tracked);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(150);
  check(`${T} : suivi actif, Retour arrière rend « §ub » dans la même insertion`, /<ins[^>]*> §ub <\/ins>/.test(await html()), await html());
  await click('#v2-btn-track-changes', 250);
  await setDoc('<p></p>');
}

async function run(theme) {
  const T = theme;

  // === L'expansion à la frappe ===============================================================================================================================
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('§ub ');
  await page.waitForTimeout(150);
  check(`${T} : « §ub » + espace devient « université de Bordeaux » suivi de l'espace tapé`, (await plain()) === 'université de Bordeaux ', await plain());
  await page.keyboard.type('x');
  check(`${T} : la frappe continue après l'expansion, le curseur est après l'espace`, (await plain()) === 'université de Bordeaux x', await plain());

  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('Voir §ub.');
  await page.waitForTimeout(100);
  check(`${T} : une ponctuation après l'abréviation l'étend aussi (« §ub. »)`, (await plain()) === 'Voir université de Bordeaux.', await plain());

  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('§ub ');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);
  check(`${T} : Retour arrière juste après l'expansion rend la saisie d'origine « §ub »`, (await plain()) === '§ub ', await plain());
  await page.keyboard.type('z');
  check(`${T} : après l'annulation, la frappe suivante n'étend plus rien`, (await plain()) === '§ub z', await plain());

  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('§UB ');
  await page.waitForTimeout(100);
  check(`${T} : la casse de l'abréviation ne compte pas (« §UB »)`, (await plain()) === 'université de Bordeaux ', await plain());

  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('§zz ');
  await page.waitForTimeout(100);
  check(`${T} : une abréviation inconnue reste telle que tapée`, (await plain()) === '§zz ', await plain());

  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('a§ub ');
  await page.waitForTimeout(100);
  check(`${T} : un déclencheur collé à une lettre (« a§ub ») n'étend rien`, (await plain()) === 'a§ub ', await plain());

  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('Voir §ub ');
  await page.waitForTimeout(100);
  check(`${T} : une abréviation au milieu d'une phrase est étendue`, (await plain()) === 'Voir université de Bordeaux ', await plain());

  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('§sig ');
  await page.waitForTimeout(100);
  const sigHtml = await html();
  check(`${T} : un texte sur deux lignes devient un saut de ligne, pas du texte brut`, /Cordialement,<br[^>]*>Antoine/.test(sigHtml) && (await plain()) === 'Cordialement,⏎Antoine ', sigHtml);

  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.press('Control+b');
  await page.keyboard.type('§ub ');
  await page.waitForTimeout(100);
  const boldHtml = await html();
  check(`${T} : le texte étendu reprend la mise en forme de ce qui a été tapé (gras)`, /<strong>université de Bordeaux/.test(boldHtml), boldHtml);

  // === La liste « § » ========================================================================================================================================
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('§');
  await page.waitForTimeout(200);
  let state = await boxState();
  check(`${T} : « § » seul ouvre la liste des quatre abréviations, classées`, state.open && state.items.map(i => i.abbr).join(',') === '§adr,§bj,§sig,§ub', state);
  check(`${T} : la liste est dans le panneau de ${WIDTH}x${HEIGHT} et au premier plan`, state.open && state.inPanel && state.onTop, state);
  check(`${T} : la première ligne est choisie`, state.open && state.items[0].selected && state.items.filter(i => i.selected).length === 1, state);
  await snap(`${T}-1-liste`);

  await page.keyboard.type('u');
  await page.waitForTimeout(150);
  state = await boxState();
  check(`${T} : « §u » ne garde que « §ub » (le filtre suit la frappe)`, state.open && state.items.length === 1 && state.items[0].abbr === '§ub', state);

  await page.keyboard.press('Backspace');
  await page.keyboard.type('bord');
  await page.waitForTimeout(150);
  state = await boxState();
  check(`${T} : « §bord » retrouve aussi les abréviations par le mot de leur texte`, state.open && state.items.map(i => i.abbr).join(',') === '§adr,§ub', state);

  await page.keyboard.press('ArrowDown');
  state = await boxState();
  check(`${T} : la flèche bas descend la sélection`, state.open && state.items[1].selected && !state.items[0].selected, state);
  await page.keyboard.press('ArrowUp');
  state = await boxState();
  check(`${T} : la flèche haut la remonte`, state.open && state.items[0].selected, state);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  check(`${T} : Entrée écrit la ligne choisie, sans retour à la ligne ni espace ajoutée`, (await plain()) === 'université de Bordeaux', await plain());
  state = await boxState();
  check(`${T} : la liste se referme après le choix`, !state.open, state);
  await page.keyboard.type('!');
  check(`${T} : le curseur est juste après le texte écrit`, (await plain()) === 'université de Bordeaux!', await plain());

  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('§sig');
  await page.waitForTimeout(150);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  check(`${T} : Tab écrit la ligne choisie`, (await plain()) === 'Cordialement,⏎Antoine', await plain());

  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('§u');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  state = await boxState();
  check(`${T} : Échap referme la liste et laisse la saisie « §u » en place`, !state.open && (await plain()) === '§u', { state, text: await plain() });
  await page.keyboard.type('b ');
  await page.waitForTimeout(100);
  check(`${T} : après Échap, « §ub » + espace s'étend quand même`, (await plain()) === 'université de Bordeaux ', await plain());

  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('§zzz');
  await page.waitForTimeout(150);
  state = await boxState();
  check(`${T} : une saisie qui ne correspond à rien n'ouvre aucune liste`, !state.open, state);

  // La souris : un clic sur une ligne l'écrit, l'éditeur garde le focus.
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('§');
  await page.waitForTimeout(200);
  const row = await page.evaluate(() => { const r = document.querySelectorAll('#expansion-box .ex-item')[3].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(row.x, row.y, { steps: 3 });
  state = await boxState();
  check(`${T} : le survol d'une ligne la choisit`, state.open && state.items[3].selected, state);
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(150);
  check(`${T} : un clic sur « §ub » écrit son texte`, (await plain()) === 'université de Bordeaux', await plain());
  const focusOk = await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.tiptap'));
  check(`${T} : l'éditeur garde le focus après le clic`, focusOk);

  // === Là où l'expansion ne doit rien faire ====================================================================================================================
  await setDoc('<pre><code>x</code></pre>');
  const codePoint = await pointOf('x');
  await page.mouse.click(codePoint.x + 20, codePoint.y);
  await page.keyboard.press('End');
  await page.keyboard.type(' §ub ');
  await page.waitForTimeout(150);
  state = await boxState();
  check(`${T} : dans un bloc de code, « §ub » reste du texte et aucune liste ne s'ouvre`, !state.open && (await plain()) === 'x §ub ', { state, text: await plain() });

  // Dans une liste à puces, Tab écrit la ligne choisie au lieu de descendre l'élément d'un cran.
  await setDoc('<ul><li><p>un</p></li><li><p>deux</p></li></ul>');
  await focusEnd();
  await page.keyboard.type(' §ub');
  await page.waitForTimeout(150);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  const listHtml = await html();
  check(`${T} : dans une liste à puces, Tab écrit l'abréviation sans descendre l'élément d'un cran`, (await plain()) === 'undeux université de Bordeaux' && !/<ul>.*<ul>/.test(listHtml.replace(/\n/g, '')), listHtml);

  await trackChangesPart(T);
  await settingsPart(T, true);
  await closeSettings();
  await triggerCharPart(T, true);
  await manyRowsPart(T);
}

async function runEnglish() {
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('§ub ');
  await page.waitForTimeout(150);
  check('anglais : l\'expansion marche comme en français', (await plain()) === 'université de Bordeaux ', await plain());
  await settingsPart('anglais', false);
  await closeSettings();
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(250);
}

await run('clair');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(250);
await run('sombre');
await runEnglish();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
