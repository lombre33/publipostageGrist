#!/usr/bin/env node
// Les images d'un AUTRE SITE (js/external-images.js ; demande d'Antoine du 24/11, « plus aucun appel externe dans le csp ») à 700x400 (le panneau d'Antoine), à la VRAIE souris
// (page.mouse) et au VRAI clavier, en clair, en sombre et en anglais, par le vrai clic sur les vrais boutons. Une image d'un autre site déjà enregistrée dans un document n'est plus
// jamais demandée à son site : elle reste dans le document (son adresse n'est ni modifiée ni perdue), son cadre dit le site et « Image non affichée », et aucun export ne la télécharge.
// Un vrai réseau de test : les adresses en « .test » sont servies par la page de Playwright (page.route) et CHAQUE requête est notée avec son type. Aucune ne doit partir, de quelque
// type que ce soit : c'est le fil rouge de tous les cas. Les téléchargements de fichiers sont les vrais (événement `download` de Playwright).
// Huit parties :
// 1) l'ÉDITEUR : un cadre par image d'un autre site (le site, puis « Image non affichée »), sans bouton ni adresse dans la page, l'image intégrée chargée ; taille d'écran du texte et du
//    cadre sur la feuille réduite du panneau, vrais pixels, contrastes, HTML du document intact ; le vrai clic sélectionne l'image comme n'importe quelle image ET ouvre la fenêtre qui
//    explique (une seule, son texte, le nombre d'images et les sites du document, aucune adresse, « Compris » au clavier, elle tient dans le panneau, contrastes) ; Échap la ferme, le focus
//    revient dans l'éditeur et l'image reste sélectionnée ; clair, sombre, anglais ;
// 2) la LECTURE : le même cadre, dessiné (SVG en data:), qui garde l'adresse dans data-blocked-src ; c'est un bouton (rôle, Tab, texte qui dit ce qu'il fait) : le vrai clic, puis Entrée et
//    Espace au vrai clavier ouvrent la même fenêtre, « Compris » et Échap la ferment et rendent le focus au cadre, qui porte un anneau de focus ; le document ne change pas ;
// 3) l'EN-TÊTE d'une feuille (aperçu paginé de l'éditeur) : le même cadre ;
// 4) les EXPORTS au vrai clic, un par un : PDF et Word d'une ligne, lot ZIP de deux lignes - aucune fenêtre ne précède plus l'export, aucune image n'est téléchargée, le coin d'état
//    dit combien d'images d'un autre site n'ont pas été reprises ; HTML et Markdown, qui n'écrivent que du texte, gardent l'adresse (rien n'est demandé non plus) ;
// 5) le FILET : une image d'un autre site qui chargerait quand même (une surface qui n'a pas pensé au cadre) reste signalée - contour en tirets rouges, infobulle - sur une vraie capture ;
// 6) l'INSERTION par adresse n'existe plus : le bouton « Insérer une image » est grisé, un vrai clic ouvre la bulle « Copiez l'image puis collez-la » ; clair, sombre et anglais ;
// 7) le rechargement de la page : le cadre revient, rien n'a été retenu ni écrit, aucune requête ;
// 8) aucune boîte native, aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node "externalImagesMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-external-images-mouse.mjs
// EXTERNAL_IMAGES_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.EXTERNAL_IMAGES_MOUSE_PORT || 8914);
const SHOTS = process.env.EXTERNAL_IMAGES_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-dialogs-mouse.mjs.
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/vfs_fonts\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@[\d.]+\/dist\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdf-lib@[\d.]+\/dist\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-external-images-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const DATA_PNG = 'data:image/png;base64,' + PNG.toString('base64');

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, acceptDownloads: true });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
const downloads = [];
const downloadFiles = [];
page.on('download', d => { downloads.push(d.suggestedFilename()); downloadFiles.push(d); });
const nativeDialogs = [];
page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });
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
// Les sites « .test » : servis par la page de test, et CHAQUE requête est notée avec son type ('fetch' = un téléchargement du widget, 'image' = un navigateur qui charge une <img>, 'other' =
// le reste). L'en-tête CORS laisse fetch lire la réponse, comme un vrai site qui l'autorise : si le widget téléchargeait encore, rien ne l'arrêterait ici - sauf ces compteurs, qui restent à zéro.
const net = { fetch: [], image: [], other: [] };
await page.route(url => url.hostname.endsWith('.test'), async route => {
  const request = route.request();
  const type = request.resourceType();
  (type === 'fetch' ? net.fetch : type === 'image' ? net.image : net.other).push(request.url());
  await route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: PNG });
});
const clearNet = () => { net.fetch.length = 0; net.image.length = 0; net.other.length = 0; };
const requestsAll = () => net.fetch.length + net.image.length + net.other.length;
const requestsTo = host => net.fetch.concat(net.image, net.other).filter(u => new URL(u).host === host).length;

// Les fenêtres (Dialogs) qui s'ouvrent : un compteur dans la page, posé une fois par chargement. Une fenêtre qui précéderait un export d'une ligne le ferait monter.
async function watchModal() {
  await page.evaluate(() => {
    if (window.__modalOpens !== undefined) return;
    window.__modalOpens = 0;
    // La fenêtre des demandes (Dialogs) n'est créée qu'à la première demande : on l'attend si elle n'existe pas encore.
    // Une fenêtre créée à cet instant est déjà ouverte : sa première ouverture compte aussi.
    const watch = (modal, created) => {
      let was = created ? false : modal.style.display !== 'none';
      const note = () => { const open = modal.style.display !== 'none'; if (open && !was) window.__modalOpens++; was = open; };
      new MutationObserver(note).observe(modal, { attributes: true, attributeFilter: ['style'] });
      if (created) note();
    };
    const existing = document.getElementById('pp-dialog-modal');
    if (existing) watch(existing, false);
    else new MutationObserver((records, observer) => { const modal = document.getElementById('pp-dialog-modal'); if (modal) { observer.disconnect(); watch(modal, true); } }).observe(document.body, { childList: true });
  });
}
const modalOpens = () => page.evaluate(() => window.__modalOpens);

// Ouvre (ou rouvre, `reload`) la page du widget et attend qu'elle soit prête.
async function openHarness(reload = false) {
  if (reload) await page.reload({ waitUntil: 'load' });
  else await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  await watchModal();
}
await openHarness();

// Centre d'un élément et ce qui s'y trouve réellement au premier plan.
async function hitTest(selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width,
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}
const seen = box => box.found && box.inViewport && box.onTop;
async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const isOpen = () => page.evaluate(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && ov.style.display !== 'none'; });
const statusText = () => page.evaluate(() => document.getElementById('status-msg').textContent);
const tr = (key, params) => page.evaluate(({ key, params }) => I18n.t(key, params), { key, params });
const clearStatus = () => page.evaluate(() => { document.getElementById('status-msg').textContent = ''; });
const OK = '#pp-dialog-modal .var-modal-primary';
// La fenêtre qui explique (js/external-images.js : explain) : ce qu'elle montre, où elle est dans le panneau, qui a le focus.
const EXPLAIN_BUTTON = '#pp-external-images-modal .pp-modal-actions button:not([hidden])';
const explainState = () => page.evaluate(() => {
  const ov = document.getElementById('pp-external-images-modal');
  if (!ov || ov.style.display === 'none') return { open: false, windows: document.querySelectorAll('#pp-external-images-modal').length };
  const box = ov.querySelector('.modal-content');
  const body = ov.querySelector('.pp-external-images-body');
  const r = box.getBoundingClientRect();
  const button = ov.querySelector('.pp-modal-actions button:not([hidden])');
  const b = button.getBoundingClientRect();
  const topAt = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  const a = document.activeElement;
  return {
    open: true, windows: document.querySelectorAll('#pp-external-images-modal').length, title: ov.querySelector('h3').textContent,
    paragraphs: Array.from(body.querySelectorAll(':scope > p')).map(p => p.textContent), steps: Array.from(body.querySelectorAll('ol li')).map(li => li.textContent),
    buttons: Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(x => !x.hidden).map(x => x.textContent),
    focus: a && a.closest && a.closest('#pp-external-images-modal') ? a.textContent : 'hors de la fenêtre : ' + (a && (a.id || a.className || a.tagName)),
    box: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) },
    button: { visible: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, onTop: !!topAt && (topAt === button || button.contains(topAt)) },
    bodyScrolls: body.scrollHeight > body.clientHeight + 1 || box.scrollHeight > box.clientHeight + 1, colors: { ink: getComputedStyle(body).color, muted: getComputedStyle(body.querySelector('.pp-external-images-sites')).color, paper: getComputedStyle(box).backgroundColor },
  };
});
// Les images d'un autre site du document et leurs sites, tels que la fenêtre doit les dire.
const explainTexts = async () => ({
  title: await tr('image.explain.title'), intro: await tr('image.explain.intro', { n: HOSTS.length }), sites: await tr('image.explain.sites', { n: HOSTS.length, sites: HOSTS.join(', ') }),
  close: await tr('image.explain.close'), how: await tr('image.explain.how'), kept: await tr('image.explain.kept'),
});
// Ce que la fenêtre dit, sa place dans le panneau 700×400 et le focus sur « Compris » : les vérifications communes à ses trois ouvertures (clic de l'éditeur, clic et clavier de la Lecture).
async function checkExplainWindow(NAME, label) {
  const st = await explainState();
  const want = await explainTexts();
  check(`${NAME} : la fenêtre qui explique s'ouvre, une seule dans la page, avec son titre « ${want.title} »`, st.open && st.windows === 1 && st.title === want.title, { open: st.open, windows: st.windows, title: st.title });
  check(`${NAME} : elle dit le nombre d'images (${HOSTS.length}), leurs sites dans l'ordre du document, le geste en trois temps et que le document garde l'adresse`,
    st.open && st.paragraphs[0] === want.intro && st.paragraphs[1] === want.sites && st.paragraphs[2] === want.how && st.steps.length === 3 && st.paragraphs[3] === want.kept, { paragraphs: st.paragraphs, steps: st.steps });
  check(`${NAME} : aucune adresse, ni chemin, n'y est écrite : seulement le nom de chaque site`, st.open && !/https?:|logo\d|\.png/.test(st.paragraphs.concat(st.steps).join(' ')), st.paragraphs);
  check(`${NAME} : un seul bouton, « ${want.close} », visible, au premier plan et déjà au clavier ; la fenêtre tient dans le panneau 700×400`,
    st.open && JSON.stringify(st.buttons) === JSON.stringify([want.close]) && st.focus === want.close && st.button.visible && st.button.onTop && st.box.l >= 0 && st.box.t >= 0 && st.box.r <= WIDTH && st.box.b <= HEIGHT, { buttons: st.buttons, focus: st.focus, button: st.button, box: st.box, scrolls: st.bodyScrolls });
  if (st.open) {
    const text = ratio(st.colors.ink, st.colors.paper), muted = ratio(st.colors.muted, st.colors.paper);
    check(`${NAME}, ${label} : le texte (${text.toFixed(1)}:1) et la ligne des sites (${muted.toFixed(1)}:1) se lisent sur la fenêtre, au moins 4,5:1`, text >= 4.5 && muted >= 4.5, st.colors);
  }
  return st;
}

// Centre d'un élément (amené dans la vue), vrai déplacement puis vrai clic.
async function centerOf(selector) {
  return page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return null;
    e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = e.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, onTop: !!top && (top === e || e.contains(top)) };
  }, selector);
}
async function realClick(selector, wait = 300) {
  const c = await centerOf(selector);
  if (!c) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(wait);
  return c;
}
async function realHover(selector) {
  const c = await centerOf(selector);
  if (!c) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 30, c.y + 5, { steps: 3 });
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.waitForTimeout(450);
}
async function click(selector) { const b = await hitTest(selector); if (b.found) await page.mouse.click(b.x, b.y); await page.waitForTimeout(200); return b; }
// Le verrou d'export (withExportLock, js/main.js) retire les clics du bouton ou de la ligne de menu (et grise le bouton) pendant l'export.
const isLocked = id => page.evaluate(id => document.getElementById(id).style.pointerEvents === 'none', id);
// Les images du document dans l'éditeur : celles d'un autre site ont leur cadre (aucune requête), l'intégrée est chargée.
const editorImages = () => page.evaluate(() => {
  const views = Array.from(document.querySelectorAll('.tiptap .editor-image-view'));
  const blocked = views.filter(v => v.classList.contains('editor-image-blocked'));
  const loaded = views.filter(v => !v.classList.contains('editor-image-blocked')).map(v => v.querySelector('img')).filter(i => i && i.complete && i.naturalWidth > 0);
  return { total: views.length, blocked: blocked.length, loaded: loaded.length };
});
// Luminance relative et rapport de contraste (WCAG) de deux couleurs « rgb(r, g, b) ».
const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const waitStatusIncludes = (text, timeout = 60000) => page.waitForFunction(t => document.getElementById('status-msg').textContent.includes(t), text, { timeout });
// L'événement `download` de Playwright arrive un instant APRÈS l'état « généré » : on l'attend avant de compter les fichiers.
async function waitDownload(pattern, timeout = 15000) {
  const startedAt = Date.now();
  while (!downloads.some(name => pattern.test(name)) && Date.now() - startedAt < timeout) await page.waitForTimeout(100);
}
const waitClosed = () => page.waitForFunction(() => document.getElementById('pp-dialog-modal').style.display === 'none', null, { timeout: 10000 });
// Le contenu d'un fichier téléchargé (texte), par son nom.
async function downloadedText(pattern) {
  const found = downloadFiles.filter(d => pattern.test(d.suggestedFilename())).pop();
  return found ? readFile(await found.path(), 'utf8') : null;
}

const badge = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;
const img = src => `<img class="editor-image" src="${src}" alt="Image" style="width: 60px;">`;
const HOSTS = ['images.exemple.test', 'cdn.autre.test:8443', 'logos.troisieme.test'];
const documentHtml = (hosts) => `<p>Dossier : ${badge('ExtDossiers', 'Titre')}</p>` + hosts.map((h, i) => img(`https://${h}/logo${i}.png`)).join('') + img(DATA_PNG);
async function seed(html) {
  await page.evaluate(async html => {
    const stub = window.__gristStub;
    stub.setVariables('ExtDossiers', { Titre: 'Text' });
    stub.setRows('ExtDossiers', [{ id: 1, Titre: 'Dossier A' }, { id: 2, Titre: 'Dossier B' }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Titre: 'Dossier A' }, 'ExtDossiers');
    // Un document vide d'abord : ProseMirror garde la vue d'une image identique, et sa langue serait celle du passage d'avant (le widget ne change de langue qu'au rechargement).
    Editor.setHTML('<p></p>');
    await new Promise(resolve => setTimeout(resolve, 50));
    Editor.setHTML(html);
  }, html);
  await page.waitForTimeout(500);
}

// Le type d'export (menu « Type d'export », à gauche d'« Exporter ») : le bouton et le menu « Exporter » suivent le type choisi. Choisi au vrai clic, seulement s'il change.
async function pickExportType(type) {
  if (await page.evaluate(() => document.getElementById('v2-export-type').value) === type) return;
  await realHover('#v2-btn-quality');
  await realClick('#v2-quality-flyout .v2-hover-row[data-export-type="' + type + '"]', 250);
}
// Un export au vrai clic, comme la personne le lance : `type` le type d'export à choisir d'abord (PDF par défaut), `lines` l'option de lignes à cocher dans le menu « Exporter » (une seule ligne
// par défaut ; 'zip' pour toutes les lignes en archive), puis le bouton Exporter. Le choix de lignes est remis à « une seule ligne » aussitôt après (la liste cachée), pour que l'export
// suivant exporte la ligne affichée.
async function startExport({ type = 'pdf', lines = 'one' }) {
  await pickExportType(type);
  if (lines !== 'one') {
    await realHover('#btn-export-pdf');
    await realClick('#v2-export-pdf-flyout .v2-hover-row[data-export-lines="' + lines + '"]', 250);
  }
  await realClick('#btn-export-pdf', 500);
  await page.evaluate(() => { document.getElementById('v2-export-lines').value = 'one'; if (typeof ExportChoices !== 'undefined') ExportChoices.remember('v2-export-lines', 'one'); });
}
const EXPORTS = {
  pdf: { type: 'pdf', button: 'btn-export-pdf', done: 'status.pdfGenerated', file: /\.pdf$/i },
  docx: { type: 'docx', button: 'btn-export-pdf', done: 'status.docxGenerated', file: /\.docx$/i },
  html: { type: 'html', button: 'btn-export-pdf', done: 'status.htmlGenerated', file: /\.html?$/i },
  md: { type: 'md', button: 'btn-export-pdf', done: 'status.mdGenerated', file: /\.md$/i },
};

// Le cadre d'une image d'un autre site sur une VRAIE capture : le fond clair de la feuille (même en thème sombre), le texte du site ; ni bouton, ni bleu.
async function paintOf(box) {
  const x = Math.max(0, Math.floor(box.left)), y = Math.max(0, Math.floor(box.top));
  const png = await page.screenshot({ clip: { x, y, width: Math.max(1, Math.min(WIDTH - x, Math.ceil(box.width))), height: Math.max(1, Math.min(HEIGHT - y, Math.ceil(box.height))) } });
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let light = 0, blue = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      if (r > 225 && g > 225 && b > 225) light++;
      else if (Math.abs(r - 47) < 40 && Math.abs(g - 111) < 40 && Math.abs(b - 237) < 40) blue++;
      else if (r < 90 && g < 90 && b < 110) dark++;
    }
    return { light: Math.round(light / (d.length / 4) * 100) / 100, blue, dark, pixels: d.length / 4 };
  }, png.toString('base64'));
}
// Pixels rouges (celui du contour, même adoucis) dans la bande du haut d'une VRAIE capture : le contour est tracé à l'intérieur de l'image, sur ses premiers pixels.
async function redPixels(box) {
  const png = await page.screenshot({ clip: { x: Math.max(0, Math.floor(box.left)), y: Math.max(0, Math.floor(box.top)), width: Math.max(1, Math.floor(box.width)), height: 6 } });
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let red = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 120 && d[i + 2] < 120 && d[i] - d[i + 1] > 60) red++;
    return red;
  }, png.toString('base64'));
}
// Le rectangle d'un élément, amené au milieu de la vue (la capture et le clic partent de là).
async function boxOf(selector) {
  return page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return null;
    e.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = e.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, selector);
}
const editorFrame = host => `.tiptap .editor-image-view.editor-image-blocked[data-blocked-site="${host}"]`;
const frameCount = root => page.evaluate(root => document.querySelectorAll(`${root} .editor-image-blocked, ${root} img[data-blocked-src]`).length, root);
const savedHtml = () => page.evaluate(() => Editor.getHTML());

// 1) L'ÉDITEUR : un cadre par image d'un autre site, sans bouton ni adresse ; taille d'écran du texte sur la feuille réduite, vrais pixels, contrastes, document intact ; le vrai clic sélectionne.
async function checkEditor(T, { dark = false, english = false } = {}) {
  const label = english ? 'en anglais' : (dark ? 'en sombre' : 'en clair');
  const site = HOSTS[0];
  clearNet();
  await seed(documentHtml(HOSTS));
  await page.mouse.move(2, 2);
  await page.waitForTimeout(900);
  const [note, aria, hint] = await Promise.all([tr('image.blocked.note'), tr('image.blocked.alt', { site }), tr('image.blocked.hint', { site })]);
  const info = await page.evaluate(selector => {
    const view = document.querySelector(selector);
    const sheet = document.querySelector('#editor-container .v2-page-sheet');
    const sheetZoom = sheet ? parseFloat(getComputedStyle(sheet).zoom) : 1;
    const frames = Array.from(document.querySelectorAll('.tiptap .editor-image-view.editor-image-blocked')).map(v => v.dataset.blockedSite);
    if (!view) return { found: false, frames, sheetZoom };
    view.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = e => { const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
    const box = view.querySelector('.editor-image-blocked-box'), siteLabel = view.querySelector('.editor-image-blocked-site'), noteLabel = view.querySelector('.editor-image-blocked-note');
    const cs = e => getComputedStyle(e);
    return {
      found: true, frames, sheetZoom, view: rect(view), box: rect(box), siteLabel: rect(siteLabel), noteLabel: rect(noteLabel), siteText: siteLabel.textContent, noteText: noteLabel.textContent,
      aria: box.getAttribute('aria-label'), role: box.getAttribute('role'), title: box.title, address: view.querySelector('img').getAttribute('src'),
      controls: box.querySelectorAll('button, a, input, select, [tabindex]').length + view.querySelectorAll('.editor-image-reveal').length,
      colors: { frame: cs(box).backgroundColor, ink: cs(siteLabel).color, soft: cs(noteLabel).color },
    };
  }, editorFrame(site));
  check(`${T}, éditeur : les ${HOSTS.length} images d’un autre site ont leur cadre à l’ouverture, l’image intégrée est chargée`, info.found && info.frames.length === HOSTS.length && JSON.stringify([...info.frames].sort()) === JSON.stringify([...HOSTS].sort()) && (await editorImages()).loaded === 1, { frames: info.frames, images: await editorImages() });
  check(`${T}, éditeur : aucune requête n’est partie vers ces sites (ni image, ni téléchargement : ${requestsAll()} requête)`, requestsAll() === 0, { fetch: net.fetch, image: net.image, other: net.other });
  check(`${T}, éditeur : le cadre n’a pas d’adresse dans la page (l’<img> n’a pas de src) et aucun bouton, lien ni champ : rien ne l’affiche`, !info.address && info.controls === 0, { address: info.address, controls: info.controls });
  check(`${T}, éditeur : la feuille est réduite dans ce panneau (zoom ${info.sheetZoom}) : c’est ce que le cadre doit compenser`, info.sheetZoom > 0 && info.sheetZoom < 0.95, info.sheetZoom);
  check(`${T}, éditeur : le cadre fait au moins 112 × 56 px à l’écran (${Math.round(info.view.width)} × ${Math.round(info.view.height)})`, info.view.width >= 111.5 && info.view.height >= 55.5, info.view);
  check(`${T}, éditeur : le cadre dit le site « ${site} » puis « ${note} », à leur taille d’écran sur la feuille réduite (lignes de ${Math.round(info.siteLabel.height)} et ${Math.round(info.noteLabel.height)} px)`,
    info.siteText === site && info.noteText === note && info.siteLabel.height >= 11.5 && info.noteLabel.height >= 11.5 && info.noteLabel.top >= info.siteLabel.bottom - 0.5, { siteText: info.siteText, noteText: info.noteText, siteLabel: info.siteLabel, noteLabel: info.noteLabel });
  check(`${T}, éditeur : les deux lignes tiennent dans le cadre`, [info.siteLabel, info.noteLabel].every(l => l.left >= info.box.left - 0.5 && l.right <= info.box.right + 0.5 && l.top >= info.box.top - 0.5 && l.bottom <= info.box.bottom + 0.5), { box: info.box, siteLabel: info.siteLabel, noteLabel: info.noteLabel });
  check(`${T}, éditeur : nom accessible « ${aria} » (image) et infobulle qui dit pourquoi et comment la garder`, info.role === 'img' && info.aria === aria && info.title === hint, { role: info.role, aria: info.aria, title: info.title });
  const contrastSite = ratio(info.colors.ink, info.colors.frame), contrastNote = ratio(info.colors.soft, info.colors.frame);
  check(`${T}, éditeur, ${label} : le site (${contrastSite.toFixed(1)}:1) et la note (${contrastNote.toFixed(1)}:1) se lisent sur le cadre, au moins 4,5:1`, contrastSite >= 4.5 && contrastNote >= 4.5, { colors: info.colors, contrastSite, contrastNote });
  check(`${T}, éditeur, ${label} : le cadre garde le papier clair, jamais le fond du thème`, lum(info.colors.frame) > 0.85, info.colors.frame);
  const paint = await paintOf(info.view);
  check(`${T}, éditeur, ${label} : sur une vraie capture, un fond clair (${Math.round(paint.light * 100)} %), le texte (${paint.dark} pixels sombres) et pas de bouton bleu (${paint.blue} pixel)`, paint.light >= 0.4 && paint.dark >= 20 && paint.blue < 5, paint);
  await snap(`cadre-${T}-editeur`);
  // Le vrai clic sur le cadre : il sélectionne l'image comme n'importe quelle image ET ouvre la fenêtre qui explique ; rien ne charge, le document ne bouge pas.
  const before = await savedHtml();
  await realClick(`${editorFrame(site)} .editor-image-blocked-box`, 600);
  const selected = await page.evaluate(sel => { const v = document.querySelector(sel); return !!v && v.classList.contains('editor-image-selected'); }, editorFrame(site));
  check(`${T}, éditeur : le vrai clic sur le cadre sélectionne l’image, n’envoie aucune requête (${requestsAll()}) et ne touche pas au document`, selected && requestsAll() === 0 && (await savedHtml()) === before, { selected, same: (await savedHtml()) === before, fetch: net.fetch, image: net.image });
  await checkExplainWindow(`${T}, éditeur, vrai clic sur le cadre`, label);
  await snap(`fenetre-${T}-editeur`);
  // Échap (le vrai clavier) ferme la fenêtre, le focus revient dans l'éditeur et l'image reste sélectionnée : Ctrl+V colle alors sur elle.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const back = await page.evaluate(sel => ({ closed: document.getElementById('pp-external-images-modal').style.display === 'none', inEditor: !!document.activeElement && !!document.activeElement.closest('.tiptap'), selected: document.querySelector(sel).classList.contains('editor-image-selected') }), editorFrame(site));
  check(`${T}, éditeur : Échap ferme la fenêtre, le focus revient dans l’éditeur et l’image reste sélectionnée`, back.closed && back.inEditor && back.selected, back);
  check(`${T}, éditeur : le document garde les ${HOSTS.length} adresses, sans cadre ni data:image/svg`, HOSTS.every((h, i) => before.includes(`src="https://${h}/logo${i}.png"`)) && !/data-blocked|image\/svg/.test(before), before.slice(0, 300));
}

// 2) La LECTURE : le même cadre, dessiné ; il garde l'adresse du document et n'a pas de rôle de bouton ; un vrai clic n'y change rien.
async function checkReader(T, { dark = false, english = false } = {}) {
  const label = english ? 'en anglais' : (dark ? 'en sombre' : 'en clair');
  const site = HOSTS[1];
  const frameSel = host => `#reader-container img[data-blocked-site="${host}"]`;
  clearNet();
  await seed(documentHtml(HOSTS));
  await realClick('#btn-mode-read', 700);
  await page.waitForSelector('#reader-container .reader-content img', { timeout: 15000 });
  await page.mouse.move(2, 2);
  await page.waitForTimeout(600);
  const [note, aria, hint] = await Promise.all([tr('image.blocked.note'), tr('image.blocked.alt', { site }), tr('image.blocked.hint', { site })]);
  const info = await page.evaluate(({ selector }) => {
    const frames = Array.from(document.querySelectorAll('#reader-container img[data-blocked-src]')).map(i => i.dataset.blockedSite).sort();
    const frame = document.querySelector(selector);
    const sheet = document.querySelector('#reader-container .reader-content');
    const sheetZoom = sheet ? parseFloat(getComputedStyle(sheet).zoom) : 1;
    if (!frame) return { found: false, frames, sheetZoom };
    frame.scrollIntoView({ block: 'center', inline: 'nearest' });
    const b = frame.getBoundingClientRect();
    return {
      found: true, frames, sheetZoom, rect: { left: b.left, top: b.top, width: b.width, height: b.height }, role: frame.getAttribute('role'), tab: frame.getAttribute('tabindex'),
      alt: frame.getAttribute('alt'), title: frame.getAttribute('title'), src: frame.getAttribute('src'), kept: frame.getAttribute('data-blocked-src'), background: getComputedStyle(frame).backgroundColor,
      label: frame.getAttribute('aria-label'), cursor: getComputedStyle(frame).cursor,
    };
  }, { selector: frameSel(site) });
  check(`${T}, Lecture : les ${HOSTS.length} images d’un autre site ont leur cadre dessiné`, JSON.stringify(info.frames) === JSON.stringify([...HOSTS].sort()), info.frames);
  check(`${T}, Lecture : aucune requête n’est partie vers ces sites (${requestsAll()})`, requestsAll() === 0, { fetch: net.fetch, image: net.image, other: net.other });
  const action = await tr('image.blocked.action', { site });
  check(`${T}, Lecture : le cadre garde l’adresse du document et son texte alternatif « ${aria} », et c’est un bouton (rôle, Tab, la main au survol) qui dit ce qu’il fait : « ${action} »`, info.found && info.role === 'button' && info.tab === '0' && info.label === action && info.cursor === 'pointer' && info.alt === aria && info.title === hint && info.src.startsWith('data:image/svg+xml') && info.kept === `https://${site}/logo1.png`, { role: info.role, tab: info.tab, label: info.label, cursor: info.cursor, alt: info.alt, title: info.title, kept: info.kept });
  const drawn = decodeURIComponent(info.src);
  const shownSite = site.length > 17 ? site.slice(0, 16) + '…' : site;   // le dessin du cadre tronque un hôte long (js/external-images.js:frameSrc)
  check(`${T}, Lecture : le cadre dessiné dit le site (« ${shownSite} ») et « ${note} » (${english ? 'en anglais' : 'en français'}), aucune adresse web n’y figure`, drawn.includes('>' + shownSite + '<') && drawn.includes('>' + note + '<') && !/https?:\/\//.test(drawn.replace('http://www.w3.org/2000/svg', '')), drawn.slice(0, 300));
  check(`${T}, Lecture : la feuille est réduite (zoom ${info.sheetZoom}) et le cadre fait pourtant au moins 112 × 56 px à l’écran (${Math.round(info.rect.width)} × ${Math.round(info.rect.height)})`, info.sheetZoom < 0.95 && info.rect.width >= 111.5 && info.rect.height >= 55.5, { zoom: info.sheetZoom, rect: info.rect });
  const paint = await paintOf(info.rect);
  check(`${T}, Lecture, ${label} : sur une vraie capture, un fond clair (${Math.round(paint.light * 100)} %), le texte (${paint.dark} pixels sombres), pas de bouton bleu (${paint.blue} pixel)`, paint.light >= 0.4 && paint.dark >= 20 && paint.blue < 5 && lum(info.background) > 0.85, { paint, background: info.background });
  await snap(`cadre-${T}-lecture`);
  const frameBox = await hitTest(frameSel(site));
  check(`${T}, Lecture : le cadre est dans la zone visible et au premier plan`, seen(frameBox), frameBox);
  await clearStatus();
  await realClick(frameSel(site), 600);
  const after = await page.evaluate(() => Array.from(document.querySelectorAll('#reader-container img[data-blocked-src]')).map(i => i.dataset.blockedSite).sort());
  check(`${T}, Lecture : le vrai clic sur le cadre ne change rien au document : mêmes cadres, aucune requête (${requestsAll()}), rien d’écrit dans le coin d’état`, JSON.stringify(after) === JSON.stringify([...HOSTS].sort()) && requestsAll() === 0 && (await statusText()) === '', { after, status: await statusText() });
  await checkExplainWindow(`${T}, Lecture, vrai clic sur le cadre`, label);
  await snap(`fenetre-${T}-lecture`);
  // « Compris » (vrai clic) ferme la fenêtre ; le focus revient sur le cadre, qui reste un cadre.
  const close = await tr('image.explain.close');
  await realClick(EXPLAIN_BUTTON, 400);
  const byButton = await page.evaluate(sel => ({ closed: document.getElementById('pp-external-images-modal').style.display === 'none', onFrame: document.activeElement === document.querySelector(sel) }), frameSel(site));
  check(`${T}, Lecture : « ${close} » (vrai clic) ferme la fenêtre et le focus revient sur le cadre`, byButton.closed && byButton.onFrame, byButton);
  // Le vrai clavier : Entrée, puis Espace, sur le cadre qui a le focus ouvrent la fenêtre (elle reste ouverte) ; Échap la ferme et rend le focus au cadre.
  for (const key of ['Enter', ' ']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(350);
    const opened = await explainState();
    check(`${T}, Lecture : ${key === ' ' ? 'Espace' : 'Entrée'} sur le cadre ouvre la fenêtre, qui reste ouverte, le focus sur « ${close} »`, opened.open && opened.focus === close, { open: opened.open, focus: opened.focus });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  const ring = await page.evaluate(sel => {
    const e = document.querySelector(sel); const cs = getComputedStyle(e);
    const zooms = []; for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const z = getComputedStyle(n).zoom; if (z && z !== '1') zooms.push(`${n.localName}${n.id ? '#' + n.id : ''}${n.className && typeof n.className === 'string' ? '.' + n.className.split(' ')[0] : ''}=${z}`); }
    return { focused: document.activeElement === e, style: cs.outlineStyle, width: cs.outlineWidth, offset: cs.outlineOffset, fit: cs.getPropertyValue('--pp-fit-zoom'), zooms, closed: document.getElementById('pp-external-images-modal').style.display === 'none' };
  }, frameSel(site));
  // La largeur lue est celle d'avant le zoom de la feuille : à l'écran, elle fait cette largeur × le zoom (un contour est arrondi au pixel d'écran entier, vers le bas).
  const ringOnScreen = parseFloat(ring.width) * (parseFloat(ring.fit) || 1);
  check(`${T}, Lecture : fenêtre fermée au clavier, le cadre a le focus et un anneau plein de 2 px d’écran (${ringOnScreen.toFixed(2)} px)`, ring.closed && ring.focused && ring.style === 'solid' && ringOnScreen >= 1.95, ring);
  await snap(`cadre-${T}-lecture-focus`);
  await realClick('#btn-mode-edit', 500);
}

// 3) L'EN-TÊTE d'une feuille (aperçu paginé de l'éditeur) : le même cadre.
async function checkZone(T) {
  const host = `entete-${T}.exemple.test`;
  await seed('<p>Corps du document</p>');
  clearNet();
  await page.evaluate(src => Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: `<p><img class="editor-image" src="${src}" alt="Logo" style="width: 90px;"></p>`, first: '' }, footer: { default: '', first: '' } }), `https://${host}/entete.png`);
  await page.waitForTimeout(800);
  const selector = `#editor-container .v2-hf-zone img[data-blocked-site="${host}"]`;
  const frame = await hitTest(selector);
  check(`${T}, en-tête de la feuille : l’image d’un autre site y a son cadre et aucune requête n’est partie (${requestsAll()})`, frame.found && requestsAll() === 0, { frame, fetch: net.fetch, image: net.image });
  const box = await boxOf(selector);
  const paint = await paintOf(box);
  check(`${T}, en-tête de la feuille : sur une vraie capture, le cadre se voit (${Math.round(paint.light * 100)} % de clair, ${paint.dark} pixels de texte), sans bouton (${paint.blue} pixel bleu), et fait au moins 112 × 56 px d’écran (${Math.round(box.width)} × ${Math.round(box.height)})`, paint.light >= 0.4 && paint.dark >= 20 && paint.blue < 5 && box.width >= 111.5 && box.height >= 55.5, { paint, box });
  await page.evaluate(() => Editor.setHeaderFooterData({ enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } }));
}

// 4) Les EXPORTS au vrai clic : aucune fenêtre avant l'export, aucune image téléchargée, le coin d'état dit ce qui n'a pas été repris.
async function runExport(T, kind) {
  const E = EXPORTS[kind];
  const NAME = `${T}, ${kind.toUpperCase()} d’une ligne`;
  clearNet(); downloads.length = 0;
  await seed(documentHtml(HOSTS));
  await clearStatus();
  const opensBefore = await modalOpens();
  await startExport(E);
  const done = await tr(E.done);
  const outside = await tr('status.imagesOutside', { n: HOSTS.length });
  await waitStatusIncludes(done);
  await waitDownload(E.file);
  const status = await statusText();
  check(`${NAME} : le vrai clic sur Exporter lance l’export tout de suite, aucune fenêtre ne le précède (plus de question sur les images d’un autre site)`, (await modalOpens()) === opensBefore && !(await isOpen()), { opens: (await modalOpens()) - opensBefore });
  check(`${NAME} : le fichier est produit et rien n’a été demandé aux ${HOSTS.length} sites (ni téléchargement, ni image : ${requestsAll()} requête)`, downloads.some(n => E.file.test(n)) && requestsAll() === 0, { downloads, fetch: net.fetch, image: net.image, other: net.other });
  check(`${NAME} : le coin d’état dit d’abord combien d’images d’un autre site n’ont pas été reprises, puis que le fichier est prêt : « ${outside} ${done} »`, status === `${outside} ${done}`, status);
  check(`${NAME} : le verrou d’export est rendu`, await isLocked(E.button) === false, await isLocked(E.button));
}

// Un lot ZIP : la question du lot (« Exporter les lignes ») est la seule fenêtre ; aucune image d'un autre site n'est demandée, pour aucune des deux lignes.
async function runBatch(T) {
  const NAME = `${T}, lot PDF (ZIP) de deux lignes`;
  clearNet(); downloads.length = 0;
  await seed(documentHtml(HOSTS));
  await clearStatus();
  const opensBefore = await modalOpens();
  await startExport({ type: 'pdf', lines: 'zip' });
  const title = await page.evaluate(() => { const ov = document.getElementById('pp-dialog-modal'); return ov.style.display !== 'none' ? ov.querySelector('h3').textContent : ''; });
  check(`${NAME} : la seule fenêtre est celle du lot (« Exporter les lignes »), aucune sur les images`, title === 'Exporter les lignes', title);
  await click(OK);
  await page.waitForFunction(() => /ZIP/.test(document.getElementById('status-msg').textContent) && /génér|generated/i.test(document.getElementById('status-msg').textContent), null, { timeout: 90000 });
  await waitDownload(/\.zip$/i);
  const status = await statusText();
  check(`${NAME} : « Générer » exporte les deux lignes dans une archive ZIP : UNE seule fenêtre en tout, aucune requête vers les sites (${requestsAll()})`, (await modalOpens()) - opensBefore === 1 && downloads.some(n => /\.zip$/i.test(n)) && requestsAll() === 0, { opened: (await modalOpens()) - opensBefore, downloads, fetch: net.fetch, image: net.image, other: net.other });
  check(`${NAME} : le coin d’état dit les images d’un autre site non reprises avant la fin du lot`, status.includes(await tr('status.imagesOutside', { n: HOSTS.length })), status);
}

// HTML et Markdown n'écrivent que du texte : l'adresse de l'image y reste (le widget ne la télécharge pas, c'est le lecteur du fichier qui le fera), rien n'est demandé non plus.
async function runTextExport(T, kind, expectation) {
  const E = EXPORTS[kind];
  const NAME = `${T}, ${kind === 'html' ? 'HTML' : 'Markdown'} d’une ligne`;
  clearNet(); downloads.length = 0;
  await seed(documentHtml(HOSTS));
  await clearStatus();
  const opensBefore = await modalOpens();
  await startExport(E);
  await waitStatusIncludes(await tr(E.done));
  await waitDownload(E.file);
  const text = await downloadedText(E.file);
  check(`${NAME} : aucune fenêtre, aucune requête vers les sites (${requestsAll()}), le fichier est produit`, (await modalOpens()) === opensBefore && requestsAll() === 0 && downloads.some(n => E.file.test(n)), { downloads, fetch: net.fetch, image: net.image });
  check(`${NAME} : le fichier garde l’adresse de chaque image d’un autre site et l’image intégrée (texte seul : rien n’est téléchargé)`, !!text && HOSTS.every((h, i) => text.includes(`https://${h}/logo${i}.png`)) && expectation(text), text && text.slice(0, 400));
}

// 5) Le FILET : une image d'un autre site qui chargerait quand même (une surface qui n'a pas pensé au cadre) reste signalée : contour en tirets rouges, hôte, infobulle, sur une vraie capture.
const DASHED_RED = o => !!o && o.style === 'dashed' && o.color === 'rgb(197, 48, 48)' && parseFloat(o.width) >= 1 && parseFloat(o.width) <= 3;
async function checkSafetyNet(T) {
  const host = `filet-${T}.exemple.test`;
  clearNet();
  await page.evaluate(h => {
    const leak = document.createElement('img');
    leak.id = 'pp-test-leak';
    leak.src = `https://${h}/fuite.png`;
    leak.style.cssText = 'position: fixed; left: 8px; top: 8px; width: 90px; height: 60px; z-index: 99999; background: #fff;';
    document.body.appendChild(leak);
  }, host);
  await page.waitForFunction(() => { const i = document.getElementById('pp-test-leak'); return !!i && i.hasAttribute('data-external-site') && i.complete; }, null, { timeout: 10000 });
  await page.mouse.move(300, 300);
  await page.waitForTimeout(200);
  const outline = await page.evaluate(() => { const e = document.getElementById('pp-test-leak'); const css = getComputedStyle(e); return { style: css.outlineStyle, width: css.outlineWidth, color: css.outlineColor, site: e.getAttribute('data-external-site'), title: e.title }; });
  const tip = await tr('image.externalSite', { site: host });
  check(`${T}, filet : une image qui charge depuis un autre site porte son hôte, l’infobulle et un contour de 3 px en tirets rouges`, outline.site === host && outline.title === tip && DASHED_RED(outline), outline);
  const red = await redPixels(await boxOf('#pp-test-leak'));
  check(`${T}, filet : les tirets rouges se voient sur une vraie capture (${red} pixels rouges au bord de l’image)`, red >= 25, red);
  await page.evaluate(() => document.getElementById('pp-test-leak').remove());
}

// 6) L'insertion par adresse n'existe plus (demande d'Antoine du 24/11 : « plus aucun appel externe dans le csp, import image que par C/C ou depuis une PJ grist ») : le bouton
// « Insérer une image » reste dans la barre, GRISÉ ; un vrai clic ne demande aucune adresse, n'insère rien, n'envoie aucune requête et ouvre la bulle qui dit comment faire
// (copier l'image puis la coller) ; clair, sombre et anglais.
async function runInsert(T, { dark = false, english = false } = {}) {
  if (dark) await page.evaluate(() => Settings.setTheme('dark'));
  if (english) await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(200);
  await page.evaluate(() => Editor.setHTML('<p>Texte</p>'));
  clearNet();
  await page.waitForTimeout(150);
  const reason = await tr('lock.imagePaste');
  const grey = await page.evaluate(() => { const b = document.getElementById('v2-btn-image'); return { locked: b.classList.contains('v2-hf-locked'), blocks: b.hasAttribute('data-pp-lock-blocks'), title: b.getAttribute('title') }; });
  check(`${T}, image : le bouton « Insérer une image » est grisé, son info-bulle dit comment faire`, grey.locked && grey.blocks && grey.title === reason, grey);
  await realClick('#v2-btn-image', 300);
  const bubble = await page.evaluate(() => ({ open: LockBubble.isOpen(), onButton: LockBubble.current() === document.getElementById('v2-btn-image'), text: (document.querySelector('.pp-lockbubble-why') || {}).textContent || '' }));
  check(`${T}, image : un clic réel n'ouvre aucune fenêtre de saisie, ne demande rien et n'insère rien`, !(await isOpen()) && (await page.evaluate(() => document.querySelectorAll('.tiptap img').length)) === 0, { open: await isOpen() });
  check(`${T}, image : la bulle sous le bouton dit de copier l'image puis de la coller`, bubble.open && bubble.onButton && bubble.text === reason, bubble);
  check(`${T}, image : aucune requête n'est partie vers un autre site`, requestsAll() === 0, { fetch: net.fetch, image: net.image });
  await snap(`insertion-${T}-bouton-grise`);
  await realClick('#v2-btn-image', 300);
  check(`${T}, image : un second clic referme la bulle`, !(await page.evaluate(() => LockBubble.isOpen())));
  if (dark) await page.evaluate(() => Settings.setTheme('light'));
  if (english) await page.evaluate(() => I18n.setLang('fr'));
}

// 7) Le rechargement : rien n'a été retenu ni écrit (ni localStorage, ni sessionStorage, ni action dans le document Grist), le cadre revient, aucune requête vers le site.
// Dernière partie : le rechargement repart d'une page neuve.
async function runReload(T) {
  const host = `recharge-${T}.exemple.test`;
  const stored = () => page.evaluate(() => JSON.stringify({ local: Object.entries(localStorage).sort(), session: Object.entries(sessionStorage).sort() }));
  const written = () => page.evaluate(() => window.__gristStub.getActionLog().length);
  const storedBefore = await stored(), writtenBefore = await written();
  clearNet();
  await seed(documentHtml([host]));
  await page.waitForTimeout(500);
  check(`${T}, rechargement : le site a son cadre, aucune requête n'est partie (${requestsTo(host)}), rien n'a été écrit (ni localStorage, ni sessionStorage, ni action dans le document Grist)`,
    (await frameCount('.tiptap')) === 1 && requestsTo(host) === 0 && (await stored()) === storedBefore && (await written()) === writtenBefore, { frames: await frameCount('.tiptap'), before: storedBefore, after: await stored(), actions: await written() });
  await openHarness(true);
  clearNet();
  await seed(documentHtml([host]));
  await page.waitForTimeout(500);
  check(`${T}, rechargement : la page rechargée montre le cadre et n'a envoyé aucune requête vers le site (${requestsTo(host)}), le document garde l'adresse`, (await frameCount('.tiptap')) === 1 && requestsTo(host) === 0 && (await savedHtml()).includes(`https://${host}/logo0.png`), { frames: await frameCount('.tiptap'), image: net.image });
}

async function run(T, { dark = false, english = false } = {}) {
  if (dark) await page.evaluate(() => Settings.setTheme('dark'));
  if (english) await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(200);
  await checkEditor(T, { dark, english });
  await checkReader(T, { dark, english });
  if (!dark && !english) await checkZone(T);
  await runExport(T, 'pdf');
  if (!dark) await runExport(T, 'docx');
  if (english) check(`${T}, PDF : le coin d’état est en anglais (« 3 images from other sites left out. PDF generated. »)`, (await tr('status.imagesOutside', { n: 3 })) === '3 images from other sites left out.' && (await tr('status.pdfGenerated')) === 'PDF generated.', await tr('status.imagesOutside', { n: 3 }));
  if (!dark && !english) {
    await runBatch(T);
    await runTextExport(T, 'html', text => text.includes('data:image/png;base64,'));
    await runTextExport(T, 'md', text => /<img src="https:\/\/images\.exemple\.test\/logo0\.png"[^>]*>|!\[[^\]]*\]\(https:\/\/images\.exemple\.test\/logo0\.png\)/.test(text));
    await pickExportType('pdf');
    await checkSafetyNet(T);
  }
  if (dark) await page.evaluate(() => Settings.setTheme('light'));
  if (english) await page.evaluate(() => I18n.setLang('fr'));
}

// Un arrêt (un élément manque) est un échec rapporté, pas un plantage : le navigateur est fermé dans tous les cas.
try {
  await run('clair');
  await run('sombre', { dark: true });
  await run('anglais', { english: true });
  await runInsert('clair');
  await runInsert('sombre', { dark: true });
  await runInsert('anglais', { english: true });
  await runReload('clair');
} catch (e) { total++; failures++; console.log('  FAIL - le parcours s’arrête : ' + e.message); }

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
