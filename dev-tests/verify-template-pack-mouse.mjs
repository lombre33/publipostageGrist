#!/usr/bin/env node
// La galerie « Créer avec ses tables » (js/template-gallery-modal.js, js/template-pack.js) à la vraie souris, à la taille du panneau Grist (~700x400) et dans un cadre étroit (360x400, la moitié d'un écran
// de Grist) : ce que les scénarios de dev-tests/scenarios-template-pack.js (dans la page, sans mise en page vraie) ne mesurent pas. Le modèle d'essai « Test — Modèle avec ses tables » de
// templates-gallery-dev (visible avec ?dev) sert de modèle à pack.
//   1) la carte : vignette contenue en entier (jamais rognée), nom lisible ; un clic ouvre l'aperçu ;
//   2) l'aperçu : le nom sur deux lignes au plus (jamais une lettre par ligne), la ligne des tables et de la page, les pastilles des fonctions, la capture du document à sa taille, « Créer avec ses tables »
//      en bouton principal et « Utiliser ce modèle » en second, tout atteignable et dans la fenêtre ;
//   3) la question : au premier plan, tables et colonnes dites, Annuler (rien n'est créé, l'aperçu reste, le focus revient) puis Créer (les tables existent vides, le modèle est enregistré et ouvert, la galerie se ferme) ;
//   4) une table qui gêne : la fenêtre du refus (un seul bouton « Fermer », atteignable), rien n'est créé ;
//   5) cadre étroit 360x400 : le nom garde sa place, les boutons passent dessous sans déborder, aucun défilement de côté ;
//   6) sombre et anglais : titre, ligne des tables, pastilles, mention des lignes d'exemple et boutons se lisent (4,5:1 au moins).
// Lancé par run-headless.mjs (groupe Node "templatePackMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-template-pack-mouse.mjs
// TEMPLATE_PACK_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TEMPLATE_PACK_MOUSE_PORT || 8917);
const SHOTS = process.env.TEMPLATE_PACK_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
const NAME = 'Test — Modèle avec ses tables';
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-menu-click-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-template-pack-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const nativeDialogs = [];

async function openPage(width, height) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width, height } });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });
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
  await page.goto(`${BASE}/_test-harness.html?dev`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  return page;
}

let page = await openPage(WIDTH, HEIGHT);
const rectOf = (sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, onTop: !!top && (top === e || e.contains(top)) };
}, sel);
const hover = async (sel) => {
  const c = await rectOf(sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 14, c.y - 6, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(150);
  return c;
};
const realClick = async (sel, wait = 250) => { const c = await hover(sel); await page.mouse.click(c.x, c.y); await page.waitForTimeout(wait); return c; };
const away = async () => { await page.mouse.move(page.viewportSize().width / 2, 300, { steps: 6 }); await page.waitForTimeout(250); };
// Ouvre le menu « + » au survol puis descend tout droit sous le bouton avant d'aller à la ligne : le menu reste ouvert tout du long.
async function clickMenuRow(buttonSel, rowSel, wait = 600) {
  const from = await hover(buttonSel);
  const to = await rectOf(rowSel);
  await page.mouse.move(from.x, to.y, { steps: 12 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.waitForTimeout(150);
  await page.mouse.click(to.x, to.y);
  await page.waitForTimeout(wait);
  await away();
}
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };
const shown = (id) => page.evaluate((i) => { const e = document.getElementById(i); return !!e && getComputedStyle(e).display !== 'none' && !e.hidden; }, id);

async function openGallery() {
  await clickMenuRow('#btn-new', '#v2-btn-new-from-template', 800);
  await page.waitForFunction(() => document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card').length > 0, null, { timeout: 8000 });
}
const cardRect = (name) => page.evaluate((n) => {
  const card = Array.from(document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card')).find(c => c.querySelector('.tpl-gallery-card-name').textContent === n);
  if (!card) return null;
  card.scrollIntoView({ block: 'center' }); // une carte plus haute que la liste visible (700x400) : son milieu est la partie qu'on voit
  const r = card.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const img = card.querySelector(':scope > img'); const ir = img.getBoundingClientRect();
  const nameEl = card.querySelector('.tpl-gallery-card-name');
  const nr = nameEl.getBoundingClientRect();
  const lineHeight = parseFloat(getComputedStyle(nameEl).lineHeight) || parseFloat(getComputedStyle(nameEl).fontSize) * 1.3;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: !!top && card.contains(top), capture: img.classList.contains('is-capture'), fit: getComputedStyle(img).objectFit, imgW: ir.width, imgH: ir.height, natW: img.naturalWidth, natH: img.naturalHeight,
    // Le nom se lit en entier : il passe à la ligne (deux lignes au plus) au lieu d'être coupé par des points de suspension, et rien n'en dépasse de la carte.
    nameLines: Math.round(nr.height / lineHeight), nameClipped: nameEl.scrollHeight > nameEl.clientHeight + 1 || nameEl.scrollWidth > nameEl.clientWidth + 1, nameInCard: nr.left >= r.left && nr.right <= r.right + 1 };
}, name);
async function openPreview() {
  const c = await cardRect(NAME);
  if (!c) throw new Error('carte absente : ' + NAME);
  await page.mouse.move(c.x - 10, c.y - 5, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  try {
    await page.waitForFunction(() => { const p = document.getElementById('template-preview-modal'); return p && getComputedStyle(p).display !== 'none' && !document.getElementById('tpl-preview-use-pack').hidden && document.querySelectorAll('#tpl-preview-captures img').length > 0; }, null, { timeout: 8000 });
  } catch (e) {
    await shot('echec-apercu');
    const state = await page.evaluate(() => ({ preview: getComputedStyle(document.getElementById('template-preview-modal')).display, gallery: getComputedStyle(document.getElementById('template-gallery-modal')).display, usePackHidden: document.getElementById('tpl-preview-use-pack').hidden, captures: document.querySelectorAll('#tpl-preview-captures img').length, status: document.getElementById('status-msg').textContent, viewport: [innerWidth, innerHeight] }));
    throw new Error('l’aperçu ne s’ouvre pas après le clic en (' + Math.round(c.x) + ', ' + Math.round(c.y) + ') : ' + JSON.stringify(state));
  }
  await page.waitForTimeout(500);
}
// Tout ce que l'aperçu montre, mesuré : les rectangles, ce qui est au-dessus, ce qui déborde.
const previewState = () => page.evaluate(() => {
  const rect = (el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: !!top && (top === el || el.contains(top)) }; };
  const box = document.querySelector('.template-preview-modal-content');
  const title = document.getElementById('tpl-preview-name');
  const lineHeight = parseFloat(getComputedStyle(title).lineHeight) || parseFloat(getComputedStyle(title).fontSize) * 1.3;
  const body = document.getElementById('tpl-preview-body');
  const img = document.querySelector('#tpl-preview-captures img');
  const buttons = Array.from(document.querySelectorAll('.tpl-preview-actions button')).filter(b => !b.hidden);
  const footer = Array.from(document.querySelectorAll('#template-preview-modal .modal-actions button')).filter(b => !b.hidden);
  const bg = (el) => getComputedStyle(el).backgroundColor;
  return {
    box: rect(box), title: { text: title.textContent, h: title.getBoundingClientRect().height, w: title.getBoundingClientRect().width, lines: Math.round(title.getBoundingClientRect().height / lineHeight) },
    note: document.getElementById('tpl-preview-note').textContent, noteRect: rect(document.getElementById('tpl-preview-note')),
    chips: Array.from(document.querySelectorAll('#tpl-preview-shows .tpl-preview-chip')).map(c => c.textContent),
    chipsInBox: Array.from(document.querySelectorAll('#tpl-preview-shows .tpl-preview-chip')).every(c => { const r = c.getBoundingClientRect(); const b = box.getBoundingClientRect(); return r.left >= b.left - 1 && r.right <= b.right + 1; }),
    img: img ? { ...rect(img), natW: img.naturalWidth, natH: img.naturalHeight, complete: img.complete } : null,
    bodyOverflowX: body.scrollWidth > body.clientWidth + 1,
    buttons: buttons.map(b => ({ label: b.textContent, id: b.id, ...rect(b), bg: bg(b) })),
    footer: footer.map(b => ({ label: b.textContent, ...rect(b) })),
    captureNote: document.getElementById('tpl-preview-capture-note').textContent,
    sheetHidden: document.getElementById('tpl-preview-sheet').hidden,
    hasPack: document.getElementById('template-preview-modal').classList.contains('has-pack'),
  };
});
const insideViewport = (r, w, h) => r.l >= -0.5 && r.t >= -0.5 && r.r <= w + 0.5 && r.b <= h + 0.5;
const dialogState = () => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  if (!ov || getComputedStyle(ov).display === 'none') return { open: false };
  const box = ov.querySelector('.modal-content').getBoundingClientRect();
  const buttons = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden);
  const rects = buttons.map(b => {
    const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { label: b.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: !!top && (top === b || b.contains(top)), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
  });
  const a = document.activeElement;
  const middle = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  const msg = ov.querySelector('.pp-dialog-message');
  return {
    open: true, title: ov.querySelector('h3').textContent, message: msg.textContent, labels: buttons.map(b => b.textContent), rects,
    focus: a && ov.contains(a) ? a.textContent : 'hors de la fenêtre : ' + (a && (a.id || a.className || a.tagName)),
    box: { l: box.left, t: box.top, r: box.right, b: box.bottom }, onTop: !!middle && ov.contains(middle),
    scrolls: msg.scrollHeight > msg.clientHeight + 1,
  };
});
const inPanel = (box, w = WIDTH, h = HEIGHT) => box.l >= 0 && box.t >= 0 && box.r <= w && box.b <= h;
async function clickDialog(label, wait = 600) {
  const s = await dialogState();
  const b = s.open && s.rects.find(r => r.label === label);
  if (!b) throw new Error('bouton « ' + label + ' » absent : ' + JSON.stringify(s));
  await page.mouse.move(b.x - 10, b.y, { steps: 2 }); await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(wait);
}
const doc = () => page.evaluate(() => {
  const st = window.__gristStub.state;
  return {
    tables: st.tables.filter(t => /^Test/.test(t)), rows: st.tables.filter(t => /^Test/.test(t)).map(t => st.rows[t].id.length),
    models: st.rows.Publipostage_Modeles.id.length, rule: !!GristAPI.getLinkRule('TestEvenements'), status: document.getElementById('status-msg').textContent,
    current: Templates.getCurrentId(), name: document.getElementById('template-name').value, addTables: window.__gristStub.countActions('AddTable', 'TestEvenements'),
    editor: document.querySelector('.ProseMirror').textContent,
  };
});
const cleanDocument = () => page.evaluate(async () => {
  const st = window.__gristStub.state;
  const present = ['TestEvenements', 'TestInvites'].filter(t => st.tables.indexOf(t) !== -1);
  if (present.length) await window.__gristStub.applyUserActions(present.map(t => ['RemoveTable', t]));
  try { await GristAPI.deleteLinkRule('TestEvenements'); } catch (e) { /* aucune règle */ }
});
const closeGallery = () => page.evaluate(() => { document.getElementById('template-gallery-modal').style.display = 'none'; document.getElementById('template-preview-modal').style.display = 'none'; });

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 1) et 2) La carte et l'aperçu, 700x400 clair français.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== Panneau 700x400, clair, français ==');
await openGallery();
await shot('1-galerie');
const card = await cardRect(NAME);
check('carte : le modèle à pack est dans la grille, sa vignette est une capture contenue en entier (jamais rognée), son nom se lit en entier (deux lignes au plus)', !!card && card.onTop && card.capture && card.fit === 'contain' && card.natW > 0 && card.imgW > 20 && !card.nameClipped && card.nameLines <= 2 && card.nameInCard, card);
await openPreview();
await shot('2-apercu');
let p = await previewState();
check('aperçu : le nom du modèle tient sur deux lignes au plus (jamais une lettre par ligne)', p.title.text === NAME && p.title.lines <= 2 && p.title.w > 150, p.title);
check('aperçu : la ligne des tables et de la page est là, dans la fenêtre', /TestEvenements, TestInvites/.test(p.note) && /A6 paysage/.test(p.note) && p.noteRect.l >= p.box.l && p.noteRect.r <= p.box.r + 1, { note: p.note, noteRect: p.noteRect, box: p.box });
check('aperçu : une pastille par fonction montrée, toutes dans la fenêtre', JSON.stringify(p.chips) === JSON.stringify(['Code QR', 'Texte conditionnel', 'Format de page']) && p.chipsInBox, p.chips);
check('aperçu : la capture du document est chargée, à son rapport largeur / hauteur (148 x 105), sans déborder, l’aperçu en lecture seule est caché, la mention des lignes d’exemple est là',
  !!p.img && p.img.complete && p.img.natW === 148 && Math.abs(p.img.w / p.img.h - 148 / 105) < 0.02 && p.img.w <= p.box.w && p.sheetHidden && /lignes d’exemple/.test(p.captureNote) && !p.bodyOverflowX, { img: p.img, sheetHidden: p.sheetHidden, note: p.captureNote, overflowX: p.bodyOverflowX });
const useEmpty = p.buttons.find(b => b.id === 'tpl-preview-use-empty');
const usePack = p.buttons.find(b => b.id === 'tpl-preview-use-pack');
check('aperçu : « Utiliser ce modèle » et « Créer avec ses tables » sont atteignables, dans la fenêtre et dans le panneau (pas de « avec une nouvelle table de données »)',
  p.buttons.length === 2 && !!useEmpty && !!usePack && usePack.label === 'Créer avec ses tables' && p.buttons.every(b => b.onTop && insideViewport(b, WIDTH, HEIGHT) && b.l >= p.box.l && b.r <= p.box.r + 1), { buttons: p.buttons.map(b => [b.label, b.onTop, b.l, b.r]), box: p.box });
check('aperçu : « Créer avec ses tables » est le bouton principal (plein), « Utiliser ce modèle » le second (clair)', p.hasPack && !!usePack && !!useEmpty && usePack.bg !== useEmpty.bg && /^rgb\(2[0-9]{2}, 2[0-9]{2}, 2[0-9]{2}\)$|^rgb\(2[34][0-9], 2[34][0-9], 2[34][0-9]\)$/.test(useEmpty.bg), { usePack: usePack && usePack.bg, useEmpty: useEmpty && useEmpty.bg });
check('aperçu : les boutons du bas de la fenêtre sont atteignables', p.footer.length >= 1 && p.footer.every(b => b.onTop && insideViewport(b, WIDTH, HEIGHT)), p.footer);

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 3) La question, Annuler puis Créer.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
const before = await doc();
await realClick('#tpl-preview-use-pack', 600);
let d = await dialogState();
await shot('3-question');
check('question : « Créer les tables du modèle ? » est au premier plan, dans le panneau, dit les deux tables et leurs colonnes et les règles de liaison, sans défilement',
  d.open && d.title === 'Créer les tables du modèle ?' && /2 tables vides/.test(d.message) && /TestEvenements \(4 colonnes, dont 1 de calcul\)/.test(d.message) && /TestInvites \(4 colonnes\)/.test(d.message) && /règles de liaison/.test(d.message) && inPanel(d.box) && d.onTop && !d.scrolls, d);
check('question : Annuler et Créer sont atteignables', d.open && JSON.stringify(d.labels) === JSON.stringify(['Annuler', 'Créer']) && d.rects.every(r => r.onTop && r.inView), d.rects);
check('question : rien n’est créé tant qu’on n’a pas répondu', JSON.stringify(await doc()) === JSON.stringify(before), await doc());
await clickDialog('Annuler');
let after = await doc();
const focusAfterCancel = await page.evaluate(() => document.activeElement && document.activeElement.id);
check('Annuler : fenêtre fermée, aucune table, aucun modèle, aucune règle ; l’aperçu reste ouvert et le focus revient sur « Créer avec ses tables »',
  !(await dialogState()).open && after.tables.length === 0 && after.models === before.models && !after.rule && (await shown('template-preview-modal')) && focusAfterCancel === 'tpl-preview-use-pack', { after, focusAfterCancel });
await realClick('#tpl-preview-use-pack', 600);
await clickDialog('Créer', 1500);
after = await doc();
await shot('4-apres');
check('Créer : les deux tables existent, vides ; la règle de liaison est posée ; un modèle est enregistré et ouvert sous le nom du modèle ; l’aperçu et la galerie se ferment',
  JSON.stringify(after.tables) === '["TestEvenements","TestInvites"]' && after.rows.every(n => n === 0) && after.rule && after.models === before.models + 1 && after.name === NAME && String(after.current) !== 'null'
  && !(await shown('template-preview-modal')) && !(await shown('template-gallery-modal')), after);
check('Créer : le coin d’état dit les tables créées vides, le texte du modèle est dans l’éditeur', /ses tables vides \(TestEvenements, TestInvites\)/.test(after.status) && /VIP/.test(after.editor), { status: after.status, editor: after.editor.slice(0, 80) });

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 4) Une table qui gêne : le refus.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
await cleanDocument();
await page.evaluate(() => window.__gristStub.setVariables('TestInvites', { Nom: 'Text' }));
const beforeConflict = await doc();
await openGallery();
await openPreview();
await realClick('#tpl-preview-use-pack', 700);
d = await dialogState();
await shot('5-refus');
check('refus : la fenêtre dit la table et les colonnes qui manquent, avec un seul bouton « Fermer » atteignable, au premier plan, dans le panneau',
  d.open && d.title === 'Ce modèle ne peut pas être créé ici' && /« TestInvites » existe déjà, mais il lui manque : Code, Categorie, Evenement\./.test(d.message) && JSON.stringify(d.labels) === '["Fermer"]' && d.rects.every(r => r.onTop && r.inView) && inPanel(d.box) && d.onTop, d);
await clickDialog('Fermer');
after = await doc();
check('refus : « Fermer » referme la fenêtre ; aucune table créée, aucun modèle, aucune règle ; l’aperçu reste ouvert', !(await dialogState()).open && after.tables.join() === 'TestInvites' && after.models === beforeConflict.models && !after.rule && (await shown('template-preview-modal')) && after.addTables === beforeConflict.addTables, { after, beforeConflict });
await closeGallery();
await cleanDocument();

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 6) Sombre puis anglais (même cadre 700x400).
// ---------------------------------------------------------------------------------------------------------------------------------------------------
const contrastOf = () => page.evaluate(() => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); const q = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: q[0], g: q[1], b: q[2], a: q.length > 3 ? q[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.a === 1) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const of = (el) => Math.round(ratio(parse(getComputedStyle(el).color), bgOf(el)) * 100) / 100;
  const out = {};
  out.title = of(document.getElementById('tpl-preview-name'));
  out.note = of(document.getElementById('tpl-preview-note'));
  out.shows = of(document.querySelector('.tpl-preview-shows-label'));
  out.chip = of(document.querySelector('.tpl-preview-chip'));
  out.captureNote = of(document.getElementById('tpl-preview-capture-note'));
  document.querySelectorAll('.tpl-preview-actions button').forEach(b => { if (!b.hidden) out[b.id] = of(b); });
  return out;
});
for (const [theme, lang] of [['dark', 'fr'], ['light', 'en'], ['dark', 'en']]) {
  const T = `${theme === 'dark' ? 'sombre' : 'clair'}, ${lang === 'en' ? 'anglais' : 'français'}`;
  await page.evaluate(([t, l]) => { Settings.setTheme(t); I18n.setLang(l); }, [theme, lang]);
  await page.waitForTimeout(300);
  await openGallery();
  await openPreview();
  p = await previewState();
  const c = await contrastOf();
  const button = lang === 'en' ? 'Create with its tables' : 'Créer avec ses tables';
  const chips = lang === 'en' ? ['QR code', 'Conditional text', 'Page size'] : ['Code QR', 'Texte conditionnel', 'Format de page'];
  check(`${T} : l’aperçu tient dans le panneau, le bouton, les pastilles et la ligne des tables sont dans la langue, tout est atteignable`, JSON.stringify(p.chips) === JSON.stringify(chips) && p.buttons.some(b => b.label === button) && p.buttons.every(b => b.onTop && insideViewport(b, WIDTH, HEIGHT)) && p.title.lines <= 2 && (lang === 'en' ? /A6 page, landscape/.test(p.note) : /A6 paysage/.test(p.note)), { chips: p.chips, buttons: p.buttons.map(b => b.label), note: p.note, lines: p.title.lines });
  check(`${T} : titre, ligne des tables, pastilles, mention des lignes d’exemple et boutons se lisent (4,5:1 au moins)`, Object.values(c).every(v => v >= 4.5), c);
  await shot(`6-${theme}-${lang}`);
  await closeGallery();
}
await page.evaluate(() => { Settings.setTheme('light'); I18n.setLang('fr'); });
await page.context().close();

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 5) Cadre étroit 360x400 : la moitié d'un écran de Grist.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== Cadre étroit 360x400, clair, français ==');
page = await openPage(360, 400);
await openGallery();
const narrowCard = await cardRect(NAME);
await openPreview();
await shot('7-etroit');
p = await previewState();
check('cadre étroit : la carte se lit et le nom du modèle garde sa place (trois lignes au plus, jamais une lettre par ligne)', !!narrowCard && narrowCard.onTop && p.title.lines <= 3 && p.title.w > 150, { title: p.title, narrowCard });
check('cadre étroit : les boutons passent sous le titre, restent dans la fenêtre et atteignables, sans défilement de côté', p.buttons.length === 2 && p.buttons.every(b => b.onTop && insideViewport(b, 360, 400) && b.l >= p.box.l && b.r <= p.box.r + 1) && !p.bodyOverflowX, { buttons: p.buttons.map(b => [b.label, Math.round(b.l), Math.round(b.r), b.onTop]), box: p.box, overflowX: p.bodyOverflowX });
check('cadre étroit : pastilles et capture restent dans la fenêtre', p.chipsInBox && !!p.img && p.img.w <= p.box.w && p.img.r <= p.box.r + 1, { chipsInBox: p.chipsInBox, img: p.img });
await closeGallery();
await page.context().close();

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
