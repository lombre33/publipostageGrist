#!/usr/bin/env node
// Guide de la Lecture sans ligne (js/reader-guide.js, css/reader-guide.css, img/reader-guide/) à la VRAIE souris, au vrai clavier et à la molette (page.mouse, page.keyboard, Node/Playwright), à la taille du
// panneau Grist d'Antoine (~700x400), en thème clair puis sombre, en français puis en anglais - demande d'Antoine du 2026-10-04 : « en mode lecture, quand le widget n'a pas le select by de configuré, il affiche
// "Aucune ligne sélectionnée" : il faudrait guider l'utilisateur proprement sur ce qu'il faut faire, avec du texte et des captures d'écran, au lieu de ce message ».
// dev-tests/scenarios-reader-guide.js vérifie les états et les textes DANS la page ; ici, ce qui se mesure aux PIXELS et au geste réel : le vrai clic sur Mode lecture, le titre et le début de la première étape dans
// le panneau sans rien faire, les trois étapes atteignables à la molette, rien qui dépasse à droite (700 px comme 420 px), les captures réellement peintes (le bleu de leurs repères à l'écran), un vrai clic et
// Entrée / Espace qui les agrandissent et les rétrécissent, le lien changé en direct (court message puis guide), la ligne qui arrive et efface le guide, aucune image introuvable.
// Lancé par run-headless.mjs (groupe Node "readerGuideMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-reader-guide-mouse.mjs
// (READER_GUIDE_SHOTS=<dossier> y range une capture par étape, à regarder - aucune vérification n'en dépend).
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.READER_GUIDE_MOUSE_PORT || 8903);
const SHOTS = process.env.READER_GUIDE_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-read-mode-mouse.mjs.
async function regenerateHarness() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const stubbed = html.replace(
    '<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>',
    '<script src="dev-tests/grist-stub.js"></script>'
  );
  await writeFile(join(ROOT, '_test-harness.html'), stubbed);
}
await regenerateHarness();
if (SHOTS) await mkdir(SHOTS, { recursive: true });

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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-reader-guide-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const imageRequests = [];
let shotCount = 0;

async function openWidget(colorScheme, lang) {
  // bypassCSP : la politique de sécurité du contenu d'index.html bloquerait les scripts que le harnais injecte (cf. verify-*.mjs voisins) ; elle n'est pas ce que ce script vérifie.
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, colorScheme, bypassCSP: true });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('response', r => { if (/\/img\/reader-guide\//.test(r.url())) imageRequests.push({ url: r.url().replace(/^.*\/img\//, 'img/'), status: r.status() }); });
  page.on('requestfailed', r => { if (/\/img\/reader-guide\//.test(r.url())) imageRequests.push({ url: r.url().replace(/^.*\/img\//, 'img/'), status: 0 }); });
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
  if (lang === 'en') await page.addInitScript(() => { try { localStorage.setItem('pp_lang', 'en'); } catch (e) { /* stockage indisponible */ } });
  // Semé avant le démarrage : un modèle « Facture » enregistré et ouvert par défaut (une variable de la table Clients), une ligne de données - mais AUCUNE ligne sélectionnée par Grist.
  await page.addInitScript(() => {
    window.__preSeedGristStub = (stub) => {
      stub.setVariables('Clients', { Nom: 'Text' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Facture');
      m.Contenu.push('<p>Facture de <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>.</p>');
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  });
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  return { context, page };
}

async function boxOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
  }, selector);
}

// Vrai geste : la souris rejoint le centre de ce que l'on VOIT de l'élément (sa boîte coupée par la fenêtre et, dedans, par le conteneur de la Lecture qui défile : une capture agrandie dépasse du panneau de 400 px
// de haut, son centre géométrique est hors écran) en quelques pas (survol compris), puis clique ; un clic qui n'atterrit pas sur l'élément est signalé.
async function realClick(page, selector) {
  const b = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    let left = Math.max(r.left, 0), top = Math.max(r.top, 0), right = Math.min(r.right, innerWidth), bottom = Math.min(r.bottom, innerHeight);
    const scroller = el.closest('#reader-container');
    if (scroller) { const c = scroller.getBoundingClientRect(); left = Math.max(left, c.left); top = Math.max(top, c.top); right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom); }
    if (right - left < 4 || bottom - top < 4) return { x: -1, y: -1, hit: false };
    const x = (left + right) / 2, y = (top + bottom) / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, hit: !!hit && (hit === el || el.contains(hit)) };
  }, selector);
  if (!b) { check(`le clic vise un élément qui existe (${selector})`, false, {}); return null; }
  if (!b.hit) { check(`le clic atterrit sur l'élément visé (${selector})`, false, b); return b; }
  await page.mouse.move(b.x - 6, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.click(b.x, b.y);
  return b;
}

// À la molette, jusqu'à ce qu'au moins 60 px de l'élément soient dans le conteneur de la Lecture (la souris est garée sur ce conteneur) : à 420 px la barre du haut est plus haute, le guide a moins de place.
async function wheelTo(page, selector) {
  for (let i = 0; i < 20; i++) {
    const visible = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect(), c = el.closest('#reader-container').getBoundingClientRect();
      return Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top);
    }, selector);
    if (visible >= 60) return true;
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(100);
  }
  return false;
}

const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${String(++shotCount).padStart(2, '0')}-${name}.png`) }); };

// Ce que le conteneur de la Lecture montre : sa fenêtre (là où l'on voit), et chaque morceau du guide par rapport à elle.
const view = page => page.evaluate(() => {
  const c = document.getElementById('reader-container');
  const cr = c.getBoundingClientRect();
  const rel = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top - cr.top), bottom: Math.round(r.bottom - cr.top), left: Math.round(r.left - cr.left), right: Math.round(r.right - cr.left), w: Math.round(r.width), h: Math.round(r.height) }; };
  const inView = el => { const r = rel(el); return !!r && r.top >= 0 && r.bottom <= c.clientHeight; };
  const seen = el => { const r = rel(el); return !!r && r.bottom > 0 && r.top < c.clientHeight; };
  const guide = c.querySelector(':scope > .reader-guide');
  return {
    clientW: c.clientWidth, clientH: c.clientHeight, scrollW: c.scrollWidth, scrollH: c.scrollHeight, scrollTop: Math.round(c.scrollTop),
    guide: rel(guide),
    title: { inView: inView(c.querySelector('.reader-guide-title')) },
    steps: Array.from(c.querySelectorAll('.reader-guide-step')).map(s => ({ title: inView(s.querySelector('.reader-guide-step-title')), seen: seen(s), box: rel(s), body: rel(s.querySelector('.reader-guide-step-body')), shot: rel(s.querySelector('.reader-guide-shot')), zoomed: s.classList.contains('is-zoomed') })),
  };
});

// Le bleu des repères d'une capture, compté sur une VRAIE capture d'écran de sa zone (pixels bleus vifs : r < 90, 80 < g < 150, b > 200) : une image cassée, vide ou cachée n'en a aucun.
async function blueOf(page, selector) {
  const b = await boxOf(page, selector);
  if (!b) return null;
  const png = await page.screenshot({ clip: { x: Math.max(0, Math.floor(b.left)), y: Math.max(0, Math.floor(b.top)), width: Math.min(WIDTH - Math.max(0, Math.floor(b.left)), Math.ceil(b.w)), height: Math.min(HEIGHT - Math.max(0, Math.floor(b.top)), Math.ceil(b.h)) } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 90 && d[i + 1] > 80 && d[i + 1] < 150 && d[i + 2] > 200) n++;
    return n;
  }, png.toString('base64'));
}

const fireLinking = (page, linking) => page.evaluate((l) => {
  const s = window.__gristStub.state;
  s.optionsCallback(s.options, { accessLevel: s.accessLevel, linking: l });
}, linking);

const TEXTS = {
  fr: { title: 'Reliez ce widget à votre tableau', short: 'Aucune ligne sélectionnée', stepTitles: ['Mettez votre tableau sur cette page', 'Reliez ce widget au tableau', 'Cliquez sur une ligne du tableau'], zoom: 'Cliquer pour agrandir la capture', unzoom: 'Cliquer pour réduire la capture' },
  en: { title: 'Link this widget to your table', short: 'No row selected', stepTitles: ['Put your table on this page', 'Link this widget to the table', 'Click a row of the table'], zoom: 'Click to enlarge the screenshot', unzoom: 'Click to shrink the screenshot' },
};

async function runPass(theme, lang) {
  const label = `${theme === 'dark' ? 'sombre' : 'clair'}, ${lang === 'en' ? 'anglais' : 'français'}`;
  const T = TEXTS[lang];
  console.log(`\n=== Guide de la Lecture sans ligne à la vraie souris, ${WIDTH}x${HEIGHT}, ${label} ===`);
  const { context, page } = await openWidget(theme, lang);
  const unlinked = { asTarget: null, asSource: false };
  await fireLinking(page, unlinked);

  // Vrai clic sur Mode lecture, aucune ligne sélectionnée : le guide s'affiche (la souris est ensuite garée sur le conteneur, hors du menu qui s'ouvre au survol du bouton).
  await realClick(page, '#btn-mode-read');
  await page.waitForFunction(() => document.getElementById('reader-container').style.display === 'block' && !!document.querySelector('#reader-container > .reader-guide'), null, { timeout: 8000 }).catch(() => {});
  await page.mouse.move(WIDTH / 2, HEIGHT - 60, { steps: 3 });
  await page.waitForTimeout(500);
  await shot(page, `${theme}-${lang}-guide`);
  const first = await view(page);
  const texts = await page.evaluate(() => ({
    title: (document.querySelector('.reader-guide-title') || {}).textContent,
    stepTitles: Array.from(document.querySelectorAll('.reader-guide-step-title')).map(e => e.textContent),
    oldMessage: !!document.querySelector('#reader-container .reader-empty'),
  }));
  check(`${label} - vrai clic sur Mode lecture sans ligne : le guide s'affiche à la place de « ${T.short} », titre et trois étapes dans la langue de l'interface`,
    !!first.guide && !texts.oldMessage && texts.title === T.title && JSON.stringify(texts.stepTitles) === JSON.stringify(T.stepTitles), { texts, guide: first.guide });
  check(`${label} - sans rien faire, le titre et le début de la première étape sont dans le panneau (rien n'est caché sous la barre)`,
    first.title.inView && !!first.steps[0] && first.steps[0].seen && first.steps[0].box.top < first.clientH - 60, { title: first.title, step: first.steps[0] && first.steps[0].box, clientH: first.clientH });
  check(`${label} - le guide tient dans la largeur du panneau : aucun défilement horizontal, la carte ne dépasse pas à droite`,
    first.scrollW <= first.clientW && !!first.guide && first.guide.right <= first.clientW && first.guide.left >= 0, { scrollW: first.scrollW, clientW: first.clientW, guide: first.guide });
  check(`${label} - à 700 px, la capture de chaque étape est à droite de son texte, à 66 % de sa taille`,
    first.steps.length === 3 && first.steps.every(s => s.shot.left >= s.body.right - 1 && s.shot.top <= s.body.top + 40), first.steps.map(s => ({ body: s.body, shot: s.shot })));
  check(`${label} - le guide est plus haut que le panneau : il défile (le conteneur de la Lecture défile)`, first.scrollH > first.clientH + 200, { scrollH: first.scrollH, clientH: first.clientH });
  // Sans guide (ancien code, ou panne), la suite n'a rien à mesurer : les échecs ci-dessus le disent, pas une exception.
  if (first.steps.length !== 3) { await context.close(); return; }

  // La molette : chaque étape devient visible en entier à son tour, jusqu'au bas du guide.
  const reachable = [false, false, false];
  let bottomReached = false;
  for (let i = 0; i < 14 && !bottomReached; i++) {
    const v = await view(page);
    // « Atteinte » : son titre est entier dans le panneau et au moins 60 % de sa capture y est (une étape entière est plus haute que les ~250 px que laisse la barre du haut).
    v.steps.forEach((s, k) => { const shown = Math.min(s.shot.bottom, v.clientH) - Math.max(s.shot.top, 0); if (s.title && shown >= 0.6 * s.shot.h) reachable[k] = true; });
    bottomReached = v.scrollTop + v.clientH >= v.scrollH - 1;
    if (!bottomReached) { await page.mouse.wheel(0, 120); await page.waitForTimeout(120); }
  }
  const bottom = await view(page);
  await shot(page, `${theme}-${lang}-bas`);
  check(`${label} - à la molette, on atteint le bas du guide et la capture de la troisième étape y est entière dans le panneau`,
    bottomReached && bottom.steps[2].shot.top >= 0 && bottom.steps[2].shot.bottom <= bottom.clientH, { bottomReached, last: bottom.steps[2] });
  check(`${label} - à la molette, le titre de chaque étape et l'essentiel de sa capture se lisent ensemble dans le panneau à un moment du défilement`, reachable.every(Boolean), { reachable });
  await page.evaluate(() => { document.getElementById('reader-container').scrollTop = 0; });
  await page.waitForTimeout(150);

  // Les captures sont réellement peintes (le bleu de leurs repères), dans la langue de l'interface, sans fichier introuvable.
  const loaded = await page.evaluate(() => Array.from(document.querySelectorAll('.reader-guide-shot img')).map(i => ({ src: i.getAttribute('src').replace(/\?.*$/, ''), ok: i.complete && i.naturalWidth > 0 })));
  const blue1 = await blueOf(page, '.reader-guide-step:nth-child(1) .reader-guide-shot img');
  check(`${label} - la capture de la première étape est peinte à l'écran (repères bleus visibles) et les trois fichiers ${lang}-1 à ${lang}-3 sont chargés`,
    blue1 > 40 && loaded.length === 3 && loaded.every((s, i) => s.ok && s.src === `img/reader-guide/${lang}-${i + 1}.png`), { blue1, loaded });

  // Un vrai clic sur la première capture l'agrandit à sa taille réelle, sans déborder ; un second la rétrécit.
  const before = (await view(page)).steps[0];
  await realClick(page, '.reader-guide-step:nth-child(1) .reader-guide-shot');
  await page.waitForTimeout(200);
  const zoomed = await view(page);
  const state = await page.evaluate(() => { const b = document.querySelector('.reader-guide-step:nth-child(1) .reader-guide-shot'); return { pressed: b.getAttribute('aria-pressed'), title: b.title }; });
  await shot(page, `${theme}-${lang}-agrandi`);
  check(`${label} - un vrai clic sur la capture l'affiche à sa taille réelle (470 px) sous le texte, sans défilement horizontal`,
    zoomed.steps[0].zoomed && Math.abs(zoomed.steps[0].shot.w - 472) <= 4 && zoomed.steps[0].shot.top >= zoomed.steps[0].body.bottom - 1 && zoomed.scrollW <= zoomed.clientW && zoomed.steps[0].shot.right <= zoomed.clientW
      && state.pressed === 'true' && state.title === T.unzoom && before.shot.w < 330, { before: before.shot, zoomed: zoomed.steps[0].shot, state, scrollW: zoomed.scrollW });
  // Elle change de place en grandissant : le panneau la suit, elle remplit l'écran autant qu'elle le peut au lieu de partir sous le bord du panneau.
  const zs = zoomed.steps[0].shot;
  const visibleH = Math.min(zs.bottom, zoomed.clientH) - Math.max(zs.top, 0);
  check(`${label} - la capture agrandie reste à l'écran après le clic (le panneau la suit)`, visibleH >= Math.min(zs.h, zoomed.clientH) - 4, { zoomed: zs, clientH: zoomed.clientH, visibleH });
  await realClick(page, '.reader-guide-step:nth-child(1) .reader-guide-shot');
  await page.waitForTimeout(200);
  const shrunk = await view(page);
  check(`${label} - un second clic la rétrécit : même largeur qu'avant, à droite du texte`, !shrunk.steps[0].zoomed && Math.abs(shrunk.steps[0].shot.w - before.shot.w) <= 1 && shrunk.steps[0].shot.left >= shrunk.steps[0].body.right - 1, { before: before.shot, shrunk: shrunk.steps[0].shot });

  // Au vrai clavier : le bouton atteint par le focus, Entrée agrandit, Espace rétrécit.
  await page.evaluate(() => document.querySelector('.reader-guide-step:nth-child(2) .reader-guide-shot').focus());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const afterEnter = (await view(page)).steps[1].zoomed;
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const afterSpace = (await view(page)).steps[1].zoomed;
  check(`${label} - au vrai clavier, Entrée agrandit la capture de la deuxième étape et Espace la rétrécit`, afterEnter === true && afterSpace === false, { afterEnter, afterSpace });

  // Le lien change en direct : « Sélectionner par » choisi -> le court message ; vidé -> le guide revient.
  await fireLinking(page, { asTarget: 'Cursor:Same-Table', asSource: false });
  await page.waitForTimeout(200);
  const linked = await page.evaluate(() => ({ guide: !!document.querySelector('#reader-container > .reader-guide'), title: (document.querySelector('#reader-container .reader-empty-title') || {}).textContent, visible: (() => { const e = document.querySelector('#reader-container .reader-empty-title'); if (!e) return false; const r = e.getBoundingClientRect(); const c = document.getElementById('reader-container').getBoundingClientRect(); return r.top >= c.top && r.bottom <= c.bottom; })() }));
  await shot(page, `${theme}-${lang}-relie`);
  check(`${label} - « Sélectionner par » choisi dans Grist : le guide laisse la place au court message « ${T.short} », visible dans le panneau`, !linked.guide && linked.title === T.short && linked.visible, linked);
  await fireLinking(page, unlinked);
  await page.waitForTimeout(200);
  const again = await page.evaluate(() => !!document.querySelector('#reader-container > .reader-guide') && !document.querySelector('#reader-container .reader-empty'));
  check(`${label} - « Sélectionner par » vidé : le guide revient`, again, { again });

  // La ligne arrive (un clic dans le tableau relié) : le document remplace le guide ; à 420 px de large le guide, lui, ne déborde pas (capture sous le texte).
  await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients'));
  await page.waitForFunction(() => { const c = document.querySelector('#reader-container .reader-content'); return !!c && (c.textContent || '').indexOf('Dupont') !== -1; }, null, { timeout: 8000 }).catch(() => {});
  const arrived = await page.evaluate(() => ({ guide: !!document.querySelector('#reader-container .reader-guide'), message: !!document.querySelector('#reader-container .reader-empty'), text: (document.querySelector('#reader-container .reader-content') || {}).textContent }));
  await shot(page, `${theme}-${lang}-document`);
  check(`${label} - une ligne arrive : le document « Facture de Dupont » remplace le guide`, !arrived.guide && !arrived.message && /Dupont/.test(arrived.text || ''), arrived);

  await context.close();
}

// Un panneau plus étroit que 700 px : la capture passe sous le texte, rien ne déborde.
async function runNarrow() {
  console.log(`\n=== Guide de la Lecture sans ligne, panneau étroit (420x${HEIGHT}), clair, français ===`);
  const { context, page } = await openWidget('light', 'fr');
  await fireLinking(page, { asTarget: null, asSource: false });
  await page.setViewportSize({ width: 420, height: HEIGHT });
  await realClick(page, '#btn-mode-read');
  await page.waitForFunction(() => !!document.querySelector('#reader-container > .reader-guide'), null, { timeout: 8000 }).catch(() => {});
  await page.mouse.move(210, HEIGHT - 60, { steps: 3 });
  await page.waitForTimeout(500);
  await shot(page, 'etroit');
  const v = await view(page);
  check('panneau de 420 px : aucun défilement horizontal, la carte tient dans le panneau', v.scrollW <= v.clientW && !!v.guide && v.guide.right <= v.clientW, { scrollW: v.scrollW, clientW: v.clientW, guide: v.guide });
  check('panneau de 420 px : la capture de chaque étape passe sous son texte, entière dans la carte', v.steps.length === 3 && v.steps.every(s => s.shot.top >= s.body.bottom - 1 && s.shot.right <= v.guide.right), v.steps.map(s => ({ body: s.body, shot: s.shot })));
  await wheelTo(page, '.reader-guide-step:nth-child(1) .reader-guide-shot');
  await realClick(page, '.reader-guide-step:nth-child(1) .reader-guide-shot');
  await page.waitForTimeout(200);
  const z = await view(page);
  check('panneau de 420 px : une capture agrandie se réduit à la largeur de la carte, sans défilement horizontal', z.steps[0].zoomed && z.scrollW <= z.clientW && z.steps[0].shot.right <= z.guide.right, { scrollW: z.scrollW, clientW: z.clientW, shot: z.steps[0].shot, guide: z.guide });
  const zs = z.steps[0].shot;
  check('panneau de 420 px : la capture agrandie reste à l\'écran après le clic', Math.min(zs.bottom, z.clientH) - Math.max(zs.top, 0) >= Math.min(zs.h, z.clientH) - 4, { zoomed: zs, clientH: z.clientH });
  await context.close();
}

await runPass('light', 'fr');
await runPass('dark', 'fr');
await runPass('light', 'en');
await runPass('dark', 'en');
await runNarrow();
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);
const missing = imageRequests.filter(r => r.status !== 200);
check('les six captures sont servies (aucune image introuvable ni refusée)', imageRequests.length >= 6 && missing.length === 0, { requested: imageRequests.length, missing });

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
