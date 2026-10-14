#!/usr/bin/env node
// Changer de langue dans Réglages recharge la page, rien d'autre (14/10 : « quand on change de langue, on recharge la page et uniquement ça, pour ne pas alourdir »), à la VRAIE
// souris (page.mouse, Node/Playwright) et à la taille du panneau Grist (~700x400) :
//   1. rien n'attend d'être enregistré : un vrai clic sur « English » recharge la page, qui repart en anglais (<html lang>, info-bulle d'un bouton de la barre, langue gardée, fenêtre
//      Réglages refermée, case « English » cochée à la réouverture) ; au moment où la page part, sa langue n'a pas bougé (rien n'est retraduit sur place) ; un vrai clic sur
//      « Français » fait le chemin inverse ;
//   2. une modification attend d'être enregistrée (l'enregistrement automatique est coupé) : la question « Modifications non enregistrées » (Annuler / Abandonner / Enregistrer) passe
//      devant Réglages avant tout rechargement ; « Annuler » laisse la page, sa langue, la case cochée d'avant et le texte tapé ; « Enregistrer » écrit le modèle avant que la page
//      parte ; « Abandonner » la laisse partir sans l'écrire ;
//   3. stockage refusé (la langue ne survivrait pas au rechargement) : la langue change sur place, sans rechargement.
// Lancé par run-headless.mjs (groupe Node "languageReloadMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-language-reload-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.LANGUAGE_RELOAD_MOUSE_PORT || 9031);
const WIDTH = 700;
const HEIGHT = 400;
const TYPED = 'MARQUETAPEE';

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-settings-window-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-language-reload-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Le widget d'une personne : français au premier chargement (le navigateur de test est en anglais), avec ou sans enregistrement automatique, et avec ou sans stockage pour la langue.
// Un script d'initialisation rejoue à chaque rechargement : la langue et l'enregistrement automatique ne sont semés qu'au premier chargement (drapeau de session), sinon la page
// rechargée par Réglages repartirait en français.
// Au moment où la page part (événement `navigate`, avant qu'elle ne soit déchargée), le script note dans sessionStorage la langue qu'elle a encore et si le modèle est déjà écrit dans le
// faux Grist : c'est ce que le test relit après le rechargement.
async function openWidget({ autosave = true, refuseStorage = false } = {}) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme: 'light' });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => d.accept().catch(() => {}));
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
  await page.addInitScript(opts => {
    try {
      if (!sessionStorage.getItem('e2e_seeded')) {
        sessionStorage.setItem('e2e_seeded', '1');
        localStorage.setItem('pp_lang', 'fr');
        if (!opts.autosave) localStorage.setItem('pp_autosave_enabled', 'false');
      }
    } catch (e) { /* stockage indisponible */ }
    if (opts.refuseStorage) {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if (key === 'pp_lang') throw new Error('stockage refusé'); return setItem.apply(this, arguments); };
    }
    try {
      navigation.addEventListener('navigate', e => {
        if (e.navigationType !== 'reload') return;
        const rows = window.__gristStub && window.__gristStub.state.rows.Publipostage_Modeles;
        sessionStorage.setItem('e2e_at_reload', JSON.stringify({ lang: I18n.getLang(), written: !!rows && rows.Contenu.some(c => String(c).includes('MARQUETAPEE')) }));
      });
    } catch (e) { /* API Navigation absente */ }
    window.__preSeedGristStub = (stub) => {
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      m.Contenu.push('<p>Texte du contrat.</p>');
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  }, { autosave, refuseStorage });
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await ready(page);
  return { context, page };
}

const ready = async page => {
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
};

async function boxOf(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selector);
}
// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, selector) {
  const b = await boxOf(page, selector);
  if (!b) return null;
  await page.mouse.move(b.x - 6, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.click(b.x, b.y);
  return b;
}
// Un bouton de la question « Modifications non enregistrées » (Annuler, Abandonner, Enregistrer), cliqué à la vraie souris.
async function clickDialogButton(page, text) {
  const at = await page.evaluate(t => {
    const b = Array.from(document.querySelectorAll('#pp-dialog-modal .var-modal-actions button')).find(x => x.textContent.trim() === t && x.getClientRects().length > 0);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, text);
  if (!at) return null;
  await page.mouse.move(at.x - 6, at.y, { steps: 2 });
  await page.mouse.move(at.x, at.y, { steps: 3 });
  await page.mouse.click(at.x, at.y);
  return at;
}
async function openSettings(page) {
  await realClick(page, '#v2-btn-settings');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('settings-modal')).display !== 'none', null, { timeout: 5000 }).catch(() => {});
  await sleep(250);
  await realClick(page, '#settings-modal .settings-tab[data-settings-tab="language"]');
  await sleep(150);
}
// Ce que la page montre : sa langue, son repère (posé avant le clic : absent = la page a été rechargée), la langue gardée, l'info-bulle du bouton Sommaire, les cases de langue.
const snapshot = page => page.evaluate(() => ({
  marker: window.__marker || null,
  lang: I18n.getLang(),
  htmlLang: document.documentElement.lang,
  stored: (() => { try { return localStorage.getItem('pp_lang'); } catch (e) { return 'illisible'; } })(),
  tip: document.getElementById('v2-btn-toc').getAttribute('data-tip') || '',
  modalShown: getComputedStyle(document.getElementById('settings-modal')).display !== 'none',
  radios: Array.from(document.querySelectorAll('input[name="settings-lang"]')).map(r => r.value + ':' + r.checked).join(' '),
}));
const takeAtReload = page => page.evaluate(() => { const v = sessionStorage.getItem('e2e_at_reload'); sessionStorage.removeItem('e2e_at_reload'); return v ? JSON.parse(v) : null; });
// Un clic qui doit recharger la page : on attend le rechargement, puis le widget prêt. Vrai si la page a rechargé ; faux sinon (le test le dit au lieu de s'arrêter).
async function clickAndReload(page, action) {
  const reloaded = page.waitForNavigation({ waitUntil: 'load', timeout: 40000 }).then(() => true, () => false);
  await action();
  const did = await reloaded;
  if (did) await ready(page);
  return did;
}
// Le clic ne doit PAS recharger la page : vrai quand rien ne part dans le délai donné.
const staysPut = async (page, ms = 1500) => page.waitForNavigation({ waitUntil: 'load', timeout: ms }).then(() => false, () => true);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
console.log(`\n=== 1. Rien n'attend d'être enregistré : un clic recharge la page, ${WIDTH}x${HEIGHT} ===`);
{
  const { context, page } = await openWidget();
  await page.evaluate(() => { window.__marker = 'avant'; });
  const start = await snapshot(page);
  check('la page démarre en français', start.lang === 'fr' && start.htmlLang === 'fr' && /sommaire/i.test(start.tip), start);
  await openSettings(page);
  const reloadedEn = await clickAndReload(page, () => realClick(page, 'input[name="settings-lang"][value="en"]'));
  const atEn = await takeAtReload(page);
  check('au moment où la page part, elle a encore sa langue d\'avant : rien n\'est retraduit sur place', !!atEn && atEn.lang === 'fr', atEn);
  const en = await snapshot(page);
  check('un vrai clic sur « English » recharge la page (le repère posé avant a disparu)', reloadedEn && en.marker === null, en);
  check('la page repart en anglais : <html lang>, langue gardée, info-bulle de la barre, fenêtre Réglages refermée',
    en.lang === 'en' && en.htmlLang === 'en' && en.stored === 'en' && /table of contents/i.test(en.tip) && !en.modalShown, en);
  await openSettings(page);
  const enRadios = await snapshot(page);
  check('Réglages rouvert : « English » est coché', /en:true/.test(enRadios.radios) && /fr:false/.test(enRadios.radios), enRadios.radios);
  await page.evaluate(() => { window.__marker = 'milieu'; });
  const reloadedFr = await clickAndReload(page, () => realClick(page, 'input[name="settings-lang"][value="fr"]'));
  const atFr = await takeAtReload(page);
  check('au retour, la page part elle aussi avec sa langue d\'avant', !!atFr && atFr.lang === 'en', atFr);
  const fr = await snapshot(page);
  check('un vrai clic sur « Français » recharge la page, qui repart en français et le garde',
    reloadedFr && fr.marker === null && fr.lang === 'fr' && fr.htmlLang === 'fr' && fr.stored === 'fr' && /sommaire/i.test(fr.tip) && !fr.modalShown, fr);
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
console.log(`\n=== 2. Une modification attend d'être enregistrée : la question passe d'abord, ${WIDTH}x${HEIGHT} ===`);
{
  const { context, page } = await openWidget({ autosave: false });
  await page.evaluate(() => { window.__marker = 'avant'; });
  // Frappe au vrai clavier dans le texte du modèle : le brouillon est « à enregistrer » (l'enregistrement automatique est coupé, il ne l'écrit pas tout seul).
  await realClick(page, '.tiptap p');
  await page.keyboard.press('End');
  await page.keyboard.type(' ' + TYPED);
  await page.waitForFunction(() => document.getElementById('status-msg').classList.contains('is-unsaved'), null, { timeout: 5000 }).catch(() => {});
  const dirty = await page.evaluate(() => document.getElementById('status-msg').classList.contains('is-unsaved'));
  check('le texte tapé est « à enregistrer » (enregistrement automatique coupé)', dirty);
  await openSettings(page);
  await realClick(page, 'input[name="settings-lang"][value="en"]');
  await page.waitForFunction(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
  await sleep(250);
  const asked = await page.evaluate(() => {
    const modal = document.getElementById('pp-dialog-modal');
    const box = modal && modal.querySelector('.pp-dialog-box');
    const buttons = Array.from(document.querySelectorAll('#pp-dialog-modal .var-modal-actions button')).filter(b => b.getClientRects().length > 0).map(b => b.textContent.trim());
    if (!box) return null;
    const r = box.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + 12);
    return {
      title: (document.getElementById('pp-dialog-title') || {}).textContent || '',
      message: (document.getElementById('pp-dialog-message') || {}).textContent || '',
      buttons,
      inFront: !!top && box.contains(top),
      inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    };
  });
  check('la question « Modifications non enregistrées » s\'ouvre devant Réglages, avec « Annuler », « Abandonner » et « Enregistrer »',
    !!asked && /Modifications non enregistrées/.test(asked.title) && /Contrat/.test(asked.message) && asked.buttons.join('|') === 'Annuler|Abandonner|Enregistrer' && asked.inFront && asked.inside, asked);
  const held = await snapshot(page);
  check('la page n\'a pas rechargé et garde sa langue : rien n\'est changé avant la réponse', held.marker === 'avant' && held.lang === 'fr' && held.stored === 'fr', held);

  // « Annuler » : la personne reste où elle en était, la case redit la langue de la page.
  await clickDialogButton(page, 'Annuler');
  const stayed = await staysPut(page, 1200);
  const afterCancel = await snapshot(page);
  const editorText = await page.evaluate(() => (document.querySelector('.tiptap') || {}).textContent || '');
  check('« Annuler » : la page ne recharge pas et garde sa langue', stayed && afterCancel.marker === 'avant' && afterCancel.lang === 'fr' && afterCancel.htmlLang === 'fr' && afterCancel.stored === 'fr', afterCancel);
  check('« Annuler » : la case « Français » est de nouveau cochée, la fenêtre Réglages reste ouverte', /fr:true/.test(afterCancel.radios) && /en:false/.test(afterCancel.radios) && afterCancel.modalShown, afterCancel.radios);
  check('« Annuler » : le texte tapé est toujours là, toujours à enregistrer', editorText.includes(TYPED) && await page.evaluate(() => document.getElementById('status-msg').classList.contains('is-unsaved')), editorText.slice(0, 60));

  // « Enregistrer » : le modèle est écrit avant que la page parte.
  await realClick(page, 'input[name="settings-lang"][value="en"]');
  await page.waitForFunction(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
  await sleep(250);
  const reloadedSave = await clickAndReload(page, () => clickDialogButton(page, 'Enregistrer'));
  const atSave = await takeAtReload(page);
  check('« Enregistrer » : le modèle est écrit dans le document avant que la page parte, qui a encore sa langue d\'avant', !!atSave && atSave.written === true && atSave.lang === 'fr', atSave);
  const saved = await snapshot(page);
  check('« Enregistrer » : la page rechargée repart en anglais', reloadedSave && saved.marker === null && saved.lang === 'en' && saved.htmlLang === 'en' && saved.stored === 'en', saved);
  await context.close();
}
{
  const { context, page } = await openWidget({ autosave: false });
  await realClick(page, '.tiptap p');
  await page.keyboard.press('End');
  await page.keyboard.type(' ' + TYPED);
  await page.waitForFunction(() => document.getElementById('status-msg').classList.contains('is-unsaved'), null, { timeout: 5000 }).catch(() => {});
  await openSettings(page);
  await realClick(page, 'input[name="settings-lang"][value="en"]');
  await page.waitForFunction(() => { const m = document.getElementById('pp-dialog-modal'); return !!m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
  await sleep(250);
  // « Abandonner » : la page part sans écrire le modèle.
  const reloadedDiscard = await clickAndReload(page, () => clickDialogButton(page, 'Abandonner'));
  const atDiscard = await takeAtReload(page);
  check('« Abandonner » : la page part sans avoir écrit le modèle', !!atDiscard && atDiscard.written === false && atDiscard.lang === 'fr', atDiscard);
  const discarded = await snapshot(page);
  check('« Abandonner » : la page rechargée repart en anglais', reloadedDiscard && discarded.lang === 'en' && discarded.htmlLang === 'en' && discarded.stored === 'en', discarded);
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
console.log(`\n=== 3. Stockage refusé : la langue change sur place, ${WIDTH}x${HEIGHT} ===`);
{
  const { context, page } = await openWidget({ refuseStorage: true });
  await page.evaluate(() => { window.__marker = 'avant'; });
  await openSettings(page);
  await realClick(page, 'input[name="settings-lang"][value="en"]');
  const stayed = await staysPut(page, 1500);
  const swapped = await snapshot(page);
  check('sans stockage, la langue ne survivrait pas au rechargement : la page ne recharge pas', stayed && swapped.marker === 'avant', swapped);
  check('la page passe en anglais sur place (<html lang>, info-bulle de la barre, case cochée)',
    swapped.lang === 'en' && swapped.htmlLang === 'en' && /table of contents/i.test(swapped.tip) && /en:true/.test(swapped.radios), swapped);
  await context.close();
}

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
