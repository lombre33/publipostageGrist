#!/usr/bin/env node
// Légende sous une image ou un tableau (js/caption.js, js/floating-toolbars.js, css/caption.css) : le panneau de 700x400 d'Antoine, à la VRAIE souris (page.mouse) et au VRAI clavier
// (frappe, Entrée, Retour arrière, Ctrl+Z), en clair, en sombre et en anglais. Ce que scenarios-caption.js ne peut pas voir depuis la page :
//  - la barre de l'image et celle du tableau, avec leur bouton « Légende », tiennent entières dans le panneau et sont au premier plan (rien ne les recouvre) ;
//  - un vrai clic sur le bouton pose la légende sous le bloc, le curseur dedans et le clavier dans l'éditeur ; le texte d'attente « Légende… » est lisible (4,5:1) et part à la frappe ;
//  - la légende tapée est en petit, italique, gris ; Entrée à sa fin ouvre un paragraphe ordinaire ;
//  - avec une légende, le bouton est actif et ramène le curseur à la fin sans en ajouter une autre ;
//  - un seul Ctrl+Z retire la légende posée, un Retour arrière dans la légende vide la retire et le curseur reste dans le document ;
//  - le bouton grisé (image devant le texte) est là, atténué, avec sa raison pour nom, et son clic ne change rien.
// Lancé par run-headless.mjs (groupe Node "captionMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-caption-mouse.mjs
// CAPTION_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.CAPTION_MOUSE_PORT || 8940);
const SHOTS = process.env.CAPTION_SHOTS || '';
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
if (!OFFLINE) console.log('[verify-caption-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
page.on('console', m => { if ((m.type() === 'warning' || m.type() === 'error') && /TextSelection|Invalid content|RangeError|caption/i.test(m.text())) consoleProblems.push(m.text()); });
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

const WHITE = [255, 255, 255];
const rgbOf = css => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || ''); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
const lum = ([r, g, b]) => { const f = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const centerOf = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
}, selector);
const html = () => page.evaluate(() => Editor.getHTML());

// Les deux barres flottantes : celle d'une image (elle seule a « layer-front ») et celle d'un tableau (« table-del »).
const MARKER = { image: 'layer-front', table: 'table-del' };
// La barre ouverte et son bouton « Légende » tels que la souris les voit : dans le panneau, au premier plan, et leur état.
const captionState = kind => page.evaluate(marker => {
  const bar = Array.from(document.querySelectorAll('.v2-floating-toolbar.visible')).find(b => b.querySelector(`button[data-action="${marker}"]`));
  if (!bar) return { bar: false };
  const br = bar.getBoundingClientRect();
  const btn = bar.querySelector('button[data-action="caption"]');
  const r = btn.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  const svg = btn.querySelector('svg');
  const cs = getComputedStyle(btn);
  return {
    bar: true, barInPanel: br.left >= -0.5 && br.top >= -0.5 && br.right <= innerWidth + 0.5 && br.bottom <= innerHeight + 0.5, barBox: [br.left, br.top, br.right, br.bottom].map(Math.round),
    x, y, w: r.width, h: r.height, onTop: !!top && (top === btn || btn.contains(top)), inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
    title: btn.title, label: btn.getAttribute('aria-label'), active: btn.classList.contains('is-active'), disabled: btn.classList.contains('is-disabled'), aria: btn.getAttribute('aria-disabled'),
    opacity: Number(cs.opacity), icon: !!svg && svg.getBoundingClientRect().width > 8, bg: cs.backgroundColor,
  };
}, MARKER[kind]);
async function clickCaptionButton(kind) {
  const s = await captionState(kind);
  await page.mouse.move(s.x, s.y, { steps: 4 });
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(250);
  return s;
}
// Le document, vu d'un coup d'œil : « p:Avant | p:img | p*: | p:Après » (« * » : légende ; « img » : le paragraphe porte l'image) - même écriture que dev-tests/scenarios-caption.js.
const outline = () => page.evaluate(() => {
  const SHORT = { tableRow: 'row', tableCell: 'cell' };
  const walk = (parent, sep) => {
    const parts = [];
    parent.forEach(child => {
      const name = child.type.name;
      if (name === 'paragraph') {
        let img = false;
        child.descendants(n => { if (n.type.name === 'editorImage') img = true; });
        parts.push('p' + (child.attrs.caption ? '*' : '') + ':' + (img ? 'img' : child.textContent) + (img && child.textContent ? child.textContent : ''));
      } else if (child.childCount && !child.isTextblock) parts.push((SHORT[name] || name) + '[' + walk(child, ', ') + ']');
      else parts.push(name);
    });
    return parts.join(sep);
  };
  return walk(EditorCore.getEditor().state.doc, ' | ');
});
const caret = () => page.evaluate(() => {
  const sel = EditorCore.getEditor().state.selection;
  const p = sel.$from.parent;
  return { type: sel.toJSON().type, empty: sel.empty, parent: p.type.name, caption: !!p.attrs.caption, text: p.textContent, atEnd: sel.$from.parentOffset === p.content.size, focus: !!document.activeElement && !!document.activeElement.closest('.tiptap') };
});
// La légende vue de l'éditeur : style calculé, texte d'attente, place prise.
const captionView = () => page.evaluate(() => {
  const el = document.querySelector('.tiptap p[data-caption="true"]');
  if (!el) return null;
  const cs = getComputedStyle(el), before = getComputedStyle(el, '::before'), r = el.getBoundingClientRect();
  const sheet = (() => { let n = el; while (n) { const bg = getComputedStyle(n).backgroundColor; if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg; n = n.parentElement; } return 'rgb(255, 255, 255)'; })();
  return { size: cs.fontSize, italic: cs.fontStyle, color: cs.color, text: el.textContent, empty: el.classList.contains('caption-empty'), placeholder: el.getAttribute('data-caption-placeholder'), beforeContent: before.content, beforeColor: before.color, height: r.height, sheet };
});
const plainStyle = text => page.evaluate(t => {
  const p = Array.from(document.querySelectorAll('.tiptap p')).find(e => e.textContent === t && !e.hasAttribute('data-caption'));
  if (!p) return null;
  const cs = getComputedStyle(p);
  return { size: cs.fontSize, italic: cs.fontStyle, color: cs.color };
}, text);
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
  // La souris repart du bas du panneau : au point de départ de Playwright (0, 0), elle survole la barre d'outils et un volet resterait ouvert sur le document.
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(300);
}
let PNG = null;
async function imageDoc(attrs) {
  if (!PNG) PNG = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 160; c.height = 60; const x = c.getContext('2d'); x.fillStyle = '#cbd5e1'; x.fillRect(0, 0, 160, 60); x.fillStyle = '#64748b'; x.fillRect(10, 10, 40, 40); return c.toDataURL('image/png'); });
  return `<p>Avant</p><p><img class="editor-image" src="${PNG}" style="width: 160px"${attrs || ''}></p><p>Après</p>`;
}
const TABLE_DOC = '<p>Avant</p><table><tbody><tr><td><p>Case A</p></td><td><p>Case B</p></td></tr></tbody></table><p>Après</p>';
// Un vrai clic sur l'image : la sélection de nœud ouvre la barre de l'image.
async function clickImage() {
  const c = await centerOf('.tiptap img.editor-image');
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(300);
}
async function clickText(text) {
  const p = await pointOf(text);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
}
// Redonne le clavier à l'éditeur sans rien sélectionner : un clic dans « Avant ».
async function resetFocus() {
  await clickText('Avant');
  await page.keyboard.press('End');
}

async function run(theme) {
  const T = theme;
  const lang = await page.evaluate(() => I18n.getLang());
  const en = lang === 'en';
  const addImage = en ? 'Add a caption under the image' : 'Ajouter une légende sous l’image';
  const addTable = en ? 'Add a caption under the table' : 'Ajouter une légende sous le tableau';
  const goTo = en ? 'Go to the caption' : 'Aller à la légende';
  const placeholder = en ? 'Caption…' : 'Légende…';
  const typed = en ? 'Figure one: the diagram' : 'Figure un : le schéma';

  // 1) Une image : un vrai clic ouvre sa barre, le bouton « Légende » y est, dans le panneau, au premier plan, avec son nom.
  await setDoc(await imageDoc());
  await clickImage();
  const s1 = await captionState('image');
  check(`${T}, image : un clic ouvre la barre de l'image, entière dans le panneau ${WIDTH}x${HEIGHT}`, s1.bar && s1.barInPanel, s1);
  check(`${T}, image : le bouton « Légende » est visible, au premier plan, avec son icône et son nom (« ${addImage} »), ni actif ni grisé`, s1.bar && s1.inPanel && s1.onTop && s1.icon && s1.title === addImage && s1.label === addImage && !s1.active && !s1.disabled && s1.aria === 'false' && s1.opacity === 1, s1);
  await snap(`${T}-1-barre-image`);
  // La barre garde la largeur qu'elle avait sans le bouton (511 px) : la glissière d'opacité rend les 32 px du bouton. Plus large, elle passait à ~700 px sur le milieu de « Tout accepter »
  // (la bande du suivi, quand l'image est tout en haut de la page) et le vrai clic n'y arrivait plus - cf. dev-tests/verify-image-arrows-keyboard.mjs.
  const w1 = await page.evaluate(() => {
    const bar = Array.from(document.querySelectorAll('.v2-floating-toolbar.visible')).find(b => b.querySelector('button[data-action="layer-front"]'));
    const slider = bar && bar.querySelector('input[data-role="opacity"]');
    const accept = document.getElementById('v2-btn-accept-all');
    const a = accept && accept.getBoundingClientRect();
    const hit = a && document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);
    return { bar: bar ? Math.round(bar.getBoundingClientRect().width) : 0, slider: slider ? Math.round(slider.getBoundingClientRect().width) : 0, acceptCovered: !!hit && !!bar && bar.contains(hit) };
  });
  check(`${T}, image : la barre garde sa largeur d'avant le bouton « Légende » (511 px, glissière d'opacité de 97 px) et ne recouvre pas « Tout accepter »`, w1.bar >= 509 && w1.bar <= 513 && w1.slider === 97 && !w1.acceptCovered, w1);

  // 2) Le clic pose la légende sous l'image, le curseur dedans, le texte d'attente lisible.
  await clickCaptionButton('image');
  const o2 = await outline(), c2 = await caret(), v2 = await captionView();
  check(`${T}, image : un clic sur « Légende » pose une légende vide sous l'image, avant « Après »`, o2 === 'p:Avant | p:img | p*: | p:Après', o2);
  check(`${T}, image : le curseur est dans la légende et le clavier dans l'éditeur`, c2.caption && c2.empty && c2.focus, c2);
  check(`${T}, image : le texte d'attente « ${placeholder} » est écrit dans la légende vide, lisible (4,5:1 au moins sur la feuille) et la légende garde sa ligne`, !!v2 && v2.empty && v2.placeholder === placeholder && v2.beforeContent === `"${placeholder}"` && contrast(rgbOf(v2.beforeColor), rgbOf(v2.sheet)) >= 4.5 && v2.height >= 14, { v2, ratio: v2 && contrast(rgbOf(v2.beforeColor), rgbOf(v2.sheet)) });
  await snap(`${T}-2-legende-vide`);

  // 3) À la frappe : le texte d'attente part, la légende est en petit, italique, gris ; Entrée ouvre un paragraphe ordinaire.
  await page.keyboard.type(typed, { delay: 5 });
  await page.waitForTimeout(150);
  const v3 = await captionView();
  check(`${T}, image : à la frappe le texte d'attente disparaît ; la légende est en 12 px, italique, gris #595959 (7:1 sur la feuille)`, !!v3 && v3.text === typed && !v3.empty && v3.size === '12px' && v3.italic === 'italic' && v3.color === 'rgb(89, 89, 89)' && contrast(rgbOf(v3.color), rgbOf(v3.sheet)) >= 4.5, v3);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Suite', { delay: 5 });
  await page.waitForTimeout(150);
  const o3 = await outline(), plain3 = await plainStyle('Suite');
  check(`${T}, image : Entrée à la fin de la légende ouvre un paragraphe ordinaire, au style ordinaire (14 px, droit)`, o3 === `p:Avant | p:img | p*:${typed} | p:Suite | p:Après` && !!plain3 && plain3.size === '14px' && plain3.italic === 'normal', { o3, plain3 });
  await snap(`${T}-3-legende-tapee`);

  // 4) Un second clic sur l'image : le bouton est actif, un clic ramène le curseur à la fin de la légende.
  await clickImage();
  const s4 = await captionState('image');
  check(`${T}, image : avec une légende, le bouton est actif et dit « ${goTo} »`, s4.bar && s4.active && !s4.disabled && s4.title === goTo, s4);
  await clickCaptionButton('image');
  const c4 = await caret();
  check(`${T}, image : un clic sur le bouton actif ramène le curseur à la fin de la légende, sans rien ajouter`, c4.caption && c4.atEnd && c4.text === typed && (await outline()) === `p:Avant | p:img | p*:${typed} | p:Suite | p:Après`, c4);
  await page.keyboard.type(' !', { delay: 5 });
  check(`${T}, image : la frappe qui suit tombe dans la légende`, (await outline()) === `p:Avant | p:img | p*:${typed} ! | p:Suite | p:Après`, await outline());

  // 5) Annuler (Ctrl+Z réel) retire la légende posée d'un coup ; Rétablir la remet.
  await setDoc(await imageDoc());
  await clickImage();
  await clickCaptionButton('image');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  const undone = await outline();
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(250);
  const redone = await outline();
  check(`${T}, image : un seul Ctrl+Z retire la légende posée, Ctrl+Maj+Z la remet`, undone === 'p:Avant | p:img | p:Après' && redone === 'p:Avant | p:img | p*: | p:Après', { undone, redone });

  // 6) Retour arrière dans la légende vide : elle part, le curseur revient à la fin du paragraphe de l'image.
  await setDoc(await imageDoc());
  await clickImage();
  await clickCaptionButton('image');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(250);
  const c6 = await caret();
  check(`${T}, image : Retour arrière dans la légende vide la retire et rend le curseur au paragraphe de l'image`, (await outline()) === 'p:Avant | p:img | p:Après' && c6.parent === 'paragraph' && !c6.caption && c6.atEnd && c6.focus, { outline: await outline(), c6 });

  // 7) Un tableau : un clic dans une case ouvre sa barre, le bouton y est ; la légende se pose sous le tableau.
  await setDoc(TABLE_DOC);
  await clickText('Case B');
  const s7 = await captionState('table');
  check(`${T}, tableau : la barre du tableau est entière dans le panneau et son bouton « Légende » visible, au premier plan, nommé « ${addTable} »`, s7.bar && s7.barInPanel && s7.inPanel && s7.onTop && s7.icon && s7.title === addTable && !s7.active && !s7.disabled, s7);
  await snap(`${T}-7-barre-tableau`);
  await clickCaptionButton('table');
  const o7 = await outline(), c7 = await caret();
  check(`${T}, tableau : un clic sur « Légende » pose la légende sous le tableau, avant « Après », le curseur dedans`, o7 === 'p:Avant | table[row[cell[p:Case A], cell[p:Case B]]] | p*: | p:Après' && c7.caption && c7.empty && c7.focus, { o7, c7 });
  await page.keyboard.type(en ? 'Table one' : 'Tableau un', { delay: 5 });
  const v7 = await captionView();
  check(`${T}, tableau : le texte tapé est en 12 px, italique, gris`, !!v7 && v7.size === '12px' && v7.italic === 'italic' && v7.color === 'rgb(89, 89, 89)', v7);
  await clickText('Case A');
  const s7b = await captionState('table');
  check(`${T}, tableau : avec une légende, le bouton est actif (« ${goTo} ») ; un clic y ramène le curseur`, s7b.bar && s7b.active && s7b.title === goTo, s7b);
  await clickCaptionButton('table');
  const c7b = await caret();
  check(`${T}, tableau : le curseur est à la fin de la légende, aucune autre n'a été ajoutée`, c7b.caption && c7b.atEnd && (await page.evaluate(() => document.querySelectorAll('.tiptap p[data-caption="true"]').length)) === 1, c7b);

  // 8) Retour arrière dans la légende vide d'un tableau : elle part, le curseur reste dans le tableau ou juste après, jamais perdu.
  await setDoc(TABLE_DOC);
  await clickText('Case B');
  await clickCaptionButton('table');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(250);
  const c8 = await caret();
  check(`${T}, tableau : Retour arrière dans la légende vide la retire, le curseur reste dans le document`, (await outline()) === 'p:Avant | table[row[cell[p:Case A], cell[p:Case B]]] | p:Après' && c8.focus && !c8.caption, { outline: await outline(), c8 });
  await page.keyboard.type('x', { delay: 5 });
  check(`${T}, tableau : la frappe qui suit tombe dans un paragraphe ordinaire, jamais dans une légende`, (await page.evaluate(() => document.querySelectorAll('.tiptap p[data-caption="true"]').length)) === 0, await outline());

  // 9) Grisé, jamais retiré : une image devant le texte n'a pas de « dessous » ; le bouton le dit et un clic ne change rien.
  await setDoc(await imageDoc(' data-layer="front"'));
  await clickImage();
  const s9 = await captionState('image');
  check(`${T}, image devant le texte : le bouton « Légende » est là, grisé (aria-disabled), avec sa raison pour nom`, s9.bar && s9.inPanel && s9.disabled && s9.aria === 'true' && s9.opacity < 0.5 && s9.title === (en ? 'No caption for an image in front of or behind the text' : 'Pas de légende pour une image devant ou derrière le texte'), s9);
  const before9 = await html();
  await clickCaptionButton('image');
  check(`${T}, image devant le texte : un clic sur le bouton grisé ne change rien`, (await html()) === before9, await outline());
  await snap(`${T}-9-grise`);
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
