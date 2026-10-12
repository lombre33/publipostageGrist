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
//   6) interface en anglais : « Templates » / « Organize » ;
//   7) l'étoile du modèle par défaut au démarrage du widget (demande du 2026-10-12), sur chaque ligne de la liste et de « Organiser mes modèles » : mention « au démarrage » et étoile appuyée
//      sur le défaut, étoile des autres lignes au survol, vrai clic qui pose / déplace / retire (la liste reste ouverte, le modèle ouvert ne change pas, la barre suit), email et macro grisés,
//      légende de la fenêtre dans 700x400 sans recouvrir « Fermer », étoile atteinte et activée au clavier, interface en anglais.
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
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
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

// 7) l'étoile « modèle par défaut au démarrage du widget » : un faux Grist avec un email et un macro-modèle (colonne TypeModele ajoutée, les six premiers en « document »).
const starSeed = `
  m.TypeModele = m.id.map(() => 'document');
  add(40, 'Relance par email', '<p>g</p>', false); m.TypeModele.push('email');
  add(41, 'Courrier en lot', '{}', false); m.TypeModele.push('macro');
  stub.state.nextRowId.Publipostage_Modeles = 42;
`;
const flagged = (page) => page.evaluate(() => { const m = window.__gristStub.state.rows.Publipostage_Modeles; return m.id.filter((_, i) => m.EstParDefaut[i]); });
const listStar = (id) => `.tts-popup .tts-row-leaf[data-template-id="${id}"] .tts-star-btn`;
const winStar = (id) => `#template-organize-list .tts-row-leaf[data-template-id="${id}"] .tts-star-btn`;
const showRow = (page, sel) => page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'nearest' }), sel);
// Ce que la liste et la barre montrent après un geste.
const nowShown = (page) => page.evaluate(() => ({
  open: document.querySelector('.tts-popup').classList.contains('is-open'),
  selected: document.getElementById('template-select').value,
  trigger: document.querySelector('.tts-trigger-label').textContent,
  toolbarStar: document.getElementById('btn-set-default-template').classList.contains('is-default'),
  status: document.getElementById('status-msg').textContent,
  noted: Array.from(document.querySelectorAll('.tts-popup .tts-default-note')).map((n) => n.closest('.tts-row').dataset.templateId),
}));

for (const theme of ['light', 'dark']) {
  const T = theme === 'light' ? 'clair' : 'sombre';
  console.log(`\n== L’étoile du modèle par défaut - thème ${T} ==`);
  const page = await openPage(starSeed);
  await page.evaluate(async () => {
    await TemplatePreferences.setFolder(1, 'Contrats');
    await TemplatePreferences.setPinned(5, true);
    TemplateTreeSelect.refresh();
  });
  await page.evaluate((t) => Settings.setTheme(t), theme);
  await page.waitForTimeout(200);

  // La liste : le modèle par défaut (Contrat de vente, celui qui s'est ouvert au démarrage) dit son rôle au repos.
  await realClick(page, '.tts-trigger');
  const rest = await page.evaluate(() => {
    const row = document.querySelector('.tts-popup .tts-row-leaf[data-template-id="2"]');
    const star = row.querySelector('.tts-star-btn'), note = row.querySelector('.tts-default-note'), pin = row.querySelector('.tts-pin-btn'), label = row.querySelector('.tts-row-label');
    const r = (e) => e.getBoundingClientRect(), pop = document.querySelector('.tts-popup');
    return {
      note: note && note.textContent, pressed: star.getAttribute('aria-pressed'), opacity: getComputedStyle(star).opacity, star: [Math.round(r(star).width), Math.round(r(star).height)],
      noteRight: r(note).right, starLeft: r(star).left, starRight: r(star).right, pinLeft: r(pin).left, labelW: Math.round(r(label).width),
      rowOverflow: row.scrollWidth - row.clientWidth, popOverflow: pop.scrollWidth - pop.clientWidth, title: star.title,
      otherNoted: !!document.querySelector('.tts-popup .tts-row-leaf[data-template-id="1"] .tts-default-note'),
      otherOpacity: getComputedStyle(document.querySelector('.tts-popup .tts-row-leaf[data-template-id="1"] .tts-star-btn')).opacity,
    };
  });
  check(`${T} : la ligne du modèle par défaut dit « au démarrage », son étoile est appuyée, visible au repos et à taille de bouton`, rest.note === 'au démarrage' && rest.pressed === 'true' && rest.opacity === '1' && rest.star[0] >= 16 && rest.star[1] >= 16 && !rest.otherNoted, rest);
  check(`${T} : ... l’ordre est nom, « au démarrage », étoile, punaise ; le nom garde sa place et rien ne déborde du panneau`, rest.noteRight <= rest.starLeft + 1 && rest.starRight <= rest.pinLeft + 1 && rest.labelW >= 60 && rest.rowOverflow <= 1 && rest.popOverflow <= 1, rest);
  check(`${T} : ... l’info-bulle dit le rôle (au démarrage du widget, pour tout le document) et ce que fait le clic`, /démarrage du widget/.test(rest.title) && /tout le document/.test(rest.title) && /retirer/i.test(rest.title), rest.title);
  check(`${T} : l’étoile d’une autre ligne est cachée au repos`, rest.otherOpacity === '0', rest.otherOpacity);
  const row1 = await rectOf(page, '.tts-popup .tts-row-leaf[data-template-id="1"]');
  await page.mouse.move(row1.l + 24, row1.y, { steps: 3 }); await page.waitForTimeout(150);
  const hovered = await rectOf(page, listStar(1));
  const hoveredOpacity = await page.evaluate((s) => getComputedStyle(document.querySelector(s)).opacity, listStar(1));
  check(`${T} : ... elle apparaît au survol de la ligne, au premier plan, à taille de bouton`, hoveredOpacity === '1' && hovered.onTop && hovered.w >= 16 && hovered.h >= 16, { hoveredOpacity, hovered });
  await page.screenshot({ path: SHOTS + `/etoile-liste-${theme}.png` });

  // Au vrai clic : poser sur une autre ligne, retirer, poser sur le modèle ouvert.
  await realClick(page, listStar(1), 400);
  const set = await nowShown(page);
  check(`${T} : un vrai clic sur l’étoile d’une autre ligne la pose là : un seul modèle marqué dans Grist, la liste reste ouverte, le modèle ouvert ne change pas`, JSON.stringify(await flagged(page)) === '[1]' && set.open && set.selected === '2', { flags: await flagged(page), set });
  check(`${T} : ... la barre suit (plus d’étoile sur le modèle ouvert, plus de ★ sur le déclencheur), la mention passe à la nouvelle ligne`, !set.toolbarStar && set.trigger === 'Contrat de vente' && JSON.stringify(set.noted) === '["1"]', set);
  check(`${T} : ... la ligne d’état dit quel modèle s’ouvrira au démarrage`, set.status === 'Modèle par défaut défini : « Bail habitation » s’ouvrira au démarrage du widget.', set.status);
  await realClick(page, listStar(1), 400);
  const cleared = await nowShown(page);
  check(`${T} : un second clic sur la même étoile retire le modèle par défaut (aucun modèle marqué, plus de mention), la liste reste ouverte`, (await flagged(page)).length === 0 && cleared.open && cleared.noted.length === 0 && /ne s’ouvrira plus au démarrage/.test(cleared.status), { flags: await flagged(page), cleared });
  await realClick(page, listStar(2), 400);
  const onOpen = await nowShown(page);
  check(`${T} : l’étoile du modèle ouvert le remet par défaut : ★ sur le déclencheur, étoile de la barre allumée`, JSON.stringify(await flagged(page)) === '[2]' && onOpen.toolbarStar && onOpen.trigger === 'Contrat de vente ★' && onOpen.open, { flags: await flagged(page), onOpen });

  // Un email et un macro-modèle ne peuvent pas être le modèle par défaut du document : étoile grisée, jamais retirée.
  for (const [id, kind] of [[40, 'email'], [41, 'macro-modèle']]) {
    await showRow(page, listStar(id));
    const rr = await rectOf(page, `.tts-popup .tts-row-leaf[data-template-id="${id}"]`);
    await page.mouse.move(rr.l + 24, rr.y, { steps: 3 }); await page.waitForTimeout(120);
    const grey = await page.evaluate((s) => { const e = document.querySelector(s); const cs = getComputedStyle(e); return { there: !!e, disabled: e.classList.contains('is-disabled'), aria: e.getAttribute('aria-disabled'), opacity: cs.opacity, title: e.title }; }, listStar(id));
    check(`${T} : ${kind} : l’étoile reste là, grisée, avec l’info-bulle qui dit pourquoi`, grey.there && grey.disabled && grey.aria === 'true' && Number(grey.opacity) > 0.3 && Number(grey.opacity) < 0.6 && /ne peut pas être le modèle par défaut/.test(grey.title), grey);
    await realClick(page, listStar(id), 300);
    const after = await nowShown(page);
    check(`${T} : ... un vrai clic dessus ne marque rien et ne ferme pas la liste`, JSON.stringify(await flagged(page)) === '[2]' && after.open && after.selected === '2', { flags: await flagged(page), after });
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);

  // « Organiser mes modèles » : la même étoile sur chaque ligne et la légende, dans 700x400.
  await realClick(page, '.tts-trigger');
  await realClick(page, '#btn-organize-templates', 500);
  const win = await page.evaluate(() => {
    const m = document.querySelector('.template-organize-modal-content'), mr = m.getBoundingClientRect();
    const legend = document.querySelector('.template-organize-legend'), lr = legend.getBoundingClientRect();
    const close = document.getElementById('template-organize-close'), cr = close.getBoundingClientRect();
    const hit = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2);
    const list = document.getElementById('template-organize-list');
    const leaves = Array.from(list.querySelectorAll('.tts-row-leaf'));
    const glyph = legend.querySelector('.tts-star-glyph'), gr = glyph.getBoundingClientRect();
    return {
      top: Math.round(mr.top), bottom: Math.round(mr.bottom), vh: innerHeight, legendText: legend.textContent.trim(),
      legendLines: Math.round(lr.height / parseFloat(getComputedStyle(legend).lineHeight)), legendInside: lr.left >= mr.left && lr.right <= mr.right && lr.bottom <= mr.bottom + 1, legendClear: lr.right <= cr.left + 1,
      closeOnTop: hit === close || close.contains(hit), listH: Math.round(list.clientHeight), listOverflowX: list.scrollWidth - list.clientWidth,
      leaves: leaves.length, stars: leaves.filter((r) => r.querySelector('.tts-star-btn')).length, minLabel: Math.min(...leaves.map((r) => Math.round(r.querySelector('.tts-row-label').getBoundingClientRect().width))),
      glyph: [Math.round(gr.width), Math.round(gr.height)], noted: leaves.filter((r) => r.querySelector('.tts-default-note')).map((r) => r.dataset.templateId),
    };
  });
  check(`${T} : la fenêtre Organiser (avec sa légende) tient dans 700x400 et « Fermer » reste au premier plan`, win.top >= 0 && win.bottom <= win.vh && win.closeOnTop, win);
  check(`${T} : ... la légende dit le rôle de l’étoile, tient dans la fenêtre sur trois lignes au plus et ne recouvre pas « Fermer »`, win.legendText === 'Modèle par défaut : il s’ouvre au démarrage du widget, pour tout le document. Un seul à la fois.' && win.legendLines <= 3 && win.legendInside && win.legendClear && win.glyph[0] >= 10, win);
  check(`${T} : ... chaque modèle a son étoile (aucune ligne sans), le nom garde de la place et la liste ne déborde pas, assez haute pour défiler`, win.leaves >= 9 && win.stars === win.leaves && win.minLabel >= 40 && win.listOverflowX <= 1 && win.listH >= 90, win);
  check(`${T} : ... seule la ligne du modèle par défaut dit « au démarrage »`, JSON.stringify(win.noted) === '["2"]', win.noted);
  await page.screenshot({ path: SHOTS + `/etoile-organiser-${theme}.png` });

  const rowWin = await rectOf(page, `#template-organize-list .tts-row-leaf[data-template-id="3"]`);
  await page.mouse.move(rowWin.l + 24, rowWin.y, { steps: 3 }); await page.waitForTimeout(150);
  const starWin = await rectOf(page, winStar(3));
  check(`${T} : dans Organiser, l’étoile d’une ligne apparaît au survol, au premier plan`, starWin.onTop && starWin.w >= 16 && starWin.h >= 16, starWin);
  await realClick(page, winStar(3), 450);
  const afterWin = await page.evaluate(() => ({
    open: getComputedStyle(document.getElementById('template-organize-modal')).display !== 'none',
    noted: Array.from(document.querySelectorAll('#template-organize-list .tts-default-note')).map((n) => n.closest('.tts-row').dataset.templateId),
    pressed: Array.from(document.querySelectorAll('#template-organize-list .tts-star-btn[aria-pressed="true"]')).map((n) => n.closest('.tts-row').dataset.templateId),
    toolbarStar: document.getElementById('btn-set-default-template').classList.contains('is-default'), trigger: document.querySelector('.tts-trigger-label').textContent,
  }));
  check(`${T} : un vrai clic sur une étoile d’Organiser déplace le modèle par défaut (Grist : un seul), la fenêtre reste ouverte, la mention suit`, JSON.stringify(await flagged(page)) === '[3]' && afterWin.open && JSON.stringify(afterWin.noted) === '["3"]' && JSON.stringify(afterWin.pressed) === '["3"]', { flags: await flagged(page), afterWin });
  check(`${T} : ... la barre et la liste suivent sans fermer la fenêtre (modèle ouvert sans ★, étoile de la barre éteinte)`, !afterWin.toolbarStar && afterWin.trigger === 'Contrat de vente', afterWin);

  // Au clavier : l'étoile est dans l'ordre de tabulation d'Organiser, activée par Entrée, et elle garde le focus après le redessin.
  // Un .focus() programmatique après un clic de souris n'allume pas :focus-visible : on arrive sur l'étoile par Tab, comme au clavier.
  await page.focus(winStar(4));
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(100);
  const ringWin = await page.evaluate((s) => { const e = document.querySelector(s); return { active: document.activeElement === e, visible: e.matches(':focus-visible'), outline: getComputedStyle(e).outlineWidth, opacity: getComputedStyle(e).opacity }; }, winStar(4));
  check(`${T} : au clavier, l’étoile d’une ligne d’Organiser s’atteint par Tab, avec son anneau de focus, et se montre`, ringWin.active && ringWin.visible && ringWin.outline === '2px' && ringWin.opacity === '1', ringWin);
  await page.keyboard.press('Enter'); await page.waitForTimeout(450);
  const kb = await page.evaluate(() => ({ key: document.activeElement && document.activeElement.dataset.focusKey, inList: document.getElementById('template-organize-list').contains(document.activeElement) }));
  check(`${T} : ... Entrée la pose (un seul modèle marqué) et le focus reste sur cette étoile après le redessin`, JSON.stringify(await flagged(page)) === '[4]' && kb.inList && kb.key === 'default:all:4', { flags: await flagged(page), kb });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check(`${T} : Échap ferme la fenêtre`, !(await modalShown(page)));

  // L'anglais (une fois) : la mention, l'info-bulle et la légende.
  if (theme === 'light') {
    await page.evaluate(() => I18n.setLang('en'));
    await page.waitForTimeout(300);
    await realClick(page, '.tts-trigger');
    const enList = await page.evaluate((s) => { const star = document.querySelector(s); const note = document.querySelector('.tts-popup .tts-default-note'); return { note: note && note.textContent, title: star.title }; }, listStar(4));
    check('anglais : la ligne du modèle par défaut dit « at startup » et l’info-bulle de l’étoile dit son rôle', enList.note === 'at startup' && /when the widget starts/.test(enList.title) && /whole document/.test(enList.title), enList);
    await realClick(page, '#btn-organize-templates', 500);
    const enWin = await page.evaluate(() => {
      const m = document.querySelector('.template-organize-modal-content').getBoundingClientRect(), legend = document.querySelector('.template-organize-legend'), lr = legend.getBoundingClientRect();
      const cr = document.getElementById('template-organize-close').getBoundingClientRect();
      return { text: legend.textContent.trim(), lines: Math.round(lr.height / parseFloat(getComputedStyle(legend).lineHeight)), inside: lr.left >= m.left && lr.right <= m.right && lr.bottom <= m.bottom + 1, clear: lr.right <= cr.left + 1, fits: m.top >= 0 && m.bottom <= innerHeight };
    });
    check('anglais : la légende d’Organiser est en anglais, tient dans la fenêtre sur trois lignes au plus et ne recouvre pas « Close »', /when the widget starts/.test(enWin.text) && /whole document/.test(enWin.text) && enWin.lines <= 3 && enWin.inside && enWin.clear && enWin.fits, enWin);
    await page.screenshot({ path: SHOTS + '/etoile-organiser-en.png' });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.evaluate(() => I18n.setLang('fr'));
  }
  await page.context().close();
}

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
