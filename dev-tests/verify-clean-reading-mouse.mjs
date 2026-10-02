#!/usr/bin/env node
// Lecture épurée (js/clean-reading.js, css/clean-reading.css) à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard, Node/Playwright) et à la taille du
// panneau Grist d'Antoine (~700x400), en thème clair puis sombre, pour une personne qui a tous les droits puis pour une personne en lecture seule - retours
// d'Antoine du 2026-10-02, point 19 : « un mode Lecture épuré qui enlève la toolbar etc. pour juste avoir la lecture clean d'un document ».
// dev-tests/scenarios-clean-reading.js vérifie la structure et les états DANS la page (.click(), touches synthétiques) ; ici, ce qui se mesure aux PIXELS et au
// geste réel : le menu qui s'ouvre au survol du bouton Mode lecture et qu'on atteint sans le perdre, la barre du haut qui disparaît, le document qui prend tout le
// panneau (rien d'autre à l'écran), le bouton de sortie atteignable sans masquer une ligne de texte, la molette qui fait défiler, Échap au vrai clavier, le retour
// à l'Édition avec le curseur dans le document, et - en lecture seule - un éditeur qui ne s'affiche jamais et aucune écriture dans le document Grist.
// Lancé par run-headless.mjs (groupe Node "cleanReadingMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-clean-reading-mouse.mjs
// (CLEAN_READING_SHOTS=<dossier> y range une capture par étape, à regarder - aucune vérification n'en dépend).
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.CLEAN_READING_MOUSE_PORT || 8931);
const SHOTS = process.env.CLEAN_READING_SHOTS || '';
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/html2pdf\.bundle\.min\.js$/, 'umd/html2pdf.bundle.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-clean-reading-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Un document assez long pour défiler et dont les lignes vont jusqu'au bord droit de la feuille : c'est là que le bouton de sortie, fixe, pourrait masquer du texte.
const LONG_BODY = '<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>, voici le contrat de location.</p>'
  + Array.from({ length: 40 }, (_, i) => '<p>Paragraphe ' + (i + 1) + ' du contrat de location : une phrase assez longue pour que la ligne aille jusqu’au bord droit de la feuille, et que le texte '
    + 'passe près du bouton de sortie quand on fait défiler la Lecture épurée de haut en bas.</p>').join('');

async function openWidget(colorScheme, readOnly) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept().catch(() => {}); });
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
  // Semé avant le démarrage : un modèle « Contrat » enregistré et ouvert par défaut, deux lignes de données ; en lecture seule, le réglage de droits et l'email de la personne.
  await page.addInitScript(({ longBody, ro }) => {
    window.__preSeedGristStub = (stub) => {
      stub.setVariables('Clients', { Nom: 'Text' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }, { id: 2, Nom: 'Martin' }]);
      if (ro) {
        stub.setVariables('Droits', { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
        stub.setRows('Droits', [{ id: 1, Email: 'lecteur@exemple.fr', LectureSeule: true, Export: false, Commentaires: true }]);
        stub.setUserEmail('lecteur@exemple.fr');
        stub.state.options = { droitsAcces: { table: 'Droits', emailColumn: 'Email', readOnlyColumn: 'LectureSeule', exportColumn: 'Export', commentsColumn: 'Commentaires' } };
      }
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      m.Contenu.push(longBody);
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  }, { longBody: LONG_BODY, ro: !!readOnly });
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready|lecture seule/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients'));
  await page.waitForTimeout(900);
  return { context, page, dialogs };
}

async function boxOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height,
      inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
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

// Vrai geste vers la ligne « Lecture épurée » : la souris survole le bouton Mode lecture (le menu s'ouvre), puis DESCEND vers la ligne en une dizaine de pas - la bande entre
// le bouton et son menu est reprise par le pont de survol (css/editor-v2.css), le menu doit tenir tout le trajet - et clique.
async function hoverReadButton(page) {
  const b = await boxOf(page, '#btn-mode-read');
  await page.mouse.move(b.x - 8, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('v2-read-flyout')).display !== 'none', null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(120);
  return b;
}
async function realClickCleanRow(page) {
  await hoverReadButton(page);
  const r = await boxOf(page, '#v2-btn-clean-reading');
  if (!r) return null;
  await page.mouse.move(r.x, r.y, { steps: 10 });
  await page.mouse.click(r.x, r.y);
  return r;
}

const snapshot = page => page.evaluate(() => {
  const bar = document.getElementById('toolbar-top');
  const reader = document.getElementById('reader-container');
  const editor = document.getElementById('editor-container');
  const flyout = document.getElementById('v2-read-flyout');
  const active = document.activeElement;
  return {
    clean: CleanReading.isActive(),
    bodyClass: document.body.classList.contains('pp-clean-reading'),
    reader: reader.style.display, editor: editor.style.display,
    barShown: getComputedStyle(bar).display !== 'none' && bar.getClientRects().length > 0,
    barHeight: Math.round(bar.getBoundingClientRect().height),
    flyoutOpen: getComputedStyle(flyout).display !== 'none',
    focusId: active && active.id, inEditor: !!(active && active.closest && active.closest('.ProseMirror')),
  };
});
const waitClean = (page, on) => page.waitForFunction(v => CleanReading.isActive() === v, on, { timeout: 8000 }).then(() => page.waitForTimeout(350)).catch(() => page.waitForTimeout(350));
const waitReader = page => page.waitForFunction(() => {
  const c = document.querySelector('#reader-container .reader-content');
  return document.getElementById('reader-container').style.display === 'block' && !!c && (c.textContent || '').indexOf('Dupont') !== -1;
}, null, { timeout: 10000 }).then(() => page.waitForTimeout(350)).catch(() => page.waitForTimeout(350));
const waitEditor = page => page.waitForFunction(() => document.getElementById('editor-container').style.display !== 'none' && document.getElementById('reader-container').style.display === 'none', null, { timeout: 8000 })
  .then(() => page.waitForTimeout(350)).catch(() => page.waitForTimeout(350));
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

const luminance = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const contrast = (a, b) => { const l1 = luminance(a), l2 = luminance(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const parseRgb = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); const p = m ? m[1].split(/[ ,/]+/).map(Number) : [0, 0, 0]; return { r: p[0], g: p[1], b: p[2] }; };

// Ce qui est à l'écran dans la Lecture épurée : le point le plus haut d'une grille sur tout le panneau est dans le document, ou est le bouton de sortie.
const screenAudit = page => page.evaluate(() => {
  const strangers = [];
  let points = 0;
  for (let ix = 0; ix < 8; ix++) {
    for (let iy = 0; iy < 6; iy++) {
      const x = Math.round(4 + ix * (innerWidth - 8) / 7);
      const y = Math.round(4 + iy * (innerHeight - 8) / 5);
      const hit = document.elementFromPoint(x, y);
      points++;
      if (!hit || !hit.closest('#reader-container, #btn-exit-clean-reading')) strangers.push({ x, y, hit: hit ? (hit.id || hit.className || hit.tagName) : null });
    }
  }
  return { points, strangers };
});

// Une ligne de texte de la Lecture passe-t-elle sous le bouton de sortie (fixe) à ce défilement ?
const textUnderExit = (page, scrollTop) => page.evaluate((top) => {
  const reader = document.getElementById('reader-container');
  reader.scrollTop = top;
  const btn = document.getElementById('btn-exit-clean-reading').getBoundingClientRect();
  const pad = 4;
  const content = reader.querySelector('.reader-content');
  const hits = [];
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.data.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const q of range.getClientRects()) {
      if (q.width === 0 || q.height === 0) continue;
      if (q.left < btn.right + pad && q.right > btn.left - pad && q.top < btn.bottom + pad && q.bottom > btn.top - pad) hits.push({ left: Math.round(q.left), right: Math.round(q.right), top: Math.round(q.top), bottom: Math.round(q.bottom) });
    }
  }
  return { scrollTop: reader.scrollTop, hits: hits.slice(0, 3), count: hits.length, max: reader.scrollHeight - reader.clientHeight };
}, scrollTop);

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Lecture épurée à la vraie souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme, false);
  const stub = () => page.evaluate(() => window.__gristStub.getActionLog().length);
  const logSince = n => page.evaluate(k => JSON.stringify(window.__gristStub.getActionLog().slice(k)).slice(0, 700), n);
  const start = await snapshot(page);
  check(`${label} - au départ : Édition, barre du haut visible, rien d'épuré`, start.editor !== 'none' && start.barShown && !start.clean && !start.bodyClass && start.barHeight > 0, start);

  // 1) Le menu au survol du bouton Mode lecture : atteignable à la vraie souris, tenu pendant la descente, entièrement dans le panneau, sans rien recouvrir d'autre de fait.
  const readBox = await hoverReadButton(page);
  const menu = await page.evaluate(() => {
    const flyout = document.getElementById('v2-read-flyout');
    const row = document.getElementById('v2-btn-clean-reading');
    const label = flyout.querySelector('.v2-hover-flyout-label');
    const fr = flyout.getBoundingClientRect(), rr = row.getBoundingClientRect();
    const hit = document.elementFromPoint(rr.x + rr.width / 2, rr.y + rr.height / 2);
    return {
      open: getComputedStyle(flyout).display !== 'none', inViewport: fr.left >= 0 && fr.top >= 0 && fr.right <= innerWidth && fr.bottom <= innerHeight,
      rowText: row.textContent, rowHit: !!hit && (hit === row || row.contains(hit)), rowInViewport: rr.left >= 0 && rr.top >= 0 && rr.right <= innerWidth && rr.bottom <= innerHeight,
      keyHint: getComputedStyle(label, '::after').content, expanded: document.getElementById('btn-mode-read').getAttribute('aria-expanded'),
    };
  });
  check(`${label} - le survol du bouton Mode lecture ouvre son menu, entièrement dans le panneau, avec « Lecture épurée » atteignable (rien ne la recouvre)`,
    menu.open && menu.inViewport && menu.rowText === 'Lecture épurée' && menu.rowHit && menu.rowInViewport, menu);
  check(`${label} - le titre du menu dit la touche Alt+L du bouton (l'info-bulle du bouton a laissé la place au menu)`, /Alt\+L/.test(menu.keyHint), menu);
  await shot(page, `clean-${theme}-1-menu`);
  // La souris repart sans cliquer : le menu se referme (aucun menu resté ouvert).
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 6 });
  await page.waitForTimeout(250);
  const closed = await snapshot(page);
  check(`${label} - la souris partie, le menu se referme`, !closed.flyoutOpen && !closed.clean, closed);

  // 2) Un clic sur le bouton lui-même fait ce qu'il faisait : la Lecture, avec sa barre (rien d'épuré), puis retour à l'Édition à la souris.
  await realClick(page, '#btn-mode-read');
  await waitReader(page);
  const plainRead = await snapshot(page);
  check(`${label} - vrai clic sur le bouton Mode lecture : la Lecture ordinaire, barre visible, pas d'état épuré`, plainRead.reader === 'block' && plainRead.editor === 'none' && plainRead.barShown && !plainRead.clean && !plainRead.bodyClass, plainRead);
  await realClick(page, '#btn-mode-edit');
  await waitEditor(page);
  const editBar = await snapshot(page);
  check(`${label} - retour en Édition : l'éditeur et la barre sont revenus`, editBar.editor !== 'none' && editBar.reader === 'none' && editBar.barShown, editBar);

  // 3) Depuis l'Édition : vrai survol puis vrai clic sur la ligne. Le premier focus de l'éditeur de la session fait lire les abréviations, donc identifier la personne (une ligne
  //    de la table interne Publipostage_UserProbe, ajoutée puis retirée, js/text-expansion.js) : il a lieu avant, pour que la comparaison finale ne voie que ce que la Lecture épurée écrirait.
  await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
  await page.waitForTimeout(900);
  const actionsBefore = await stub();
  await realClickCleanRow(page);
  await waitClean(page, true);
  await waitReader(page);
  const clean = await snapshot(page);
  check(`${label} - vrai clic sur « Lecture épurée » depuis l'Édition : la Lecture s'affiche, état épuré, barre du haut cachée, éditeur masqué sans le focus`,
    clean.clean && clean.bodyClass && clean.reader === 'block' && clean.editor === 'none' && !clean.barShown && clean.barHeight === 0 && !clean.inEditor, clean);
  const geo = await page.evaluate(() => {
    const r = document.getElementById('reader-container').getBoundingClientRect();
    const b = document.getElementById('btn-exit-clean-reading');
    const br = b.getBoundingClientRect();
    const reader = document.getElementById('reader-container');
    const hit = document.elementFromPoint(br.x + br.width / 2, br.y + br.height / 2);
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, scrollbar: reader.offsetWidth - reader.clientWidth, exitRight: br.right, exitTop: br.top, exitW: br.width, exitH: br.height,
      exitVisible: getComputedStyle(b).display !== 'none' && br.width > 0, exitHit: !!hit && (hit === b || b.contains(hit)), exitTitle: b.title, exitAria: b.getAttribute('aria-label'),
      text: (reader.querySelector('.reader-content') || { textContent: '' }).textContent.indexOf('Bonjour Dupont') !== -1 };
  });
  check(`${label} - le document prend tout le panneau (de 0 à ${HEIGHT} px en hauteur, de 0 à ${WIDTH} px en largeur)`,
    geo.left === 0 && geo.top === 0 && Math.abs(geo.right - WIDTH) < 1 && Math.abs(geo.bottom - HEIGHT) < 1 && geo.text, geo);
  check(`${label} - le bouton de sortie est dans le coin haut droit, entièrement dans le panneau, à gauche de la piste de défilement, et reçoit le clic (rien ne le recouvre)`,
    geo.exitVisible && geo.exitHit && geo.exitTop >= 0 && geo.exitRight <= WIDTH - geo.scrollbar && geo.exitRight > WIDTH - 60 && geo.exitTop < 24 && geo.exitW >= 24 && geo.exitH >= 24, geo);
  check(`${label} - le bouton de sortie dit « Quitter la lecture épurée (Échap) » (info-bulle et nom accessible)`,
    geo.exitTitle === 'Quitter la lecture épurée (Échap)' && geo.exitAria === 'Quitter la lecture épurée (Échap)', geo);
  const audit = await screenAudit(page);
  check(`${label} - rien d'autre que le document et le bouton de sortie à l'écran (${audit.points} points de la grille, aucun hors du document)`, audit.strangers.length === 0, audit);
  await shot(page, `clean-${theme}-2-epuree`);

  // Contraste du bouton de sortie, mesuré : le glyphe sur le fond du bouton ≥ 4,5:1 (jetons de F5, clair et sombre). Son trait est le --border-strong de tous les boutons de la barre.
  const look = await page.evaluate(() => {
    const b = document.getElementById('btn-exit-clean-reading');
    const cs = getComputedStyle(b);
    return { color: cs.color, background: cs.backgroundColor };
  });
  const glyphRatio = contrast(parseRgb(look.color), parseRgb(look.background));
  check(`${label} - contraste du bouton de sortie : glyphe ≥ 4,5:1 sur son fond (${glyphRatio.toFixed(1)}:1)`, glyphRatio >= 4.5, { look, glyphRatio: +glyphRatio.toFixed(2) });

  // La molette fait défiler le document, et le bouton de sortie ne cache aucune ligne de texte, ni en haut, ni au milieu, ni en bas.
  await page.mouse.move(WIDTH / 2, HEIGHT / 2);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(350);
  const wheeled = await page.evaluate(() => document.getElementById('reader-container').scrollTop);
  check(`${label} - la molette fait défiler la Lecture épurée (défilement ${Math.round(wheeled)} px)`, wheeled > 60, { wheeled });
  const positions = [];
  const top = await textUnderExit(page, 0);
  positions.push(top);
  for (const frac of [0.25, 0.5, 0.75, 1]) positions.push(await textUnderExit(page, Math.round(top.max * frac)));
  check(`${label} - le bouton de sortie ne recouvre aucune ligne de texte, à ${positions.length} défilements de haut en bas (le défilement total est de ${top.max} px)`,
    top.max > 400 && positions.every(p => p.count === 0), positions);
  await page.evaluate(() => { document.getElementById('reader-container').scrollTop = 0; });

  // 4) Sortie au vrai clic sur le bouton : l'Édition revient, la barre aussi (même hauteur qu'au départ), le curseur est dans le document, aucun menu resté ouvert.
  await realClick(page, '#btn-exit-clean-reading');
  await waitClean(page, false);
  await waitEditor(page);
  const out = await snapshot(page);
  check(`${label} - vrai clic sur le bouton de sortie : l'Édition revient, la barre aussi (même hauteur), le curseur est dans le document, aucun menu ouvert`,
    !out.clean && !out.bodyClass && out.editor !== 'none' && out.reader === 'none' && out.barShown && out.barHeight === start.barHeight && out.inEditor && !out.flyoutOpen, { start, out });

  // 5) Au clavier, depuis la Lecture : focus sur le bouton Mode lecture, Tab jusqu'à la ligne du menu (ouvert par le focus), Entrée ; Échap sort et rend le focus au bouton.
  await realClick(page, '#btn-mode-read');
  await waitReader(page);
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 4 });
  await page.focus('#btn-mode-read');
  await page.keyboard.press('Tab');
  const tabbed = await snapshot(page);
  check(`${label} - au clavier : Tab depuis le bouton Mode lecture arrive sur « Lecture épurée » (le menu s'ouvre au focus)`, tabbed.focusId === 'v2-btn-clean-reading' && tabbed.flyoutOpen, tabbed);
  await page.keyboard.press('Enter');
  await waitClean(page, true);
  const keyClean = await snapshot(page);
  check(`${label} - Entrée sur « Lecture épurée » : état épuré, barre cachée, la Lecture reste affichée`, keyClean.clean && keyClean.reader === 'block' && !keyClean.barShown, keyClean);
  await page.keyboard.press('Escape');
  await waitClean(page, false);
  const keyOut = await snapshot(page);
  check(`${label} - Échap (vrai clavier) : retour à la Lecture avec sa barre, le focus est revenu sur le bouton Mode lecture`,
    !keyOut.clean && keyOut.reader === 'block' && keyOut.barShown && keyOut.focusId === 'btn-mode-read', keyOut);
  await realClick(page, '#btn-mode-edit');
  await waitEditor(page);

  // 6) Rien n'a été écrit dans le document Grist par tout ce parcours (une façon de regarder, pas une modification).
  const actionsAfter = await stub();
  check(`${label} - la Lecture épurée n'écrit rien dans le document Grist (aucune action de plus que celles du démarrage)`, actionsAfter === actionsBefore, { actionsBefore, actionsAfter, added: await logSince(actionsBefore) });
  await context.close();
}

// Une personne en lecture seule : le widget s'ouvre sur la Lecture, l'éditeur ne s'affiche jamais ; la Lecture épurée lui est ouverte comme aux autres (elle ne modifie rien).
async function runReadOnly(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Lecture épurée, personne en lecture seule, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme, true);
  await waitReader(page);
  const actionsBefore = await page.evaluate(() => window.__gristStub.getActionLog().length);
  const start = await snapshot(page);
  check(`${label} - lecture seule : le widget s'ouvre sur la Lecture, éditeur caché, barre visible`, start.reader === 'block' && start.editor === 'none' && start.barShown && !start.clean, start);

  await realClickCleanRow(page);
  await waitClean(page, true);
  const clean = await snapshot(page);
  const audit = await screenAudit(page);
  const geo = await page.evaluate(() => { const r = document.getElementById('reader-container').getBoundingClientRect(); const b = document.getElementById('btn-exit-clean-reading').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, exitInViewport: b.width > 0 && b.right <= innerWidth && b.top >= 0 }; });
  check(`${label} - lecture seule, vrai clic sur « Lecture épurée » : état épuré, barre cachée, document dans tout le panneau, bouton de sortie visible, rien d'autre à l'écran`,
    clean.clean && !clean.barShown && clean.editor === 'none' && geo.top === 0 && Math.abs(geo.bottom - HEIGHT) < 1 && geo.exitInViewport && audit.strangers.length === 0, { clean, geo, audit });
  await shot(page, `clean-readonly-${theme}`);

  await realClick(page, '#btn-exit-clean-reading');
  await waitClean(page, false);
  const out = await snapshot(page);
  check(`${label} - lecture seule, bouton de sortie : la Lecture et sa barre reviennent, l'éditeur ne s'est jamais affiché`, !out.clean && out.reader === 'block' && out.editor === 'none' && out.barShown, out);

  // Au clavier aussi, et Échap pour sortir.
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 4 });
  await page.focus('#btn-mode-read');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await waitClean(page, true);
  const again = await snapshot(page);
  await page.keyboard.press('Escape');
  await waitClean(page, false);
  const back = await snapshot(page);
  check(`${label} - lecture seule, au clavier : Entrée sur la ligne entre, Échap sort, focus rendu au bouton Mode lecture, éditeur toujours caché`,
    again.clean && !back.clean && back.reader === 'block' && back.editor === 'none' && back.barShown && back.focusId === 'btn-mode-read', { again, back });

  const actionsAfter = await page.evaluate(() => window.__gristStub.getActionLog().length);
  check(`${label} - lecture seule : rien n'est écrit dans le document Grist`, actionsAfter === actionsBefore, { actionsBefore, actionsAfter });
  await context.close();
}

await runTheme('light');
await runTheme('dark');
await runReadOnly('light');
await runReadOnly('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
