#!/usr/bin/env node
// Ouverture du widget au démarrage (js/main.js, fin d'init) : la ligne qui désigne un modèle (js/row-template.js, point 16 d'Antoine du 02/10) l'emporte, puis le modèle choisi
// pour la vue (js/view-template.js, « 16 bis » : « à chaque fois que l'on arrive dans la vue/page on a le même modèle »), puis le modèle par défaut du document (★). Une fois la page
// prête il est trop tard pour rejouer le démarrage : chaque cas sème le faux Grist AVANT l'init (window.__preSeedGristStub, comme dev-tests/verify-folder-default-mouse.mjs) avec
// ses modèles, ses options de widget et, quand il en faut une, la ligne reçue dès l'abonnement de js/main.js à grist.onRecord. À 700x400, la liste des modèles montre le modèle ouvert
// et le titre de la page est celui du modèle : on lit ce que voit la personne, pas seulement l'état interne.
// Lancé par run-headless.mjs (groupe Node "templateStartupMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-template-startup-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TEMPLATE_STARTUP_MOUSE_PORT || 8949);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-wheel-scroll.mjs.
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
if (!OFFLINE) console.log('[verify-template-startup-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
async function openPage(extraSeed) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
  const page = await context.newPage();
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
  await page.addInitScript(`window.__preSeedGristStub = (stub) => { ${extraSeed || ''} };`);
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  return page;
}


// Modèles : A (★ du document), B (modèle de la vue), C (désigné par une ligne), E (email). Les colonnes de la table des modèles sont celles du faux Grist plus TypeModele.
const seedFor = (opts) => `
  const m = stub.state.rows.Publipostage_Modeles;
  m.TypeModele = [];
  const add = (id, nom, html, def, type) => { m.id.push(id); m.Nom.push(nom); m.Contenu.push(html); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(def); m.TypeModele.push(type || 'document'); };
  add(1, 'Départ A défaut', '<p>Contenu A</p>', ${opts.star === false ? 'false' : 'true'}, 'document');
  add(2, 'Départ B de la vue', '<p>Contenu B</p>', false, 'document');
  add(3, 'Départ C de la ligne', '<p>Contenu C</p>', false, 'document');
  add(4, 'Départ E email', '<p>Contenu E</p>', false, 'email');
  stub.state.nextRowId.Publipostage_Modeles = 5;
  stub.setVariables('PpDepart', { Nom: 'Text', Statut: 'Choice' }, { Statut: ['Urgent', 'Autre'] });
  stub.state.options = ${JSON.stringify(opts.options || null)};
  ${opts.record ? `
  // La ligne arrive dès que js/main.js s'abonne (avant le chargement des modèles), comme une ligne déjà sélectionnée dans la page Grist.
  const rec = ${JSON.stringify(opts.record)};
  stub.state.recordCallbacks = Object.assign([], { push(entry) { Array.prototype.push.call(this, entry); entry.cb(rec, { tableId: 'PpDepart' }); return this.length; } });
  ` : ''}
`;

const shown = (page) => page.evaluate(() => {
  const trigger = document.querySelector('.tts-trigger');
  return { current: Templates.getCurrentId(), list: document.getElementById('template-select').value, name: document.getElementById('template-name').value, text: document.querySelector('.ProseMirror').textContent, trigger: trigger ? trigger.textContent.trim() : null };
});

async function startWith(label, opts, expectName, expectId) {
  const page = await openPage(seedFor(opts));
  const got = await shown(page);
  check(label, got.name === expectName && String(got.current) === String(expectId) && String(got.list) === String(expectId) && (got.trigger || '').startsWith(expectName.replace(/ ★$/, '')), got);
  return page;
}

let page = await startWith('sans réglage : le modèle par défaut du document (★) s\u2019ouvre', {}, 'Départ A défaut', 1);
await page.context().close();

page = await startWith('un modèle choisi pour la vue passe avant le ★', { options: { modeleDeLaVue: '2' } }, 'Départ B de la vue', 2);
await page.context().close();

page = await startWith('un modèle choisi pour la vue s\u2019ouvre même sans modèle par défaut dans le document', { star: false, options: { modeleDeLaVue: '2' } }, 'Départ B de la vue', 2);
await page.context().close();

page = await startWith('un choix de vue qui est devenu un email est ignoré : le ★ s\u2019ouvre', { options: { modeleDeLaVue: '4' } }, 'Départ A défaut', 1);
await page.context().close();

page = await startWith('un choix de vue dont le modèle n\u2019existe plus est ignoré : le ★ s\u2019ouvre', { options: { modeleDeLaVue: '99' } }, 'Départ A défaut', 1);
await page.context().close();

const ROW_RULES = { enabled: true, rules: [{ column: 'Statut', operator: '=', value: 'Urgent', modeleId: '3' }], otherwise: 'default' };
page = await startWith('la ligne qui désigne un modèle passe avant le modèle de la vue et le ★', { options: { modeleDeLaVue: '2', modeleSelonLigne: ROW_RULES }, record: { id: 1, Nom: 'L1', Statut: 'Urgent' } }, 'Départ C de la ligne', 3);
await page.context().close();

page = await startWith('une ligne sans règle qui correspond ouvre le modèle de la vue (« modèle par défaut »)', { options: { modeleDeLaVue: '2', modeleSelonLigne: ROW_RULES }, record: { id: 2, Nom: 'L2', Statut: 'Autre' } }, 'Départ B de la vue', 2);
await page.context().close();

page = await startWith('sans modèle de vue, une ligne sans règle qui correspond ouvre le ★', { options: { modeleSelonLigne: ROW_RULES }, record: { id: 3, Nom: 'L3', Statut: 'Autre' } }, 'Départ A défaut', 1);
// Puis une ligne qui correspond, reçue après le démarrage : le modèle de la ligne s'ouvre.
await page.evaluate(() => window.__gristStub.fireRecord({ id: 4, Nom: 'L4', Statut: 'Urgent' }, 'PpDepart'));
await page.waitForFunction(() => String(Templates.getCurrentId()) === '3', null, { timeout: 4000 }).catch(() => {});
const later = await shown(page);
check('puis une ligne qui correspond, reçue après le démarrage, ouvre le modèle de la ligne', later.name === 'Départ C de la ligne' && later.text === 'Contenu C', later);
await page.screenshot({ path: '/tmp/template-startup-700x400.png' }).catch(() => {});
await page.context().close();

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
