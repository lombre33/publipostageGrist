#!/usr/bin/env node
// Guide de la Lecture sans ligne (js/reader-guide.js, css/reader-guide.css, img/reader-guide/) à la VRAIE souris, au vrai clavier et à la molette (page.mouse, page.keyboard, Node/Playwright), à la taille du
// panneau Grist d'Antoine (~700x400), en thème clair puis sombre, en français puis en anglais - demande d'Antoine du 2026-10-04 : « en mode lecture, quand le widget n'a pas le select by de configuré, il affiche
// "Aucune ligne sélectionnée" : il faudrait guider l'utilisateur proprement sur ce qu'il faut faire, avec du texte et des captures d'écran, au lieu de ce message ».
// dev-tests/scenarios-reader-guide.js vérifie les états et les textes DANS la page ; ici, ce qui se mesure aux PIXELS et au geste réel : le vrai clic sur Mode lecture, le titre et le début de la première étape dans
// le panneau sans rien faire, les quatre étapes atteignables à la molette (accès complet au widget, tableau sur la page, « Sélectionner par », ligne choisie), rien qui dépasse à droite (700 px comme 420 px), les captures réellement peintes (le bleu de leurs repères à l'écran), un vrai clic et
// Entrée / Espace qui les agrandissent et les rétrécissent, le lien changé en direct (court message puis guide), un widget relié mais sans accès complet (la carte réduite à l'étape de l'accès,
// capture peinte et cliquable, puis le court message une fois l'accès accordé), la ligne qui arrive et efface le guide, aucune image introuvable.
// Même carte dans l'éditeur (demande d'Antoine du 2026-10-05 : « tout ce que tu affiches dans le mode lecture tant que le widget n'a pas les bons accès, est-ce que tu pourras l'afficher aussi en mode éditeur
// au moins la partie sur les droits d'accès ? car pour l'instant seul un message "échec de l'enregistrement" est présent ») : le widget démarre pour de vrai SANS accès complet (le faux Grist refuse alors
// listTables, fetchTable et applyUserActions comme le vrai : « Access not granted. Current access level none »), sans un seul geste la carte de l'accès est dans le panneau à la place du document, le titre
// et le début de l'étape se lisent, la capture est peinte, la molette atteint la fin de la carte, un vrai clic sur Tableau n'insère rien (barre grisée), Lecture puis Édition ramènent la carte, l'accès
// accordé rend le document, en clair et en sombre, en français et en anglais, puis à 420 px.
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

async function openWidget(colorScheme, lang, access) {
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
  await page.addInitScript((level) => {
    window.__preSeedGristStub = (stub) => {
      // Un accès au départ qui n'est pas complet : le widget démarre comme dans un Grist qui ne le lui a pas accordé (le niveau arrive par onOptions) et chaque appel GristDocAPI est refusé, comme le vrai
      // (WidgetFrame.ts de grist-core : tout GristDocAPI exige l'accès complet).
      if (level) {
        stub.state.accessLevel = level;
        for (const name of ['listTables', 'fetchTable', 'applyUserActions', 'getAccessToken']) {
          const real = window.grist.docApi[name];
          window.grist.docApi[name] = function () {
            if (stub.state.accessLevel !== 'full') return Promise.reject(new Error('Access not granted. Current access level ' + stub.state.accessLevel));
            return real.apply(this, arguments);
          };
        }
      }
      stub.setVariables('Clients', { Nom: 'Text' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Facture');
      m.Contenu.push('<p>Facture de <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>.</p>');
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  }, access || null);
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  // Sans accès complet le démarrage peut ne jamais dire « prêt » (sur un code qui ne sait pas cet état) : on ne s'arrête pas là, les vérifications échouent chacune à leur tour.
  const ready = page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: access ? 20000 : 90000 });
  await (access ? ready.catch(() => {}) : ready);
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
    const scroller = el.closest('#reader-container, #access-guide-container');
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
      if (!el) return null;
      const r = el.getBoundingClientRect(), c = el.closest('#reader-container, #access-guide-container').getBoundingClientRect();
      return Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top);
    }, selector);
    if (visible === null) return false;
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
    steps: Array.from(c.querySelectorAll('.reader-guide-step')).map(s => ({ title: inView(s.querySelector('.reader-guide-step-title')), lead: inView(s.querySelector('.reader-guide-lead')), leadText: ((s.querySelector('.reader-guide-lead') || {}).textContent || '').trim(), seen: seen(s), box: rel(s), body: rel(s.querySelector('.reader-guide-step-body')), shot: rel(s.querySelector('.reader-guide-shot')), zoomed: s.classList.contains('is-zoomed') })),
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

const fireLinking = (page, linking, accessLevel) => page.evaluate(([l, level]) => {
  const s = window.__gristStub.state;
  s.optionsCallback(s.options, { accessLevel: level || s.accessLevel, linking: l });
}, [linking, accessLevel || null]);

const TEXTS = {
  fr: { title: 'Reliez ce widget à votre tableau', short: 'Aucune ligne sélectionnée', stepTitles: ['Donnez l’accès complet à ce widget', 'Mettez votre tableau sur cette page', 'Reliez ce widget au tableau', 'Cliquez sur une ligne du tableau'], pickLead: 'Le tableau est vide ? Ajoutez-y d’abord une ligne.', accessOnlyLead: 'Cliquez sur ce widget pour le sélectionner : Grist ouvre son panneau de droite.', zoom: 'Cliquer pour agrandir la capture', unzoom: 'Cliquer pour réduire la capture' },
  en: { title: 'Link this widget to your table', short: 'No row selected', stepTitles: ['Give this widget full access', 'Put your table on this page', 'Link this widget to the table', 'Click a row of the table'], pickLead: 'Is the table empty? Add a row to it first.', accessOnlyLead: 'Click this widget to select it: Grist opens its right-hand panel.', zoom: 'Click to enlarge the screenshot', unzoom: 'Click to shrink the screenshot' },
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
  check(`${label} - vrai clic sur Mode lecture sans ligne : le guide s'affiche à la place de « ${T.short} », titre et quatre étapes dans la langue de l'interface`,
    !!first.guide && !texts.oldMessage && texts.title === T.title && JSON.stringify(texts.stepTitles) === JSON.stringify(T.stepTitles), { texts, guide: first.guide });
  check(`${label} - sans rien faire, le titre et le début de la première étape sont dans le panneau (rien n'est caché sous la barre)`,
    first.title.inView && !!first.steps[0] && first.steps[0].seen && first.steps[0].box.top < first.clientH - 60, { title: first.title, step: first.steps[0] && first.steps[0].box, clientH: first.clientH });
  check(`${label} - le guide tient dans la largeur du panneau : aucun défilement horizontal, la carte ne dépasse pas à droite`,
    first.scrollW <= first.clientW && !!first.guide && first.guide.right <= first.clientW && first.guide.left >= 0, { scrollW: first.scrollW, clientW: first.clientW, guide: first.guide });
  check(`${label} - à 700 px, la capture de chaque étape est à droite de son texte, à 66 % de sa taille`,
    first.steps.length === 4 && first.steps.every(s => s.shot.left >= s.body.right - 1 && s.shot.top <= s.body.top + 40), first.steps.map(s => ({ body: s.body, shot: s.shot })));
  check(`${label} - le guide est plus haut que le panneau : il défile (le conteneur de la Lecture défile)`, first.scrollH > first.clientH + 200, { scrollH: first.scrollH, clientH: first.clientH });
  // Sans guide (ancien code, ou panne), la suite n'a rien à mesurer : les échecs ci-dessus le disent, pas une exception.
  if (first.steps.length !== 4) { await context.close(); return; }

  // La molette : chaque étape devient visible en entier à son tour, jusqu'au bas du guide.
  const reachable = [false, false, false, false];
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
  check(`${label} - à la molette, on atteint le bas du guide et la capture de la quatrième étape y est entière dans le panneau`,
    bottomReached && bottom.steps[3].shot.top >= 0 && bottom.steps[3].shot.bottom <= bottom.clientH, { bottomReached, last: bottom.steps[3] });
  check(`${label} - à la molette, le titre de chaque étape et l'essentiel de sa capture se lisent ensemble dans le panneau à un moment du défilement`, reachable.every(Boolean), { reachable });
  check(`${label} - au bas du guide, la phrase de la quatrième étape (« ${T.pickLead} ») se lit en entier dans le panneau, avec sa capture`, bottom.steps[3].lead && bottom.steps[3].leadText === T.pickLead, { lead: bottom.steps[3].lead, text: bottom.steps[3].leadText });
  await page.evaluate(() => { document.getElementById('reader-container').scrollTop = 0; });
  await page.waitForTimeout(150);

  // Les captures sont réellement peintes (le bleu de leurs repères), dans la langue de l'interface, sans fichier introuvable.
  const loaded = await page.evaluate(() => Array.from(document.querySelectorAll('.reader-guide-shot img')).map(i => ({ src: i.getAttribute('src').replace(/\?.*$/, ''), ok: i.complete && i.naturalWidth > 0 })));
  const blue1 = await blueOf(page, '.reader-guide-step:nth-child(1) .reader-guide-shot img');
  check(`${label} - la capture de la première étape (l'accès complet) est peinte à l'écran (repères bleus visibles) et les quatre fichiers ${lang}-1 à ${lang}-4 sont chargés`,
    blue1 > 40 && loaded.length === 4 && loaded.every((s, i) => s.ok && s.src === `img/reader-guide/${lang}-${i + 1}.png`), { blue1, loaded });

  // Un vrai clic sur la capture de la deuxième étape (la plus large, 470 px) l'agrandit à sa taille réelle, sans déborder ; un second la rétrécit. La molette la met d'abord dans le panneau.
  await wheelTo(page, '.reader-guide-step:nth-child(2) .reader-guide-shot');
  const before = (await view(page)).steps[1];
  await realClick(page, '.reader-guide-step:nth-child(2) .reader-guide-shot');
  await page.waitForTimeout(200);
  const zoomed = await view(page);
  const state = await page.evaluate(() => { const b = document.querySelector('.reader-guide-step:nth-child(2) .reader-guide-shot'); return { pressed: b.getAttribute('aria-pressed'), title: b.title }; });
  await shot(page, `${theme}-${lang}-agrandi`);
  check(`${label} - un vrai clic sur la capture l'affiche à sa taille réelle (470 px) sous le texte, sans défilement horizontal`,
    zoomed.steps[1].zoomed && Math.abs(zoomed.steps[1].shot.w - 472) <= 4 && zoomed.steps[1].shot.top >= zoomed.steps[1].body.bottom - 1 && zoomed.scrollW <= zoomed.clientW && zoomed.steps[1].shot.right <= zoomed.clientW
      && state.pressed === 'true' && state.title === T.unzoom && before.shot.w < 330, { before: before.shot, zoomed: zoomed.steps[1].shot, state, scrollW: zoomed.scrollW });
  // Elle change de place en grandissant : le panneau la suit, elle remplit l'écran autant qu'elle le peut au lieu de partir sous le bord du panneau.
  const zs = zoomed.steps[1].shot;
  const visibleH = Math.min(zs.bottom, zoomed.clientH) - Math.max(zs.top, 0);
  check(`${label} - la capture agrandie reste à l'écran après le clic (le panneau la suit)`, visibleH >= Math.min(zs.h, zoomed.clientH) - 4, { zoomed: zs, clientH: zoomed.clientH, visibleH });
  await realClick(page, '.reader-guide-step:nth-child(2) .reader-guide-shot');
  await page.waitForTimeout(200);
  const shrunk = await view(page);
  check(`${label} - un second clic la rétrécit : même largeur qu'avant, à droite du texte`, !shrunk.steps[1].zoomed && Math.abs(shrunk.steps[1].shot.w - before.shot.w) <= 1 && shrunk.steps[1].shot.left >= shrunk.steps[1].body.right - 1, { before: before.shot, shrunk: shrunk.steps[1].shot });

  // Au vrai clavier : le bouton atteint par le focus, Entrée agrandit, Espace rétrécit (troisième étape).
  await page.evaluate(() => document.querySelector('.reader-guide-step:nth-child(3) .reader-guide-shot').focus());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const afterEnter = (await view(page)).steps[2].zoomed;
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const afterSpace = (await view(page)).steps[2].zoomed;
  check(`${label} - au vrai clavier, Entrée agrandit la capture de la troisième étape et Espace la rétrécit`, afterEnter === true && afterSpace === false, { afterEnter, afterSpace });

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

  // Relié mais SANS accès complet (Grist n'envoie aucune ligne : « Aucune ligne sélectionnée » serait faux) : la carte se réduit à l'étape de l'accès - choix d'Antoine du 2026-10-04, « Étape accès seule ».
  await fireLinking(page, { asTarget: 'Cursor:Same-Table', asSource: false }, 'none');
  await page.waitForFunction(() => document.querySelectorAll('#reader-container .reader-guide-step').length === 1, null, { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => { document.getElementById('reader-container').scrollTop = 0; });
  await page.waitForTimeout(250);
  const only = await view(page);
  const onlyTexts = await page.evaluate(() => ({ title: (document.querySelector('.reader-guide-title') || {}).textContent, eyebrows: document.querySelectorAll('.reader-guide-eyebrow').length, stepTitles: document.querySelectorAll('.reader-guide-step-title').length, message: !!document.querySelector('#reader-container .reader-empty'), lead: (document.querySelector('.reader-guide-lead') || {}).textContent, img: (document.querySelector('.reader-guide-shot img') || { getAttribute: () => '' }).getAttribute('src').replace(/\?.*$/, '') }));
  await shot(page, `${theme}-${lang}-acces-seul`);
  check(`${label} - relié mais sans accès complet : la carte se réduit à l'étape « ${T.stepTitles[0]} », seule, sans « Étape n » ni titre propre, au lieu de « ${T.short} »`,
    only.steps.length === 1 && onlyTexts.title === T.stepTitles[0] && onlyTexts.eyebrows === 0 && onlyTexts.stepTitles === 0 && !onlyTexts.message && onlyTexts.lead === T.accessOnlyLead, { onlyTexts, steps: only.steps.length });
  check(`${label} - relié sans accès complet : le titre et le début de l'étape sont dans le panneau, rien ne dépasse à droite`,
    only.title.inView && only.steps.length === 1 && only.steps[0].seen && only.steps[0].box.top < only.clientH - 60 && only.scrollW <= only.clientW && only.guide.right <= only.clientW && only.guide.left >= 0, { title: only.title, step: only.steps[0] && only.steps[0].box, scrollW: only.scrollW, clientW: only.clientW });
  const onlyBlue = await blueOf(page, '.reader-guide-step .reader-guide-shot img');
  check(`${label} - relié sans accès complet : la capture ${lang}-1 est peinte à l'écran (repères bleus visibles), à droite du texte, à 66 % de sa taille`,
    onlyBlue > 40 && onlyTexts.img === `img/reader-guide/${lang}-1.png` && only.steps.length === 1 && only.steps[0].shot.left >= only.steps[0].body.right - 1 && only.steps[0].shot.w < 175, { onlyBlue, img: onlyTexts.img, shot: only.steps[0] && only.steps[0].shot });
  await realClick(page, '.reader-guide-step .reader-guide-shot');
  await page.waitForTimeout(200);
  const onlyZoom = await view(page);
  check(`${label} - relié sans accès complet : un vrai clic agrandit la capture à sa taille réelle (244 px), sans défilement horizontal`,
    onlyZoom.steps.length === 1 && onlyZoom.steps[0].zoomed && Math.abs(onlyZoom.steps[0].shot.w - 244) <= 4 && onlyZoom.scrollW <= onlyZoom.clientW && onlyZoom.steps[0].shot.right <= onlyZoom.clientW, { shot: onlyZoom.steps[0] && onlyZoom.steps[0].shot, scrollW: onlyZoom.scrollW });
  // L'accès accordé (Grist renvoie les options) : le court message prend la place, sans rendu demandé ; puis tout revient comme avant ce bloc.
  await fireLinking(page, { asTarget: 'Cursor:Same-Table', asSource: false }, 'full');
  await page.waitForTimeout(250);
  const granted = await page.evaluate(() => ({ guide: !!document.querySelector('#reader-container > .reader-guide'), title: (document.querySelector('#reader-container .reader-empty-title') || {}).textContent }));
  check(`${label} - l'accès complet accordé : l'étape laisse la place au court message « ${T.short} », sans recharger`, !granted.guide && granted.title === T.short, granted);
  await fireLinking(page, unlinked);
  await page.waitForTimeout(200);

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
  check('panneau de 420 px : la capture de chaque étape passe sous son texte, entière dans la carte', v.steps.length === 4 && v.steps.every(s => s.shot.top >= s.body.bottom - 1 && s.shot.right <= v.guide.right), v.steps.map(s => ({ body: s.body, shot: s.shot })));
  // La plus large capture (deuxième étape, 470 px) : c'est elle qui risque de déborder.
  await wheelTo(page, '.reader-guide-step:nth-child(2) .reader-guide-shot');
  await realClick(page, '.reader-guide-step:nth-child(2) .reader-guide-shot');
  await page.waitForTimeout(200);
  const z = await view(page);
  check('panneau de 420 px : une capture agrandie se réduit à la largeur de la carte, sans défilement horizontal', z.steps[1].zoomed && z.scrollW <= z.clientW && z.steps[1].shot.right <= z.guide.right, { scrollW: z.scrollW, clientW: z.clientW, shot: z.steps[1].shot, guide: z.guide });
  const zs = z.steps[1].shot;
  check('panneau de 420 px : la capture agrandie reste à l\'écran après le clic', Math.min(zs.bottom, z.clientH) - Math.max(zs.top, 0) >= Math.min(zs.h, z.clientH) - 4, { zoomed: zs, clientH: z.clientH });
  // Relié mais sans accès complet : l'étape de l'accès seule, sa capture sous le texte et dans la carte.
  await fireLinking(page, { asTarget: 'Cursor:Same-Table', asSource: false }, 'none');
  await page.waitForFunction(() => document.querySelectorAll('#reader-container .reader-guide-step').length === 1, null, { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => { document.getElementById('reader-container').scrollTop = 0; });
  await page.waitForTimeout(250);
  const only = await view(page);
  await shot(page, 'etroit-acces-seul');
  check('panneau de 420 px, relié sans accès complet : une seule étape, aucun défilement horizontal, sa capture passe sous le texte, entière dans la carte', only.steps.length === 1 && only.scrollW <= only.clientW && only.guide.right <= only.clientW && only.steps[0].shot.top >= only.steps[0].body.bottom - 1 && only.steps[0].shot.right <= only.guide.right, { steps: only.steps.length, scrollW: only.scrollW, clientW: only.clientW, step: only.steps[0] && { body: only.steps[0].body, shot: only.steps[0].shot }, guide: only.guide });
  await context.close();
}

// --- L'éditeur sans accès complet : le widget démarre pour de vrai sans l'accès que Grist lui a demandé (openWidget(..., 'none')).
const EDITOR_TEXTS = {
  fr: { title: 'Donnez l’accès complet à ce widget', intro: 'Ce widget a besoin de l’accès complet au document pour lire et enregistrer vos modèles.', lead: 'Cliquez sur ce widget pour le sélectionner : Grist ouvre son panneau de droite.', readTitle: 'Reliez ce widget à votre tableau', unzoom: 'Cliquer pour réduire la capture' },
  en: { title: 'Give this widget full access', intro: 'This widget needs full access to the document to read and save your templates.', lead: 'Click this widget to select it: Grist opens its right-hand panel.', readTitle: 'Link this widget to your table', unzoom: 'Click to shrink the screenshot' },
};

// Ce que montre le conteneur de la carte de l'accès (#access-guide-container, dans l'éditeur) : sa fenêtre, et chaque morceau de la carte par rapport à elle.
const accessView = page => page.evaluate(() => {
  const c = document.getElementById('access-guide-container');
  if (!c) return null;
  const cr = c.getBoundingClientRect();
  const rel = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top - cr.top), bottom: Math.round(r.bottom - cr.top), left: Math.round(r.left - cr.left), right: Math.round(r.right - cr.left), w: Math.round(r.width), h: Math.round(r.height) }; };
  const inView = el => { const r = rel(el); return !!r && r.top >= 0 && r.bottom <= c.clientHeight; };
  const seen = el => { const r = rel(el); return !!r && r.bottom > 0 && r.top < c.clientHeight; };
  const card = c.querySelector(':scope > .reader-guide');
  const step = c.querySelector('.reader-guide-step');
  const shotBtn = c.querySelector('.reader-guide-shot');
  const editor = document.getElementById('editor-container');
  const tiptap = document.querySelector('#editor-container .tiptap');
  const bar = Array.from(document.querySelectorAll('#v2-toolbar > *')).filter(e => e.id !== 'v2-btn-comment');
  const txt = sel => { const e = c.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
  return {
    shown: getComputedStyle(c).display !== 'none', clientW: c.clientWidth, clientH: c.clientHeight, scrollW: c.scrollWidth, scrollH: c.scrollHeight, scrollTop: Math.round(c.scrollTop),
    containerTop: Math.round(cr.top), card: rel(card),
    title: txt('.reader-guide-title'), titleInView: inView(c.querySelector('.reader-guide-title')), intro: txt('.reader-guide-intro'), lead: txt('.reader-guide-lead'), leadInView: inView(c.querySelector('.reader-guide-lead')),
    steps: c.querySelectorAll('.reader-guide-step').length, eyebrows: c.querySelectorAll('.reader-guide-eyebrow').length, marks: Array.from(c.querySelectorAll('.reader-guide-mark-text')).map(e => ({ text: e.textContent.trim(), inView: inView(e) })),
    seenStep: seen(step), stepBox: rel(step), body: rel(c.querySelector('.reader-guide-step-body')), shot: rel(shotBtn), zoomed: !!step && step.classList.contains('is-zoomed'),
    pressed: shotBtn ? shotBtn.getAttribute('aria-pressed') : null, shotTitle: shotBtn ? shotBtn.title : null,
    img: c.querySelector('.reader-guide-shot img') ? c.querySelector('.reader-guide-shot img').getAttribute('src').replace(/\?.*$/, '') : null,
    editorShown: !!editor && getComputedStyle(editor).display !== 'none', tiptapW: tiptap ? Math.round(tiptap.getBoundingClientRect().width) : 0, tiptapH: tiptap ? Math.round(tiptap.getBoundingClientRect().height) : 0,
    barLocked: bar.length > 0 && bar.every(e => e.classList.contains('pp-access-locked')), barFree: bar.length > 0 && bar.every(e => !e.classList.contains('pp-access-locked')),
    html: typeof Editor !== 'undefined' ? Editor.getHTML() : null,
  };
});
const setAccess = (page, level) => page.evaluate(l => window.__gristStub.setAccessLevel(l), level);

async function runEditorAccess(theme, lang) {
  const label = `${theme === 'dark' ? 'sombre' : 'clair'}, ${lang === 'en' ? 'anglais' : 'français'}`;
  const T = EDITOR_TEXTS[lang];
  console.log(`\n=== Éditeur sans accès complet à la vraie souris, ${WIDTH}x${HEIGHT}, ${label} ===`);
  const { context, page } = await openWidget(theme, lang, 'none');
  await page.mouse.move(WIDTH / 2, HEIGHT - 60, { steps: 3 });
  await page.waitForTimeout(600);
  await shot(page, `${theme}-${lang}-editeur-sans-acces`);
  const first = await accessView(page);

  // Sans un seul geste : la carte est dans le panneau, à la place du document.
  check(`${label} - le widget démarré sans accès complet montre, sans un geste, la carte « ${T.title} » à la place du document`,
    !!first && first.shown && first.card !== null && first.title === T.title && !first.editorShown && first.steps === 1 && first.eyebrows === 0, first && { shown: first.shown, title: first.title, editorShown: first.editorShown, steps: first.steps });
  if (!first || !first.card) { await context.close(); return; }
  check(`${label} - l'introduction dit ce que l'accès manquant empêche (lire et enregistrer les modèles), la phrase dit où cliquer`, first.intro === T.intro && first.lead === T.lead, { intro: first.intro, lead: first.lead });
  check(`${label} - le titre et le début de l'étape sont dans le panneau, sous la barre du haut (rien n'est caché dessous)`,
    first.titleInView && first.seenStep && first.stepBox.top < first.clientH - 40 && first.containerTop > 60, { titleInView: first.titleInView, step: first.stepBox, clientH: first.clientH, containerTop: first.containerTop });
  check(`${label} - la carte tient dans la largeur du panneau : aucun défilement horizontal, rien ne dépasse à droite`,
    first.scrollW <= first.clientW && first.card.right <= first.clientW && first.card.left >= 0, { scrollW: first.scrollW, clientW: first.clientW, card: first.card });
  check(`${label} - la capture ${lang}-1 est à droite du texte, à 66 % de sa taille`, first.img === `img/reader-guide/${lang}-1.png` && first.shot.left >= first.body.right - 1 && first.shot.w < 175, { img: first.img, shot: first.shot, body: first.body });
  const blue = await blueOf(page, '#access-guide-container .reader-guide-shot img');
  check(`${label} - la capture est réellement peinte à l'écran (repères bleus visibles)`, blue > 40, { blue });
  check(`${label} - la barre de mise en forme est grisée, le document n'est pas à l'écran`, first.barLocked && !first.barFree && first.tiptapH === 0, { barLocked: first.barLocked, tiptapH: first.tiptapH });

  // Un vrai clic sur « Tableau » (la barre est grisée, l'éditeur masqué) n'insère rien dans le document caché.
  const tableBox = await boxOf(page, '#v2-btn-table');
  const htmlBefore = first.html;
  if (tableBox) { await page.mouse.move(tableBox.x - 4, tableBox.y, { steps: 2 }); await page.mouse.click(tableBox.x, tableBox.y); }
  await page.waitForTimeout(250);
  const afterTable = await accessView(page);
  check(`${label} - un vrai clic sur « Tableau » n'insère rien dans le document masqué`, !!tableBox && afterTable.html === htmlBefore && !/<table/.test(afterTable.html || ''), { before: htmlBefore, after: afterTable.html });

  // La molette (la souris revient sur la carte : le clic sur « Tableau » l'a laissée sur la barre) : jusqu'au bas de la carte, les trois repères et la capture se lisent dans le panneau.
  await page.mouse.move(WIDTH / 2, HEIGHT - 60, { steps: 3 });
  const reached = { marks: [false, false, false], shot: false };
  let bottomReached = false;
  for (let i = 0; i < 12 && !bottomReached; i++) {
    const v = await accessView(page);
    v.marks.forEach((m, k) => { if (m.inView) reached.marks[k] = true; });
    if (Math.min(v.shot.bottom, v.clientH) - Math.max(v.shot.top, 0) >= 0.6 * v.shot.h) reached.shot = true;
    bottomReached = v.scrollTop + v.clientH >= v.scrollH - 1;
    if (!bottomReached) { await page.mouse.wheel(0, 100); await page.waitForTimeout(100); }
  }
  const bottomView = await accessView(page);
  bottomReached = bottomReached || bottomView.scrollTop + bottomView.clientH >= bottomView.scrollH - 1;
  await shot(page, `${theme}-${lang}-editeur-sans-acces-bas`);
  check(`${label} - à la molette, on atteint le bas de la carte : les trois repères et l'essentiel de la capture se lisent dans le panneau`, bottomReached && reached.marks.every(Boolean) && reached.shot, { bottomReached, reached });
  await page.evaluate(() => { document.getElementById('access-guide-container').scrollTop = 0; });
  await page.waitForTimeout(150);

  // Un vrai clic sur la capture l'affiche à sa taille réelle (244 px), un second la rétrécit.
  await realClick(page, '#access-guide-container .reader-guide-shot');
  await page.waitForTimeout(200);
  const zoomed = await accessView(page);
  check(`${label} - un vrai clic sur la capture l'affiche à sa taille réelle (244 px), sans défilement horizontal`, zoomed.zoomed && Math.abs(zoomed.shot.w - 244) <= 4 && zoomed.pressed === 'true' && zoomed.shotTitle === T.unzoom && zoomed.scrollW <= zoomed.clientW, { shot: zoomed.shot, pressed: zoomed.pressed, title: zoomed.shotTitle, scrollW: zoomed.scrollW });
  await realClick(page, '#access-guide-container .reader-guide-shot');
  await page.waitForTimeout(200);
  const shrunk = await accessView(page);
  check(`${label} - un second clic la rétrécit`, !shrunk.zoomed && shrunk.shot.w < 175, { shot: shrunk.shot });

  // Lecture : la carte de la Lecture (le guide), pas celle de l'éditeur ; Édition : la carte de l'accès revient.
  await realClick(page, '#btn-mode-read');
  await page.waitForFunction(() => !!document.querySelector('#reader-container > .reader-guide'), null, { timeout: 8000 }).catch(() => {});
  await page.mouse.move(WIDTH / 2, HEIGHT - 60, { steps: 3 });
  await page.waitForTimeout(300);
  const reading = await page.evaluate(() => ({
    readerShown: getComputedStyle(document.getElementById('reader-container')).display !== 'none',
    readerTitle: (document.querySelector('#reader-container .reader-guide-title') || {}).textContent || null,
    hostShown: getComputedStyle(document.getElementById('access-guide-container')).display !== 'none', hostEmpty: document.getElementById('access-guide-container').childElementCount === 0,
  }));
  check(`${label} - vrai clic sur Mode lecture : la Lecture montre son guide « ${T.readTitle} », la carte de l'éditeur n'est plus là`, reading.readerShown && reading.readerTitle === T.readTitle && !reading.hostShown && reading.hostEmpty, reading);
  await realClick(page, '#btn-mode-edit');
  await page.waitForFunction(() => !!document.querySelector('#access-guide-container > .reader-guide'), null, { timeout: 4000 }).catch(() => {});
  await page.mouse.move(WIDTH / 2, HEIGHT - 60, { steps: 3 });
  await page.waitForTimeout(300);
  const backToEdit = await accessView(page);
  check(`${label} - vrai clic sur Mode édition : la carte de l'accès revient à la place du document`, backToEdit.shown && backToEdit.title === T.title && !backToEdit.editorShown && backToEdit.barLocked, { shown: backToEdit.shown, title: backToEdit.title, editorShown: backToEdit.editorShown });

  // L'accès accordé (Grist renvoie les options) : le document revient, la barre se dégrise, on peut écrire dedans ; retiré, la carte revient.
  await setAccess(page, 'full');
  await page.waitForTimeout(500);
  const granted = await accessView(page);
  check(`${label} - l'accès complet accordé : la carte s'en va, le document revient (page entière à l'écran) et la barre se dégrise`, !granted.shown && granted.steps === 0 && granted.editorShown && granted.tiptapW > 200 && granted.tiptapH > 30 && granted.barFree && !granted.barLocked, { shown: granted.shown, editorShown: granted.editorShown, tiptapW: granted.tiptapW, tiptapH: granted.tiptapH, barFree: granted.barFree });
  const tip = await boxOf(page, '#editor-container .tiptap');
  if (tip) { await page.mouse.move(tip.left + 80, tip.top + 40, { steps: 3 }); await page.mouse.click(tip.left + 80, tip.top + 40); await page.keyboard.type('Bonjour'); }
  await page.waitForTimeout(250);
  const typed = await accessView(page);
  check(`${label} - le document rendu se tape à la vraie touche`, /Bonjour/.test(typed.html || ''), { html: typed.html });
  await setAccess(page, 'none');
  await page.waitForTimeout(400);
  const again = await accessView(page);
  check(`${label} - l'accès retiré : la carte revient et masque le document`, again.shown && again.title === T.title && !again.editorShown && again.barLocked, { shown: again.shown, title: again.title, editorShown: again.editorShown });
  await setAccess(page, 'full');
  await context.close();
}

// Un panneau plus étroit que 700 px : la capture passe sous le texte, rien ne déborde.
async function runEditorNarrow() {
  console.log(`\n=== Éditeur sans accès complet, panneau étroit (420x${HEIGHT}), clair, français ===`);
  const { context, page } = await openWidget('light', 'fr', 'none');
  await page.setViewportSize({ width: 420, height: HEIGHT });
  await page.waitForFunction(() => !!document.querySelector('#access-guide-container > .reader-guide'), null, { timeout: 4000 }).catch(() => {});
  await page.mouse.move(210, HEIGHT - 60, { steps: 3 });
  await page.waitForTimeout(500);
  await shot(page, 'editeur-etroit-sans-acces');
  const v = await accessView(page);
  check('panneau de 420 px, éditeur sans accès complet : la carte est là, aucun défilement horizontal, rien ne dépasse', !!v && v.shown && !!v.card && v.scrollW <= v.clientW && v.card.right <= v.clientW && v.card.left >= 0, v && { scrollW: v.scrollW, clientW: v.clientW, card: v.card });
  check('panneau de 420 px : la capture passe sous le texte, entière dans la carte', !!v && !!v.shot && v.shot.top >= v.body.bottom - 1 && v.shot.right <= v.card.right, v && { shot: v.shot, body: v.body, card: v.card });
  if (!v || !v.card) { await context.close(); return; }
  check('panneau de 420 px : la capture s\'atteint à la molette', await wheelTo(page, '#access-guide-container .reader-guide-shot'), {});
  await realClick(page, '#access-guide-container .reader-guide-shot');
  await page.waitForTimeout(200);
  const z = await accessView(page);
  check('panneau de 420 px : la capture agrandie reste dans la carte, sans défilement horizontal', !!z && z.zoomed && z.scrollW <= z.clientW && z.shot.right <= z.card.right, z && { shot: z.shot, card: z.card, scrollW: z.scrollW });
  await context.close();
}

await runPass('light', 'fr');
await runPass('dark', 'fr');
await runPass('light', 'en');
await runPass('dark', 'en');
await runNarrow();
await runEditorAccess('light', 'fr');
await runEditorAccess('dark', 'fr');
await runEditorAccess('light', 'en');
await runEditorAccess('dark', 'en');
await runEditorNarrow();
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);
const missing = imageRequests.filter(r => r.status !== 200);
check('les huit captures sont servies (aucune image introuvable ni refusée)', imageRequests.length >= 8 && missing.length === 0, { requested: imageRequests.length, missing });

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
