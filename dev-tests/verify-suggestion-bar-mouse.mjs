#!/usr/bin/env node
// Barre « Accepter / Refuser » d'UNE modification du suivi, à la vraie souris et au vrai clavier, à la taille du panneau Grist d'Antoine (~700x400), en thème clair puis sombre.
// Demande d'Antoine du 04/10 (« on n'a juste le bouton pour tout accepter et tout refuser ? on n'a pas la possibilité de cliquer sur la zone modifiée et accepter que cela là ? ») :
// un clic sur un texte inséré ou supprimé ouvre, SOUS le curseur, une petite barre « Accepter / Refuser » qui ne traite que cette modification (js/floating-toolbars.js:
// wireSuggestionFloatingToolbar, js/track-changes.js:acceptSuggestionsAtSelection). Le script allume le suivi au bouton, tape et supprime au clavier, puis lit : l'ouverture de la barre
// (clic, glisser, jamais pendant la frappe ni tant qu'un bouton de la souris est appuyé), sa place (sous le curseur, tout entière dans la fenêtre, au-dessus de ce qu'elle recouvre,
// retournée au-dessus du texte tout en bas), ses couleurs (4,5:1 au moins, calculées ET aux pixels), « Accepter » / « Refuser » au vrai clic (une seule modification traitée, un seul Ctrl+Z),
// l'anglais, et une colonne de tableau ajoutée avec le suivi, résolue depuis l'une de ses cases pendant que la barre du tableau est ouverte aussi.
// Lancé par run-headless.mjs (groupe Node "suggestionBarMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-suggestion-bar-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.SUGGESTION_BAR_PORT || 8953);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-track-text-colors-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-suggestion-bar-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
// Une page neuve par thème : même panneau ~700x400, mêmes routes hors-ligne.
async function openPage(dark) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, colorScheme: dark ? 'dark' : 'light' });
  const page = await context.newPage();
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
  // Aperçu A4, le réglage d'Antoine : c'est lui qui déclenche aussi la correction de largeur des tableaux trop larges pour la page.
  await page.evaluate(() => { document.getElementById('editor-container').classList.add('a4-preview'); });
  return page;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const settle = () => sleep(600);

const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
const contrast = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const near = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

let page;
// Le pixel réellement peint en (x, y) de la fenêtre : une capture de 1x1 px, relue sans bibliothèque (une seule ligne de pixels : tous les filtres PNG rendent les octets bruts).
async function pixelAt(x, y) {
  const png = await page.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 } });
  const idat = [];
  for (let off = 8; off < png.length;) {
    const len = png.readUInt32BE(off);
    if (png.toString('ascii', off + 4, off + 8) === 'IDAT') idat.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return [raw[1], raw[2], raw[3]];
}
// La barre « Accepter / Refuser » : ouverte ou non, son cadre, chaque bouton (centre, libellé, info-bulle, couleur), le fond réel sous les boutons, et si le centre de chaque bouton est bien
// ce que la souris atteint (rien ne recouvre la barre).
const bar = () => page.evaluate(() => {
  const el = document.querySelector('.v2-suggest-toolbar');
  // Pas de barre du tout (le code d'avant) : une barre fermée, que chaque vérification constate - le parcours va jusqu'au bout au lieu de s'arrêter sur une erreur.
  if (!el) return { visible: false, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, text: '', buttons: [] };
  const r = el.getBoundingClientRect();
  const effectiveBg = (node) => { for (let n = node; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (!/rgba\(.*,\s*0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
  const buttons = [...el.querySelectorAll('button')].map((b) => {
    const br = b.getBoundingClientRect();
    const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
    return { action: b.dataset.action, text: b.textContent, title: b.title, left: br.left, top: br.top, x: br.left + br.width / 2, y: br.top + br.height / 2, color: getComputedStyle(b).color, bg: effectiveBg(b), reachable: hit === b };
  });
  return { visible: el.classList.contains('visible'), left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, text: el.textContent, buttons };
});
const barOpen = async () => (await bar()).visible;
const caretRect = () => page.evaluate(() => { const ed = EditorCore.getEditor(); const c = ed.view.coordsAtPos(ed.state.selection.head); return { top: c.top, bottom: c.bottom, left: c.left }; });
const html = () => page.evaluate(() => Editor.getHTML());
const insCount = h => (h.match(/<ins /g) || []).length;
const delCount = h => (h.match(/<del /g) || []).length;
// La souris au bas du panneau : les menus de la barre d'outils s'ouvrent au survol et recouvriraient le texte visé.
const parkMouse = async () => { await page.mouse.move(WIDTH / 2, HEIGHT - 6); await sleep(350); };
// Le centre, les bords gauche et droit et le milieu d'un texte du document, pour viser à la vraie souris.
const rectOf = text => page.evaluate((t) => {
  const walker = document.createTreeWalker(document.querySelector('.tiptap'), NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const i = n.textContent.indexOf(t);
    if (i < 0) continue;
    const range = document.createRange();
    range.setStart(n, i); range.setEnd(n, i + t.length);
    const r = range.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }
  return null;
}, text);
// Un clic de la vraie souris sur un texte du document ; l'attente d'abord : un second appui au même endroit dans les 500 ms ferait un double-clic.
const clickText = async (text) => {
  const r = await rectOf(text);
  if (!r) throw new Error('texte « ' + text + ' » introuvable');
  await sleep(600);
  await page.mouse.click(r.x, r.y);
  await sleep(300);
  return r;
};
const pressButton = async (action) => {
  const b = (await bar()).buttons.find(btn => btn.action === action);
  if (b) await page.mouse.click(b.x, b.y);
  await sleep(350);
};
const undo = async () => { await sleep(600); await page.keyboard.press('Control+z'); await sleep(350); };
const newDocument = async (content) => {
  await page.evaluate((c) => { Editor.setHTML(c); }, content);
  await settle();
};

for (const dark of [false, true]) {
  const theme = dark ? 'sombre' : 'clair';
  page = await openPage(dark);
  console.log(`\n--- thème ${theme} ---`);
  await page.evaluate(() => { Editor.setTrackChanges(false); });
  await newDocument('<p>Premier paragraphe de test.</p><p>Deuxième paragraphe avec un mot à retirer ici.</p><p>Troisième paragraphe.</p>');

  // Le suivi s'allume au bouton de la barre (vraie souris) ; une frappe au clavier ajoute du texte en fin de premier et de troisième paragraphe, un double-clic puis Suppr retire un mot du deuxième.
  await page.click('#v2-btn-track-changes');
  await sleep(250);
  check(`[${theme}] le bouton de suivi (vraie souris) allume le suivi`, await page.evaluate(() => Editor.isTrackChangesOn()));
  await parkMouse();
  await page.click('.tiptap p');
  await page.keyboard.press('End');
  await page.keyboard.type(' Ajout un.');
  await sleep(250);
  const typingOpened = await barOpen();
  const word = await rectOf('retirer');
  await sleep(600);
  await page.mouse.dblclick(word.x, word.y);
  await sleep(250);
  await page.keyboard.press('Delete');
  await sleep(300);
  const deletingOpened = await barOpen();
  const third = await rectOf('Troisième');
  await sleep(600);
  await page.mouse.click(third.x, third.y);
  await page.keyboard.press('End');
  await page.keyboard.type(' Ajout trois.');
  await sleep(300);
  const typingThirdOpened = await barOpen();
  const seeded = await html();
  check(`[${theme}] deux ajouts tapés et un mot supprimé au clavier : trois modifications en attente`, insCount(seeded) === 2 && delCount(seeded) === 1 && /Ajout un\./.test(seeded) && /Ajout trois\./.test(seeded), seeded);
  check(`[${theme}] la barre ne s'ouvre jamais pendant la frappe ni après une suppression`, !typingOpened && !deletingOpened && !typingThirdOpened, { typingOpened, deletingOpened, typingThirdOpened });

  // Un clic sur le mot supprimé : fermée tant que le bouton de la souris est appuyé, ouverte au relâchement, sous le curseur, tout entière dans la fenêtre.
  await parkMouse();
  const del = await rectOf('retirer');
  await sleep(700);
  await page.mouse.move(del.x, del.y);
  await page.mouse.down();
  await sleep(120);
  const whilePressed = await barOpen();
  await page.mouse.up();
  await sleep(350);
  const b1 = await bar();
  check(`[${theme}] clic sur un texte supprimé : la barre reste fermée tant que la souris est appuyée, puis s'ouvre au relâchement`, !whilePressed && b1.visible, { whilePressed, visible: b1.visible });
  const caret = await caretRect();
  check(`[${theme}] la barre s'ouvre sous le curseur, tout entière dans la fenêtre`,
    b1.visible && b1.top >= caret.bottom - 1 && b1.left >= 0 && b1.right <= WIDTH && b1.top >= 0 && b1.bottom <= HEIGHT, { bar: [b1.left, b1.top, b1.right, b1.bottom], caret });
  check(`[${theme}] libellés « Accepter » et « Refuser », info-bulles au singulier`,
    b1.text === 'AccepterRefuser' && b1.buttons.map(b => b.title).join() === 'Accepter cette modification,Refuser cette modification', { text: b1.text, titles: b1.buttons.map(b => b.title) });
  check(`[${theme}] rien ne recouvre la barre : le centre de chaque bouton est atteint par la souris`, b1.buttons.length === 2 && b1.buttons.every(b => b.reachable), b1.buttons.map(b => b.reachable));
  const ratios = b1.buttons.map(b => contrast(b.color, b.bg));
  check(`[${theme}] boutons : texte sur fond à 4,5:1 au moins`, ratios.length === 2 && ratios.every(r => r >= 4.5), { colors: b1.buttons.map(b => b.color + ' sur ' + b.bg), ratios });
  const first = b1.buttons[0];
  const px = first ? await pixelAt(first.left + 3, first.top + 3) : null;
  check(`[${theme}] pixels peints : le fond de la barre est celui du thème (pas un fond de page ni de texte)`, !!first && near(px, rgb(first.bg)), { px, bg: first && first.bg });

  // Un clic sur du texte sans modification ferme la barre.
  await clickText('Premier paragraphe');
  check(`[${theme}] clic sur un texte sans modification : la barre se ferme`, !(await barOpen()));

  // Un clic sur l'ajout ouvre la barre ; taper une lettre la ferme, et elle ne revient pas.
  await clickText('Ajout un');
  const onInsertion = await barOpen();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await sleep(300);
  const afterTyping = await barOpen();
  await sleep(400);
  check(`[${theme}] clic sur un ajout : la barre s'ouvre ; une frappe la ferme et elle ne revient pas`, onInsertion && !afterTyping && !(await barOpen()), { onInsertion, afterTyping });

  // « Accepter » à la vraie souris : seule cette modification est résolue.
  await clickText('Ajout un');
  await pressButton('accept');
  const accepted = await html();
  check(`[${theme}] « Accepter » (vraie souris) : l'ajout du premier paragraphe est accepté, le mot supprimé et l'ajout du troisième restent en attente`,
    /<p>Premier paragraphe de test\. ?Ajout un/.test(accepted) && insCount(accepted) === 1 && delCount(accepted) === 1 && /<ins [^>]*>[^<]*Ajout trois\./.test(accepted), accepted);
  check(`[${theme}] la barre se ferme après « Accepter »`, !(await barOpen()));
  await undo();
  const undone = await html();
  check(`[${theme}] Ctrl+Z : l'ajout redevient une suggestion en attente, d'un seul coup, le reste intact`, insCount(undone) === 2 && delCount(undone) === 1 && /<ins [^>]*>[^<]*Ajout un/.test(undone), undone);

  // Un glisser sur le mot supprimé et l'ajout du troisième : fermée pendant le geste, ouverte au relâchement, au pluriel.
  await parkMouse();
  const from = await rectOf('retirer');
  const to = await rectOf('Ajout trois');
  await sleep(700);
  await page.mouse.move(from.left + 1, from.y);
  await page.mouse.down();
  await page.mouse.move(to.right - 1, to.y, { steps: 8 });
  await sleep(150);
  const draggingOpened = await barOpen();
  await page.mouse.up();
  await sleep(350);
  const b2 = await bar();
  check(`[${theme}] glisser sur deux modifications : barre fermée pendant le geste, ouverte au relâchement, info-bulles au pluriel`,
    !draggingOpened && b2.visible && b2.buttons.map(b => b.title).join() === 'Accepter ces modifications,Refuser ces modifications', { draggingOpened, visible: b2.visible, titles: b2.buttons.map(b => b.title) });
  // « Refuser » sur cette sélection : les deux sont refusées, le premier ajout reste en attente.
  await pressButton('reject');
  const rejected = await html();
  check(`[${theme}] « Refuser » sur la sélection : le mot supprimé revient, l'ajout du troisième part, celui du premier reste en attente`,
    !delCount(rejected) && /un mot à retirer ici/.test(rejected) && !/Ajout trois/.test(rejected) && insCount(rejected) === 1, rejected);
  await undo();
  check(`[${theme}] Ctrl+Z : les deux modifications reviennent en une seule fois`, delCount(await html()) === 1 && insCount(await html()) === 2);

  // L'anglais : libellés et info-bulles suivent la langue de l'interface.
  await page.evaluate(() => I18n.setLang('en'));
  await sleep(200);
  await clickText('Ajout trois');
  const en = await bar();
  check(`[${theme}] en anglais : « Accept » et « Reject », info-bulles « this change »`, en.visible && en.text === 'AcceptReject' && en.buttons.map(b => b.title).join() === 'Accept this change,Reject this change', { text: en.text, titles: en.buttons.map(b => b.title) });
  await page.evaluate(() => I18n.setLang('fr'));
  await sleep(200);

  // Tout en bas de la fenêtre : la barre se retourne au-dessus du curseur plutôt que de sortir de la fenêtre ou de recouvrir le texte visé.
  await page.evaluate(() => { Editor.setTrackChanges(false); });
  await newDocument(Array.from({ length: 14 }, (_, i) => `<p>Ligne ${i + 1} du document.</p>`).join(''));
  await page.evaluate(() => Editor.setTrackChanges(true));
  await parkMouse();
  await page.evaluate(() => { const last = document.querySelector('.tiptap p:last-child'); last.scrollIntoView({ block: 'end' }); });
  await sleep(300);
  const lastLine = await rectOf('Ligne 14');
  await page.mouse.click(lastLine.x, lastLine.y);
  await page.keyboard.press('End');
  await page.keyboard.type(' Ajout du bas.');
  await sleep(300);
  await page.evaluate(() => { document.querySelector('.tiptap p:last-child').scrollIntoView({ block: 'end' }); });
  await sleep(300);
  await clickText('Ajout du bas');
  const bottom = await bar();
  const bottomCaret = await caretRect();
  check(`[${theme}] texte tout en bas de la fenêtre : la barre est ouverte, tout entière dans la fenêtre, et ne recouvre pas le texte visé`,
    bottom.visible && bottom.top >= 0 && bottom.bottom <= HEIGHT && bottom.left >= 0 && bottom.right <= WIDTH && (bottom.top >= bottomCaret.bottom - 1 || bottom.bottom <= bottomCaret.top + 1),
    { bar: [bottom.left, bottom.top, bottom.right, bottom.bottom], caret: bottomCaret });
  await pressButton('reject');
  check(`[${theme}] « Refuser » tout en bas : l'ajout part, le dernier paragraphe est rendu tel quel`, !/Ajout du bas/.test(await html()) && /Ligne 14 du document\./.test(await html()));
  await page.evaluate(() => { Editor.setTrackChanges(false); });

  // Une colonne de tableau ajoutée avec le suivi : une case suffit pour la refuser en entier, la barre du tableau étant ouverte aussi.
  await newDocument('<table><tbody><tr><td><p>a1</p></td><td><p>b1</p></td><td><p>c1</p></td></tr><tr><td><p>a2</p></td><td><p>b2</p></td><td><p>c2</p></td></tr></tbody></table><p>fin</p>');
  await page.evaluate(() => Editor.setTrackChanges(true));
  await parkMouse();
  await page.evaluate(() => window.scrollTo(0, 0));
  await clickText('b1');
  const tableButton = await page.evaluate(() => {
    const btn = document.querySelector('.v2-floating-toolbar button[data-action="col-after"]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  check(`[${theme}] la barre du tableau propose « Colonne après » (vraie souris)`, !!tableButton);
  if (tableButton) {
    await page.mouse.click(tableButton.x, tableButton.y);
    await sleep(600);
    const marked = await page.evaluate(() => [...document.querySelectorAll('.tiptap td')].filter(td => td.parentElement.tagName === 'INS').length);
    check(`[${theme}] « Colonne après » avec le suivi : une case marquée par ligne`, marked === 2, marked);
    const cell = await page.evaluate(() => {
      const td = [...document.querySelectorAll('.tiptap td')].filter(c => c.parentElement.tagName === 'INS')[1];
      const r = td.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await parkMouse();
    await sleep(700);
    await page.mouse.click(cell.x, cell.y);
    await sleep(350);
    const tb = await bar();
    const tablePanel = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.v2-floating-toolbar')].find(p => !p.classList.contains('v2-suggest-toolbar') && p.classList.contains('visible') && p.querySelector('[data-action="col-after"]'));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    });
    const overlap = !!tablePanel && tb.left < tablePanel.right && tb.right > tablePanel.left && tb.top < tablePanel.bottom && tb.bottom > tablePanel.top;
    check(`[${theme}] clic dans une case de la colonne ajoutée : la barre « Accepter / Refuser » s'ouvre, atteignable, sans recouvrir la barre du tableau`,
      tb.visible && tb.buttons.every(b => b.reachable) && !!tablePanel && !overlap, { visible: tb.visible, reachable: tb.buttons.map(b => b.reachable), table: tablePanel, bar: [tb.left, tb.top, tb.right, tb.bottom] });
    await pressButton('reject');
    const afterReject = await page.evaluate(() => ({ html: Editor.getHTML(), columns: [...document.querySelectorAll('.tiptap tr')].map(tr => tr.querySelectorAll('td, th').length), pending: Editor.hasPendingTrackedChanges() }));
    check(`[${theme}] « Refuser » depuis une case : la colonne entière disparaît (trois colonnes, aucune marque)`, afterReject.columns.join() === '3,3' && !afterReject.pending && !/data-tc-/.test(afterReject.html), afterReject);
    await undo();
    const afterUndo = await page.evaluate(() => ({ columns: [...document.querySelectorAll('.tiptap tr')].map(tr => tr.querySelectorAll('td, th').length), pending: Editor.hasPendingTrackedChanges() }));
    check(`[${theme}] Ctrl+Z : la colonne revient entière d'un seul coup, toujours en attente`, afterUndo.columns.join() === '4,4' && afterUndo.pending, afterUndo);
  }

  await page.evaluate(() => Editor.setTrackChanges(false));
  await page.context().close();
}

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
