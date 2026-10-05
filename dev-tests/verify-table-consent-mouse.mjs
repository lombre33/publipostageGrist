#!/usr/bin/env node
// Accord pour créer les tables du widget (js/table-consent.js, js/grist-api.js:addTableIfMissing) dans le vrai widget, à 700x400 (le panneau d'Antoine), à la
// VRAIE souris (page.mouse) et au VRAI clavier (Entrée, Échap, Ctrl+S), en français et en anglais, en clair et en sombre. Choix d'Antoine du 05/10 : « demander une
// fois, mais si la personne refuse, lui redemander à chaque action de sa part sur le widget ».
// Ce que le script établit, sur un document dont le faux Grist ne porte AUCUNE table du widget (stub.state.tables vidé avant le démarrage) :
//  - le démarrage s'arrête sur la question « Créer les tables du widget dans ce document ? » (titre, message, « Ne pas créer » / « Créer les tables », focus sur
//    « Créer les tables ») : entière dans le panneau, rien n'est écrit tant que la personne n'a pas répondu, le widget n'annonce pas « prêt » ;
//  - « Ne pas créer » : le widget démarre quand même, sans modèle, aucune action n'est écrite, aucune erreur dans la console ; sans geste de la personne, la question
//    ne revient pas (les passages de l'enregistrement automatique n'en posent aucune) ; un clic ailleurs, qui ne demande aucune table, n'en pose pas non plus ;
//  - Enregistrer (vrai clic, puis Ctrl+S) repose la question à chaque fois ; refusée (« Ne pas créer » ou Échap), le coin d'état dit « Non enregistré : les tables
//    du widget n'ont pas été créées », rien n'est écrit, aucune erreur dans la console ;
//  - « Créer les tables » (clic ou Entrée) : les tables sont créées, le modèle enregistré, et plus aucune question ensuite, même après d'autres Enregistrer ;
//  - un document qui porte déjà une table du widget (le cas de tous les autres scénarios du harnais) ne pose jamais la question ;
//  - en anglais et en sombre : mêmes constats, textes anglais, contrastes de la fenêtre à 4,5:1 ;
//  - la fenêtre « chargement long » (js/first-contact.js, 30 s) ne s'ouvre pas par-dessus la question pendant que la personne la lit : l'horloge de la page avance
//    de 40 s question ouverte, puis de 60 s une fois répondu.
// Les scénarios qui tournent dans la page (dispatchEvent) ne voient ni le vrai clic qui compte comme geste, ni l'ordre réel des fenêtres : ce script échoue sur l'ancien
// code par ses constats (aucune question, tables créées sans réponse), pas parce qu'un sélecteur manque.
// Lancé par run-headless.mjs (groupe Node "tableConsentMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-table-consent-mouse.mjs
// TABLE_CONSENT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TABLE_CONSENT_PORT || 8979);
const SHOTS = process.env.TABLE_CONSENT_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-first-contact.mjs.
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
if (!OFFLINE) console.log('[verify-table-consent-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);
async function serveEsm(route) {
  if (!OFFLINE) return route.continue();
  const url = route.request().url();
  const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
  if (chunk) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
  const spec = Object.keys(esmMap).find(k => url === `https://esm.sh/${k}` || url === `https://esm.sh/*${k}` || url.startsWith(`https://esm.sh/${k}@`) || url.startsWith(`https://esm.sh/*${k}@`));
  if (!spec) return route.fulfill({ status: 404, body: `// pas de miroir local pour ${url}` });
  return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(ROOT, esmMap[spec].replace(/^\//, '')), 'utf8')) });
}

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];

// Une page neuve (son propre contexte : ni stockage ni horloge partagés) sur le harnais. `seeded: false` : le faux Grist démarre SANS aucune table du widget
// (un document où le widget vient d'être ajouté) ; `lang`, `theme` : réglages déjà enregistrés ; `clock` : l'horloge de la page est pilotée par le test.
async function open({ seeded = false, lang = '', theme = '', clock = false } = {}) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
  const page = await context.newPage();
  const state = { context, page, consoleLines: [], errors: [] };
  page.on('pageerror', e => { state.errors.push(e.message); pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('console', m => state.consoleLines.push({ type: m.type(), text: m.text() }));
  await page.route('**://esm.sh/**', serveEsm);
  if (OFFLINE) {
    for (const [re, rel] of UMD_ROUTES) {
      await page.route(re, async route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: await readFile(join(CACHE, rel), 'utf8') }));
    }
    await page.addInitScript(() => { Object.defineProperty(HTMLScriptElement.prototype, 'integrity', { configurable: true, get: () => '', set: () => {} }); });
  }
  await page.route('**://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
  if (lang) await page.addInitScript(v => { try { localStorage.setItem('pp_lang', v); } catch (e) { /* rien */ } }, lang);
  if (theme) await page.addInitScript(v => { try { localStorage.setItem('pp_theme', v); } catch (e) { /* rien */ } }, theme);
  // Avant que dev-tests/grist-stub.js ne rende la main à l'ouverture : un document sans table du widget (dropTable emporte aussi leurs lignes, sinon fetchTable
  // les lirait encore et le widget les tiendrait pour présentes).
  if (!seeded) await page.addInitScript(() => { window.__preSeedGristStub = stub => { ['Publipostage_Modeles', 'Publipostage_LiensTables', 'Publipostage_UserProbe', 'Publipostage_Commentaires'].forEach(t => stub.dropTable(t)); }; });
  if (clock) await page.clock.install();
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  return state;
}
const closePage = async s => { await s.context.close(); };

// --- Mesures ---
const statusText = s => s.page.evaluate(() => (document.getElementById('status-msg') || {}).textContent || '');
async function untilReady(s, ms = 90000) {
  await s.page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: ms });
  await s.page.waitForFunction(() => { const e = document.getElementById('status-msg'); return !!e && /prêt|ready/i.test(e.textContent || ''); }, null, { timeout: ms });
}
const modalShown = s => s.page.evaluate(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && getComputedStyle(m).display !== 'none'; });
async function untilModal(s, ms = 60000) { await s.page.waitForFunction(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && getComputedStyle(m).display !== 'none'; }, null, { timeout: ms }); }
// La question OU le démarrage fini, selon ce qui vient en premier : un widget qui ne demande rien (l'ancien code) rend alors la main aux constats, au lieu d'attendre
// la minute entière d'une fenêtre qui ne viendra pas.
async function untilModalOrReady(s, ms = 60000) {
  await s.page.waitForFunction(() => {
    const m = document.getElementById('pp-dialog-modal');
    if (m && getComputedStyle(m).display !== 'none') return true;
    const e = document.getElementById('status-msg');
    return !!e && /prêt|ready/i.test(e.textContent || '');
  }, null, { timeout: ms });
}
async function untilNoModal(s, ms = 20000) { await s.page.waitForFunction(() => { const m = document.getElementById('pp-dialog-modal'); return !m || getComputedStyle(m).display === 'none'; }, null, { timeout: ms }); }
// Ce que la fenêtre montre : textes, boutons, focus, place dans le panneau, défilement, contrastes (texte contre fond effectif de son élément).
const modalInfo = s => s.page.evaluate(() => {
  const m = document.getElementById('pp-dialog-modal');
  if (!m || getComputedStyle(m).display === 'none') return { shown: false };
  const box = m.querySelector('.modal-content, .pp-dialog-box') || m;
  const r = box.getBoundingClientRect();
  const title = m.querySelector('#pp-dialog-title');
  const message = m.querySelector('#pp-dialog-message');
  const buttons = Array.from(m.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden);
  const lum = ([red, green, blue]) => { const f = c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(red) + 0.7152 * f(green) + 0.0722 * f(blue); };
  const rgb = c => { const x = c.match(/rgba?\(([^)]+)\)/); return x ? x[1].split(',').map(v => Number(v.trim())) : null; };
  const backgroundOf = el => { for (let n = el; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c && (c.length === 3 || c[3] === undefined || c[3] > 0.99)) return c.slice(0, 3); } return [255, 255, 255]; };
  const contrast = el => { const fg = rgb(getComputedStyle(el).color).slice(0, 3); const a = lum(fg), b = lum(backgroundOf(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const seen = el => { const q = el.getBoundingClientRect(); const top = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return q.left >= 0 && q.top >= 0 && q.right <= innerWidth + 0.5 && q.bottom <= innerHeight + 0.5 && !!top && (top === el || el.contains(top)); };
  const body = m.querySelector('.pp-modal-body, .modal-body') || message.parentElement;
  return {
    shown: true, title: title && title.textContent, message: message && message.textContent, buttons: buttons.map(b => b.textContent),
    focused: document.activeElement && document.activeElement.textContent,
    inPanel: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
    allSeen: [title, message, ...buttons].every(el => el && seen(el)),
    noScroll: body.scrollHeight <= body.clientHeight + 1,
    contrasts: [title, message, ...buttons].map(el => Math.round(contrast(el) * 100) / 100),
  };
});
// Les actions que le widget a envoyées à Grist : « Type Table ».
const written = s => s.page.evaluate(() => window.__gristStub.getActionLog().map(a => a[0] + ' ' + a[1]));
const writtenOf = async (s, type) => (await written(s)).filter(a => a.startsWith(type + ' '));
// Les lignes d'erreur de la console (hors avertissements).
const consoleErrors = s => s.consoleLines.filter(l => l.type === 'error').map(l => l.text);

// Vrai geste : la souris rejoint le centre en quelques pas puis clique.
async function rectOf(s, selector, text) {
  return s.page.evaluate(({ sel, wanted }) => {
    const els = Array.from(document.querySelectorAll(sel)).filter(e => !wanted || (e.textContent || '').trim() === wanted);
    const el = els[0];
    if (!el) return null;
    const q = el.getBoundingClientRect();
    const x = q.left + q.width / 2, y = q.top + q.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, onTop: !!top && (top === el || el.contains(top)), inViewport: q.left >= 0 && q.top >= 0 && q.right <= innerWidth + 0.5 && q.bottom <= innerHeight + 0.5 };
  }, { sel: selector, wanted: text || '' });
}
async function realClick(s, selector, text, wait = 300) {
  const c = await rectOf(s, selector, text);
  if (!c) throw new Error('introuvable : ' + selector + (text ? ' « ' + text + ' »' : ''));
  await s.page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await s.page.mouse.move(c.x, c.y, { steps: 3 });
  await s.page.mouse.click(c.x, c.y);
  await s.page.waitForTimeout(wait);
  return c;
}
const MODAL_BUTTONS = '#pp-dialog-modal .pp-modal-actions button';
const shot = async (s, name) => { if (SHOTS) await s.page.screenshot({ path: join(SHOTS, name + '.png'), clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } }); };

const TEXTS = {
  fr: {
    title: 'Créer les tables du widget dans ce document ?', decline: 'Ne pas créer', create: 'Créer les tables', head: 'Publipostage+ range vos modèles',
    notSaved: 'Non enregistré : les tables du widget n’ont pas été créées dans ce document.', saved: /Enregistré à/,
  },
  en: {
    title: 'Create the widget’s tables in this document?', decline: 'Don’t create', create: 'Create the tables', head: 'Publipostage+ keeps your templates',
    notSaved: 'Not saved: the widget’s tables were not created in this document.', saved: /Saved at/,
  },
};

// Un modèle tout neuf : du texte dans l'éditeur (vrai clavier), puis son nom (le champ du titre, ouvert par le crayon s'il est replié).
async function writeAndName(s, name) {
  await realClick(s, '.ProseMirror', '', 200);
  await s.page.keyboard.type('Bonjour');
  const hidden = await s.page.evaluate(() => document.getElementById('template-name').hidden);
  if (hidden) await realClick(s, '#btn-rename-template', '', 250);
  await s.page.keyboard.press('End');
  for (let i = 0; i < 30; i++) await s.page.keyboard.press('Backspace');
  await s.page.keyboard.type(name);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(300);
}

// ===================================================================================================================================================
// 1) Français, clair : le refus, les questions reposées à chaque Enregistrer, puis le « oui »
// ===================================================================================================================================================
async function scenarioFrench() {
  const T = TEXTS.fr;
  console.log('\n== Français, clair : sans aucune table du widget ==');
  const s = await open();
  await untilModalOrReady(s);
  await s.page.waitForTimeout(600);
  let info = await modalInfo(s);
  check('le démarrage s\'arrête sur la question : titre, message, deux boutons', info.shown && info.title === T.title && info.message.startsWith(T.head) && JSON.stringify(info.buttons) === JSON.stringify([T.decline, T.create]), info);
  check('« Créer les tables » a le focus', info.focused === T.create, info.focused);
  check('la fenêtre est entière dans le panneau de 700x400, rien à faire défiler, tout se voit au premier plan', info.inPanel && info.allSeen && info.noScroll, info);
  check('le message dit ce que sont les tables et ce que vaut un refus', /Publipostage_…/.test(info.message) && /Sans elles, rien ne peut être enregistré/.test(info.message) && /reposée à votre prochaine action/.test(info.message), info.message);
  await shot(s, '1-question-fr-clair');
  await s.page.waitForTimeout(1200);
  check('rien n\'est écrit tant que la personne n\'a pas répondu', (await written(s)).length === 0 && !/prêt|ready/i.test(await statusText(s)), { written: await written(s), status: await statusText(s) });

  await realClick(s, MODAL_BUTTONS, T.decline, 300);
  await untilReady(s);
  check('« Ne pas créer » : la fenêtre se ferme et le widget démarre', !(await modalShown(s)), await statusText(s));
  check('aucune action n\'a été envoyée à Grist (ni table, ni ligne)', (await written(s)).length === 0, await written(s));
  check('aucun modèle dans la liste', (await s.page.evaluate(() => Templates.getCached().length)) === 0);
  check('aucune erreur dans la console, aucune exception de la page', consoleErrors(s).length === 0 && s.errors.length === 0, { errors: consoleErrors(s), page: s.errors });

  await s.page.waitForTimeout(3600);
  check('sans geste de la personne, la question ne revient pas (deux passages de l\'enregistrement automatique plus tard)', !(await modalShown(s)) && (await written(s)).length === 0, await written(s));

  await realClick(s, '#btn-bold', '', 300).catch(() => realClick(s, '.ProseMirror', '', 300));
  await s.page.waitForTimeout(800);
  check('un clic qui ne demande aucune table (la mise en forme) ne pose pas la question', !(await modalShown(s)) && (await written(s)).length === 0, await written(s));

  await writeAndName(s, 'Contrat test');
  await s.page.waitForTimeout(3600);
  check('de la frappe, un nom, et l\'enregistrement automatique qui passe : toujours aucune question (aucun modèle enregistré, rien à écrire)', !(await modalShown(s)) && (await written(s)).length === 0, { shown: await modalShown(s), written: await written(s) });

  await realClick(s, '#btn-save', '', 600);
  await untilModal(s, 10000);
  info = await modalInfo(s);
  check('Enregistrer (vrai clic) : la question est reposée, la même', info.shown && info.title === T.title && info.focused === T.create && info.inPanel && info.allSeen, info);
  check('une seule question pour tout ce que cet Enregistrer demande (identité, table des modèles)', (await written(s)).length === 0, await written(s));
  await realClick(s, MODAL_BUTTONS, T.decline, 500);
  let status = await s.page.evaluate(() => { const e = document.getElementById('status-msg'); return { text: e.textContent, title: e.title || e.getAttribute('data-full') || '' }; });
  check('refusée : le coin d\'état dit que rien n\'est enregistré, avec la raison', status.text === T.notSaved || status.title === T.notSaved, status);
  check('rien n\'est écrit, aucune erreur dans la console', (await written(s)).length === 0 && consoleErrors(s).length === 0 && s.errors.length === 0, { written: await written(s), errors: consoleErrors(s), page: s.errors });
  await shot(s, '2-refus-fr-clair');

  await s.page.waitForTimeout(3600);
  check('après le refus, sans geste : plus de question', !(await modalShown(s)), '');

  await s.page.keyboard.press('Control+s');
  await untilModal(s, 10000);
  check('Ctrl+S (vrai clavier) : la question est reposée', (await modalInfo(s)).title === T.title, await modalInfo(s));
  await s.page.keyboard.press('Escape');
  await untilNoModal(s);
  status = await statusText(s);
  check('Échap vaut refus : rien n\'est écrit, le coin d\'état le redit', (await written(s)).length === 0 && status === T.notSaved, { written: await written(s), status });

  await realClick(s, '#btn-save', '', 600);
  await untilModal(s, 10000);
  await s.page.keyboard.press('Enter'); // le focus est sur « Créer les tables »
  await untilNoModal(s);
  await s.page.waitForFunction(re => re.test((document.getElementById('status-msg') || {}).textContent || ''), T.saved, { timeout: 30000 }).catch(() => {});
  const tables = (await writtenOf(s, 'AddTable')).map(a => a.slice('AddTable '.length));
  const names = await s.page.evaluate(() => window.__gristStub.state.rows.Publipostage_Modeles.Nom.slice());
  check('« Créer les tables » (Entrée) : la table des modèles est créée, le modèle enregistré', tables.includes('Publipostage_Modeles') && names.includes('Contrat test'), { tables, names });
  check('la table des modèles est créée une seule fois, la table de l\'identité aussi', tables.filter(t => t === 'Publipostage_Modeles').length === 1 && tables.filter(t => t === 'Publipostage_UserProbe').length === 1, tables);
  check('le coin d\'état annonce l\'enregistrement', T.saved.test(await statusText(s)), await statusText(s));

  await s.page.keyboard.type(' encore');
  await realClick(s, '#btn-save', '', 600);
  await s.page.waitForTimeout(1500);
  check('après le « oui », Enregistrer ne pose plus aucune question', !(await modalShown(s)), '');
  check('aucune erreur dans la console, aucune exception de la page', consoleErrors(s).length === 0 && s.errors.length === 0, { errors: consoleErrors(s), page: s.errors });
  await closePage(s);
}

// ===================================================================================================================================================
// 2) Un document qui porte déjà ses tables : jamais de question
// ===================================================================================================================================================
async function scenarioSeeded() {
  console.log('\n== Document qui porte déjà ses tables ==');
  const s = await open({ seeded: true });
  await untilReady(s);
  await s.page.waitForTimeout(1500);
  check('aucune question au démarrage', !(await modalShown(s)), '');
  await writeAndName(s, 'Contrat existant');
  await realClick(s, '#btn-save', '', 800);
  await s.page.waitForTimeout(1200);
  const names = await s.page.evaluate(() => window.__gristStub.state.rows.Publipostage_Modeles.Nom.slice());
  check('Enregistrer écrit le modèle sans poser de question', !(await modalShown(s)) && names.includes('Contrat existant'), names);
  check('aucune erreur dans la console', consoleErrors(s).length === 0 && s.errors.length === 0, { errors: consoleErrors(s), page: s.errors });
  await closePage(s);
}

// ===================================================================================================================================================
// 3) Anglais, sombre
// ===================================================================================================================================================
async function scenarioEnglishDark() {
  const T = TEXTS.en;
  console.log('\n== Anglais, sombre ==');
  const s = await open({ lang: 'en', theme: 'dark' });
  await untilModalOrReady(s);
  await s.page.waitForTimeout(600);
  const info = await modalInfo(s);
  check('la question est en anglais, entière dans le panneau', info.shown && info.title === T.title && info.message.startsWith(T.head) && JSON.stringify(info.buttons) === JSON.stringify([T.decline, T.create]) && info.focused === T.create && info.inPanel && info.allSeen && info.noScroll, info);
  check('le texte de la fenêtre a au moins 4,5:1 de contraste en sombre (titre, message, deux boutons)', Array.isArray(info.contrasts) && info.contrasts.every(c => c >= 4.5), info.contrasts);
  await shot(s, '3-question-en-sombre');
  await realClick(s, MODAL_BUTTONS, T.decline, 300);
  await untilReady(s);
  await writeAndName(s, 'Contract');
  await realClick(s, '#btn-save', '', 600);
  await untilModal(s, 10000);
  await realClick(s, MODAL_BUTTONS, T.decline, 500);
  check('refusée : le coin d\'état est en anglais', (await statusText(s)) === T.notSaved, await statusText(s));
  await realClick(s, '#btn-save', '', 600);
  await untilModal(s, 10000);
  await realClick(s, MODAL_BUTTONS, T.create, 300);
  await untilNoModal(s);
  await s.page.waitForFunction(re => re.test((document.getElementById('status-msg') || {}).textContent || ''), T.saved, { timeout: 30000 }).catch(() => {});
  check('« Create the tables » (vrai clic) : le modèle est enregistré', T.saved.test(await statusText(s)) && (await writtenOf(s, 'AddTable')).length > 0, { status: await statusText(s), tables: await writtenOf(s, 'AddTable') });
  check('aucune erreur dans la console', consoleErrors(s).length === 0 && s.errors.length === 0, { errors: consoleErrors(s), page: s.errors });
  await closePage(s);
}

// ===================================================================================================================================================
// 4) Le démarrage attend la personne : la fenêtre « chargement long » ne s'ouvre pas par-dessus la question
// ===================================================================================================================================================
async function scenarioSlowStart() {
  const T = TEXTS.fr;
  console.log('\n== La question ouverte longtemps ==');
  const s = await open({ clock: true });
  await untilModalOrReady(s);
  const slowShown = () => s.page.evaluate(() => { const m = document.getElementById('pp-first-contact-modal'); return !!m && getComputedStyle(m).display !== 'none'; });
  await s.page.clock.fastForward(40000);
  await s.page.waitForTimeout(300);
  check('40 s question ouverte : la fenêtre « chargement long » ne s\'ouvre pas, la question reste là', !(await slowShown()) && (await modalInfo(s)).title === T.title, { slow: await slowShown() });
  await realClick(s, MODAL_BUTTONS, T.create, 300);
  await untilReady(s);
  await s.page.clock.fastForward(60000);
  await s.page.waitForTimeout(300);
  check('le démarrage fini, 60 s plus tard : toujours aucune fenêtre « chargement long »', !(await slowShown()), '');
  check('les tables sont créées après le « oui »', (await writtenOf(s, 'AddTable')).length > 0, await written(s));
  await closePage(s);
}

// Un scénario qui ne va pas au bout (un bouton ou une fenêtre qui manque) le dit et laisse les suivants tourner.
async function runScenario(scenario) {
  try { await scenario(); }
  catch (e) { check('le scénario va jusqu\'au bout (' + scenario.name + ')', false, String((e && e.message) || e).split('\n')[0]); }
}
await runScenario(scenarioFrench);
await runScenario(scenarioSeeded);
await runScenario(scenarioEnglishDark);
await runScenario(scenarioSlowStart);

check('aucune exception de page sur l\'ensemble', pageErrors.length === 0, pageErrors);
await browser.close();
server.close();
console.log(`${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
