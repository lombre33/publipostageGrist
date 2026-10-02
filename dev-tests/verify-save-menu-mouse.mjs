#!/usr/bin/env node
// Retours d'Antoine du 2026-10-01 sur le bouton Enregistrer (points 5 et 6), à la VRAIE souris et au vrai clavier, à la taille du panneau Grist d'Antoine (~700x400), en clair puis
// en sombre : les scénarios de dev-tests/scenarios-toolbar-chrome.js et scenarios-autosave.js tournent DANS la page (dispatchEvent, :hover jamais actif) et ne prouvent ni que le
// menu s'ouvre au survol sous le bouton et y reste quand la souris descend vers une ligne, ni qu'il se referme une fois la souris partie après un clic (le bouton cliqué gardait le
// focus, donc son menu, avec :focus-within), ni que le curseur reste dans le texte après un clic sur Enregistrer.
//   1) le menu : s'ouvre au survol sous le bouton, tient dans la fenêtre, titre « Enregistrer (Ctrl+S) », « Enregistrer sous… » et « Enregistrement automatique » avec sa coche, plus
//      de bouton « Enregistrer sous » ni de bascule dans la barre, la barre garde sa hauteur ;
//   2) un clic sur Enregistrer enregistre (une seule action), le focus et le curseur restent dans le texte (la frappe suivante y arrive), le menu ne reste pas ouvert souris partie ;
//   3) la ligne « Enregistrement automatique » : cochée au départ, un vrai clic la décoche (coche disparue, choix gardé après rechargement, plus aucune écriture automatique, Enregistrer
//      écrit toujours), la recoche et la modification en attente part ; au rechargement, coupée, le bouton est noir et blanc dès la PREMIÈRE image rendue (image par image, et pixel du rendu
//      réel) : il était peint en bleu jusqu'à la fin des scripts, puis fondait vers le noir ;
//   4) « Enregistrer sous… » au vrai clic : la fenêtre s'ouvre, Entrée crée la copie sous le nom tapé (l'original reste), Échap n'en crée pas et rend le focus là où il était ;
//      renommer puis cliquer Enregistrer : le champ de nom se referme (il perd le focus comme avant) et le nouveau nom est enregistré ;
//   5) au clavier : Tab depuis Enregistrer descend dans le menu (anneau de focus visible), dans l'ordre, puis sort ; Entrée sur « Enregistrer sous… » ouvre la fenêtre, le focus revient au
//      bouton Enregistrer ; Espace sur la case la bascule ; Entrée sur le bouton enregistre ;
//   6) interface en anglais : « Save (Ctrl+S) », « Save as… », « Auto-save » ;
//   7) l'indicateur de la carte « Les deux » (01/10) : enregistrement automatique coupé, une frappe écrit « Modifications non enregistrées. » dans le coin d'état - en entier à 700 px,
//      sans changer la hauteur de la barre, d'une couleur plus soutenue que les autres messages -, il tient 3 s sans qu'une écriture parte, un clic sur Enregistrer le remplace par
//      « Enregistré à… » ; à 860 px, où le coin partage la première ligne et coupe le texte, le message entier s'affiche au survol.
// Lancé par run-headless.mjs (groupe Node "saveMenuMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-save-menu-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.SAVE_MENU_MOUSE_PORT || 8909);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-wheel-scroll.mjs.
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
if (!OFFLINE) console.log('[verify-save-menu-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const TEMPLATES = `
    const m = stub.state.rows.Publipostage_Modeles;
    const add = (id, nom, html, def) => { m.id.push(id); m.Nom.push(nom); m.Contenu.push(html); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(def); };
    add(1, 'Bail habitation', '<p>a</p>', false); add(2, 'Contrat de vente', '<p>b</p>', true); add(3, 'Avenant loyer', '<p>c</p>', false);
    add(4, 'Mise en demeure', '<p>d</p>', false); add(5, 'Quittance', '<p>e</p>', false); add(6, 'Sans dossier', '<p>f</p>', false);
    stub.state.nextRowId.Publipostage_Modeles = 7;
`;

async function openPage(extraSeed) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
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
  await page.addInitScript(`window.__preSeedGristStub = (stub) => { ${TEMPLATES} ${extraSeed || ''} };`);
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  return page;
}


import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
const SHOTS = process.env.SAVE_MENU_SHOTS || mkdtempSync(join(tmpdir(), 'save-menu-'));
mkdirSync(SHOTS, { recursive: true });

const rectOf = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, onTop: !!top && (top === e || e.contains(top)) };
}, sel);
async function realClick(page, sel, wait = 250) {
  const c = await rectOf(page, sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 3 }); await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(wait);
  return c;
}
const flyOpen = (page) => page.evaluate(() => getComputedStyle(document.getElementById('v2-save-flyout')).display !== 'none');
const expandedOf = (page) => page.evaluate(() => document.getElementById('btn-save').getAttribute('aria-expanded'));
const autoState = (page) => page.evaluate(() => {
  const r = document.getElementById('v2-btn-autosave');
  let stored; try { stored = localStorage.getItem('pp_autosave_enabled'); } catch (e) { stored = 'indisponible'; }
  return { checked: r.getAttribute('aria-checked'), tick: getComputedStyle(r, '::after').visibility, stored, status: document.getElementById('status-msg').textContent,
    open: getComputedStyle(document.getElementById('v2-save-flyout')).display, focus: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null };
});
const names = (page) => page.evaluate(() => window.__gristStub.state.rows.Publipostage_Modeles.Nom.slice());
// L'aspect du bouton Enregistrer : bleu et blanc enregistrement automatique allumé, noir et blanc classique coupé (retour d'Antoine du 01/10). Les couleurs attendues se lisent sur les
// jetons du thème en cours (--accent-solid, --solid-neutral), pas en dur : clair et sombre passent par le même contrôle.
const saveLook = (page) => page.evaluate(() => {
  const b = document.getElementById('btn-save'), cs = getComputedStyle(b), r = b.getBoundingClientRect();
  const token = (v) => { const p = document.createElement('i'); p.style.background = v; document.body.appendChild(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c; };
  return { off: b.classList.contains('is-autosave-off'), bg: cs.backgroundColor, color: cs.color, glyph: getComputedStyle(b, '::before').backgroundColor, border: cs.borderTopColor,
    blue: token('var(--accent-solid)'), neutral: token('var(--solid-neutral)'), neutralHover: token('var(--solid-neutral-hover)'), neutralBorder: token('var(--solid-neutral-border)'),
    w: Math.round(r.width), h: Math.round(r.height) };
});
const WHITE = 'rgb(255, 255, 255)';
const contentOf = (page, name) => page.evaluate((n) => { const m = window.__gristStub.state.rows.Publipostage_Modeles; const i = m.Nom.indexOf(n); return i === -1 ? null : String(m.Contenu[i]); }, name);
const updates = (page) => page.evaluate(() => window.__gristStub.countActions('UpdateRecord', 'Publipostage_Modeles'));
const statusOf = (page) => page.evaluate(() => document.getElementById('status-msg').textContent);
const inEditor = (page) => page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest && !!a.closest('.ProseMirror'); });
const activeId = (page) => page.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) : null; });
const editorText = (page) => page.evaluate(() => document.querySelector('.ProseMirror').textContent);
const dialogState = (page) => page.evaluate(() => {
  const m = document.getElementById('pp-dialog-modal'); if (!m || getComputedStyle(m).display === 'none') return { shown: false };
  const input = m.querySelector('.pp-dialog-input');
  return { shown: true, title: m.querySelector('h3').textContent, label: (m.querySelector('.pp-dialog-label') || {}).textContent, inputFocused: document.activeElement === input };
});
// Le survol réel de Enregistrer : approche en deux temps, puis le menu s'ouvre dessous.
async function hoverSave(page) {
  const c = await rectOf(page, '#btn-save');
  await page.mouse.move(c.x - 16, c.y - 8, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(150);
  return c;
}
// Descente LENTE de la souris du bouton vers une ligne du menu (le menu doit rester ouvert tout du long : pont de survol) : tout droit sous le bouton, puis vers la ligne.
async function slideTo(page, sel) {
  const from = await rectOf(page, '#btn-save');
  await page.mouse.move(from.x, from.y);
  const to = await rectOf(page, sel);
  await page.mouse.move(from.x, to.y, { steps: 14 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.waitForTimeout(150);
  return to;
}
async function clickMenuRow(page, sel, wait = 300) {
  await hoverSave(page);
  const to = await slideTo(page, sel);
  await page.mouse.click(to.x, to.y);
  await page.waitForTimeout(wait);
  return to;
}
const away = (page) => page.mouse.move(350, 340, { steps: 6 });

for (const theme of ['light', 'dark']) {
  const T = theme === 'light' ? 'clair' : 'sombre';
  console.log(`\n== Thème ${T} ==`);
  const page = await openPage('');
  await page.evaluate((t) => Settings.setTheme(t), theme);
  await page.waitForTimeout(200);

  // 1) la barre et le menu
  const bar = await page.evaluate(() => ({
    oldSaveAs: !!document.getElementById('btn-save-as'), oldToggle: !!document.getElementById('v2-autosave-toggle'), tip: document.getElementById('btn-save').hasAttribute('data-tip'),
    checked: document.getElementById('v2-btn-autosave').getAttribute('aria-checked'), stored: (() => { try { return localStorage.getItem('pp_autosave_enabled'); } catch (e) { return 'x'; } })(),
    saveInGroup: document.getElementById('btn-save').parentElement.id,
  }));
  check(`${T} : plus de bouton « Enregistrer sous » ni de bascule dans la barre, et Enregistrer n’a plus d’info-bulle qui se superposerait au menu`, !bar.oldSaveAs && !bar.oldToggle && !bar.tip && bar.saveInGroup === 'v2-save-group', bar);
  check(`${T} : l’enregistrement automatique est coché au départ, sans rien dans localStorage (activé par défaut)`, bar.checked === 'true' && bar.stored === null, bar);
  const onLook = await saveLook(page);
  check(`${T} : enregistrement automatique allumé, le bouton Enregistrer est bleu et blanc (fond --accent-solid, glyphe blanc), sans la classe du noir et blanc`, !onLook.off && onLook.bg === onLook.blue && onLook.glyph === WHITE && onLook.color === WHITE, onLook);
  check(`${T} : au repos le menu est fermé`, !(await flyOpen(page)) && (await expandedOf(page)) !== 'true');
  await hoverSave(page);
  const look = await page.evaluate(() => {
    const el = (id) => document.getElementById(id);
    const f = el('v2-save-flyout'), fr = f.getBoundingClientRect();
    const r = (id) => { const b = el(id).getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { h: b.height, onTop: !!top && (top === el(id) || el(id).contains(top)) }; };
    return { display: getComputedStyle(f).display, l: fr.left, t: fr.top, r: fr.right, b: fr.bottom, vw: innerWidth, vh: innerHeight, saveB: el('btn-save').getBoundingClientRect().bottom,
      title: el('v2-save-flyout-label').textContent, saveAs: r('v2-btn-save-as'), auto: r('v2-btn-autosave'), tick: getComputedStyle(el('v2-btn-autosave'), '::after').visibility,
      size: parseFloat(getComputedStyle(el('v2-btn-save-as')).fontSize), expanded: el('btn-save').getAttribute('aria-expanded') };
  });
  check(`${T} : le survol de Enregistrer ouvre le menu juste dessous, entier dans la fenêtre de 700x400`, look.display === 'flex' && look.t >= look.saveB - 1 && look.t <= look.saveB + 8 && look.l >= 0 && look.r <= look.vw && look.b <= look.vh && look.expanded === 'true', look);
  check(`${T} : titre « Enregistrer (Ctrl+S) », deux lignes de 12,5 px et d’au moins 24 px, au premier plan, coche visible`, look.title === 'Enregistrer (Ctrl+S)' && look.size === 12.5 && look.saveAs.h >= 24 && look.auto.h >= 24 && look.saveAs.onTop && look.auto.onTop && look.tick === 'visible', look);
  await page.screenshot({ path: SHOTS + `/menu-${theme}.png`, clip: { x: 0, y: 0, width: 700, height: 150 } });
  await slideTo(page, '#v2-btn-save-as');
  check(`${T} : en descendant lentement vers « Enregistrer sous… », le menu reste ouvert et la ligne est survolée`, (await flyOpen(page)) && await page.evaluate(() => !!document.querySelector('#v2-btn-save-as:hover')));
  await away(page); await page.waitForTimeout(200);
  check(`${T} : souris partie, le menu se referme`, !(await flyOpen(page)) && (await expandedOf(page)) === 'false');

  // 2) la ligne « Enregistrement automatique » : un vrai clic la décoche
  await clickMenuRow(page, '#v2-btn-autosave');
  const off = await autoState(page);
  check(`${T} : un vrai clic sur « Enregistrement automatique » la décoche : coche disparue, choix gardé, dit dans le coin d’état`, off.checked === 'false' && off.tick === 'hidden' && off.stored === 'false' && /désactivé/.test(off.status), off);
  check(`${T} : ... le menu reste ouvert sous la souris et aucune ligne n’a pris le focus`, off.open === 'flex' && !/^v2-btn-|^btn-save$/.test(off.focus || ''), off);
  const offLook = await saveLook(page);
  check(`${T} : ... le bouton Enregistrer passe au noir et blanc classique (fond --solid-neutral, glyphe blanc, bordure du thème), sans changer de taille`, offLook.off && offLook.bg === offLook.neutral && offLook.bg !== offLook.blue && offLook.glyph === WHITE && offLook.color === WHITE && offLook.border === offLook.neutralBorder && offLook.w === onLook.w && offLook.h === onLook.h, { onLook, offLook });
  await page.screenshot({ path: SHOTS + `/menu-decoche-${theme}.png`, clip: { x: 0, y: 0, width: 700, height: 150 } });
  await away(page);
  await hoverSave(page);
  const offHover = await saveLook(page);
  check(`${T} : ... survolé, il s’éclaircit (--solid-neutral-hover) et le glyphe reste blanc`, offHover.off && offHover.bg === offHover.neutralHover && offHover.glyph === WHITE, offHover);
  await page.screenshot({ path: SHOTS + `/bouton-noir-${theme}.png`, clip: { x: 0, y: 0, width: 400, height: 60 } });
  await away(page);

  // 3) éteint : un clic sur Enregistrer est le seul à écrire, et le curseur reste dans le texte
  const statusLook = () => page.evaluate(() => {
    const el = document.getElementById('status-msg'), cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return { text: el.textContent, cls: el.className, color: cs.color, w: Math.round(r.width), fits: el.scrollWidth <= el.clientWidth, barH: Math.round(document.getElementById('toolbar-top').getBoundingClientRect().height), vh: innerHeight };
  });
  const plain = await statusLook(); // « Enregistrement automatique désactivé. » : message ordinaire
  const para = await rectOf(page, '.ProseMirror p');
  await page.mouse.click(para.r - 3, para.y); await page.keyboard.press('End'); await page.keyboard.type(' alpha');
  await page.waitForTimeout(3300);
  check(`${T} : éteint, rien n’est écrit tout seul (3 s sans geste)`, !((await contentOf(page, 'Contrat de vente')) || '').includes('alpha'), await contentOf(page, 'Contrat de vente'));
  const unsaved = await statusLook();
  check(`${T} : éteint, la frappe écrit « Modifications non enregistrées. » dans le coin d’état, et le message tient encore 3 s plus tard`, unsaved.text === 'Modifications non enregistrées.' && unsaved.cls === 'is-unsaved', unsaved);
  check(`${T} : ... il tient en entier à 700 px, sans changer la hauteur de la barre, dans une couleur plus soutenue que le message ordinaire`, unsaved.fits && unsaved.barH === plain.barH && unsaved.color !== plain.color, { plain, unsaved });
  await page.screenshot({ path: SHOTS + `/non-enregistre-${theme}.png`, clip: { x: 0, y: 0, width: 700, height: 200 } });
  if (theme === 'light') {
    // Plus large (≈ 860 px), le coin partage la première ligne avec les boutons et coupe le texte : le message entier s'affiche alors au survol (js/viewport-fit.js).
    await page.setViewportSize({ width: 860, height: HEIGHT });
    await page.waitForTimeout(300);
    const narrow = await statusLook();
    const st = await rectOf(page, '#status-msg');
    await page.mouse.move(st.x - 6, st.y, { steps: 2 }); await page.mouse.move(st.x, st.y, { steps: 3 });
    await page.waitForTimeout(150);
    const title = await page.evaluate(() => document.getElementById('status-msg').title);
    check('clair : à 860 px le coin est plus étroit que le message (coupé par « … ») et le message entier s’affiche alors au survol', !narrow.fits && title === 'Modifications non enregistrées.', { narrow, title });
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });
    await page.waitForTimeout(300);
    await away(page);
  }
  const w0 = await updates(page);
  await realClick(page, '#btn-save', 700);
  const w1 = await updates(page);
  check(`${T} : un seul clic sur Enregistrer écrit le modèle (une écriture) et le coin d’état dit « Enregistré à »`, ((await contentOf(page, 'Contrat de vente')) || '').includes('alpha') && w1 - w0 === 1 && /Enregistré à/.test(await statusOf(page)), { w0, w1, status: await statusOf(page) });
  check(`${T} : ... l’indicateur « Modifications non enregistrées. » a disparu avec lui`, (await statusLook()).cls === '' && !/Modifications non/.test(await statusOf(page)), await statusLook());
  check(`${T} : ... le focus reste dans le texte : la frappe suivante y arrive, au bout`, (await inEditor(page)) && (await (async () => { await page.keyboard.type(' beta'); return (await editorText(page)).endsWith('alpha beta'); })()), { focus: await activeId(page), text: await editorText(page) });
  await away(page); await page.waitForTimeout(250);
  check(`${T} : ... et le menu ne reste pas ouvert une fois la souris partie`, !(await flyOpen(page)) && (await expandedOf(page)) === 'false');

  // 4) rallumée : ce qui a été tapé pendant la coupure part au tick suivant
  await clickMenuRow(page, '#v2-btn-autosave');
  const on = await autoState(page);
  check(`${T} : un second clic la recoche : coche revenue, choix gardé`, on.checked === 'true' && on.tick === 'visible' && on.stored === 'true', on);
  const onAgain = await saveLook(page);
  check(`${T} : ... et le bouton Enregistrer redevient bleu et blanc`, !onAgain.off && onAgain.bg === onAgain.blue && onAgain.glyph === WHITE, onAgain);
  await away(page);
  await page.waitForTimeout(3400);
  check(`${T} : ... la modification faite pendant la coupure (« beta ») est enregistrée toute seule au tick suivant`, ((await contentOf(page, 'Contrat de vente')) || '').includes('alpha beta'), await contentOf(page, 'Contrat de vente'));

  // 5) « Enregistrer sous… » au vrai clic
  const n0 = (await names(page)).length;
  await clickMenuRow(page, '#v2-btn-save-as', 500);
  const dlg = await dialogState(page);
  check(`${T} : un vrai clic sur « Enregistrer sous… » ouvre la fenêtre de saisie, le champ a le focus`, dlg.shown && dlg.title === 'Enregistrer sous (copie)' && dlg.inputFocused, dlg);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check(`${T} : Échap n’enregistre aucune copie et rend le focus au texte, là où il était`, (await names(page)).length === n0 && (await inEditor(page)), { n: (await names(page)).length, focus: await activeId(page) });
  await clickMenuRow(page, '#v2-btn-save-as', 500);
  await page.keyboard.type('Copie souris'); await page.keyboard.press('Enter'); await page.waitForTimeout(1000);
  const names1 = await names(page);
  check(`${T} : Entrée crée la copie sous le nom tapé, l’original reste, la liste montre la copie`, names1.includes('Copie souris') && names1.includes('Contrat de vente') && names1.length === n0 + 1
    && (await page.evaluate(() => document.querySelector('.tts-trigger-label').textContent)) === 'Copie souris', names1);
  await away(page);

  // 5b) renommer puis un vrai clic sur Enregistrer : le champ perd le focus comme avant (il se referme), le nouveau nom est enregistré
  await realClick(page, '#btn-rename-template', 250);
  await page.keyboard.press('End'); await page.keyboard.type(' bis');
  await realClick(page, '#btn-save', 700);
  const ren = await page.evaluate(() => ({ hidden: document.getElementById('template-name').hidden, label: document.querySelector('.tts-trigger-label').textContent }));
  const namesRen = await names(page);
  check(`${T} : renommer puis un vrai clic sur Enregistrer : le champ se referme, le nouveau nom est affiché et enregistré`, ren.hidden && ren.label === 'Copie souris bis' && namesRen.includes('Copie souris bis') && !namesRen.includes('Copie souris'), { ren, namesRen });
  await away(page);

  // 6) au clavier
  await page.focus('#btn-new'); await page.keyboard.press('Tab');
  const k0 = await page.evaluate(() => ({ active: document.activeElement.id, open: getComputedStyle(document.getElementById('v2-save-flyout')).display, expanded: document.getElementById('btn-save').getAttribute('aria-expanded') }));
  check(`${T} : Tab arrive sur Enregistrer et ouvre son menu`, k0.active === 'btn-save' && k0.open === 'flex' && k0.expanded === 'true', k0);
  await page.keyboard.press('Tab');
  const k1 = await page.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a); return { active: a.id, visible: a.matches(':focus-visible'), outline: cs.outlineWidth, open: getComputedStyle(document.getElementById('v2-save-flyout')).display }; });
  check(`${T} : Tab suivant : « Enregistrer sous… » a le focus, avec son anneau, le menu reste ouvert`, k1.active === 'v2-btn-save-as' && k1.visible && k1.outline === '2px' && k1.open === 'flex', k1);
  await page.keyboard.press('Tab');
  check(`${T} : Tab suivant : « Enregistrement automatique »`, (await activeId(page)) === 'v2-btn-autosave');
  await page.keyboard.press('Tab');
  const k3 = await page.evaluate(() => ({ active: document.activeElement.id, open: getComputedStyle(document.getElementById('v2-save-flyout')).display, expanded: document.getElementById('btn-save').getAttribute('aria-expanded') }));
  check(`${T} : Tab suivant : on sort du menu (Supprimer), il se referme`, k3.active === 'btn-delete' && k3.open === 'none' && k3.expanded === 'false', k3);
  await page.keyboard.press('Shift+Tab');
  const k4 = await page.evaluate(() => ({ active: document.activeElement.id, open: getComputedStyle(document.getElementById('v2-save-flyout')).display }));
  check(`${T} : Maj+Tab depuis Supprimer revient sur Enregistrer (le menu fermé n’a pas de ligne à atteindre), qui rouvre son menu`, k4.active === 'btn-save' && k4.open === 'flex', k4);
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  check(`${T} : Tab, Tab : de nouveau sur « Enregistrement automatique »`, (await activeId(page)) === 'v2-btn-autosave');
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.keyboard.press(' ');
  const sp1 = await autoState(page), scrollAfter = await page.evaluate(() => scrollY);
  check(`${T} : Espace sur « Enregistrement automatique » la décoche, la page ne défile pas, le focus reste sur la ligne`, sp1.checked === 'false' && sp1.stored === 'false' && sp1.tick === 'hidden' && sp1.focus === 'v2-btn-autosave' && scrollAfter === scrollBefore, { sp1, scrollBefore, scrollAfter });
  await page.keyboard.press('Enter');
  const sp2 = await autoState(page);
  check(`${T} : Entrée la recoche`, sp2.checked === 'true' && sp2.stored === 'true' && sp2.tick === 'visible' && sp2.focus === 'v2-btn-autosave', sp2);
  await page.keyboard.press('Shift+Tab');
  check(`${T} : Maj+Tab dans le menu : retour sur « Enregistrer sous… »`, (await activeId(page)) === 'v2-btn-save-as');
  const n1 = (await names(page)).length;
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  const dlgK = await dialogState(page);
  check(`${T} : Entrée sur « Enregistrer sous… » ouvre la fenêtre de saisie`, dlgK.shown && dlgK.inputFocused, dlgK);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const back = await page.evaluate(() => ({ active: document.activeElement.id, open: getComputedStyle(document.getElementById('v2-save-flyout')).display, copies: window.__gristStub.state.rows.Publipostage_Modeles.Nom.length }));
  check(`${T} : Échap : aucune copie, le focus revient au bouton Enregistrer (visible), pas à une ligne de menu refermée`, back.copies === n1 && back.active === 'btn-save', { back, n1 });
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  await page.keyboard.type('Copie clavier'); await page.keyboard.press('Enter'); await page.waitForTimeout(1000);
  const names2 = await names(page);
  check(`${T} : Entrée sur « Enregistrer sous… », nom tapé, Entrée : la copie existe (clavier seul)`, names2.includes('Copie clavier') && names2.length === n1 + 1, names2);
  check(`${T} : ... le focus est revenu sur le bouton Enregistrer`, (await activeId(page)) === 'btn-save', await activeId(page));
  const w2 = await updates(page);
  await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  check(`${T} : Entrée sur le bouton Enregistrer enregistre en un geste (une écriture)`, (await updates(page)) - w2 === 1, { w2, now: await updates(page) });
  await page.evaluate(() => document.activeElement && document.activeElement.blur());

  // 7) le choix survit à un rechargement ; interface en anglais
  if (theme === 'light') {
    await clickMenuRow(page, '#v2-btn-autosave');
    await away(page);
    // Sonde posée avant le rechargement : l'aspect du bouton à la fin du chargement des scripts (DOMContentLoaded), avant que Grist ait répondu à quoi que ce soit.
    await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
      const b = document.getElementById('btn-save');
      window.__saveOffAtDomReady = !!b && b.classList.contains('is-autosave-off');
    }));
    // Image par image : à chaque image rendue où le bouton Enregistrer existe, porte-t-il déjà l'aspect noir et blanc (sa classe, ou celle de <html> posée par le <head> d'index.html) ? Les rappels de
    // requestAnimationFrame précèdent le calcul de style et la peinture de l'image : une image où le bouton existe sans l'une des deux classes est peinte en bleu, puis le fondu de .12s la ramène au noir.
    await page.addInitScript(() => {
      const F = window.__saveFrames = { seen: 0, blue: 0, firstBlueAt: null };
      const tick = () => {
        const b = document.getElementById('btn-save');
        if (b) {
          F.seen++;
          if (!b.classList.contains('is-autosave-off') && !document.documentElement.classList.contains('pp-autosave-off')) { F.blue++; if (F.firstBlueAt === null) F.firstBlueAt = Math.round(performance.now()); }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // Le rendu réel : les images que Chromium compose pendant le rechargement (screencast), dont on lit le pixel du fond du bouton une fois la page chargée.
    const cdp = await page.context().newCDPSession(page);
    const cast = [];
    cdp.on('Page.screencastFrame', async (ev) => { cast.push(ev.data); try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch (e) { /* page déjà fermée */ } });
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
    await cdp.send('Page.stopScreencast').catch(() => {});
    const reloaded = await autoState(page);
    check('clair : après un rechargement de la page, « Enregistrement automatique » est toujours décochée (choix gardé par navigateur)', reloaded.checked === 'false' && reloaded.tick === 'hidden' && reloaded.stored === 'false', reloaded);
    const reloadedLook = await saveLook(page);
    check('clair : ... et le bouton Enregistrer est noir et blanc dès le premier affichage (pas bleu le temps d’un clic)', reloadedLook.off && reloadedLook.bg === reloadedLook.neutral, reloadedLook);
    const offAtDomReady = await page.evaluate(() => window.__saveOffAtDomReady);
    check('clair : ... il l’est déjà quand les scripts ont fini de se charger, sans attendre la réponse de Grist (pas bleu pendant tout le chargement)', offAtDomReady === true, offAtDomReady);
    // « Dès le premier affichage » : le contrôle du DOMContentLoaded ci-dessus arrive trop tard, la première image est peinte avant la fin des scripts (le bouton y était bleu, puis fondait vers le noir en .12s).
    const frames = await page.evaluate(() => window.__saveFrames);
    check('clair : ... aucune image rendue ne montre le bouton Enregistrer sans son aspect noir et blanc (ni bleu, ni en fondu vers le noir) : images vues avec le bouton > 0, images bleues = 0', frames && frames.seen > 0 && frames.blue === 0, frames);
    const geo = await rectOf(page, '#btn-save');
    const decoder = await page.context().newPage();
    const bluish = [];
    let painted = 0;
    for (const b64 of cast) {
      const px = await decoder.evaluate(async ({ b64, x, y }) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data; return [d[0], d[1], d[2]];
      }, { b64, x: geo.l + 2, y: geo.y });
      if (!(px[0] === 255 && px[1] === 255 && px[2] === 255)) painted++; // une page encore blanche n'a pas peint le bouton
      if (px[2] - px[0] > 30) bluish.push(px.join(',')); // le bleu du thème (47,111,237) et son fondu vers le noir (30,47,76...) ; le noir et blanc (27,36,48) reste sous 30
    }
    await decoder.close();
    check('clair : ... et, dans les images du rendu réel du rechargement, le fond du bouton n’est bleuté à aucun moment (images composées > 0, images bleutées = 0)', cast.length > 0 && painted > 0 && bluish.length === 0, { images: cast.length, peintes: painted, bleutees: bluish });
    await clickMenuRow(page, '#v2-btn-autosave');
    await away(page);
    check('clair : un clic la recoche (état de départ rétabli)', (await autoState(page)).checked === 'true');
    const recheckedLook = await saveLook(page);
    check('clair : ... et le bouton Enregistrer est de nouveau bleu et blanc', !recheckedLook.off && recheckedLook.bg === recheckedLook.blue, recheckedLook);
    await page.evaluate(() => I18n.setLang('en'));
    await page.waitForTimeout(300);
    await hoverSave(page);
    const en = await page.evaluate(() => ({ title: document.getElementById('v2-save-flyout-label').textContent, saveAs: document.getElementById('v2-btn-save-as').textContent, auto: document.getElementById('v2-btn-autosave').textContent,
      aria: document.getElementById('btn-save').getAttribute('aria-label'), autoAria: document.getElementById('v2-btn-autosave').getAttribute('aria-label') }));
    check('anglais : « Save (Ctrl+S) », « Save as… », « Auto-save »', en.title === 'Save (Ctrl+S)' && en.saveAs === 'Save as…' && en.auto === 'Auto-save' && en.aria === 'Save (Ctrl+S)' && /^Auto-save/.test(en.autoAria), en);
    await page.screenshot({ path: SHOTS + '/menu-en.png', clip: { x: 0, y: 0, width: 700, height: 150 } });
    await page.evaluate(() => I18n.setLang('fr'));
  }
  await page.context().close();
}

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
