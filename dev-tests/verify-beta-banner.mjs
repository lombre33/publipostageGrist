#!/usr/bin/env node
// Le bandeau de la bêta figée et sa fenêtre « Il est temps de passer à la version X.Y » (outils/depot-propre/beta/beta-bandeau.js et .css, posés dans beta/ par outils/depot-propre/beta-bandeau.mjs ; consigne 070 de GFS
// et demande du porteur du 26/11) à la VRAIE souris et au vrai clavier, dans le panneau de 700x400 :
// « Attention : widget en version bêta. Nous vous conseillons de migrer vers la version X.Y. » (X.Y : le numéro de js/version.js, sans son correctif, que la publication pose à la place du repère du script), le bouton
// « Découvrir les nouveautés » (nouveautes.html dans un nouvel onglet) et une croix ; et, à chaque ouverture, la fenêtre sur son voile.
// La bêta est COMPOSÉE comme la publication la compose (la copie figée 1.0.0-beta.1 + les deux fichiers du bandeau + le garde-fou de la consigne 102 + trois lignes d'index.html), servie avec la V1 à côté (/Publipostage-Plus/beta/ et
// /Publipostage-Plus/, comme le site public), SOUS SA VRAIE POLITIQUE DE SÉCURITÉ (pas de `bypassCSP`), avec le faux Grist de dev-tests/grist-stub.js et le miroir hors ligne des CDN. La copie figée vient du
// commit de développement dont elle est la copie (ddea35d1, 05/10, version 1.0.0-beta.1), lue par `git archive` ; un dépôt qui n'a pas cet historique donne le dossier d'une bêta SANS bandeau dans PP_BETA_SOURCE.
// Ce que ça vérifie :
//  0) la bêta composée est la bêta figée + css/beta-bandeau.css + js/beta-bandeau.js + js/beta-garde.js + trois lignes d'index.html : rien d'autre ne change, rien ne manque (le garde-fou a son propre essai : verify-beta-guard.mjs) ;
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
//  6) le juge sait dire non : la bêta d'avant (sans bandeau) n'a ni bandeau ni fichier du bandeau ; un bandeau posé PAR-DESSUS la barre d'outils ou un texte gris clair serait refusé par les mêmes mesures ;
//  7) la fenêtre « passez à la version X.Y » (le bandeau est fermé d'office dans les ouvertures de 1 à 6, sans quoi son voile les couvrirait) : à CHAQUE ouverture, EXACTEMENT les mots validés par le porteur le 26/11
//     (français et anglais), le numéro de la version qui part (jamais « 1.x », et un autre numéro quand la bêta est composée pour une autre version : 2.0.3 donne 2.0), l'adresse de la dernière version, les deux
//     boutons ; un dialogue modal qui couvre toute la page, dont plus rien n'est atteignable derrière (inert), qui se lit à 4,5:1 dans les trois thèmes ; au vrai clavier : le focus est sur la carte, Tab et Maj+Tab
//     bouclent sans sortir, Échap la ferme ; à la vraie souris : « Continuer avec la bêta » la ferme, « Découvrir les nouveautés » et l'adresse s'ouvrent dans un NOUVEL onglet sans lien avec la bêta (la fenêtre reste
//     ouverte), le changement de langue la change sur place ; fermée, elle ne retient RIEN (stockage et cookies tels qu'ils étaient) et la bêta rechargée la remontre.
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
import { createHash } from 'node:crypto';

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
  fr: { text: 'Attention : widget en version bêta. Nous vous conseillons de migrer vers la version {N}.', news: 'Découvrir les nouveautés', label: 'Découvrir les nouveautés (s’ouvre dans un nouvel onglet)', close: 'Fermer le bandeau', region: 'Version bêta', page: 'Nouveautés de la version 1.0' },
  en: { text: 'Attention: this widget is a beta version. We recommend migrating to version {N}.', news: 'Discover what’s new', label: 'Discover what’s new (opens in a new tab)', close: 'Close the banner', region: 'Beta version', page: 'What’s new in version 1.0' },
};

// La fenêtre « passez à la version X.Y » : les mots que le porteur a validés le 26/11 (sa demande : il est temps de passer à la dernière version, la rétrocompatibilité est assurée pour le moment, plus on attend moins
// elle l'est, et pour la sécurité et la maintenabilité), avec « {N} » à la place du numéro que la publication pose. L'espace avant le numéro est insécable (U+00A0) : il ne passe jamais seul à la ligne.
const UPGRADE = {
  fr: { title: 'Il est temps de passer à la version\u00a0{N}', compat: 'Vos documents et vos modèles s’ouvrent encore dans la version\u00a0{N} : cette compatibilité est assurée pour le moment. Plus vous attendez, moins elle le sera.',
    care: 'La bêta est figée : elle ne reçoit plus de correctifs de sécurité et devient de plus en plus difficile à maintenir. Seule la version\u00a0{N} reste à jour.', how: 'Dans Grist, remplacez l’adresse du widget par celle de la dernière version :',
    news: 'Découvrir les nouveautés', newsLabel: 'Découvrir les nouveautés (s’ouvre dans un nouvel onglet)', keep: 'Continuer avec la bêta' },
  en: { title: 'Time to move to version\u00a0{N}', compat: 'Your documents and templates still open in version\u00a0{N}: this compatibility is guaranteed for now. The longer you wait, the less it will be.',
    care: 'The beta is frozen: it no longer receives security fixes and is getting harder to maintain. Only version\u00a0{N} stays up to date.', how: 'In Grist, replace the widget address with the one of the latest version:',
    news: 'Discover what’s new', newsLabel: 'Discover what’s new (opens in a new tab)', keep: 'Continue with the beta' },
};
// Les textes ci-dessus sont des modèles (« {N} ») : `numbered` les rend pour un numéro, `NUMERO` est celui que la bêta composée pour js/version.js du dépôt de développement doit annoncer (rempli au démarrage).
const numbered = (texts, number) => Object.fromEntries(Object.entries(texts).map(([lang, t]) => [lang, Object.fromEntries(Object.entries(t).map(([key, value]) => [key, String(value).replace(/\{N\}/g, number)]))]));
const TEMPLATES = { banner: JSON.parse(JSON.stringify(TEXTS)), upgrade: JSON.parse(JSON.stringify(UPGRADE)) };
let NUMERO = '';

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
// L'ancien CDN des modules ES : la bêta figée (1.0.0-beta.1, tirée de l'historique) l'appelle encore, l'app d'aujourd'hui non (consigne 107 de GFS). Son nom est écrit en morceaux : la recherche « plus aucun appel à cet hôte » reste vide.
const OLD_CDN_HOST = ['esm', 'sh'].join('.');
const OLD_ORIGIN = `https://${OLD_CDN_HOST}`;
const CHUNK_BASE = `${OLD_ORIGIN}/_offline-chunks/`;
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);
const GRIST_API_TAG = '<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>';
let esmMap = {};
let BASE = '';

// Le site, comme celui du dépôt public : la V1 à la racine (dont nouveautes.html), la bêta avec son bandeau dans beta/, la bêta SANS bandeau à côté (beta-nue/ : la mesure de ce que la barre d'outils fait sans lui)
// et la bêta composée pour une AUTRE version (beta-v2/, 2.0.3 : le numéro qu'elle annonce doit suivre).
async function serve() {
  const routes = [[`${SITE_PATH}/beta/`, join(SITE, 'beta')], [`${SITE_PATH}/beta-nue/`, join(SITE, 'beta-nue')], [`${SITE_PATH}/beta-v2/`, join(SITE, 'beta-v2')], [`${SITE_PATH}/`, ROOT]];
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
const OWN_HOSTS = [OLD_CDN_HOST, 'docs.getgrist.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// Une ouverture de la bêta : un contexte neuf (la taille et le thème du système demandés), la langue et, si on le dit, le thème CHOISI dans le widget (pp_theme) posés avant tout script, l'écoute des violations
// de la politique de sécurité (window.__csp), ce que les pages ont dit (erreurs), raté ou demandé hors du site. Attend « Widget prêt. ».
// `upgrade` : 'close' (par défaut) ferme d'office la fenêtre « passez à la version X.Y » une fois la bêta prête, sans quoi son voile couvrirait tout ce que les mesures du bandeau regardent ; 'keep' la laisse ouverte.
async function ouvrir({ dir = 'beta', width = 700, height = 400, scheme = 'light', lang = 'fr', theme = null, upgrade = 'close' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
  const log = { errors: [], failed: [], foreign: [] };
  const watch = (page, name) => {
    page.on('pageerror', e => log.errors.push(`${name} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.errors.push(`${name} console.${m.type()}: ${m.text()}`); });
    page.on('requestfailed', r => log.failed.push(`${name} ${r.url()} ${(r.failure() || {}).errorText || ''}`));
    page.on('request', r => { const host = new URL(r.url()).hostname; if (host !== '127.0.0.1' && !OWN_HOSTS.includes(host)) log.foreign.push(`${name} ${r.url()}`); });
  };
  await context.route(`**://${OLD_CDN_HOST}/**`, async route => {
    const url = route.request().url();
    const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
    if (chunk) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
    const found = Object.keys(esmMap).find(k => url === `${OLD_ORIGIN}/${k}` || url === `${OLD_ORIGIN}/*${k}` || url.startsWith(`${OLD_ORIGIN}/${k}@`) || url.startsWith(`${OLD_ORIGIN}/*${k}@`));
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
  if (upgrade === 'close') await closeUpgradeIfAny(page);
  return { context, page, log };
}
const closeUpgradeIfAny = page => page.evaluate(() => { const keep = document.querySelector('#pp-beta-upgrade .pp-beta-upgrade-keep'); if (keep) keep.click(); });

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
    await closeUpgradeIfAny(page);
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

// ---------------------------------------------------------------------------------------------------------------------------------------------
// La fenêtre « Il est temps de passer à la version X.Y » : ce qu'elle dit, couvre et rend inatteignable ; puis, si `full`, ce que le clavier et la souris en font.
// ---------------------------------------------------------------------------------------------------------------------------------------------
const upgradeFacts = page => page.evaluate(() => {
  const root = document.getElementById('pp-beta-upgrade');
  if (!root) return null;
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const card = root.querySelector('.pp-beta-upgrade-card');
  const title = root.querySelector('.pp-beta-upgrade-title');
  const address = root.querySelector('.pp-beta-upgrade-address');
  const news = root.querySelector('.pp-beta-upgrade-news');
  const keep = root.querySelector('.pp-beta-upgrade-keep');
  const labelled = document.getElementById(root.getAttribute('aria-labelledby') || '');
  const others = Array.from(document.body.children).filter(el => el !== root && el.tagName !== 'SCRIPT');
  const points = [[2, 2], [innerWidth - 3, 2], [2, innerHeight - 3], [innerWidth - 3, innerHeight - 3], [innerWidth / 2, innerHeight / 2], [innerWidth / 2, 5]];
  const bannerLink = document.querySelector('#pp-beta-banner .pp-beta-banner-link');
  const bl = bannerLink && bannerLink.getBoundingClientRect();
  const atBanner = bl ? document.elementFromPoint(bl.left + bl.width / 2, bl.top + bl.height / 2) : null;
  const active = document.activeElement;
  return {
    count: document.querySelectorAll('#pp-beta-upgrade').length, role: root.getAttribute('role'), modal: root.getAttribute('aria-modal'), labelled: labelled ? labelled.textContent : null, labelledTag: labelled ? labelled.tagName : null,
    title: title.textContent, texts: Array.from(root.querySelectorAll('.pp-beta-upgrade-text')).map(p => p.textContent),
    address: address.textContent, addressHref: address.href, addressTag: address.tagName, addressTarget: address.target, addressRel: address.rel,
    news: news.textContent, newsHref: news.getAttribute('href'), newsResolved: news.href, newsTag: news.tagName, newsTarget: news.target, newsRel: news.rel, newsLabel: news.getAttribute('aria-label'),
    keep: keep.textContent, keepTag: keep.tagName, keepType: keep.getAttribute('type'),
    position: getComputedStyle(root).position, rootBox: box(root), cardBox: box(card), covered: points.every(([x, y]) => { const top = document.elementFromPoint(x, y); return !!top && root.contains(top); }),
    zIndex: parseInt(getComputedStyle(root).zIndex, 10) || 0, maxOtherZ: Math.max(0, ...Array.from(document.querySelectorAll('body *')).filter(el => !root.contains(el) && el.id !== 'pp-beta-guard').map(el => parseInt(getComputedStyle(el).zIndex, 10) || 0)),
    inertAll: others.length > 0 && others.every(el => el.hasAttribute('inert')), notInert: others.filter(el => !el.hasAttribute('inert')).map(el => el.id || el.tagName),
    bannerBehind: !!atBanner && root.contains(atBanner), bannerText: (document.querySelector('#pp-beta-banner .pp-beta-banner-text') || {}).textContent || null,
    focusOnCard: active === card, focusInside: root.contains(active), focus: active ? (active.className || active.tagName) : null,
    scrollsY: root.scrollHeight > root.clientHeight + 1, scrollsX: root.scrollWidth > root.clientWidth + 1,
    emoji: /\p{Extended_Pictographic}/u.test(root.textContent), images: root.querySelectorAll('img').length, svgs: root.querySelectorAll('svg').length,
    fontIsUi: ((a, b) => !!b.trim() && a === b)(...[getComputedStyle(root).fontFamily, getComputedStyle(document.documentElement).getPropertyValue('--font-ui')].map(v => v.replace(/["']/g, '').replace(/\s+/g, ' ').trim())),
    innerW: innerWidth, innerH: innerHeight, inertLeft: Array.from(document.body.children).filter(el => el.hasAttribute('inert')).length,
  };
});
// Les contrastes de la fenêtre : la couleur de chaque élément sur ce qu'il y a dessous (la carte est pleine : le voile translucide n'y entre pas). Texte >= 4,5:1 ; filet du bouton plein >= 3:1.
const upgradeContrast = page => page.evaluate(() => {
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
  const q = s => document.querySelector('#pp-beta-upgrade ' + s);
  const color = (s, prop = 'color') => parse(getComputedStyle(q(s))[prop]).slice(0, 3);
  const card = backdrop(q('.pp-beta-upgrade-card'));
  return {
    title: ratio(color('.pp-beta-upgrade-title'), card), text: ratio(color('.pp-beta-upgrade-text'), card), address: ratio(color('.pp-beta-upgrade-address'), card),
    news: ratio(color('.pp-beta-upgrade-news'), backdrop(q('.pp-beta-upgrade-news'))), newsEdge: ratio(color('.pp-beta-upgrade-news', 'borderTopColor'), card),
    keep: ratio(color('.pp-beta-upgrade-keep'), backdrop(q('.pp-beta-upgrade-keep'))),
  };
});
const upgradeContrastOk = c => c.title >= 4.5 && c.text >= 4.5 && c.address >= 4.5 && c.news >= 4.5 && c.newsEdge >= 3 && c.keep >= 4.5;
// Ce que le focus montre : le tour de l'élément qui l'a, au clavier (2 px pleins), et lequel c'est.
const focusFacts = page => page.evaluate(() => {
  const el = document.activeElement;
  const cs = el ? getComputedStyle(el) : null;
  return { which: el ? (el.className || el.tagName) : null, inside: !!el && !!el.closest('#pp-beta-upgrade'), outline: cs ? `${cs.outlineWidth} ${cs.outlineStyle}` : null };
});

async function runUpgrade({ id, lang, scheme, theme = null, width = 700, height = 400, full = false, dir = 'beta', number = NUMERO }) {
  const U = numbered(TEMPLATES.upgrade, number)[lang];
  const B = numbered(TEMPLATES.banner, number)[lang];
  const other = lang === 'fr' ? 'en' : 'fr';
  const { context, page, log } = await ouvrir({ dir, width, height, scheme, lang, theme, upgrade: 'keep' });
  const f = await upgradeFacts(page);
  check(`${id} : la fenêtre est là à l'ouverture, une seule fois (sans que la personne ait rien fait), au-dessus de tout ce que la bêta empile (z-index ${f ? f.zIndex : '?'} contre ${f ? f.maxOtherZ : '?'}) et sous la couche du garde-fou (2147483000)`,
    !!f && f.count === 1 && f.zIndex > f.maxOtherZ && f.zIndex < 2147483000, f && { count: f.count, z: f.zIndex, autres: f.maxOtherZ });
  if (!f) { await context.close(); return; }
  check(`${id} : c'est un dialogue modal (role=dialog, aria-modal) nommé par son titre, un h2 qui dit EXACTEMENT « ${U.title} »`,
    f.role === 'dialog' && f.modal === 'true' && f.labelledTag === 'H2' && f.labelled === U.title && f.title === U.title, { role: f.role, modal: f.modal, labelled: f.labelled, title: f.title });
  check(`${id} : elle dit EXACTEMENT les trois phrases validées (compatibilité assurée pour le moment, sécurité et entretien, où changer l'adresse)`, JSON.stringify(f.texts) === JSON.stringify([U.compat, U.care, U.how]), f.texts);
  const everything = [f.title, ...f.texts, f.bannerText].join(' ');
  check(`${id} : le numéro est ${number} partout (fenêtre ET bandeau « ${B.text} »), collé à « version » par une espace insécable, et jamais « 1.x » ni l'ancien « 1.1 » écrit en dur`,
    f.bannerText === B.text && f.title.includes(`version ${number}`) && !/\b1\.x\b/i.test(everything) && !/\{\{|\}\}|VERSION_COURANTE/.test(everything) && (number === '1.1' || !/version\s+1\.1\b/.test(everything)), { title: f.title, banner: f.bannerText });
  check(`${id} : l'adresse de la dernière version est celle du dossier au-dessus de beta/ (${BASE}${SITE_PATH}/), un lien qui s'ouvre dans un nouvel onglet sans lien avec la bêta (noopener noreferrer)`,
    f.addressTag === 'A' && f.address === `${BASE}${SITE_PATH}/` && f.addressHref === `${BASE}${SITE_PATH}/` && f.addressTarget === '_blank' && /\bnoopener\b/.test(f.addressRel) && /\bnoreferrer\b/.test(f.addressRel), { text: f.address, href: f.addressHref, target: f.addressTarget, rel: f.addressRel });
  check(`${id} : « ${U.news} » est un lien vers ../nouveautes.html?lang=${lang}, dans un nouvel onglet sans lien avec la bêta, et dit l'onglet à ceux qui lisent à voix haute ; « ${U.keep} » est un vrai bouton`,
    f.news === U.news && f.newsTag === 'A' && f.newsHref === `../nouveautes.html?lang=${lang}` && f.newsResolved === `${BASE}${SITE_PATH}/nouveautes.html?lang=${lang}` && f.newsTarget === '_blank' && /\bnoopener\b/.test(f.newsRel) && /\bnoreferrer\b/.test(f.newsRel) && f.newsLabel === U.newsLabel
      && f.keep === U.keep && f.keepTag === 'BUTTON' && f.keepType === 'button', { news: f.news, href: f.newsHref, resolved: f.newsResolved, label: f.newsLabel, keep: f.keep, keepTag: f.keepTag });
  check(`${id} : elle couvre toute la page (position fixed, plein cadre, six points du panneau sont à elle) et sa carte tient dans le panneau${f.scrollsY ? ' (ou le voile défile : le bas reste atteignable)' : ''}`,
    f.position === 'fixed' && Math.abs(f.rootBox.left) < 0.5 && Math.abs(f.rootBox.top) < 0.5 && Math.abs(f.rootBox.right - f.innerW) < 0.5 && Math.abs(f.rootBox.bottom - f.innerH) < 0.5 && f.covered && !f.scrollsX
      && f.cardBox.left >= -0.5 && f.cardBox.right <= f.innerW + 0.5 && (f.cardBox.bottom <= f.innerH + 0.5 || f.scrollsY), { root: f.rootBox, card: f.cardBox, covered: f.covered, scrollsY: f.scrollsY, scrollsX: f.scrollsX });
  check(`${id} : derrière elle plus rien ne s'atteint : tout le reste de <body> est inerte (attribut inert), le bandeau compris, et un clic à l'emplacement du bouton du bandeau tombe sur le voile`,
    f.inertAll && f.notInert.length === 0 && f.bannerBehind, { inertAll: f.inertAll, notInert: f.notInert, bannerBehind: f.bannerBehind });
  check(`${id} : le focus est sur la carte à l'ouverture (un lecteur d'écran lit le dialogue d'abord)`, f.focusOnCard, { focus: f.focus });
  check(`${id} : aucun emoji, aucune image, aucune icône : du texte et deux boutons ; la police est celle de l'interface (--font-ui)`, !f.emoji && f.images === 0 && f.svgs === 0 && f.fontIsUi, { emoji: f.emoji, images: f.images, svgs: f.svgs, fontIsUi: f.fontIsUi });
  const c = await upgradeContrast(page);
  check(`${id} : tout se lit : titre, phrases, adresse et textes des boutons >= 4,5:1, filet du bouton plein >= 3:1`, upgradeContrastOk(c), c);
  await shot(page, id, height);

  const verdict = async (when) => {
    check(`${id} : ${when}aucune erreur de page ni de console, aucune requête ratée, aucune requête hors du site ou de son miroir`, log.errors.length === 0 && log.failed.length === 0 && log.foreign.length === 0, { errors: log.errors.slice(0, 3), failed: log.failed.slice(0, 3), foreign: log.foreign.slice(0, 3) });
    const csp = await page.evaluate(() => window.__csp.slice());
    check(`${id} : ${when}aucune violation de la politique de sécurité de la bêta (la fenêtre n'a besoin d'aucun script en ligne ni d'aucune source de plus)`, csp.length === 0, csp);
  };

  if (full) {
    // Le clavier : Tab et Maj+Tab bouclent entre l'adresse, « Découvrir les nouveautés » et « Continuer avec la bêta » ; rien de la bêta, derrière, n'est atteint ; le focus se voit (2 px).
    const order = [];
    for (let n = 0; n < 7; n++) { await page.keyboard.press('Tab'); order.push(await focusFacts(page)); }
    const ring = ['pp-beta-upgrade-address', 'pp-beta-upgrade-news', 'pp-beta-upgrade-keep'];
    check(`${id} : au clavier, Tab fait le tour adresse, « ${U.news} », « ${U.keep} » puis revient à l'adresse (sept appuis, jamais hors de la fenêtre), et chaque arrêt montre un tour de 2 px`,
      order.every(o => o.inside) && order.map(o => o.which).join('|') === [0, 1, 2, 0, 1, 2, 0].map(k => ring[k]).join('|') && order.every(o => /^2px (solid|auto)$/.test(o.outline)), order);
    const back = [];
    for (let n = 0; n < 4; n++) { await page.keyboard.press('Shift+Tab'); back.push(await focusFacts(page)); }
    check(`${id} : et Maj+Tab le fait à l'envers (adresse, « ${U.keep} », « ${U.news} », adresse), sans sortir`, back.every(o => o.inside) && back.map(o => o.which).join('|') === [2, 1, 0, 2].map(k => ring[k]).join('|'), back);

    // La langue du widget décide, y compris quand elle change : la fenêtre suit sur place, le numéro reste.
    const T2 = numbered(TEMPLATES.upgrade, number)[other];
    await page.evaluate((next) => I18n.setLang(next), other);
    await sleep(200);
    const switched = await upgradeFacts(page);
    check(`${id} : changer la langue du widget (${lang} → ${other}) change la fenêtre sur place : titre, phrases, boutons, étiquette et adresse ?lang=${other} du lien des nouveautés ; elle reste ouverte, une seule fois`,
      !!switched && switched.count === 1 && switched.title === T2.title && JSON.stringify(switched.texts) === JSON.stringify([T2.compat, T2.care, T2.how]) && switched.news === T2.news && switched.keep === T2.keep && switched.newsLabel === T2.newsLabel && switched.newsHref === `../nouveautes.html?lang=${other}`,
      switched && { title: switched.title, news: switched.news, href: switched.newsHref });
    await page.evaluate((again) => I18n.setLang(again), lang);
    await sleep(200);
    const restored = await upgradeFacts(page);
    check(`${id} : et la rendre (${other} → ${lang}) la remet comme elle était`, !!restored && restored.title === U.title && JSON.stringify(restored.texts) === JSON.stringify([U.compat, U.care, U.how]) && restored.newsHref === `../nouveautes.html?lang=${lang}`, restored && { title: restored.title });

    // La souris : le lien des nouveautés ouvre un NOUVEL onglet, la bêta et sa fenêtre restent où elles sont.
    const before = page.url();
    const logBefore = [log.errors.length, log.failed.length, log.foreign.length];
    const [tabNews] = await Promise.all([context.waitForEvent('page', { timeout: 15000 }).catch(() => null), click(page, '#pp-beta-upgrade .pp-beta-upgrade-news')]);
    check(`${id} : un vrai clic sur « ${U.news} » ouvre un NOUVEL onglet`, !!tabNews);
    if (tabNews) {
      await tabNews.waitForLoadState('load').catch(() => {});
      await tabNews.waitForFunction(() => { const m = document.getElementById('pp-news-modal'); return !!m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 15000 }).catch(() => {});
      await sleep(400);
      const tab = await tabNews.evaluate(() => ({ url: location.href, opener: window.opener === null ? null : 'présent', lang: document.documentElement.lang, open: !!document.getElementById('pp-news-modal') && getComputedStyle(document.getElementById('pp-news-modal')).display !== 'none', csp: (window.__csp || []).slice() }));
      check(`${id} : cet onglet est ${SITE_PATH}/nouveautes.html?lang=${lang}, sans lien avec la bêta (pas d'opener), fenêtre des nouveautés ouverte, aucune violation de la politique de sécurité`, tab.url === `${BASE}${SITE_PATH}/nouveautes.html?lang=${lang}` && tab.opener === null && tab.open && tab.csp.length === 0, tab);
      await tabNews.close();
    }
    // L'adresse de la dernière version : un NOUVEL onglet aussi, sans lien avec la bêta (ce que dit la V1, à cette adresse, ne regarde pas la bêta : ses éventuels messages ne comptent pas ici).
    const [tabLatest] = await Promise.all([context.waitForEvent('page', { timeout: 15000 }).catch(() => null), click(page, '#pp-beta-upgrade .pp-beta-upgrade-address')]);
    check(`${id} : un vrai clic sur l'adresse ouvre un NOUVEL onglet, à ${SITE_PATH}/, sans lien avec la bêta (pas d'opener)`, !!tabLatest);
    if (tabLatest) {
      await tabLatest.waitForLoadState('domcontentloaded').catch(() => {});
      const latest = await tabLatest.evaluate(() => ({ url: location.href, opener: window.opener === null ? null : 'présent', title: document.title })).catch(() => ({ url: tabLatest.url(), opener: '?' }));
      check(`${id} : cet onglet est l'adresse de la dernière version (${BASE}${SITE_PATH}/), sans opener`, latest.url === `${BASE}${SITE_PATH}/` && latest.opener === null, latest);
      await tabLatest.close();
      for (const [index, list] of [log.errors, log.failed, log.foreign].entries()) list.splice(logBefore[index], list.length - logBefore[index], ...list.slice(logBefore[index]).filter(line => !/^onglet /.test(line)));
    }
    const stay = await upgradeFacts(page);
    check(`${id} : la bêta est restée où elle était, avec sa fenêtre toujours ouverte (une seule), le reste de la page toujours inerte`, page.url() === before && !!stay && stay.count === 1 && stay.inertAll, { url: page.url(), stay: !!stay });

    // Échap la ferme, et rend tout : plus rien d'inerte, le bandeau atteignable ; la bêta, derrière, n'a pas vu la touche (elle ne ferme pas, de son côté, une fenêtre qu'elle aurait ouverte).
    await page.evaluate(() => { window.__escSeen = 0; document.addEventListener('keydown', (event) => { if (event.key === 'Escape') window.__escSeen++; }); });
    await page.keyboard.press('Escape');
    await sleep(300);
    const afterEsc = await page.evaluate(() => { const l = document.querySelector('#pp-beta-banner .pp-beta-banner-link'); const r = l && l.getBoundingClientRect(); const top = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { open: !!document.getElementById('pp-beta-upgrade'), inert: document.querySelectorAll('[inert]').length, banner: !!top && !!l && l.contains(top), escapeSeenByPage: window.__escSeen }; });
    check(`${id} : Échap la ferme : plus de fenêtre, plus rien d'inerte, le bouton du bandeau est atteignable de nouveau, et la bêta derrière n'a pas reçu la touche`, !afterEsc.open && afterEsc.inert === 0 && afterEsc.banner && afterEsc.escapeSeenByPage === 0, afterEsc);
    await verdict('avant de la rouvrir : ');

    // À CHAQUE ouverture : rechargée, la bêta la remontre ; « Continuer avec la bêta » (vraie souris) la ferme et ne retient RIEN.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!document.getElementById('pp-beta-upgrade'), null, { timeout: 15000 }).catch(() => {});
    const again = await upgradeFacts(page);
    check(`${id} : la bêta rechargée la remontre (à chaque ouverture, rien n'est retenu de la fermeture par Échap)`, !!again && again.count === 1 && again.title === U.title && again.inertAll, again && { count: again.count, title: again.title });
    await sleep(900);
    const storageBefore = await storageOf(page);
    const keepClick = await click(page, '#pp-beta-upgrade .pp-beta-upgrade-keep');
    await sleep(300);
    const closed = await page.evaluate(() => ({ open: !!document.getElementById('pp-beta-upgrade'), inert: document.querySelectorAll('[inert]').length, banner: !!document.getElementById('pp-beta-banner') }));
    const storageAfter = await storageOf(page);
    check(`${id} : un vrai clic sur « ${U.keep} » la ferme, le bandeau reste, plus rien d'inerte`, !!keepClick && keepClick.reachable && !closed.open && closed.inert === 0 && closed.banner, { keepClick, closed });
    check(`${id} : fermer ne retient RIEN : localStorage, sessionStorage et cookies sont tels qu'ils étaient`, JSON.stringify(storageBefore) === JSON.stringify(storageAfter), { avant: storageBefore, apres: storageAfter });
    await shot(page, id + '-ferme', height);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!document.getElementById('pp-beta-upgrade'), null, { timeout: 15000 }).catch(() => {});
    const third = await upgradeFacts(page);
    check(`${id} : et rechargée une troisième fois, elle revient encore (rien n'a été retenu de « ${U.keep} »)`, !!third && third.count === 1, third && { count: third.count });

    // Le juge sait dire non : les mêmes mesures refusent une fenêtre qui ne couvre pas la page, une page restée atteignable et un texte gris clair.
    await sleep(500);
    await page.addStyleTag({ content: '#pp-beta-upgrade { width: 40% !important; height: 40% !important; bottom: auto !important; right: auto !important; }' });
    const small = await upgradeFacts(page);
    check(`${id} : le juge sait dire non (1/3) : un voile qui ne couvre que le coin de la page serait refusé`, !!small && !small.covered, small && { covered: small.covered });
    await page.evaluate(() => { document.querySelectorAll('[inert]').forEach(el => el.removeAttribute('inert')); });
    const notInert = await upgradeFacts(page);
    check(`${id} : le juge sait dire non (2/3) : un reste de page qui n'est pas inerte serait refusé`, !!notInert && !notInert.inertAll && notInert.notInert.length > 0, notInert && { notInert: notInert.notInert });
    await page.addStyleTag({ content: '#pp-beta-upgrade .pp-beta-upgrade-card { background: #fff !important; } #pp-beta-upgrade .pp-beta-upgrade-text, #pp-beta-upgrade .pp-beta-upgrade-title { color: #9a9a9a !important; }' });
    const pale = await upgradeContrast(page);
    check(`${id} : le juge sait dire non (3/3) : un texte gris clair (#9a9a9a sur blanc) serait refusé`, upgradeContrastOk(c) && !upgradeContrastOk(pale) && pale.text < 4.5, { texte: pale.text });
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
  // Le numéro que la bêta annonce est celui de la version qui part : ici celle que js/version.js du dépôt de développement porte (1.2.0-dev annonce « 1.2 »), et une AUTRE (2.0.3) sur un second site, pour voir qu'il suit.
  const DEV_VERSION = (/PP_VERSION\s*=\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'js', 'version.js'), 'utf8')) || [])[1];
  NUMERO = tool.numeroAffiche(DEV_VERSION);
  for (const t of Object.values(TEXTS)) t.text = t.text.replace('{N}', NUMERO);
  mkdirSync(SITE, { recursive: true });
  tool.poserDepuisDossier(SRC, join(SITE, 'beta'), tool.sources(DEV_VERSION));
  tool.poserDepuisDossier(SRC, join(SITE, 'beta-v2'), tool.sources('2.0.3'));
  cpSync(SRC, join(SITE, 'beta-nue'), { recursive: true });

  // 0. La bêta composée est la bêta figée et le bandeau, rien d'autre.
  const frozen = listFiles(SRC), composed = listFiles(join(SITE, 'beta'));
  const added = composed.filter(file => !frozen.includes(file));
  const missing = frozen.filter(file => !composed.includes(file));
  const changed = frozen.filter(file => composed.includes(file) && Buffer.compare(readFileSync(join(SRC, file)), readFileSync(join(SITE, 'beta', file))) !== 0);
  const frozenVersion = (/PP_VERSION\s*=\s*'([^']+)'/.exec(readFileSync(join(SRC, 'js', 'version.js'), 'utf8')) || [])[1];
  check('la copie figée est la bêta 1.0.0-beta.1 (js/version.js), sans un fichier du bandeau', frozenVersion === '1.0.0-beta.1' && !frozen.includes(tool.BANDEAU_JS) && !frozen.includes(tool.BANDEAU_CSS), { version: frozenVersion });
  check('la bêta composée = la bêta figée + css/beta-bandeau.css + js/beta-bandeau.js + js/beta-garde.js + trois lignes d\'index.html : rien d\'autre ne change, rien ne manque',
    JSON.stringify(added) === JSON.stringify([tool.BANDEAU_CSS, tool.BANDEAU_JS, tool.GARDE_JS].sort()) && missing.length === 0 && JSON.stringify(changed) === '["index.html"]'
      && tool.sansBandeau(readFileSync(join(SITE, 'beta', 'index.html'), 'utf8')) === readFileSync(join(SRC, 'index.html'), 'utf8'), { added, missing, changed });

  // Le numéro est posé à la place du repère, une fois, et seulement lui : le script posé est le modèle du dépôt de développement, au numéro près ; `?v=` est l'empreinte du fichier posé.
  const model = readFileSync(join(ROOT, 'outils', 'depot-propre', 'beta', 'beta-bandeau.js'), 'utf8').replace(/\r\n/g, '\n');
  const posed = readFileSync(join(SITE, 'beta', tool.BANDEAU_JS), 'utf8');
  const posed2 = readFileSync(join(SITE, 'beta-v2', tool.BANDEAU_JS), 'utf8');
  const pageHtml = readFileSync(join(SITE, 'beta', 'index.html'), 'utf8');
  const hash = createHash('sha256').update(readFileSync(join(SITE, 'beta', tool.BANDEAU_JS))).digest('hex').slice(0, 8);
  check(`le script du bandeau posé porte le numéro ${NUMERO} (celui de js/version.js, ${DEV_VERSION}) à la place du repère, une fois : le modèle du dépôt de développement, au numéro près, sans repère resté`,
    model.includes(tool.REPERE_NUMERO) && !posed.includes(tool.REPERE_NUMERO) && posed.includes(`const LATEST = '${NUMERO}';`) && posed === model.replace(tool.REPERE_NUMERO, NUMERO) && posed2 === model.replace(tool.REPERE_NUMERO, '2.0'), { numero: NUMERO, repereResté: posed.includes(tool.REPERE_NUMERO) });
  check(`sa ligne dans index.html porte l'empreinte du fichier POSÉ (?v=${hash}) : un autre numéro change l'empreinte, donc le cache du navigateur`,
    pageHtml.includes(`<script src="${tool.BANDEAU_JS}?v=${hash}"></script>`) && hash !== createHash('sha256').update(readFileSync(join(SITE, 'beta-v2', tool.BANDEAU_JS))).digest('hex').slice(0, 8), { hash });
  check('sans numéro ou avec un numéro qui n\'en est pas un, l\'outil s\'arrête (jamais un numéro au hasard) ; 1.2.0, 1.2.3, 1.2.0-rc.1 et 1.2.0-dev annoncent tous 1.2, 2.0.3 annonce 2.0',
    ['', undefined, null, 'x', '1', '1.2.x', 'v1.2.0', '1.2.0.4', '1.2.0-'].every(v => { try { tool.sources(v); return false; } catch (e) { return /numéro|version/.test(e.message); } })
      && ['1.2.0', '1.2.3', '1.2.0-rc.1', '1.2.0-dev', '1.2'].every(v => tool.numeroAffiche(v) === '1.2') && tool.numeroAffiche('2.0.3') === '2.0' && tool.numeroAffiche('10.11.12') === '10.11');

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

  // 7. La fenêtre « passez à la version X.Y » : les deux langues, les trois thèmes (clair, sombre CHOISI, sombre du système), le tour complet (clavier, souris) dans les deux premières ; étroit, bas ; un autre numéro.
  await sansPlanter('fenêtre, français clair', () => runUpgrade({ id: 'fenêtre, français clair', lang: 'fr', scheme: 'light', full: true }));
  await sansPlanter('fenêtre, anglais sombre', () => runUpgrade({ id: 'fenêtre, anglais sombre', lang: 'en', scheme: 'dark', full: true }));
  await sansPlanter('fenêtre, français, sombre choisi', () => runUpgrade({ id: 'fenêtre, français, sombre choisi dans le widget', lang: 'fr', scheme: 'light', theme: 'dark' }));
  await sansPlanter('fenêtre, anglais, clair choisi', () => runUpgrade({ id: 'fenêtre, anglais, clair choisi dans le widget', lang: 'en', scheme: 'dark', theme: 'light' }));
  await sansPlanter('fenêtre, français sombre du système', () => runUpgrade({ id: 'fenêtre, français, sombre du système', lang: 'fr', scheme: 'dark' }));
  await sansPlanter('fenêtre à 360 px', () => runUpgrade({ id: 'fenêtre, français clair à 360 x 560', lang: 'fr', scheme: 'light', width: 360, height: 560 }));
  await sansPlanter('fenêtre à 360 x 300', () => runUpgrade({ id: 'fenêtre, anglais sombre à 360 x 300 (le voile défile)', lang: 'en', scheme: 'dark', width: 360, height: 300 }));
  await sansPlanter('fenêtre, bêta composée pour la 2.0.3', () => runUpgrade({ id: 'fenêtre, bêta composée pour la 2.0.3', lang: 'fr', scheme: 'light', dir: 'beta-v2', number: '2.0' }));
  await sansPlanter('fenêtre, bêta composée pour la 2.0.3, en anglais', () => runUpgrade({ id: 'fenêtre, bêta composée pour la 2.0.3, en anglais', lang: 'en', scheme: 'light', dir: 'beta-v2', number: '2.0' }));

  // 6. L'ancien code : la bêta d'avant n'a ni bandeau ni fichier du bandeau.
  const { context, page, log } = await ouvrir({ dir: 'beta-nue', lang: 'fr', scheme: 'light' });
  const old = await bannerFacts(page);
  const oldFiles = await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).filter(name => /beta-bandeau/.test(name)));
  const oldWindow = await upgradeFacts(page);
  check('la bêta d\'avant (sans bandeau) n\'a ni bandeau, ni fenêtre « passez à la version », ni fichier du bandeau : les vérifications ci-dessus lui donneraient tort', old === null && oldWindow === null && oldFiles.length === 0 && log.errors.length === 0, { bandeau: old === null, fenetre: oldWindow === null, fichiers: oldFiles, errors: log.errors.slice(0, 2) });
  await context.close();
} catch (e) {
  check('le banc va jusqu\'au bout', false, String((e && e.message) || e).split('\n')[0]);
}

console.log(`\n${total - failures}/${total} passés`);
await finish(failures ? 1 : 0);
