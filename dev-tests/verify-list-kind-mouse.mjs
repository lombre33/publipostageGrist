#!/usr/bin/env node
// Une puce, un numéro ou une case à CHAQUE LIGNE (js/list-kind.js ; demande d'Antoine du 23/11 : « dans une liste à puces, j'indente, je voudrais basculer l'indentation en cours en liste numérotée ou en cases à cocher, choisir
// ma puce à chaque ligne et les croiser entre elles ») : le panneau de 700x400 d'Antoine, à la VRAIE souris et au VRAI clavier, en clair puis en sombre. Ce que scenarios-list-kind.js ne peut pas voir depuis la page :
//  - le menu des listes (révélé au survol du bouton « Liste ») cliqué pour de vrai : « 1. 2. 3. » sur une sous-ligne ne change que cette ligne ; la barre dit le genre de la LIGNE (pas celui de sa ligne mère) ;
//  - Entrée, Tab et Maj+Tab sur une ligne qui a changé de genre : elle garde son genre en changeant de niveau, un seul Ctrl+Z défait chaque geste ;
//  - une case entre deux puces, la première ligne d'une liste glissée sous la liste d'avant (une puce sous une case garde sa puce : le CSS des cases ne la touche plus) ;
//  - trois lignes sélectionnées au clavier changées d'un coup ; la Lecture qui montre les mêmes genres.
// Lancé par run-headless.mjs (groupe Node "listKindMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-list-kind-mouse.mjs
// LIST_KIND_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.LIST_KIND_PORT || 9702);
const SHOTS = process.env.LIST_KIND_SHOTS || '';
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/vfs_fonts\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@[\d.]+\/dist\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-list-kind-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const focusIn = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.closest('.tiptap') ? 'editor' : 'ailleurs : ' + (a.id || a.className || a.tagName)) : 'rien'; });
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
async function setDoc(doc) {
  await page.evaluate(d => { Editor.setHTML(d); }, doc);
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(300);
}
async function clickAt(text, at = 1) {
  const p = await pointOf(text, at);
  if (!p) throw new Error('texte introuvable : ' + text);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(120);
}
const key = async (name, wait = 150) => { await page.keyboard.press(name); await page.waitForTimeout(wait); };
// L'historique regroupe ce qui se fait à moins de 500 ms d'intervalle : un Ctrl+Z défait un geste entier quand il est lancé après une pause.
const undo = async () => { await page.waitForTimeout(650); await key('Control+z', 200); };
const centerOf = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { x, y, onTop: !!top && (top === el || el.contains(top)), disabled: !!el.disabled || el.hasAttribute('data-pp-lock-soft'), active: el.classList.contains('is-active') };
}, selector);
const real = async (selector, wait = 200) => {
  const c = await centerOf(selector);
  if (!c) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(wait);
  return c;
};
// Un style du menu des listes (révélé au survol du bouton « Liste ») cliqué à la vraie souris.
async function pickList(selector) {
  const main = await centerOf('#v2-btn-bullet');
  await page.mouse.move(main.x, main.y, { steps: 3 });
  await page.waitForTimeout(350);
  return real(selector, 250);
}
// L'arbre des listes tel que l'éditeur le montre : b(...) puces, n(...) numéros, t(...) cases (✓ cochée) ; « b(A n(B),C) » = une liste à puces de deux points, A portant une sous-liste numérotée.
const shape = () => page.evaluate(() => {
  const kind = el => (el.matches('ul[data-type="taskList"]') ? 't' : el.tagName === 'OL' ? 'n' : 'b');
  const item = (li) => {
    const body = li.hasAttribute('data-checked') ? li.querySelector(':scope > div') : li;
    const text = Array.from(body.children).filter(c => c.tagName === 'P').map(p => p.textContent).join('/');
    const subs = Array.from(body.children).filter(c => /^(UL|OL)$/.test(c.tagName)).map(list);
    return (li.getAttribute('data-checked') === 'true' ? '✓' : '') + text + (subs.length ? ' ' + subs.join(' ') : '');
  };
  const list = el => kind(el) + '(' + Array.from(el.children).filter(li => li.tagName === 'LI').map(item).join(',') + ')';
  return Array.from(document.querySelector('.tiptap').children).filter(c => /^(UL|OL)$/.test(c.tagName)).map(list).join(' ');
});
// Ce que l'éditeur dessine pour le point qui porte `text` : son affichage (un point de puce reste « list-item »), le style de sa puce, la gauche de son texte et la taille de sa puce (0 : aucune).
const lookOf = text => page.evaluate((needle) => {
  const li = Array.from(document.querySelectorAll('.tiptap li')).find(item => Array.from(item.querySelectorAll(':scope > p, :scope > div > p')).some(p => p.textContent === needle));
  if (!li) return null;
  const p = li.querySelector(':scope > p, :scope > div > p');
  const range = document.createRange();
  range.selectNodeContents(p);
  const box = li.querySelector(':scope > label input');
  return {
    display: getComputedStyle(li).display, type: getComputedStyle(li).listStyleType, left: Math.round(range.getBoundingClientRect().left * 10) / 10,
    marker: parseFloat(getComputedStyle(li, '::marker').fontSize) > 0, content: getComputedStyle(li, '::marker').content, box: box ? Math.round(box.getBoundingClientRect().width) : 0,
  };
}, text);
const pressed = () => page.evaluate(() => Array.from(document.querySelectorAll('#v2-list-flyout button.is-active, #v2-btn-bullet.is-active')).map(b => b.id));

const li = (text, inner = '') => `<li><p>${text}</p>${inner}</li>`;
const ul = items => `<ul>${items}</ul>`;
const ol = items => `<ol>${items}</ol>`;
const box = (checked, inner) => `<li data-checked="${checked}" data-type="taskItem"><label><input type="checkbox"${checked ? ' checked="checked"' : ''}><span></span></label><div>${inner}</div></li>`;
const tasks = items => `<ul data-type="taskList">${items}</ul>`;
const FLAT = ul(li('Pommes') + li('Poires') + li('Cerises') + li('Dattes'));

async function run(label) {
  const tag = label + ' : ';

  // 1) Le geste d'Antoine : j'indente une ligne d'une liste à puces, puis je la passe en numéros.
  await setDoc(FLAT);
  await snap(label + '-1-avant');
  await clickAt('Poires');
  await key('Tab');
  check(tag + 'Tab sur « Poires » la glisse sous « Pommes » (sous-liste à puces)', (await shape()) === 'b(Pommes b(Poires),Cerises,Dattes)', await shape());
  await pickList('#v2-btn-ordered-numeric');
  await snap(label + '-2-poires-numerotee');
  check(tag + '« 1. 2. 3. » sur « Poires » : seule « Poires » devient numérotée, sous « Pommes », les autres lignes gardent leur puce', (await shape()) === 'b(Pommes n(Poires),Cerises,Dattes)', await shape());
  const pears = await lookOf('Poires');
  check(tag + 'la ligne « Poires » est une ligne numérotée (décimal), à droite de « Pommes », avec son NUMÉRO visible (le « • » de sa ligne mère ne le remplace pas)', !!pears && pears.type === 'decimal' && pears.display === 'list-item' && pears.marker && pears.content === 'normal' && pears.left > (await lookOf('Pommes')).left + 10, pears);
  check(tag + 'la barre dit le genre de la LIGNE : « 1. 2. 3. » enfoncé, la puce disque de la ligne mère « Pommes » ne l\'est pas', (await pressed()).includes('v2-btn-ordered-numeric') && !(await pressed()).includes('v2-btn-bullet-disc') && (await focusIn()) === 'editor', await pressed());

  // 2) La suite de la frappe reste dans le genre de la ligne : Entrée ajoute un numéro, Maj+Tab le remonte en gardant son genre.
  await key('End');
  await key('Enter');
  await page.keyboard.type('Prunes');
  await page.waitForTimeout(120);
  check(tag + 'Entrée puis « Prunes » : une deuxième ligne numérotée sous « Pommes »', (await shape()) === 'b(Pommes n(Poires,Prunes),Cerises,Dattes)', await shape());
  await page.waitForTimeout(650);
  await key('Shift+Tab');
  check(tag + 'Maj+Tab sur « Prunes » la remonte au niveau de « Pommes », toujours numérotée, entre « Pommes » et « Cerises »', (await shape()) === 'b(Pommes n(Poires)) n(Prunes) b(Cerises,Dattes)', await shape());
  await snap(label + '-3-prunes-remontee');
  await undo();
  check(tag + 'Ctrl+Z défait la remontée en un seul pas', (await shape()) === 'b(Pommes n(Poires,Prunes),Cerises,Dattes)', await shape());
  await undo();
  await undo();
  check(tag + 'Ctrl+Z jusqu\'au bout redonne la liste à puces d\'origine, rien de plus', (await shape()) === 'b(Pommes,Poires,Cerises,Dattes)' || (await shape()) === 'b(Pommes b(Poires),Cerises,Dattes)', await shape());

  // 3) Une ligne seule au même niveau : « Cerises » en cases entre deux puces ; Tab sur « Dattes » (première ligne de sa liste) la glisse sous « Cerises ».
  await setDoc(FLAT);
  await clickAt('Cerises');
  await pickList('#v2-btn-checklist-accent-strike');
  await snap(label + '-4-cerises-case');
  check(tag + 'cases à cocher sur « Cerises » : seule « Cerises » devient une case, au même niveau, entre ses voisines à puces', (await shape()) === 'b(Pommes,Poires) t(Cerises) b(Dattes)', await shape());
  const cherries = await lookOf('Cerises');
  check(tag + 'la case de « Cerises » est dessinée (une vraie case, pas un point de liste)', !!cherries && cherries.box >= 10, cherries);
  await clickAt('Dattes');
  await key('Tab');
  check(tag + 'Tab sur « Dattes » (première ligne de sa liste) la glisse sous « Cerises », en gardant sa puce', (await shape()) === 'b(Pommes,Poires) t(Cerises b(Dattes))', await shape());
  const dates = await lookOf('Dattes');
  const cherriesAfter = await lookOf('Cerises');
  await snap(label + '-5-dattes-sous-case');
  check(tag + 'la puce de « Dattes » sous la case de « Cerises » s\'affiche (point de liste, puce visible), plus à droite que le texte de « Cerises »', !!dates && dates.display === 'list-item' && dates.marker && dates.left > cherriesAfter.left + 5, { dates, cherriesAfter });
  await key('Shift+Tab');
  check(tag + 'Maj+Tab la ramène au premier niveau, toujours une puce', (await shape()) === 'b(Pommes,Poires) t(Cerises) b(Dattes)', await shape());

  // 4) Plusieurs lignes : on sélectionne trois lignes au clavier et « a. b. c. » les change d'un coup ; une ligne repassée en puce recolle ses voisines.
  await setDoc(FLAT);
  await clickAt('Pommes', 0);
  await key('Shift+ArrowDown', 60);
  await key('Shift+ArrowDown', 60);
  await pickList('#v2-btn-ordered-alpha');
  check(tag + '« a. b. c. » sur trois lignes sélectionnées : elles forment une liste à lettres, « Dattes » garde sa puce', (await shape()) === 'n(Pommes,Poires,Cerises) b(Dattes)', await shape());
  const letters = await lookOf('Poires');
  check(tag + 'les trois lignes montrent des lettres (a. b. c.)', !!letters && letters.type === 'lower-alpha', letters);
  await page.waitForTimeout(650);
  await clickAt('Poires');
  await real('#v2-btn-bullet', 250);
  check(tag + 'le bouton « Liste » sur « Poires » (déjà dans une liste, de lettres) la repasse en puce pour elle seule, au milieu des lettres', (await shape()) === 'n(Pommes) b(Poires) n(Cerises) b(Dattes)', await shape());
  await undo();
  check(tag + 'Ctrl+Z la rend aux lettres en un pas', (await shape()) === 'n(Pommes,Poires,Cerises) b(Dattes)', await shape());

  // 5) La Lecture : les mêmes genres et les mêmes retraits que l'éditeur.
  await setDoc(ul(li('Pommes', ol(li('Poires')) + tasks(box(false, '<p>Cerises</p>'))) + li('Dattes')) + ol(li('Figues')));
  const edit = await shape();
  const read = await page.evaluate(async (markup) => {
    const rc = document.getElementById('reader-container');
    const shown = rc.style.display;
    rc.style.display = 'block';
    await ReaderMode.render(markup, null, { id: 1 }, { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
    const rows = Array.from(rc.querySelectorAll('.reader-content li')).map((item) => {
      const p = item.querySelector(':scope > p, :scope > div > p');
      return p ? p.textContent + ':' + getComputedStyle(item).display + ':' + getComputedStyle(item).listStyleType : null;
    }).filter(Boolean);
    rc.style.display = shown;
    return rows;
  }, await html());
  check(tag + 'la Lecture : « Poires » est numérotée (list-item, decimal), « Pommes » et « Dattes » ont leur puce, « Cerises » est une case (flex), « Figues » est numérotée', read.join('|') === 'Pommes:list-item:disc|Poires:list-item:decimal|Cerises:flex:none|Dattes:list-item:disc|Figues:list-item:decimal', { edit, read });
}

await run('clair');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(400);
await run('sombre');

check('aucune boîte native (prompt, confirm, alert) ne s\'est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
