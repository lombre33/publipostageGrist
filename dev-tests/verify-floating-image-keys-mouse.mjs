#!/usr/bin/env node
// Retour arrière et Suppr n'emportent plus une image en calque (Antoine, 2026-10-04 : « des fois je veux supprimer une ligne et ça me supprime l'image à proximité », puis « important ! l'image est
// une image importée via une colonne PJ » et « ça a l'air de le faire aussi des images classiques »), au VRAI clavier et à la VRAIE souris, à la taille du panneau Grist d'Antoine (~700x400), en
// thème clair puis sombre, avec une image d'un fichier puis une image PJ, devant puis derrière le texte. Ce que scenarios-floating-image-keys.js ne peut pas voir depuis la page : une frappe
// synthétique ne déclenche pas l'effacement natif du navigateur (le caractère voisin), et un clic de la page n'est ni un vrai clic ni un triple clic.
//  - la ligne qui ne porte que l'image (elle semble vide) : un vrai clic dedans puis Retour arrière la joint à la ligne d'avant, l'image reste, au même endroit de l'écran ; le Retour arrière
//    suivant efface le dernier caractère du titre (le navigateur), pas l'image ;
//  - un triple clic sur une ligne qui porte une image, puis Retour arrière : le texte part, l'image reste là où elle était ; la ligne vide se joint ensuite à celle d'avant sans l'image ;
//  - Suppr en fin de titre, la ligne suivante ne portant que l'image : elle se joint, l'image reste, et le Suppr suivant joint la ligne d'après au lieu d'effacer l'image ;
//  - ce qui doit partir part : un vrai clic sur l'image la sélectionne, Suppr l'enlève et elle seule (Ctrl+Z la rend), Ctrl+A puis Suppr vide tout le document ;
//  - une image au fil du texte garde son comportement (Retour arrière juste après elle l'efface) ;
//  - un texte tapé, Entrée, un texte collé (saisie IME) ou Ctrl+Suppr sur une ligne qui porte l'image : le texte est remplacé ou effacé, l'image reste au même endroit de l'écran, la frappe suivante
//    se joint au texte tapé (jamais à la ligne du dessus), Ctrl+Z rend la ligne et l'image en une étape ; Couper (Ctrl+X) emporte l'image avec le texte, Coller (Ctrl+V) la rend à sa place.
// Lancé par run-headless.mjs (groupe Node "floatingKeysMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-floating-image-keys-mouse.mjs
// FLOATING_KEYS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.FLOATING_KEYS_MOUSE_PORT || 8979);
const SHOTS = process.env.FLOATING_KEYS_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-tail-anchor-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-floating-image-keys-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];

// Une image carrée et bien visible, dessinée dans la page : une capture montre où elle est.
const squareImage = () => {
  const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8;
  const g = canvas.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#fff'; g.fillRect(2, 2, 4, 4);
  return canvas.toDataURL('image/png');
};
// Une image en calque, posée sur la page 1 à droite des premières lignes (courtes : le texte ne passe pas sous elle), dans la partie du panneau qu'on voit sans défiler. `left` et `top` du style sont comptés
// depuis le coin de la feuille.
const PJ_ATTRS = ' data-var-table="Clients" data-var-column="Photo" data-var-key="Clients.Photo"';
const floating = (png, layer, attachment) => '<img class="editor-image" src="' + (attachment ? '' : png) + '" alt="" style="width: 90px; height: 70px; position: absolute; left: 380px; top: 120px; z-index: '
  + (layer === 'front' ? 5 : -1) + ';" data-layer="' + layer + '" data-wrap="inline" data-page-index="0" data-page-left-pt="285" data-page-top-pt="90"' + (attachment ? PJ_ATTRS : '') + '>';
const classicImage = png => '<img class="editor-image" src="' + png + '" alt="" style="width: 40px" data-layer="normal" data-wrap="inline">';

async function openWidget(colorScheme) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => { d.accept().catch(() => {}); });
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
  return { context, page };
}

async function runTheme(theme, variant) {
  const attachment = variant === 'attachment';
  const themeLabel = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Retour arrière et Suppr à côté d'une image en calque${attachment ? ' (importée via une colonne PJ)' : ''}, vrai clavier et vraie souris, ${WIDTH}x${HEIGHT}, thème ${themeLabel} ===`);
  const { context, page } = await openWidget(theme);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${theme}-${variant}-${name}.png`) }); };
  const png = await page.evaluate(squareImage);

  // Le document en une ligne par paragraphe, chaque image à sa place dans la ligne ; la sélection de ProseMirror ; et l'écran : le rectangle de chaque image en calque (la vue de son cadre).
  const state = () => page.evaluate(() => {
    const ed = EditorCore.getEditor();
    const lines = [];
    let images = 0;
    ed.state.doc.forEach(block => {
      if (block.type.name !== 'paragraph') { lines.push('<' + block.type.name + '>'); return; }
      let line = '';
      block.forEach(child => {
        if (child.isText) line += child.text;
        else if (child.type.name === 'editorImage') { images++; line += child.attrs.layer === 'normal' ? '⟨classique⟩' : '⟨image⟩'; } else line += '⟨' + child.type.name + '⟩';
      });
      lines.push(line);
    });
    const sel = ed.state.selection;
    const views = Array.from(document.querySelectorAll('.tiptap .editor-image-view.editor-image-layered')).map(v => { const r = v.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });
    return { text: lines.join(' | '), images, node: sel.node ? sel.node.type.name : null, empty: sel.empty, from: sel.from, to: sel.to, views };
  });
  const sameSpot = (a, b) => !!a && !!b && near(a.left, b.left, 1) && near(a.top, b.top, 1) && near(a.width, b.width, 1) && near(a.height, b.height, 1);
  async function load(html) {
    await page.evaluate(async html => {
      PageLayout.setMarginsMm(null); PageLayout.setOrientation('portrait');
      Editor.setHTML(html);
      await new Promise(r => setTimeout(r, 400));
      document.getElementById('editor-container').scrollTop = 0;
    }, html);
    await sleep(350);
    // La souris loin de la barre d'outils : en passant sur un bouton à menu au survol, elle ouvrirait un menu qui recouvrirait la cible.
    await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 3 });
    await sleep(250);
  }
  // Le rectangle à l'écran du texte (ou, sans texte, du paragraphe) de rang i : jamais celui d'une image en calque, posée ailleurs.
  const lineBox = i => page.evaluate(i => {
    const p = document.querySelectorAll('.tiptap > p')[i];
    const r = p.getBoundingClientRect();
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const rects = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim() || node.parentElement.closest('.editor-image-view')) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      Array.from(range.getClientRects()).forEach(x => { if (x.width > 0 && x.height > 0) rects.push(x); });
    }
    const t = rects.length ? { left: rects[0].left, top: rects[0].top, right: rects[rects.length - 1].right, bottom: rects[rects.length - 1].bottom } : null;
    return { para: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, text: t };
  }, i);
  // Le geste d'une vraie souris : l'approche, puis le clic.
  async function click(x, y, options) {
    await page.mouse.move(x - 6, y, { steps: 2 });
    await page.mouse.move(x, y, { steps: 3 });
    await page.mouse.click(x, y, options);
    await sleep(250);
  }
  const clickLine = async i => { const b = await lineBox(i); await click(b.para.left + 6, (b.para.top + b.para.bottom) / 2); };
  const clickEndOfLine = async i => { const b = await lineBox(i); await click(b.text ? b.text.right + 4 : b.para.right - 6, (b.para.top + b.para.bottom) / 2); };
  const tripleClickLine = async i => { const b = await lineBox(i); await click(b.text.left + 8, (b.text.top + b.text.bottom) / 2, { clickCount: 3 }); };
  async function press(...keys) { for (const key of keys) { await page.keyboard.press(key); await sleep(180); } }

  for (const layer of ['front', 'behind']) {
    const label = `${themeLabel}${attachment ? ', image PJ' : ''}, ${layer === 'front' ? 'devant' : 'derrière'} le texte`;
    const F = floating(png, layer, attachment);

    // --- 1. La ligne qui ne porte que l'image : un vrai clic dedans, Retour arrière ---
    await load('<p>Titre</p><p>' + F + '</p><p>Ligne A</p><p>Ligne B</p>');
    let start = await state();
    check(`${label} - le document : trois lignes de texte et une ligne qui ne porte que l'image, l'image en calque est à l'écran`, start.text === 'Titre | ⟨image⟩ | Ligne A | Ligne B' && start.images === 1 && start.views.length === 1, start);
    await snap(`${layer}-1-debut`);
    await clickLine(1);
    let s = await state();
    check(`${label} - un vrai clic dans la ligne qui semble vide y pose le curseur`, s.empty && s.node === null && s.from > 7 && s.from <= 9, s);
    await press('Backspace');
    s = await state();
    check(`${label} - Retour arrière dans cette ligne : l'image est toujours là (${s.images}) et la ligne vide est partie (« ${s.text} »)`, s.images === 1 && s.text === 'Titre⟨image⟩ | Ligne A | Ligne B', s);
    check(`${label} - l'image n'a pas bougé à l'écran`, s.views.length === 1 && sameSpot(s.views[0], start.views[0]), { avant: start.views, apres: s.views });
    await snap(`${layer}-2-apres-retour-arriere`);
    await press('Backspace');
    s = await state();
    check(`${label} - le Retour arrière suivant efface le dernier caractère du titre (« ${s.text} »), pas l'image`, s.images === 1 && s.text === 'Titr⟨image⟩ | Ligne A | Ligne B', s);

    // --- 2. Triple clic sur une ligne qui porte l'image, Retour arrière ---
    await load('<p>Titre</p><p>Ligne A' + F + '</p><p>Ligne B</p>');
    start = await state();
    await tripleClickLine(1);
    s = await state();
    check(`${label} - le triple clic sélectionne la ligne (de ${s.from} à ${s.to}), l'ancre de l'image comprise`, !s.empty && s.node === null && s.to - s.from === 8, s);
    await press('Backspace');
    s = await state();
    check(`${label} - Retour arrière : le texte de la ligne est parti, l'image reste (${s.images}), la ligne aussi (« ${s.text} »)`, s.images === 1 && s.text === 'Titre | ⟨image⟩ | Ligne B', s);
    check(`${label} - l'image est restée à sa place à l'écran`, s.views.length === 1 && sameSpot(s.views[0], start.views[0]), { avant: start.views, apres: s.views });
    await press('Backspace');
    s = await state();
    check(`${label} - Retour arrière sur la ligne qui ne porte plus que l'image : elle se joint à la ligne d'avant, l'image avec elle (« ${s.text} »)`, s.images === 1 && s.text === 'Titre⟨image⟩ | Ligne B', s);
    await press('Backspace');
    s = await state();
    check(`${label} - et le suivant efface un caractère du titre (« ${s.text} »)`, s.images === 1 && s.text === 'Titr⟨image⟩ | Ligne B', s);

    // --- 3. Suppr en fin de titre, la ligne suivante ne porte que l'image ---
    await load('<p>Titre</p><p>' + F + '</p><p>Ligne A</p>');
    start = await state();
    await clickEndOfLine(0);
    await press('Delete');
    s = await state();
    check(`${label} - Suppr en fin de titre : la ligne de l'image se joint au titre, l'image reste (« ${s.text} »)`, s.images === 1 && s.text === 'Titre⟨image⟩ | Ligne A', s);
    await press('Delete');
    s = await state();
    check(`${label} - le Suppr suivant joint la ligne d'après au lieu d'effacer l'image (« ${s.text} »)`, s.images === 1 && s.text === 'Titre⟨image⟩Ligne A', s);
    check(`${label} - l'image est restée à sa place à l'écran`, s.views.length === 1 && sameSpot(s.views[0], start.views[0]), { avant: start.views, apres: s.views });

    // --- 4. Ce qui doit partir part ---
    await load('<p>Titre</p><p>Ligne A</p><p>Ligne B</p><p>' + F + '</p>');
    start = await state();
    const view = start.views[0];
    await click(view.left + view.width / 2, view.top + view.height / 2);
    s = await state();
    check(`${label} - un vrai clic sur l'image la sélectionne`, s.node === 'editorImage', s);
    await press('Delete');
    s = await state();
    check(`${label} - Suppr enlève l'image et elle seule (« ${s.text} »)`, s.images === 0 && s.text === 'Titre | Ligne A | Ligne B | ', s);
    await press('Control+z');
    s = await state();
    check(`${label} - Ctrl+Z la rend, à sa place (${s.images} image)`, s.images === 1 && s.views.length === 1 && sameSpot(s.views[0], view), { avant: view, apres: s.views });
    await clickLine(1);
    await press('Control+a', 'Delete');
    s = await state();
    check(`${label} - Ctrl+A puis Suppr vide tout le document, l'image comprise (« ${s.text} », ${s.images} image)`, s.images === 0 && s.text.replace(/\s|\|/g, '') === '', s);

    // --- 6. Texte tapé, Entrée, collé, mot effacé, Couper sur une ligne qui porte l'image ---
    const line = 'Titre | Ligne A⟨image⟩ | Ligne B';
    await load('<p>Titre</p><p>Ligne A' + F + '</p><p>Ligne B</p>');
    start = await state();
    await tripleClickLine(1);
    await page.keyboard.type('xyz', { delay: 40 });
    await sleep(250);
    s = await state();
    check(`${label} - des lettres tapées sur la ligne sélectionnée la remplacent, l'image reste, et les lettres se suivent (« ${s.text} »)`, s.images === 1 && s.text === 'Titre | xyz⟨image⟩ | Ligne B', s);
    check(`${label} - l'image est restée à sa place à l'écran`, s.views.length === 1 && sameSpot(s.views[0], start.views[0]), { avant: start.views, apres: s.views });
    await press('Control+z');
    s = await state();
    check(`${label} - Ctrl+Z rend la ligne et l'image en une étape (« ${s.text} », ${s.images} image)`, s.images === 1 && s.text === line && s.views.length === 1 && sameSpot(s.views[0], start.views[0]), { avant: start.views, apres: s.views, texte: s.text });

    await load('<p>Titre</p><p>Ligne A' + F + '</p><p>Ligne B</p>');
    await tripleClickLine(1);
    await press('Enter');
    await page.keyboard.type('ab', { delay: 40 });
    await sleep(250);
    s = await state();
    check(`${label} - Entrée sur la ligne sélectionnée : l'image reste (${s.images}), la frappe suivante va dans la nouvelle ligne et non à la fin de la ligne du dessus (« ${s.text} »)`, s.images === 1 && s.text === 'Titre |  | ⟨image⟩ab | Ligne B', s);
    // Deux étapes : la frappe « ab », puis Entrée avec l'image reposée.
    await press('Control+z', 'Control+z');
    s = await state();
    check(`${label} - Ctrl+Z deux fois (la frappe, puis Entrée) rend la ligne d'avant et son image (« ${s.text} », ${s.images} image)`, s.images === 1 && s.text === line, s);

    await load('<p>Titre</p><p>Ligne A' + F + '</p><p>Ligne B</p>');
    start = await state();
    await tripleClickLine(1);
    await page.keyboard.insertText('Collé');
    await sleep(250);
    s = await state();
    check(`${label} - un texte collé sur la ligne sélectionnée (saisie IME) la remplace, l'image reste (« ${s.text} »)`, s.images === 1 && s.text === 'Titre | Collé⟨image⟩ | Ligne B' && s.views.length === 1 && sameSpot(s.views[0], start.views[0]), s);

    // Le texte tapé après la suppression d'une ligne : il reste dans cette ligne, pas au bout du titre (avant : « Titreab »).
    await load('<p>Titre</p><p>Ligne A' + F + '</p><p>Ligne B</p>');
    await tripleClickLine(1);
    await press('Backspace');
    await page.keyboard.type('ab', { delay: 40 });
    await sleep(250);
    s = await state();
    check(`${label} - Retour arrière sur la ligne sélectionnée puis du texte : il reste dans cette ligne, le titre n'est pas touché (« ${s.text} »)`, s.images === 1 && s.text === 'Titre | ⟨image⟩ab | Ligne B', s);

    // Ctrl+Suppr au début d'un mot qui porte l'ancre en son milieu : le navigateur efface « foo » et l'ancre d'un coup ; l'image reste, la frappe suivante aussi.
    await load('<p>Titre</p><p>foo' + F + 'bar baz</p><p>Ligne B</p>');
    start = await state();
    await clickLine(1);
    await press('Home', 'Control+Delete');
    s = await state();
    check(`${label} - Ctrl+Suppr efface le mot (« ${s.text} ») sans emporter l'image (${s.images}), qui reste à sa place à l'écran`, s.images === 1 && !s.text.includes('foo') && s.text.includes('bar baz') && s.views.length === 1 && sameSpot(s.views[0], start.views[0]), { texte: s.text, avant: start.views, apres: s.views });
    await page.keyboard.type('Z');
    await sleep(200);
    s = await state();
    check(`${label} - la lettre tapée ensuite va dans la même ligne (« ${s.text} »)`, s.images === 1 && s.text.startsWith('Titre | ') && s.text.includes('Zbar baz') && s.text.endsWith(' | Ligne B'), s);

    // Couper : le texte et l'image partent ensemble dans le presse-papiers ; Coller les rend, l'image à sa place sur la page.
    await load('<p>Titre</p><p>Ligne A' + F + '</p><p>Ligne B</p><p>Fin</p>');
    start = await state();
    await tripleClickLine(1);
    await press('Control+x');
    s = await state();
    check(`${label} - Couper emporte le texte et l'image (« ${s.text} », ${s.images} image)`, s.images === 0 && s.text === 'Titre |  | Ligne B | Fin', s);
    await clickEndOfLine(3);
    await press('Control+v');
    s = await state();
    check(`${label} - Coller rend le texte et l'image, à la même place à l'écran (« ${s.text} »)`, s.images === 1 && s.text === 'Titre |  | Ligne B | FinLigne A⟨image⟩' && s.views.length === 1 && sameSpot(s.views[0], start.views[0]), { texte: s.text, avant: start.views, apres: s.views });
  }

  // --- 5. Une image au fil du texte (classique) : Retour arrière juste après elle l'efface, comme avant ---
  await load('<p>Titre</p><p>Ligne A' + classicImage(png) + '</p><p>Ligne B</p>');
  const lastLine = await lineBox(1);
  await click(lastLine.para.right - 6, (lastLine.para.top + lastLine.para.bottom) / 2);
  await press('Backspace');
  const classic = await state();
  check(`${themeLabel}${attachment ? ', image PJ' : ''} - une image au fil du texte garde son comportement : Retour arrière juste après elle l'efface (« ${classic.text} »)`, classic.images === 0 && classic.text === 'Titre | Ligne A | Ligne B', classic);

  await context.close();
}

try {
  for (const variant of ['file', 'attachment']) {
    await runTheme('light', variant);
    await runTheme('dark', variant);
  }
  check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
