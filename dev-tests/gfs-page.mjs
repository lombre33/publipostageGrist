// La page de test des scripts « GFS » (verify-gfs-open.mjs, verify-gfs-frame.mjs) : le vrai widget (index.html servi tel quel, faux Grist de dev-tests/grist-stub.js semé AVANT l'init) à 700x400, seul
// (adresse sans `gfs=`) ou hébergé (`?gfs=0` et un GFS simulé par dev-tests/gfs-stub.js), avec le miroir hors ligne des CDN (dev-tests/offline-deps.sh), un compte des vérifications et la ligne
// finale « N/N passés » que le lanceur (dev-tests/run-headless.mjs) lit. Même régénération du harnais et même miroir que dev-tests/verify-template-startup-mouse.mjs.
//   const t = await start({ port });  const { page, app } = await t.openPage({ hosted, stub, seed, lang, colorScheme, init, framed });  t.check(nom, vrai, notes);  await t.finish();
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const WIDTH = 700;
export const HEIGHT = 400;
// Les drapeaux du cadre où GFS fait tourner chaque app (consigne 011, cahier de GFS section 2) : pas d'`allow-same-origin`, donc une origine « nulle » pour l'app.
export const ISOLATED_SANDBOX = 'allow-scripts allow-forms allow-popups allow-modals allow-downloads';
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const GFS_STUB = join(ROOT, 'dev-tests', 'gfs-stub.js');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

// Les modèles de départ des scripts GFS : 1 « Départ A » (★), 2 « Départ B », 3 « Départ C », 4 « Départ E » (email), 5 « Départ M » (macro-modèle, page de garde = B), 6 « Futur » (une
// présentation, sans page à elle : elle ne s'ouvre que si GFS active l'extension « diapositives », sinon la garde « type inconnu » de la consigne 002 la laisse fermée). Une table `PpDepart` (Nom, Statut) pour les règles de ligne ; `record` : la ligne reçue dès l'abonnement de js/main.js.
export const seedModels = ({ options = null, record = null } = {}) => `
  const m = stub.state.rows.Publipostage_Modeles;
  m.TypeModele = [];
  const add = (id, nom, html, def, type) => { m.id.push(id); m.Nom.push(nom); m.Contenu.push(html); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(def); m.TypeModele.push(type || 'document'); };
  add(1, 'Départ A défaut', '<p>Contenu A</p>', true, 'document');
  add(2, 'Départ B', '<p>Contenu B</p>', false, 'document');
  add(3, 'Départ C', '<p>Contenu C</p>', false, 'document');
  add(4, 'Départ E email', '<p>Contenu E</p>', false, 'email');
  add(5, 'Départ M macro', JSON.stringify({ slots: [{ type: 'fixed', modeleId: 2 }] }), false, 'macro');
  add(6, 'Futur', '<p>Contenu futur</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 7;
  stub.setVariables('PpDepart', { Nom: 'Text', Statut: 'Choice' }, { Statut: ['Urgent', 'Autre'] });
  stub.state.options = ${JSON.stringify(options)};
  ${record ? `
  const rec = ${JSON.stringify(record)};
  stub.state.recordCallbacks = Object.assign([], { push(entry) { Array.prototype.push.call(this, entry); entry.cb(rec, { tableId: 'PpDepart' }); return this.length; } });
  ` : ''}
`;

// `popupBlocker` : le bloqueur de fenêtres de Chromium reste allumé (Playwright l'éteint par défaut, `--disable-popup-blocking`, et son « headless shell » n'en a pas du tout : il faut le Chromium complet, en nouveau mode
// sans écran, `channel: 'chromium'`) ; une fenêtre n'y est ouverte que dans un geste vrai (clic, touche) vieux de moins de 5 s. Pour les scripts qui ouvrent la fenêtre du diaporama (verify-slides-window.mjs) : sans lui,
// un `window.open` trop tardif passerait sans qu'aucun essai le voie. Attention : `page.evaluate` de Playwright compte peut-être lui-même pour un geste (`userGesture` du protocole) ; pour mesurer le délai, ne rien
// évaluer dans la page entre le clic et l'attente.
export async function start({ name, port, popupBlocker = false }) {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  await writeFile(join(ROOT, '_test-harness.html'), html.replace('<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>', '<script src="dev-tests/grist-stub.js"></script>'));
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
      if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const info = await stat(filePath);
      const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
      res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(await readFile(target));
    } catch { res.writeHead(404).end('not found'); }
  });
  await new Promise((ok, ko) => server.listen(port, '127.0.0.1', ok).on('error', ko));
  const base = `http://127.0.0.1:${port}`;

  const esmMapPath = join(CACHE, 'esm-map.json');
  const offline = existsSync(esmMapPath);
  const esmMap = offline ? JSON.parse(readFileSync(esmMapPath, 'utf8')) : {};
  const umdRoutes = offline ? [
    [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
    [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/vfs_fonts\.min\.js$/, 'umd/vfs_fonts.min.js'],
    [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.min\.js$/, 'umd/pdf.min.js'],
    [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
    [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/jszip\.min\.js$/, 'umd/jszip.min.js'],
    [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
  ] : [];
  if (!offline) console.log(`[${name}] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.`);
  const chunkBase = 'https://esm.sh/_offline-chunks/';
  const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${chunkBase}${file}"`);

  const require = createRequire(import.meta.url);
  const { chromium } = require('/opt/node22/lib/node_modules/playwright');
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox', '--font-render-hinting=none'] }, popupBlocker ? { channel: 'chromium', ignoreDefaultArgs: ['--disable-popup-blocking'] } : {}));

  let total = 0, failures = 0;
  const pageErrors = [];
  function check(label, pass, notes) {
    total++;
    if (pass) console.log('  ok   - ' + label);
    else { failures++; console.log('  FAIL - ' + label + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
  }

  // Ouvre le widget. `hosted` : `?gfs=0` et le GFS simulé ; `stub` : ce qu'on y règle avant le chargement (ouverture, ignoreContext…) ; `seed` : le faux Grist (seedModels) ; `init` : un script de plus posé avant
  // ceux de la page ; `search` : de quoi allonger l'adresse ; `ready` faux : ne pas attendre « Widget prêt. » (un démarrage qu'on observe). Rend la page, ce qu'elle a demandé au réseau et les boîtes natives
  // ouvertes (aucune ne doit l'être). `framed` (vrai, ou { sandbox, csp }) : l'app est dans un <iframe> sans `allow-same-origin` (ISOLATED_SANDBOX par défaut), comme chez GFS, que porte une page PARENTE qui joue GFS
  // (dev-tests/gfs-stub.js en mode parent ; `csp` : la politique de sécurité de cette page, comme le `frame-src 'self'` de GFS, que les tests font respecter avec `bypassCSP: false`) ; la page rendue est alors la page parente, `app` le cadre de l'app (`app` est la page elle-même quand l'app n'est pas encadrée), et la langue du navigateur
  // remplace le stockage local, que le cadre refuse. `stub.langue` ('fr' | 'en', consigne 019) : la langue de GFS, que le contexte rend et que l'adresse porte (`language=`) à la création du cadre, comme GFS ; un `search`
  // qui nomme `language=` la remplace dans l'adresse seulement (l'adresse d'un cadre dont GFS a changé la langue depuis sa création). `hash` : le fragment qui termine l'adresse de l'app (`#pp-open=…&pp-lang=…`, ce que
  // l'app s'est laissé en se rechargeant elle-même). `popups` : la fenêtre à part du diaporama (extensions/diapositives/present.html) s'ouvre pour de bon ; faux (par défaut), le navigateur de l'essai la
  // refuse (`window.open` rend null, comme un bloqueur de fenêtres) et le diaporama se joue dans le panneau, ce que la plupart des scripts mesurent.
  async function openPage({ hosted = true, stub = null, seed = '', lang = 'fr', colorScheme = 'light', init = '', search = '', hash = '', ready = true, width = WIDTH, height = HEIGHT, storage = null, framed = null, bypassCSP = true, popups = false } = {}) {
    const context = await browser.newContext(Object.assign({ bypassCSP, viewport: { width, height }, colorScheme }, framed ? { locale: lang === 'en' ? 'en-US' : 'fr-FR' } : {}));
    const page = await context.newPage();
    const requests = [];
    const natives = [];
    page.on('request', request => requests.push(request.url()));
    page.on('dialog', async d => { natives.push(d.type() + ' : ' + d.message()); await d.dismiss(); });
    page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
    if (offline) {
      await page.route('**://esm.sh/**', async route => {
        const url = route.request().url();
        const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
        if (chunk) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
        const spec = Object.keys(esmMap).find(k => url === `https://esm.sh/${k}` || url === `https://esm.sh/*${k}` || url.startsWith(`https://esm.sh/${k}@`) || url.startsWith(`https://esm.sh/*${k}@`));
        if (!spec) return route.fulfill({ status: 404, body: `// pas de miroir local pour ${url}` });
        route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(ROOT, esmMap[spec].replace(/^\//, '')), 'utf8')) });
      });
      for (const [re, rel] of umdRoutes) {
        await page.route(re, async route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: await readFile(join(CACHE, rel), 'utf8') }));
      }
      await page.addInitScript(() => { Object.defineProperty(HTMLScriptElement.prototype, 'integrity', { configurable: true, get: () => '', set: () => {} }); });
      await page.route('**://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      await page.route('**://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
    }
    // La langue (et le reste du stockage local) est lue avant tout autre script, comme chez une personne qui l'a choisie dans Réglages.
    await page.addInitScript(({ language, extra }) => { try { localStorage.setItem('pp_lang', language); Object.keys(extra || {}).forEach(k => localStorage.setItem(k, extra[k])); } catch (e) { /* stockage indisponible */ } }, { language: lang, extra: storage });
    await page.addInitScript(`window.__preSeedGristStub = (stub) => { ${seed} };`);
    if (!popups) await page.addInitScript(() => { const open = window.open; window.open = function (url) { return /present\.html/.test(String(url)) ? null : open.apply(this, arguments); }; });
    if (hosted && !framed) {
      await page.addInitScript({ path: GFS_STUB });
      if (stub) await page.addInitScript(`Object.assign(window.__gfsStub, ${JSON.stringify(stub)});`);
    }
    if (init) await page.addInitScript(init);
    const gfsLanguage = stub && stub.langue && !/(^|&)language=/.test(search) ? '&language=' + stub.langue : '';
    let app = page;
    if (framed) {
      const sandbox = typeof framed === 'object' && framed.sandbox ? framed.sandbox : ISOLATED_SANDBOX;
      const parent = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#888">`
        + `<script>window.__gfsStubParent = 'app';</script><script src="/dev-tests/gfs-stub.js"></script>`
        + `<script>${stub ? `Object.assign(window.__gfsStub, ${JSON.stringify(stub)});` : ''}</script>`
        + `<iframe name="app" sandbox="${sandbox}" src="/_test-harness.html?gfs=0${gfsLanguage}${search}${hash}" style="display:block;width:${width}px;height:${height}px;border:0"></iframe>`;
      const headers = typeof framed === 'object' && framed.csp ? { 'Content-Security-Policy': framed.csp } : {};
      await page.route(`${base}/__parent.html`, route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers, body: parent }));
      await page.goto(`${base}/__parent.html`, { waitUntil: 'load' });
      app = page.frame({ name: 'app' });
    } else {
      await page.goto(`${base}/_test-harness.html${hosted ? '?gfs=0' + gfsLanguage : ''}${search}${hash}`, { waitUntil: 'load' });
    }
    if (ready) {
      await app.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
      await app.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready|ouvert|opened|non enregistré|not saved/i.test(el.textContent || ''); }, null, { timeout: 90000 });
    }
    return { page, app, requests, natives, context };
  }

  async function finish() {
    check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
    await browser.close();
    server.close();
    console.log(`\n${total - failures}/${total} passés`);
    process.exit(failures ? 1 : 0);
  }

  return { check, openPage, finish, browser, base };
}

// Les fichiers que le registre des extensions (js/extensions.js) fait charger pour `id`, à la version du registre : ['extensions/<id>/<fichier>?v=<version>', ...], triés. Lus dans la source
// du registre, pour qu'un test de « chaque fichier arrive une fois, à la bonne version » ne change pas avec chaque version ni chaque fichier ajouté.
export function registryFiles(id) {
  const source = readFileSync(join(ROOT, 'js', 'extensions.js'), 'utf8');
  const start = source.indexOf('\n    ' + id + ': {');
  if (start < 0) throw new Error('extension absente du registre : ' + id);
  const block = source.slice(start, source.indexOf('\n    },', start));
  const version = /version: '([^']+)'/.exec(block)[1];
  const names = key => Array.from(new RegExp(key + ': \\[([^\\]]*)\\]').exec(block)[1].matchAll(/'([^']+)'/g)).map(m => m[1]);
  return names('scripts').concat(names('styles')).map(file => 'extensions/' + id + '/' + file + '?v=' + version).sort();
}

// Le menu « Objets » de la barre d'outils du haut (js/objects-menu.js) à la vraie souris. Il était sous les miniatures de la bande (demande du 22/10 : dans la barre, comme le reste du contenu) :
// les essais qui posaient un cadre, une forme ou une ligne en cliquant ce bouton-là passent tous par ces trois gestes. La souris vient de la gauche sur le bouton, le menu s'ouvre au survol, elle
// descend tout droit dedans (le survol ne tient que par le pont que le groupe garde sous le bouton : `hoverRow` de dev-tests/load-lib.mjs coupe à travers le vide quand le menu a glissé de côté,
// ce que fait la grille de huit colonnes) puis va sur la ligne ou l'icône `[data-action="<id>"]` (textFrame, shape:<sorte>, line:plain|arrow|double) ; `chooseObject` y clique et laisse la souris là.
export const OBJECTS_BUTTON = '#v2-btn-objects';
export const OBJECTS_MENU = '#v2-objects-flyout';
export const objectRow = id => `${OBJECTS_MENU} [data-action="${id}"]`;
const pause = ms => new Promise(r => setTimeout(r, ms));
const boxOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}, selector);
// La souris vient de la gauche sur le bouton et s'y arrête : le menu s'ouvre au survol, sans qu'elle descende dedans.
export async function hoverObjectsButton(page) {
  const button = await boxOf(page, OBJECTS_BUTTON);
  if (!button || !button.width) throw new Error('bouton « Objets » introuvable ou masqué');
  await page.mouse.move(button.x - 25, button.y);
  await page.mouse.move(button.x, button.y, { steps: 4 });
  await pause(300);
  return button;
}
// L'onglet des formes qui montre `id` quand ce n'est pas celui ouvert ('' sinon) : la souris le clique d'abord, le menu reste ouvert.
export const objectTab = id => `${OBJECTS_MENU} [data-tab="${id}"]`;
const hiddenTabOf = (page, id) => page.evaluate((sel) => {
  const panel = document.querySelector(sel) && document.querySelector(sel).closest('[data-tab-panel]');
  return panel && panel.hidden ? panel.dataset.tabPanel : '';
}, objectRow(id));
export async function hoverObject(page, id) {
  const button = await hoverObjectsButton(page);
  const menu = await boxOf(page, OBJECTS_MENU);
  if (!menu || !menu.width) throw new Error('menu « Objets » introuvable ou masqué');
  const x = Math.min(Math.max(button.x, menu.left + 8), menu.right - 8);
  await page.mouse.move(x, menu.top + 8, { steps: 4 });
  const tabId = await hiddenTabOf(page, id);
  if (tabId) {
    const tab = await boxOf(page, objectTab(tabId));
    if (!tab || !tab.width) throw new Error('onglet du menu « Objets » introuvable : ' + tabId);
    await page.mouse.move(tab.x, tab.y, { steps: 6 });
    await page.mouse.click(tab.x, tab.y);
    await pause(150);
  }
  const row = await boxOf(page, objectRow(id));
  if (!row || !row.width) throw new Error('ligne du menu « Objets » introuvable ou masquée : ' + id);
  await page.mouse.move(row.x, row.y, { steps: 6 });
  await pause(120);
  return row;
}
export async function chooseObject(page, id) {
  const row = await hoverObject(page, id);
  await page.mouse.click(row.x, row.y);
  await pause(250);
  return row;
}

// Le rapport de contraste WCAG du texte d'un élément sur son fond réel (les fonds transparents des ancêtres sont composés jusqu'au premier opaque).
export const contrastOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(s => parseFloat(s)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lumin = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const layers = [];
  for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
  let base = { r: 255, g: 255, b: 255, a: 1 };
  for (const c of layers.reverse()) base = mix(c, base);
  let fg = parse(getComputedStyle(el).color);
  if (fg.a < 1) fg = mix(fg, base);
  const a = lumin(fg), b = lumin(base);
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}, selector);
