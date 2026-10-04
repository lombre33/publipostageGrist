#!/usr/bin/env node
// Premier contact avant la bêta (js/first-contact.js, css/first-contact.css, js/version.js) : ce que voit la personne quand le widget ne démarre pas comme prévu,
// et ce qu'il dit de lui-même. Tout se joue dans un panneau de 700x400 (celui d'Antoine), à la VRAIE souris (page.mouse) et au VRAI clavier (Tab, Maj+Tab, Échap),
// en français et en anglais, en clair et en sombre.
// Ce que le script établit :
//  - un démarrage normal n'affiche rien, ne parle pas dans la console (aucun log, aucune info), porte le titre « Publipostage+ · Grist Factory », son icône et sa
//    description ; Réglages > Crédits donne le numéro de version de js/version.js ;
//  - la langue au premier lancement : celle du navigateur (la première des deux langues du widget dans l'ordre de ses préférences, l'anglais s'il n'en propose aucune,
//    le français s'il ne dit rien), sauf choix enregistré dans Réglages, qui l'emporte ; un stockage refusé ne casse rien ;
//  - « hors de Grist » : le widget ouvert seul dans un onglet dit où l'ajouter, donne l'adresse à coller (et la copie d'un clic), renvoie au guide d'installation dans
//    la langue de la page, et ne se ferme pas par Échap ; rien de tout cela avec `?dev` dans l'adresse ni quand Grist répond ;
//  - « réseau bloqué » : un module de l'éditeur qui ne se télécharge pas, ou le script de l'API Grist absent d'un cadre, ouvre la fenêtre qui liste les adresses à
//    autoriser, le message du navigateur à la demande, « Recharger la page » (qui recharge pour de bon, et le widget démarre quand l'adresse est rouverte) ;
//  - « démarrage trop long » (30 s sans erreur) : mêmes adresses, « Continuer d'attendre » ou Échap la ferment, elle se ferme d'elle-même quand le widget est prêt ;
//  - « erreur » : une autre erreur de démarrage montre son message ; la fenêtre est un vrai dialogue (role, aria-modal, titre), tient dans le panneau, titre et
//    boutons restent visibles, le clavier y tourne, tout texte y a le contraste voulu en clair comme en sombre (F5) ;
//  - l'avertissement de la galerie sur les modèles juridiques tient dans la rangée du bas, à gauche de « Fermer ».
// Les scénarios qui tournent dans la page (dispatchEvent) ne voient ni le focus qui quitte la fenêtre ni le vrai clic : ce script échoue sur l'ancien code par ses
// constats (aucune fenêtre, titre d'onglet « Publipostage Grist », langue toujours française), pas parce qu'un sélecteur manque.
// Lancé par run-headless.mjs (groupe Node "firstContact", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-first-contact.mjs
// FIRST_CONTACT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.FIRST_CONTACT_PORT || 8975);
const SHOTS = process.env.FIRST_CONTACT_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
const REPO = 'https://github.com/grist-factory/Publipostage-Plus';
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-modal-pages-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-first-contact] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);
// Une requête vers esm.sh servie comme d'habitude : par le miroir hors-ligne s'il existe, par le réseau sinon.
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

// Une page neuve (son propre contexte : ni stockage ni horloge partagés) sur le harnais, avec ce qu'un scénario règle AVANT le démarrage :
//  - esm : 'serve' (défaut), 'abort' (réseau qui refuse esm.sh) ou 'hold' (requêtes laissées sans réponse jusqu'à `release()`) ;
//  - languages : les langues que se donne le navigateur (navigator.languages, lu par dev-tests/grist-stub.js) ; locale : celle du navigateur lui-même (quand le faux Grist
//    n'est pas chargé) ; stored : valeur de pp_lang déjà enregistrée ;
//  - noGrist : Grist ne répond jamais à onOptions (le widget ouvert seul dans un onglet) ;
//  - clock : l'horloge de la page est pilotée par le test (page.clock) ;
//  - denyStorage : localStorage refuse tout (navigation privée, stockage bloqué).
async function openPage({ esm = 'serve', locale, languages, stored, noGrist = false, clock = false, denyStorage = false, query = '', wait = 'load', width = WIDTH, height = HEIGHT, frame = false, blockStub = false } = {}) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width, height }, permissions: ['clipboard-read', 'clipboard-write'], ...(locale ? { locale } : {}) });
  const page = await context.newPage();
  const state = { context, page, esm, held: [], consoleLines: [], errors: [], opened: [] };
  page.on('pageerror', e => { state.errors.push(e.message); if (!denyStorage) pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('console', m => state.consoleLines.push({ type: m.type(), text: m.text() }));
  await page.route('**://esm.sh/**', route => {
    if (state.esm === 'abort') return route.abort('failed');
    if (state.esm === 'hold') { state.held.push(route); return undefined; }
    return serveEsm(route);
  });
  if (OFFLINE) {
    for (const [re, rel] of UMD_ROUTES) {
      await page.route(re, async route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: await readFile(join(CACHE, rel), 'utf8') }));
    }
    await page.addInitScript(() => { Object.defineProperty(HTMLScriptElement.prototype, 'integrity', { configurable: true, get: () => '', set: () => {} }); });
  }
  await page.route('**://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
  if (blockStub) await page.route('**/dev-tests/grist-stub.js', route => route.abort('failed'));
  state.release = async () => { state.esm = 'serve'; await Promise.all(state.held.splice(0).map(serveEsm)); };
  if (languages) await page.addInitScript(l => { window.__browserLanguages = l; }, languages);
  if (stored) await page.addInitScript(v => { try { localStorage.setItem('pp_lang', v); } catch (e) { /* rien */ } }, stored);
  if (denyStorage) await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('stockage refusé'); } }); });
  if (noGrist) await page.addInitScript(() => { window.__preSeedGristStub = () => { window.grist.onOptions = function () { /* Grist ne répond pas */ }; }; });
  if (clock) await page.clock.install();
  if (frame) {
    // Le widget dans un cadre, comme Grist le montre : une page hôte de la même origine (pour lire le cadre), puis le harnais dedans.
    await page.route(`${BASE}/_frame-host.html`, route => route.fulfill({
      status: 200, contentType: 'text/html; charset=utf-8',
      body: `<!DOCTYPE html><html><body style="margin:0"><iframe id="widget" src="/_test-harness.html${query}" style="width:${width}px;height:${height}px;border:0"></iframe></body></html>`,
    }));
    await page.goto(`${BASE}/_frame-host.html`);
    for (let i = 0; i < 100 && !state.frame; i++) {
      state.frame = page.frames().find(f => f.url().includes('_test-harness.html'));
      if (!state.frame) await page.waitForTimeout(100);
    }
    await state.frame.waitForLoadState('load');
  } else {
    await page.goto(`${BASE}/_test-harness.html${query}`, { waitUntil: wait });
  }
  return state;
}
const closePage = async s => { await s.context.close(); };
// Le widget a fini de démarrer : « prêt » dans le coin d'état (même constat que les autres scripts).
async function untilReady(s, ms = 90000) {
  await s.page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: ms });
  await s.page.waitForFunction(() => { const e = document.getElementById('status-msg'); return !!e && /prêt|ready/i.test(e.textContent || ''); }, null, { timeout: ms });
}

// --- Mesures ---

// Où se joue la page : la page elle-même, ou le cadre qui la contient quand le widget est montré dans un cadre.
const where = s => s.frame || s.page;

// Centre d'un élément, ce qui se trouve réellement au premier plan à cet endroit, et s'il est entier dans le panneau.
async function hitTest(s, selector) {
  return where(s).evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}
const seen = box => box.found && box.width > 0 && box.inViewport && box.onTop;
// Vrai geste : la souris rejoint le centre en quelques pas puis clique.
async function realClick(s, selector, wait = 250) {
  const c = await hitTest(s, selector);
  if (!c.found) throw new Error('introuvable : ' + selector);
  await s.page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await s.page.mouse.move(c.x, c.y, { steps: 3 });
  await s.page.mouse.click(c.x, c.y);
  await s.page.waitForTimeout(wait);
  return c;
}
async function realHover(s, selector) {
  const c = await hitTest(s, selector);
  if (!c.found) throw new Error('introuvable : ' + selector);
  await s.page.mouse.move(c.x - 30, c.y + 5, { steps: 3 });
  await s.page.mouse.move(c.x, c.y, { steps: 6 });
  await s.page.waitForTimeout(450);
}
const displayed = (s, sel) => where(s).evaluate(x => { const e = document.querySelector(x); return !!e && getComputedStyle(e).display !== 'none'; }, sel);
const shot = async (s, name) => { if (SHOTS) await s.page.screenshot({ path: join(SHOTS, name + '.png') }); };
const WINDOW = '#pp-first-contact-modal';
const waitWindow = async (s, ms = 8000) => {
  await where(s).waitForFunction(sel => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none'; }, WINDOW, { timeout: ms }).catch(() => {});
  await s.page.waitForTimeout(200);
};
const insideNow = s => where(s).evaluate(sel => { const e = document.querySelector(sel); return !!e && e.contains(document.activeElement); }, WINDOW);
const activeText = s => where(s).evaluate(() => { const a = document.activeElement; return a ? (a.textContent || a.tagName).trim().slice(0, 40) : null; });
const setLook = (s, theme, lang) => where(s).evaluate(([t, l]) => { Settings.setTheme(t); I18n.setLang(l); }, [theme, lang]);

// Ce que voit la personne dans la fenêtre : sorte, titre, paragraphes, adresses, boutons (libellé, visible ou non), détails techniques, attributs d'accessibilité.
const describe = s => where(s).evaluate(sel => {
  const overlay = document.querySelector(sel);
  if (!overlay) return { exists: false };
  const box = overlay.querySelector('.pp-modal-box');
  const title = box.querySelector('h3');
  const body = box.querySelector('.pp-modal-body');
  const visible = e => !!e && getComputedStyle(e).display !== 'none' && !e.closest('[hidden]') && e.getClientRects().length > 0;
  const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const labelled = document.getElementById(box.getAttribute('aria-labelledby') || '');
  const details = body.querySelector('details');
  return {
    exists: true, shown: getComputedStyle(overlay).display !== 'none', kind: box.dataset.kind || '', title: title.textContent.trim(),
    role: box.getAttribute('role'), modal: box.getAttribute('aria-modal'), labelled: labelled ? labelled.textContent.trim() : '',
    paragraphs: Array.from(body.querySelectorAll(':scope > p')).map(p => p.textContent.trim()),
    steps: Array.from(body.querySelectorAll('ol > li')).map(li => li.textContent.trim()),
    hosts: Array.from(body.querySelectorAll('.pp-first-contact-hosts > li > code')).map(c => c.textContent.trim()),
    hostLines: Array.from(body.querySelectorAll('.pp-first-contact-hosts > li')).map(li => li.textContent.trim()),
    address: (body.querySelector('.pp-first-contact-address code') || {}).textContent || '',
    copyLabel: (body.querySelector('.pp-first-contact-copy') || {}).textContent || '',
    links: Array.from(body.querySelectorAll('a')).map(a => ({ href: a.href, text: a.textContent.trim(), target: a.target, rel: a.rel })),
    details: details ? { open: details.open, summary: details.querySelector('summary').textContent.trim(), text: details.querySelector('pre').textContent, preVisible: details.querySelector('pre').checkVisibility() } : null,
    buttons: Array.from(box.querySelectorAll('.pp-modal-actions button')).filter(visible).map(b => ({ text: b.textContent.trim(), primary: b.classList.contains('var-modal-primary') })),
    box: rect(box), titleRect: rect(title), actionsRect: rect(box.querySelector('.pp-modal-actions')), bodyRect: rect(body),
    bodyScrolls: body.scrollHeight > body.clientHeight + 1,
    pageScrolls: document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight + 1,
  };
}, WINDOW);

// Contrastes mesurés sur les éléments réels (même méthode que dev-tests/scenarios-contrast.js) : couleur calculée composée sur le vrai fond, 4,5:1 pour un texte.
// `map` : nom -> sélecteur ; un élément absent ou non affiché n'est pas mesuré.
const ratiosOf = (s, map) => where(s).evaluate(selectors => {
  const parseColor = str => {
    const srgb = String(str).match(/^color\(srgb\s+([^)]+)\)/);
    if (srgb) { const q = srgb[1].split(/[\s\/]+/).filter(Boolean).map(Number); return { r: q[0] * 255, g: q[1] * 255, b: q[2] * 255, a: q.length > 3 ? q[3] : 1 }; }
    const m = String(str).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const backgroundOf = el => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  // Les transitions sont coupées le temps de la mesure : une couleur en transition rend la valeur de départ juste après le changement de thème.
  const noMotion = document.createElement('style');
  noMotion.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
  document.head.appendChild(noMotion);
  const out = {};
  try {
    for (const [name, selector] of Object.entries(selectors)) {
      const el = document.querySelector(selector);
      if (!el || !el.getClientRects().length) continue;
      const bg = backgroundOf(el);
      out[name] = Math.round(ratio(over(parseColor(getComputedStyle(el).color), bg), bg) * 100) / 100;
    }
  } finally { noMotion.remove(); }
  return out;
}, map);
const WINDOW_TEXTS = {
  titre: `${WINDOW} h3`, texte: `${WINDOW} .pp-modal-body > p`, liste: `${WINDOW} .pp-modal-body li`, lien: `${WINDOW} .pp-modal-body a`,
  adresse: `${WINDOW} .pp-first-contact-address code`, copier: `${WINDOW} .pp-first-contact-copy`, 'adresse réseau': `${WINDOW} .pp-first-contact-hosts code`,
  'détails (résumé)': `${WINDOW} .pp-first-contact-details summary`, 'détails (message)': `${WINDOW} .pp-first-contact-details pre`,
  'bouton principal': `${WINDOW} .var-modal-primary`, 'bouton secondaire': `${WINDOW} .pp-modal-actions button:not(.var-modal-primary)`,
};

// --- Ce que la fenêtre doit dire ---

const TEXT = {
  fr: {
    outside: 'Ce widget s’ouvre dans Grist', network: 'Le widget n’a pas pu se charger', slow: 'Le chargement est long', error: 'Le widget n’a pas pu démarrer',
    reload: 'Recharger la page', wait: 'Continuer d’attendre', readme: 'Lire l’installation', copy: 'Copier', copied: 'Copié', technical: 'Message technique', then: 'Rechargez ensuite la page.',
  },
  en: {
    outside: 'This widget opens inside Grist', network: 'The widget could not load', slow: 'Loading is taking a while', error: 'The widget could not start',
    reload: 'Reload the page', wait: 'Keep waiting', readme: 'Read the installation guide', copy: 'Copy', copied: 'Copied', technical: 'Technical message', then: 'Then reload the page.',
  },
};
const HOSTS = ['esm.sh', 'docs.getgrist.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];
const INSTALL = { fr: REPO + '#installation-dans-grist', en: REPO + '#installing-in-grist' };
const LIMITS = { fr: REPO + '#limites-connues', en: REPO + '#known-limitations' };
const NETWORK_MESSAGE = 'Failed to fetch dynamically imported module: https://esm.sh/@tiptap/core@3.31.3/es2022/core.mjs';
const LOOKS = [['light', 'fr'], ['dark', 'fr'], ['light', 'en'], ['dark', 'en']];

// Les constats communs à toute fenêtre de premier contact, ouverte dans la sorte `kind`, avec les boutons `buttons` (libellés, dans l'ordre) : un dialogue
// modal nommé par son titre, dans le panneau, titre et boutons visibles et au premier plan, le texte des contrastes voulus. Rend ce que décrit `describe`.
async function checkWindow(s, T, kind, lang, buttons, { inFrame = false } = {}) {
  const d = await describe(s);
  const t = TEXT[lang];
  if (!d.exists) throw new Error(`${T} : la fenêtre « ${kind} » n’existe pas`);
  check(`${T} : la fenêtre « ${kind} » est ouverte, avec son titre`, d.shown && d.kind === kind && d.title === t[kind], { shown: d.shown, kind: d.kind, title: d.title });
  check(`${T} : c’est un dialogue modal nommé par son titre`, d.role === 'dialog' && d.modal === 'true' && d.labelled === d.title, { role: d.role, modal: d.modal, labelled: d.labelled });
  check(`${T} : les boutons sont ${buttons.map(b => '« ' + b + ' »').join(' puis ')}, le dernier est le principal`,
    JSON.stringify(d.buttons.map(b => b.text)) === JSON.stringify(buttons) && d.buttons[d.buttons.length - 1].primary, d.buttons);
  check(`${T} : elle tient dans le panneau de ${WIDTH}x${HEIGHT}, sans faire défiler la page`,
    d.box.left >= 0 && d.box.top >= 0 && d.box.right <= WIDTH + 0.5 && d.box.bottom <= HEIGHT + 0.5 && !d.pageScrolls, { box: d.box, pageScrolls: d.pageScrolls });
  if (!inFrame) {
    const h3 = await hitTest(s, WINDOW + ' h3');
    const primary = await hitTest(s, WINDOW + ' .var-modal-primary');
    check(`${T} : titre et bouton principal sont visibles et au premier plan`, seen(h3) && seen(primary), { h3, primary });
  }
  const ratios = await ratiosOf(s, WINDOW_TEXTS);
  const weak = Object.entries(ratios).filter(([, r]) => !(r >= 4.5));
  check(`${T} : tout texte atteint 4,5:1 (${Object.keys(ratios).length} mesurés)`, Object.keys(ratios).length >= 3 && weak.length === 0, weak.length ? weak : ratios);
  return d;
}

// Au clavier, un appui à la fois : Tab puis Maj+Tab tournent dans la fenêtre, y compris quand le focus est tombé sur <body> ; un clic sur le voile ne la ferme pas ;
// Échap la ferme ou non selon la sorte.
async function keyboardChecks(s, T, { escapeCloses }) {
  const walk = async key => {
    const trail = [];
    for (let i = 0; i < 8; i++) { await s.page.keyboard.press(key); trail.push(await insideNow(s)); }
    return trail;
  };
  const forward = await walk('Tab');
  check(`${T} : Tab tourne dans la fenêtre (8 appuis)`, forward.every(Boolean), forward);
  const backward = await walk('Shift+Tab');
  check(`${T} : Maj+Tab aussi`, backward.every(Boolean), backward);
  await where(s).evaluate(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); });
  await s.page.keyboard.press('Tab');
  check(`${T} : Tab rentre dans la fenêtre quand le focus est tombé sur <body>`, await insideNow(s), await activeText(s));
  await s.page.mouse.click(4, 4);
  await s.page.waitForTimeout(150);
  check(`${T} : un clic sur le voile ne la ferme pas (il protège ce que la personne est en train de faire)`, await displayed(s, WINDOW));
  await s.page.keyboard.press('Escape');
  await s.page.waitForTimeout(200);
  const still = await displayed(s, WINDOW);
  check(escapeCloses ? `${T} : Échap la ferme` : `${T} : Échap ne la ferme pas (rien d’autre à faire que suivre la consigne)`, still === !escapeCloses, { still });
}

// Un parcours qui s'interrompt (élément absent, exception) compte comme un constat raté et n'empêche pas les suivants : sur l'ancien code, chaque parcours
// montre ainsi ce qui lui manque au lieu de s'arrêter au premier.
async function section(name, body) {
  console.log('\n# ' + name);
  try { await body(); } catch (e) { check(`le parcours « ${name} » va jusqu’au bout`, false, String((e && e.message) || e).split('\n')[0]); }
}
let A = null; // la page des trois premiers parcours
// ============================================================================================================================================================
// 1. Démarrage normal : rien ne s'affiche, la console se tait, l'onglet a son titre, son icône, sa description, et Crédits donne la version.
// ============================================================================================================================================================
await section('Démarrage normal', async () => {
  A = await openPage();
  await untilReady(A);
  await A.page.waitForTimeout(1600); // plus long que l'attente du premier contact (1 s) : si la fenêtre devait venir, elle serait là
  check('un démarrage normal n’affiche aucune fenêtre de premier contact', !(await displayed(A, WINDOW)));
  check('... et n’en construit même pas le cadre', await A.page.evaluate(sel => !document.querySelector(sel), WINDOW));
  const loud = A.consoleLines.filter(l => ['log', 'info', 'debug'].includes(l.type));
  check('la console reste muette au démarrage : ni log ni info', loud.length === 0, loud.slice(0, 5));
  check('aucune erreur JavaScript au démarrage', A.errors.length === 0, A.errors);
  const head = await A.page.evaluate(async () => {
    const icon = document.querySelector('link[rel~="icon"]');
    const meta = document.querySelector('meta[name="description"]');
    let iconLoads = false;
    if (icon) iconLoads = await new Promise(ok => { const img = new Image(); img.onload = () => ok(img.naturalWidth > 0); img.onerror = () => ok(false); img.src = icon.href; });
    return { title: document.title, icons: document.querySelectorAll('link[rel~="icon"]').length, href: icon ? icon.getAttribute('href') : '', iconLoads, description: meta ? meta.content : '' };
  });
  check('l’onglet s’appelle « Publipostage+ · Grist Factory »', head.title === 'Publipostage+ · Grist Factory', head.title);
  check('... a une icône (une seule), et elle se charge', head.icons === 1 && head.iconLoads && /grist-factory-logo\.jpg$/.test(head.href), head);
  check('... et une description en français et en anglais', /Publipostage\+/.test(head.description) && /\bGrist widget\b/.test(head.description) && /widget Grist/.test(head.description), head.description);

  // Réglages > Crédits : la version vient de js/version.js.
  const versionFile = join(ROOT, 'js', 'version.js');
  const declared = (existsSync(versionFile) ? readFileSync(versionFile, 'utf8') : '').match(/PP_VERSION\s*=\s*'([^']+)'/);
  check('js/version.js déclare un numéro de version (X.Y.Z, avec ou sans suite)', !!declared && /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(declared[1]), declared && declared[1]);
  await realClick(A, '#v2-btn-settings', 300);
  await realClick(A, '[data-settings-tab="credits"]', 250);
  const credits = await A.page.evaluate(() => {
    const label = document.querySelector('[data-i18n="settings.credits.version"]');
    const cell = document.getElementById('settings-credits-version');
    return {
      label: label ? label.textContent.trim() : null, version: cell ? cell.textContent.trim() : null,
      visible: !!cell && cell.getClientRects().length > 0, constant: typeof PP_VERSION === 'string' ? PP_VERSION : null,
    };
  });
  check('Réglages > Crédits montre la version, sur sa première ligne', credits.visible && credits.label === 'Version' && credits.version === credits.constant && credits.version === (declared && declared[1]), credits);
  await shot(A, 'credits');
  await realClick(A, '#settings-close', 250);

  // Les ancres que la fenêtre « hors de Grist » et la liste des adresses citent existent dans le README public (titres traduits en ancres comme GitHub le fait).
  const readme = readFileSync(join(ROOT, 'outils', 'depot-propre', 'public', 'README.md'), 'utf8');
  const slugs = new Set(readme.split('\n').filter(l => /^#{1,6}\s/.test(l)).map(l => '#' + l.replace(/^#+\s*/, '').trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-')));
  for (const [name, link] of [['installation (FR)', INSTALL.fr], ['installation (EN)', INSTALL.en], ['limites (FR)', LIMITS.fr], ['limites (EN)', LIMITS.en]]) {
    check(`le README public a le titre que cite la fenêtre : ${name}`, slugs.has(link.slice(REPO.length)), link.slice(REPO.length));
  }
});

// ============================================================================================================================================================
// 2. Galerie : l'avertissement sur les modèles juridiques tient dans la rangée du bas, à gauche de « Fermer ».
// ============================================================================================================================================================
await section('Galerie : avertissement sur les modèles juridiques', async () => {
  const NOTE = { fr: 'Ces modèles sont des exemples à adapter ; ils ne remplacent pas un conseil juridique.', en: 'These templates are examples to adapt; they are not legal advice.' };
  for (const [theme, lang] of LOOKS) {
    const T = `${theme}/${lang}`;
    await setLook(A, theme, lang);
    await realHover(A, '#v2-new-template-group #btn-new');
    await realClick(A, '#v2-btn-new-from-template', 0);
    await A.page.waitForSelector('#tpl-gallery-grid .tpl-gallery-card', { timeout: 8000 }).catch(() => {});
    await A.page.waitForTimeout(300);
    const note = await A.page.evaluate(() => {
      const n = document.querySelector('.tpl-gallery-note');
      const close = document.getElementById('tpl-gallery-close');
      if (!n || !close) return { found: false };
      const nr = n.getBoundingClientRect(), cr = close.getBoundingClientRect(), row = close.parentElement.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(n).lineHeight);
      return {
        found: true, text: n.textContent.trim(), shown: n.getClientRects().length > 0, left: nr.left, right: nr.right, top: nr.top, bottom: nr.bottom, closeLeft: cr.left, closeRight: cr.right,
        rowTop: row.top, rowBottom: row.bottom, lines: Math.round(nr.height / lineHeight), clipped: n.scrollWidth > n.clientWidth + 1, panel: [innerWidth, innerHeight],
      };
    });
    check(`${T} : la galerie porte l’avertissement « ${NOTE[lang].slice(0, 28)}… »`, note.found && note.shown && note.text === NOTE[lang], note);
    check(`${T} : ... dans la rangée du bas, à gauche de « Fermer », sans la pousser hors du panneau`,
      note.found && note.right <= note.closeLeft + 0.5 && note.top >= note.rowTop - 1 && note.bottom <= note.rowBottom + 1 && note.closeRight <= note.panel[0] && note.rowBottom <= note.panel[1] && !note.clipped, note);
    check(`${T} : ... sur deux lignes au plus`, note.found && note.lines <= 2, note.lines);
    const closeBox = await hitTest(A, '#tpl-gallery-close');
    check(`${T} : « Fermer » reste visible et cliquable`, seen(closeBox), closeBox);
    const ratios = await ratiosOf(A, { avertissement: '.tpl-gallery-note' });
    check(`${T} : l’avertissement atteint 4,5:1`, ratios['avertissement'] >= 4.5, ratios);
    await shot(A, `galerie-${theme}-${lang}`);
    await realClick(A, '#tpl-gallery-close', 250);
  }
  await setLook(A, 'light', 'fr');
});

// ============================================================================================================================================================
// 3. Fenêtres « réseau » et « erreur » : ce que main.js leur donne quand init() échoue (FirstContact.failed), dans les quatre aspects.
// ============================================================================================================================================================
await section('Réseau bloqué et erreur de démarrage (fenêtre ouverte par main.js)', async () => {
  for (const [theme, lang] of LOOKS) {
    const T = `${theme}/${lang}`;
    const t = TEXT[lang];
    await setLook(A, theme, lang);
    await A.page.evaluate(m => FirstContact.failed(new Error(m)), NETWORK_MESSAGE);
    await A.page.waitForTimeout(200);
    const net = await checkWindow(A, `${T} réseau`, 'network', lang, [t.reload]);
    check(`${T} réseau : les quatre adresses à autoriser, dans l’ordre, chacune avec ce qu’elle sert à faire`,
      JSON.stringify(net.hosts) === JSON.stringify(HOSTS) && net.hostLines.every(l => / : \S/.test(l)), { hosts: net.hosts, lines: net.hostLines });
    check(`${T} réseau : « ${t.then} », puis le lien vers la liste complète (README, dans la langue), ouvert dans un autre onglet sans lien avec la page`,
      net.paragraphs.includes(t.then) && net.links.length === 1 && net.links[0].href === LIMITS[lang] && net.links[0].target === '_blank' && /noopener/.test(net.links[0].rel), { paragraphs: net.paragraphs, links: net.links });
    check(`${T} réseau : le message du navigateur est replié (« ${t.technical} ») et se lit tel quel`,
      !!net.details && !net.details.open && net.details.summary === t.technical && !net.details.preVisible && net.details.text === NETWORK_MESSAGE, net.details);
    check(`${T} réseau : le focus est sur le bouton principal`, (await activeText(A)) === t.reload, await activeText(A));
    await shot(A, `reseau-${theme}-${lang}`);

    await A.page.evaluate(() => FirstContact.failed(new Error('boom : une erreur de démarrage')));
    await A.page.waitForTimeout(200);
    const err = await checkWindow(A, `${T} erreur`, 'error', lang, [t.reload]);
    check(`${T} erreur : le message est déplié et se lit, sans liste d’adresses`,
      !!err.details && err.details.open && err.details.preVisible && err.details.text === 'boom : une erreur de démarrage' && err.hosts.length === 0, { details: err.details, hosts: err.hosts });
    await shot(A, `erreur-${theme}-${lang}`);
  }
  // Les deux fenêtres, au clavier : seules, sans issue par Échap.
  await setLook(A, 'light', 'fr');
  await keyboardChecks(A, 'erreur', { escapeCloses: false });
  // « Recharger la page » recharge pour de bon, et le widget repart sans fenêtre.
  await A.page.evaluate(() => { window.__avant = 'avant le rechargement'; });
  const reloadedA = A.page.waitForEvent('load', { timeout: 60000 });
  await realClick(A, WINDOW + ' .var-modal-primary', 0);
  await reloadedA;
  check('« Recharger la page » recharge la page', (await A.page.evaluate(() => window.__avant)) === undefined);
  await untilReady(A);
  await A.page.waitForTimeout(1200);
  check('... et le widget repart sans fenêtre', !(await displayed(A, WINDOW)));
  await closePage(A);
});

// ============================================================================================================================================================
// 4. Hors de Grist : le widget ouvert seul dans un onglet (aucune réponse de Grist).
// ============================================================================================================================================================
await section('Ouvert hors de Grist', async () => {
  const B = await openPage({ noGrist: true });
  await waitWindow(B, 15000);
  await B.page.evaluate(() => { window.__opened = []; window.open = (...args) => { window.__opened.push(args); return null; }; });
  for (const [theme, lang] of LOOKS) {
    const T = `${theme}/${lang}`;
    const t = TEXT[lang];
    await setLook(B, theme, lang);
    await B.page.waitForTimeout(150);
    const d = await checkWindow(B, T, 'outside', lang, [t.readme]);
    check(`${T} : trois étapes, la première donne l’adresse de la page (celle à coller dans Grist) et un bouton « ${t.copy} »`,
      d.steps.length === 3 && d.address === BASE + '/' && d.copyLabel === t.copy && d.steps[0].includes(d.address), { steps: d.steps.length, address: d.address, copy: d.copyLabel });
    check(`${T} : ni liste d’adresses ni message technique`, d.hosts.length === 0 && d.details === null, { hosts: d.hosts, details: d.details });
    // « Lire l’installation » : le guide, dans la langue de la page, dans un autre onglet sans lien avec la page.
    await B.page.evaluate(() => { window.__opened.length = 0; });
    await realClick(B, WINDOW + ' .var-modal-primary', 200);
    const opened = await B.page.evaluate(() => window.__opened);
    check(`${T} : « ${t.readme} » ouvre le guide d’installation de la langue, dans un autre onglet sans lien avec la page`,
      opened.length === 1 && opened[0][0] === INSTALL[lang] && opened[0][1] === '_blank' && /noopener/.test(opened[0][2]), opened);
    check(`${T} : ... et la fenêtre reste ouverte`, await displayed(B, WINDOW));
    await shot(B, `hors-grist-${theme}-${lang}`);
  }
  await setLook(B, 'light', 'fr');
  // « Copier » met l'adresse dans le presse-papiers et le dit.
  const copyFr = await realClick(B, WINDOW + ' .pp-first-contact-copy', 300);
  const clip = await B.page.evaluate(async () => ({ clipboard: await navigator.clipboard.readText(), label: document.querySelector('.pp-first-contact-copy').textContent }));
  check('« Copier » met l’adresse dans le presse-papiers et répond « Copié »', clip.clipboard === BASE + '/' && clip.label === TEXT.fr.copied, clip);
  check('... et le bouton garde sa place (la ligne ne bouge pas)', (await hitTest(B, WINDOW + ' .pp-first-contact-copy')).found && Math.abs((await hitTest(B, WINDOW + ' .pp-first-contact-copy')).y - copyFr.y) < 2);
  // Une erreur de démarrage (conséquence d'être hors de Grist) ne remplace pas la consigne ; le clavier reste dans la fenêtre, Échap ne la ferme pas.
  await B.page.evaluate(() => FirstContact.failed(new Error('Failed to fetch dynamically imported module : conséquence, pas cause')));
  await B.page.waitForTimeout(150);
  const keptOutside = await describe(B);
  check('une erreur de démarrage ne remplace pas la consigne « hors de Grist »', keptOutside.shown && keptOutside.kind === 'outside' && keptOutside.details === null, { kind: keptOutside.kind, details: keptOutside.details });
  await keyboardChecks(B, 'hors de Grist', { escapeCloses: false });
  await closePage(B);

  // Avec `?dev` dans l'adresse : le widget se développe aussi hors de Grist, rien ne s'affiche.
  const B2 = await openPage({ noGrist: true, query: '?dev' });
  await B2.page.waitForTimeout(3500);
  check('avec ?dev dans l’adresse, le widget ouvert hors de Grist n’affiche rien', !(await displayed(B2, WINDOW)) && await B2.page.evaluate(sel => !document.querySelector(sel), WINDOW));
  await closePage(B2);
});

// ============================================================================================================================================================
// 5. Réseau bloqué pour de bon : l'éditeur ne se télécharge pas, puis l'adresse est rouverte et « Recharger la page » remet le widget en marche.
// ============================================================================================================================================================
await section('Réseau bloqué (esm.sh refusé)', async () => {
  const C = await openPage({ esm: 'abort' });
  await waitWindow(C, 30000);
  const blocked = await checkWindow(C, 'réseau bloqué', 'network', 'fr', [TEXT.fr.reload]);
  check('réseau bloqué : les quatre adresses sont listées et le message du navigateur est dans les détails',
    JSON.stringify(blocked.hosts) === JSON.stringify(HOSTS) && !!blocked.details && /esm\.sh/.test(blocked.details.text) && blocked.details.text.length > 10, { hosts: blocked.hosts, details: blocked.details });
  const blockedMessage = (await describe(C)).details.text;
  console.log('       message du navigateur : ' + blockedMessage.slice(0, 140));
  const statusAfterFailure = await C.page.evaluate(() => document.getElementById('status-msg').textContent);
  check('... et le coin d’état dit lui aussi que le chargement a échoué', /^Erreur au chargement du widget/.test(statusAfterFailure), statusAfterFailure);
  await C.page.evaluate(() => { window.__avant = 'avant le rechargement'; });
  C.esm = 'serve'; // le pare-feu a été ouvert
  const reloadedC = C.page.waitForEvent('load', { timeout: 60000 });
  await realClick(C, WINDOW + ' .var-modal-primary', 0);
  await reloadedC;
  check('« Recharger la page » recharge la page, adresse rouverte', (await C.page.evaluate(() => window.__avant)) === undefined);
  await untilReady(C);
  await C.page.waitForTimeout(1500);
  check('... et le widget démarre sans fenêtre', !(await displayed(C, WINDOW)));
  await closePage(C);

  // Le script de l'API Grist qui ne se charge pas (widget dans un cadre, comme Grist le montre) : la même fenêtre, tout de suite.
  const D = await openPage({ frame: true, blockStub: true, locale: 'fr-FR' });
  await waitWindow(D, 15000);
  const noApi = await checkWindow(D, 'API Grist absente', 'network', 'fr', [TEXT.fr.reload], { inFrame: true });
  check('API Grist absente : les quatre adresses sont listées, le script manquant est nommé dans les détails',
    JSON.stringify(noApi.hosts) === JSON.stringify(HOSTS) && !!noApi.details && /grist-plugin-api\.js/.test(noApi.details.text), { hosts: noApi.hosts, details: noApi.details });
  await closePage(D);
});

// ============================================================================================================================================================
// 6. Démarrage trop long : 30 s sans erreur, horloge pilotée par le test.
// ============================================================================================================================================================
await section('Démarrage trop long (esm.sh sans réponse)', async () => {
  const waitStart = async s => {
    await s.page.waitForFunction(() => typeof FirstContact !== 'undefined' && document.readyState !== 'loading', null, { timeout: 30000 });
    await s.page.waitForTimeout(300);
  };
  // Un démarrage qui aboutit à temps ne montre jamais la fenêtre, même longtemps après (l'attente est annulée quand le widget est prêt).
  const E0 = await openPage({ clock: true });
  await untilReady(E0);
  await E0.page.clock.fastForward(120000);
  await E0.page.waitForTimeout(300);
  check('un widget prêt à temps n’affiche jamais la fenêtre « chargement long », même 2 minutes plus tard', !(await displayed(E0, WINDOW)));
  await closePage(E0);

  const E1 = await openPage({ clock: true, esm: 'hold', wait: 'commit' });
  await waitStart(E1);
  await E1.page.clock.fastForward(29000);
  await E1.page.waitForTimeout(300);
  check('à 29 s sans erreur, la fenêtre n’est pas encore là', !(await displayed(E1, WINDOW)));
  await E1.page.clock.fastForward(2000);
  await waitWindow(E1);
  for (const [theme, lang] of LOOKS) {
    const T = `${theme}/${lang} lent`;
    const t = TEXT[lang];
    await setLook(E1, theme, lang);
    await E1.page.waitForTimeout(150);
    const slow = await checkWindow(E1, T, 'slow', lang, [t.wait, t.reload]);
    check(`${T} : les quatre adresses, le lien vers la liste complète, ni message technique ni « ${t.then} »`,
      JSON.stringify(slow.hosts) === JSON.stringify(HOSTS) && slow.links.length === 1 && slow.links[0].href === LIMITS[lang] && slow.details === null && !slow.paragraphs.includes(t.then), { hosts: slow.hosts, links: slow.links, details: slow.details });
    await shot(E1, `lent-${theme}-${lang}`);
  }
  await setLook(E1, 'light', 'fr');
  check('lent : le focus est sur le bouton principal', (await activeText(E1)) === TEXT.fr.reload, await activeText(E1));
  // « Continuer d'attendre » ferme la fenêtre, qui ne revient pas.
  await realClick(E1, WINDOW + ' .pp-modal-actions button:not(.var-modal-primary)', 250);
  check('« Continuer d’attendre » ferme la fenêtre', !(await displayed(E1, WINDOW)));
  await E1.page.clock.fastForward(120000);
  await E1.page.waitForTimeout(300);
  check('... et elle ne revient pas', !(await displayed(E1, WINDOW)));
  await closePage(E1);

  // Échap la ferme aussi (clavier de la fenêtre) ; « Recharger la page » recharge.
  const E2 = await openPage({ clock: true, esm: 'hold', wait: 'commit' });
  await waitStart(E2);
  await E2.page.clock.fastForward(31000);
  await waitWindow(E2);
  await keyboardChecks(E2, 'lent', { escapeCloses: true });
  await closePage(E2);

  // Le widget finit de démarrer pendant que la fenêtre est ouverte : elle se ferme d'elle-même.
  const E3 = await openPage({ clock: true, esm: 'hold', wait: 'commit' });
  await waitStart(E3);
  await E3.page.clock.fastForward(31000);
  await waitWindow(E3);
  check('lent : la fenêtre est ouverte avant que le réseau ne réponde', (await describe(E3)).kind === 'slow');
  await E3.release();
  await untilReady(E3);
  await E3.page.waitForTimeout(400);
  check('... elle se ferme d’elle-même quand le widget est prêt', !(await displayed(E3, WINDOW)));
  await closePage(E3);
});

// ============================================================================================================================================================
// 7. Langue au premier lancement.
// ============================================================================================================================================================
await section('Langue au premier lancement', async () => {
  const CASES = [
    { name: 'aucune préférence donnée (le navigateur des tests se dit français)', expect: 'fr' },
    { name: 'en-GB, en', languages: ['en-GB', 'en'], expect: 'en' },
    { name: 'fr-CA, fr', languages: ['fr-CA', 'fr'], expect: 'fr' },
    { name: 'de-DE, de : ni français ni anglais, l’anglais', languages: ['de-DE', 'de'], expect: 'en' },
    { name: 'de-DE puis fr-FR : la première des deux langues du widget', languages: ['de-DE', 'fr-FR'], expect: 'fr' },
    { name: 'es-ES, en-US, fr-FR : l’ordre des préférences compte', languages: ['es-ES', 'en-US', 'fr-FR'], expect: 'en' },
    { name: 'le navigateur ne dit rien : le français', languages: [], expect: 'fr' },
    { name: 'EN-us en majuscules', languages: ['EN-us'], expect: 'en' },
    { name: 'choix enregistré « en », navigateur français : le choix', languages: ['fr-FR'], stored: 'en', expect: 'en', kept: 'en' },
    { name: 'choix enregistré « fr », navigateur anglais : le choix', languages: ['en-US'], stored: 'fr', expect: 'fr', kept: 'fr' },
    { name: 'choix enregistré invalide (« xx »), navigateur anglais : le navigateur', languages: ['en-US'], stored: 'xx', expect: 'en', kept: 'xx' },
    { name: 'stockage refusé, navigateur anglais : le navigateur', languages: ['en-US'], denyStorage: true, expect: 'en', noStore: true },
  ];
  for (const c of CASES) {
    const L = await openPage({ languages: c.languages, stored: c.stored, denyStorage: c.denyStorage, esm: 'abort', wait: 'domcontentloaded' });
    const r = await L.page.evaluate(() => {
      let stored;
      try { stored = localStorage.getItem('pp_lang'); } catch (e) { stored = 'refusé'; }
      return { lang: I18n.getLang(), html: document.documentElement.lang, close: I18n.t('common.close'), stored };
    });
    check(`langue : ${c.name} -> ${c.expect === 'fr' ? 'français' : 'anglais'}`, r.lang === c.expect && r.html === c.expect && r.close === (c.expect === 'fr' ? 'Fermer' : 'Close'), r);
    if (!c.noStore) check(`... et rien n’est enregistré tant que la personne n’a pas choisi dans Réglages`, r.stored === (c.kept || null), r.stored);
    await closePage(L);
  }
  // Un choix fait dans Réglages est gardé, et l'emporte au lancement suivant.
  const M = await openPage({ languages: ['fr-FR'], esm: 'abort', wait: 'domcontentloaded' });
  await M.page.evaluate(() => I18n.setLang('en'));
  const kept = await M.page.evaluate(() => localStorage.getItem('pp_lang'));
  await M.page.reload({ waitUntil: 'domcontentloaded' });
  const afterReload = await M.page.evaluate(() => I18n.getLang());
  check('un choix fait dans Réglages est enregistré et suivi au lancement suivant, malgré un navigateur français', kept === 'en' && afterReload === 'en', { kept, afterReload });
  await closePage(M);
});

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
