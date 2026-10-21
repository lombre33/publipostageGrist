#!/usr/bin/env node
// Tab et Maj+Tab dans le texte (js/tab-indent.js, css/tab-indent.css, js/editor.js) : le panneau de 700x400 d'Antoine, au VRAI clavier (page.keyboard) et à la vraie souris. Ce que
// scenarios-tab-indent.js ne peut pas voir depuis la page : un KeyboardEvent envoyé par dispatchEvent ne déplace jamais le focus du navigateur, ne fait jamais défiler la page et ne
// passe pas par la saisie native.
//  - Tab écrit une tabulation à la place du curseur, le focus reste dans l'éditeur, le texte tapé à la suite se pose au cran (12,7 mm, mesuré sur les vrais rectangles) ;
//  - Maj+Tab la retire, et sans rien à retirer garde le focus dans l'éditeur (il ne saute pas à la barre d'outils) ;
//  - les flèches passent par-dessus la tabulation et Retour arrière l'efface, comme un caractère ;
//  - Échap puis Tab quitte l'éditeur sans rien écrire (le focus passe à l'élément suivant) ; toute autre touche, ou un clic, désarme cette sortie ;
//  - Annuler (Ctrl+Z) retire la tabulation en un pas ;
//  - ce que Tab faisait déjà reste : le niveau d'une puce, la case suivante d'un tableau ;
//  - un texte choisi (Maj+flèche) : Tab ajoute une tabulation en tête de chaque bloc et Maj+Tab les retire, le texte choisi reste choisi ;
//  - les champs d'une ligne (l'objet d'un email) gardent Tab pour passer au champ suivant, sans rien écrire.
// Lancé par run-headless.mjs (groupe Node "tabIndentKeys", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-tab-indent-keyboard.mjs
// TAB_INDENT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TAB_INDENT_KEYS_PORT || 8993);
const SHOTS = process.env.TAB_INDENT_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-dialogs-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-tab-indent-keyboard] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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


const html = () => page.evaluate(() => Editor.getHTML());
const focusIn = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.closest('.tiptap') ? 'editor' : 'ailleurs : ' + (a.id || a.className || a.tagName)) : 'rien'; });
const selectedText = () => page.evaluate(() => window.getSelection().toString());
// Centre d'un élément (amené dans la vue) et s'il est bien au-dessus de ce qui l'entoure : le vrai clic tombe dessus.
const centerOf = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { x, y, onTop: !!top && (top === el || el.contains(top)) };
}, selector);
async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
// Pointe un texte de l'éditeur (le début par défaut) pour y cliquer pour de vrai.
const pointOf = (text, at = 0) => page.evaluate(({ text, at }) => {
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
async function setDoc(doc) {
  await page.evaluate(d => { Editor.setHTML(d); }, doc);
  await page.waitForTimeout(200);
}
async function clickAt(text, at) {
  const p = await pointOf(text, at);
  if (!p) throw new Error('texte introuvable : ' + text);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(120);
}
const key = async (name, wait = 120) => { await page.keyboard.press(name); await page.waitForTimeout(wait); };
const TAB_SPAN = /<span class="pp-tab" style="white-space: pre-wrap;?">\t<\/span>/;
const tabs = markup => (markup.match(/class="pp-tab"/g) || []).length;
// L'écart, en px de la feuille, entre le bord gauche du contenu d'un paragraphe et la première lettre du premier texte `word`. Dans un panneau de 700 px la feuille est réduite
// par `zoom` (--pp-fit-zoom, css/editor-v2.css) : les rectangles du navigateur sont à l'écran, donc on les ramène à la feuille avant de comparer au cran de 48 px.
const stopOf = word => page.evaluate(word => {
  const walker = document.createTreeWalker(document.querySelector('.tiptap'), NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const i = n.textContent.indexOf(word);
    if (i < 0) continue;
    const p = n.parentElement.closest('p');
    const cs = getComputedStyle(p);
    const zoom = p.getBoundingClientRect().width / parseFloat(cs.width);
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
    const content = p.getBoundingClientRect().left + (parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth)) * zoom;
    return { stop: Math.round((r.getBoundingClientRect().left - content) / zoom * 100) / 100, zoom: Math.round(zoom * 1000) / 1000 };
  }
  return null;
}, word);

// 1) Tab au vrai clavier : une tabulation au curseur, le focus reste, la frappe qui suit se pose au cran.
await setDoc('<p>Nom :</p><p>Bonjour le monde</p>');
await clickAt('Nom :', 1);
await page.keyboard.press('End');
await key('Tab');
const w1 = await html();
check('clavier : Tab au bout de « Nom : » écrit une tabulation (un seul <span class="pp-tab">) et le focus reste dans l\'éditeur', tabs(w1) === 1 && /^<p>Nom :<span class="pp-tab"/.test(w1) && (await focusIn()) === 'editor', { w1, focus: await focusIn() });
await page.keyboard.type('Dupont');
const w2 = await html();
const { stop, zoom } = (await stopOf('Dupont')) || { stop: null, zoom: null };
check('clavier : « Dupont » tapé après la tabulation se pose au cran de 12,7 mm (48 px de la feuille, mesuré sur le vrai rectangle du texte) et sort de la tabulation', TAB_SPAN.test(w2) && /<\/span>Dupont<\/p>/.test(w2) && stop !== null && Math.abs(stop - 48) <= 0.6, { w2, stop, zoom });
await snap('1-tab-ecrit');

// 2) Les flèches passent la tabulation, Retour arrière l'efface, Annuler la remet puis la retire.
await key('Home');
await key('ArrowRight', 60); await key('ArrowRight', 60); await key('ArrowRight', 60); await key('ArrowRight', 60); await key('ArrowRight', 60); await key('ArrowRight', 60);
await page.keyboard.type('+');
const arrows = await html();
check('clavier : les flèches passent par-dessus la tabulation en un pas (« Nom : » puis la tabulation : le « + » tombe juste derrière elle)', /^<p>Nom :<span class="pp-tab"[^>]*>\t<\/span>\+Dupont<\/p>/.test(arrows), arrows);
await key('ArrowLeft');
await key('Backspace');
const back = await html();
check('clavier : Retour arrière derrière la tabulation l\'efface en un seul appui', tabs(back) === 0 && /^<p>Nom :\+Dupont<\/p>/.test(back), back);
await page.keyboard.press('Control+z');
await page.waitForTimeout(150);
const undone = await html();
check('clavier : Ctrl+Z remet la tabulation effacée', tabs(undone) === 1 && /^<p>Nom :<span class="pp-tab"/.test(undone), undone);

// 3) Maj+Tab : retire la tabulation d'avant le curseur ; sans rien à retirer, le focus reste dans l'éditeur.
await setDoc('<p>Bonjour le monde</p>');
await clickAt('monde', 0);
await key('Tab');
check('clavier : Tab au milieu d\'une ligne écrit la tabulation avant « monde »', /le <span class="pp-tab"[^>]*>\t<\/span>monde/.test(await html()), await html());
await key('Shift+Tab');
const s1 = await html();
check('clavier : Maj+Tab retire la tabulation qui précède le curseur et le focus reste dans l\'éditeur', s1 === '<p>Bonjour le monde</p>' && (await focusIn()) === 'editor', { s1, focus: await focusIn() });
await key('Shift+Tab');
check('clavier : Maj+Tab sans rien à retirer ne change rien et le focus reste dans l\'éditeur (il ne saute pas à la barre d\'outils)', (await html()) === '<p>Bonjour le monde</p>' && (await focusIn()) === 'editor', { html: await html(), focus: await focusIn() });

// 4) Échap puis Tab : la sortie du clavier.
await clickAt('Bonjour', 0.5);
await key('Escape');
await key('Tab', 200);
const out1 = await focusIn();
check('clavier : Échap puis Tab sort de l\'éditeur (le focus passe à l\'élément suivant) sans rien écrire', out1 !== 'editor' && (await html()) === '<p>Bonjour le monde</p>', { out1, html: await html() });
await clickAt('Bonjour', 0.5);
await key('Tab');
check('clavier : un clic dans le texte désarme la sortie : le Tab suivant écrit une tabulation', tabs(await html()) === 1 && (await focusIn()) === 'editor', { html: await html(), focus: await focusIn() });
await key('Shift+Tab');
await key('Escape');
await page.keyboard.type('x');
await key('Tab');
const disarmed = await html();
check('clavier : Échap puis une autre touche (« x ») désarme la sortie : le Tab suivant écrit une tabulation, le focus reste', tabs(disarmed) === 1 && /x/.test(disarmed) && (await focusIn()) === 'editor', { disarmed, focus: await focusIn() });
await setDoc('<p>Bonjour le monde</p>');
await clickAt('Bonjour', 0.5);
await key('Escape');
await key('Shift+Tab', 200);
check('clavier : Échap puis Maj+Tab sort aussi de l\'éditeur, vers l\'élément précédent', (await focusIn()) !== 'editor', await focusIn());

// 5) Ce que Tab faisait déjà.
await setDoc('<ul><li><p>A</p></li><li><p>B</p></li></ul>');
await clickAt('B', 1);
await key('Tab');
const listHtml = await html();
check('clavier : dans une puce, Tab change le niveau (sous-liste) et n\'écrit aucune tabulation, le focus reste', /<li><p>A<\/p><ul><li><p>B<\/p><\/li><\/ul><\/li>/.test(listHtml) && tabs(listHtml) === 0 && (await focusIn()) === 'editor', { listHtml, focus: await focusIn() });
await key('Shift+Tab');
check('clavier : Maj+Tab dans une puce remonte l\'item', /<li><p>A<\/p><\/li><li><p>B<\/p><\/li>/.test(await html()) && tabs(await html()) === 0, await html());
await setDoc('<table><tbody><tr><td><p>c1</p></td><td><p>c2</p></td></tr></tbody></table>');
await clickAt('c1', 1);
await key('Tab');
await page.keyboard.type('Z');
const cell = await html();
check('clavier : dans une case de tableau, Tab passe à la case suivante (le « Z » tapé remplace son texte « c2 ») sans écrire de tabulation', /<td[^>]*><p>c1<\/p><\/td><td[^>]*><p>Z<\/p><\/td>/.test(cell) && tabs(cell) === 0, cell);

// 6) Un texte choisi : une tabulation en tête de chaque bloc, le texte choisi reste choisi.
await setDoc('<p>Un</p><p>Deux</p><p>Trois</p>');
await clickAt('Un', 0.5);
await key('Home');
await page.keyboard.press('Shift+ArrowDown');
await page.keyboard.press('Shift+End');
await page.waitForTimeout(120);
const before = await selectedText();
await key('Tab');
const sel1 = await html();
const kept = await selectedText();
check('clavier : sur du texte choisi sur deux blocs, Tab ajoute une tabulation en tête de chacun (jamais à la place du texte choisi) et le texte reste choisi', tabs(sel1) === 2 && /^<p><span class="pp-tab"[^>]*>\t<\/span>Un<\/p><p><span class="pp-tab"[^>]*>\t<\/span>Deux<\/p><p>Trois<\/p>$/.test(sel1) && kept.replace(/\t/g, '').replace(/\s+/g, ' ').trim() === before.replace(/\s+/g, ' ').trim(), { before, kept, sel1 });
await key('Shift+Tab');
check('clavier : Maj+Tab sur ce texte choisi retire ces deux tabulations', (await html()) === '<p>Un</p><p>Deux</p><p>Trois</p>', await html());

check('la zone d\'écriture annonce la sortie au clavier (aria-description : Échap puis Tab)', /Échap.*Tab/.test(await page.evaluate(() => document.querySelector('#editor-container .ProseMirror').getAttribute('aria-description') || '')), await page.evaluate(() => document.querySelector('#editor-container .ProseMirror').getAttribute('aria-description')));

// 7) Un champ d'une ligne garde Tab : l'objet d'un nouvel email, à la vraie souris puis au vrai clavier.
const real = async (selector, wait = 300) => {
  const c = await centerOf(selector);
  if (!c) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(wait);
  return c;
};
const hover = async selector => {
  const c = await centerOf(selector);
  if (!c) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 30, c.y + 5, { steps: 3 });
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.waitForTimeout(450);
};
const subjectNow = () => page.evaluate(() => {
  const host = document.getElementById('v2-email-subject');
  const view = host.querySelector('[role="textbox"]');
  const a = document.activeElement;
  return { hidden: host.hidden, text: view ? view.textContent : null, focused: !!a && host.contains(a), active: a ? (a.id || a.className || a.tagName) : null };
});
await hover('#v2-new-template-group #btn-new');
await real('#v2-btn-new-email', 700);
// Le modèle en cours n'est pas enregistré : la fenêtre « Modifications non enregistrées » (js/dialogs.js) demande d'abord d'abandonner ou d'annuler.
const abandon = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('#pp-dialog-modal button')).find(e => /Ne pas enregistrer/.test(e.textContent));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
if (abandon) { await page.mouse.move(abandon.x - 10, abandon.y, { steps: 2 }); await page.mouse.click(abandon.x, abandon.y); await page.waitForTimeout(900); }
await real('#v2-email-subject', 150);
const inField = await subjectNow();
check('clavier : un vrai clic dans l\'objet d\'un nouvel email y met le curseur', !inField.hidden && inField.focused, inField);
await page.keyboard.type('Objet');
await snap('2-email-objet');
await key('Tab', 200);
const field = await subjectNow();
check('clavier : dans l\'objet d\'un email, Tab n\'écrit aucune tabulation et passe au champ suivant (le focus quitte le champ)', field.text === 'Objet' && !field.focused, field);
await real('#v2-email-subject', 150);
await key('Shift+Tab', 200);
const back2 = await subjectNow();
check('clavier : Maj+Tab dans l\'objet ne retire rien non plus (le texte reste « Objet ») et le focus quitte le champ', back2.text === 'Objet' && !back2.focused, back2);

check('aucune boîte native (prompt, confirm, alert) ne s\'est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
