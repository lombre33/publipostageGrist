#!/usr/bin/env node
// Ouverture du widget au démarrage (js/main.js, fin d'init) : la ligne qui désigne un modèle (js/row-template.js, point 16 d'Antoine du 02/10) l'emporte, puis le modèle choisi
// pour la vue (js/view-template.js, « 16 bis » : « à chaque fois que l'on arrive dans la vue/page on a le même modèle »), puis le modèle par défaut du document (★). Une fois la page
// prête il est trop tard pour rejouer le démarrage : chaque cas sème le faux Grist AVANT l'init (window.__preSeedGristStub, comme dev-tests/verify-folder-default-mouse.mjs) avec
// ses modèles, ses options de widget et, quand il en faut une, la ligne reçue dès l'abonnement de js/main.js à grist.onRecord. À 700x400, la liste des modèles montre le modèle ouvert
// et le titre de la page est celui du modèle : on lit ce que voit la personne, pas seulement l'état interne.
// Depuis le 08/10, le modèle de la vue peut être un email ou un macro-modèle (« mail et macro modèle peuvent être des modèles par défaut d'une vue ») : il s'ouvre au démarrage comme
// un autre, et « sinon : modèle par défaut » d'une règle de ligne le suit. Le ★ du document, lui, reste réservé aux modèles ordinaires (dev-tests/scenarios-template-tree.js).
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


// Modèles : A (★ du document), B (modèle de la vue), C (désigné par une ligne), E (email), M (macro-modèle, page de garde = B). Les colonnes de la table des modèles sont celles du faux
// Grist plus TypeModele.
const seedFor = (opts) => `
  const m = stub.state.rows.Publipostage_Modeles;
  m.TypeModele = [];
  const add = (id, nom, html, def, type) => { m.id.push(id); m.Nom.push(nom); m.Contenu.push(html); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(def); m.TypeModele.push(type || 'document'); };
  add(1, 'Départ A défaut', '<p>Contenu A</p>', ${opts.star === false ? 'false' : 'true'}, 'document');
  add(2, 'Départ B de la vue', '<p>Contenu B</p>', false, 'document');
  add(3, 'Départ C de la ligne', '<p>Contenu C</p>', false, 'document');
  add(4, 'Départ E email', '<p>Contenu E</p>', false, 'email');
  add(5, 'Départ M macro', JSON.stringify({ slots: [{ type: 'fixed', modeleId: 2 }] }), false, 'macro');
  stub.state.nextRowId.Publipostage_Modeles = 6;
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
// Ce que le type du modèle ouvert montre : le bandeau Objet / À / Cc et « Créer l'email » pour un email, le résumé de la composition (à la place de l'éditeur) pour un macro-modèle.
const surfaces = (page) => page.evaluate(() => {
  const visible = id => { const e = document.getElementById(id); return !!e && !e.hidden && e.style.display !== 'none' && e.getBoundingClientRect().height > 0; };
  return { emailBanner: visible('v2-email-fields-row'), createEmail: visible('btn-create-email'), macroSummary: visible('macro-summary-container'), editor: visible('editor-container') };
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

page = await startWith('un email choisi pour la vue s\u2019ouvre au démarrage, même avec un ★ dans le document', { options: { modeleDeLaVue: '4' } }, 'Départ E email', 4);
const onEmail = await surfaces(page);
check('l\u2019email ouvert montre son bandeau Objet / À / Cc et « Créer l\u2019email », avec l\u2019éditeur', onEmail.emailBanner && onEmail.createEmail && onEmail.editor && !onEmail.macroSummary, onEmail);
await page.context().close();

page = await startWith('un macro-modèle choisi pour la vue s\u2019ouvre au démarrage, même avec un ★ dans le document', { options: { modeleDeLaVue: '5' } }, 'Départ M macro', 5);
const onMacro = await surfaces(page);
check('le macro-modèle ouvert montre le résumé de sa composition à la place de l\u2019éditeur', onMacro.macroSummary && !onMacro.editor && !onMacro.emailBanner && !onMacro.createEmail, onMacro);
// Ouvert au démarrage, avant le branchement des boutons (MacroEditor.wire), le résumé répond comme un autre : à la vraie souris, le stylo ouvre le modèle de la composition avec le bandeau
// « Revenir », « Revenir » ramène au résumé, et « Modifier la composition » ouvre sa fenêtre.
const centerOf = (selector) => page.evaluate(sel => {
  const e = document.querySelector(sel);
  if (!e) return null;
  e.scrollIntoView({ block: 'center' });
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}, selector);
const pencil = await centerOf('.macro-summary-edit[data-template-id="2"]');
check('le stylo du modèle de la composition est à l’écran', !!pencil && pencil.w > 0 && pencil.h > 0, pencil);
if (pencil) {
  await page.mouse.click(pencil.x, pencil.y);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '2', null, { timeout: 5000 }).catch(() => {});
  const opened = await page.evaluate(() => {
    const bar = document.getElementById('macro-return-bar');
    return { current: Templates.getCurrentId(), bar: !!bar && !bar.hidden && bar.getBoundingClientRect().height > 0, text: (document.getElementById('macro-return-text') || {}).textContent || '' };
  });
  check('son stylo, à la vraie souris, ouvre ce modèle avec le bandeau « Revenir au macro-modèle »', String(opened.current) === '2' && opened.bar && opened.text.includes('Départ M macro'), opened);
  const back = await centerOf('#btn-macro-return');
  if (back) await page.mouse.click(back.x, back.y);
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '5', null, { timeout: 5000 }).catch(() => {});
  const returned = await surfaces(page);
  const current = await page.evaluate(() => Templates.getCurrentId());
  check('« Revenir au macro-modèle » ramène au macro-modèle et à son résumé', String(current) === '5' && returned.macroSummary && !returned.editor, { current, returned });
}
const editComposition = await centerOf('#btn-edit-macro');
if (editComposition) await page.mouse.click(editComposition.x, editComposition.y);
const modalShown = await page.evaluate(() => { const m = document.getElementById('macro-editor-modal'); return !!m && m.style.display !== 'none' && m.getBoundingClientRect().height > 0; });
check('« Modifier la composition » ouvre sa fenêtre', !!editComposition && modalShown, { editComposition, modalShown });
await page.context().close();

page = await startWith('un macro-modèle choisi pour la vue s\u2019ouvre même sans modèle par défaut dans le document', { star: false, options: { modeleDeLaVue: '5' } }, 'Départ M macro', 5);
await page.context().close();

page = await startWith('un choix de vue dont le modèle n\u2019existe plus est ignoré : le ★ s\u2019ouvre', { options: { modeleDeLaVue: '99' } }, 'Départ A défaut', 1);
await page.context().close();

const ROW_RULES = { enabled: true, rules: [{ column: 'Statut', operator: '=', value: 'Urgent', modeleId: '3' }], otherwise: 'default' };
page = await startWith('la ligne qui désigne un modèle passe avant le modèle de la vue et le ★', { options: { modeleDeLaVue: '2', modeleSelonLigne: ROW_RULES }, record: { id: 1, Nom: 'L1', Statut: 'Urgent' } }, 'Départ C de la ligne', 3);
await page.context().close();

page = await startWith('une ligne sans règle qui correspond ouvre le modèle de la vue (« modèle par défaut »)', { options: { modeleDeLaVue: '2', modeleSelonLigne: ROW_RULES }, record: { id: 2, Nom: 'L2', Statut: 'Autre' } }, 'Départ B de la vue', 2);
await page.context().close();

page = await startWith('un macro-modèle choisi pour la vue est le « modèle par défaut » d\u2019une règle de ligne qui ne correspond pas', { options: { modeleDeLaVue: '5', modeleSelonLigne: ROW_RULES }, record: { id: 6, Nom: 'L6', Statut: 'Autre' } }, 'Départ M macro', 5);
await page.context().close();

page = await startWith('un email choisi pour la vue est le « modèle par défaut » d\u2019une règle de ligne qui ne correspond pas', { options: { modeleDeLaVue: '4', modeleSelonLigne: ROW_RULES }, record: { id: 7, Nom: 'L7', Statut: 'Autre' } }, 'Départ E email', 4);
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
