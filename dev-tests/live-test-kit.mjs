// Le socle des essais de l'écriture en direct dans un vrai navigateur (verify-live-editor.mjs, verify-live-mouse.mjs, verify-live-gfs.mjs) : un serveur, un navigateur, des pages du widget
// (700x400) qui partagent UNE table du direct côté Node (dev-tests/fake-live-table.mjs, derrière `grist.docApi` de chaque page) et un GFS simulé (dev-tests/gfs-stub.js) qui donne le fichier
// assemblé « edition-live » (consigne GFS 012, copie du miroir hors-ligne dev-tests/.offline-cache/edition-live/, que `bash dev-tests/offline-deps.sh` y construit) sous la forme exigée : <script type="module">,
// empreinte, `crossorigin="anonymous"`, avec l'en-tête CORS qu'exige un sous-cadre sans `allow-same-origin`.
// Ce que ce fichier ne fait pas : aucune assertion (chaque script a les siennes), aucune écriture hors du harnais _test-harness.html que tous les essais régénèrent.
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { LiveTable } from './fake-live-table.mjs';
import { ISOLATED_SANDBOX } from './gfs-page.mjs';   // les drapeaux du cadre où GFS fait tourner chaque app : pas d'allow-same-origin (consigne 011)

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const WIDTH = 700;
export const HEIGHT = 400;
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const GFS_STUB = join(ROOT, 'dev-tests', 'gfs-stub.js');
const LIVE_FILE = join(CACHE, 'edition-live', 'edition-live.js');
export const LIVE_PATH = '/vendor/edition-live/1.0.0/edition-live.js';
export const TABLE_ID = 'Publipostage_Direct';


const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

// Le harnais : index.html dont l'API de Grist est celle du faux Grist (même régénération que les autres essais).
async function regenerateHarness() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  await writeFile(join(ROOT, '_test-harness.html'), html.replace('<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>', '<script src="dev-tests/grist-stub.js"></script>'));
}

// La page de test qui ne dépend pas du réseau : les modules d'esm.sh et les bibliothèques de cdnjs / jsdelivr viennent du miroir hors-ligne quand il existe.
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
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

export const liveFileExists = existsSync(LIVE_FILE);
// L'empreinte du fichier assemblé que le GFS simulé donne (sha384, comme les contrats de GFS 2.6 point 9).
export const liveIntegrity = liveFileExists ? 'sha384-' + createHash('sha384').update(readFileSync(LIVE_FILE)).digest('base64') : '';

// Les modèles du faux document : [{ id, nom, contenu, type, def }]. La ligne reçue dès l'abonnement est « L1 » de la table de la page « PpDepart ».
export const seedScript = (templates, identity) => `
  const m = stub.state.rows.Publipostage_Modeles;
  m.TypeModele = [];
  const add = (id, nom, contenu, def, type) => { m.id.push(id); m.Nom.push(nom); m.Contenu.push(contenu); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(def); m.TypeModele.push(type); };
  ${templates.map(t => `add(${t.id}, ${JSON.stringify(t.nom)}, ${JSON.stringify(t.contenu)}, ${!!t.def}, ${JSON.stringify(t.type || 'document')});`).join('\n  ')}
  stub.state.nextRowId.Publipostage_Modeles = ${Math.max(...templates.map(t => t.id)) + 1};
  stub.setVariables('PpDepart', { Nom: 'Text' });
  ${identity ? `stub.setUserEmail(${JSON.stringify(identity.email)}); stub.setUserName(${JSON.stringify(identity.name)});` : ''}
  const rec = { id: 1, Nom: 'L1' };
  stub.state.recordCallbacks = Object.assign([], { push(entry) { Array.prototype.push.call(this, entry); entry.cb(rec, { tableId: 'PpDepart' }); return this.length; } });
`;

// La page de premier niveau qui joue GFS pour un widget dans un sous-cadre (`framed`) : le GFS simulé (dev-tests/gfs-stub.js) en mode parent, qui répond au contexte et à l'installation par postMessage
// et renvoie l'événement `extensions` (`window.__gfsStub.send()`), comme l'hôte d'une app. `library` : { src, integrite, forme } que GFS donne pour « edition-live » (null : il ne la donne pas).
const hostPage = ({ extensions, library }) => `<!doctype html><meta charset="utf-8"><title>hôte GFS simulé</title><body style="margin:0">
<script>window.__gfsStubParent = 'app';</script><script src="/dev-tests/gfs-stub.js"></script>
<script>Object.assign(window.__gfsStub, ${JSON.stringify({ extensions, editionLive: library })});</script>
<iframe name="app" sandbox="${ISOLATED_SANDBOX}" src="/_test-harness.html?gfs=0" style="display:block;width:${WIDTH}px;height:${HEIGHT}px;border:0"></iframe>`;

// La table du direct, côté page : les appels de `grist.docApi` qui la touchent partent vers le Node (la table partagée), les autres restent au faux Grist de la page. La table des modèles est
// recopiée d'une page à l'autre (`__replicate`, quand le kit en reçoit l'ordre) : chaque page a son faux Grist, mais deux personnes du même document lisent les mêmes modèles.
const BRIDGE = `
  const real = window.grist.docApi;
  const touches = actions => actions.some(action => action[1] === ${JSON.stringify(TABLE_ID)});
  const writesModels = actions => actions.some(action => action[1] === 'Publipostage_Modeles');
  window.__applyReplicated = actions => real.applyUserActions(actions);
  window.grist.docApi = Object.assign({}, real, {
    listTables: async () => { const tables = await real.listTables(); return (await window.__liveBridge('listTables')).length ? tables.concat([${JSON.stringify(TABLE_ID)}]) : tables; },
    fetchTable: (id) => (id === ${JSON.stringify(TABLE_ID)} ? window.__liveBridge('fetchTable') : real.fetchTable(id)),
    applyUserActions: async (actions) => {
      if (touches(actions)) return window.__liveBridge('applyUserActions', actions);
      const done = await real.applyUserActions(actions);
      if (writesModels(actions) && window.__replicate) await window.__replicate(actions);
      return done;
    },
  });
`;

export async function startKit({ port, tag = 'live' }) {
  await regenerateHarness();
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === LIVE_PATH) {
        if (!liveFileExists) { res.writeHead(404).end('fichier assemblé absent'); return; }
        // L'en-tête CORS : un sous-cadre sans `allow-same-origin` (l'origine opaque d'une app hébergée par GFS) ne charge un module qu'avec lui.
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
        res.end(await readFile(LIVE_FILE));
        return;
      }
      const filePath = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
      if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const info = await stat(filePath);
      const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
      // GitHub Pages répond avec Access-Control-Allow-Origin: * : un sous-cadre à origine opaque (bac à sable sans allow-same-origin) charge ainsi les modules du widget.
      res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      res.end(await readFile(target));
    } catch { res.writeHead(404).end('not found'); }
  });
  await new Promise((ok, ko) => server.listen(port, '127.0.0.1', ok).on('error', ko));
  const base = `http://127.0.0.1:${port}`;
  const require = createRequire(import.meta.url);
  const { chromium } = require('/opt/node22/lib/node_modules/playwright');
  const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
  const pageErrors = [];
  const pages = [];   // les pages ouvertes : la table des modèles s'écrit dans toutes

  // La bibliothèque « edition-live » telle que GFS la donne, selon le cas d'essai de `openPage`.
  const libraryFor = editionLive => (editionLive === 'good' ? { src: LIVE_PATH, integrite: liveIntegrity, forme: 'module' }
    : editionLive === 'badIntegrity' ? { src: LIVE_PATH, integrite: 'sha384-' + 'A'.repeat(64), forme: 'module' }
      : editionLive === 'missing' ? { src: LIVE_PATH.replace('1.0.0', '9.9.9'), integrite: liveIntegrity, forme: 'module' }
        : editionLive === 'noForm' ? { src: LIVE_PATH, integrite: liveIntegrity }
          : editionLive === 'foreign' ? { src: 'https://autre.example/edition-live.js', integrite: liveIntegrity, forme: 'module' } : null);

  // Une page du widget. `table` : la table du direct partagée (un LiveTable) ; `identity` : { name, email } de la personne ; `extensions` : ce que le GFS simulé dit actif ; `editionLive` : 'good' (le
  // fichier et son empreinte), 'badIntegrity' (une empreinte fausse), 'missing' (une adresse qui n'existe pas), null (GFS ne donne pas la bibliothèque) ; `hosted: false` : le widget seul ;
  // `framed` : le widget dans un sous-cadre comme celui d'une app de GFS (bac à sable SANS allow-same-origin, origine opaque) - la page de premier niveau joue alors GFS (`window.__gfsStub`, le GFS
  // simulé en mode parent) et le widget tourne dans `view` (le Frame), pas dans `page`.
  async function openPage({ table, identity, templates, extensions = ['edition'], editionLive = 'good', hosted = true, framed = false, lang = 'fr', colorScheme = 'light', bypassCSP = true, waitReady = true, extraInit = '' }) {
    const context = await browser.newContext(Object.assign({ bypassCSP, viewport: { width: WIDTH, height: HEIGHT }, colorScheme }, framed ? { locale: lang === 'en' ? 'en-US' : 'fr-FR' } : {}));   // le cadre isolé refuse le stockage local : la langue vient du navigateur
    const page = await context.newPage();
    const requests = [];
    const natives = [];
    page.on('request', request => requests.push(request.url()));
    page.on('dialog', async (dialog) => { natives.push(dialog.type() + ' : ' + dialog.message()); await dialog.dismiss(); });
    page.on('pageerror', (e) => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
    if (OFFLINE) {
      await page.route('**://esm.sh/**', async (route) => {
        const url = route.request().url();
        const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
        if (chunk) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
        const spec = Object.keys(esmMap).find(k => url === `https://esm.sh/${k}` || url === `https://esm.sh/*${k}` || url.startsWith(`https://esm.sh/${k}@`) || url.startsWith(`https://esm.sh/*${k}@`));
        if (!spec) return route.fulfill({ status: 404, body: `// pas de miroir local pour ${url}` });
        route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: absoluteChunks(await readFile(join(ROOT, esmMap[spec].replace(/^\//, '')), 'utf8')) });
      });
      for (const [re, rel] of UMD_ROUTES) {
        await page.route(re, async route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: await readFile(join(CACHE, rel), 'utf8') }));
      }
      await page.route('**://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      await page.route('**://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
    }
    const opened = { page };
    if (table) {
      await page.exposeFunction('__liveBridge', async (method, payload) => {
        if (method === 'listTables') return await table.listTables();
        if (method === 'fetchTable') return await table.fetchTable();
        if (method === 'applyUserActions') return await table.applyUserActions(payload);
        throw new Error('pont du direct : appel inconnu ' + method);
      });
      await page.exposeFunction('__replicate', async (actions) => {
        for (const other of pages) {
          if (other.page === page || other.page.isClosed()) continue;
          try { await other.page.evaluate(sent => window.__applyReplicated(sent), actions); } catch (e) { /* une page qui se ferme */ }
        }
      });
    }
    pages.push(opened);
    // Les refus de la politique de sécurité du contenu (index.html), notés dans la page et ses sous-cadres : `window.__cspViolations`.
    await page.addInitScript(() => { window.__cspViolations = []; document.addEventListener('securitypolicyviolation', (e) => { window.__cspViolations.push(e.effectiveDirective + ' ' + e.blockedURI); }, true); });
    await page.addInitScript(({ language }) => { try { localStorage.setItem('pp_lang', language); } catch (e) { /* stockage indisponible */ } }, { language: lang });
    await page.addInitScript(`window.__preSeedGristStub = (stub) => { ${seedScript(templates, identity)} ${table ? BRIDGE : ''} ${extraInit} };`);
    const library = libraryFor(editionLive);
    if (hosted && !framed) {
      await page.addInitScript({ path: GFS_STUB });
      await page.addInitScript(`Object.assign(window.__gfsStub, ${JSON.stringify({ extensions, editionLive: library })});`);
    }
    let view = page;      // là où tourne le widget : la page, ou son sous-cadre
    if (framed) {
      await page.route(`${base}/__hote-gfs.html`, route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: hostPage({ extensions, library }) }));
      await page.goto(`${base}/__hote-gfs.html`, { waitUntil: 'load' });
      view = page.frame({ name: 'app' });
    } else {
      await page.goto(`${base}/_test-harness.html${hosted ? '?gfs=0' : ''}`, { waitUntil: 'load' });
    }
    if (waitReady) {
      await view.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
      await view.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
    }
    return { page, view, context, requests, natives, table };
  }

  async function close() { await browser.close(); server.close(); }
  return { base, browser, openPage, close, pageErrors, newTable: options => new LiveTable(options), tag };
}

// Ce que l'éditeur d'une page montre : son texte (sans les curseurs des autres), son HTML enregistrable, le nombre de plugins.
export const editorText = page => page.evaluate(() => EditorCore.getEditor().state.doc.textContent);
export const editorHtml = page => page.evaluate(() => Editor.getHTML());
// Ce que LiveControl sait de la session de la page (null : éteinte).
export const liveDebug = page => page.evaluate(() => (typeof LiveControl === 'undefined' ? null : LiveControl.debug()));
export const liveState = page => page.evaluate(() => LiveEntry.state());

// ---- Les gestes communs aux essais (une page, ou le sous-cadre `view` d'une page `framed`) ----------------------------------------------------------------------------------------------

// La fenêtre de dialogue du widget (js/dialogs.js) : ouverte ou refermée, son contenu, ses boutons visibles. Ces trois fonctions tournent DANS la page : elles ne dépendent de rien d'autre.
export const dialogShown = () => { const m = document.getElementById('pp-dialog-modal'); return !!m && m.style.display !== 'none' && m.getBoundingClientRect().height > 0; };
export const dialogGone = () => { const m = document.getElementById('pp-dialog-modal'); return !m || m.style.display === 'none' || m.getBoundingClientRect().height === 0; };
export const dialogInfo = () => {
  const m = document.getElementById('pp-dialog-modal');
  return { title: document.getElementById('pp-dialog-title').textContent, text: m.textContent, buttons: Array.from(m.querySelectorAll('.var-modal-actions button')).filter(b => b.offsetParent !== null).map(b => b.textContent) };
};
export const pressDialogButton = (view, label) => view.evaluate((wanted) => {
  const button = Array.from(document.querySelectorAll('#pp-dialog-modal .var-modal-actions button')).find(b => b.offsetParent !== null && new RegExp(wanted).test(b.textContent));
  if (button) button.click();
  return !!button;
}, label);

// Allume l'écriture en direct. `ask` : la question « Rejoindre ? » doit venir ; on y répond `answer` ('Rejoindre' ou 'Annuler'). Rend { started, asked }.
export async function startLive(view, { ask = false, answer = 'Rejoindre' } = {}) {
  const done = view.evaluate(() => LiveEntry.toggle());
  let asked = null;
  if (ask) {
    await view.waitForFunction(dialogShown, null, { timeout: 15000 });
    asked = await view.evaluate(dialogInfo);
    await pressDialogButton(view, answer);
  }
  return { started: await done, asked };
}
export const stopLive = async (view) => { await view.evaluate(() => LiveEntry.stop()); await view.waitForFunction(() => LiveEntry.state() === 'off', null, { timeout: 15000 }); };
// Attend que toutes les vues montrent le même HTML ; rend ce HTML, ou null.
export async function converge(views, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const all = await Promise.all(views.map(editorHtml));
    if (all.every(html => html === all[0])) return all[0];
    await new Promise(done => setTimeout(done, 150));
  }
  return null;
}
// Tape au clavier (celui de la page de premier niveau `page`) dans l'éditeur de `view` (la page, ou son sous-cadre), au début ou à la fin.
export async function typeAt(page, where, text, view = page) {
  await view.evaluate((w) => EditorCore.getEditor().commands.focus(w), where);
  await page.keyboard.type(text, { delay: 12 });
}

// Attend qu'une condition, évaluée dans la page, soit vraie.
export async function until(page, fn, arg, timeout = 15000) {
  await page.waitForFunction(fn, arg, { timeout });
}
