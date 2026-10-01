#!/usr/bin/env node
// Retours d'Antoine du 2026-10-01 sur la liste des modèles et le renommage, à la VRAIE souris et au vrai clavier, à la taille du panneau Grist d'Antoine (~700x400), en clair
// puis en sombre : les scénarios de dev-tests/scenarios-template-tree.js tournent DANS la page (dispatchEvent) et ne prouvent ni qu'un vrai clic atteint « Organiser » (au
// premier plan, en haut à droite), ni que la molette fait défiler la liste sous un en-tête qui reste en place, ni que le champ du renommage prend vraiment la place du nom sans
// faire passer la barre sur une deuxième ligne.
//   1) la liste : noms à 12,5 px (taille des menus au survol), modèle en graisse normale, dossier en demi-gras ; plus de ligne « Nouveau modèle » ; « Organiser » dans l'en-tête, en haut
//      à droite, absent de la barre ; la liste tient dans la fenêtre ;
//   2) « Organiser » au vrai clic puis Échap : la fenêtre s'ouvre et se ferme, le focus revient au déclencheur de la liste ;
//   3) au clavier : Entrée ouvre la liste, Flèche haut depuis la première ligne atteint « Organiser » (anneau de focus visible), Entrée l'active ;
//   4) 30 modèles : la molette fait défiler la liste, le panneau reste ouvert, l'en-tête reste en haut et « Organiser » reste cliquable ;
//   5) renommer : le champ prend la place et la largeur du déclencheur (la barre ne change pas de hauteur), Entrée montre le nouveau nom, Enregistrer l'écrit dans Grist ;
//   6) interface en anglais : « Templates » / « Organize ».
// Lancé par run-headless.mjs (groupe Node "templateMenuMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-template-menu-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TEMPLATE_MENU_MOUSE_PORT || 8908);
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
if (!OFFLINE) console.log('[verify-template-menu-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const SHOTS = process.env.TEMPLATE_MENU_SHOTS || mkdtempSync(join(tmpdir(), 'template-menu-'));
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
const popupOpen = (page) => page.evaluate(() => document.querySelector('.tts-popup').classList.contains('is-open'));
const modalShown = (page) => page.evaluate(() => getComputedStyle(document.getElementById('template-organize-modal')).display !== 'none');
const activeIs = (page, sel) => page.evaluate((s) => !!document.activeElement && document.activeElement.matches(s), sel);
const extraSeed = `
  for (let i = 0; i < 24; i++) add(10 + i, 'Modèle de test ' + String(i + 1).padStart(2, '0'), '<p>x</p>', false);
  stub.state.nextRowId.Publipostage_Modeles = 40;
`;

for (const theme of ['light', 'dark']) {
  const T = theme === 'light' ? 'clair' : 'sombre';
  console.log(`\n== Thème ${T} ==`);
  const page = await openPage(extraSeed);
  await page.evaluate(async () => {
    await TemplatePreferences.setFolder(1, 'Contrats');
    await TemplatePreferences.setFolder(3, 'Contrats/Avenants');
    await TemplatePreferences.setFolder(4, 'Litiges');
    await TemplatePreferences.setPinned(5, true);
    TemplateTreeSelect.refresh();
  });
  await page.evaluate((t) => Settings.setTheme(t), theme);
  await page.waitForTimeout(200);

  // 1) la liste
  check(`${T} : « Organiser » n’est plus dans la barre`, await page.evaluate(() => !document.querySelector('#toolbar-top #btn-organize-templates')));
  const barH0 = await page.evaluate(() => Math.round(document.getElementById('toolbar-top').getBoundingClientRect().height));
  await realClick(page, '.tts-trigger');
  check(`${T} : un vrai clic sur le déclencheur ouvre la liste`, await popupOpen(page));
  const look = await page.evaluate(() => {
    const cs = (e) => { const c = getComputedStyle(e); return { size: parseFloat(c.fontSize), weight: Number(c.fontWeight) }; };
    const leaf = document.querySelector('.tts-popup .tts-row-leaf .tts-row-label'), folder = document.querySelector('.tts-popup .tts-row-folder .tts-row-label');
    const popup = document.querySelector('.tts-popup'), pr = popup.getBoundingClientRect();
    const rows = Array.from(popup.querySelectorAll('.tts-row'));
    return { leaf: cs(leaf), folder: cs(folder), menuRow: parseFloat(getComputedStyle(document.querySelector('.v2-hover-row')).fontSize),
      newRow: rows.some((r) => r.dataset.templateId === '' || /Nouveau modèle/.test(r.textContent)),
      first: popup.firstElementChild.className, bottom: pr.bottom, vh: innerHeight, right: pr.right, vw: innerWidth, height: pr.height };
  });
  check(`${T} : noms de modèles à 12,5 px en graisse normale, dossiers en demi-gras (pas de 16 px, pas de 700)`, look.leaf.size === 12.5 && look.leaf.weight <= 500 && look.folder.size === 12.5 && look.folder.weight === 600 && look.menuRow === 12.5, look);
  check(`${T} : plus de ligne « Nouveau modèle » dans la liste`, !look.newRow, look);
  check(`${T} : la liste tient dans la fenêtre de 700x400 (rien de rogné en bas ni à droite)`, look.bottom <= look.vh && look.right <= look.vw, look);
  const org = await rectOf(page, '#btn-organize-templates'), pop = await rectOf(page, '.tts-popup');
  check(`${T} : « Organiser » est au premier plan, en haut à droite de la liste (en-tête fixe)`, !!org && org.onTop && look.first === 'tts-head' && pop.r - org.r < 16 && org.t - pop.t < 12 && org.h <= 28, { org, pop, first: look.first });
  const orgText = await page.evaluate(() => { const b = document.getElementById('btn-organize-templates'); return { text: b.textContent.trim(), title: b.title, aria: b.getAttribute('aria-label'), head: document.querySelector('.tts-head-title').textContent }; });
  check(`${T} : « Organiser » porte son texte et son info-bulle « Organiser mes modèles »`, orgText.text === 'Organiser' && orgText.title === 'Organiser mes modèles' && orgText.aria === 'Organiser mes modèles' && orgText.head === 'Modèles', orgText);
  await page.screenshot({ path: SHOTS + `/liste-${theme}.png` });

  // 2) Organiser au vrai clic, puis Échap
  await realClick(page, '#btn-organize-templates', 500);
  check(`${T} : un vrai clic sur « Organiser » ouvre la fenêtre et referme la liste`, (await modalShown(page)) && !(await popupOpen(page)));
  const fit = await page.evaluate(() => { const r = document.querySelector('.template-organize-modal-content').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; });
  check(`${T} : la fenêtre Organiser tient dans 700x400`, fit.top >= 0 && fit.bottom <= fit.vh, fit);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check(`${T} : Échap ferme la fenêtre et le focus revient au déclencheur de la liste`, !(await modalShown(page)) && (await activeIs(page, '.tts-trigger')));

  // 3) au clavier
  await page.focus('.tts-trigger'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  check(`${T} : Entrée sur le déclencheur ouvre la liste`, await popupOpen(page));
  await page.keyboard.press('Home'); await page.waitForTimeout(60);
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(100);
  const ring = await page.evaluate(() => { const b = document.getElementById('btn-organize-templates'); const cs = getComputedStyle(b); return { active: document.activeElement === b, visible: b.matches(':focus-visible'), outline: cs.outlineWidth }; });
  check(`${T} : Flèche haut depuis la première ligne atteint « Organiser », avec son anneau de focus`, ring.active && ring.visible && ring.outline === '2px', ring);
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  check(`${T} : Entrée sur « Organiser » ouvre la fenêtre`, (await modalShown(page)) && !(await popupOpen(page)));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check(`${T} : ... Échap la ferme, le focus revient au déclencheur`, !(await modalShown(page)) && (await activeIs(page, '.tts-trigger')));
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check(`${T} : Échap referme la liste, le focus reste sur le déclencheur`, !(await popupOpen(page)) && (await activeIs(page, '.tts-trigger')));

  // 4) la molette sur une longue liste
  await realClick(page, '.tts-trigger');
  const before = await page.evaluate(() => { const p = document.querySelector('.tts-popup'); return { top: p.scrollTop, scrollable: p.scrollHeight > p.clientHeight, headTop: document.querySelector('.tts-head').getBoundingClientRect().top - p.getBoundingClientRect().top }; });
  const lp = await rectOf(page, '.tts-popup .tts-row-leaf');
  await page.mouse.move(lp.x, lp.y + 60); await page.mouse.wheel(0, 500); await page.waitForTimeout(250);
  const afterScroll = await page.evaluate(() => { const p = document.querySelector('.tts-popup'); return { top: p.scrollTop, open: p.classList.contains('is-open'), headTop: document.querySelector('.tts-head').getBoundingClientRect().top - p.getBoundingClientRect().top }; });
  check(`${T} : 30 modèles : la molette fait défiler la liste, qui reste ouverte`, before.scrollable && afterScroll.top > before.top && afterScroll.open, { before, afterScroll });
  const orgScrolled = await rectOf(page, '#btn-organize-templates');
  check(`${T} : ... l’en-tête reste en haut du panneau et « Organiser » reste au premier plan`, Math.abs(afterScroll.headTop - before.headTop) <= 1 && orgScrolled.onTop, { before, afterScroll, orgScrolled });
  await realClick(page, '#btn-organize-templates', 500);
  check(`${T} : ... un vrai clic dessus, liste défilée, ouvre la fenêtre`, await modalShown(page));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // 5) renommer
  const trigBox = await rectOf(page, '.tts-trigger');
  const label0 = await page.evaluate(() => document.querySelector('.tts-trigger-label').textContent);
  await realClick(page, '#btn-rename-template', 250);
  const ren = await page.evaluate(() => {
    const wrap = document.querySelector('#v2-title-cluster .tts-wrap'), input = document.getElementById('template-name'), ir = input.getBoundingClientRect();
    return { wrapDisplay: getComputedStyle(wrap).display, inputShown: !input.hidden && ir.width > 0, left: ir.left, width: ir.width, focused: document.activeElement === input, selected: input.selectionStart === 0 && input.selectionEnd === input.value.length, barH: Math.round(document.getElementById('toolbar-top').getBoundingClientRect().height) };
  });
  check(`${T} : le crayon fait apparaître le champ À LA PLACE du nom (le déclencheur disparaît, rien à côté)`, ren.wrapDisplay === 'none' && ren.inputShown && Math.abs(ren.left - trigBox.l) <= 2 && Math.abs(ren.width - trigBox.w) <= 2, { ren, trigBox });
  check(`${T} : ... le champ a le focus, son texte est sélectionné, la barre ne change pas de hauteur`, ren.focused && ren.selected && ren.barH === barH0, { ren, barH0 });
  await page.screenshot({ path: SHOTS + `/renommer-${theme}.png`, clip: { x: 0, y: 0, width: 700, height: 110 } });
  await page.keyboard.press('End'); await page.keyboard.type(' 2'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({ label: document.querySelector('.tts-trigger-label').textContent, wrapDisplay: getComputedStyle(document.querySelector('#v2-title-cluster .tts-wrap')).display, inputHidden: document.getElementById('template-name').hidden, barH: Math.round(document.getElementById('toolbar-top').getBoundingClientRect().height) }));
  check(`${T} : Entrée referme le champ, le déclencheur montre le nouveau nom avec son étoile`, after.label === label0.replace(/( ★)?$/, ' 2$1') && after.wrapDisplay !== 'none' && after.inputHidden && after.barH === barH0, { label0, after });
  await realClick(page, '#btn-save', 700);
  const saved = await page.evaluate(() => { const m = window.__gristStub.state.rows.Publipostage_Modeles; return m.Nom[m.id.indexOf(2)]; });
  check(`${T} : Enregistrer écrit le nouveau nom dans Grist`, saved === label0.replace(/ ★$/, '') + ' 2', { saved, label0 });
  await page.screenshot({ path: SHOTS + `/barre-${theme}.png`, clip: { x: 0, y: 0, width: 700, height: 110 } });

  // 6) interface en anglais
  if (theme === 'light') {
    await page.evaluate(() => I18n.setLang('en'));
    await page.waitForTimeout(300);
    await realClick(page, '.tts-trigger');
    const en = await page.evaluate(() => { const b = document.getElementById('btn-organize-templates'); return { head: document.querySelector('.tts-head-title').textContent, label: b.textContent.trim(), title: b.title }; });
    check('anglais : en-tête « Templates », bouton « Organize », info-bulle « Organize my templates »', en.head === 'Templates' && en.label === 'Organize' && en.title === 'Organize my templates', en);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await page.evaluate(() => I18n.setLang('fr'));
  }
  await page.context().close();
}

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
