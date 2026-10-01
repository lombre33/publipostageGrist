#!/usr/bin/env node
// Les sept textes qui restaient en français dans l'interface anglaise (audit UX/UI du 29/09, constat F7), lus dans le widget réel à la taille du panneau Grist
// d'Antoine (~700x400), à la VRAIE souris (clic sur une zone de la page, sur la puce de police, sur le bouton Sommaire, sur les boutons de mode, sur Réglages) et au
// vrai clavier (Ctrl+A, Ctrl+C) :
//   - « + Add a header » / « + Add a footer » : les zones fantômes de la page vide (js/header-footer-preview.js) ;
//   - « Roboto (default) » : première ligne du menu de police (js/main-toolbar.js) ;
//   - « Table of contents (generated automatically from headings) » : le sommaire, dans l'éditeur (déjà traduit) ET dans le HTML enregistré et copié (js/editor-nodes.js,
//     renderHTML : un modèle enregistré avec l'interface française se rouvre avec son sommaire, et le réenregistrer écrit le texte de la langue courante) ;
//   - mode Lecture (js/reader-mode.js) : « Table of Contents », « No heading found. » et « Warning: some variables could not be resolved. » ;
//   - le message d'une variable qui ne se résout pas, en Lecture : « [ERROR: no matching configured for Contrats — reinsert the variable to configure it] » (js/variables.js,
//     carte d'Antoine du 29/09 « Oui, les deux »). L'avertissement ci-dessus doit rester affiché : la Lecture repère l'erreur par un drapeau, plus par les premiers mots du message ;
//   - « [Email unavailable] » : le chip « Email de l'utilisateur » quand l'adresse ne se lit pas (js/reader-mode.js, carte d'Antoine du 30/09 « Traduire ») - le faux Grist du
//     harnais ne donne aucune adresse, c'est donc l'état normal ici.
// Le passage en français par Réglages, sans recharger, doit tout remettre en français (zones fantômes et ligne Roboto suivent la langue, le reste au rendu suivant), avec les
// textes d'origine : le français ne bouge pas (seule l'apostrophe de l'avertissement devient typographique, comme dans les autres textes de js/i18n.js).
// Le titre du sommaire des exports DOCX et PDF, la phrase « aucun titre » du sommaire DOCX et les autres messages d'erreur d'une variable sont vérifiés dans les groupes en page
// (docx, pageBreakToc, varPath, chips).
// Lancé par run-headless.mjs (groupe Node "englishTextsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-english-texts-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.ENGLISH_TEXTS_PORT || 8900);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-chip-cell-mouse.mjs.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/html2pdf\.bundle\.min\.js$/, 'umd/html2pdf.bundle.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-english-texts-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
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
// Le widget d'un utilisateur qui a choisi l'anglais dans Réglages : la langue est lue dans le stockage local avant tout autre script.
await page.addInitScript(() => { try { localStorage.setItem('pp_lang', 'en'); } catch (e) { /* stockage indisponible */ } });

await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.getElementById('status-msg');
  return !!el && /prêt|ready/i.test(el.textContent || '');
}, null, { timeout: 90000 });
// Aperçu A4, le réglage d'Antoine (page réduite dans le panneau).
await page.evaluate(() => { document.getElementById('editor-container').classList.add('a4-preview'); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const settle = () => sleep(600);

// --- Aides : la vraie souris et ce qu'on voit à l'écran ---
// Centre d'un élément (après l'avoir amené dans le panneau) et ce qui s'y trouve réellement au premier plan.
async function locate(selector, scroll = true) {
  return page.evaluate(([sel, doScroll]) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    if (doScroll) el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, w: r.width, h: r.height,
      inViewport: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      // Un espaceur d'en-tête ou de pied ne prend pas la souris (css/editor-v2.css : il recouvre la marge de la feuille, où se posent aussi les images en calque) : sur
      // lui, c'est la feuille ou `.tiptap` qui la reçoit, et js/header-footer-preview.js:zoneUnderPointer ouvre alors la zone.
      onTop: !!top && (top === el || el.contains(top) || (!!el.closest('.v2-page-edge-spacer') && top.matches('.tiptap, .v2-page-sheet'))),
      // Le texte tient dans sa boîte : rien n'est rogné à droite.
      fits: el.scrollWidth <= el.clientWidth + 0.5,
    };
  }, [selector, scroll]);
}
async function clickOn(selector) {
  const at = await locate(selector);
  if (!at.found) return at;
  await page.mouse.move(2, 2);
  await page.mouse.move(at.x, at.y, { steps: 4 });
  await page.mouse.down();
  await page.mouse.up();
  return at;
}
const textOf = selector => page.evaluate(sel => { const el = document.querySelector(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; }, selector);
const textsOf = selector => page.evaluate(sel => Array.from(document.querySelectorAll(sel)).map(el => el.textContent.replace(/\s+/g, ' ').trim()), selector);
async function loadDoc(html) {
  await page.evaluate(h => Editor.setHTML(h), html);
  await settle();
}
const refreshPreview = async () => { await page.evaluate(() => Editor.refreshPaginationPreview()); await settle(); };

// Ce que le presse-papiers reçoit à Ctrl+C (lu par un écouteur du document, qui passe après celui de l'éditeur).
await page.evaluate(() => {
  window.__copied = null;
  document.addEventListener('copy', e => { window.__copied = { html: e.clipboardData.getData('text/html'), text: e.clipboardData.getData('text/plain') }; });
});

const EN = {
  addHeader: '+ Add a header', addFooter: '+ Add a footer', roboto: 'Roboto (default)',
  toc: 'Table of contents (generated automatically from headings)',
  tocTitle: 'Table of Contents', tocEmpty: 'No heading found.', warning: 'Warning: some variables could not be resolved.',
  badgeError: '[ERROR: no matching configured for Contrats — reinsert the variable to configure it]',
  emailChip: '[Email unavailable]',
};
const FR = {
  addHeader: '+ Ajouter un en-tête', addFooter: '+ Ajouter un pied de page', roboto: 'Roboto (par défaut)',
  toc: 'Sommaire (généré automatiquement à partir des titres)',
  tocTitle: 'Sommaire', tocEmpty: 'Aucun titre trouvé.', warning: 'Attention : certaines variables n’ont pas pu être résolues.',
  badgeError: '[ERREUR: aucune correspondance configurée pour Contrats — réinsérez la variable pour la configurer]',
  emailChip: '[Email indisponible]',
};

console.log('1. L\'interface est bien en anglais, comme chez un utilisateur qui l\'a choisi');
check('I18n.getLang() vaut "en", <html lang> aussi', await page.evaluate(() => I18n.getLang() === 'en' && document.documentElement.lang === 'en'));
check('la barre du haut est en anglais (info-bulle du bouton Sommaire)', /table of contents/i.test(await page.evaluate(() => document.getElementById('v2-btn-toc').getAttribute('data-tip') || '')));

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('2. Zones fantômes de la page (en-tête et pied de page) : la vraie page, à 700x400');
await loadDoc('<p>Dear customer,</p>');
await refreshPreview();
check('zone du haut : "+ Add a header"', await textOf('.v2-page-edge-top .v2-hf-zone-ghost') === EN.addHeader, await textOf('.v2-page-edge-top .v2-hf-zone-ghost'));
check('zone du bas : "+ Add a footer"', await textOf('.v2-page-edge-bottom .v2-hf-zone-ghost') === EN.addFooter, await textOf('.v2-page-edge-bottom .v2-hf-zone-ghost'));
// Le libellé n'apparaît qu'au survol d'une zone vide (css/editor-v2.css : .v2-hf-zone-ghost{display:none}) : on la survole à la vraie souris, puis on le mesure.
async function hoverZone(zoneSelector) {
  // Une zone survolée s'agrandit et pousse la page : on libère la souris avant de mesurer la zone visée, sinon sa place bouge sous le pointeur.
  await page.mouse.move(2, 2);
  await sleep(200);
  const zone = await locate(zoneSelector);
  await page.mouse.move(zone.x, zone.y, { steps: 4 });
  await sleep(200);
  const after = await page.evaluate(sel => { const z = document.querySelector(sel); const r = z.getBoundingClientRect(); return { hover: z.matches(':hover'), rect: [r.left, r.top, r.width, r.height].map(v => Math.round(v * 10) / 10), scroll: [document.getElementById('editor-container').scrollTop, scrollY] }; }, zoneSelector);
  return { zone, after, ghost: await locate(zoneSelector + ' .v2-hf-zone-ghost', false) };
}
const hoverTop = await hoverZone('.v2-page-edge-top');
check('zone du haut survolée : libellé visible dans le panneau, au premier plan, non rogné', hoverTop.ghost.found && hoverTop.ghost.w > 0 && hoverTop.ghost.inViewport && hoverTop.ghost.onTop && hoverTop.ghost.fits, hoverTop);
const hoverBottom = await hoverZone('.v2-page-edge-bottom');
check('zone du bas survolée : libellé visible dans le panneau, au premier plan, non rogné', hoverBottom.ghost.found && hoverBottom.ghost.w > 0 && hoverBottom.ghost.inViewport && hoverBottom.ghost.onTop && hoverBottom.ghost.fits, hoverBottom);
// Le clic ouvre toujours l'édition de l'en-tête, dont la pastille est en anglais.
await hoverZone('.v2-page-edge-top');
await page.mouse.down(); await page.mouse.up();
await sleep(400);
check('un clic sur la zone du haut ouvre l\'édition de l\'en-tête (pastille "Header" / "Done")',
  await page.evaluate(() => { const m = HeaderFooterPreview.getHfMode(); const pill = document.getElementById('v2-hf-pill'); return !!m && m.zone === 'header' && !!pill && /Header/.test(pill.textContent) && /Done/.test(pill.textContent); }));
await clickOn('#v2-hf-btn-done');
await sleep(400);
check('« Done » ferme l\'édition, les zones fantômes reviennent en anglais', await page.evaluate(() => !HeaderFooterPreview.getHfMode())
  && await textOf('.v2-page-edge-top .v2-hf-zone-ghost') === EN.addHeader && await textOf('.v2-page-edge-bottom .v2-hf-zone-ghost') === EN.addFooter);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('3. Menu de police : première ligne "Roboto (default)"');
const chipAt = await clickOn('#v2-font-chip');
await sleep(300);
const roboto = await locate('.v2-format-panel.visible button[data-action="Roboto"]');
check('le bouton de police s\'atteint à la souris', chipAt.found && chipAt.inViewport && chipAt.onTop, chipAt);
check('le menu de police s\'ouvre', await page.evaluate(() => !!document.querySelector('.v2-format-panel.visible button[data-action="Roboto"]')));
check('première ligne : "Roboto (default)"', await textOf('.v2-format-panel.visible button[data-action="Roboto"]') === EN.roboto, await textOf('.v2-format-panel.visible button[data-action="Roboto"]'));
check('cette ligne est dans le panneau, au premier plan, non rognée', roboto.found && roboto.inViewport && roboto.onTop && roboto.fits, roboto);
check('les autres polices gardent leur nom', await page.evaluate(() => Array.from(document.querySelectorAll('.v2-format-panel.visible button[data-action]')).map(b => b.textContent).slice(1).join('|') === 'Arial|Times New Roman|Georgia|Courier New|Calibri'));
// Choisir une police par cette ligne fonctionne toujours (la valeur, pas le libellé, part à l'éditeur).
await loadDoc('<p>Dear customer,</p>');
const fontPara = await locate('.tiptap p');
await page.mouse.move(fontPara.x, fontPara.y, { steps: 3 });
await page.mouse.down(); await page.mouse.up();
await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
await clickOn('#v2-font-chip');
await sleep(300);
await clickOn('.v2-format-panel.visible button[data-action="Georgia"]');
await sleep(400);
check('choisir "Georgia" dans le menu applique Georgia au texte sélectionné', await page.evaluate(() => /font-family:\s*Georgia/i.test(Editor.getHTML())), await page.evaluate(() => Editor.getHTML()));
await clickOn('#v2-font-chip');
await sleep(300);
await clickOn('.v2-format-panel.visible button[data-action="Roboto"]');
await sleep(400);
check('choisir "Roboto (default)" remet la police par défaut (Georgia disparaît)', await page.evaluate(() => !/Georgia/i.test(Editor.getHTML())), await page.evaluate(() => Editor.getHTML()));
check('le menu se referme après le choix', await page.evaluate(() => !document.querySelector('.v2-format-panel.visible')));

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('4. Sommaire : dans l\'éditeur, dans le HTML enregistré et dans le presse-papiers');
await loadDoc('<p>Dear customer,</p>');
// Curseur dans le paragraphe (vrai clic), puis le bouton Sommaire de la barre.
const para = await locate('.tiptap p');
await page.mouse.move(para.x, para.y, { steps: 3 });
await page.mouse.down(); await page.mouse.up();
const tocBtn = await clickOn('#v2-btn-toc');
await settle();
check('le bouton Sommaire s\'atteint à la souris', tocBtn.found && tocBtn.inViewport && tocBtn.onTop, tocBtn);
check('un sommaire est inséré', await page.evaluate(() => document.querySelectorAll('.tiptap .toc-marker').length === 1));
check('dans l\'éditeur, sans titre : le texte du sommaire est en anglais', await textOf('.tiptap .toc-marker') === EN.toc, await textOf('.tiptap .toc-marker'));
const savedHtml = await page.evaluate(() => Editor.getHTML());
const savedMarker = (savedHtml.match(/<div class="toc-marker"[^>]*>(.*?)<\/div>/) || [])[1];
check('le HTML enregistré porte le texte anglais du sommaire', savedMarker === EN.toc, savedMarker);
check('le HTML enregistré ne contient plus le texte français', !/Sommaire \(généré/.test(savedHtml));
// Ctrl+A puis Ctrl+C : ce qui part dans le presse-papiers.
await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
await page.keyboard.down('Control'); await page.keyboard.press('c'); await page.keyboard.up('Control');
await sleep(300);
const copied = await page.evaluate(() => window.__copied);
check('Ctrl+C copie le sommaire avec son texte anglais', !!copied && copied.html.includes(EN.toc) && !/Sommaire \(généré/.test(copied.html), copied && copied.html);
// Un modèle enregistré avec l'interface française : son sommaire est reconnu, l'éditeur l'affiche en anglais, et le réenregistrer écrit l'anglais.
await loadDoc(`<h1>Alpha</h1><div class="toc-marker">${FR.toc}</div><p>Dear customer,</p>`);
check('un modèle enregistré en français garde son sommaire', await page.evaluate(() => document.querySelectorAll('.tiptap .toc-marker').length === 1));
check('avec des titres, l\'éditeur affiche la liste des titres et plus le placeholder', await page.evaluate(() => {
  const marker = document.querySelector('.tiptap .toc-marker');
  return !!marker && marker.querySelectorAll('.toc-entry-preview').length === 1 && marker.textContent.trim() === 'Alpha';
}));
const reSaved = await page.evaluate(() => Editor.getHTML());
check('réenregistré, il porte le texte anglais et plus le français', reSaved.includes(EN.toc) && !/Sommaire \(généré/.test(reSaved));
await loadDoc(`<p>Dear customer,</p><div class="toc-marker">${FR.toc}</div>`);
check('sans titre, le sommaire d\'un modèle enregistré en français s\'affiche en anglais', await textOf('.tiptap .toc-marker') === EN.toc, await textOf('.tiptap .toc-marker'));

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('5. Mode Lecture : titre du sommaire, sommaire vide et avertissement de variable non résolue');
await page.evaluate(async () => {
  window.__gristStub.setVariables('Clients', { Nom: 'Text' });
  window.__gristStub.setVariables('Contrats', { Objet: 'Text' });
  window.__gristStub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
  await GristAPI.refreshSchema();
});
const BROKEN = '<span class="var-badge" data-table="Contrats" data-column="Objet" data-key="Contrats.Objet">#Contrats.Objet</span>';
const TOC = '<div class="toc-marker"></div>';
const EMAIL_CHIP = '<span class="smart-chip" contenteditable="false" data-chip-kind="email">Email</span>';
// Une ligne est sélectionnée dans Grist : le mode Lecture montre le document rempli.
await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients'));
await sleep(300);
async function openReader() {
  await page.evaluate(() => { document.getElementById('reader-container').innerHTML = ''; });
  const btn = await clickOn('#btn-mode-read');
  try { await page.waitForSelector('#reader-container .reader-content', { timeout: 15000 }); } catch (e) { /* signalé par les vérifications */ }
  await settle();
  return btn;
}
async function backToEditor() { await clickOn('#btn-mode-edit'); await settle(); }
// Document sans titre, avec un sommaire et une variable qui ne se résout pas (table sans lien avec la table de la ligne).
await loadDoc(`<p>Hello ${BROKEN} ${EMAIL_CHIP}</p>${TOC}`);
const readBtn = await openReader();
check('le bouton du mode Lecture s\'atteint à la souris', readBtn.found && readBtn.inViewport && readBtn.onTop, readBtn);
check('le mode Lecture affiche le document', await page.evaluate(() => !!document.querySelector('#reader-container .reader-content')));
check('titre du sommaire : "Table of Contents"', await textOf('#reader-container .toc-title') === EN.tocTitle, await textOf('#reader-container .toc-title'));
check('sommaire vide : "No heading found."', await textOf('#reader-container .toc-empty') === EN.tocEmpty, await textOf('#reader-container .toc-empty'));
check('avertissement : "Warning: some variables could not be resolved."', await textOf('#reader-container > p.error-msg') === EN.warning, await textOf('#reader-container > p.error-msg'));
const enErrors = await textsOf('#reader-container .reader-content .resolved-var.error-msg');
check('la variable en erreur dit son message en anglais', enErrors[0] === EN.badgeError, enErrors);
check('le chip Email sans adresse dit "[Email unavailable]"', enErrors.length === 2 && enErrors[1] === EN.emailChip, enErrors);
await backToEditor();
// Document avec des titres et sans variable cassée : la liste des titres, et aucun avertissement.
await loadDoc(`<h1>Alpha</h1>${TOC}<h2>Beta</h2><p>Hello</p>`);
await openReader();
check('avec des titres : "Table of Contents" puis la liste des titres', await textOf('#reader-container .toc-title') === EN.tocTitle
  && await page.evaluate(() => Array.from(document.querySelectorAll('#reader-container .toc-entry')).map(e => e.textContent.trim()).join('|') === 'Alpha|Beta'));
check('avec des titres : pas de phrase "No heading found."', await page.evaluate(() => !document.querySelector('#reader-container .toc-empty')));
check('sans variable cassée : pas d\'avertissement', await page.evaluate(() => !document.querySelector('#reader-container > p.error-msg')));
await backToEditor();

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('6. Passage en français par Réglages, sans recharger : tout suit, avec les textes d\'origine');
await loadDoc('<p>Dear customer,</p>');
await refreshPreview();
await clickOn('#v2-btn-settings');
await sleep(300);
check('la fenêtre Réglages s\'ouvre', await page.evaluate(() => getComputedStyle(document.getElementById('settings-modal')).display !== 'none'));
const frRadio = await clickOn('input[name="settings-lang"][value="fr"] + span');
await sleep(300);
check('le choix "Français" est pris en compte', await page.evaluate(() => I18n.getLang() === 'fr' && document.documentElement.lang === 'fr'), frRadio);
await clickOn('#settings-close');
await sleep(400);
check('zone du haut : "+ Ajouter un en-tête" sans rien retaper', await textOf('.v2-page-edge-top .v2-hf-zone-ghost') === FR.addHeader, await textOf('.v2-page-edge-top .v2-hf-zone-ghost'));
check('zone du bas : "+ Ajouter un pied de page"', await textOf('.v2-page-edge-bottom .v2-hf-zone-ghost') === FR.addFooter, await textOf('.v2-page-edge-bottom .v2-hf-zone-ghost'));
await clickOn('#v2-font-chip');
await sleep(300);
check('menu de police : "Roboto (par défaut)"', await textOf('.v2-format-panel.visible button[data-action="Roboto"]') === FR.roboto, await textOf('.v2-format-panel.visible button[data-action="Roboto"]'));
await clickOn('.v2-format-panel.visible button[data-action="Arial"]');
await sleep(300);
await loadDoc('<p>Chère cliente,</p>');
const paraFr = await locate('.tiptap p');
await page.mouse.move(paraFr.x, paraFr.y, { steps: 3 });
await page.mouse.down(); await page.mouse.up();
await clickOn('#v2-btn-toc');
await settle();
check('sommaire dans l\'éditeur : texte français d\'origine', await textOf('.tiptap .toc-marker') === FR.toc, await textOf('.tiptap .toc-marker'));
const frHtml = await page.evaluate(() => Editor.getHTML());
check('HTML enregistré : texte français d\'origine', (frHtml.match(/<div class="toc-marker"[^>]*>(.*?)<\/div>/) || [])[1] === FR.toc, frHtml);
await loadDoc(`<p>Bonjour ${BROKEN} ${EMAIL_CHIP}</p>${TOC}`);
await openReader();
check('Lecture : "Sommaire"', await textOf('#reader-container .toc-title') === FR.tocTitle, await textOf('#reader-container .toc-title'));
check('Lecture : "Aucun titre trouvé."', await textOf('#reader-container .toc-empty') === FR.tocEmpty, await textOf('#reader-container .toc-empty'));
check('Lecture : "Attention : certaines variables n’ont pas pu être résolues."', await textOf('#reader-container > p.error-msg') === FR.warning, await textOf('#reader-container > p.error-msg'));
const frErrors = await textsOf('#reader-container .reader-content .resolved-var.error-msg');
check('Lecture : la variable en erreur redit son message en français', frErrors[0] === FR.badgeError, frErrors);
check('Lecture : le chip Email sans adresse redit "[Email indisponible]"', frErrors.length === 2 && frErrors[1] === FR.emailChip, frErrors);
await backToEditor();

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

console.log(`\n${total - failures}/${total} passés`);
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
