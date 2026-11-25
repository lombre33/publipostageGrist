#!/usr/bin/env node
// Tab et Maj+Tab sur une case à cocher (js/editor-core.js:shiftListItem, js/editor-nodes.js:createTabNavigationExtension, js/editor.js) : le panneau de 700x400 d'Antoine, au VRAI clavier (page.keyboard) et à la vraie
// souris, en clair puis en sombre. Ce que scenarios-task-nesting.js ne peut pas voir depuis la page : un KeyboardEvent envoyé par dispatchEvent ne déplace jamais le focus du navigateur et ne passe pas par la saisie native.
//  - Tab glisse la case sous celle qui la précède AVEC son texte : la case et le texte vont à droite ensemble (mesuré sur les vrais rectangles : la sous-case est sous le texte de la case), la case d'avant ne bouge pas,
//    aucune tabulation n'entre dans le texte, le focus reste dans l'éditeur ;
//  - Maj+Tab la ramène à l'aplomb des autres ; Tab sur le premier point ne change rien (et n'écrit rien) ; Ctrl+Z défait la case glissée en un pas ;
//  - les boutons « Augmenter le retrait » et « Diminuer le retrait » de la barre, à la vraie souris : grisé au premier point, vif ailleurs, un clic glisse ou ramène la case ;
//  - la sous-liste garde le style des cases (classique) de sa liste ; la Lecture montre les sous-cases au même retrait que l'éditeur.
// Lancé par run-headless.mjs (groupe Node "taskNestingKeys", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-task-nesting-keyboard.mjs
// TASK_NESTING_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TASK_NESTING_KEYS_PORT || 9701);
const SHOTS = process.env.TASK_NESTING_SHOTS || '';
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
if (!OFFLINE) console.log('[verify-task-nesting-keyboard] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const tabs = markup => (markup.match(/class="pp-tab"/g) || []).length;
async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
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
  await page.waitForTimeout(250);
}
async function clickAt(text, at) {
  const p = await pointOf(text, at);
  if (!p) throw new Error('texte introuvable : ' + text);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(120);
}
const key = async (name, wait = 150) => { await page.keyboard.press(name); await page.waitForTimeout(wait); };
const centerOf = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { x, y, onTop: !!top && (top === el || el.contains(top)), disabled: !!el.disabled || el.hasAttribute('data-pp-lock-soft') };
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

const box = (checked, inner) => `<li data-checked="${checked}" data-type="taskItem"><label><input type="checkbox"${checked ? ' checked="checked"' : ''}><span></span></label><div>${inner}</div></li>`;
const tasks = (items, attrs) => `<ul data-type="taskList"${attrs || ''}>${items}</ul>`;
const FLAT = (attrs) => tasks(box(false, '<p>Premier</p>') + box(true, '<p>Deuxième</p>') + box(false, '<p>Troisième</p>'), attrs);

// Pour chaque case de l'éditeur : son texte, la gauche de sa case et de son texte, sa hauteur (en px de l'écran), ce que son texte porte (trait, couleur) et le style de sa case.
const levels = () => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap li[data-checked]')).map(li => {
  const input = li.querySelector(':scope > label input');
  const p = li.querySelector(':scope > div > p');
  const range = document.createRange();
  range.selectNodeContents(p);
  const cs = getComputedStyle(p);
  const ics = getComputedStyle(input);
  return {
    text: p.textContent, box: Math.round(input.getBoundingClientRect().left * 10) / 10, textLeft: Math.round(range.getBoundingClientRect().left * 10) / 10, top: Math.round(input.getBoundingClientRect().top),
    strike: cs.textDecorationLine.includes('line-through'), color: cs.color, border: ics.borderTopWidth + ' ' + ics.borderTopColor, depth: (() => { let d = 0; for (let up = li.parentElement; up; up = up.parentElement) if (up.matches('ul[data-type="taskList"]')) d += 1; return d; })(),
  };
}));
const flat = rows => rows.every(r => Math.abs(r.box - rows[0].box) < 1);

async function run(label) {
  const tag = label + ' : ';

  // 1) Tab au vrai clavier : la case et son texte vont ensemble sous la case d'avant.
  await setDoc(FLAT());
  const start = await levels();
  await snap(label + '-1-avant');
  await clickAt('Deuxième', 1);
  await key('Tab');
  const nested = await levels();
  const [a, b, c] = nested;
  const h1 = await html();
  await snap(label + '-2-apres-tab');
  check(tag + 'Tab sur « Deuxième » : la case est une sous-case de « Premier » (profondeur 2), « Premier » et « Troisième » restent au premier niveau', !!b && b.depth === 2 && a.depth === 1 && c.depth === 1, nested);
  check(tag + 'la case de « Deuxième » est à droite de celle de « Premier » avec son texte : sa case commence au texte de « Premier » (à quelques pixels près), son texte plus à droite, « Premier » et « Troisième » ne bougent pas', !!b && b.box > a.box + 10 && b.box >= a.textLeft - 1 && b.box <= a.textLeft + 8 && b.textLeft > a.textLeft + 10 && Math.abs(a.box - start[0].box) < 0.6 && Math.abs(c.box - start[2].box) < 0.6, { start, nested });
  check(tag + 'le texte de « Deuxième » n\'a pas reçu de tabulation et le focus reste dans l\'éditeur', tabs(h1) === 0 && (await focusIn()) === 'editor', { tabs: tabs(h1), focus: await focusIn() });
  check(tag + 'les cases gardent leur ordre et leur hauteur : une ligne chacune, de haut en bas, la coche de « Deuxième » gardée', !!c && a.top < b.top && b.top < c.top && b.depth === 2 && (await html()).includes('data-checked="true"'), nested);

  // 2) Maj+Tab la ramène.
  await key('Shift+Tab');
  const back = await levels();
  check(tag + 'Maj+Tab ramène la case au premier niveau : les trois cases sont de nouveau à l\'aplomb', flat(back) && back.every(r => r.depth === 1) && (await focusIn()) === 'editor', back);

  // 3) Tab sur le premier point : rien ne change, rien n'est écrit.
  await clickAt('Premier', 1);
  const before = await html();
  await key('Tab');
  check(tag + 'Tab sur la première case ne change rien (pas de case avant elle), n\'écrit aucune tabulation et le focus reste dans l\'éditeur', (await html()) === before && tabs(await html()) === 0 && (await focusIn()) === 'editor', { html: await html(), focus: await focusIn() });

  // 4) Ctrl+Z défait la case glissée en un pas.
  await clickAt('Troisième', 1);
  await key('Tab');
  const second = await levels();
  await key('Control+z');
  const undone = await levels();
  check(tag + 'Tab puis Ctrl+Z : la case est glissée, puis revient d\'un seul pas', second[2].depth === 2 && undone.every(r => r.depth === 1) && flat(undone), { second, undone });

  // 5) Les boutons de retrait de la barre, à la vraie souris.
  await clickAt('Premier', 1);
  await page.waitForTimeout(150);
  const first = await centerOf('#v2-btn-indent');
  check(tag + 'au premier point, « Augmenter le retrait » est grisé (rien où s\'emboîter)', !!first && first.disabled === true, first);
  await clickAt('Deuxième', 1);
  await page.waitForTimeout(150);
  const live = await centerOf('#v2-btn-indent');
  check(tag + 'sur « Deuxième », « Augmenter le retrait » est vif et atteignable à la souris', !!live && live.disabled === false && live.onTop === true, live);
  await real('#v2-btn-indent', 250);
  const viaButton = await levels();
  await snap(label + '-3-bouton-retrait');
  check(tag + 'un vrai clic sur « Augmenter le retrait » glisse « Deuxième » sous « Premier » ; le focus reste dans l\'éditeur', viaButton[1].depth === 2 && viaButton[1].box > viaButton[0].box + 10 && (await focusIn()) === 'editor', { viaButton, focus: await focusIn() });
  await real('#v2-btn-outdent', 250);
  const viaOut = await levels();
  check(tag + 'un vrai clic sur « Diminuer le retrait » la ramène à l\'aplomb', flat(viaOut) && viaOut.every(r => r.depth === 1), viaOut);

  // 6) Style « classique » : la sous-liste garde la case et le texte de sa liste.
  await setDoc(FLAT(' data-tasklist-style="classic"'));
  await clickAt('Troisième', 1);
  await key('Tab');
  const classic = await levels();
  check(tag + 'style classique : la sous-case a la même case (trait et couleur) que celles de sa liste, et son texte n\'est pas barré', classic[2].depth === 2 && classic[2].border === classic[0].border && classic[1].strike === false && classic[2].strike === false, classic);

  // 7) Style par défaut : le trait et le gris d'une case cochée ne passent pas sur ses sous-cases.
  await setDoc(tasks(box(true, '<p>Parent fait</p>' + tasks(box(false, '<p>Enfant à faire</p>') + box(true, '<p>Enfant fait</p>')))));
  const strike = await levels();
  await snap(label + '-4-case-cochee-et-sous-cases');
  check(tag + 'la case cochée barre et grise SON texte, pas celui de ses sous-cases : « Enfant à faire » reste normal, « Enfant fait » est barré', strike[0].strike === true && strike[1].strike === false && strike[2].strike === true && strike[1].color !== strike[0].color, strike);

  // 8) La Lecture : les mêmes retraits (le rendu de la Lecture est appelé comme le font les essais de la page - sans table liée, le bouton ne montre que la carte « Reliez ce widget à votre tableau »).
  await setDoc(tasks(box(false, '<p>Premier</p>' + tasks(box(false, '<p>Enfant</p>'))) + box(false, '<p>Suivant</p>')));
  const edit = await levels();
  const read = await page.evaluate(async markup => {
    const rc = document.getElementById('reader-container');
    const shown = rc.style.display;
    rc.style.display = 'block';
    await ReaderMode.render(markup, null, { id: 1 }, { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
    const rows = Array.from(rc.querySelectorAll('.reader-content li')).map(li => {
      const input = li.querySelector(':scope > label input');
      const p = li.querySelector(':scope > div > p');
      return input && p ? { text: p.textContent, box: Math.round(input.getBoundingClientRect().left * 10) / 10 } : null;
    }).filter(Boolean);
    rc.style.display = shown;
    return rows;
  }, await html());
  const gapEdit = Math.round((edit[1].box - edit[0].box) * 10) / 10;
  const gapRead = read.length >= 2 ? Math.round((read[1].box - read[0].box) * 10) / 10 : null;
  check(tag + 'la Lecture montre la sous-case décalée comme l\'éditeur (même écart entre la case du parent et celle de l\'enfant)', read.length === 3 && gapRead !== null && gapRead > 10 && Math.abs(gapRead - gapEdit) <= 1.5, { edit, read, gapEdit, gapRead });
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
