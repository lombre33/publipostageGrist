#!/usr/bin/env node
// Bulle #Table.Colonne dont le lien ne trouve aucune ligne pour la ligne sélectionnée (consigne 062 de GFS : js/variables.js `scanLinkMisses`, js/editor.js, bouton « Lien… » de la barre flottante,
// js/floating-toolbars.js), à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en clair, en sombre et en anglais :
// les scénarios de dev-tests/scenarios-link-miss.js tournent DANS la page (dispatchEvent, horloge de la page), ils ne prouvent ni qu'un vrai clic atteint le bouton « Lien… » dans une barre qui
// s'élargit d'un mot, ni que la fenêtre de liaison garde son aperçu (une phrase de trois lignes) et ses boutons visibles dans un panneau bas, ni que la frappe au clavier ne lance aucune lecture.
//  - page au repos : la bulle prend l'orange de « lien à refaire » (la même couleur qu'une bulle sans lien), l'info-bulle dit la phrase qui nomme la colonne que la Référence montre ;
//  - un vrai clic sur la bulle orange : la barre montre « Lien… » (atteignable, au premier plan, la barre entière dans le panneau) ; sur une bulle bleue ou sans lien le bouton n'y est pas ;
//  - un vrai clic sur « Lien… » : la fenêtre de liaison s'ouvre entière dans 700x400 et son aperçu dit LA MÊME phrase que l'info-bulle ;
//  - « Acronyme » choisi à la vraie souris dans la liste de droite : l'aperçu devient vert, Valider enregistre la règle, la bulle redevient bleue, « Lien… » disparaît de la barre ;
//  - la règle fautive remise, une frappe réelle dans le document : aucune lecture de la table liée pendant la frappe, une seule 600 ms après, la bulle ne clignote pas ;
//  - en anglais (page qui démarre en anglais) : « Link… », la phrase anglaise, la barre et la fenêtre tiennent dans le panneau.
// Lancé par run-headless.mjs (groupe Node "linkMissMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-link-miss-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.LINK_MISS_MOUSE_PORT || 8897);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-var-toolbar-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-link-miss-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
const pageErrors = [];
const nativeDialogs = [];
let page = null;

// Une page du widget sur le faux Grist, prête à servir ; `lang: 'en'` : le navigateur se dit anglais avant le chargement (dev-tests/grist-stub.js lit window.__browserLanguages) -
// la barre flottante se construit alors en anglais, comme dans un widget qui démarre en anglais (le changement de langue recharge la page).
async function openPage(lang) {
  const p = await context.newPage();
  p.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  p.on('dialog', async d => { nativeDialogs.push(d.type() + ': ' + d.message()); await d.dismiss(); });
  if (OFFLINE) {
    await p.route('**://esm.sh/**', async route => {
      const url = route.request().url();
      const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
      if (chunk) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
      const spec = Object.keys(esmMap).find(k => url === `https://esm.sh/${k}` || url === `https://esm.sh/*${k}` || url.startsWith(`https://esm.sh/${k}@`) || url.startsWith(`https://esm.sh/*${k}@`));
      if (!spec) return route.fulfill({ status: 404, body: `// pas de miroir local pour ${url}` });
      route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(ROOT, esmMap[spec].replace(/^\//, '')), 'utf8')) });
    });
    for (const [re, rel] of UMD_ROUTES) {
      await p.route(re, async route => route.fulfill({
        status: 200, contentType: 'text/javascript; charset=utf-8',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: await readFile(join(CACHE, rel), 'utf8'),
      }));
    }
    await p.addInitScript(() => {
      Object.defineProperty(HTMLScriptElement.prototype, 'integrity', { configurable: true, get: () => '', set: () => {} });
    });
    await p.route('**://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await p.route('**://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
  }
  if (lang === 'en') await p.addInitScript(() => { window.__browserLanguages = ['en-US', 'en']; });
  await p.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await p.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  return p;
}

// Les mêmes données que dev-tests/scenarios-link-miss.js : la page LmEnvois a deux Références vers LmProjets (Projet montre l'acronyme, Modele montre le nom) ; la règle du porteur compare la
// colonne Projet de LmProjets à la Référence Projet, qui montre Acronyme : elle ne trouve rien. LmOrphelins n'a aucune règle : sa bulle est la « lien à refaire » de toujours.
const PAGE_TABLE = 'LmEnvois';
const TARGET = 'LmProjets';
const ORPHAN = 'LmOrphelins';
const LONG = 'Innovation au Coeur des Services';
const BADGE = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;
const DOC = `<p>Projet ${BADGE(TARGET, 'Projet')} sigle ${BADGE(TARGET, 'Acronyme')} sans lien ${BADGE(ORPHAN, 'Nom')} titre ${BADGE(PAGE_TABLE, 'Titre')} </p>`;
const SENTENCE = {
  fr: 'La colonne « Projet » de « LmEnvois » est une Référence qui montre la colonne « Acronyme » de « LmProjets », mais la règle la compare à la colonne « Projet ». Comparez plutôt « Acronyme » ou « Auto » (la ligne désignée).',
  en: 'Column “Projet” of “LmEnvois” is a Reference that shows column “Acronyme” of “LmProjets”, but the rule compares it to column “Projet”. Compare “Acronyme” or “Auto” (the row it points to) instead.',
};
// Le texte du bouton « Lien… » dans la barre (info-bulle et nom accessible).
const BAR_HINT = {
  fr: 'Le lien de cette variable ne trouve aucune ligne pour la ligne sélectionnée : revoir le lien…',
  en: 'This variable’s link finds no row for the selected row: review the link…',
};

async function seed() {
  await page.evaluate(async ({ PAGE_TABLE, TARGET, ORPHAN, LONG }) => {
    const stub = window.__gristStub;
    stub.setVariables(TARGET, { Projet: 'Text', Acronyme: 'Text', Budget: 'Numeric' });
    stub.setVariables(ORPHAN, { Nom: 'Text' });
    stub.setVariables(PAGE_TABLE, {
      Titre: 'Text', Libelle: 'Text', Projet: 'Ref:' + TARGET, Modele: 'Ref:' + TARGET, gristHelper_Display: 'Text', gristHelper_Display2: 'Text',
    }, null, { Projet: 'gristHelper_Display', Modele: 'gristHelper_Display2' }, { Projet: 'Acronyme', Modele: 'Projet' });
    stub.setRows(TARGET, [{ id: 1, Projet: LONG, Acronyme: 'ICS', Budget: 100 }, { id: 2, Projet: 'Mobilité douce', Acronyme: 'MD', Budget: 50 }]);
    stub.setRows(ORPHAN, [{ id: 1, Nom: 'Sans lien' }]);
    stub.setRows(PAGE_TABLE, [
      { id: 1, Titre: 'Envoi 1', Libelle: LONG, Projet: 1, Modele: 1, gristHelper_Display: 'ICS', gristHelper_Display2: LONG },
      { id: 2, Titre: 'Envoi 2', Libelle: '', Projet: 0, Modele: 0, gristHelper_Display: '', gristHelper_Display2: '' },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule(TARGET);
    await GristAPI.deleteLinkRule(ORPHAN);
    await GristAPI.saveLinkRule(TARGET, { mode: 'match', colonneCible: 'Projet', colonneSource: 'Projet' });
    stub.fireRecord({ id: 1, Titre: 'Envoi 1', Libelle: LONG, Projet: 'ICS', Modele: LONG }, PAGE_TABLE);
    // La ligne et la règle sont les mêmes qu'au parcours d'avant : le verdict d'alors resterait affiché, il est oublié pour que le parcours reparte de l'affichage.
    Variables.forgetLinkMisses();
  }, { PAGE_TABLE, TARGET, ORPHAN, LONG });
  await page.waitForTimeout(100);
}

const SHOTS = process.env.LINK_MISS_SHOTS || '';
async function shot(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

// Centre d'un élément, entièrement dans le panneau ?, au premier plan (un contrôle recouvert par autre chose ne recevrait pas le clic) ?
async function hitTest(selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height,
      inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}
// Vrai geste : la souris arrive à quelques pixels du centre puis le rejoint en trois pas (survol compris), puis clique. Le premier saut est direct : partie du coin de la page, la souris
// survolerait les menus de la barre d'outils en chemin et l'un d'eux s'ouvrirait par-dessus la bulle.
async function realMove(box) {
  await page.mouse.move(box.x - 12, box.y);
  await page.mouse.move(box.x, box.y, { steps: 3 });
}
async function realClick(box) {
  await realMove(box);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(200);
}
const clickSel = async selector => { const b = await hitTest(selector); if (b.found) await realClick(b); return b; };

const BAR = '.v2-varfmt-toolbar.visible';
const LINK_BUTTON = `${BAR} button[data-action="var-link"]`;
const MODAL = '#link-config-modal';
const bubble = key => `.tiptap .var-badge[data-key="${key}"]`;
const PROJET = bubble(`${TARGET}.Projet`);
const ACRONYME = bubble(`${TARGET}.Acronyme`);
const ORPHELIN = bubble(`${ORPHAN}.Nom`);
const TITRE = bubble(`${PAGE_TABLE}.Titre`);

// Ce que la personne voit d'une bulle : orange (« lien à refaire »), rouge ou bleue, son info-bulle, ses couleurs réelles.
const look = selector => page.evaluate(sel => {
  const b = document.querySelector(sel);
  if (!b) return { missing: true, orange: false, red: false, title: '', paint: '' };
  const style = getComputedStyle(b);
  return {
    orange: b.classList.contains('var-badge-unlinked'), red: b.classList.contains('var-badge-broken'), title: b.title,
    paint: [style.backgroundColor, style.color, style.borderTopColor, style.borderBottomColor, style.boxShadow].join(' | '),
  };
}, selector);
// La barre : ouverte ?, entière dans le panneau ?, le bouton « Lien… » (a-t-il une boîte ?, son texte, son info-bulle).
const barState = () => page.evaluate(() => {
  const bar = document.querySelector('.v2-varfmt-toolbar');
  const r = bar.getBoundingClientRect();
  const link = bar.querySelector('button[data-action="var-link"]');
  const column = bar.querySelector('button[data-action="var-column"]');
  const shown = Array.from(bar.querySelectorAll('button')).filter(b => b.getClientRects().length > 0);
  const out = shown.filter(b => { const br = b.getBoundingClientRect(); return br.left < 0 || br.right > innerWidth + 0.5 || br.top < 0 || br.bottom > innerHeight + 0.5; }).map(b => b.dataset.action);
  return {
    visible: bar.classList.contains('visible'), left: r.left, right: r.right, top: r.top, bottom: r.bottom, outside: out,
    link: !!link && link.getClientRects().length > 0, linkLabel: link ? link.textContent.trim() : null, linkTitle: link ? link.title : null, linkAria: link ? link.getAttribute('aria-label') : null,
    column: !!column && column.getClientRects().length > 0,
  };
});
const windowState = () => page.evaluate(() => {
  const overlay = document.getElementById('link-config-modal');
  if (!overlay) return { shown: false };
  const box = overlay.querySelector('.pp-modal-box') || overlay.querySelector('.modal-content');
  const body = overlay.querySelector('.pp-modal-body');
  const r = box.getBoundingClientRect();
  const preview = document.getElementById('link-config-preview');
  const p = preview.getBoundingClientRect();
  return {
    shown: overlay.style.display !== 'none' && r.width > 0,
    left: r.left, right: r.right, top: r.top, bottom: r.bottom, overflowX: box.scrollWidth - box.clientWidth, bodyOverflowX: body ? body.scrollWidth - body.clientWidth : 0,
    scrolls: body ? body.scrollHeight > body.clientHeight + 1 : false,
    preview: preview.textContent, good: preview.classList.contains('is-good'), previewTop: p.top, previewBottom: p.bottom, previewInViewport: p.top >= 0 && p.bottom <= innerHeight + 0.5,
    source: document.getElementById('link-config-col-source').value, cible: document.getElementById('link-config-col-cible').value,
  };
});
const ruleOf = () => page.evaluate(table => { const r = GristAPI.getLinkRule(table); return r ? [r.mode, r.colonneCible, r.colonneSource] : null; }, TARGET);
// Attend l'orange d'une bulle (la lecture part page au repos : 600 ms après la dernière demande) ; faux si rien ne vient.
async function waitOrange(selector, ms) {
  try { await page.waitForFunction(sel => { const b = document.querySelector(sel); return !!b && b.classList.contains('var-badge-unlinked'); }, selector, { timeout: ms || 6000 }); return true; } catch { return false; }
}
async function settleReads() {
  await page.waitForFunction(() => { const t = Array.from(new Set(Array.from(document.querySelectorAll('.tiptap span.var-badge')).map(b => b.dataset.table))); return !Variables.linkMissesStale(t); }, null, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(150);
}
// Choisit une colonne dans la liste de droite de la fenêtre comme une personne : clic sur le champ, clic sur la ligne au nom exact (le <select> est masqué par la liste avec recherche).
async function pickRight(name) {
  const field = await hitTest(`${MODAL} .link-config-bridge-col:last-child .ss-trigger`);
  if (!field.found) return false;
  await realClick(field);
  const row = await page.evaluate(wanted => {
    const panel = Array.from(document.querySelectorAll('#link-config-modal .ss-panel')).find(p => !p.hidden);
    const li = panel && Array.from(panel.querySelectorAll('.ss-option')).find(r => r.querySelector('.ss-name').textContent === wanted);
    if (!li) return null;
    const r = li.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, name);
  if (!row) return false;
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(250);
  return true;
}

async function run(theme) {
  const T = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Bulle sans ligne trouvée à la vraie souris, ${WIDTH}x${HEIGHT}, thème ${T} ===`);
  await seed();
  await page.evaluate(doc => { Editor.setHTML(doc); }, DOC);
  await page.waitForTimeout(150);

  // 1) Juste après l'affichage : rien n'est encore lu, les bulles sont bleues ; une fois la page au repos : orange avec la phrase.
  const first = { projet: await look(PROJET), acronyme: await look(ACRONYME) };
  check(`${T} - juste après l'affichage du modèle, rien n'est encore lu : les bulles de ${TARGET} sont bleues, sans info-bulle`,
    first.projet && first.acronyme && !first.projet.orange && !first.acronyme.orange && !first.projet.title && !first.acronyme.title, first);
  check(`${T} - page au repos, la bulle Projet (la règle compare Projet alors que la Référence montre Acronyme) prend l'orange`, await waitOrange(PROJET));
  await settleReads();
  const projet = await look(PROJET);
  const acronyme = await look(ACRONYME);
  const orphelin = await look(ORPHELIN);
  const titre = await look(TITRE);
  check(`${T} - les deux bulles de ${TARGET} sont orange avec la phrase d'aide qui nomme la colonne montrée par la Référence ; la bulle sans lien et celle de la page gardent leur état`,
    projet.orange && acronyme.orange && projet.title === SENTENCE.fr && acronyme.title === SENTENCE.fr && orphelin.orange && orphelin.title !== SENTENCE.fr && !!orphelin.title && !titre.orange && !titre.title, { projet, acronyme, orphelin, titre });
  check(`${T} - c'est l'orange de « lien à refaire » : mêmes couleurs que la bulle sans lien, autres que la bulle bleue`, projet.paint === orphelin.paint && projet.paint !== titre.paint, { projet: projet.paint, orphelin: orphelin.paint, titre: titre.paint });
  await shot(`${theme}-1-orange`);

  // 2) Survol réel : c'est bien la bulle qui reçoit le pointeur, avec la phrase en info-bulle (l'info-bulle native d'un navigateur ne se capture pas : on lit le titre sous le pointeur).
  const over = await hitTest(PROJET);
  await realMove(over);
  const hovered = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); const b = el && el.closest('.var-badge'); return b ? { key: b.dataset.key, title: b.title } : null; }, over);
  check(`${T} - le pointeur sur la bulle orange : sous la souris, la bulle Projet avec la phrase en info-bulle`, !!hovered && hovered.key === `${TARGET}.Projet` && hovered.title === SENTENCE.fr, hovered);

  // 3) Un vrai clic sur la bulle orange : la barre, avec « Lien… » ; sur la bulle bleue et sur la bulle sans lien, pas de « Lien… ».
  const badge = await clickSel(PROJET);
  check(`${T} - la bulle orange se trouve et se clique`, badge.found && badge.inViewport && badge.onTop, badge);
  const bar = await barState();
  const button = await hitTest(LINK_BUTTON);
  check(`${T} - clic sur la bulle : barre ouverte, entière dans le panneau, avec son bouton « Lien… » (texte, info-bulle et nom accessible dits)`,
    bar.visible && bar.left >= 0 && bar.right <= WIDTH + 0.5 && bar.top >= 0 && bar.outside.length === 0 && bar.link && bar.linkLabel === 'Lien…'
    && bar.linkTitle === BAR_HINT.fr && bar.linkAria === bar.linkTitle, bar);
  check(`${T} - « Lien… » est dans le panneau, au premier plan et assez grand pour un vrai clic (au moins 24 px de haut)`, button.found && button.inViewport && button.onTop && button.h >= 24 && button.w >= 24, button);
  await shot(`${theme}-2-barre`);
  await clickSel(TITRE);
  const onBlue = await barState();
  await clickSel(ORPHELIN);
  const onUnlinked = await barState();
  check(`${T} - sur une bulle bleue la barre n'a pas « Lien… » ; sur la bulle sans lien non plus (elle garde « Colonne… »)`, onBlue.visible && !onBlue.link && onUnlinked.visible && !onUnlinked.link && onUnlinked.column, { onBlue, onUnlinked });

  // 4) Un vrai clic sur « Lien… » : la fenêtre de liaison, entière dans le panneau, avec LA MÊME phrase en aperçu.
  await clickSel(PROJET);
  const open = await clickSel(LINK_BUTTON);
  await page.waitForTimeout(350);
  const win = await windowState();
  check(`${T} - vrai clic sur « Lien… » : la fenêtre de liaison s'ouvre, entière dans le panneau, sans défilement horizontal`,
    open.found && win.shown && win.left >= 0 && win.right <= WIDTH + 0.5 && win.top >= 0 && win.bottom <= HEIGHT + 0.5 && win.overflowX <= 1 && win.bodyOverflowX <= 1, win);
  check(`${T} - la règle du porteur est là (Projet = Projet) et l'aperçu dit LA MÊME phrase que l'info-bulle, en rouge de l'aperçu (pas « is-good »)`, win.source === 'Projet' && win.cible === 'Projet' && win.preview === SENTENCE.fr && !win.good, win);
  const confirm = await hitTest('#link-config-confirm');
  const cancel = await hitTest('#link-config-cancel');
  check(`${T} - Valider et Annuler sont visibles, au premier plan ; la phrase de l'aperçu est entière à l'écran (${Math.round(win.previewBottom - win.previewTop)} px de haut)`,
    [confirm, cancel].every(b => b.found && b.inViewport && b.onTop) && win.previewInViewport, { confirm, cancel, win });
  await shot(`${theme}-3-fenetre`);

  // 5) « Acronyme » choisi à la vraie souris : l'aperçu devient vert ; Valider enregistre la règle ; la bulle redevient bleue, « Lien… » disparaît.
  check(`${T} - « Acronyme » se choisit à la vraie souris dans la liste de droite`, await pickRight('Acronyme'));
  const withAcronym = await windowState();
  const found = await page.evaluate(table => I18n.t('linkConfig.previewMatches', { count: 1, table, ids: '1' }), TARGET);
  check(`${T} - avec Acronyme l'aperçu trouve la ligne désignée et passe au vert`, withAcronym.cible === 'Acronyme' && withAcronym.good && withAcronym.preview === found, { withAcronym, found });
  await shot(`${theme}-4-acronyme`);
  await clickSel('#link-config-confirm');
  await page.waitForTimeout(500);
  const saved = await windowState();
  const rule = await ruleOf();
  const bluer = { projet: await look(PROJET), acronyme: await look(ACRONYME) };
  check(`${T} - vrai clic sur Valider : la fenêtre se ferme, la règle enregistrée compare Acronyme, les deux bulles sont bleues, sans info-bulle`,
    !saved.shown && JSON.stringify(rule) === JSON.stringify(['match', 'Acronyme', 'Projet']) && !bluer.projet.orange && !bluer.acronyme.orange && !bluer.projet.title && !bluer.acronyme.title, { saved, rule, bluer });
  await settleReads();
  const later = { projet: await look(PROJET), acronyme: await look(ACRONYME) };
  await clickSel(PROJET);
  const afterBar = await barState();
  check(`${T} - après la relecture les bulles restent bleues et la barre n'a plus « Lien… »`, !later.projet.orange && !later.acronyme.orange && afterBar.visible && !afterBar.link, { later, afterBar });
  await shot(`${theme}-5-bleu`);

  // 6) La règle fautive remise PROPREMENT (la fenêtre a enregistré une règle de la paire, qui prime sur une règle commune : on retire tout, comme le décor), le modèle posé de nouveau et,
  // tout de suite, dix lettres tapées au vrai clavier (plus longtemps que les 600 ms du repos) : aucune lecture de la table liée pendant la frappe, une seule après, et la bulle - bleue
  // à l'affichage - passe à l'orange UNE fois, sans clignoter.
  await page.evaluate(async TARGET => {
    await GristAPI.deleteLinkRule(TARGET);
    await GristAPI.saveLinkRule(TARGET, { mode: 'match', colonneCible: 'Projet', colonneSource: 'Projet' });
  }, TARGET);
  await page.evaluate(doc => { Editor.setHTML(doc); }, DOC);
  // La passe du schéma de setHTML (elle relit la structure des tables) est finie, la lecture du repos n'est pas encore partie : on compte à partir de là.
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const api = window.grist.docApi;
    const real = api.fetchTable;
    const log = window.__linkMissReads = { counts: {}, seen: [] };
    api.fetchTable = function (table, ...rest) { log.counts[table] = (log.counts[table] || 0) + 1; return real.call(this, table, ...rest); };
    log.restore = () => { api.fetchTable = real; };
    // L'état de la bulle Projet à chaque changement du modèle : absente, bleue ou orange.
    const stateOf = () => { const b = document.querySelector('.tiptap .var-badge[data-key="LmProjets.Projet"]'); return !b ? 'absente' : b.classList.contains('var-badge-unlinked') ? 'orange' : 'bleue'; };
    log.seen.push(stateOf());
    log.observer = new MutationObserver(() => { const now = stateOf(); if (log.seen[log.seen.length - 1] !== now) log.seen.push(now); });
    log.observer.observe(document.querySelector('.tiptap'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    // Le verdict d'avant est oublié, la lecture est à refaire une fois la page au repos.
    Editor.refreshLinkState();
  });
  await page.focus('.tiptap');
  await page.keyboard.press('Control+End');
  for (const ch of 'merci bien') { await page.keyboard.type(ch); await page.waitForTimeout(90); }
  const duringTyping = await page.evaluate(() => ({ counts: Object.assign({}, window.__linkMissReads.counts), seen: window.__linkMissReads.seen.slice() }));
  await waitOrange(PROJET);
  await settleReads();
  await page.waitForTimeout(900);
  const afterTyping = await page.evaluate(() => { const r = window.__linkMissReads; r.observer.disconnect(); r.restore(); return { counts: Object.assign({}, r.counts), seen: r.seen.slice() }; });
  const typed = await page.evaluate(() => EditorCore.getEditor().getText().indexOf('merci bien') !== -1);
  const afterLook = await look(PROJET);
  check(`${T} - dix lettres tapées au vrai clavier, tout de suite après l'affichage : le texte est dans le document, aucune lecture de ${TARGET} pendant la frappe, la bulle n'est pas encore orange`,
    typed && !duringTyping.counts[TARGET] && !duringTyping.seen.includes('orange'), { typed, duringTyping });
  const firstOrange = afterTyping.seen.indexOf('orange');
  check(`${T} - une seule lecture de ${TARGET} une fois la frappe finie ; la bulle passe à l'orange une fois et n'en revient plus (jamais de clignotement)`,
    afterTyping.counts[TARGET] === 1 && firstOrange !== -1 && afterTyping.seen.slice(firstOrange).every(state => state === 'orange'), afterTyping);
  check(`${T} - après la frappe la bulle est orange avec sa phrase, le texte tapé est resté`, afterLook.orange && afterLook.title === SENTENCE.fr && typed, afterLook);
}

async function runEnglish() {
  console.log(`\n=== Bulle sans ligne trouvée en anglais (page qui démarre en anglais), ${WIDTH}x${HEIGHT} ===`);
  await seed();
  await page.evaluate(() => Settings.setTheme('dark'));
  await page.evaluate(doc => { Editor.setHTML(doc); }, DOC);
  check('anglais - page au repos, la bulle Projet prend l\'orange', await waitOrange(PROJET));
  await settleReads();
  const projet = await look(PROJET);
  check('anglais - l\'info-bulle dit la phrase en anglais, qui nomme la colonne que la Référence montre', projet.orange && projet.title === SENTENCE.en, projet);
  await clickSel(PROJET);
  const bar = await barState();
  const button = await hitTest(LINK_BUTTON);
  check('anglais - la barre tient dans le panneau avec son bouton « Link… » (texte, info-bulle et nom accessible en anglais)',
    bar.visible && bar.left >= 0 && bar.right <= WIDTH + 0.5 && bar.outside.length === 0 && bar.link && bar.linkLabel === 'Link…'
    && bar.linkTitle === BAR_HINT.en && bar.linkAria === bar.linkTitle, bar);
  check('anglais - « Link… » est atteignable, au premier plan, assez grand', button.found && button.inViewport && button.onTop && button.h >= 24 && button.w >= 24, button);
  await shot('en-1-barre');
  await realClick(button);
  await page.waitForTimeout(350);
  const win = await windowState();
  check('anglais - la fenêtre de liaison tient dans le panneau, sans défilement horizontal, et son aperçu dit la même phrase', win.shown && win.left >= 0 && win.right <= WIDTH + 0.5 && win.top >= 0 && win.bottom <= HEIGHT + 0.5
    && win.overflowX <= 1 && win.bodyOverflowX <= 1 && win.preview === SENTENCE.en && !win.good, win);
  const confirm = await hitTest('#link-config-confirm');
  const cancel = await hitTest('#link-config-cancel');
  check('anglais - Confirm et Cancel visibles et au premier plan, la phrase entière à l\'écran', [confirm, cancel].every(b => b.found && b.inViewport && b.onTop) && win.previewInViewport, { confirm, cancel, win });
  await shot('en-2-fenetre');
  await clickSel('#link-config-cancel');
  await page.waitForTimeout(300);
  check('anglais - Cancel ferme la fenêtre sans toucher à la règle', !(await windowState()).shown && JSON.stringify(await ruleOf()) === JSON.stringify(['match', 'Projet', 'Projet']), await ruleOf());
}

page = await openPage('fr');
await run('light');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(200);
await run('dark');
await page.close();
page = await openPage('en');
await runEnglish();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
