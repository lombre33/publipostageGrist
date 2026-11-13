#!/usr/bin/env node
// Le bandeau de la bêta figée (outils/depot-propre/beta/beta-bandeau.js et .css, posés dans beta/ par outils/depot-propre/beta-bandeau.mjs ; consigne 070 de GFS) à la VRAIE souris, dans le panneau de 700x400 :
// « Attention : widget en version bêta. Nous vous conseillons de migrer vers la version 1.1. », le bouton « Découvrir les nouveautés » (nouveautes.html dans un nouvel onglet) et une croix.
// La bêta est COMPOSÉE comme la publication la compose (la copie figée 1.0.0-beta.1 + les deux fichiers du bandeau + deux lignes d'index.html), servie avec la V1 à côté (/Publipostage-Plus/beta/ et
// /Publipostage-Plus/, comme le site public), SOUS SA VRAIE POLITIQUE DE SÉCURITÉ (pas de `bypassCSP`), avec le faux Grist de dev-tests/grist-stub.js et le miroir hors ligne des CDN. La copie figée vient du
// commit de développement dont elle est la copie (ddea35d1, 05/10, version 1.0.0-beta.1), lue par `git archive` ; un dépôt qui n'a pas cet historique donne le dossier d'une bêta SANS bandeau dans PP_BETA_SOURCE.
// Ce que ça vérifie :
//  0) la bêta composée est la bêta figée + css/beta-bandeau.css + js/beta-bandeau.js + deux lignes d'index.html : rien d'autre ne change, rien ne manque ;
//  1) cinq ouvertures à 700x400 : français clair (système clair), anglais sombre (système sombre), français avec le sombre CHOISI (pp_theme) sur un système clair, anglais avec le clair choisi sur un système
//     sombre, français sombre du système : le bandeau est le premier élément de la page, une seule fois, avec EXACTEMENT les textes de la consigne dans la langue du widget (français et anglais), le bouton
//     qui pointe ../nouveautes.html?lang=fr|en en `_blank` avec `noopener noreferrer`, la croix, aucune icône emoji ; il est entier dans le panneau, en haut, sur toute la largeur, son texte ne sort pas ;
//     le texte se lit à 4,5:1 au moins (et les filets, icônes et croix à 3:1) dans les trois thèmes ;
//  2) il ne cache RIEN : la barre d'outils n'est que poussée vers le bas de la hauteur du bandeau (même hauteur, même largeur que dans la bêta sans bandeau), aucun bouton n'est devenu inatteignable, la page
//     ne défile pas plus qu'avant, et le menu des modèles s'ouvre en dessous du bandeau, entier et atteignable ;
//  3) une ligne tant que la place le permet (1000 px), à la ligne quand elle manque (700 px en français, 440 et 360 px) : le texte ne déborde pas, le bouton et la croix restent entiers et atteignables ;
//  4) à la vraie souris : « Découvrir les nouveautés » ouvre nouveautes.html?lang=… dans un NOUVEL onglet (la bêta reste où elle est, l'onglet n'a pas d'`opener`, la fenêtre des nouveautés y est ouverte, dans
//     la langue du widget) ; la fenêtre des nouveautés ne s'ouvre jamais toute seule dans la bêta (elle n'y existe pas, pp_news_seen n'y est jamais écrit) ; un changement de langue dans le widget change le
//     bandeau et l'adresse du bouton sur place ; la croix le ferme et rend sa place à la barre d'outils, SANS rien retenir (le stockage et les cookies sont tels qu'ils étaient) : la bêta rechargée le remontre ;
//  5) aucune erreur de page ou de console, aucune requête ratée ou hors du site, AUCUNE violation de la politique de sécurité de la bêta ;
//  6) le juge sait dire non : la bêta d'avant (sans bandeau) n'a ni bandeau ni fichier du bandeau ; un bandeau posé PAR-DESSUS la barre d'outils ou un texte gris clair serait refusé par les mêmes mesures.
// Lancé par run-headless.mjs (groupe Node « betaBannerMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-beta-banner.mjs
// BETA_BANNER_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit. BETA_BANNER_PORT : le port du petit serveur (9062 par défaut). PP_BETA_SOURCE : voir plus haut.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.BETA_BANNER_PORT || 9062);
const SHOTS = process.env.BETA_BANNER_SHOTS ? resolve(process.env.BETA_BANNER_SHOTS) : '';
const BETA_COMMIT = 'ddea35d1';
const SITE_PATH = '/Publipostage-Plus';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
let tool = null; // outils/depot-propre/beta-bandeau.mjs : l'outil qui compose la bêta (absent d'un arbre d'avant la consigne 070 : une ligne rouge, pas un plantage)

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

// Les textes de la consigne 070, tels que le bandeau doit les dire. L'apostrophe de l'anglais est l'apostrophe typographique, comme tous les textes anglais de l'app (« What’s new in version 1.0 »).
const TEXTS = {
  fr: { text: 'Attention : widget en version bêta. Nous vous conseillons de migrer vers la version 1.1.', news: 'Découvrir les nouveautés', label: 'Découvrir les nouveautés (s’ouvre dans un nouvel onglet)', close: 'Fermer le bandeau', region: 'Version bêta', page: 'Nouveautés de la version 1.0' },
  en: { text: 'Attention: this widget is a beta version. We recommend migrating to version 1.1.', news: 'Discover what’s new', label: 'Discover what’s new (opens in a new tab)', close: 'Close the banner', region: 'Beta version', page: 'What’s new in version 1.0' },
};

const WORK = mkdtempSync(join(tmpdir(), 'pp-beta-banner-'));
const SITE = join(WORK, 'site');
let browser = null;
let server = null;
async function finish(code) {
  try { if (browser) await browser.close(); } catch (e) { /* déjà fermé */ }
  try { if (server) server.close(); } catch (e) { /* déjà arrêté */ }
  rmSync(WORK, { recursive: true, force: true });
  process.exit(code);
}

// La bêta figée, SANS bandeau : le commit de développement dont elle est la copie, ou le dossier que PP_BETA_SOURCE désigne.
function betaSource() {
  if (process.env.PP_BETA_SOURCE) return resolve(process.env.PP_BETA_SOURCE);
  const dir = join(WORK, 'beta-src');
  mkdirSync(dir, { recursive: true });
  const archive = spawnSync('git', ['-C', ROOT, 'archive', BETA_COMMIT, '--', ...tool.BETA_PARTIES], { maxBuffer: 1 << 29 });
  if (archive.status !== 0) throw new Error(`git archive ${BETA_COMMIT} impossible (${String(archive.stderr || '').trim().split('\n')[0]}) : un dépôt sans cet historique ? Donner PP_BETA_SOURCE=<dossier de la bêta 1.0.0-beta.1, sans bandeau>`);
  const untar = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout });
  if (untar.status !== 0) throw new Error('tar : ' + String(untar.stderr || '').trim());
  return dir;
}
function listFiles(dir) {
  const out = [];
  const walk = d => { for (const entry of readdirSync(d, { withFileTypes: true })) { const path = join(d, entry.name); if (entry.isDirectory()) walk(path); else out.push(relative(dir, path).split(sep).join('/')); } };
  walk(dir);
  return out.sort();
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);
const GRIST_API_TAG = '<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>';
let esmMap = {};
let BASE = '';

// Le site, comme celui du dépôt public : la V1 à la racine (dont nouveautes.html), la bêta avec son bandeau dans beta/, et la bêta SANS bandeau à côté (beta-nue/ : la mesure de ce que la barre d'outils fait sans lui).
async function serve() {
  const routes = [[`${SITE_PATH}/beta/`, join(SITE, 'beta')], [`${SITE_PATH}/beta-nue/`, join(SITE, 'beta-nue')], [`${SITE_PATH}/`, ROOT]];
  server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const route = routes.find(([prefix]) => urlPath.startsWith(prefix));
      if (!route) { res.writeHead(404).end('hors site'); return; }
      const [prefix, dir] = route;
      const file = join(dir, normalize(urlPath.slice(prefix.length)).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
      const info = await stat(file);
      const target = info.isDirectory() ? join(file, 'index.html') : file;
      let body = await readFile(target);
      // La bêta charge le script de Grist ; le banc le remplace par le faux Grist (la seule retouche de la page, jamais publiée).
      if (dir !== ROOT && target === join(dir, 'index.html')) body = Buffer.from(body.toString('utf8').replace(GRIST_API_TAG, `<script src="${SITE_PATH}/dev-tests/grist-stub.js"></script>`));
      res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  await new Promise((ok, ko) => server.listen(PORT, '127.0.0.1', ok).on('error', ko));
  BASE = `http://127.0.0.1:${PORT}`;
}

const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const OWN_HOSTS = ['esm.sh', 'docs.getgrist.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// Une ouverture de la bêta : un contexte neuf (la taille et le thème du système demandés), la langue et, si on le dit, le thème CHOISI dans le widget (pp_theme) posés avant tout script, l'écoute des violations
// de la politique de sécurité (window.__csp), ce que les pages ont dit (erreurs), raté ou demandé hors du site. Attend « Widget prêt. ».
async function ouvrir({ dir = 'beta', width = 700, height = 400, scheme = 'light', lang = 'fr', theme = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
  const log = { errors: [], failed: [], foreign: [] };
  const watch = (page, name) => {
    page.on('pageerror', e => log.errors.push(`${name} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.errors.push(`${name} console.${m.type()}: ${m.text()}`); });
    page.on('requestfailed', r => log.failed.push(`${name} ${r.url()} ${(r.failure() || {}).errorText || ''}`));
    page.on('request', r => { const host = new URL(r.url()).hostname; if (host !== '127.0.0.1' && !OWN_HOSTS.includes(host)) log.foreign.push(`${name} ${r.url()}`); });
  };
  await context.route('**://esm.sh/**', async route => {
    const url = route.request().url();
    const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
    if (chunk) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
    const found = Object.keys(esmMap).find(k => url === `https://esm.sh/${k}` || url === `https://esm.sh/*${k}` || url.startsWith(`https://esm.sh/${k}@`) || url.startsWith(`https://esm.sh/*${k}@`));
    if (!found) return route.fulfill({ status: 404, body: `// pas de miroir local pour ${url}` });
    return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(ROOT, esmMap[found].replace(/^\//, '')), 'utf8')) });
  });
  await context.route('**://docs.getgrist.com/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await context.route('**://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route('**://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
  const stored = { pp_lang: lang, ...(theme ? { pp_theme: theme } : {}) };
  await context.addInitScript((kept) => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' | ' + e.blockedURI + ' | ' + e.sourceFile + ':' + e.lineNumber));
    try { for (const [key, value] of Object.entries(kept)) localStorage.setItem(key, value); } catch (e) { /* stockage refusé : la page se lit sans */ }
  }, stored);
  await context.addInitScript(spec => { window.__LOAD_SPEC = spec; }, SPEC);
  await context.addInitScript({ content: await readFile(join(ROOT, 'dev-tests', 'load-doc.js'), 'utf8') });
  const page = await context.newPage();
  watch(page, 'bêta');
  context.on('page', tab => watch(tab, 'onglet'));
  await page.goto(`${BASE}${SITE_PATH}/${dir}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 60000 }).catch(() => log.errors.push('bêta : « Widget prêt. » n\'est pas venu en 60 s'));
  await sleep(1200);
  return { context, page, log };
}

// Le bandeau tel que la page le montre : le texte, le bouton, la croix, leurs étiquettes, leurs boîtes et s'ils sont atteignables (l'élément sous le pointeur, au centre, est lui ou l'un de ses enfants).
const bannerFacts = page => page.evaluate(() => {
  const banner = document.getElementById('pp-beta-banner');
  if (!banner) return null;
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const reach = (el) => { const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false; const top = document.elementFromPoint(x, y); return !!top && el.contains(top); };
  const text = banner.querySelector('.pp-beta-banner-text'), link = banner.querySelector('.pp-beta-banner-link'), close = banner.querySelector('.pp-beta-banner-close');
  const everything = banner.textContent + ' ' + Array.from(banner.querySelectorAll('[aria-label]')).map(e => e.getAttribute('aria-label')).join(' ') + ' ' + banner.getAttribute('aria-label');
  const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
  return {
    count: document.querySelectorAll('#pp-beta-banner').length, first: document.body.firstElementChild === banner,
    role: banner.getAttribute('role'), region: banner.getAttribute('aria-label'), text: text.textContent,
    linkText: link.textContent, linkHref: link.getAttribute('href'), linkResolved: link.href, linkTarget: link.target, linkRel: link.rel, linkLabel: link.getAttribute('aria-label'), linkTag: link.tagName,
    closeTag: close.tagName, closeType: close.getAttribute('type'), closeLabel: close.getAttribute('aria-label'),
    emoji: /\p{Extended_Pictographic}/u.test(everything), svg: banner.querySelectorAll('svg').length, svgHidden: Array.from(banner.querySelectorAll('svg')).every(s => s.getAttribute('aria-hidden') === 'true'), images: banner.querySelectorAll('img').length,
    box: box(banner), textBox: box(text), linkBox: box(link), closeBox: box(close), lines: Math.round(text.getBoundingClientRect().height / lineHeight),
    textClipped: text.scrollWidth > text.clientWidth + 1 || banner.scrollWidth > banner.clientWidth + 1,
    reachLink: reach(link), reachClose: reach(close),
    fontSize: getComputedStyle(banner).fontSize, fontFamily: getComputedStyle(banner).fontFamily, uiFont: getComputedStyle(document.documentElement).getPropertyValue('--font-ui'),
    fontIsUi: ((a, b) => !!b.trim() && a === b)(...[getComputedStyle(banner).fontFamily, getComputedStyle(document.documentElement).getPropertyValue('--font-ui')].map(v => v.replace(/["']/g, '').replace(/\s+/g, ' ').trim())),
    innerW: innerWidth, innerH: innerHeight,
  };
});

// La barre d'outils du haut et la page autour : sa place, ses boutons visibles et ceux qu'un clic au centre n'atteint pas, le défilement de la page.
const layoutFacts = page => page.evaluate(() => {
  const toolbar = document.getElementById('toolbar-top');
  const app = document.getElementById('app');
  const r = toolbar.getBoundingClientRect();
  const buttons = Array.from(toolbar.querySelectorAll('button')).filter(b => b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden');
  const name = b => b.id || b.getAttribute('aria-label') || b.getAttribute('data-i18n') || b.textContent.trim().slice(0, 24);
  const unreachable = buttons.filter((b) => { const q = b.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return true; const top = document.elementFromPoint(x, y); return !(top && b.contains(top)); }).map(name);
  const a = app ? app.getBoundingClientRect() : null;
  return {
    toolbar: { top: r.top, bottom: r.bottom, height: r.height, width: r.width }, buttons: buttons.length, unreachable,
    app: a && { top: a.top, bottom: a.bottom }, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, innerW: innerWidth, innerH: innerHeight,
  };
});

// Les contrastes du bandeau : la couleur de chaque élément sur ce qu'il y a dessous (les fonds translucides sont composés sur ce qui les porte). Texte >= 4,5:1 ; filet du bouton, icône et croix >= 3:1.
const contrastFacts = page => page.evaluate(() => {
  const parse = c => (c.match(/[\d.]+/g) || []).map(Number);
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round((x + 0.05) / (y + 0.05) * 100) / 100; };
  const backdrop = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); const alpha = c.length === 4 ? c[3] : 1; if (alpha > 0) layers.push([c.slice(0, 3), alpha]); if (alpha === 1) break; }
    let base = [255, 255, 255];
    for (const [rgb, alpha] of layers.reverse()) base = base.map((v, i) => rgb[i] * alpha + v * (1 - alpha));
    return base;
  };
  const q = s => document.querySelector(s);
  const color = (s, prop = 'color') => parse(getComputedStyle(q(s))[prop]).slice(0, 3);
  const bannerBg = backdrop(q('#pp-beta-banner'));
  const linkBg = backdrop(q('#pp-beta-banner .pp-beta-banner-link'));
  return {
    text: ratio(color('#pp-beta-banner .pp-beta-banner-text'), bannerBg),
    lead: ratio(color('#pp-beta-banner .pp-beta-banner-text strong'), bannerBg),
    button: ratio(color('#pp-beta-banner .pp-beta-banner-link'), linkBg),
    buttonEdge: ratio(color('#pp-beta-banner .pp-beta-banner-link', 'borderTopColor'), bannerBg),
    icon: ratio(color('#pp-beta-banner .pp-beta-banner-icon'), bannerBg),
    cross: ratio(color('#pp-beta-banner .pp-beta-banner-close'), bannerBg),
  };
});
const contrastOk = c => c.text >= 4.5 && c.lead >= 4.5 && c.button >= 4.5 && c.buttonEdge >= 3 && c.icon >= 3 && c.cross >= 3;
// Ce que le bandeau fait de la barre d'outils : en dessous de lui, jamais dessous.
const toolbarClear = (layout, banner) => layout.toolbar.top >= banner.bottom - 0.5;

async function click(page, selector) {
  const pos = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || el.getClientRects().length === 0) return null;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, reachable: !!top && el.contains(top) };
  }, selector);
  if (!pos) return null;
  await page.mouse.move(pos.x - 20, pos.y);
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.click(pos.x, pos.y);
  return pos;
}
const storageOf = page => page.evaluate(() => ({
  local: Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])),
  session: Object.fromEntries(Object.keys(sessionStorage).sort().map(k => [k, sessionStorage.getItem(k)])), cookie: document.cookie,
}));
const shot = async (page, name, height) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png'), clip: { x: 0, y: 0, width: (await page.viewportSize()).width, height } }); };

// La bêta sans bandeau à la même taille : ce que la barre d'outils fait sans lui (gardée, une ouverture par taille).
const naked = new Map(); // la disposition ne dépend ni du thème ni de la couleur du système : une ouverture par taille et par langue
async function nakedLayout({ width, height, scheme, lang }) {
  const key = [width, height, lang].join('|');
  if (!naked.has(key)) {
    const { context, page } = await ouvrir({ dir: 'beta-nue', width, height, scheme, lang });
    naked.set(key, { layout: await layoutFacts(page) });
    await context.close();
  }
  return naked.get(key);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Une ouverture de la bêta avec son bandeau : ce que la page dit, montre et ne cache pas ; puis, si `full`, ce que la souris y fait.
// ---------------------------------------------------------------------------------------------------------------------------------------------
async function run({ id, lang, scheme, theme = null, width = 700, height = 400, full = false, oneLine = null, relative = true }) {
  const T = TEXTS[lang];
  const other = lang === 'fr' ? 'en' : 'fr';
  const { context, page, log } = await ouvrir({ dir: 'beta', width, height, scheme, lang, theme });
  const f = await bannerFacts(page);
  check(`${id} : le bandeau est là, une seule fois, premier élément de la page`, !!f && f.count === 1 && f.first, f && { count: f.count, first: f.first });
  if (!f) { await context.close(); return; }
  check(`${id} : il dit EXACTEMENT « ${T.text} » (région « ${T.region} »)`, f.text === T.text && f.region === T.region && f.role === 'region', { text: f.text, region: f.region, role: f.role });
  check(`${id} : le bouton dit « ${T.news} », est un lien vers ../nouveautes.html?lang=${lang} (${SITE_PATH}/nouveautes.html), s'ouvre dans un nouvel onglet sans lien avec la bêta (noopener noreferrer) et dit l'onglet à ceux qui lisent à voix haute`,
    f.linkText === T.news && f.linkTag === 'A' && f.linkHref === `../nouveautes.html?lang=${lang}` && f.linkResolved === `${BASE}${SITE_PATH}/nouveautes.html?lang=${lang}` && f.linkTarget === '_blank' && /\bnoopener\b/.test(f.linkRel) && /\bnoreferrer\b/.test(f.linkRel) && f.linkLabel === T.label,
    { text: f.linkText, href: f.linkHref, resolved: f.linkResolved, target: f.linkTarget, rel: f.linkRel, label: f.linkLabel });
  check(`${id} : la croix est un vrai bouton nommé « ${T.close} »`, f.closeTag === 'BUTTON' && f.closeType === 'button' && f.closeLabel === T.close, { tag: f.closeTag, type: f.closeType, label: f.closeLabel });
  check(`${id} : aucun emoji, aucune image : des icônes au trait (SVG) cachées aux lecteurs d'écran`, !f.emoji && f.images === 0 && f.svg === 2 && f.svgHidden, { emoji: f.emoji, images: f.images, svg: f.svg, hidden: f.svgHidden });
  check(`${id} : il est en haut, sur toute la largeur du panneau, entier${oneLine === null ? '' : oneLine ? ', sur UNE ligne' : ', à la ligne'}, son texte ne déborde pas`,
    Math.abs(f.box.top) < 0.5 && Math.abs(f.box.left) < 0.5 && Math.abs(f.box.right - f.innerW) < 0.5 && !f.textClipped && f.linkBox.right <= f.innerW + 0.5 && f.closeBox.right <= f.innerW + 0.5 && f.linkBox.left >= -0.5
      && (oneLine === null || (oneLine ? f.lines === 1 : f.lines >= 2)), { box: f.box, lines: f.lines, clipped: f.textClipped, link: f.linkBox, close: f.closeBox });
  check(`${id} : le bouton et la croix sont atteignables (l'élément sous le pointeur est le leur)`, f.reachLink && f.reachClose, { link: f.reachLink, close: f.reachClose });
  check(`${id} : la police est celle de l'interface (le jeton --font-ui de la bêta), à 12 px`, f.fontIsUi && f.fontSize === '12px', { family: f.fontFamily, ui: f.uiFont, size: f.fontSize });
  const c = await contrastFacts(page);
  check(`${id} : tout se lit : texte, mot en gras et texte du bouton >= 4,5:1, filet du bouton, icône et croix >= 3:1`, contrastOk(c), c);
  await shot(page, id, Math.min(height, 200));

  // 2. Il ne cache rien : la barre d'outils n'est que poussée vers le bas, comme dans la bêta sans bandeau.
  const here = await layoutFacts(page);
  if (relative) {
    const base = await nakedLayout({ width, height, scheme, lang });
    check(`${id} : la barre d'outils n'est que poussée vers le bas, de la hauteur du bandeau (${Math.round(f.box.height)} px) : même hauteur, même largeur que dans la bêta sans bandeau`,
      toolbarClear(here, f.box) && Math.abs(here.toolbar.top - (base.layout.toolbar.top + f.box.height)) <= 1.5 && Math.abs(here.toolbar.height - base.layout.toolbar.height) <= 1.5 && Math.abs(here.toolbar.width - base.layout.toolbar.width) <= 1.5,
      { avec: here.toolbar, sans: base.layout.toolbar, bandeau: f.box.height });
    check(`${id} : aucun des ${here.buttons} boutons de la barre d'outils n'est devenu inatteignable (${base.layout.unreachable.length} l'étaient déjà sans bandeau)`, here.buttons === base.layout.buttons && here.unreachable.every(name => base.layout.unreachable.includes(name)), { avec: here.unreachable, sans: base.layout.unreachable });
    check(`${id} : la page ne défile pas plus que sans bandeau`, here.scrollH <= Math.max(here.innerH, base.layout.scrollH) + 1 && here.scrollW <= Math.max(here.innerW, base.layout.scrollW) + 1 && here.app.bottom <= here.innerH + 0.5, { avec: [here.scrollW, here.scrollH], sans: [base.layout.scrollW, base.layout.scrollH], app: here.app });
  }

  const verdict = async (when) => {
    check(`${id} : ${when}aucune erreur de page ni de console, aucune requête ratée, aucune requête hors du site ou de son miroir`, log.errors.length === 0 && log.failed.length === 0 && log.foreign.length === 0, { errors: log.errors.slice(0, 3), failed: log.failed.slice(0, 3), foreign: log.foreign.slice(0, 3) });
    const csp = await page.evaluate(() => window.__csp.slice());
    check(`${id} : ${when}aucune violation de la politique de sécurité de la bêta (le bandeau n'a besoin d'aucun script en ligne ni d'aucune source de plus)`, csp.length === 0, csp);
  };

  if (full) {
    // Le menu des modèles s'ouvre en dessous du bandeau, entier et atteignable.
    const trigger = await click(page, '.tts-trigger');
    await sleep(600);
    const menu = await page.evaluate(() => {
      const popup = document.querySelector('.tts-popup.is-open');
      if (!popup) return null;
      const r = popup.getBoundingClientRect();
      const row = popup.querySelector('.tts-row, [role=option], button');
      const q = row ? row.getBoundingClientRect() : null;
      const top = q ? document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2) : null;
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, rowReachable: !!(top && popup.contains(top)) };
    });
    check(`${id} : un vrai clic sur le menu des modèles l'ouvre, en dessous du bandeau, entier dans le panneau, ses lignes atteignables`, !!trigger && trigger.reachable && !!menu && menu.top >= f.box.bottom - 0.5 && menu.bottom <= f.innerH + 0.5 && menu.left >= -0.5 && menu.right <= f.innerW + 0.5 && menu.rowReachable, { trigger, menu, banner: f.box.bottom });
    await shot(page, id + '-menu-des-modeles', height);
    await page.keyboard.press('Escape');
    await sleep(300);

    // Le bouton, à la vraie souris : un nouvel onglet, la bêta reste.
    const before = page.url();
    const seenBefore = await page.evaluate(() => localStorage.getItem('pp_news_seen')); // le banc (faux Grist) sème « 99 » : ce qui compte est que le bandeau n'y touche pas
    const [popup] = await Promise.all([context.waitForEvent('page', { timeout: 15000 }).catch(() => null), click(page, '#pp-beta-banner .pp-beta-banner-link')]);
    check(`${id} : un vrai clic sur « ${T.news} » ouvre un NOUVEL onglet`, !!popup);
    if (popup) {
      await popup.waitForLoadState('load').catch(() => {});
      await popup.waitForFunction(() => { const m = document.getElementById('pp-news-modal'); return !!m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 15000 }).catch(() => {});
      await sleep(500);
      const tab = await popup.evaluate(() => ({ url: location.href, opener: window.opener === null ? null : 'présent', lang: document.documentElement.lang, title: (document.querySelector('#pp-news-modal h3') || {}).textContent || '', open: !!document.getElementById('pp-news-modal') && getComputedStyle(document.getElementById('pp-news-modal')).display !== 'none', csp: window.__csp || [] }));
      check(`${id} : cet onglet est ${SITE_PATH}/nouveautes.html?lang=${lang}, sans lien avec la bêta (pas d'opener), et sa fenêtre des nouveautés est ouverte, « ${T.page} », dans la langue du widget`, tab.url === `${BASE}${SITE_PATH}/nouveautes.html?lang=${lang}` && tab.opener === null && tab.open && tab.title === T.page, tab);
      check(`${id} : aucune violation de la politique de sécurité dans le nouvel onglet`, tab.csp.length === 0, tab.csp);
      if (SHOTS) await popup.screenshot({ path: join(SHOTS, id + '-nouvel-onglet.png') });
      await popup.close();
    }
    const stay = await page.evaluate(() => ({ url: location.href, banner: !!document.getElementById('pp-beta-banner'), news: !!document.getElementById('pp-news-modal'), seen: localStorage.getItem('pp_news_seen'), keys: Object.keys(localStorage).filter(k => /beta|banner/i.test(k)) }));
    check(`${id} : la bêta est restée où elle était, avec son bandeau ; la fenêtre des nouveautés n'y existe pas et pp_news_seen n'a pas bougé, aucune clé du bandeau n'est écrite (elle ne s'ouvre jamais toute seule dans la bêta)`, stay.url === before && stay.banner && !stay.news && stay.seen === seenBefore && stay.keys.length === 0, { ...stay, seenBefore });

    // La langue du widget décide, y compris quand elle change : le bandeau et l'adresse du bouton suivent sur place.
    await page.evaluate((next) => I18n.setLang(next), other);
    await sleep(200);
    const switched = await bannerFacts(page);
    check(`${id} : changer la langue du widget (${lang} → ${other}) change le bandeau sur place : texte, bouton, étiquettes et adresse ?lang=${other}`, !!switched && switched.text === TEXTS[other].text && switched.linkText === TEXTS[other].news && switched.linkHref === `../nouveautes.html?lang=${other}` && switched.linkLabel === TEXTS[other].label && switched.closeLabel === TEXTS[other].close && switched.region === TEXTS[other].region, switched && { text: switched.text, href: switched.linkHref });
    await page.evaluate((back) => I18n.setLang(back), lang);
    await sleep(200);
    const restored = await bannerFacts(page);
    check(`${id} : et la rendre (${other} → ${lang}) le remet comme il était`, !!restored && restored.text === T.text && restored.linkHref === `../nouveautes.html?lang=${lang}`, restored && { text: restored.text, href: restored.linkHref });

    await verdict('avant la croix : ');

    // La croix : le ferme, rend sa place à la barre d'outils, ne retient rien ; la bêta rechargée le remontre.
    const storageBefore = await storageOf(page);
    const cross = await click(page, '#pp-beta-banner .pp-beta-banner-close');
    await sleep(400);
    const closedFacts = await bannerFacts(page);
    const storageAfter = await storageOf(page);
    check(`${id} : un vrai clic sur la croix ferme le bandeau`, !!cross && cross.reachable && closedFacts === null, { cross, closed: closedFacts === null });
    const freed = await layoutFacts(page);
    const baseAfter = relative ? (await nakedLayout({ width, height, scheme, lang })).layout : null;
    check(`${id} : la barre d'outils reprend sa place (${baseAfter ? Math.round(baseAfter.toolbar.top) : '?'} px du haut, comme dans la bêta sans bandeau)`, !!baseAfter && Math.abs(freed.toolbar.top - baseAfter.toolbar.top) <= 1.5 && freed.scrollH <= Math.max(freed.innerH, baseAfter.scrollH) + 1, { libre: freed.toolbar, sans: baseAfter && baseAfter.toolbar });
    check(`${id} : fermer ne retient RIEN : localStorage, sessionStorage et cookies sont tels qu'ils étaient`, JSON.stringify(storageBefore) === JSON.stringify(storageAfter), { avant: storageBefore, apres: storageAfter });
    await shot(page, id + '-ferme', height);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!document.getElementById('pp-beta-banner'), null, { timeout: 15000 }).catch(() => {});
    const again = await bannerFacts(page);
    check(`${id} : la bêta rechargée remontre le bandeau, comme à chaque ouverture`, !!again && again.count === 1 && again.text === T.text, again && { count: again.count, text: again.text });
    await sleep(800);

    // Le juge sait dire non : les mêmes mesures refusent un bandeau posé par-dessus la barre d'outils et un texte gris clair.
    const live = await bannerFacts(page);
    await page.addStyleTag({ content: '#pp-beta-banner { position: fixed !important; top: 0; left: 0; right: 0; z-index: 99999; }' });
    await sleep(200);
    const covered = await layoutFacts(page);
    check(`${id} : le juge sait dire non (1/2) : un bandeau posé PAR-DESSUS la barre d'outils (position: fixed) serait refusé`, !!live && toolbarClear(here, live.box) && !toolbarClear(covered, (await bannerFacts(page)).box), { barre: covered.toolbar });
    await page.addStyleTag({ content: '#pp-beta-banner { background: #fff !important; } #pp-beta-banner .pp-beta-banner-text, #pp-beta-banner .pp-beta-banner-text strong { color: #9a9a9a !important; }' });
    const pale = await contrastFacts(page);
    check(`${id} : le juge sait dire non (2/2) : un texte gris clair (#9a9a9a sur blanc) serait refusé`, contrastOk(c) && !contrastOk(pale) && pale.text < 4.5, { texte: pale.text });
    const csp = await page.evaluate(() => window.__csp.slice());
    check(`${id} : la bêta rechargée n'a, elle non plus, aucune violation de la politique de sécurité`, csp.length === 0, csp);
  } else {
    await verdict('');
  }
  await context.close();
}

async function sansPlanter(name, manoeuvre) {
  try { await manoeuvre(); } catch (e) { check(`${name} : la manœuvre va jusqu'au bout`, false, String((e && e.message) || e).split('\n')[0]); }
}

try {
  tool = await import(pathToFileURL(join(ROOT, 'outils', 'depot-propre', 'beta-bandeau.mjs')).href);
  if (!existsSync(join(CACHE, 'esm-map.json'))) throw new Error('miroir hors ligne absent : bash dev-tests/offline-deps.sh');
  esmMap = JSON.parse(readFileSync(join(CACHE, 'esm-map.json'), 'utf8'));
  const SRC = betaSource();
  mkdirSync(SITE, { recursive: true });
  tool.poserDepuisDossier(SRC, join(SITE, 'beta'));
  cpSync(SRC, join(SITE, 'beta-nue'), { recursive: true });

  // 0. La bêta composée est la bêta figée et le bandeau, rien d'autre.
  const frozen = listFiles(SRC), composed = listFiles(join(SITE, 'beta'));
  const added = composed.filter(file => !frozen.includes(file));
  const missing = frozen.filter(file => !composed.includes(file));
  const changed = frozen.filter(file => composed.includes(file) && Buffer.compare(readFileSync(join(SRC, file)), readFileSync(join(SITE, 'beta', file))) !== 0);
  const frozenVersion = (/PP_VERSION\s*=\s*'([^']+)'/.exec(readFileSync(join(SRC, 'js', 'version.js'), 'utf8')) || [])[1];
  check('la copie figée est la bêta 1.0.0-beta.1 (js/version.js), sans un fichier du bandeau', frozenVersion === '1.0.0-beta.1' && !frozen.includes(tool.BANDEAU_JS) && !frozen.includes(tool.BANDEAU_CSS), { version: frozenVersion });
  check('la bêta composée = la bêta figée + css/beta-bandeau.css + js/beta-bandeau.js + deux lignes d\'index.html : rien d\'autre ne change, rien ne manque',
    JSON.stringify(added) === JSON.stringify([tool.BANDEAU_CSS, tool.BANDEAU_JS]) && missing.length === 0 && JSON.stringify(changed) === '["index.html"]'
      && tool.sansBandeau(readFileSync(join(SITE, 'beta', 'index.html'), 'utf8')) === readFileSync(join(SRC, 'index.html'), 'utf8'), { added, missing, changed });

  await serve();
  browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  // 1 à 5. Les ouvertures à 700x400 : les deux langues, les trois thèmes (clair, sombre CHOISI, sombre du système), le tour complet dans les deux premières.
  await sansPlanter('français clair', () => run({ id: 'français clair', lang: 'fr', scheme: 'light', full: true }));
  await sansPlanter('anglais sombre', () => run({ id: 'anglais sombre', lang: 'en', scheme: 'dark', full: true }));
  await sansPlanter('français, sombre choisi', () => run({ id: 'français, sombre choisi dans le widget', lang: 'fr', scheme: 'light', theme: 'dark' }));
  await sansPlanter('anglais, clair choisi', () => run({ id: 'anglais, clair choisi dans le widget', lang: 'en', scheme: 'dark', theme: 'light' }));
  await sansPlanter('français sombre du système', () => run({ id: 'français, sombre du système', lang: 'fr', scheme: 'dark' }));
  // 3. Une ligne quand la place le permet ; à la ligne quand elle manque.
  await sansPlanter('1000 px', () => run({ id: 'français clair à 1000 px', lang: 'fr', scheme: 'light', width: 1000, oneLine: true }));
  await sansPlanter('440 px', () => run({ id: 'français clair à 440 px', lang: 'fr', scheme: 'light', width: 440, oneLine: false }));
  await sansPlanter('360 px fr', () => run({ id: 'français sombre à 360 px', lang: 'fr', scheme: 'dark', width: 360, oneLine: false }));
  await sansPlanter('360 px en', () => run({ id: 'anglais clair à 360 px', lang: 'en', scheme: 'light', width: 360, oneLine: false }));

  // 6. L'ancien code : la bêta d'avant n'a ni bandeau ni fichier du bandeau.
  const { context, page, log } = await ouvrir({ dir: 'beta-nue', lang: 'fr', scheme: 'light' });
  const old = await bannerFacts(page);
  const oldFiles = await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).filter(name => /beta-bandeau/.test(name)));
  check('la bêta d\'avant (sans bandeau) n\'a ni bandeau ni fichier du bandeau : les vérifications ci-dessus lui donneraient tort', old === null && oldFiles.length === 0 && log.errors.length === 0, { bandeau: old === null, fichiers: oldFiles, errors: log.errors.slice(0, 2) });
  await context.close();
} catch (e) {
  check('le banc va jusqu\'au bout', false, String((e && e.message) || e).split('\n')[0]);
}

console.log(`\n${total - failures}/${total} passés`);
await finish(failures ? 1 : 0);
