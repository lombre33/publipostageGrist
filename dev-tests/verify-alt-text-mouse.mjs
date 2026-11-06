#!/usr/bin/env node
// Texte alternatif d'une image (js/alt-text.js, js/floating-toolbars.js, css/alt-text.css) : le panneau de 700x400 d'Antoine, à la VRAIE souris (page.mouse) et au VRAI clavier (frappe, Entrée,
// Ctrl+Z, Ctrl+Alt+Y), en clair, en sombre et en anglais. Ce que scenarios-alt-text.js ne peut pas voir depuis la page :
//  - la barre de l'image, avec son bouton « Texte alternatif… », tient entière dans le panneau et le bouton est au premier plan, avec son icône et son nom ;
//  - un vrai clic sur le bouton ouvre la petite fenêtre : entière dans le panneau, sans défilement, le clavier dans le champ ; ce qu'on y tape se pose à Entrée, la fenêtre se ferme et l'image reste
//    sélectionnée, son bouton allumé ;
//  - un seul Ctrl+Z défait le texte ; Ctrl+Alt+Y (la vraie touche) rouvre la fenêtre sur l'image sélectionnée ; Échap la ferme sans rien écrire ;
//  - la case « Image décorative », cochée à la souris, grise le champ ; valider la pose et allume le bouton ;
//  - les textes d'aide de la fenêtre sont lisibles (4,5:1 au moins).
// Lancé par run-headless.mjs (groupe Node "altTextMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-alt-text-mouse.mjs
// ALT_TEXT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.ALT_TEXT_MOUSE_PORT || 8941);
const SHOTS = process.env.ALT_TEXT_SHOTS || '';
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-alt-text-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const consoleProblems = [];
page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
// Un avertissement de ProseMirror ou de TipTap (sélection invalide, contenu refusé) trahit un geste qui n'a pas la forme attendue : aucun ne doit sortir pendant le parcours.
page.on('console', m => { if ((m.type() === 'warning' || m.type() === 'error') && /TextSelection|Invalid content|RangeError|alt-text|AltText/i.test(m.text())) consoleProblems.push(m.text()); });
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

const rgbOf = css => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || ''); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
const lum = ([r, g, b]) => { const f = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const centerOf = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, selector);
const attrs = () => page.evaluate(() => { let found = null; EditorCore.getEditor().state.doc.descendants(node => { if (!found && node.type.name === 'editorImage') found = { alt: node.attrs.alt, decorative: node.attrs.decorative }; }); return found; });
async function setDoc(doc) {
  await page.evaluate(d => { Editor.setHTML(d); }, doc);
  // La souris repart du bas du panneau : au point de départ de Playwright (0, 0), elle survole la barre d'outils et un volet resterait ouvert sur le document.
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(300);
}
let PNG = null;
async function imageDoc(extra) {
  if (!PNG) PNG = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 160; c.height = 60; const x = c.getContext('2d'); x.fillStyle = '#cbd5e1'; x.fillRect(0, 0, 160, 60); x.fillStyle = '#64748b'; x.fillRect(20, 20, 60, 30); return c.toDataURL('image/png'); });
  return `<p>Avant</p><p><img class="editor-image" src="${PNG}" style="width: 160px"${extra || ''}></p><p>Après</p>`;
}
async function clickImage() {
  const c = await centerOf('.tiptap img.editor-image');
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(300);
}
// La barre de l'image ouverte et son bouton « Texte alternatif… » tels que la souris les voit.
const barState = () => page.evaluate(() => {
  const bar = Array.from(document.querySelectorAll('.v2-floating-toolbar.visible')).find(b => b.querySelector('button[data-action="layer-front"]'));
  if (!bar) return { bar: false };
  const br = bar.getBoundingClientRect();
  const btn = bar.querySelector('button[data-action="alt"]');
  if (!btn) return { bar: true, button: false };
  const r = btn.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  const svg = btn.querySelector('svg');
  return {
    bar: true, button: true, barInPanel: br.left >= -0.5 && br.top >= -0.5 && br.right <= innerWidth + 0.5 && br.bottom <= innerHeight + 0.5, barBox: [br.left, br.top, br.right, br.bottom].map(Math.round),
    x, y, onTop: !!top && (top === btn || btn.contains(top)), inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
    title: btn.title, label: btn.getAttribute('aria-label'), active: btn.classList.contains('is-active'), icon: !!svg && svg.getBoundingClientRect().width > 8,
  };
});
async function clickAltButton() {
  const s = await barState();
  await page.mouse.move(s.x, s.y, { steps: 4 });
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(300);
  return s;
}
// La fenêtre telle que la souris la voit : entière dans le panneau, sans défilement, le clavier dans le champ.
const windowState = () => page.evaluate(() => {
  const overlay = document.getElementById('pp-alt-modal');
  if (!overlay || overlay.style.display === 'none') return { open: false };
  const box = overlay.querySelector('.pp-modal-box');
  const r = box.getBoundingClientRect();
  const input = document.getElementById('pp-alt-text');
  const note = overlay.querySelector('.pp-alt-note');
  const ink = el => { const cs = getComputedStyle(el); return cs.color; };
  const bgOf = el => { let n = el; while (n) { const bg = getComputedStyle(n).backgroundColor; if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg; n = n.parentElement; } return 'rgb(255, 255, 255)'; };
  return {
    open: true, inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, box: [r.left, r.top, r.right, r.bottom].map(Math.round),
    noScroll: box.scrollHeight <= box.clientHeight + 1 && overlay.scrollHeight <= overlay.clientHeight + 1, focusInField: document.activeElement === input, value: input.value, disabled: input.disabled,
    checked: document.getElementById('pp-alt-decorative').checked, title: document.getElementById('pp-alt-title').textContent, label: overlay.querySelector('label.pp-dialog-label').textContent,
    noteInk: ink(note), noteBg: bgOf(note), fieldInk: ink(input), fieldBg: bgOf(input), hint: overlay.querySelector('#pp-alt-hint').textContent,
  };
});
const editorFocused = () => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest && !!document.activeElement.closest('.tiptap'));

async function run(theme) {
  const T = theme;
  const lang = await page.evaluate(() => I18n.getLang());
  const en = lang === 'en';
  // La barre flottante est bâtie au démarrage, en français : un changement de langue recharge la page (Réglages), il ne la retraduit pas ; ici seuls les textes de la fenêtre, écrits à l'ouverture, passent à l'anglais.
  const buttonName = 'Texte alternatif…';
  const windowTitle = en ? 'Alternative text' : 'Texte alternatif';
  const typed = en ? 'Photo of the person' : 'Photo de la personne';

  // 1) Une image : un vrai clic ouvre sa barre, le bouton « Texte alternatif… » y est, dans le panneau, au premier plan, éteint.
  await setDoc(await imageDoc());
  await clickImage();
  const s1 = await barState();
  check(`${T}, image : un clic ouvre la barre de l'image, entière dans le panneau ${WIDTH}x${HEIGHT}`, s1.bar && s1.barInPanel, s1);
  check(`${T}, image : le bouton « ${buttonName} » est visible, au premier plan, avec son icône et son nom, éteint tant que l'image n'est pas décrite`, s1.button && s1.inPanel && s1.onTop && s1.icon && s1.title === buttonName && s1.label === buttonName && !s1.active, s1);
  await snap(`${T}-1-barre-image`);

  // 2) Le clic ouvre la fenêtre : entière, sans défilement, le clavier dans le champ vide.
  await clickAltButton();
  const w2 = await windowState();
  check(`${T}, fenêtre : un clic sur le bouton ouvre « ${windowTitle} », entière dans le panneau et sans défilement`, w2.open && w2.inPanel && w2.noScroll && w2.title === windowTitle, w2);
  check(`${T}, fenêtre : le clavier est dans le champ, vide, la case « Image décorative » décochée`, w2.focusInField && w2.value === '' && !w2.checked && !w2.disabled, w2);
  const noteContrast = contrast(rgbOf(w2.noteInk), rgbOf(w2.noteBg));
  check(`${T}, fenêtre : l'aide sous le champ est lisible (4,5:1 au moins : ${noteContrast.toFixed(2)})`, noteContrast >= 4.5, { ink: w2.noteInk, bg: w2.noteBg });
  await snap(`${T}-2-fenetre`);

  // 3) La frappe réelle, puis Entrée : le texte se pose, la fenêtre se ferme, l'image reste sélectionnée et son bouton s'allume.
  await page.keyboard.type(typed, { delay: 5 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const a3 = await attrs(), s3 = await barState(), w3 = await windowState();
  check(`${T}, texte : Entrée pose « ${typed} » sur l'image et ferme la fenêtre`, a3.alt === typed && !a3.decorative && !w3.open, { a3, open: w3.open });
  check(`${T}, texte : l'image reste sélectionnée, sa barre est revenue et le bouton est allumé ; le clavier est dans l'éditeur`, s3.bar && s3.button && s3.active && (await editorFocused()), s3);

  // 4) Annuler : un seul Ctrl+Z défait le texte ; Rétablir le remet.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  const undone = (await attrs()).alt;
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(250);
  const redone = (await attrs()).alt;
  check(`${T}, texte : un seul Ctrl+Z défait le texte, Ctrl+Maj+Z le remet`, undone === '' && redone === typed, { undone, redone });

  // 5) La vraie touche Ctrl+Alt+Y rouvre la fenêtre sur l'image sélectionnée, avec son texte ; Échap la ferme sans rien écrire.
  await clickImage();
  await page.keyboard.press('Control+Alt+y');
  await page.waitForTimeout(300);
  const w5 = await windowState();
  check(`${T}, touche : Ctrl+Alt+Y ouvre la fenêtre sur l'image sélectionnée, avec son texte, le clavier dans le champ`, w5.open && w5.value === typed && w5.focusInField, w5);
  await page.keyboard.type(' (modifié)', { delay: 5 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const w5b = await windowState();
  check(`${T}, touche : Échap ferme la fenêtre sans rien écrire`, !w5b.open && (await attrs()).alt === typed, { open: w5b.open, alt: (await attrs()).alt });

  // 6) La case « Image décorative », cochée à la vraie souris : le champ se grise ; valider pose la case, le bouton reste allumé.
  await clickImage();
  await clickAltButton();
  const box = await centerOf('#pp-alt-modal .pp-alt-decorative span');
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(200);
  const w6 = await windowState();
  const fieldContrast = contrast(rgbOf(w6.fieldInk), rgbOf(w6.fieldBg));
  check(`${T}, case : un clic sur « Image décorative » coche la case et grise le champ, dont le texte reste lisible (${fieldContrast.toFixed(2)}:1)`, w6.checked && w6.disabled && fieldContrast >= 4.5, { w6 });
  await snap(`${T}-6-decorative`);
  const ok = await centerOf('#pp-alt-modal .var-modal-primary');
  await page.mouse.move(ok.x, ok.y, { steps: 3 });
  await page.mouse.click(ok.x, ok.y);
  await page.waitForTimeout(300);
  const a6 = await attrs(), s6 = await barState();
  check(`${T}, case : valider pose « décorative », vide le texte et laisse le bouton allumé`, a6.decorative === true && a6.alt === '' && s6.button && s6.active, { a6, active: s6.active });

  // 7) Annuler, à la souris : rien n'est écrit.
  await clickAltButton();
  const cancel = await centerOf('#pp-alt-modal .pp-modal-actions button:not(.var-modal-primary)');
  await page.mouse.move(cancel.x, cancel.y, { steps: 3 });
  await page.mouse.click(cancel.x, cancel.y);
  await page.waitForTimeout(250);
  const a7 = await attrs(), w7 = await windowState();
  check(`${T}, annuler : le bouton « Annuler » ferme la fenêtre sans rien changer`, !w7.open && a7.decorative === true && a7.alt === '', { a7, open: w7.open });
}

await run('light');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(250);
await run('dark');
await page.evaluate(() => { I18n.setLang('en'); });
await page.waitForTimeout(300);
await run('anglais');
await page.evaluate(() => I18n.setLang('fr'));

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucun avertissement de ProseMirror (sélection invalide, contenu refusé) pendant le parcours', consoleProblems.length === 0, consoleProblems);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
