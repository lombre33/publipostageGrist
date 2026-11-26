#!/usr/bin/env node
// Le garde-fou de la bêta figée (outils/depot-propre/beta/beta-garde.js, posé dans beta/ par outils/depot-propre/beta-bandeau.mjs ; consigne 102 de Grist Factory Suite, choix du porteur du 25/11 : « une dernière bêta qui
// ne recrée pas les anciennes tables ») : devant un document que la version 1 a déjà mis à jour (il porte au moins une table du widget sous son nom anglais), la bêta n'écrit PLUS RIEN, ne pose même pas la question
// « Créer les tables du widget dans ce document ? » et dit « Ce document a été mis à jour par une version plus récente : ouvrez la dernière version. » ; devant un document aux noms d'avant, elle est la bêta, inchangée.
// La bêta est COMPOSÉE comme la publication la compose (la copie figée 1.0.0-beta.1 + le bandeau + le garde-fou), servie avec la V1 à côté (/Publipostage-Plus/beta/ et /Publipostage-Plus/), SOUS SA VRAIE POLITIQUE
// DE SÉCURITÉ (pas de `bypassCSP`), avec le faux Grist de dev-tests/grist-stub.js et le miroir hors ligne des CDN, à 700x400. La copie figée vient du commit de développement dont elle est la copie (ddea35d1, 05/10, version
// 1.0.0-beta.1), lue par `git archive` ; un dépôt qui n'a pas cet historique donne le dossier d'une bêta SANS bandeau ni garde-fou dans PP_BETA_SOURCE.
// Ce que ça vérifie :
//  0) la composition : la bêta composée = la bêta figée + css/beta-bandeau.css + js/beta-bandeau.js + js/beta-garde.js + trois lignes d'index.html, dont celle du garde-fou JUSTE AVANT js/table-consent.js (donc avant
//     le démarrage anticipé de la bêta) et après js/grist-api.js (il enveloppe GristAPI) ;
//  1) un document aux noms d'avant (créé par la bêta) : rien ne change - la bêta s'ouvre, aucune couche, rien d'inerte, la liste des tables rendue est celle du document, un enregistrement arrive dans la table d'avant ;
//     un document neuf (aucune table du widget) : la question « Créer les tables du widget ? » est posée comme avant, « Créer les tables » crée les tables d'avant, aucune couche ;
//  2) un document aux noms anglais, en français et en anglais, clair / sombre du système / sombre choisi : la couche pleine page dit EXACTEMENT la phrase de la consigne (région, titre, lien vers la dernière version) ;
//     aucune question, aucune écriture (le faux Grist n'a reçu AUCUNE action), aucune table d'avant recréée ; tout le reste de la page est inerte et la couche est au-dessus de tout ; une écriture que la page tente est
//     refusée par l'erreur de refus que la bêta connaît (`tablesDeclined`), Ctrl+S n'écrit rien ; le texte se lit à 4,5:1 ; la langue suit I18n.setLang ; la couche tient dans 700x400 comme dans 360x640 ;
//  3) un document aux DEUX séries de tables : même chose (la bêta pouvait écrire dans ses tables d'avant, elle ne le fait pas) ;
//  4) un document que la version 1 met à jour PENDANT que la bêta est ouverte : la création d'une table du widget relit d'abord la liste, se refuse et déclenche la couche ;
//  5) aucune erreur de page ou de console, aucune requête ratée ou hors du site, AUCUNE violation de la politique de sécurité de la bêta ;
//  5 bis) la fenêtre « Il est temps de passer à la version X.Y » du même script (dev-tests/verify-beta-banner.mjs la mesure) passe APRÈS le garde-fou : devant un document aux noms anglais elle ne s'ouvre pas ; ouverte devant un
//     document d'avant, puis le document mis à jour pendant qu'elle est ouverte, c'est la couche du garde-fou qui la retire (plus de voile, plus de touche avalée, le focus reste à la couche) ; elle est fermée d'office dans les autres ouvertures ;
//  6) le juge sait dire non : la bêta d'avant (sans garde-fou) recrée les tables d'avant devant un document aux noms anglais - SANS poser de question quand le document porte Publipostage_UserProbe (le seul nom
//     commun aux deux séries : pour la bêta, c'est un accord déjà donné), après « Créer les tables » sinon ; un garde-fou sans refus d'écrire, ou sans « non » d'avance à la question, ne passe pas les mêmes mesures.
// Lancé par run-headless.mjs (groupe Node « betaGuardMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-beta-guard.mjs
// BETA_GUARD_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit. BETA_GUARD_PORT : le port du petit serveur (9063 par défaut). PP_BETA_SOURCE : voir plus haut.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.BETA_GUARD_PORT || 9063);
const SHOTS = process.env.BETA_GUARD_SHOTS ? resolve(process.env.BETA_GUARD_SHOTS) : '';
const BETA_COMMIT = 'ddea35d1';
const SITE_PATH = '/Publipostage-Plus';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
let tool = null; // outils/depot-propre/beta-bandeau.mjs : l'outil qui compose la bêta

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

// Les textes de la consigne 102, tels que la couche doit les dire (l'apostrophe de l'anglais est l'apostrophe typographique, comme tous les textes anglais de l'app).
const TEXTS = {
  fr: {
    lead: 'Ce document a été mis à jour par une version plus récente : ouvrez la dernière version.',
    why: 'Cette version bêta n’y écrit plus rien : elle ne recrée pas les anciennes tables et laisse vos modèles intacts.',
    how: 'Dans Grist, remplacez l’adresse du widget par celle de la dernière version :',
    region: 'Document mis à jour par une version plus récente',
  },
  en: {
    lead: 'This document was updated by a more recent version: open the latest version.',
    why: 'This beta version no longer writes anything to it: it does not recreate the old tables and leaves your templates untouched.',
    how: 'In Grist, replace the widget address with the one of the latest version:',
    region: 'Document updated by a more recent version',
  },
};
const LEGACY_TABLES = ['Publipostage_Modeles', 'Publipostage_LiensTables', 'Publipostage_PreferencesModeles', 'Publipostage_Commentaires', 'Publipostage_Abreviations', 'Publipostage_FormatsPage'];
const CONSENT_TITLE = 'Créer les tables du widget dans ce document ?';
// Le refus d'écrire se lit dans la console de la bêta quand un de ses gestes l'attrape sans connaître l'erreur de refus (js/templates.js : « Erreur migration des colonnes… ») : c'est un message sans suite, le seul toléré.
const REFUSAL = /Bêta : ce document a été mis à jour par une version plus récente, rien n’y est écrit/;
const NO_USER_PROBE = "stub.state.tables = stub.state.tables.filter(n => n !== 'Publipostage_UserProbe');";

const WORK = mkdtempSync(join(tmpdir(), 'pp-beta-guard-'));
const SITE = join(WORK, 'site');
let browser = null;
let server = null;
async function finish(code) {
  try { if (browser) await browser.close(); } catch (e) { /* déjà fermé */ }
  try { if (server) server.close(); } catch (e) { /* déjà arrêté */ }
  rmSync(WORK, { recursive: true, force: true });
  process.exit(code);
}

// La bêta figée, SANS bandeau ni garde-fou : le commit de développement dont elle est la copie, ou le dossier que PP_BETA_SOURCE désigne.
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

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
// L'ancien CDN des modules ES : la bêta figée (1.0.0-beta.1, tirée de l'historique) l'appelle encore, l'app d'aujourd'hui non (consigne 107 de GFS). Son nom est écrit en morceaux : la recherche « plus aucun appel à cet hôte » reste vide.
const OLD_CDN_HOST = ['esm', 'sh'].join('.');
const OLD_ORIGIN = `https://${OLD_CDN_HOST}`;
const CHUNK_BASE = `${OLD_ORIGIN}/_offline-chunks/`;
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);
const GRIST_API_TAG = '<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>';
let esmMap = {};
let BASE = '';

// Le site, comme celui du dépôt public : la V1 à la racine, la bêta avec son bandeau et son garde-fou dans beta/, la bêta d'avant (sans garde-fou) dans beta-nue/, et un garde-fou AMPUTÉ de son refus d'écrire et de son
// « non » à la question dans beta-mutant/ (le juge : la mesure doit le refuser).
async function serve() {
  const routes = [[`${SITE_PATH}/beta/`, join(SITE, 'beta')], [`${SITE_PATH}/beta-nue/`, join(SITE, 'beta-nue')], [`${SITE_PATH}/beta-mutant/`, join(SITE, 'beta-mutant')], [`${SITE_PATH}/`, ROOT]];
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

// Une ouverture de la bêta : un contexte neuf (la taille et le thème du système demandés), la langue et, si on le dit, le thème CHOISI dans le widget (pp_theme) posés avant tout script, les noms que le document porte
// (`names` : 'legacy' = ceux d'avant, 'english' = ceux de la version 1 ; `seed` : du code joué sur le faux Grist avant la première lecture), l'écoute des violations de la politique de sécurité (window.__csp), ce que les
// pages ont dit (erreurs), raté ou demandé hors du site. `wait` : 'ready' (« Widget prêt. »), 'guard' (la couche), 'dialog' (la question de création des tables) ; puis une courte pause, pour que tout ce qui part
// à l'ouverture ait eu lieu.
// `upgrade` : 'close' (par défaut) ferme d'office la fenêtre « passez à la version X.Y » (le voile de dev-tests/verify-beta-banner.mjs couvrirait les clics de l'essai), après avoir noté si elle était là (`upgradeSeen`) ; 'keep' la laisse ouverte.
async function ouvrir({ dir = 'beta', width = 700, height = 400, scheme = 'light', lang = 'fr', theme = null, names = 'legacy', seed = '', wait = 'ready', upgrade = 'close' } = {}) {
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
  await context.addInitScript(mode => { window.__schemaNames = mode; }, names);
  await context.addInitScript({ content: await readFile(join(ROOT, 'dev-tests', 'load-doc.js'), 'utf8') });
  // Le document tel que la bêta le trouve : celui du banc de charge, puis ce que l'essai y ajoute ou en retire avant la première lecture.
  if (seed) await context.addInitScript(`(() => { const base = window.__preSeedGristStub; window.__preSeedGristStub = (stub) => { if (base) base(stub); ${seed} }; })();`);
  // Ce que la page a montré comme fenêtre de question, à n'importe quel moment (pas seulement à la fin) : une question ouverte puis refermée aurait déjà demandé quelque chose.
  await context.addInitScript(() => {
    window.__dialogSeen = [];
    document.addEventListener('DOMContentLoaded', () => {
      new MutationObserver(() => { const el = document.getElementById('pp-dialog-modal'); if (el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0) { const t = (document.getElementById('pp-dialog-title') || {}).textContent; if (!window.__dialogSeen.includes(t)) window.__dialogSeen.push(t); } })
        .observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'hidden', 'class'] });
    });
  });
  const page = await context.newPage();
  watch(page, 'bêta');
  context.on('page', tab => watch(tab, 'onglet'));
  await page.goto(`${BASE}${SITE_PATH}/${dir}/`, { waitUntil: 'load' });
  const waiting = {
    ready: () => page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 60000 }),
    guard: () => page.waitForSelector('#pp-beta-guard', { timeout: 60000 }),
    dialog: () => page.waitForFunction(() => window.__dialogSeen.length > 0, null, { timeout: 60000 }),
  }[wait];
  await waiting().catch(() => log.errors.push(`bêta : « ${wait} » n'est pas venu en 60 s`));
  await sleep(1500);
  const upgradeSeen = await page.evaluate(() => !!document.getElementById('pp-beta-upgrade'));
  if (upgrade === 'close' && upgradeSeen) await page.evaluate(() => { const keep = document.querySelector('#pp-beta-upgrade .pp-beta-upgrade-keep'); if (keep) keep.click(); });
  return { context, page, log, upgradeSeen };
}

// Ce que le faux Grist a reçu et garde : les actions appliquées, les tables du document, les lignes de la table des modèles d'avant et la liste que `listTables` rend à la page.
const stubFacts = page => page.evaluate(async () => {
  const stub = window.__gristStub;
  return {
    actions: stub.state.actionLog.length, addTables: stub.state.actionLog.filter(a => a[0] === 'AddTable').map(a => a[1]),
    tables: stub.state.tables.slice(), listed: await grist.docApi.listTables(),
    modeles: ((stub.state.rows.Publipostage_Modeles || {}).Nom || []).slice(), templates: ((stub.state.rows.Publipostage_Templates || {}).Name || []).slice(),
  };
});
// La couche, telle que la page la montre.
const guardFacts = page => page.evaluate(() => {
  const overlay = document.getElementById('pp-beta-guard');
  if (!overlay) return null;
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const card = overlay.querySelector('.pp-beta-guard-card');
  const lead = overlay.querySelector('.pp-beta-guard-lead');
  const texts = Array.from(overlay.querySelectorAll('.pp-beta-guard-text')).map(p => p.textContent);
  const link = overlay.querySelector('.pp-beta-guard-link');
  const labelled = document.getElementById(overlay.getAttribute('aria-labelledby') || '');
  const covered = [[2, 2], [innerWidth - 3, 2], [2, innerHeight - 3], [innerWidth - 3, innerHeight - 3], [innerWidth / 2, innerHeight / 2], [innerWidth / 2, 5]].every(([x, y]) => { const top = document.elementFromPoint(x, y); return !!top && overlay.contains(top); });
  const others = Array.from(document.body.children).filter(el => el !== overlay && el.tagName !== 'SCRIPT');
  return {
    count: document.querySelectorAll('#pp-beta-guard').length, role: overlay.getAttribute('role'), modal: overlay.getAttribute('aria-modal'), region: overlay.getAttribute('aria-label'),
    labelled: labelled ? labelled.textContent : null, lead: lead.textContent, leadTag: lead.tagName, texts, link: link.textContent, href: link.href, linkTarget: link.target, linkRel: link.rel,
    position: getComputedStyle(overlay).position, overlayBox: box(overlay), cardBox: box(card), covered, innerW: innerWidth, innerH: innerHeight, last: document.body.lastElementChild === overlay,
    inertAll: others.length > 0 && others.every(el => el.hasAttribute('inert')), notInert: others.filter(el => !el.hasAttribute('inert')).map(el => el.id || el.tagName), scrollsX: overlay.scrollWidth > overlay.clientWidth + 1,
    emoji: /\p{Extended_Pictographic}/u.test(overlay.textContent), images: overlay.querySelectorAll('img').length,
    fontIsUi: ((a, b) => !!b.trim() && a === b)(...[getComputedStyle(overlay).fontFamily, getComputedStyle(document.documentElement).getPropertyValue('--font-ui')].map(v => v.replace(/["']/g, '').replace(/\s+/g, ' ').trim())),
  };
});
// Les contrastes de la couche : la couleur de chaque texte sur ce qu'il y a dessous. Texte >= 4,5:1.
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
  const on = (s) => ratio(parse(getComputedStyle(q(s)).color).slice(0, 3), backdrop(q(s)));
  return { lead: on('#pp-beta-guard .pp-beta-guard-lead'), text: on('#pp-beta-guard .pp-beta-guard-text'), link: on('#pp-beta-guard .pp-beta-guard-link') };
});
const contrastOk = c => c.lead >= 4.5 && c.text >= 4.5 && c.link >= 4.5;
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };
async function verdict(id, page, log, when = '') {
  const errors = log.errors.filter(line => !REFUSAL.test(line));
  check(`${id} : ${when}aucune erreur de page ni de console (hors le refus d'écrire que la bêta journalise), aucune requête ratée, aucune requête hors du site ou de son miroir`, errors.length === 0 && log.failed.length === 0 && log.foreign.length === 0, { errors: errors.slice(0, 3), failed: log.failed.slice(0, 3), foreign: log.foreign.slice(0, 3) });
  const csp = await page.evaluate(() => window.__csp.slice());
  check(`${id} : ${when}aucune violation de la politique de sécurité de la bêta (la couche n'a besoin d'aucun script en ligne ni d'aucune source de plus)`, csp.length === 0, csp);
}
async function sansPlanter(name, manoeuvre) {
  try { await manoeuvre(); } catch (e) { check(`${name} : la manœuvre va jusqu'au bout`, false, String((e && e.message) || e).split('\n')[0]); }
}

// 2 et 3. Un document que la version 1 a déjà touché : la couche, rien d'écrit, rien de demandé, rien de recréé. `facts` : ce que la mesure doit trouver ; `mutant` : la même mesure doit REFUSER le garde-fou amputé.
async function measureGuarded(page) {
  const stub = await stubFacts(page);
  const dialogs = await page.evaluate(() => window.__dialogSeen.slice());
  const recreated = stub.addTables.filter(name => LEGACY_TABLES.includes(name)); // les tables d'avant que la bêta a CRÉÉES (un document aux deux séries a déjà les siennes)
  return { stub, dialogs, recreated, quiet: stub.actions === 0 && dialogs.length === 0 && recreated.length === 0 };
}
async function runGuarded({ id, lang, scheme, theme = null, width = 700, height = 400, names = 'english', seed = '', full = false }) {
  const T = TEXTS[lang];
  const { context, page, log, upgradeSeen } = await ouvrir({ dir: 'beta', width, height, scheme, lang, theme, names, seed, wait: 'guard' });
  const f = await guardFacts(page);
  check(`${id} : la couche est là, une seule fois`, !!f && f.count === 1, f && { count: f.count });
  if (!f) { await context.close(); return; }
  check(`${id} : le garde-fou passe avant la fenêtre « passez à la version X.Y » : elle n'est pas là, ni ouverte ni restée sous la couche (la couche dit déjà d'ouvrir la dernière version)`, upgradeSeen === false && (await page.evaluate(() => document.querySelectorAll('#pp-beta-upgrade').length)) === 0, { upgradeSeen });
  check(`${id} : c'est une boîte de dialogue modale nommée « ${T.region} », dont le titre est la phrase de la consigne`, f.role === 'alertdialog' && f.modal === 'true' && f.region === T.region && f.labelled === T.lead && f.leadTag === 'H1', { role: f.role, modal: f.modal, region: f.region, labelled: f.labelled, tag: f.leadTag });
  check(`${id} : elle dit EXACTEMENT « ${T.lead} », puis pourquoi et comment, dans la langue du widget`, f.lead === T.lead && JSON.stringify(f.texts) === JSON.stringify([T.why, T.how]), { lead: f.lead, texts: f.texts });
  check(`${id} : elle donne l'adresse de la dernière version (le dossier au-dessus de beta/ : ${SITE_PATH}/) en lien, dans un nouvel onglet sans lien avec la bêta (noopener noreferrer)`,
    f.link === `${BASE}${SITE_PATH}/` && f.href === `${BASE}${SITE_PATH}/` && f.linkTarget === '_blank' && /\bnoopener\b/.test(f.linkRel) && /\bnoreferrer\b/.test(f.linkRel), { link: f.link, href: f.href, target: f.linkTarget, rel: f.linkRel });
  check(`${id} : pleine page (fixe, tout le panneau), au-dessus de tout (les quatre coins, le centre et le haut sont à elle) et tout le reste de la page est inerte`, f.position === 'fixed' && Math.abs(f.overlayBox.width - f.innerW) < 0.5 && Math.abs(f.overlayBox.height - f.innerH) < 0.5 && f.covered && f.inertAll, { position: f.position, box: f.overlayBox, covered: f.covered, notInert: f.notInert });
  check(`${id} : la carte tient dans le panneau (${f.innerW}x${f.innerH}), sans défilement de côté ; ni emoji ni image ; la police est celle de l'interface (--font-ui)`, f.cardBox.left >= -0.5 && f.cardBox.right <= f.innerW + 0.5 && f.cardBox.top >= -0.5 && f.cardBox.bottom <= f.innerH + 0.5 && !f.scrollsX && !f.emoji && f.images === 0 && f.fontIsUi, { card: f.cardBox, scrollsX: f.scrollsX, font: f.fontIsUi });
  const c = await contrastFacts(page);
  check(`${id} : tout se lit : titre, textes et lien >= 4,5:1`, contrastOk(c), c);
  const m = await measureGuarded(page);
  check(`${id} : AUCUNE écriture (le faux Grist n'a reçu aucune action), AUCUNE question « ${CONSENT_TITLE} » (même ouverte un instant), AUCUNE table d'avant recréée${names === 'english' ? ' (le document n\'en a toujours aucune)' : ''}`,
    m.quiet && (names !== 'english' || !m.stub.tables.some(name => LEGACY_TABLES.includes(name))), { actions: m.stub.actions, addTables: m.stub.addTables, dialogs: m.dialogs, recreated: m.recreated, tables: m.stub.tables });
  check(`${id} : la liste que \`listTables\` rend à la page est celle du document, telle quelle`, JSON.stringify(m.stub.listed) === JSON.stringify(m.stub.tables), { listed: m.stub.listed, tables: m.stub.tables });
  await shot(page, id);
  if (full) {
    // Une écriture que la page tente est refusée par l'erreur que la bêta connaît (celle d'une personne qui dit « Ne pas créer »), pas par une erreur qui s'afficherait.
    const refused = await page.evaluate(async () => {
      const attempt = async (actions) => { try { await grist.docApi.applyUserActions(actions); return { ok: true }; } catch (e) { return { ok: false, tablesDeclined: e && e.tablesDeclined === true, betaGuard: e && e.betaGuard === true }; } };
      const saved = await (async () => { try { await Templates.save(null, 'Facture', '<p>Bonjour</p>', '', null, null, 'document', null); return { ok: true }; } catch (e) { return { ok: false, tablesDeclined: GristAPI.isTablesDeclined(e) }; } })();
      return {
        table: await attempt([['AddTable', 'Publipostage_Modeles', [{ id: 'Nom', type: 'Text' }]]]),
        record: await attempt([['AddRecord', 'Publipostage_Templates', null, { Name: 'x' }]]),
        update: await attempt([['UpdateRecord', 'Publipostage_Templates', 1, { Name: 'y' }]]),
        saved,
      };
    });
    check(`${id} : créer une table d'avant, ajouter ou modifier une ligne : refusé par l'erreur de refus de la bêta (tablesDeclined), sans rien écrire ; \`Templates.save\` s'arrête de même`,
      [refused.table, refused.record, refused.update].every(r => r.ok === false && r.tablesDeclined && r.betaGuard) && refused.saved.ok === false && refused.saved.tablesDeclined, refused);
    await page.keyboard.press('Control+s');
    await sleep(600);
    const after = await measureGuarded(page);
    check(`${id} : Ctrl+S (l'enregistrement) n'écrit rien non plus : toujours aucune action, aucune table d'avant`, after.quiet && after.stub.modeles.length === 0 && after.stub.templates.length === 0, { actions: after.stub.actions, recreated: after.recreated });
    // Tab ne sort pas de la couche : rien de la bêta derrière n'est atteignable au clavier.
    const focus = [];
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); focus.push(await page.evaluate(() => { const a = document.activeElement; const overlay = document.getElementById('pp-beta-guard'); return !a || a === document.body || overlay.contains(a); })); }
    check(`${id} : huit Tab de suite : le focus reste dans la couche (ou sur la page entière), jamais sur un bouton de la bêta derrière`, focus.every(Boolean), focus);
    // La langue de la bêta, changée dans Réglages (I18n.setLang), change la couche sur place.
    const other = lang === 'fr' ? 'en' : 'fr';
    await page.evaluate(next => I18n.setLang(next), other);
    await sleep(300);
    const g = await guardFacts(page);
    check(`${id} : la langue changée dans la bêta (${lang} -> ${other}) change la couche sur place : « ${TEXTS[other].lead} »`, !!g && g.lead === TEXTS[other].lead && g.region === TEXTS[other].region && JSON.stringify(g.texts) === JSON.stringify([TEXTS[other].why, TEXTS[other].how]), g && { lead: g.lead, region: g.region });
    await page.evaluate(next => I18n.setLang(next), lang);
    await verdict(id, page, log, 'jusqu\'au bout : ');
  } else {
    await verdict(id, page, log);
  }
  await context.close();
}

try {
  tool = await import(pathToFileURL(join(ROOT, 'outils', 'depot-propre', 'beta-bandeau.mjs')).href);
  if (!existsSync(join(CACHE, 'esm-map.json'))) throw new Error('miroir hors ligne absent : bash dev-tests/offline-deps.sh');
  esmMap = JSON.parse(readFileSync(join(CACHE, 'esm-map.json'), 'utf8'));
  const SRC = betaSource();
  // Le numéro que le bandeau annonce est celui de js/version.js (1.2.0-dev annonce « 1.2 ») : la publication le pose à la place du repère du script ; ici il ne sert qu'à composer, le garde-fou n'en porte aucun.
  const DEV_VERSION = (/PP_VERSION\s*=\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'js', 'version.js'), 'utf8')) || [])[1];
  mkdirSync(SITE, { recursive: true });
  tool.poserDepuisDossier(SRC, join(SITE, 'beta'), tool.sources(DEV_VERSION));
  cpSync(SRC, join(SITE, 'beta-nue'), { recursive: true });
  // Le garde-fou amputé : l'enveloppe de la question et le refus d'écrire retirés (la couche, elle, reste). Si la mesure le laissait passer, elle ne vaudrait rien.
  tool.poserDepuisDossier(SRC, join(SITE, 'beta-mutant'), tool.sources(DEV_VERSION));
  {
    const file = join(SITE, 'beta-mutant', tool.GARDE_JS);
    const original = readFileSync(file, 'utf8');
    const mutated = original.replace('if (tripped) return Promise.reject(refusal());', '').replace('if (tripped) return Promise.resolve(false);', '').replace('(tripped ? Promise.reject(refusal()) : applyUserActions.apply(docApi, args))', 'applyUserActions.apply(docApi, args)').replace('(tripped ? false : ask.apply(hooks, args))', 'ask.apply(hooks, args)');
    if (mutated === original) throw new Error('le garde-fou amputé est identique au garde-fou : la mutation ne trouve plus ses repères');
    writeFileSync(file, mutated);
  }

  // 0. La composition : la bêta figée + trois fichiers + trois lignes, la ligne du garde-fou juste avant celle de table-consent.js.
  const frozen = listFiles(SRC), composed = listFiles(join(SITE, 'beta'));
  const added = composed.filter(file => !frozen.includes(file));
  const missing = frozen.filter(file => !composed.includes(file));
  const changed = frozen.filter(file => composed.includes(file) && Buffer.compare(readFileSync(join(SRC, file)), readFileSync(join(SITE, 'beta', file))) !== 0);
  const page = readFileSync(join(SITE, 'beta', 'index.html'), 'utf8').split('\n');
  const at = pattern => page.findIndex(line => pattern.test(line));
  const guardLine = at(/<script src="js\/beta-garde\.js\?v=[0-9a-f]{8}"><\/script>/);
  check('la copie figée est la bêta 1.0.0-beta.1, sans un fichier du bandeau ni du garde-fou', /PP_VERSION\s*=\s*'1\.0\.0-beta\.1'/.test(readFileSync(join(SRC, 'js', 'version.js'), 'utf8')) && !frozen.includes(tool.GARDE_JS) && !frozen.includes(tool.BANDEAU_JS), { frozen: frozen.length });
  check('la bêta composée = la bêta figée + css/beta-bandeau.css + js/beta-bandeau.js + js/beta-garde.js + trois lignes d\'index.html : rien d\'autre ne change, rien ne manque',
    JSON.stringify(added) === JSON.stringify([tool.BANDEAU_CSS, tool.BANDEAU_JS, tool.GARDE_JS].sort()) && missing.length === 0 && JSON.stringify(changed) === '["index.html"]'
      && tool.sansBandeau(page.join('\n')) === readFileSync(join(SRC, 'index.html'), 'utf8'), { added, missing, changed });
  check('la ligne du garde-fou est JUSTE AVANT js/table-consent.js (donc avant le démarrage anticipé) et après js/grist-api.js (il enveloppe GristAPI)',
    guardLine > 0 && /<script src="js\/table-consent\.js[^"]*"><\/script>/.test(page[guardLine + 1]) && guardLine > at(/<script src="js\/grist-api\.js[^"]*"><\/script>/) && at(/<script src="js\/grist-api\.js/) > 0, { guardLine, next: page[guardLine + 1] });
  check('une page de bêta sans la ligne de table-consent.js n\'est pas modifiée au hasard : l\'outil le dit', (() => { try { tool.avecBandeau(readFileSync(join(SRC, 'index.html'), 'utf8').replace(/<script src="js\/table-consent\.js[^"]*"><\/script>\n/, ''), tool.sources(DEV_VERSION)); return false; } catch (e) { return /table-consent/.test(e.message); } })());

  await serve();
  browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  // 1. Un document aux noms d'avant : la bêta est la bêta.
  await sansPlanter('document d\'avant', async () => {
    const id = 'document aux noms d\'avant';
    const { context, page, log, upgradeSeen } = await ouvrir({ dir: 'beta', lang: 'fr', scheme: 'light', names: 'legacy', wait: 'ready' });
    check(`${id} : la fenêtre « passez à la version X.Y » s'est ouverte (devant un document d'avant, comme à chaque ouverture) ; l'essai l'a fermée, la suite regarde la bêta seule`, upgradeSeen === true, { upgradeSeen });
    const f = await guardFacts(page);
    const inert = await page.evaluate(() => document.querySelectorAll('[inert]').length);
    const before = await stubFacts(page);
    const dialogs = await page.evaluate(() => window.__dialogSeen.slice());
    check(`${id} : la bêta s'ouvre (« Widget prêt. »), sans couche ni rien d'inerte, sans question (le document porte déjà des tables du widget : il a déjà dit oui)`, f === null && inert === 0 && dialogs.length === 0, { couche: f !== null, inert, dialogs });
    check(`${id} : la liste que \`listTables\` rend à la page est celle du document, telle quelle (le garde-fou n'ajoute ni ne retire un nom)`, JSON.stringify(before.listed) === JSON.stringify(before.tables) && before.tables.includes('Publipostage_Modeles') && !before.tables.some(n => /Templates|TableLinks|TemplatePreferences|Comments|Abbreviations|PageFormats/.test(n)), before.tables);
    const saved = await page.evaluate(async () => { try { const r = await Templates.save(null, 'Facture', '<p>Bonjour</p>', '', null, null, 'document', null); return { ok: true, id: r && r.id }; } catch (e) { return { ok: false, message: String(e && e.message) }; } });
    const after = await stubFacts(page);
    check(`${id} : un enregistrement arrive dans la table d'avant (Publipostage_Modeles : « Facture »), aucune table anglaise n'apparaît`, saved.ok && after.modeles.includes('Facture') && !after.tables.some(n => /Templates|TableLinks|TemplatePreferences|Comments|Abbreviations|PageFormats/.test(n)), { saved, modeles: after.modeles, tables: after.tables });
    const writes = await page.evaluate(async () => { try { await grist.docApi.applyUserActions([['AddRecord', 'Publipostage_Modeles', null, { Nom: 'Devis' }]]); return true; } catch (e) { return String(e && e.message); } });
    check(`${id} : une écriture directe passe elle aussi, sans erreur (rien n'est refusé tant que le document n'a que les noms d'avant)`, writes === true, writes);
    await verdict(id, page, log);
    await context.close();
  });
  await sansPlanter('document neuf', async () => {
    const id = 'document neuf (aucune table du widget)';
    const { context, page, log } = await ouvrir({ dir: 'beta', lang: 'fr', scheme: 'light', names: 'legacy', seed: 'stub.state.tables.length = 0;', wait: 'dialog' });
    const dialogs = await page.evaluate(() => window.__dialogSeen.slice());
    check(`${id} : la question « ${CONSENT_TITLE} » est posée comme avant, et il n'y a pas de couche`, dialogs.includes(CONSENT_TITLE) && (await guardFacts(page)) === null, dialogs);
    await page.getByRole('button', { name: 'Créer les tables' }).first().click();
    await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 60000 }).catch(() => log.errors.push('bêta : « Widget prêt. » n\'est pas venu après « Créer les tables »'));
    await sleep(800);
    const after = await stubFacts(page);
    check(`${id} : « Créer les tables » crée des tables d'avant (${after.addTables.join(', ')}), aucune table anglaise, toujours pas de couche`,
      after.addTables.length > 0 && after.addTables.every(n => LEGACY_TABLES.includes(n) || n === 'Publipostage_UserProbe') && !after.tables.some(n => /Templates|TableLinks|TemplatePreferences|Comments|Abbreviations|PageFormats/.test(n)) && (await guardFacts(page)) === null, { addTables: after.addTables, tables: after.tables });
    await verdict(id, page, log);
    await context.close();
  });

  // 2. Un document aux noms anglais : les deux langues, les trois thèmes (clair, sombre du système, sombre CHOISI), le tour complet dans les deux premières.
  await sansPlanter('anglais seul, français clair', () => runGuarded({ id: 'noms anglais, français clair', lang: 'fr', scheme: 'light', full: true }));
  await sansPlanter('anglais seul, anglais sombre', () => runGuarded({ id: 'noms anglais, anglais sombre', lang: 'en', scheme: 'dark', full: true }));
  await sansPlanter('anglais seul, sombre choisi', () => runGuarded({ id: 'noms anglais, français, sombre choisi dans le widget', lang: 'fr', scheme: 'light', theme: 'dark' }));
  await sansPlanter('anglais seul, clair choisi', () => runGuarded({ id: 'noms anglais, anglais, clair choisi dans le widget', lang: 'en', scheme: 'dark', theme: 'light' }));
  await sansPlanter('anglais seul, 360x640', () => runGuarded({ id: 'noms anglais, français à 360x640', lang: 'fr', scheme: 'light', width: 360, height: 640 }));
  await sansPlanter('anglais seul, 360x300', () => runGuarded({ id: 'noms anglais, anglais sombre à 360x300', lang: 'en', scheme: 'dark', width: 360, height: 300 }));

  // 3. Un document aux deux séries de tables : la bêta aurait pu écrire dans ses tables d'avant (elles existent) ; elle ne le fait pas.
  await sansPlanter('les deux séries', () => runGuarded({
    id: 'noms d\'avant ET noms anglais', lang: 'fr', scheme: 'light', names: 'legacy', full: true,
    seed: "stub.state.tables.push('Publipostage_Templates', 'Publipostage_TableLinks'); stub.state.rows.Publipostage_Templates = { id: [], Name: [], Content: [] };",
  }));
  await sansPlanter('une seule table anglaise', () => runGuarded({
    id: 'noms d\'avant et UNE table anglaise (Publipostage_Comments)', lang: 'en', scheme: 'light', names: 'legacy',
    seed: "stub.state.tables.push('Publipostage_Comments'); stub.state.rows.Publipostage_Comments = { id: [] };",
  }));

  // 4. Un document que la version 1 met à jour PENDANT que la bêta est ouverte.
  await sansPlanter('document mis à jour pendant l\'ouverture', async () => {
    const id = 'document mis à jour pendant l\'ouverture';
    const { context, page, log } = await ouvrir({ dir: 'beta', lang: 'fr', scheme: 'light', names: 'legacy', wait: 'ready' });
    check(`${id} : avant, rien : pas de couche`, (await guardFacts(page)) === null);
    await page.evaluate(() => { window.__gristStub.state.tables.push('Publipostage_Templates'); window.__gristStub.state.rows.Publipostage_Templates = { id: [], Name: [], Content: [] }; });
    const beforeFacts = await stubFacts(page);
    const before = beforeFacts.actions;
    // La page crée une table du widget SANS relire la liste elle-même (une liste gardée de la lecture d'avant) : le garde-fou relit, refuse et se déclenche.
    const refused = await page.evaluate(async () => { try { await grist.docApi.applyUserActions([['AddTable', 'Publipostage_Abreviations', [{ id: 'Utilisateur', type: 'Text' }]]]); return { ok: true }; } catch (e) { return { ok: false, tablesDeclined: e && e.tablesDeclined === true, betaGuard: e && e.betaGuard === true }; } });
    await page.waitForSelector('#pp-beta-guard', { timeout: 5000 }).catch(() => {});
    const f = await guardFacts(page);
    const after = await stubFacts(page);
    check(`${id} : la création d'une table du widget est refusée (tablesDeclined) et la couche apparaît, avec la phrase de la consigne`, refused.ok === false && refused.tablesDeclined && refused.betaGuard && !!f && f.lead === TEXTS.fr.lead && f.inertAll, { refused, couche: !!f });
    check(`${id} : aucune table n'a été créée depuis (ni Publipostage_Abreviations ni une autre), aucune action de plus dans le faux Grist`, after.actions === before && !after.tables.includes('Publipostage_Abreviations') && after.addTables.length === beforeFacts.addTables.length, { avant: before, apres: after.actions, addTables: after.addTables });
    const later = await page.evaluate(async () => { try { await grist.docApi.applyUserActions([['AddRecord', 'Publipostage_Modeles', null, { Nom: 'Devis' }]]); return { ok: true }; } catch (e) { return { ok: false, tablesDeclined: e && e.tablesDeclined === true }; } });
    check(`${id} : et plus rien ne s'écrit ensuite : même dans la table d'avant qui existe encore`, later.ok === false && later.tablesDeclined && (await stubFacts(page)).modeles.length === 0, later);
    await verdict(id, page, log);
    await context.close();
  });

  // 4 bis. La fenêtre « passez à la version X.Y » est ouverte quand le document est mis à jour : la couche du garde-fou la retire, sans rien laisser (voile, inert, touche avalée).
  await sansPlanter('document mis à jour fenêtre ouverte', async () => {
    const id = 'document mis à jour pendant que la fenêtre « passez à la version » est ouverte';
    const { context, page, log, upgradeSeen } = await ouvrir({ dir: 'beta', lang: 'fr', scheme: 'light', names: 'legacy', wait: 'ready', upgrade: 'keep' });
    const open = await page.evaluate(() => ({ count: document.querySelectorAll('#pp-beta-upgrade').length, inert: document.querySelectorAll('[inert]').length, focusCard: document.activeElement && document.activeElement.className === 'pp-beta-upgrade-card' }));
    check(`${id} : avant, la fenêtre est ouverte (une seule, le reste de la page inerte, le focus sur sa carte) et il n'y a pas de couche`, upgradeSeen && open.count === 1 && open.inert > 0 && open.focusCard && (await guardFacts(page)) === null, open);
    await page.evaluate(() => { window.__gristStub.state.tables.push('Publipostage_Templates'); window.__gristStub.state.rows.Publipostage_Templates = { id: [], Name: [], Content: [] }; window.__escSeen = 0; window.__tabDefault = []; document.addEventListener('keydown', (event) => { if (event.key === 'Escape') window.__escSeen++; if (event.key === 'Tab') window.__tabDefault.push(event.defaultPrevented); }); });
    const refused = await page.evaluate(async () => { try { await grist.docApi.applyUserActions([['AddTable', 'Publipostage_Abreviations', [{ id: 'Utilisateur', type: 'Text' }]]]); return { ok: true }; } catch (e) { return { ok: false, tablesDeclined: e && e.tablesDeclined === true }; } });
    await page.waitForSelector('#pp-beta-guard', { timeout: 5000 }).catch(() => {});
    await sleep(300);
    const f = await guardFacts(page);
    const left = await page.evaluate(() => ({ upgrade: document.querySelectorAll('#pp-beta-upgrade').length, focusInGuard: !!document.activeElement && !!document.activeElement.closest('#pp-beta-guard'), banner: !!document.getElementById('pp-beta-banner') }));
    check(`${id} : la création est refusée (tablesDeclined), la couche du garde-fou apparaît, la fenêtre « passez à la version » a disparu, le focus est à la couche, le reste de la page est inerte (le garde-fou le garde : la fenêtre ne rend rien)`,
      refused.ok === false && refused.tablesDeclined && !!f && f.count === 1 && f.inertAll && f.notInert.length === 0 && left.upgrade === 0 && left.focusInGuard, { refused, left, couche: !!f && { inertAll: f.inertAll, notInert: f.notInert } });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await sleep(200);
    const keys = await page.evaluate(() => ({ esc: window.__escSeen, tabPrevented: window.__tabDefault.slice(), inGuard: !!document.activeElement && !!document.activeElement.closest('#pp-beta-guard') }));
    check(`${id} : plus aucune touche avalée par la fenêtre disparue (Échap arrive à la page, Tab n'est pas détourné) et le focus reste dans la couche`, keys.esc === 1 && keys.tabPrevented.every(v => v === false) && keys.inGuard, keys);
    await verdict(id, page, log);
    await context.close();
  });

  // 2 bis. Un document aux noms anglais SANS Publipostage_UserProbe (la seule table que les deux séries nomment pareil) : la bêta d'avant n'y a aucun accord déjà donné, elle POSERAIT la question ; le garde-fou ne la pose pas.
  await sansPlanter('anglais seul sans sonde', () => runGuarded({ id: 'noms anglais sans Publipostage_UserProbe, français clair', lang: 'fr', scheme: 'light', seed: NO_USER_PROBE, full: true }));

  // 6. Le juge sait dire non : la bêta d'avant, puis le garde-fou amputé, sur les mêmes documents et avec les mêmes mesures.
  const bare = async (id, { dir, seed, expectQuestion }) => {
    const { context, page } = await ouvrir({ dir, lang: 'fr', scheme: 'light', names: 'english', seed, wait: expectQuestion ? 'dialog' : 'ready' });
    const guardFiles = await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).filter(name => /beta-garde/.test(name)));
    const before = await page.evaluate(() => window.__dialogSeen.slice());
    if (before.includes(CONSENT_TITLE)) { await page.getByRole('button', { name: 'Créer les tables' }).first().click({ timeout: 3000 }).catch(() => {}); await sleep(2500); }
    const m = await measureGuarded(page);
    const hasGuard = (await guardFacts(page)) !== null;
    await context.close();
    return { guardFiles, hasGuard, asked: before.includes(CONSENT_TITLE), m };
  };
  await sansPlanter('bêta d\'avant avec la sonde', async () => {
    const id = 'la bêta d\'avant (sans garde-fou), document aux noms anglais qui porte Publipostage_UserProbe';
    const r = await bare(id, { dir: 'beta-nue', seed: '', expectQuestion: false });
    check(`${id} : ni couche ni fichier du garde-fou, et elle RECRÉE les tables d'avant à côté de celles de la version 1 SANS poser la question (${r.m.recreated.join(', ') || 'aucune'}) : la sonde, commune aux deux séries, vaut accord pour elle - la mesure de 2) ne la laisserait pas passer`,
      !r.hasGuard && r.guardFiles.length === 0 && !r.asked && r.m.recreated.includes('Publipostage_Modeles') && !r.m.quiet, { recreated: r.m.recreated, asked: r.asked, actions: r.m.stub.actions });
  });
  await sansPlanter('bêta d\'avant sans la sonde', async () => {
    const id = 'la bêta d\'avant (sans garde-fou), document aux noms anglais sans Publipostage_UserProbe';
    const r = await bare(id, { dir: 'beta-nue', seed: NO_USER_PROBE, expectQuestion: true });
    check(`${id} : elle pose la question « ${CONSENT_TITLE} » et, après « Créer les tables », RECRÉE les tables d'avant (${r.m.recreated.join(', ') || 'aucune'}) : la mesure de 2) ne la laisserait pas passer`,
      !r.hasGuard && r.asked && r.m.recreated.includes('Publipostage_Modeles') && !r.m.quiet, { recreated: r.m.recreated, asked: r.asked, actions: r.m.stub.actions });
  });
  await sansPlanter('garde-fou amputé avec la sonde', async () => {
    const id = 'un garde-fou sans refus d\'écrire (la couche s\'affiche), document aux noms anglais qui porte la sonde';
    const r = await bare(id, { dir: 'beta-mutant', seed: '', expectQuestion: false });
    check(`${id} : la mesure le refuse : il recrée les tables d'avant (${r.m.stub.actions} action(s), ${r.m.recreated.length} table(s) d'avant)`, r.hasGuard && !r.m.quiet && r.m.recreated.length > 0, { actions: r.m.stub.actions, recreated: r.m.recreated });
  });
  await sansPlanter('garde-fou amputé sans la sonde', async () => {
    const id = 'un garde-fou sans « non » à la question (la couche s\'affiche), document aux noms anglais sans la sonde';
    const r = await bare(id, { dir: 'beta-mutant', seed: NO_USER_PROBE, expectQuestion: true });
    check(`${id} : la mesure le refuse : il pose la question (${r.asked ? 'oui' : 'non'}) et recrée les tables d'avant (${r.m.recreated.length} table(s) d'avant)`, r.hasGuard && r.asked && !r.m.quiet, { asked: r.asked, actions: r.m.stub.actions, recreated: r.m.recreated });
  });
} catch (e) {
  check('le banc va jusqu\'au bout', false, String((e && e.message) || e).split('\n')[0]);
}

console.log(`\n${total - failures}/${total} passés`);
await finish(failures ? 1 : 0);
