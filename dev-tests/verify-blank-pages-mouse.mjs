#!/usr/bin/env node
// Pages blanches du PDF (js/pdf-export.js:blankPagesOf, js/batch-failures.js:confirmBlankPages et showBlankPages, js/dialogs.js, css/modal-base.css) à la VRAIE souris et au vrai clavier
// (page.mouse, page.keyboard, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en clair et en sombre, en français et en anglais - demande du 13/10 (« idéalement
// corriger le bug des pages blanches vides et à défaut prévoir un message d'erreur au moment de l'export en popup »).
// dev-tests/scenarios-pdf-blank-pages.js et scenarios-pdf-batch.js vérifient DANS la page le repérage (contre ce que pdf.js lit dans le PDF), les textes et ce qui part ou non ; ici, ce
// qui se mesure aux PIXELS et au vrai geste :
//  - un document sans page blanche : « Exporter en PDF » au vrai clic télécharge le PDF, aucune fenêtre ne s'ouvre ;
//  - un document dont la page 2 est blanche : la fenêtre s'ouvre AVANT tout fichier ; son titre, son texte, « Annuler » et « Exporter quand même » sont entiers dans le panneau, au
//    premier plan et lisibles (>= 4,5:1), sans défilement de côté ; le focus est sur « Exporter quand même » ;
//  - « Annuler » au vrai clic, puis Échap au vrai clavier : rien n'est téléchargé, le coin d'état dit « Export annulé. », la ligne courante n'est pas datée (Réglages > Vue > « Date du
//    dernier export PDF ») ;
//  - « Exporter quand même » au vrai clic : le PDF est téléchargé, page blanche comprise (trois pages), le coin d'état dit « PDF généré », la ligne courante - elle seule - est datée ;
//  - plus de douze pages blanches : la liste des pages s'arrête sur « … » et la fenêtre reste entière dans le panneau ;
//  - la fin d'un lot (105 documents à pages blanches) : la fenêtre est entière dans le panneau, le titre et « Fermer » restent en place pendant que la liste défile à la vraie molette
//    jusqu'à sa dernière ligne, « Fermer » au vrai clic la referme.
// Lancé par run-headless.mjs (groupe Node "blankPagesMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-blank-pages-mouse.mjs
// (BLANK_PAGES_SHOTS=<dossier> y range une capture par étape, à regarder - aucune vérification n'en dépend).
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.BLANK_PAGES_MOUSE_PORT || 9041);
const SHOTS = process.env.BLANK_PAGES_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-export-date-mouse.mjs.
async function regenerateHarness() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const stubbed = html.replace(
    '<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>',
    '<script src="dev-tests/grist-stub.js"></script>'
  );
  await writeFile(join(ROOT, '_test-harness.html'), stubbed);
}
await regenerateHarness();
if (SHOTS) await mkdir(SHOTS, { recursive: true });

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
if (!OFFLINE) console.log('[verify-blank-pages-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Les colonnes de la table : Nom (Texte) et Dernier (Date et heure), la colonne qui garde la date du dernier export PDF (option `dateDernierExport`, posée avant le démarrage).
const COLUMNS = { Nom: 'Text', Dernier: 'DateTime:Europe/Paris' };
const NAMES = ['Dupont', 'Martin', 'Petit'];

async function openWidget(colorScheme, lang) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  // Les téléchargements que Chromium reçoit, dans l'ordre : c'est ce que la personne trouverait dans son dossier.
  const downloads = [];
  page.on('download', download => downloads.push(download));
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
  // Semé avant le démarrage : un modèle « Contrat » enregistré et ouvert par défaut (une phrase), la table Clients (trois lignes), la colonne « Dernier » choisie pour la date du
  // dernier export PDF, le faux Grist qui ne rappelle que les vrais changements comme le vrai.
  await page.addInitScript(({ language, columns, names }) => {
    try { localStorage.setItem('pp_lang', language); } catch (e) { /* stockage indisponible */ }
    window.__preSeedGristStub = (stub) => {
      stub.state.echoOnlyChanges = true;
      stub.setVariables('Clients', columns);
      stub.setRows('Clients', names.map((Nom, i) => ({ id: i + 1, Nom })));
      stub.setWidgetOptions({ dateDernierExport: 'Dernier' });
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      m.Contenu.push('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>, voici le contrat de location.</p>');
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  }, { language: lang, columns: COLUMNS, names: NAMES });
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  await page.waitForTimeout(600);
  return { context, page, downloads };
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

const luminance = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const contrast = (a, b) => { const l1 = luminance(a), l2 = luminance(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const parseRgb = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); const p = m ? m[1].split(/[ ,/]+/).map(Number) : [0, 0, 0]; return { r: p[0], g: p[1], b: p[2] }; };

async function hitTest(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
      shown: el.getClientRects().length > 0,
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}

// === La fenêtre de dialogue (js/dialogs.js : voile #pp-dialog-modal, titre #pp-dialog-title, texte #pp-dialog-message, boutons dans .pp-modal-actions) telle que l'écran la montre ===
const dialogState = page => page.evaluate(() => {
  const overlay = document.getElementById('pp-dialog-modal');
  if (!overlay) return { exists: false, shown: false };
  const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const inside = r => !!r && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5;
  const box = overlay.querySelector('.pp-modal-box');
  const body = overlay.querySelector('.pp-modal-body');
  const title = document.getElementById('pp-dialog-title');
  const message = document.getElementById('pp-dialog-message');
  const actions = overlay.querySelector('.pp-modal-actions');
  const buttons = Array.from(actions.querySelectorAll('button')).filter(b => b.getClientRects().length > 0).map(b => {
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { text: b.textContent.trim(), rect: rect(b), inside: inside(rect(b)), onTop: !!top && b.contains(top), primary: b.classList.contains('var-modal-primary'), focused: document.activeElement === b };
  });
  return {
    exists: true, shown: getComputedStyle(overlay).display !== 'none',
    box: rect(box), boxInside: inside(rect(box)),
    title: title.textContent, titleRect: rect(title), titleInside: inside(rect(title)),
    message: message.textContent, messageRect: rect(message), messageInside: inside(rect(message)),
    body: { scrollTop: body.scrollTop, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, scrollWidth: body.scrollWidth, clientWidth: body.clientWidth, rect: rect(body) },
    actionsRect: rect(actions),
    boxOverflowX: box.scrollWidth - box.clientWidth,
    buttons, viewport: { w: innerWidth, h: innerHeight },
  };
});
const dialogShown = page => page.evaluate(() => { const o = document.getElementById('pp-dialog-modal'); return !!o && getComputedStyle(o).display !== 'none'; });
// Vrai quand la fenêtre est (shown) ou n'est plus (!shown) à l'écran ; faux au bout de 30 s : un contrôle rouge, pas une panne du script.
const waitDialog = (page, shown) => page.waitForFunction(wanted => { const o = document.getElementById('pp-dialog-modal'); return (!!o && getComputedStyle(o).display !== 'none') === wanted; }, shown, { timeout: 30000 }).then(() => true, () => false);
// Le vrai clic au centre du bouton de la fenêtre qui porte ce texte.
async function clickDialogButton(page, text) {
  const state = await dialogState(page);
  const button = state.buttons && state.buttons.find(b => b.text === text);
  if (button && button.onTop) await page.mouse.click(button.rect.left + button.rect.width / 2, button.rect.top + button.rect.height / 2);
  await page.waitForTimeout(250);
  return !!button && button.onTop;
}

// La couleur du texte d'un élément contre le fond réel qu'il a derrière lui (le premier fond opaque en remontant). `spec` : { selector } ou { button: libellé } (un bouton de la fenêtre).
const textContrast = (page, spec) => page.evaluate(wanted => {
  const el = wanted.button
    ? Array.from(document.querySelectorAll('#pp-dialog-modal .pp-modal-actions button')).find(b => b.textContent.trim() === wanted.button && b.getClientRects().length > 0)
    : document.querySelector(wanted.selector);
  if (!el) return null;
  const toRgb = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); const p = m ? m[1].split(/[ ,/]+/).map(Number) : [0, 0, 0]; return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  let node = el, bg = null;
  while (node && node !== document.documentElement) {
    const c = toRgb(getComputedStyle(node).backgroundColor);
    if (c.a > 0.95) { bg = c; break; }
    node = node.parentElement;
  }
  if (!bg) bg = toRgb(getComputedStyle(document.body).backgroundColor);
  return { color: getComputedStyle(el).color, background: 'rgb(' + bg.r + ',' + bg.g + ',' + bg.b + ')' };
}, spec);
const ratioOf = async (page, spec) => { const c = await textContrast(page, spec); return c ? Math.round(contrast(parseRgb(c.color), parseRgb(c.background)) * 100) / 100 : 0; };

// === Le document, l'export et ce qu'il laisse derrière lui ===
const BLANK_LINE = '<p></p>';
const textLines = n => Array.from({ length: n }, (_, i) => '<p>Ligne ' + i + ' du document de test de pagination.</p>').join('');
// Le contenu de l'éditeur, comme le fait une personne qui écrit : c'est lui que « Exporter en PDF » exporte.
const setDocument = (page, html) => page.evaluate(async content => { EditorCore.getEditor().commands.setContent(content); await new Promise(resolve => setTimeout(resolve, 250)); }, html);
// Combien de lignes de texte tiennent sur UNE page du PDF (par dichotomie, chaque essai est un vrai rendu du moteur) : la capacité dépend des polices, elle n'est jamais écrite en dur.
const linesPerPage = page => page.evaluate(async () => {
  await ExportEngines.ensure(['pdf']);
  await PdfExport.ensurePdfLibsLoaded();
  const lines = n => Array.from({ length: n }, (_, i) => '<p>Ligne ' + i + ' du document de test de pagination.</p>').join('');
  const pagesOf = async html => {
    const result = await PdfExport.getNativePdfBlobForRecord(html, null, {}, '', null, PageLayout.getMarginsPt());
    const text = new TextDecoder('latin1').decode(new Uint8Array(await result.blob.arrayBuffer()));
    return (text.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
  };
  let fits = 20, over = 90;
  while (over - fits > 1) {
    const mid = (fits + over) >> 1;
    if (await pagesOf(lines(mid)) === 1) fits = mid; else over = mid;
  }
  return fits;
});
// Les pages blanches que le moteur rend pour ce HTML (la même mise en pages que l'export de la page).
const blankPagesOf = (page, html) => page.evaluate(async content => {
  await ExportEngines.ensure(['pdf']);
  await PdfExport.ensurePdfLibsLoaded();
  const result = await PdfExport.getNativePdfBlobForRecord(content, null, {}, '', null, PageLayout.getMarginsPt());
  return result.blankPages;
}, html);
// Le nombre de pages d'un PDF téléchargé.
const pagesInFile = path => (readFileSync(path).toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;

// Un vrai clic sur le bouton « Exporter en PDF » de la barre. Rend aussitôt : la fenêtre, le téléchargement ou la fin de l'export viennent après.
async function clickExport(page) {
  const btn = await hitTest(page, '#btn-export-pdf');
  if (btn.found && btn.onTop) await page.mouse.click(btn.x, btn.y);
  return btn;
}
// Attend que le coin d'état dise ce texte et rend son état À CET INSTANT : l'enregistrement automatique du modèle modifié (setDocument) écrit « Enregistré à… » quelques secondes plus tard.
const waitStatus = async (page, text) => {
  try { return await (await page.waitForFunction(wanted => { const el = document.getElementById('status-msg'); return el.textContent === wanted ? { text: el.textContent, cls: el.className } : false; }, text, { timeout: 30000 })).jsonValue(); }
  catch (e) { return { text: null, cls: null }; }
};
// La date du dernier export de chaque ligne (la colonne « Dernier ») et les écritures que Grist a reçues pour cette table.
const stampState = page => page.evaluate(() => {
  const s = window.__gristStub;
  return {
    dernier: [1, 2, 3].map(id => { const r = s.getRow('Clients', id); return r ? r.Dernier : undefined; }),
    writes: s.getActionLog().filter(a => a[0] === 'BulkUpdateRecord' && a[1] === 'Clients').map(a => a[2]),
    now: Math.floor(Date.now() / 1000),
  };
});
const clearLog = page => page.evaluate(() => window.__gristStub.clearActionLog());
const untouched = value => value == null || value === 0;

// Une passe complète : un thème, une langue.
async function pass(colorScheme, lang) {
  const tag = `${colorScheme}/${lang}`;
  const { context, page, downloads } = await openWidget(colorScheme, lang);
  const T = await page.evaluate(() => ({
    title1: I18n.t('blankPages.title', { n: 1 }), confirm1: I18n.t('blankPages.confirm', { n: 1, pages: '2' }),
    exportAnyway: I18n.t('blankPages.exportAnyway'), cancel: I18n.t('common.cancel'), close: I18n.t('common.close'),
    cancelled: I18n.t('status.exportCancelled'), generated: I18n.t('status.pdfGenerated'),
  }));
  // La ligne courante du widget : la deuxième (« Martin »).
  await page.evaluate(() => window.__gristStub.fireRecord({ id: 2, Nom: 'Martin' }, 'Clients'));
  await page.waitForTimeout(300);
  const n = await linesPerPage(page);
  check(`${tag} : le moteur tient ${n} lignes de texte sur une page (le point de départ des documents du test)`, n >= 25 && n <= 80, { n });

  // === Un document sans page blanche : le PDF part, aucune fenêtre ===
  await setDocument(page, textLines(n + 8));
  await clearLog(page);
  let before = downloads.length;
  await clickExport(page);
  let status = await waitStatus(page, T.generated);
  await page.waitForTimeout(400);
  let stamp = await stampState(page);
  check(`${tag} : sans page blanche, « Exporter en PDF » au vrai clic télécharge le PDF sans ouvrir de fenêtre, l'état dit « ${T.generated} »`,
    downloads.length === before + 1 && (await dialogShown(page)) === false && status.text === T.generated && status.cls === '', { downloads: downloads.length - before, status });
  check(`${tag} : ce premier export date la ligne courante (la 2) et elle seule`,
    typeof stamp.dernier[1] === 'number' && Math.abs(stamp.now - stamp.dernier[1]) <= 120 && untouched(stamp.dernier[0]) && untouched(stamp.dernier[2]) && JSON.stringify(stamp.writes) === '[[2]]', stamp);
  // La date est effacée : la suite doit prouver qu'un export annulé ne la remet pas.
  await page.evaluate(() => { const s = window.__gristStub; s.state.rows.Clients.Dernier[1] = null; s.clearActionLog(); });

  // === Une page blanche (la 2) : la fenêtre s'ouvre avant tout fichier ===
  const blankDoc = textLines(n) + BLANK_LINE.repeat(n) + '<p>Fin</p>';
  await setDocument(page, blankDoc);
  const reported = await blankPagesOf(page, blankDoc);
  check(`${tag} : le moteur compte la page 2 comme blanche pour ce document`, JSON.stringify(reported) === '[2]', { reported });
  before = downloads.length;
  await clickExport(page);
  const opened = await waitDialog(page, true);
  await page.waitForTimeout(700); // un fichier parti trop tôt arriverait pendant ce délai
  check(`${tag} : un document dont la page 2 est blanche : « Exporter en PDF » au vrai clic ouvre la fenêtre des pages blanches`, opened, { opened, downloads: downloads.length - before });
  if (!opened) { await context.close(); return; } // sans la fenêtre, le reste du parcours n'a plus de sens
  const win = await dialogState(page);
  check(`${tag} : la fenêtre des pages blanches est ouverte et aucun fichier n'est parti : l'export attend la réponse`, win.shown && downloads.length === before, { shown: win.shown, downloads: downloads.length - before });
  check(`${tag} : le titre dit « ${T.title1} », le texte nomme la page 2`, win.title === T.title1 && win.message === T.confirm1 && /2/.test(win.message), { title: win.title, message: win.message });
  const labels = win.buttons.map(b => b.text);
  check(`${tag} : deux boutons, « ${T.cancel} » puis « ${T.exportAnyway} »`, JSON.stringify(labels) === JSON.stringify([T.cancel, T.exportAnyway]), { labels });
  check(`${tag} : la fenêtre, son titre, son texte et les deux boutons sont entiers dans le panneau ${win.viewport.w}x${win.viewport.h}, sans défilement de côté`,
    win.boxInside && win.titleInside && win.messageInside && win.buttons.every(b => b.inside) && win.boxOverflowX <= 1 && win.body.scrollWidth - win.body.clientWidth <= 1, win);
  check(`${tag} : les boutons sont au premier plan (un vrai clic les atteint) et le texte ne passe pas sous eux`,
    win.buttons.every(b => b.onTop) && win.messageRect.bottom <= win.actionsRect.top + 0.5 && win.titleRect.bottom <= win.messageRect.top + 0.5, { buttons: win.buttons.map(b => b.onTop), message: win.messageRect, actions: win.actionsRect });
  check(`${tag} : le focus est sur « ${T.exportAnyway} » (un Entrée l'enverrait), le bouton principal`, win.buttons.find(b => b.text === T.exportAnyway).focused && win.buttons.find(b => b.text === T.exportAnyway).primary, win.buttons);
  const ratios = { message: await ratioOf(page, { selector: '#pp-dialog-message' }), title: await ratioOf(page, { selector: '#pp-dialog-title' }), cancel: await ratioOf(page, { button: T.cancel }), ok: await ratioOf(page, { button: T.exportAnyway }) };
  check(`${tag} : titre, texte et boutons sont lisibles (contraste ${JSON.stringify(ratios)}, 4,5 au moins)`, Object.values(ratios).every(r => r >= 4.5), ratios);
  await shot(page, `${colorScheme}-${lang}-1-fenetre`);

  // === « Annuler » au vrai clic : rien ne part, rien n'est daté ===
  const cancelled = await clickDialogButton(page, T.cancel);
  await waitDialog(page, false);
  status = await waitStatus(page, T.cancelled);
  await page.waitForTimeout(700);
  stamp = await stampState(page);
  check(`${tag} : « ${T.cancel} » au vrai clic : la fenêtre se ferme, aucun fichier n'est parti, l'état dit « ${T.cancelled} » sans alerte`,
    cancelled && downloads.length === before && status.text === T.cancelled && status.cls === '', { cancelled, downloads: downloads.length - before, status });
  check(`${tag} : un export annulé ne date pas la ligne : rien n'est écrit dans la colonne « Dernier »`, untouched(stamp.dernier[0]) && untouched(stamp.dernier[1]) && untouched(stamp.dernier[2]) && stamp.writes.length === 0, stamp);
  await shot(page, `${colorScheme}-${lang}-2-annule`);

  // === Échap au vrai clavier : même effet ===
  await clickExport(page);
  await waitDialog(page, true);
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await waitDialog(page, false);
  status = await waitStatus(page, T.cancelled);
  await page.waitForTimeout(700);
  stamp = await stampState(page);
  check(`${tag} : Échap au vrai clavier : la fenêtre se ferme, aucun fichier n'est parti, l'état dit « ${T.cancelled} », rien n'est daté`,
    downloads.length === before && status.text === T.cancelled && stamp.writes.length === 0 && untouched(stamp.dernier[1]), { downloads: downloads.length - before, status, stamp });

  // === « Exporter quand même » au vrai clic : le PDF part avec sa page blanche, la ligne est datée ===
  await clickExport(page);
  await waitDialog(page, true);
  await page.waitForTimeout(300);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }).catch(() => null),
    clickDialogButton(page, T.exportAnyway),
  ]);
  let magic = '', filePages = 0;
  if (download) { const path = await download.path(); magic = readFileSync(path).subarray(0, 5).toString('latin1'); filePages = pagesInFile(path); }
  status = await waitStatus(page, T.generated);
  await page.waitForTimeout(500);
  stamp = await stampState(page);
  check(`${tag} : « ${T.exportAnyway} » au vrai clic : la fenêtre se ferme, le PDF est téléchargé avec ses trois pages (la blanche comprise), l'état dit « ${T.generated} »`,
    !!download && magic === '%PDF-' && filePages === 3 && (await dialogShown(page)) === false && status.text === T.generated && status.cls === '', { download: !!download, magic, filePages, status });
  check(`${tag} : ce PDF-là date la ligne courante (la 2) et elle seule`,
    typeof stamp.dernier[1] === 'number' && Math.abs(stamp.now - stamp.dernier[1]) <= 120 && untouched(stamp.dernier[0]) && untouched(stamp.dernier[2]) && JSON.stringify(stamp.writes) === '[[2]]', stamp);

  // === Plus de douze pages blanches : la liste s'arrête sur « … » ===
  const longDoc = textLines(n) + BLANK_LINE.repeat(16 * n) + '<p>Fin</p>';
  await setDocument(page, longDoc);
  const longReported = await blankPagesOf(page, longDoc);
  check(`${tag} : un document de plus de douze pages blanches (le moteur en compte ${longReported.length})`, Array.isArray(longReported) && longReported.length > 12, { longReported });
  before = downloads.length;
  await clickExport(page);
  await waitDialog(page, true);
  await page.waitForTimeout(500);
  const longWin = await dialogState(page);
  const expectedTitle = await page.evaluate(count => I18n.t('blankPages.title', { n: count }), longReported.length);
  check(`${tag} : le titre compte les ${longReported.length} pages blanches, la liste des pages s'arrête sur « … » et ne va pas au-delà de la douzième`,
    longWin.title === expectedTitle && /, …/.test(longWin.message) && !new RegExp('\\b' + longReported[12] + '\\b').test(longWin.message.split('\n')[0]), { title: longWin.title, message: longWin.message.slice(0, 160) });
  check(`${tag} : la fenêtre à longue liste reste entière dans le panneau, ses boutons au premier plan, sans défilement de côté`,
    longWin.boxInside && longWin.buttons.length === 2 && longWin.buttons.every(b => b.inside && b.onTop) && longWin.boxOverflowX <= 1, longWin);
  await shot(page, `${colorScheme}-${lang}-3-longue-liste`);
  await clickDialogButton(page, T.cancel);
  await waitDialog(page, false);
  await waitStatus(page, T.cancelled);
  check(`${tag} : « ${T.cancel} » ferme aussi cette fenêtre, aucun fichier n'est parti`, downloads.length === before, { downloads: downloads.length - before });

  // === La fin d'un lot : 105 documents à pages blanches ===
  await page.evaluate(() => {
    const rows = Array.from({ length: 105 }, (_, i) => ({ id: i + 1, name: i % 2 ? 'Durand ' + i : '', pages: i === 0 ? Array.from({ length: 20 }, (_, p) => p + 1) : [2] }));
    window.__batchEnd = false;
    BatchFailures.showBlankPages(rows).then(() => { window.__batchEnd = true; });
  });
  await waitDialog(page, true);
  await page.waitForTimeout(400);
  const batchTitle = await page.evaluate(() => I18n.t('blankPages.batchTitle', { n: 105 }));
  const batch0 = await dialogState(page);
  check(`${tag} : fin de lot : le titre dit « ${batchTitle} » et la fenêtre est entière dans le panneau, « ${T.close} » au premier plan`,
    batch0.title === batchTitle && batch0.boxInside && batch0.titleInside && batch0.buttons.some(b => b.text === T.close && b.inside && b.onTop), { title: batch0.title, box: batch0.box, buttons: batch0.buttons });
  check(`${tag} : fin de lot : la liste est plus haute que la fenêtre (elle défile dans la fenêtre), pas à côté`,
    batch0.body.scrollHeight > batch0.body.clientHeight + 20 && batch0.body.scrollWidth - batch0.body.clientWidth <= 1 && batch0.boxOverflowX <= 1, batch0.body);
  await shot(page, `${colorScheme}-${lang}-4-fin-de-lot`);
  // La vraie molette sur la liste jusqu'à sa fin : le titre et « Fermer » ne bougent pas.
  const bodyRect = batch0.body.rect;
  await page.mouse.move(bodyRect.left + bodyRect.width / 2, bodyRect.top + bodyRect.height / 2);
  for (let i = 0; i < 80; i++) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(25);
    const s = await page.evaluate(() => { const b = document.querySelector('#pp-dialog-modal .pp-modal-body'); return b.scrollTop + b.clientHeight >= b.scrollHeight - 1; });
    if (s) break;
  }
  const batch1 = await dialogState(page);
  const lastLine = batch1.message.split('\n').slice(-1)[0];
  check(`${tag} : fin de lot : la molette mène à la dernière ligne (« ${lastLine} »), titre et « ${T.close} » n'ont pas bougé`,
    batch1.body.scrollTop > 0 && batch1.body.scrollTop + batch1.body.clientHeight >= batch1.body.scrollHeight - 1 && /\b5\b/.test(lastLine)
      && Math.abs(batch1.titleRect.top - batch0.titleRect.top) <= 0.5 && JSON.stringify(batch1.buttons.map(b => b.rect)) === JSON.stringify(batch0.buttons.map(b => b.rect)), { scrollTop: batch1.body.scrollTop, lastLine, title0: batch0.titleRect, title1: batch1.titleRect });
  const closed = await clickDialogButton(page, T.close);
  await waitDialog(page, false);
  await page.waitForTimeout(200);
  check(`${tag} : « ${T.close} » au vrai clic referme la fenêtre de fin de lot`, closed && (await page.evaluate(() => window.__batchEnd)) === true, { closed });

  await context.close();
}

await pass('light', 'fr');
await pass('dark', 'fr');
await pass('light', 'en');

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);
await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
