#!/usr/bin/env node
// Bulle « Calcul » (demande d'Antoine du 2026-10-01 : « variables calculées ») à la VRAIE souris et au VRAI clavier (page.mouse / page.keyboard, Node/Playwright) et à la taille
// du panneau Grist d'Antoine (~700x400), en clair, en sombre puis en anglais. dev-tests/scenarios-var-calc.js vérifie la logique DANS la page (dispatchEvent) ; ici, ce que seuls
// de vrais gestes prouvent :
//  - la ligne « Calcul » de l'onglet Chips de la liste « # » se clique et ouvre la fenêtre ;
//  - la fenêtre tient dans 700x400 : titre, champ, boutons de fonction, résultat et boutons « Insérer » / « Annuler » visibles et au premier plan ;
//  - taper « # » dans le champ ouvre la liste des colonnes DEVANT la fenêtre, Entrée y choisit sans valider la fenêtre, un bouton de fonction écrit « SOMME() » au curseur ;
//  - la bulle posée se clique, sa barre flottante montre « Modifier le calcul » et ses trois boutons sans objet sont GRISÉS AUX PIXELS (un clic dessus n'ouvre rien) ;
//  - « Modifier le calcul » (bouton), le double-clic et Entrée rouvrent la fenêtre sur la formule ; Échap ferme et rend le clavier à l'éditeur ;
//  - dans une case étroite la formule est coupée par « … » sans déborder sur la case voisine ; en Lecture, la bulle devient son résultat ;
//  - le retour visuel d'une bulle CHOISIE (variable, calcul, variable cassée ; demande d'Antoine du 01/10) : un vrai clic change le fond PEINT sur une vraie capture, un clic dans le texte le
//    rend, Ctrl+C sur la bulle choisie puis Ctrl+V plus bas en posent une seconde ;
//  - l'interface en anglais.
// Lancé par run-headless.mjs (groupe Node "calcMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-calc-mouse.mjs
// CALC_SHOTS=<dossier> : enregistre aussi des captures aux moments clés (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.CALC_MOUSE_PORT || 8921);
const WIDTH = 700;
const HEIGHT = 400;
const NBSP = ' ';
const SHOTS = process.env.CALC_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-cond-text-mouse.mjs.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-calc-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

async function openWidget(colorScheme, lang) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  // La langue choisie est lue au démarrage (localStorage `pp_lang`) : la barre flottante d'une bulle est construite une fois, dans la langue du moment.
  if (lang) await page.addInitScript(code => { try { localStorage.setItem('pp_lang', code); } catch (e) { /* sans stockage, la page démarre en français */ } }, lang);
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => { pageErrors.push('boîte inattendue : ' + d.message()); d.accept().catch(() => {}); });
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
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  return { context, page };
}

async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
// Centre d'un élément, entièrement dans le panneau ?, et au premier plan (un contrôle recouvert par autre chose ne recevrait pas le clic) ?
async function hitTest(page, selector) {
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
// Une ligne de liste retrouvée par son texte exact (la liste « # » n'a pas d'identifiant par ligne).
async function hitByText(page, selector, text) {
  return page.evaluate(({ selector, text }) => {
    const el = Array.from(document.querySelectorAll(selector)).find(e => e.textContent.trim() === text);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { found: true, x, y, inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === el || el.contains(top)) };
  }, { selector, text });
}
const seen = box => box.found && box.inViewport && box.onTop;
// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, box) {
  await page.mouse.move(box.x - 6, box.y, { steps: 2 });
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
}
const clickSel = async (page, selector) => { const b = await hitTest(page, selector); if (b.found) await realClick(page, b); return b; };

// « Encre » d'un contrôle sur une VRAIE capture d'écran : écart moyen entre ses pixels et celui de son coin (le fond) - un contrôle grisé, clair ou sombre, y est
// nettement plus faible (même mesure que dev-tests/verify-cond-text-mouse.mjs).
async function ink(page, selector) {
  const b = await hitTest(page, selector);
  if (!b.found || !b.inViewport) return null;
  const png = await page.screenshot({ clip: { x: Math.ceil(b.left), y: Math.ceil(b.top), width: Math.floor(b.w) - 1, height: Math.floor(b.h) - 1 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]);
    return sum / (d.length / 4);
  }, png.toString('base64'));
}

const MODAL = '#pp-calc-modal';
const FIELD = '#pp-calc-formula';
const BAR = '.v2-varfmt-toolbar.visible';
const stored = formula => `<span class="calc-badge" data-formula="${formula.replace(/"/g, '&quot;')}"></span>`;
// Une colonne Référence d'une table liée : ses trois boutons de barre (condition, autres attributs, boucle) sont tous actifs, pour mesurer les mêmes boutons grisés sur un calcul.
const VAR_BADGE = `<span class="var-badge" data-table="CxLignes" data-column="Facture" data-key="CxLignes.Facture"></span>`;
const windowOpen = page => page.evaluate(sel => { const m = document.querySelector(sel); return !!m && m.style.display !== 'none' && m.getClientRects().length > 0; }, MODAL);
const focusPlace = page => page.evaluate(() => {
  const a = document.activeElement;
  if (!a) return 'rien';
  if (a.closest('.tiptap')) return 'editor';
  if (a.closest('#pp-calc-modal')) return a.id || a.tagName;
  return 'ailleurs : ' + (a.id || a.tagName);
});
const calcNodes = page => page.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'calcBadge') out.push(node.attrs.formula); });
  return out;
});
const fieldValue = page => page.evaluate(sel => document.querySelector(sel).value, FIELD);
const statusText = page => page.evaluate(() => document.querySelector('#pp-calc-modal .pp-calc-status').textContent);

// La liste « # » a son propre défilement : sa hauteur est limitée à la place libre autour du curseur, et à 700x400 les dernières lignes de l'onglet Chips passent sous son bord (neuf lignes
// depuis « Nom de l'utilisateur »). Une ligne cachée y est amenée comme le fait l'utilisateur : la molette posée sur la liste, jusqu'à ce qu'elle soit entière sous la souris. Une liste qui
// ne défilerait pas laisserait la ligne cachée après les six tours, et le contrôle qui suit échoue.
async function reachListRow(page, text) {
  let entry = await hitByText(page, '#autocomplete-box .ac-item', text);
  let wheels = 0;
  while (entry.found && !seen(entry) && wheels < 6) {
    const list = await hitTest(page, '#autocomplete-box .ac-items');
    await page.mouse.move(list.x, list.y);
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(120);
    entry = await hitByText(page, '#autocomplete-box .ac-item', text);
    wheels++;
  }
  return { entry, wheels };
}

// La liste « # » vers la ligne « Calcul » de l'onglet Chips, aux vrais clics, à partir du curseur dans un paragraphe vide (un « # » collé à un mot n'ouvre pas la liste).
async function openFromHashList(page, label, calcLabel) {
  const insertButton = await clickSel(page, '#v2-btn-insert-variable');
  await page.waitForTimeout(250);
  const panel = await hitTest(page, '#autocomplete-box');
  const chipsTab = await hitTest(page, '#autocomplete-box .ac-tab[data-tab="chips"]');
  check(`${label} - le bouton « Insérer une variable » et l'onglet Chips de la liste « # » sont atteignables dans le panneau`, seen(insertButton) && panel.found && panel.inViewport && seen(chipsTab), { insertButton, panel, chipsTab });
  if (!chipsTab.found) return false;
  await realClick(page, chipsTab);
  await page.waitForTimeout(150);
  const { entry, wheels } = await reachListRow(page, calcLabel);
  check(`${label} - la ligne « ${calcLabel} » est dans l'onglet Chips, atteignable (à la molette si la liste défile), visible et au premier plan`, seen(entry), { entry, wheels });
  if (seen(entry)) await realClick(page, entry);
  await page.waitForTimeout(300);
  return windowOpen(page);
}

// Mesure la fenêtre ouverte : cadre dans le panneau, et chaque pièce visible et au premier plan.
async function windowBoxes(page) {
  const out = {
    box: await hitTest(page, `${MODAL} .modal-content`),
    title: await hitTest(page, `${MODAL} h3`),
    field: await hitTest(page, FIELD),
    ok: await hitTest(page, `${MODAL} .var-modal-primary`),
    cancel: await hitTest(page, `${MODAL} .var-modal-actions button:not(.var-modal-primary)`),
    status: await hitTest(page, `${MODAL} .pp-calc-status`),
  };
  out.functions = [];
  for (const fn of ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'ROUND']) out.functions.push(await hitTest(page, `${MODAL} .pp-calc-function[data-fn="${fn}"]`));
  out.scroll = await page.evaluate(sel => { const b = document.querySelector(sel + ' .pp-modal-body'); return { over: Math.round(b.scrollHeight - b.clientHeight), top: b.scrollTop }; }, MODAL);
  return out;
}

async function setupDocument(page) {
  await page.evaluate(async ({ badge }) => {
    const stub = window.__gristStub;
    stub.setVariables('CxFactures', { Client: 'Text', HT: 'Numeric' });
    stub.setVariables('CxLignes', { Facture: 'Ref:CxFactures', Libelle: 'Text', Prix: 'Numeric', Qte: 'Int', manualSort: 'ManualSortPos' });
    stub.setRows('CxFactures', [{ id: 1, Client: 'Dupont', HT: 1000 }]);
    stub.setRows('CxLignes', [
      { id: 1, Facture: 1, Libelle: 'Livret', Prix: 1000, Qte: 3, manualSort: 1 },
      { id: 2, Facture: 1, Libelle: 'Envoi', Prix: 100, Qte: 1, manualSort: 2 },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('CxLignes');
    await GristAPI.saveLinkRule('CxLignes', { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Client: 'Dupont', HT: 1000 }, 'CxFactures');
    Editor.setHTML(`<p>Facture : ${badge}</p><p></p>`);
  }, { badge: VAR_BADGE });
  await page.waitForTimeout(400);
}

// Un vrai clic dans le texte, à droite du dernier paragraphe : la bulle sélectionnée est abandonnée, sa barre se ferme (et ne couvre aucune bulle pour la suite).
async function clickAway(page) {
  const spot = await page.evaluate(() => {
    const ps = Array.from(document.querySelectorAll('.tiptap > p'));
    const r = ps[ps.length - 1].getBoundingClientRect();
    return { x: r.right - 20, y: r.top + r.height / 2 };
  });
  await realClick(page, spot);
  await page.waitForTimeout(300);
}

async function endOfLastParagraph(page) {
  const spot = await page.evaluate(() => {
    const ps = Array.from(document.querySelectorAll('.tiptap > p'));
    const r = ps[ps.length - 1].getBoundingClientRect();
    return { x: r.left + 40, y: r.top + r.height / 2 };
  });
  await realClick(page, spot);
}

// Le fond d'une bulle tel qu'il est PEINT : un pixel d'une vraie capture d'écran, dans sa marge gauche (bordure d'un pixel passée, texte pas encore commencé). Ce que l'utilisateur voit,
// pas ce que le CSS déclare ; null si la bulle n'est pas entièrement visible au premier plan (la barre flottante la recouvrirait).
async function backgroundSeen(page, selector) {
  const b = await hitTest(page, selector);
  if (!seen(b)) return null;
  const png = await page.screenshot({ clip: { x: Math.floor(b.left) + 3, y: Math.floor(b.top + b.h / 2), width: 1, height: 1 } });
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
  }, png.toString('base64'));
}
const colourGap = (a, b) => (a && b) ? Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) : null;

// Retour visuel d'une bulle choisie (Antoine, 01/10 : « un mini feedback visuel (changement léger de la couleur de fond ?) pour confirmer que l'on peut copier ») : un vrai clic change le fond
// PEINT de la bulle d'une variable, d'un calcul et d'une variable cassée ; un clic dans le texte lui rend son fond ; Ctrl+C sur la bulle choisie puis Ctrl+V plus bas en posent une seconde.
async function checkChosenFeedback(page, label) {
  const broken = '<span class="var-badge" data-table="CxLignes" data-column="Disparue" data-key="CxLignes.Disparue"></span>';
  await page.evaluate(({ variable, calc, broken }) => {
    Editor.setHTML(`<p>Variable : ${variable}</p><p>Calcul : ${calc}</p><p>Cassée : ${broken}</p><p>Copie : </p>`);
  }, { variable: VAR_BADGE, calc: stored('SUM({CxLignes.Prix} * {CxLignes.Qte})'), broken });
  await page.waitForTimeout(500);
  // La souris quitte le coin (0, 0), au-dessus de la barre d'outils : ses menus au survol s'y ouvriraient et recevraient le clic à la place de la bulle.
  await page.mouse.move(450, 330, { steps: 4 });
  await page.waitForTimeout(500);
  for (const [name, selector] of [['d\'une variable', '.tiptap .var-badge:not(.var-badge-broken)'], ['d\'un calcul', '.tiptap .calc-badge'], ['d\'une variable cassée', '.tiptap .var-badge-broken']]) {
    const plain = await backgroundSeen(page, selector);
    if (!plain) { check(`${label} - la bulle ${name} est visible, entière et au premier plan avant le clic`, false, { selector }); continue; }
    await realClick(page, await hitTest(page, selector));
    await page.waitForTimeout(350);
    const chosen = await backgroundSeen(page, selector);
    const marked = await page.evaluate(sel => document.querySelector(sel).classList.contains('ProseMirror-selectednode'), selector);
    await clickAway(page);
    const released = await backgroundSeen(page, selector);
    check(`${label} - un vrai clic sur la bulle ${name} change son fond à l'écran (écart de 40 au moins sur les trois canaux) ; un clic dans le texte lui rend son fond`,
      marked && colourGap(plain, chosen) >= 40 && colourGap(plain, released) <= 4, { plain, chosen, released, marked });
  }
  await realClick(page, await hitTest(page, '.tiptap .var-badge:not(.var-badge-broken)'));
  await page.waitForTimeout(350);
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(250);
  await clickAway(page);
  await page.keyboard.press('End');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(500);
  const pasted = await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap .var-badge:not(.var-badge-broken)')).map(e => e.dataset.key + '|' + e.className));
  check(`${label} - Ctrl+C sur la bulle choisie puis Ctrl+V plus bas donnent une seconde bulle identique, sans la marque « choisie »`,
    pasted.length === 2 && pasted.every(p => p === 'CxLignes.Facture|var-badge'), pasted);
}

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Bulle « Calcul » à la vraie souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);
  await setupDocument(page);

  // 1) La ligne « Calcul » du menu des variables ouvre la fenêtre.
  await endOfLastParagraph(page);
  const opened = await openFromHashList(page, label, 'Calcul');
  check(`${label} - un vrai clic sur « Calcul » ouvre la fenêtre, rien n'est encore inséré`, opened && (await calcNodes(page)).length === 0, { opened });
  const boxes = await windowBoxes(page);
  check(`${label} - la fenêtre tient dans ${WIDTH}x${HEIGHT} : cadre, titre, champ, résultat, « Insérer » et « Annuler » visibles et au premier plan`,
    boxes.box.found && boxes.box.inViewport && seen(boxes.title) && seen(boxes.field) && seen(boxes.ok) && seen(boxes.cancel) && boxes.status.found && boxes.status.inViewport, boxes);
  check(`${label} - les six boutons de fonction sont atteignables à la souris`, boxes.functions.every(seen), boxes.functions.map(b => [b.found, b.inViewport, b.onTop]));
  check(`${label} - la fenêtre n'a pas besoin de défiler pour montrer champ, fonctions et résultat`, boxes.scroll.over <= 1, boxes.scroll);
  check(`${label} - le focus est dans le champ de la formule`, (await focusPlace(page)) === 'pp-calc-formula', await focusPlace(page));
  await shot(page, `${theme}-1-fenetre`);

  // 2) Le bouton SOMME écrit « SOMME() » au curseur (le focus reste dans le champ), « # » ouvre la liste DEVANT la fenêtre, Entrée y choisit sans valider.
  await clickSel(page, `${MODAL} .pp-calc-function[data-fn="SUM"]`);
  await page.waitForTimeout(100);
  check(`${label} - un vrai clic sur SOMME écrit « SOMME() » dans le champ, curseur entre les parenthèses, focus gardé`,
    (await fieldValue(page)) === 'SOMME()' && (await focusPlace(page)) === 'pp-calc-formula'
      && (await page.evaluate(sel => document.querySelector(sel).selectionStart, FIELD)) === 6, { value: await fieldValue(page), focus: await focusPlace(page) });
  await page.keyboard.type('#CxLignes.Pri');
  await page.waitForTimeout(200);
  const list = await hitTest(page, '#autocomplete-box');
  const firstItem = await hitTest(page, '#autocomplete-box .ac-item');
  const layers = await page.evaluate(sel => ({ box: parseInt(getComputedStyle(document.getElementById('autocomplete-box')).zIndex, 10) || 0, modal: parseInt(getComputedStyle(document.querySelector(sel)).zIndex, 10) || 0 }), MODAL);
  check(`${label} - « # » dans le champ ouvre la liste des colonnes dans le panneau, devant la fenêtre (rien ne la recouvre)`, list.found && list.inViewport && seen(firstItem) && layers.box > layers.modal, { list, firstItem, layers });
  await shot(page, `${theme}-2-liste-colonnes`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  check(`${label} - Entrée choisit la colonne sans valider la fenêtre (elle reste ouverte, rien d'inséré)`,
    (await fieldValue(page)) === 'SOMME(#CxLignes.Prix)' && (await windowOpen(page)) && (await calcNodes(page)).length === 0, { value: await fieldValue(page), open: await windowOpen(page) });
  await page.keyboard.type(' * #CxLignes.Qt');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const sum = await fieldValue(page);
  check(`${label} - frappe et Entrée composent « SOMME(#CxLignes.Prix * #CxLignes.Qte) »`, sum === 'SOMME(#CxLignes.Prix * #CxLignes.Qte)', sum);
  // Le curseur est resté avant la parenthèse fermante : la suite du texte tapée la complète.
  const status = await statusText(page);
  check(`${label} - le résultat de la ligne courante s'affiche sous le champ à la frappe : « 3${NBSP}100 »`, status.includes('3' + NBSP + '100'), status);
  await shot(page, `${theme}-3-resultat`);

  // 3) « Insérer » à la vraie souris : la fenêtre se ferme, la bulle entre, le clavier revient dans l'éditeur.
  await clickSel(page, `${MODAL} .var-modal-primary`);
  await page.waitForTimeout(350);
  const afterInsert = await calcNodes(page);
  check(`${label} - « Insérer » pose la bulle (formule enregistrée neutre), ferme la fenêtre et rend le clavier à l'éditeur`,
    !(await windowOpen(page)) && afterInsert.length === 1 && afterInsert[0] === 'SUM({CxLignes.Prix} * {CxLignes.Qte})' && (await focusPlace(page)) === 'editor', { afterInsert, focus: await focusPlace(page) });
  const bubble = await hitTest(page, '.tiptap .calc-badge');
  const bubbleText = await page.evaluate(() => document.querySelector('.tiptap .calc-badge').textContent);
  check(`${label} - la bulle est visible dans le panneau, au premier plan, et se lit « = SOMME(#CxLignes.Prix × #CxLignes.Qte) »`, seen(bubble) && bubbleText === '= SOMME(#CxLignes.Prix × #CxLignes.Qte)', { bubble, bubbleText });
  await shot(page, `${theme}-4-bulle`);

  // 4) Un vrai clic sur la bulle : barre flottante avec « Modifier le calcul » ; condition, autres attributs et boucle grisés aux pixels ; un clic dessus n'ouvre rien.
  await realClick(page, bubble);
  await page.waitForTimeout(350);
  const bar = await hitTest(page, BAR);
  const edit = await hitTest(page, `${BAR} button[data-action="calc-edit"]`);
  const barButtons = {
    condition: await hitTest(page, `${BAR} button[data-action="var-condition"]`),
    linked: await hitTest(page, `${BAR} button[data-action="var-linked"]`),
    loop: await hitTest(page, `${BAR} button[data-action="var-loop"]`),
  };
  await shot(page, `${theme}-5-bulle-selectionnee-barre`);
  check(`${label} - un vrai clic sur la bulle la sélectionne et ouvre la barre, avec « Modifier le calcul » atteignable dans le panneau`, bar.found && bar.inViewport && seen(edit), { bar, edit });
  check(`${label} - les trois boutons sans objet pour un calcul sont dans la barre (grisés, pas retirés)`, ['condition', 'linked', 'loop'].every(k => barButtons[k].found && barButtons[k].inViewport), barButtons);
  const greyed = { condition: await ink(page, `${BAR} button[data-action="var-condition"]`), linked: await ink(page, `${BAR} button[data-action="var-linked"]`), loop: await ink(page, `${BAR} button[data-action="var-loop"]`) };
  // La même mesure sur une bulle de variable : la barre de la première ne couvre pas la seconde que si on la quitte d'abord par un clic dans le texte.
  await clickAway(page);
  const variableBubble = await hitTest(page, '.tiptap .var-badge');
  await realClick(page, variableBubble);
  await page.waitForTimeout(350);
  const active = { condition: await ink(page, `${BAR} button[data-action="var-condition"]`), linked: await ink(page, `${BAR} button[data-action="var-linked"]`), loop: await ink(page, `${BAR} button[data-action="var-loop"]`) };
  const editHiddenOnVariable = await page.evaluate(sel => { const b = document.querySelector(sel + ' button[data-action="calc-edit"]'); return !b || b.getClientRects().length === 0; }, BAR);
  check(`${label} - condition, autres attributs et boucle sont GRISÉS sur un calcul : moins de 60 % de l'encre des mêmes boutons sur une bulle de variable`,
    ['condition', 'linked', 'loop'].every(k => greyed[k] != null && active[k] != null && greyed[k] < active[k] * 0.6), { greyed, active });
  check(`${label} - sur une bulle de variable, « Modifier le calcul » n'est pas là et les trois boutons sont actifs`, editHiddenOnVariable && ['condition', 'linked', 'loop'].every(k => active[k] > 8), { editHiddenOnVariable, active });
  await clickAway(page);
  await realClick(page, await hitTest(page, '.tiptap .calc-badge'));
  await page.waitForTimeout(350);
  for (const action of ['var-condition', 'var-linked', 'var-loop']) await clickSel(page, `${BAR} button[data-action="${action}"]`);
  await page.waitForTimeout(250);
  const nothingOpened = await page.evaluate(() => Array.from(document.querySelectorAll('.pp-modal')).filter(m => m.style.display !== 'none' && m.getClientRects().length > 0).length);
  check(`${label} - un vrai clic sur chacun des trois boutons grisés n'ouvre aucune fenêtre`, nothingOpened === 0 && !!(await hitTest(page, BAR)).found, { nothingOpened });

  // 5) « Modifier le calcul » : la fenêtre s'ouvre sur la formule, titre et bouton de modification, la barre s'efface ; la nouvelle formule se valide à Entrée.
  await clickSel(page, `${BAR} button[data-action="calc-edit"]`);
  await page.waitForTimeout(350);
  const editState = await page.evaluate(() => ({
    open: document.getElementById('pp-calc-modal').style.display !== 'none',
    title: document.getElementById('pp-calc-title').textContent,
    ok: document.querySelector('#pp-calc-modal .var-modal-primary').textContent,
    barShown: !!document.querySelector('.v2-varfmt-toolbar.visible'),
  }));
  check(`${label} - « Modifier le calcul » ouvre la fenêtre « Modifier le calcul » sur la formule (« Valider »), la barre s'efface`,
    editState.open && editState.title === 'Modifier le calcul' && editState.ok === 'Valider' && !editState.barShown && (await fieldValue(page)) === 'SOMME(#CxLignes.Prix * #CxLignes.Qte)', { editState, value: await fieldValue(page) });
  const editBoxes = await windowBoxes(page);
  check(`${label} - la fenêtre de modification tient aussi dans le panneau, boutons visibles`, editBoxes.box.inViewport && seen(editBoxes.title) && seen(editBoxes.ok) && seen(editBoxes.cancel), editBoxes);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('#CxFactures.H');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  await page.keyboard.type(' * 0,2');
  await page.waitForTimeout(500);
  check(`${label} - la nouvelle formule « #CxFactures.HT * 0,2 » donne « 200 » sous le champ`, (await statusText(page)).includes('200') && (await fieldValue(page)) === '#CxFactures.HT * 0,2', { status: await statusText(page), value: await fieldValue(page) });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  const edited = await calcNodes(page);
  check(`${label} - Entrée valide : la bulle change en place, la fenêtre se ferme, le clavier est dans l'éditeur`, !(await windowOpen(page)) && edited.length === 1 && edited[0] === '{CxFactures.HT} * 0.2' && (await focusPlace(page)) === 'editor', { edited, focus: await focusPlace(page) });

  // 6) Double-clic sur la bulle : la fenêtre se rouvre ; Échap la ferme sans rien changer et rend le clavier ; Entrée sur la bulle sélectionnée la rouvre.
  const again = await hitTest(page, '.tiptap .calc-badge');
  await page.mouse.move(again.x, again.y, { steps: 3 });
  await page.mouse.dblclick(again.x, again.y);
  await page.waitForTimeout(350);
  check(`${label} - un double-clic sur la bulle rouvre la fenêtre sur sa formule`, (await windowOpen(page)) && (await fieldValue(page)) === '#CxFactures.HT * 0,2', { open: await windowOpen(page), value: await fieldValue(page) });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check(`${label} - Échap ferme la fenêtre sans rien changer et rend le clavier à l'éditeur`, !(await windowOpen(page)) && (await focusPlace(page)) === 'editor' && (await calcNodes(page))[0] === '{CxFactures.HT} * 0.2', { focus: await focusPlace(page) });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const viaEnter = await windowOpen(page);
  if (viaEnter) await clickSel(page, `${MODAL} .var-modal-actions button:not(.var-modal-primary)`);
  await page.waitForTimeout(250);
  check(`${label} - Entrée sur la bulle sélectionnée rouvre la fenêtre ; « Annuler » à la souris la ferme et garde la formule`, viaEnter && !(await windowOpen(page)) && (await calcNodes(page))[0] === '{CxFactures.HT} * 0.2', { viaEnter });

  // 6b) Retour visuel d'une bulle choisie : fond PEINT avant / après un vrai clic, retour au fond d'origine, copier-coller.
  await checkChosenFeedback(page, label);

  // 7) Dans une case étroite la formule est coupée par « … », sans déborder ni passer à la ligne ; la case voisine reste en place.
  await page.evaluate(({ long }) => {
    Editor.setHTML(`<table><tbody><tr><td colwidth="120"><p>${long}</p></td><td colwidth="120"><p>Voisine</p></td></tr></tbody></table><p>Total des lignes : ${long.replace(/data-formula="[^"]*"/, 'data-formula="SUM({CxLignes.Prix} * {CxLignes.Qte})"')}</p>`);
  }, { long: stored('{CxFactures.HT} * {CxFactures.HT} / 100 + SUM({CxLignes.Prix} * {CxLignes.Qte})') });
  await page.waitForTimeout(300);
  const narrow = await page.evaluate(() => {
    const cell = document.querySelector('.tiptap td'), next = document.querySelectorAll('.tiptap td')[1];
    const bubble = cell.querySelector('.calc-badge'), head = bubble.querySelector('.calc-badge-head');
    const b = bubble.getBoundingClientRect(), c = cell.getBoundingClientRect();
    return { inside: b.right <= c.right + 1 && b.left >= c.left - 1, oneLine: b.height < (parseFloat(getComputedStyle(bubble).lineHeight) || 16) * 1.8, cut: head.scrollWidth > head.clientWidth, neighbour: next.getBoundingClientRect().left >= c.right - 1, w: Math.round(b.width), cellW: Math.round(c.width) };
  });
  check(`${label} - dans une case de 120 px la bulle tient sur une ligne, coupée par « … », sans déborder sur la case voisine`, narrow.inside && narrow.oneLine && narrow.cut && narrow.neighbour, narrow);
  await shot(page, `${theme}-6-case-etroite`);

  // 8) Lecture : un vrai clic sur Mode lecture, la bulle du paragraphe est devenue son résultat (3 100) ; retour en Édition au clic.
  await realClick(page, await hitTest(page, '#btn-mode-read'));
  await page.waitForFunction(() => document.getElementById('reader-container').style.display === 'block' && !!document.querySelector('#reader-container .reader-content'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const reading = await page.evaluate(() => ({ results: Array.from(document.querySelectorAll('#reader-container .resolved-var')).map(e => e.textContent), calcLeft: document.querySelectorAll('#reader-container .calc-badge').length }));
  check(`${label} - en Lecture, la bulle du paragraphe est remplacée par son résultat (3${NBSP}100) et aucune bulle de calcul ne reste`, reading.results.includes('3' + NBSP + '100') && reading.calcLeft === 0, reading);
  await shot(page, `${theme}-7-lecture`);
  await realClick(page, await hitTest(page, '#btn-mode-edit'));
  await page.waitForTimeout(400);
  check(`${label} - retour en Édition : la bulle est de nouveau une bulle`, (await page.evaluate(() => document.querySelectorAll('.tiptap .calc-badge').length)) === 2, await page.evaluate(() => document.querySelectorAll('.tiptap .calc-badge').length));

  await context.close();
}

async function runEnglish() {
  console.log(`\n=== Bulle « Calcul » en anglais, ${WIDTH}x${HEIGHT} ===`);
  const { context, page } = await openWidget('light', 'en');
  await setupDocument(page);
  await endOfLastParagraph(page);
  const opened = await openFromHashList(page, 'anglais', 'Calculation');
  check('anglais - un vrai clic sur « Calculation » ouvre la fenêtre', opened, { opened });
  const texts = await page.evaluate(() => ({
    title: document.getElementById('pp-calc-title').textContent,
    label: document.querySelector('#pp-calc-modal label').textContent,
    hint: document.getElementById('pp-calc-hint').textContent,
    functions: Array.from(document.querySelectorAll('#pp-calc-modal .pp-calc-function')).map(b => b.textContent),
    buttons: Array.from(document.querySelectorAll('#pp-calc-modal .var-modal-actions button')).map(b => b.textContent),
    status: document.getElementById('pp-calc-status').textContent,
  }));
  const boxes = await windowBoxes(page);
  check('anglais - titre « Insert a calculation », libellé « Formula », boutons « Cancel » / « Insert », fonctions SUM, AVERAGE, MIN, MAX, COUNT, ROUND',
    texts.title === 'Insert a calculation' && texts.label === 'Formula' && JSON.stringify(texts.buttons) === '["Cancel","Insert"]' && JSON.stringify(texts.functions) === '["SUM","AVERAGE","MIN","MAX","COUNT","ROUND"]', texts);
  check('anglais - la fenêtre tient dans le panneau, boutons et fonctions visibles et au premier plan', boxes.box.inViewport && seen(boxes.title) && seen(boxes.ok) && seen(boxes.cancel) && boxes.functions.every(seen), boxes);
  await shot(page, 'en-1-fenetre');
  await page.keyboard.type('SUM(#CxLignes.Pri');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  await page.keyboard.type(' * #CxLignes.Qt');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  await page.keyboard.type(')');
  await page.waitForTimeout(500);
  const status = await statusText(page);
  check('anglais - le résultat s\'écrit à l\'américaine : « Result for the current row: 3,100 »', status === 'Result for the current row: 3,100', status);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  const label = await page.evaluate(() => document.querySelector('.tiptap .calc-badge').textContent);
  check('anglais - la bulle se lit « = SUM(#CxLignes.Prix × #CxLignes.Qte) »', label === '= SUM(#CxLignes.Prix × #CxLignes.Qte)', label);
  await realClick(page, await hitTest(page, '.tiptap .calc-badge'));
  await page.waitForTimeout(350);
  const barTitle = await page.evaluate(sel => { const b = document.querySelector(sel + ' button[data-action="calc-edit"]'); return b ? b.title : null; }, BAR);
  check('anglais - le bouton de la barre s\'appelle « Edit the calculation »', barTitle === 'Edit the calculation', barTitle);
  await context.close();
}

await runTheme('light');
await runTheme('dark');
await runEnglish();

check('aucune erreur JavaScript ni boîte native pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
