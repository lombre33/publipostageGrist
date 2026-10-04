#!/usr/bin/env node
// Bloc de texte conditionnel (demande d'Antoine du 2026-10-01 : « un bloc de texte conditionnel » dans le menu des variables, onglet Chips) à la VRAIE souris
// (page.mouse / page.keyboard, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en thème clair puis sombre. dev-tests/scenarios-cond-text.js
// vérifie la logique DANS la page (dispatchEvent) ; ici, ce que seule une vraie souris prouve : la liste « # » et son onglet Chips atteignables et au premier plan,
// l'entrée « Texte conditionnel » qui se clique, le texte tapé qui va dans le bloc, l'étiquette qui se clique et ouvre la barre des variables (ses deux icônes sans
// objet grisées AUX PIXELS), la fenêtre de condition entière dans le panneau, les blocs emboîtés qui ne se recouvrent pas, un texte sélectionné à la souris qui est
// entouré, puis la Lecture (cadres défaits, bloc masqué quand la ligne ne remplit pas la condition), puis « Défaire le bloc » dans la fenêtre de condition (demande d'Antoine
// du 2026-10-01 : le texte reste, le cadre disparaît) : bouton et ligne de boutons entiers dans le panneau (français et anglais), lisibles, Tab et Maj+Tab qui tournent sur les quatre boutons, vrai clic, curseur au début du texte,
// Ctrl+Z / Ctrl+Y au clavier.
// Lancé par run-headless.mjs (groupe Node "condTextMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-cond-text-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.COND_TEXT_MOUSE_PORT || 8903);
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
if (!OFFLINE) console.log('[verify-cond-text-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

// COND_TEXT_SHOTS=<dossier> : enregistre des captures aux moments clés, à relire à l'œil (comme SAVE_MENU_SHOTS pour le menu Enregistrer).
const SHOTS = process.env.COND_TEXT_SHOTS || '';
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];

async function openWidget(colorScheme) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
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
// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, box) {
  await page.mouse.move(box.x - 6, box.y, { steps: 2 });
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
}
const clickSel = async (page, selector) => { const b = await hitTest(page, selector); if (b.found) await realClick(page, b); return b; };

// « Encre » d'un contrôle sur une VRAIE capture d'écran : écart moyen entre ses pixels et celui de son coin (le fond) - un contrôle grisé, clair ou sombre, y est
// nettement plus faible (même mesure que dev-tests/verify-read-mode-mouse.mjs).
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

// Choisit une colonne dans le champ d'une règle comme une personne : clic sur le champ visible (liste avec recherche, js/search-select.js), frappe du nom, clic sur
// la ligne au nom exact.
async function pickColumn(page, scope, name) {
  const field = await hitTest(page, scope + ' .macro-rule-column-wrap .ss-trigger');
  await realClick(page, field);
  await page.waitForTimeout(120);
  await page.keyboard.type(name);
  await page.waitForTimeout(80);
  const row = await page.evaluate(({ scope, name }) => {
    const found = Array.from(document.querySelectorAll(scope + ' .ss-panel:not([hidden]) .ss-option')).find(r => r.querySelector('.ss-name').textContent === name);
    if (!found) return null;
    const r = found.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { scope, name });
  if (row) await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(150);
  return !!row;
}

const BADGE = (column, extra) => `<span class="var-badge" data-table="CtDossiers" data-column="${column}" data-key="CtDossiers.${column}"${extra || ''}></span>`;
const RECORD_URGENT = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200 };
const RECORD_NORMAL = { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 'Martin Anne', Montant: 50 };

// La ligne de boutons de la fenêtre de condition : où est chaque bouton visible, est-il au premier plan, la ligne déborde-t-elle, sur combien de lignes, quel nœud est sélectionné.
const footerOf = page => page.evaluate(() => {
  const box = document.querySelector('#var-condition-modal .var-modal-content').getBoundingClientRect();
  const actions = document.querySelector('#var-condition-modal .var-modal-actions');
  const buttons = Array.from(actions.querySelectorAll('button')).filter(b => !b.hidden).map(b => {
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { text: b.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, onTop: !!top && (top === b || b.contains(top)), title: b.title };
  });
  const selected = EditorCore.getEditor().state.selection.node;
  return {
    box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, buttons, rowOverflow: actions.scrollWidth - actions.clientWidth, rows: new Set(buttons.map(b => Math.round(b.top))).size,
    selected: selected ? selected.type.name + ':' + JSON.stringify(selected.attrs.condition) : null, tags: Array.from(document.querySelectorAll('.tiptap .conditional-text-tag')).map(t => t.textContent),
  };
});
const inside = f => f.buttons.every(b => b.left >= f.box.left && b.right <= f.box.right && b.top >= f.box.top && b.bottom <= f.box.bottom);
const noOverlap = f => f.buttons.every((b, i) => i === 0 || f.buttons[i - 1].top !== b.top || f.buttons[i - 1].right <= b.left + 0.5);

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Bloc de texte conditionnel à la vraie souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);

  // Données : la table de la page et l'annuaire lié par la colonne Référence Responsable ; une ligne « Urgent » courante, un document de trois paragraphes.
  await page.evaluate(async ({ record, badge }) => {
    const stub = window.__gristStub;
    stub.setVariables('CtAnnuaire', { NomPrenom: 'Text', Telephone: 'Text' });
    stub.setVariables('CtDossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:CtAnnuaire', Montant: 'Numeric' });
    stub.setRows('CtAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44' }, { id: 8, NomPrenom: 'Martin Anne', Telephone: '06 55 66 77 88' }]);
    stub.setRows('CtDossiers', [
      { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7, Montant: 1200 },
      { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 8, Montant: 50 },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.saveLinkRule('CtAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
    stub.fireRecord(record, 'CtDossiers');
    Editor.setHTML('<p>Madame, Monsieur,</p><p>Dossier suivi par ' + badge + '.</p><p>Fin du courrier</p><p></p>');
  }, { record: RECORD_URGENT, badge: BADGE('Responsable') });
  await page.waitForTimeout(400);

  const editorState = () => page.evaluate(() => ({
    html: EditorCore.getEditor().getHTML(),
    blocks: Array.from(document.querySelectorAll('.tiptap .conditional-text')).length,
    selection: window.getSelection().toString(),
  }));

  // 1) Une vraie souris dans le dernier paragraphe (vide), le bouton « Insérer une variable », l'onglet Chips, la ligne « Texte conditionnel ».
  const lastParagraph = await page.evaluate(() => {
    const ps = Array.from(document.querySelectorAll('.tiptap > p'));
    const r = ps[ps.length - 1].getBoundingClientRect();
    return { x: r.left + 40, y: r.top + r.height / 2 };
  });
  await realClick(page, lastParagraph);
  const insertButton = await hitTest(page, '#v2-btn-insert-variable');
  check(`${label} - le bouton « Insérer une variable » est dans le panneau et au premier plan`, insertButton.found && insertButton.inViewport && insertButton.onTop, insertButton);
  await realClick(page, insertButton);
  await page.waitForTimeout(250);
  const panel = await hitTest(page, '#autocomplete-box');
  check(`${label} - la liste « # » s'ouvre entièrement dans le panneau, sur l'onglet Variables`, panel.found && panel.inViewport
    && await page.evaluate(() => document.querySelector('#autocomplete-box .ac-tab.active').dataset.tab === 'variables'), panel);
  const chipsTab = await hitTest(page, '#autocomplete-box .ac-tab[data-tab="chips"]');
  await shot(page, `${theme}-1-liste-variables`);
  check(`${label} - l'onglet Chips est atteignable à la vraie souris`, chipsTab.found && chipsTab.inViewport && chipsTab.onTop, chipsTab);
  await realClick(page, chipsTab);
  await page.waitForTimeout(150);
  const entry = await hitByText(page, '#autocomplete-box .ac-item', 'Texte conditionnel');
  await shot(page, `${theme}-2-liste-chips`);
  check(`${label} - l'entrée « Texte conditionnel » est dans l'onglet Chips, visible et au premier plan`, entry.found && entry.inViewport && entry.onTop, entry);
  if (entry.found) await realClick(page, entry);
  await page.waitForTimeout(250);
  let state = await editorState();
  check(`${label} - clic sur l'entrée : un bloc vide remplace « # », la liste se ferme`, state.blocks === 1 && /<div class="conditional-text"><p><\/p><\/div>/.test(state.html) && !(await hitTest(page, '#autocomplete-box')).inViewport, state);
  // Petit par défaut : le bloc posé par le menu n'a que la largeur de son étiquette (rien d'autre à contenir), bien en deçà de la page ; il grandit avec la frappe.
  const blockSize = () => page.evaluate(() => {
    const b = document.querySelector('.tiptap .conditional-text');
    const text = document.createRange(); text.selectNodeContents(b.querySelector('.conditional-text-content > p'));
    return { blockW: b.getBoundingClientRect().width, tagW: b.querySelector('.conditional-text-tag').getBoundingClientRect().width, textW: text.getBoundingClientRect().width,
      pageW: document.querySelector('.tiptap > p').getBoundingClientRect().width };
  });
  const emptyBlock = await blockSize();
  check(`${label} - le bloc posé par le menu est petit : la largeur de son étiquette, bien en deçà de la page`, Math.abs(emptyBlock.blockW - emptyBlock.tagW) <= 1 && emptyBlock.blockW < emptyBlock.pageW / 2, emptyBlock);
  await page.keyboard.type('Texte réservé aux dossiers urgents');
  await page.waitForTimeout(100);
  state = await editorState();
  check(`${label} - la frappe qui suit va dans le bloc (curseur placé dedans)`, /<div class="conditional-text"><p>Texte réservé aux dossiers urgents<\/p><\/div>/.test(state.html), state.html);
  const typedBlock = await blockSize();
  check(`${label} - la frappe va avec le cadre : il épouse la plus large de l'étiquette et du texte, sans atteindre la largeur de la page`,
    typedBlock.textW > 50 && Math.abs(typedBlock.blockW - Math.max(typedBlock.tagW, typedBlock.textW)) <= 1.5 && typedBlock.blockW < typedBlock.pageW - 20, typedBlock);

  await shot(page, `${theme}-3-bloc-rempli`);
  // 2) L'étiquette : visible, dans le panneau ; un vrai clic sélectionne le bloc et ouvre la barre des variables.
  const tagBox = await hitTest(page, '.tiptap .conditional-text-tag');
  check(`${label} - l'étiquette « Texte conditionnel · sans condition » est visible dans le panneau`, tagBox.found && tagBox.inViewport && tagBox.onTop, tagBox);
  await realClick(page, tagBox);
  await page.waitForTimeout(300);
  const bar = await hitTest(page, '.v2-varfmt-toolbar.visible');
  const barButtons = {
    condition: await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-condition"]'),
    linked: await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-linked"]'),
    loop: await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-loop"]'),
  };
  await shot(page, `${theme}-4-bloc-selectionne-barre`);
  const barRelation = await page.evaluate(() => {
    const b = document.querySelector('.v2-varfmt-toolbar.visible').getBoundingClientRect();
    const t = document.querySelector('.tiptap .conditional-text-tag').getBoundingClientRect();
    return { barCenter: b.left + b.width / 2, tagCenter: t.left + t.width / 2, barBottom: b.bottom, tagTop: t.top, sel: EditorCore.getEditor().state.selection.node ? EditorCore.getEditor().state.selection.node.type.name : null };
  });
  check(`${label} - vrai clic sur l'étiquette : le bloc est sélectionné et la barre des variables s'ouvre, dans le panneau`, barRelation.sel === 'conditionalText' && bar.found && bar.inViewport, { bar, barRelation });
  check(`${label} - la barre est posée contre l'étiquette (centrée dessus), pas au milieu du bloc`, Math.abs(barRelation.barCenter - barRelation.tagCenter) <= 14 && barRelation.barBottom <= barRelation.tagTop + 14, barRelation);
  check(`${label} - ses trois icônes sont atteignables`, ['condition', 'linked', 'loop'].every(k => barButtons[k].found && barButtons[k].inViewport && barButtons[k].onTop), barButtons);

  // 3) Les deux icônes sans objet sont GRISÉES aux pixels (pas retirées) : leur encre tombe sous 60 % de celle des mêmes icônes actives sur une bulle de colonne Référence.
  const greyedInk = { linked: await ink(page, '.v2-varfmt-toolbar.visible button[data-action="var-linked"]'), loop: await ink(page, '.v2-varfmt-toolbar.visible button[data-action="var-loop"]') };
  const badgeBox = await hitTest(page, '.tiptap .var-badge[data-column="Responsable"]');
  // La barre du bloc, posée contre son étiquette, recouvre le début de la bulle - son centre aussi, la barre comptant quatre icônes (condition, « Autres attributs », « Boucle », « Colonne ») : le clic part de la fin de la bulle.
  await realClick(page, { x: badgeBox.right - 8, y: badgeBox.y });
  await page.waitForTimeout(300);
  const activeInk = await ink(page, '.v2-varfmt-toolbar.visible button[data-action="var-linked"]');
  check(`${label} - « Autres attributs » grisé sur un bloc : moins de 60 % de l'encre de la même icône active sur une bulle`, greyedInk.linked != null && activeInk != null && greyedInk.linked < activeInk * 0.6, { greyedInk, activeInk });
  await realClick(page, await hitTest(page, '.tiptap .conditional-text-tag'));
  await page.waitForTimeout(300);
  // Un clic sur une icône grisée n'ouvre rien.
  await realClick(page, await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-linked"]'));
  await realClick(page, await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-loop"]'));
  await page.waitForTimeout(250);
  const greyClick = await page.evaluate(() => ({ modals: Array.from(document.querySelectorAll('.modal-overlay, .var-modal-overlay')).filter(m => getComputedStyle(m).display !== 'none' && m.getClientRects().length).length, barOpen: !!document.querySelector('.v2-varfmt-toolbar.visible') }));
  check(`${label} - un vrai clic sur une icône grisée n'ouvre rien et la barre reste`, greyClick.modals === 0 && greyClick.barOpen, greyClick);

  // 4) La fenêtre de condition : la même que celle d'une bulle, entière dans 700x400, colonne choisie à la souris, valeur tapée, aperçu, Enregistrer.
  await realClick(page, await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-condition"]'));
  await page.waitForTimeout(250);
  await shot(page, `${theme}-5-fenetre-condition-vide`);
  const modalBox = await hitTest(page, '#var-condition-modal .var-modal-content');
  check(`${label} - fenêtre de condition ouverte sur le bloc, entièrement dans le panneau`, modalBox.found && modalBox.inViewport, modalBox);
  const introText = await page.evaluate(() => document.querySelector('#var-condition-modal .var-modal-intro').textContent);
  check(`${label} - son introduction parle du bloc de texte (pas d'une variable)`, /^Ce bloc de texte n’apparaît en lecture/.test(introText), introText);
  check(`${label} - colonne Statut choisie à la vraie souris dans la liste avec recherche`, await pickColumn(page, '#var-condition-modal', 'Statut'));
  const valueField = await hitTest(page, '#var-condition-modal .macro-rule-value');
  await realClick(page, valueField);
  await page.keyboard.type('Urgent');
  await page.waitForTimeout(700);
  const debugText = await page.evaluate(() => Array.from(document.querySelectorAll('#var-condition-modal .var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent));
  check(`${label} - l'aperçu dit que le bloc s'affiche pour la ligne sélectionnée`, debugText.length > 0 && /condition remplie, le bloc s’affiche/.test(debugText[0]), debugText);
  await shot(page, `${theme}-6-fenetre-condition-remplie`);
  const saveBtn = await hitTest(page, '#var-condition-modal .var-modal-primary');
  check(`${label} - « Enregistrer » est visible et non recouvert à 700x400`, saveBtn.found && saveBtn.inViewport && saveBtn.onTop, saveBtn);
  await realClick(page, saveBtn);
  await page.waitForTimeout(300);
  const afterSave = await page.evaluate(() => {
    const tag = document.querySelector('.tiptap .conditional-text-tag');
    const block = document.querySelector('.tiptap .conditional-text');
    const t = tag.getBoundingClientRect(); const b = block.getBoundingClientRect();
    const style = getComputedStyle(tag);
    return { label: tag.textContent, outline: getComputedStyle(block).outlineStyle, tagInside: t.left >= b.left - 1 && t.right <= b.right + 1, color: style.color, background: style.backgroundColor, open: document.getElementById('var-condition-modal').style.display !== 'none' };
  });
  // Le bloc enregistré reste sélectionné : son anneau est plein (comme une image sélectionnée), le cadre en pointillés se lit plus bas, une fois le bloc désélectionné.
  check(`${label} - Enregistrer : la fenêtre se ferme, l'étiquette dit « Si Statut = Urgent » et le bloc reste sélectionné`, afterSave.label === 'Si Statut = Urgent' && afterSave.outline === 'solid' && afterSave.tagInside && !afterSave.open, afterSave);
  const contrast = await page.evaluate(({ color, background }) => {
    const lum = css => { const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const [a, b] = [lum(color), lum(background)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  }, afterSave);
  check(`${label} - le texte de l'étiquette est lisible (contraste au moins 4,5:1)`, contrast >= 4.5, contrast);

  await shot(page, `${theme}-7-bloc-avec-condition`);
  // 5) Un bloc dans le bloc : Entrée en fin de texte, bouton, Chips, entrée ; les deux étiquettes ne se recouvrent pas et le cadre intérieur reste dans l'extérieur.
  // Le bloc est resté sélectionné (Enregistrer) : un vrai clic dans son texte y pose le curseur. Il ne le faisait pas (ProseMirror gardait la sélection du bloc, déplaçable
  // à la souris), sauf dans la marge vide à droite de la ligne de l'ancien cadre pleine largeur, qui n'existe plus avec le cadre qui épouse le texte.
  const insideText = await page.evaluate(() => {
    const r = document.querySelector('.tiptap .conditional-text p').getBoundingClientRect();
    return { x: r.left + 60, y: r.top + r.height / 2 };
  });
  await realClick(page, insideText);
  const caret = await page.evaluate(() => {
    const s = EditorCore.getEditor().state.selection;
    return { node: s.node ? s.node.type.name : null, empty: s.empty, text: s.$from.parent.textContent, offset: s.$from.parentOffset, selected: !!document.querySelector('.conditional-text-selected') };
  });
  check(`${label} - un vrai clic dans le texte du bloc resté sélectionné y pose le curseur, le bloc n'est plus sélectionné`,
    caret.node === null && caret.empty && /^Texte réservé/.test(caret.text) && caret.offset > 3 && caret.offset < caret.text.length - 3 && !caret.selected, caret);
  await page.keyboard.press('End');
  await page.waitForTimeout(80);
  await page.keyboard.press('Enter');
  await realClick(page, await hitTest(page, '#v2-btn-insert-variable'));
  await page.waitForTimeout(250);
  await realClick(page, await hitTest(page, '#autocomplete-box .ac-tab[data-tab="chips"]'));
  await page.waitForTimeout(150);
  const nestedEntry = await hitByText(page, '#autocomplete-box .ac-item', 'Texte conditionnel');
  check(`${label} - dans un bloc, la liste « # » propose encore « Texte conditionnel », atteignable`, nestedEntry.found && nestedEntry.inViewport && nestedEntry.onTop, nestedEntry);
  if (nestedEntry.found) await realClick(page, nestedEntry);
  await page.waitForTimeout(250);
  await page.keyboard.type('Texte imbriqué');
  await page.waitForTimeout(150);
  await shot(page, `${theme}-8-blocs-emboites`);
  const nested = await page.evaluate(() => {
    const outer = document.querySelector('.tiptap > .conditional-text');
    const inner = outer && outer.querySelector('.conditional-text');
    if (!inner) return { nested: false };
    const [t1, t2] = [outer.querySelector(':scope > .conditional-text-tag'), inner.querySelector(':scope > .conditional-text-tag')].map(t => t.getBoundingClientRect());
    const o = outer.getBoundingClientRect(); const i = inner.getBoundingClientRect();
    return {
      nested: true, tagsApart: t1.bottom <= t2.top + 0.5 || t2.bottom <= t1.top + 0.5 || t1.right <= t2.left || t2.right <= t1.left,
      innerInside: i.top >= o.top - 0.5 && i.bottom <= o.bottom + 0.5 && i.left >= o.left - 0.5 && i.right <= o.right + 0.5,
      innerTagInView: t2.left >= 0 && t2.right <= innerWidth && t2.bottom <= innerHeight + 400, text: inner.textContent,
    };
  });
  check(`${label} - bloc dans le bloc : posé et rempli à la souris, les deux étiquettes ne se recouvrent pas, le cadre intérieur reste dans l'extérieur`, nested.nested && nested.tagsApart && nested.innerInside && nested.innerTagInView && /Texte imbriqué/.test(nested.text), nested);

  // 6) Entourer un texte : triple clic sur « Fin du courrier », bouton, la liste s'ouvre sur Chips avec « Texte conditionnel » en surbrillance, Entrée.
  const finBox = await page.evaluate(() => {
    const p = Array.from(document.querySelectorAll('.tiptap > p')).find(x => x.textContent === 'Fin du courrier');
    p.scrollIntoView({ block: 'center' });
    const r = p.getBoundingClientRect();
    return { x: r.left + 30, y: r.top + r.height / 2 };
  });
  await page.mouse.click(finBox.x, finBox.y, { clickCount: 3 });
  await page.waitForTimeout(150);
  const selectedText = await page.evaluate(() => window.getSelection().toString().trim());
  await realClick(page, await hitTest(page, '#v2-btn-insert-variable'));
  await page.waitForTimeout(250);
  const wrapPanel = await page.evaluate(() => {
    const box = document.getElementById('autocomplete-box');
    const tab = box && box.querySelector('.ac-tab.active');
    const sel = box && box.querySelector('.ac-item.selected');
    return { tab: tab && tab.dataset.tab, selected: sel && sel.textContent, open: !!box && box.style.display !== 'none' };
  });
  check(`${label} - un texte sélectionné à la souris : le bouton ouvre la liste sur Chips, « Texte conditionnel » en surbrillance`, selectedText === 'Fin du courrier' && wrapPanel.open && wrapPanel.tab === 'chips' && wrapPanel.selected === 'Texte conditionnel', { selectedText, wrapPanel });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const wrapped = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('.tiptap > .conditional-text'));
    const mine = blocks.find(b => b.textContent.includes('Fin du courrier'));
    return { count: blocks.length, mine: mine ? mine.textContent : null, selection: window.getSelection().toString().trim() };
  });
  check(`${label} - Entrée : le paragraphe sélectionné est entouré d'un bloc à part, le texte reste sélectionné`, wrapped.count === 2 && wrapped.mine === 'Texte conditionnel · sans conditionFin du courrier' && wrapped.selection === 'Fin du courrier', wrapped);

  // 7) Lecture : un vrai clic sur « Lecture » ; la ligne « Urgent » remplit la condition (le texte réservé s'affiche, sans cadre) ; une ligne « Normal » masque le bloc
  // et le bloc qu'il contient, pas le bloc sans condition.
  await realClick(page, await hitTest(page, '#btn-mode-read'));
  await page.waitForTimeout(700);
  const reading = () => page.evaluate(() => {
    const content = document.querySelector('#reader-container .reader-content');
    return { shown: !!content && document.getElementById('reader-container').style.display === 'block', text: content ? content.textContent : '', frames: content ? content.querySelectorAll('.conditional-text, .conditional-text-tag').length : -1, barOpen: !!document.querySelector('.v2-varfmt-toolbar.visible') };
  });
  let read = await reading();
  await shot(page, `${theme}-9-lecture-urgent`);
  check(`${label} - Lecture, ligne « Urgent » : le texte réservé et le texte imbriqué s'affichent, sans cadre ni étiquette, la barre des variables est fermée`,
    read.shown && read.text.includes('Texte réservé aux dossiers urgents') && read.text.includes('Texte imbriqué') && read.text.includes('Fin du courrier') && read.frames === 0 && !read.barOpen, read);
  await page.evaluate(record => window.__gristStub.fireRecord(record, 'CtDossiers'), RECORD_NORMAL);
  await page.waitForTimeout(700);
  read = await reading();
  if (read.text.includes('Texte réservé')) {
    // Le rendu ne suit pas la ligne tout seul : un aller-retour Édition / Lecture, comme le ferait une personne.
    await realClick(page, await hitTest(page, '#btn-mode-edit'));
    await page.waitForTimeout(400);
    await realClick(page, await hitTest(page, '#btn-mode-read'));
    await page.waitForTimeout(700);
    read = await reading();
  }
  await shot(page, `${theme}-10-lecture-normal`);
  check(`${label} - Lecture, ligne « Normal » : le bloc et le bloc qu'il contient disparaissent, le paragraphe entouré sans condition reste`,
    read.shown && !read.text.includes('Texte réservé') && !read.text.includes('Texte imbriqué') && read.text.includes('Fin du courrier') && read.frames === 0, read);

  // 8) Retour en Édition : les cadres reviennent, la barre est fermée.
  await realClick(page, await hitTest(page, '#btn-mode-edit'));
  await page.waitForTimeout(500);
  const back = await page.evaluate(() => ({
    editorShown: document.getElementById('editor-container').style.display !== 'none',
    frames: document.querySelectorAll('.tiptap .conditional-text').length,
    outline: document.querySelector('.tiptap .conditional-text') ? getComputedStyle(document.querySelector('.tiptap .conditional-text')).outlineStyle : null,
    barOpen: !!document.querySelector('.v2-varfmt-toolbar.visible'),
  }));
  await shot(page, `${theme}-11-retour-edition`);
  check(`${label} - retour en Édition : trois blocs encadrés, aucune barre ouverte`, back.editorShown && back.frames === 3 && back.outline === 'dashed' && !back.barOpen, back);

  // 9) « Défaire le bloc » : la fenêtre du bloc emboîté (sans condition : trois boutons) puis celle du bloc extérieur (avec condition : quatre boutons, le cas le plus large) -
  // la ligne de boutons tient dans la fenêtre à 700x400, le bouton est lisible ; un vrai clic défait le bloc extérieur : le texte reste, son cadre et sa condition partent, le
  // bloc emboîté reste, le curseur est au début du texte libéré ; Ctrl+Z au clavier rend le bloc et sa condition, Ctrl+Y le défait de nouveau.
  const tagAt = async index => {
    await page.evaluate(i => document.querySelectorAll('.tiptap .conditional-text-tag')[i].scrollIntoView({ block: 'center' }), index);
    await page.waitForTimeout(80);
    return page.evaluate(i => {
      const el = document.querySelectorAll('.tiptap .conditional-text-tag')[i];
      const r = el.getBoundingClientRect();
      const x = r.left + Math.min(r.width / 2, 60), y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return { x, y, onTop: !!top && (top === el || el.contains(top)) };
    }, index);
  };
  // Rang de l'étiquette du bloc extérieur (celui de la condition « Statut = Urgent ») et du bloc emboîté : « Fin du courrier », entouré plus tôt, précède l'un et l'autre dans le document.
  const blockIndexes = () => page.evaluate(() => {
    const tags = Array.from(document.querySelectorAll('.tiptap .conditional-text-tag'));
    return {
      outer: tags.findIndex(t => t.textContent === 'Si Statut = Urgent'),
      inner: tags.findIndex(t => !!t.closest('.conditional-text').parentElement.closest('.conditional-text')),
      free: tags.findIndex(t => !t.closest('.conditional-text').parentElement.closest('.conditional-text') && t.textContent !== 'Si Statut = Urgent'),
    };
  });
  const openBlockWindow = async index => {
    // Un clic ailleurs d'abord (le premier paragraphe) : la barre du bloc précédent, encore ouverte, peut recouvrir l'étiquette d'un autre bloc.
    const first = await page.evaluate(() => {
      const p = document.querySelector('.tiptap > p');
      p.scrollIntoView({ block: 'start' });
      const r = p.getBoundingClientRect();
      return { x: r.left + 30, y: r.top + r.height / 2 };
    });
    await realClick(page, first);
    await page.waitForTimeout(150);
    await realClick(page, await tagAt(index));
    await page.waitForTimeout(250);
    await realClick(page, await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-condition"]'));
    await page.waitForTimeout(300);
  };
  const footer = () => footerOf(page);

  const index = await blockIndexes();
  check(`${label} - les trois blocs sont retrouvés par leur structure (extérieur à condition, emboîté, entouré plus tôt)`, index.outer >= 0 && index.inner >= 0 && index.free >= 0 && new Set([index.outer, index.inner, index.free]).size === 3, index);
  await openBlockWindow(index.inner);
  let f = await footer();
  await shot(page, `${theme}-12-fenetre-bloc-sans-condition`);
  check(`${label} - fenêtre du bloc emboîté (sans condition) : « Défaire le bloc », Annuler et Enregistrer, entiers dans la fenêtre, sur une ligne, sans recouvrement, Enregistrer à droite`,
    f.buttons.map(b => b.text).join('|') === 'Défaire le bloc|Annuler|Enregistrer' && inside(f) && noOverlap(f) && f.rowOverflow <= 0 && f.rows === 1 && f.buttons.every(b => b.onTop)
      && Math.abs(f.buttons[2].right - (f.box.right - 20)) <= 1.5 && f.selected && !/Urgent/.test(f.selected), f);
  await realClick(page, await hitTest(page, '#var-condition-modal .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)'));
  await page.waitForTimeout(250);

  await openBlockWindow(index.outer);
  f = await footer();
  await shot(page, `${theme}-13-fenetre-bloc-avec-condition`);
  // Quatre boutons : sur une ligne s'ils tiennent, sinon les retraits au-dessus et Annuler / Enregistrer dessous, à droite - jamais un bouton hors de la fenêtre ni deux qui se recouvrent.
  const rowOf = text => f.buttons.find(b => b.text === text).top;
  check(`${label} - fenêtre du bloc extérieur (avec condition) : « Retirer la condition » puis « Défaire le bloc », puis Annuler et Enregistrer, entiers dans la fenêtre, une ou deux lignes, sans recouvrement, Enregistrer à droite`,
    f.buttons.map(b => b.text).join('|') === 'Retirer la condition|Défaire le bloc|Annuler|Enregistrer' && inside(f) && noOverlap(f) && f.rowOverflow <= 0 && f.rows <= 2 && f.buttons.every(b => b.onTop)
      && rowOf('Retirer la condition') === rowOf('Défaire le bloc') && rowOf('Annuler') === rowOf('Enregistrer') && Math.abs(f.buttons[3].right - (f.box.right - 20)) <= 1.5 && /Urgent/.test(f.selected), f);
  // Tab et Maj+Tab au vrai clavier : les quatre boutons se suivent dans l'ordre où on les voit (retraits puis Annuler, Enregistrer) - même quand ils sont sur deux lignes - et
  // le focus ne quitte jamais la fenêtre (Tab depuis Enregistrer revient dans le premier champ, Maj+Tab depuis lui retombe sur Enregistrer).
  const FOOTER = ['Retirer la condition', 'Défaire le bloc', 'Annuler', 'Enregistrer'];
  const focusFooter = text => page.evaluate(t => Array.from(document.querySelectorAll('#var-condition-modal .var-modal-actions button')).find(b => b.textContent === t).focus(), text);
  const activeInfo = () => page.evaluate(() => {
    const a = document.activeElement;
    return { text: a ? a.textContent.trim() : null, inside: !!a && document.getElementById('var-condition-modal').contains(a) };
  });
  await focusFooter('Retirer la condition');
  const tabForward = [];
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); tabForward.push(await activeInfo()); }
  await page.keyboard.press('Tab');
  const tabAfterLast = await activeInfo();
  await page.keyboard.press('Shift+Tab');
  const tabBackToLast = await activeInfo();
  await focusFooter('Enregistrer');
  const tabBackward = [];
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Shift+Tab'); tabBackward.push(await activeInfo()); }
  await page.keyboard.press('Shift+Tab');
  const tabBeforeFirst = await activeInfo();
  check(`${label} - Tab au clavier : Retirer la condition, Défaire le bloc, Annuler, Enregistrer, puis le focus reste dans la fenêtre (premier champ), et Maj+Tab depuis lui retombe sur Enregistrer`,
    tabForward.map(a => a.text).join('|') === 'Défaire le bloc|Annuler|Enregistrer' && tabForward.every(a => a.inside) && tabAfterLast.inside && !FOOTER.includes(tabAfterLast.text) && tabBackToLast.text === 'Enregistrer' && tabBackToLast.inside,
    { tabForward, tabAfterLast, tabBackToLast });
  check(`${label} - Maj+Tab au clavier : Enregistrer, Annuler, Défaire le bloc, Retirer la condition à l'envers, puis le focus reste dans la fenêtre`,
    tabBackward.map(a => a.text).join('|') === 'Annuler|Défaire le bloc|Retirer la condition' && tabBackward.every(a => a.inside) && tabBeforeFirst.inside && !FOOTER.includes(tabBeforeFirst.text), { tabBackward, tabBeforeFirst });
  // L'anglais : « Remove condition », « Unwrap block », « Cancel », « Save » tiennent eux aussi dans la fenêtre, sur une ligne.
  await realClick(page, await hitTest(page, '#var-condition-modal .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)'));
  await page.waitForTimeout(250);
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(200);
  await openBlockWindow(index.outer);
  const english = await footerOf(page);
  await shot(page, `${theme}-13b-fenetre-bloc-anglais`);
  check(`${label} - interface en anglais : « Remove condition », « Unwrap block », « Cancel » et « Save » tiennent dans la fenêtre, sur une ligne, sans recouvrement`,
    english.buttons.map(b => b.text).join('|') === 'Remove condition|Unwrap block|Cancel|Save' && inside(english) && noOverlap(english) && english.rowOverflow <= 0 && english.rows === 1 && english.buttons.every(b => b.onTop), english);
  await realClick(page, await hitTest(page, '#var-condition-modal .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)'));
  await page.waitForTimeout(250);
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(200);
  await openBlockWindow(index.outer);
  const unwrapLook = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#var-condition-modal .var-modal-actions button')).find(x => x.textContent === 'Défaire le bloc');
    const box = document.querySelector('#var-condition-modal .var-modal-content');
    const lum = css => { const [r, g, bl] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { const k = v / 255; return k <= 0.03928 ? k / 12.92 : Math.pow((k + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
    const [hi, lo] = [lum(getComputedStyle(b).color), lum(getComputedStyle(box).backgroundColor)].sort((x, y) => y - x);
    return { contrast: (hi + 0.05) / (lo + 0.05), height: b.getBoundingClientRect().height, title: b.title, color: getComputedStyle(b).color };
  });
  check(`${label} - « Défaire le bloc » : texte lisible (contraste au moins 4,5:1), hauteur d'un bouton de la fenêtre (30 px), info-bulle qui dit que le texte reste`,
    unwrapLook.contrast >= 4.5 && Math.abs(unwrapLook.height - 30) <= 1 && /le texte du bloc reste à sa place/.test(unwrapLook.title), unwrapLook);
  const unwrapBox = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#var-condition-modal .var-modal-actions button')).find(x => x.textContent === 'Défaire le bloc');
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await realClick(page, unwrapBox);
  await page.waitForTimeout(300);
  await shot(page, `${theme}-14-bloc-defait`);
  const unwrapped = await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    const sel = ed.state.selection;
    const html = ed.getHTML();
    return {
      closed: document.getElementById('var-condition-modal').style.display === 'none' || !document.getElementById('var-condition-modal').getClientRects().length,
      topBlocks: document.querySelectorAll('.tiptap > .conditional-text').length, allBlocks: document.querySelectorAll('.tiptap .conditional-text').length,
      conditionGone: html.indexOf('Statut') === -1, plain: html.indexOf('<p>Texte réservé aux dossiers urgents</p>') !== -1,
      caret: sel.empty && sel.toJSON().type === 'text' && sel.$from.parent.textContent === 'Texte réservé aux dossiers urgents' && sel.$from.parentOffset === 0,
      focus: !!document.activeElement && !!document.activeElement.closest('.tiptap'), barOpen: !!document.querySelector('.v2-varfmt-toolbar.visible'),
    };
  });
  check(`${label} - vrai clic sur « Défaire le bloc » : la fenêtre se ferme, le texte reste sans cadre ni condition, le bloc emboîté et l'autre bloc restent, le curseur est au début du texte, la barre est fermée`,
    unwrapped.closed && unwrapped.topBlocks === 2 && unwrapped.allBlocks === 2 && unwrapped.conditionGone && unwrapped.plain && unwrapped.caret && unwrapped.focus && !unwrapped.barOpen, unwrapped);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  const undone = await page.evaluate(() => ({ blocks: document.querySelectorAll('.tiptap .conditional-text').length, labels: Array.from(document.querySelectorAll('.tiptap .conditional-text-tag')).map(t => t.textContent) }));
  check(`${label} - Ctrl+Z au clavier : le bloc revient avec sa condition (« Si Statut = Urgent »), d'un seul coup`, undone.blocks === 3 && undone.labels.filter(l => l === 'Si Statut = Urgent').length === 1, undone);
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(250);
  const redone = await page.evaluate(() => ({ blocks: document.querySelectorAll('.tiptap .conditional-text').length, html: EditorCore.getEditor().getHTML().indexOf('Statut') === -1 }));
  check(`${label} - Ctrl+Maj+Z au clavier : le bloc est de nouveau défait`, redone.blocks === 2 && redone.html, redone);
  await context.close();
}

// Panneau étroit (360 px) : une condition longue ne fait déborder ni l'étiquette ni la page.
async function runNarrow() {
  console.log(`\n=== Bloc de texte conditionnel, panneau étroit (360 px), case de tableau ===`);
  const { context, page } = await openWidget('light');
  await page.setViewportSize({ width: 360, height: HEIGHT });
  const long = { mode: 'any', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }, { column: 'Titre', operator: 'contient', value: 'contentieux' }, { column: 'Montant', operator: '>', value: '100000' }] };
  await page.evaluate(({ long }) => {
    const stub = window.__gristStub;
    stub.setVariables('CtDossiers', { Titre: 'Text', Statut: 'Text', Montant: 'Numeric' });
    const attr = JSON.stringify(long).replace(/"/g, '&quot;');
    // Dans une case de tableau : la place d'une étiquette longue est étroite (pleine largeur, la page réduite à 360 px lui laisse de quoi tenir en entier).
    Editor.setHTML('<p>Avant</p><table><tbody><tr><td><div class="conditional-text" data-condition="' + attr + '"><p>Un texte assez long pour passer à la ligne dans une case étroite</p></div></td><td><p>Autre case</p></td></tr></tbody></table><p>Après</p>');
  }, { long });
  await page.waitForTimeout(400);
  const narrow = await page.evaluate(() => {
    const tag = document.querySelector('.tiptap .conditional-text-tag');
    const block = document.querySelector('.tiptap .conditional-text');
    const t = tag.getBoundingClientRect(); const b = block.getBoundingClientRect();
    // Largeur qu'aurait l'étiquette sans coupure, mesurée sur une copie dans le même contexte (la page réduite à 360 px est zoomée : scrollWidth et clientWidth ne le disent pas).
    const copy = tag.cloneNode(true);
    copy.style.cssText = 'max-width: none; width: max-content; position: absolute; visibility: hidden;';
    tag.parentNode.appendChild(copy);
    const fullWidth = copy.getBoundingClientRect().width;
    copy.remove();
    return { tagRight: t.right, blockRight: b.right, ellipsis: getComputedStyle(tag).textOverflow, truncated: fullWidth > t.width + 1, fullWidth, tagWidth: t.width, docOverflowX: document.documentElement.scrollWidth - innerWidth, title: tag.title.length > 40 };
  });
  check('panneau de 360 px, case de tableau : l\'étiquette d\'une condition longue reste dans le bloc (coupée par « … », entière dans son info-bulle) et la page ne défile pas de côté',
    narrow.tagRight <= narrow.blockRight + 1 && narrow.ellipsis === 'ellipsis' && narrow.truncated && narrow.title && narrow.docOverflowX <= 0, narrow);
  // La fenêtre de ce bloc à condition dans le même panneau de 360 px : « Retirer la condition », « Défaire le bloc », Annuler et Enregistrer tiennent dans la fenêtre (deux lignes), rien
  // ne la dépasse de côté.
  await realClick(page, await hitTest(page, '.tiptap .conditional-text-tag'));
  await page.waitForTimeout(250);
  await realClick(page, await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-condition"]'));
  await page.waitForTimeout(300);
  const narrowFooter = await footerOf(page);
  check('panneau de 360 px : la ligne de boutons de la fenêtre d\'un bloc à condition tient dans la fenêtre (retraits au-dessus, Annuler et Enregistrer dessous), sans recouvrement ni débordement',
    narrowFooter.buttons.map(b => b.text).join('|') === 'Retirer la condition|Défaire le bloc|Annuler|Enregistrer' && inside(narrowFooter) && noOverlap(narrowFooter) && narrowFooter.rowOverflow <= 0 && narrowFooter.buttons.every(b => b.onTop), narrowFooter);
  await context.close();
}

await runTheme('light');
await runTheme('dark');
await runNarrow();
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
