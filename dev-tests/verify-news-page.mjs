#!/usr/bin/env node
// La page des nouveautés (nouveautes.html, js/news-page.js, css/news-page.css ; consigne 070 de GFS) à la VRAIE souris et au vrai clavier, dans le panneau de 700x400, SOUS SA VRAIE POLITIQUE DE SÉCURITÉ :
// la page se charge sans `bypassCSP`, avec la balise <meta> qu'elle porte (rien que ses propres fichiers, aucun script en ligne, aucune connexion, aucun cadre). C'est l'adresse que le bouton « Découvrir les
// nouveautés » du bandeau de la bêta figée ouvre dans un nouvel onglet (nouveautes.html?lang=fr ou ?lang=en). Ce que scenarios-whats-new*.js ne voit pas depuis le widget :
//  1) quatre ouvertures : français clair (système clair), anglais sombre (système sombre), français avec le thème sombre CHOISI dans le widget (pp_theme) sur un système clair, anglais avec le clair choisi sur un
//     système sombre : titre de l'onglet, titre et phrases de la page, thème, la fenêtre des nouveautés ouverte toute seule, entière dans 700x400, sans défilement de la page, textes lisibles (>= 4,5:1) ;
//  2) rien que son origine : toutes les réponses 200 de la même adresse, aucune erreur de page ni de console, AUCUNE violation de la politique de sécurité ; et la politique est bien en vigueur (un script
//     en ligne ne s'exécute pas, une connexion est refusée : sinon les vérifications ci-dessus ne prouveraient rien) ;
//  3) le tour complet à la vraie souris, en français clair puis en anglais sombre : les 11 écrans du carrousel (« Suivant » atteignable à chaque écran, image chargée), « Voir en détail » qui ouvre « Exporter, en
//     détail » (5 écrans, leurs captures chargées) par-dessus, « Fermer » qui rend le carrousel, puis « Fermer » du dernier écran : la page reste, dit qu'on peut fermer l'onglet, et le focus est sur son bouton ;
//  4) rouvrir : un vrai clic sur « Voir les nouveautés » rouvre au premier écran, Échap ferme, Entrée (au clavier) rouvre ;
//  5) la langue de l'adresse (?lang=) passe avant celle que le widget a gardée (pp_lang) et une langue inconnue laisse la gardée ;
//  6) la page ne retient rien de la personne : localStorage et sessionStorage restent tels qu'ils étaient (pp_theme et pp_lang lus, jamais écrits), aucun cookie, jamais « pp_news_seen » (fermer la fenêtre
//     d'ici ne change pas ce que le widget fera à l'ouverture suivante).
// Lancé par run-headless.mjs (groupe Node « newsPageMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-news-page.mjs
// NEWS_PAGE_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit. NEWS_PAGE_PORT : le port du petit serveur (9061 par défaut).
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.NEWS_PAGE_PORT || 9061);
const SHOTS = process.env.NEWS_PAGE_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
};
// Un petit serveur de fichiers, rien d'autre : pas de Grist, pas de CDN. La page doit tenir avec ses seuls fichiers.
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const file = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const info = await stat(file);
    const target = info.isDirectory() ? join(file, 'index.html') : file;
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(target));
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((ok, ko) => server.listen(PORT, '127.0.0.1', ok).on('error', ko));
const BASE = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const TEXTS = {
  fr: { title: 'Nouveautés · Publipostage+', h1: 'Nouveautés de la version 1.0', lead: 'Ce que la version 1 de Publipostage+ change, en images.', done: 'Vous pouvez fermer cet onglet.', again: 'Voir les nouveautés', next: 'Suivant', close: 'Fermer', detail: 'Voir en détail', exportTitle: 'Exporter, en détail' },
  en: { title: 'What’s new · Publipostage+', h1: 'What’s new in version 1.0', lead: 'What version 1 of Publipostage+ changes, in pictures.', done: 'You can close this tab.', again: 'See what’s new', next: 'Next', close: 'Close', detail: 'See details', exportTitle: 'Exporting, in detail' },
};

// Une ouverture de la page : un contexte neuf (700x400, le thème du système demandé), les réglages que le widget aurait gardés (`stored`) posés avant tout script de la page, l'écoute des violations de la
// politique de sécurité (window.__csp), et ce que la page a demandé, reçu et raté.
async function openPage({ query = '?lang=fr', scheme = 'light', stored = {} } = {}) {
  const context = await browser.newContext({ viewport: { width: 700, height: 400 }, colorScheme: scheme });
  const page = await context.newPage();
  const log = { errors: [], failed: [], responses: [] };
  page.on('pageerror', e => log.errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.errors.push('console.' + m.type() + ': ' + m.text()); });
  page.on('requestfailed', r => log.failed.push(r.url() + ' ' + ((r.failure() || {}).errorText || '')));
  page.on('response', r => log.responses.push({ url: r.url(), status: r.status() }));
  await page.addInitScript((kept) => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' | ' + e.blockedURI + ' | ' + e.sourceFile + ':' + e.lineNumber));
    try { for (const [key, value] of Object.entries(kept)) localStorage.setItem(key, value); } catch (e) { /* stockage refusé : la page se lit sans */ }
  }, stored);
  const response = await page.goto(`${BASE}/nouveautes.html${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => { const m = document.getElementById('pp-news-modal'); return !!m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(400);
  return { context, page, log, status: response ? response.status() : 0 };
}

// Les contrastes des éléments cherchés par sélecteur (le premier de chacun) : la couleur du texte sur le premier fond opaque en remontant.
const contrastOf = (page, selectors) => page.evaluate((list) => {
  const opaque = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
  const lum = (c) => { const [r, g, b] = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return Math.round((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) * 100) / 100; };
  return list.map((selector) => { const el = document.querySelector(selector); return { selector, ratio: el ? ratio(getComputedStyle(el).color, opaque(el)) : 0 }; });
}, selectors);

// Un vrai clic de souris au centre d'un élément visible (et on dit s'il est atteignable : l'élément sous le pointeur est lui ou l'un de ses enfants).
async function clickAt(page, pos) {
  if (!pos) return null;
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.click(pos.x, pos.y);
  await sleep(220);
  return pos;
}
const mouseClick = async (page, selector) => clickAt(page, await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el || el.hidden || el.getClientRects().length === 0) return null;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { x, y, reachable: !!top && el.contains(top) };
}, selector));
// Un bouton visible d'une fenêtre à écrans, choisi par son texte : la fenêtre garde dans son DOM le bouton « Suivant » caché au dernier écran, avec sa classe de bouton principal, un sélecteur de classe le prendrait.
const clickWindowButton = async (page, id, text) => clickAt(page, await page.evaluate(({ modalId, label }) => {
  const el = Array.from(document.querySelectorAll(`#${modalId} .var-modal-actions button`)).find(b => !b.classList.contains('pp-news-dot') && !b.hidden && b.getClientRects().length > 0 && b.textContent.trim() === label);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { x, y, reachable: !!top && el.contains(top) };
}, { modalId: id, label: text }));

// L'état d'une des deux fenêtres (le carrousel `pp-news-modal`, « Exporter, en détail » `pp-export-news-modal`) : null si elle n'est pas ouverte.
const windowState = (page, id) => page.evaluate((modalId) => {
  const modal = document.getElementById(modalId);
  if (!modal || getComputedStyle(modal).display === 'none') return null;
  const box = modal.querySelector('.modal-content');
  const r = box.getBoundingClientRect();
  const dots = Array.from(modal.querySelectorAll('.pp-news-dot'));
  const buttons = Array.from(modal.querySelectorAll('.var-modal-actions button')).filter(b => !b.classList.contains('pp-news-dot') && !b.hidden && b.getClientRects().length > 0).map((b) => {
    const q = b.getBoundingClientRect();
    const top = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
    return { text: b.textContent.trim(), primary: b.classList.contains('var-modal-primary'), reachable: !!top && b.contains(top), inside: q.left >= 0 && q.top >= 0 && q.right <= innerWidth && q.bottom <= innerHeight };
  });
  const images = Array.from(modal.querySelectorAll('img')).map(i => ({ src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0 }));
  return {
    index: dots.findIndex(d => d.getAttribute('aria-selected') === 'true'), count: dots.length,
    title: (modal.querySelector('h3') || {}).textContent || '', name: (modal.querySelector('.pp-news-name') || {}).textContent || '',
    inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, box: [Math.round(r.width), Math.round(r.height)],
    pageScrolls: document.scrollingElement.scrollHeight > innerHeight + 1, buttons, images,
  };
}, id);

// Les images d'un écran arrivent après son dessin : on les attend (3 s au plus) avant de les juger.
async function settledState(page, id) {
  let state = null;
  for (let i = 0; i < 30; i++) {
    state = await windowState(page, id);
    if (!state || state.images.every(image => image.loaded)) return state;
    await sleep(100);
  }
  return state;
}

const isOpen = async (page, id) => !!(await windowState(page, id));

// Le tour d'une fenêtre à écrans à la vraie souris : « Suivant » (le bouton principal) jusqu'au dernier écran, où le principal devient « Fermer ». Chaque écran : le bon numéro, la fenêtre entière dans
// 700x400, les boutons atteignables, les images chargées. Rend le dernier état.
async function tour(page, tag, id, count, texts) {
  let last = null;
  for (let i = 0; i < count; i++) {
    const state = await settledState(page, id);
    const lastScreen = i === count - 1;
    check(`${tag} : écran ${i + 1}/${count} affiché, fenêtre entière dans 700x400, page sans défilement`, !!state && state.index === i && state.count === count && state.inside && !state.pageScrolls, state && { index: state.index, count: state.count, inside: state.inside, box: state.box, pageScrolls: state.pageScrolls });
    check(`${tag} : écran ${i + 1}/${count} : boutons entiers et atteignables, le principal est « ${lastScreen ? texts.close : texts.next} »`, !!state && state.buttons.length > 0 && state.buttons.every(b => b.reachable && b.inside) && (state.buttons.find(b => b.primary) || {}).text === (lastScreen ? texts.close : texts.next), state && state.buttons);
    check(`${tag} : écran ${i + 1}/${count} : ses images sont chargées (même origine)`, !!state && state.images.every(image => image.loaded), state && state.images.filter(image => !image.loaded));
    last = state;
    if (!lastScreen) {
      const clicked = await clickWindowButton(page, id, texts.next);
      check(`${tag} : écran ${i + 1}/${count} : « ${texts.next} » se clique à la vraie souris`, !!clicked && clicked.reachable, clicked);
    }
  }
  return last;
}

const pageFacts = page => page.evaluate(() => ({
  title: document.title, h1: (document.getElementById('news-page-title') || {}).textContent, lead: (document.getElementById('news-page-lead') || {}).textContent,
  done: (document.getElementById('news-page-done') || {}).textContent, again: (document.getElementById('news-page-again') || {}).textContent,
  theme: document.documentElement.getAttribute('data-theme'), dark: matchMedia('(prefers-color-scheme: dark)').matches,
  bodyBackground: getComputedStyle(document.body).backgroundColor, focus: document.activeElement && document.activeElement.id,
  doneVisible: (() => { const e = document.getElementById('news-page-done'); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; })(),
  storage: Object.fromEntries((() => { try { return Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]); } catch (e) { return []; } })()),
  session: (() => { try { return Object.keys(sessionStorage); } catch (e) { return ['?']; } })(), cookie: document.cookie, csp: window.__csp.slice(),
}));
// Un fond sombre ou clair, d'après la luminance de la couleur de fond du corps de la page.
const luminance = (color) => { const [r, g, b] = (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

// Une ouverture complète : les faits de la page, la fenêtre ouverte toute seule, le tour (si demandé), la fermeture, la réouverture, le clavier, la politique, ce qui est retenu.
async function run({ id, lang, scheme, stored = {}, expectTheme = null, full = false }) {
  const tag = id;
  const texts = TEXTS[lang];
  const { context, page, log, status } = await openPage({ query: `?lang=${lang}`, scheme, stored });
  check(`${tag} : nouveautes.html est servie (200)`, status === 200, status);
  if (status !== 200) { await context.close(); return; }
  const dark = expectTheme ? expectTheme === 'dark' : scheme === 'dark';

  // 1. La page, sa langue, son thème, la fenêtre ouverte toute seule.
  let facts = await pageFacts(page);
  check(`${tag} : l'onglet s'appelle « ${texts.title} »`, facts.title === texts.title, facts.title);
  check(`${tag} : le titre de la page dit « ${texts.h1} », la phrase d'appui et le bouton sont dans la langue de l'adresse`, facts.h1 === texts.h1 && facts.lead === texts.lead && facts.again === texts.again && facts.done === texts.done, facts);
  check(`${tag} : le thème est ${expectTheme ? `celui que le widget a choisi (${expectTheme}, data-theme)` : `celui du système (${scheme}), sans data-theme`}`, expectTheme ? facts.theme === expectTheme : facts.theme === null && facts.dark === (scheme === 'dark'), { theme: facts.theme, dark: facts.dark });
  check(`${tag} : le fond de la page est ${dark ? 'sombre' : 'clair'}`, dark ? luminance(facts.bodyBackground) < 0.2 : luminance(facts.bodyBackground) > 0.8, facts.bodyBackground);
  const first = await settledState(page, 'pp-news-modal');
  check(`${tag} : la fenêtre des nouveautés s'ouvre toute seule, au premier écran, entière dans 700x400, sans défilement de la page`, !!first && first.index === 0 && first.inside && !first.pageScrolls && first.title === texts.h1, first && { index: first.index, inside: first.inside, box: first.box, pageScrolls: first.pageScrolls, title: first.title });
  const windowContrast = await contrastOf(page, ['#pp-news-modal h3', '#pp-news-modal .pp-news-name', '#pp-news-modal .pp-news-text', '#pp-news-modal .var-modal-actions .var-modal-primary']);
  check(`${tag} : le texte de la fenêtre se lit (>= 4,5:1)`, windowContrast.every(item => item.ratio >= 4.5), windowContrast);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${tag}-ouverte.png`) });

  // 2. Le tour complet (français clair et anglais sombre).
  if (full) {
    const carouselEnd = await tour(page, tag + ' carrousel', 'pp-news-modal', 11, texts);
    const linkClicked = await mouseClick(page, '#pp-news-modal .pp-news-link');
    check(`${tag} : « ${texts.detail} » (dernier écran) se clique à la vraie souris`, !!linkClicked && linkClicked.reachable, linkClicked);
    const detailOpen = await isOpen(page, 'pp-export-news-modal');
    check(`${tag} : « ${texts.exportTitle} » s'ouvre par-dessus le carrousel`, detailOpen && (await isOpen(page, 'pp-news-modal')) && (await windowState(page, 'pp-export-news-modal')).title === texts.exportTitle);
    const detailEnd = await tour(page, tag + ' en détail', 'pp-export-news-modal', 5, texts);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${tag}-en-detail-dernier.png`) });
    check(`${tag} : le dernier écran de « ${texts.exportTitle} » est atteint`, !!detailEnd && detailEnd.index === 4);
    const closeDetail = await clickWindowButton(page, 'pp-export-news-modal', texts.close);
    check(`${tag} : « ${texts.close} » ferme « ${texts.exportTitle} » et rend le carrousel, resté à son dernier écran`, !!closeDetail && !(await isOpen(page, 'pp-export-news-modal')) && ((await windowState(page, 'pp-news-modal')) || {}).index === 10, closeDetail);
    check(`${tag} : le carrousel avait bien 11 écrans, le dernier est celui des habitudes`, !!carouselEnd && carouselEnd.index === 10 && carouselEnd.count === 11);
  }

  // 3. Fermer : la page reste.
  const closeClick = await clickWindowButton(page, 'pp-news-modal', texts.close);
  check(`${tag} : « ${texts.close} » ferme la fenêtre à la vraie souris`, !!closeClick && !(await isOpen(page, 'pp-news-modal')), closeClick);
  await sleep(300);
  facts = await pageFacts(page);
  check(`${tag} : la page reste, dit « ${texts.done} », et le focus est sur « ${texts.again} »`, facts.doneVisible && facts.focus === 'news-page-again', { doneVisible: facts.doneVisible, focus: facts.focus });
  const pageContrast = await contrastOf(page, ['#news-page-title', '#news-page-lead', '#news-page-done', '#news-page-again']);
  check(`${tag} : le texte de la page se lit (>= 4,5:1)`, pageContrast.every(item => item.ratio >= 4.5), pageContrast);
  const shape = await page.evaluate(() => { const r = document.querySelector('.news-page').getBoundingClientRect(); return { inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, scrolls: document.scrollingElement.scrollHeight > innerHeight + 1 }; });
  check(`${tag} : la page seule tient dans 700x400 sans défilement`, shape.inside && !shape.scrolls, shape);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${tag}-fermee.png`) });

  // 4. Rouvrir : la souris, puis Échap et Entrée au clavier.
  const again = await mouseClick(page, '#news-page-again');
  const reopened = await settledState(page, 'pp-news-modal');
  check(`${tag} : un vrai clic sur « ${texts.again} » rouvre la fenêtre au premier écran`, !!again && again.reachable && !!reopened && reopened.index === 0, reopened && reopened.index);
  await page.keyboard.press('Escape');
  await sleep(350);
  check(`${tag} : Échap la ferme et rend le focus au bouton`, !(await isOpen(page, 'pp-news-modal')) && (await pageFacts(page)).focus === 'news-page-again');
  await page.keyboard.press('Enter');
  await sleep(350);
  check(`${tag} : Entrée (au clavier) la rouvre`, await isOpen(page, 'pp-news-modal'));
  await page.keyboard.press('Escape');
  await sleep(350);

  // 5. Toutes les réponses viennent de la même adresse, en 200 ; aucune erreur, aucune violation (avant la manœuvre de l'étape suivante, qui en provoque deux exprès).
  facts = await pageFacts(page);
  const foreign = log.responses.filter(r => new URL(r.url).origin !== BASE);
  const bad = log.responses.filter(r => r.status !== 200);
  check(`${tag} : ${log.responses.length} réponses, toutes de la même adresse et en 200`, log.responses.length > 20 && foreign.length === 0 && bad.length === 0, { foreign: foreign.slice(0, 3), bad: bad.slice(0, 3) });
  check(`${tag} : aucune requête ratée, aucune erreur de page ni de console`, log.failed.length === 0 && log.errors.length === 0, { failed: log.failed, errors: log.errors });
  check(`${tag} : aucune violation de la politique de sécurité`, facts.csp.length === 0, facts.csp);

  // 6. La politique est en vigueur : un script en ligne ne s'exécute pas, une connexion est refusée (sans cela, ce qui précède ne prouverait rien : une page qui ignorerait sa politique passerait aussi).
  const before = facts.csp.length;
  const probe = await page.evaluate(async () => {
    const script = document.createElement('script');
    script.textContent = 'window.__inline = 1;';
    document.head.append(script);
    let connection = 'passée';
    try { await fetch(location.href); } catch (e) { connection = 'refusée'; }
    return { inline: window.__inline === 1 ? 'exécuté' : 'bloqué', connection };
  });
  await sleep(200);
  const after = (await pageFacts(page)).csp;
  check(`${tag} : la politique de sécurité est en vigueur (script en ligne bloqué, connexion refusée)`, probe.inline === 'bloqué' && probe.connection === 'refusée' && after.length >= before + 2, { probe, before, after: after.slice(before) });

  // 7. Rien n'est retenu de la personne : le stockage est tel qu'il était.
  check(`${tag} : le stockage est tel qu'il était (pp_theme et pp_lang lus, jamais écrits ; pas de pp_news_seen), aucun cookie`, JSON.stringify(facts.storage) === JSON.stringify(stored) && facts.session.length === 0 && facts.cookie === '', { storage: facts.storage, stored, session: facts.session, cookie: facts.cookie });
  await context.close();
}

// La langue : celle de l'adresse passe avant celle que le widget a gardée ; une langue inconnue laisse la gardée.
async function langues() {
  for (const [query, stored, expected, why] of [
    ['?lang=fr', { pp_lang: 'en' }, 'fr', "l'adresse (?lang=fr) passe avant l'anglais gardé par le widget"],
    ['?lang=en', { pp_lang: 'fr' }, 'en', "l'adresse (?lang=en) passe avant le français gardé par le widget"],
    ['?lang=de', { pp_lang: 'en' }, 'en', 'une langue inconnue (?lang=de) laisse celle que le widget a gardée'],
  ]) {
    const { context, page, log } = await openPage({ query, stored });
    const facts = await pageFacts(page);
    check(`langue : ${why}`, facts.h1 === TEXTS[expected].h1 && facts.title === TEXTS[expected].title && log.errors.length === 0 && JSON.stringify(facts.storage) === JSON.stringify(stored), { h1: facts.h1, title: facts.title, errors: log.errors, storage: facts.storage });
    await context.close();
  }
}

// Une manœuvre qui plante (un élément qui manque, le navigateur qui ne répond plus) est une ligne rouge : le bilan s'écrit quand même et la sortie est en échec.
async function sansPlanter(name, manoeuvre) {
  try { await manoeuvre(); } catch (e) { check(`${name} : la manœuvre va jusqu'au bout`, false, String((e && e.message) || e).split('\n')[0]); }
}
await sansPlanter('français clair', () => run({ id: 'français clair', lang: 'fr', scheme: 'light', full: true }));
await sansPlanter('anglais sombre', () => run({ id: 'anglais sombre', lang: 'en', scheme: 'dark', full: true }));
await sansPlanter('français, sombre choisi dans le widget', () => run({ id: 'français, sombre choisi dans le widget', lang: 'fr', scheme: 'light', stored: { pp_theme: 'dark' }, expectTheme: 'dark' }));
await sansPlanter('anglais, clair choisi dans le widget', () => run({ id: 'anglais, clair choisi dans le widget', lang: 'en', scheme: 'dark', stored: { pp_theme: 'light' }, expectTheme: 'light' }));
await sansPlanter('langue', langues);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
