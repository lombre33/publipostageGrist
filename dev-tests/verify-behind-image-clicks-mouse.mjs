#!/usr/bin/env node
// Un clic sur du texte posé sur une image « derrière le texte » atteint le texte, plus l'image (Antoine, 2026-10-04 : « des fois je veux supprimer une ligne et ça me supprime l'image à proximité »,
// puis « important ! l'image est une image importée via une colonne PJ »), à la VRAIE souris et au VRAI clavier, à la taille du panneau Grist d'Antoine (~700x400), en thème clair puis sombre, avec une
// image d'un fichier puis une image PJ. Avant, le cadre de l'image (au-dessus du texte pour que sa poignée reste atteignable) recevait aussi les clics tombés sur les lignes qu'elle recouvre : le clic
// sélectionnait l'image, et Retour arrière ou Suppr l'effaçait au lieu du caractère. Maintenant (js/editor-nodes.js:createBehindImageClickThroughExtension) le cadre laisse passer les clics quand le
// pointeur est sur un caractère. Ce que scenarios-behind-image-clicks.js ne peut pas voir depuis la page : un clic, un double clic, un triple clic et un glissé de la page ne sont pas ceux d'une souris.
//  - un vrai clic sur un mot posé sur l'image y pose le curseur (l'image n'est pas sélectionnée) ; Retour arrière efface une lettre, jamais l'image ;
//  - un double clic sélectionne le mot, un triple clic la ligne, un glissé plusieurs lignes : toujours du texte, l'image reste là où elle est ;
//  - ailleurs sur l'image (à droite du texte, sous la dernière ligne) un vrai clic la sélectionne comme avant : Suppr l'enlève et elle seule (Ctrl+Z la rend) ;
//  - l'image sélectionnée, un clic sur du texte posé dessus rend la main au texte (curseur, image désélectionnée) ;
//  - la poignée de déplacement de l'image reste attrapable, même à côté d'un mot ; une image devant le texte garde son comportement (un clic dessus la sélectionne, texte dessous ou non).
// Lancé par run-headless.mjs (groupe Node "behindClicksMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-behind-image-clicks-mouse.mjs
// BEHIND_CLICKS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.BEHIND_CLICKS_MOUSE_PORT || 8980);
const SHOTS = process.env.BEHIND_CLICKS_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-floating-image-keys-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-behind-image-clicks-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
  const g = canvas.getContext('2d'); g.fillStyle = '#e4b4b4'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#fff'; g.fillRect(2, 2, 4, 4);
  return canvas.toDataURL('image/png');
};
// Une image en calque, posée sur la page 1 sous les premières lignes de texte (courtes : l'image dépasse le texte à droite et au-dessous, et sa poignée de déplacement tombe sur le bord d'un mot). `left` et `top`
// du style sont comptés depuis le coin de la feuille ; la grille de page (data-page-*) est celle d'une image posée à la souris (1 pt = 4/3 px). Carrée, entière dans le panneau : pas de défilement au passage.
const PJ_ATTRS = ' data-var-table="Clients" data-var-column="Photo" data-var-key="Clients.Photo"';
const floating = (png, layer, attachment) => '<img class="editor-image" src="' + (attachment ? '' : png) + '" alt="" style="width: 120px; height: 120px; position: absolute; left: 35px; top: 62px; z-index: '
  + (layer === 'front' ? 5 : -1) + ';" data-layer="' + layer + '" data-wrap="inline" data-page-index="0" data-page-left-pt="26" data-page-top-pt="47"' + (attachment ? PJ_ATTRS : '') + '>';

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
  console.log(`\n=== Clic sur du texte posé sur une image derrière le texte${attachment ? ' (importée via une colonne PJ)' : ''}, vraie souris, ${WIDTH}x${HEIGHT}, thème ${themeLabel} ===`);
  const { context, page } = await openWidget(theme);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${theme}-${variant}-${name}.png`) }); };
  const png = await page.evaluate(squareImage);

  // Le document en une ligne par paragraphe, chaque image à sa place ; la sélection de ProseMirror (texte sélectionné compris) ; l'écran : le rectangle de l'image en calque (la vue de son cadre) et
  // l'état de son cadre (sélectionné, laissant passer les clics).
  const state = () => page.evaluate(() => {
    const ed = EditorCore.getEditor();
    const lines = [];
    let images = 0;
    ed.state.doc.forEach(block => {
      if (block.type.name !== 'paragraph') { lines.push('<' + block.type.name + '>'); return; }
      let line = '';
      block.forEach(child => {
        if (child.isText) line += child.text;
        else if (child.type.name === 'editorImage') { images++; line += '⟨image⟩'; } else line += '⟨' + child.type.name + '⟩';
      });
      lines.push(line);
    });
    const sel = ed.state.selection;
    const wrap = document.querySelector('.tiptap .editor-image-view.editor-image-layered');
    const r = wrap ? wrap.getBoundingClientRect() : null;
    return {
      text: lines.join(' | '), images, node: sel.node ? sel.node.type.name : null, empty: sel.empty, from: sel.from, to: sel.to,
      selected: ed.state.doc.textBetween(sel.from, sel.to, '|'),
      view: r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null,
      frameSelected: !!wrap && wrap.classList.contains('editor-image-selected'),
      through: !!wrap && wrap.classList.contains('editor-image-click-through'),
      pointerEvents: wrap ? getComputedStyle(wrap).pointerEvents : null,
    };
  });
  const sameSpot = (a, b, tolerance = 1) => !!a && !!b && near(a.left, b.left, tolerance) && near(a.top, b.top, tolerance) && near(a.width, b.width, tolerance) && near(a.height, b.height, tolerance);
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
  // Le rectangle à l'écran du texte (hors image) du paragraphe de rang i.
  const textBox = i => page.evaluate(i => {
    const p = document.querySelectorAll('.tiptap > p')[i];
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const rects = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim() || node.parentElement.closest('.editor-image-view')) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      Array.from(range.getClientRects()).forEach(x => { if (x.width > 0 && x.height > 0) rects.push(x); });
    }
    if (!rects.length) return null;
    return { left: rects[0].left, top: rects[0].top, right: rects[rects.length - 1].right, bottom: rects[rects.length - 1].bottom };
  }, i);
  // Le geste d'une vraie souris : l'approche, puis le clic.
  async function approach(x, y) {
    await page.mouse.move(x - 8, y - 2, { steps: 2 });
    await page.mouse.move(x, y, { steps: 3 });
    await sleep(120);
  }
  async function click(x, y, options) {
    await approach(x, y);
    await page.mouse.click(x, y, options);
    await sleep(250);
  }
  async function press(...keys) { for (const key of keys) { await page.keyboard.press(key); await sleep(180); } }
  // Le milieu du premier mot (« Ligne ») de la ligne i, et un point de l'image où il n'y a pas de texte : à droite des lignes.
  const onWord = async i => { const b = await textBox(i); return { x: b.left + 14, y: (b.top + b.bottom) / 2, box: b }; };
  const onFreeImage = s => ({ x: s.view.left + s.view.width - 24, y: s.view.top + s.view.height / 2 });

  const DOC = F => '<p>Titre' + F + '</p><p>Ligne A</p><p>Ligne B</p><p>Ligne C</p><p>Ligne D</p>';

  for (const layer of ['behind', 'front']) {
    const behind = layer === 'behind';
    const label = `${themeLabel}${attachment ? ', image PJ' : ''}, ${behind ? 'derrière' : 'devant'} le texte`;
    const F = floating(png, layer, attachment);

    // --- 0. Le décor : l'image recouvre bien les lignes de texte ---
    await load(DOC(F));
    let start = await state();
    const lineB = await onWord(2);
    const covered = !!start.view && lineB.x > start.view.left && lineB.x < start.view.left + start.view.width && lineB.y > start.view.top && lineB.y < start.view.top + start.view.height;
    check(`${label} - le décor : l'image recouvre la ligne « Ligne B » (image ${JSON.stringify(start.view)}, mot en ${Math.round(lineB.x)},${Math.round(lineB.y)})`, start.images === 1 && covered, { view: start.view, lineB });
    await snap(`${layer}-0-decor`);

    if (behind) {
      // --- 1. Un vrai clic sur un mot posé sur l'image : le curseur, pas l'image ---
      await click(lineB.x, lineB.y);
      let s = await state();
      check(`${label} - un vrai clic sur le mot « Ligne » de la ligne B y pose le curseur (de ${s.from} à ${s.to}, nœud ${s.node}), l'image n'est pas sélectionnée`, s.empty && s.node === null && !s.frameSelected, s);
      const length = s.text.length;
      await press('Backspace');
      s = await state();
      check(`${label} - Retour arrière efface une lettre de la ligne et pas l'image (« ${s.text} », ${s.images} image)`, s.images === 1 && s.text.length === length - 1, s);
      check(`${label} - l'image n'a pas bougé à l'écran`, sameSpot(s.view, start.view), { avant: start.view, apres: s.view });
      await snap(`${layer}-1-clic-sur-le-texte`);

      // --- 2. Double clic : le mot, triple clic : la ligne ---
      await load(DOC(F));
      start = await state();
      let w = await onWord(2);
      await click(w.x, w.y, { clickCount: 2 });
      s = await state();
      check(`${label} - un double clic sur « Ligne » sélectionne le mot (« ${s.selected} »), pas l'image`, s.node === null && !s.empty && s.selected === 'Ligne' && !s.frameSelected, s);
      await load(DOC(F));
      w = await onWord(2);
      await click(w.x, w.y, { clickCount: 3 });
      s = await state();
      check(`${label} - un triple clic sélectionne la ligne (« ${s.selected} »), pas l'image`, s.node === null && !s.empty && s.selected === 'Ligne B' && !s.frameSelected, s);
      await press('Backspace');
      s = await state();
      check(`${label} - Retour arrière : le texte de la ligne part, l'image reste (« ${s.text} », ${s.images} image)`, s.images === 1 && s.text === 'Titre⟨image⟩ | Ligne A |  | Ligne C | Ligne D', s);
      check(`${label} - l'image est restée à sa place à l'écran`, sameSpot(s.view, start.view), { avant: start.view, apres: s.view });

      // --- 3. Un glissé du mot de la ligne A à la fin de la ligne C : du texte ---
      await load(DOC(F));
      start = await state();
      const a = await onWord(1);
      const c = await onWord(3);
      await approach(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move((a.x + c.x) / 2, (a.y + c.y) / 2, { steps: 4 });
      await page.mouse.move(c.box.right - 4, c.y, { steps: 4 });
      await page.mouse.up();
      await sleep(250);
      s = await state();
      check(`${label} - un glissé de la ligne A à la ligne C sélectionne du texte (« ${s.selected} »), pas l'image`, s.node === null && !s.empty && s.selected.includes('Ligne B') && !s.frameSelected, s);
      await press('Delete');
      s = await state();
      check(`${label} - Suppr efface ce texte, l'image reste (« ${s.text} », ${s.images} image)`, s.images === 1 && !s.text.includes('Ligne B') && s.text.includes('Ligne D'), s);
      check(`${label} - l'image est restée à sa place à l'écran`, sameSpot(s.view, start.view), { avant: start.view, apres: s.view });

      // --- 4. Ailleurs sur l'image : un clic la sélectionne, Suppr l'enlève et elle seule ---
      await load(DOC(F));
      start = await state();
      const free = onFreeImage(start);
      await approach(free.x, free.y);
      s = await state();
      check(`${label} - le pointeur sur l'image, à droite du texte : le cadre ne laisse pas passer les clics (${s.pointerEvents})`, !s.through && s.pointerEvents !== 'none', s);
      await page.mouse.click(free.x, free.y);
      await sleep(250);
      s = await state();
      check(`${label} - un vrai clic sur l'image, là où il n'y a pas de texte, la sélectionne`, s.node === 'editorImage' && s.frameSelected, s);
      await snap(`${layer}-4-image-selectionnee`);
      await press('Delete');
      s = await state();
      check(`${label} - Suppr enlève l'image et elle seule (« ${s.text} »)`, s.images === 0 && s.text === 'Titre | Ligne A | Ligne B | Ligne C | Ligne D', s);
      await press('Control+z');
      s = await state();
      check(`${label} - Ctrl+Z la rend, à sa place`, s.images === 1 && sameSpot(s.view, start.view), { avant: start.view, apres: s.view });

      // --- 5. L'image sélectionnée, un clic sur du texte posé dessus rend la main au texte ---
      await load(DOC(F));
      start = await state();
      const free2 = onFreeImage(start);
      await click(free2.x, free2.y);
      s = await state();
      check(`${label} - l'image est sélectionnée avant le clic sur le texte`, s.node === 'editorImage' && s.frameSelected, s);
      w = await onWord(3);
      await click(w.x, w.y);
      s = await state();
      check(`${label} - un clic sur un mot posé sur l'image sélectionnée y pose le curseur, l'image se désélectionne`, s.node === null && s.empty && !s.frameSelected, s);
      await press('Backspace');
      s = await state();
      check(`${label} - Retour arrière efface une lettre, pas l'image (« ${s.text} »)`, s.images === 1 && s.text.length === 'Titre⟨image⟩ | Ligne A | Ligne B | Ligne C | Ligne D'.length - 1, s);

      // --- 6. Le cadre ne laisse passer les clics que sur un caractère ---
      await load(DOC(F));
      start = await state();
      w = await onWord(2);
      await approach(w.x, w.y);
      s = await state();
      check(`${label} - le pointeur sur un mot : le cadre laisse passer les clics (${s.pointerEvents})`, s.through && s.pointerEvents === 'none', s);
      const f3 = onFreeImage(start);
      await approach(f3.x, f3.y);
      s = await state();
      check(`${label} - le pointeur à droite du texte, sur l'image : plus de passage (${s.pointerEvents})`, !s.through && s.pointerEvents !== 'none', s);
      await approach(w.x, w.y);
      await approach(WIDTH - 30, HEIGHT - 30);
      s = await state();
      check(`${label} - le pointeur hors de l'image : plus de passage (${s.pointerEvents})`, !s.through && s.pointerEvents !== 'none', s);

      // --- 7. La poignée de déplacement reste attrapable, même sur le bord d'un mot ---
      await load(DOC(F));
      start = await state();
      const handle = await page.evaluate(() => { const h = document.querySelector('.tiptap .editor-image-view.editor-image-layered .editor-image-move-handle'); const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await approach(handle.x, handle.y);
      await page.mouse.down();
      await page.mouse.move(handle.x + 30, handle.y + 14, { steps: 5 });
      await page.mouse.up();
      await sleep(300);
      s = await state();
      const dx = s.view.left - start.view.left, dy = s.view.top - start.view.top;
      check(`${label} - la poignée de déplacement attrape l'image : elle suit le glissé (${Math.round(dx)}, ${Math.round(dy)} px pour 30, 14)`, near(dx, 30, 3) && near(dy, 14, 3) && s.images === 1, { dx, dy, s });
      check(`${label} - le glissé de la poignée n'a rien changé au texte (« ${s.text} »)`, s.text === 'Titre⟨image⟩ | Ligne A | Ligne B | Ligne C | Ligne D', s);
      await snap(`${layer}-7-poignee`);
    } else {
      // --- 8. Une image devant le texte garde son comportement : un clic dessus la sélectionne, texte dessous ou non ---
      await click(lineB.x, lineB.y);
      let s = await state();
      check(`${label} - un clic sur le mot « Ligne » sous l'image (devant le texte) la sélectionne, comme avant`, s.node === 'editorImage' && s.frameSelected && !s.through, s);
      await press('Delete');
      s = await state();
      check(`${label} - Suppr enlève l'image et elle seule (« ${s.text} »)`, s.images === 0 && s.text === 'Titre | Ligne A | Ligne B | Ligne C | Ligne D', s);
    }
  }

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
