#!/usr/bin/env node
// Les sept fenêtres écrites dans index.html - Réglages, Tables liées, Clé de correspondance, Macro-modèle, Organiser mes modèles, Galerie et Aperçu - sur la base
// commune des fenêtres (js/modal-base.js `adopt`, css/modal-base.css), à 700x400 (le panneau d'Antoine), à la VRAIE souris (page.mouse) et au VRAI clavier (Tab,
// Maj+Tab, Échap), en clair et en sombre (audit UX/UI du 2026-09-29, base commune, lot 2). Le lot 1 (Condition d'affichage, Autres attributs, Boucle) a son
// script : verify-modal-base-mouse.mjs. Les scénarios qui tournent dans la page (dispatchEvent) ne voient ni le focus qui quitte la fenêtre, ni la molette qui fait
// défiler le titre avec le contenu.
// Ce que le script établit, pour chaque fenêtre : dans le panneau, titre et boutons visibles et au premier plan ; role="dialog" aria-modal nommé par son titre ;
// voile de la couleur du thème (--pp-scrim, clair ET sombre) ; largeur de sa taille (400, 480 ou grande) ; à 360 px de large, rien ne déborde ; quand le contenu
// dépasse, SEUL lui défile (titre, en-tête et boutons ne bougent pas, ni la page derrière) ; Tab et Maj+Tab tournent dans la fenêtre, y compris depuis <body> ou
// après un clic sur le voile ; Échap la ferme où que soit le focus. Puis les parcours qui ont cassé : Échap après « Supprimer » dans Tables liées (la liste
// redessinée fait perdre le focus), la Clé de correspondance ouverte par-dessus Tables liées (Échap ne ferme qu'elle, le focus revient au crayon), « Retour à la
// galerie » (le bouton cliqué vient d'être caché : le clavier doit rester dans la galerie).
// Les sélecteurs sont ceux des fenêtres d'avant (`#…-modal`, `.modal-content`, `h3`, `.modal-actions`, les identifiants de leurs boutons) : le script échoue sur
// l'ancien code par ses constats (titre qui défile, voile qui ne suit pas le thème, Échap muet), pas parce qu'un sélecteur manque.
// Lancé par run-headless.mjs (groupe Node "modalPagesMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-modal-pages-mouse.mjs
// MODAL_PAGES_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.MODAL_PAGES_MOUSE_PORT || 8905);
const SHOTS = process.env.MODAL_PAGES_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-modal-base-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-modal-pages-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
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

// Semé avant le démarrage : quatorze modèles (la liste d'Organiser dépasse la fenêtre). Les données et les règles de correspondance viennent après le démarrage.
await page.addInitScript(() => {
  window.__preSeedGristStub = (stub) => {
    const m = stub.state.rows.Publipostage_Modeles;
    for (let i = 1; i <= 14; i++) {
      m.id.push(i); m.Nom.push('Modèle ' + String(i).padStart(2, '0'));
      m.Contenu.push('<p>Modèle de test numéro ' + i + '.</p>');
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000 + i); m.Margins.push(''); m.EstParDefaut.push(false);
    }
    stub.state.nextRowId.Publipostage_Modeles = 15;
  };
});
// `?dev` : la galerie ajoute ses modèles de test (sept cartes au lieu de quatre), assez pour que sa grille dépasse la fenêtre du panneau.
await page.goto(`${BASE}/_test-harness.html?dev`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.getElementById('status-msg');
  return !!el && /prêt|ready/i.test(el.textContent || '');
}, null, { timeout: 90000 });

// Données : VcDossiers est la table de la page ; quatorze tables liées à elle par la Référence Dossier remplissent Tables liées (la liste dépasse la fenêtre) ;
// VcAnnuaire est liée par la Référence Responsable.
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('VcAnnuaire', { NomPrenom: 'Text', Telephone: 'Text' });
  stub.setVariables('VcDossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:VcAnnuaire' });
  stub.setRows('VcAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44' }]);
  stub.setRows('VcDossiers', [{ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7 }]);
  for (let i = 1; i <= 14; i++) {
    const table = 'VcListe' + String(i).padStart(2, '0');
    stub.setVariables(table, { Dossier: 'Ref:VcDossiers', Libelle: 'Text' });
    stub.setRows(table, [{ id: 1, Dossier: 1, Libelle: 'Ligne ' + i }]);
  }
  await GristAPI.refreshSchema();
  await GristAPI.saveLinkRule('VcAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
  for (let i = 1; i <= 14; i++) await GristAPI.saveLinkRule('VcListe' + String(i).padStart(2, '0'), { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
  stub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean' }, 'VcDossiers');
});
await page.waitForTimeout(300);

// --- Mesures ---

// Centre d'un élément (amené dans la vue si `scroll`), ce qui se trouve réellement au premier plan à cet endroit, et s'il est entier dans le panneau.
async function hitTest(selector, scroll = false) {
  return page.evaluate(({ sel, scroll }) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, { sel: selector, scroll });
}
const seen = box => box.found && box.inViewport && box.onTop;
async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const displayed = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }, sel);
const badge = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;

// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique, ou seulement survole.
async function realClick(selector, wait = 300) {
  const c = await hitTest(selector, true);
  if (!c.found) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(wait);
  return c;
}
async function realHover(selector) {
  const c = await hitTest(selector, true);
  if (!c.found) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 30, c.y + 5, { steps: 3 });
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.waitForTimeout(450);
}
// Fait défiler la fenêtre à la molette réelle (la souris posée sur le cadre) jusqu'à ce que l'élément soit entièrement dans le panneau ET au premier plan.
async function reveal(selector, scrollOver) {
  for (let i = 0; i < 12; i++) {
    const box = await hitTest(selector);
    if (seen(box)) return box;
    const over = await hitTest(scrollOver);
    await page.mouse.move(over.x, over.y);
    await page.mouse.wheel(0, box.found && box.top < 0 ? -120 : 120);
    await page.waitForTimeout(80);
  }
  return hitTest(selector);
}
async function waitShown(sel, ms = 6000) {
  await page.waitForFunction(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }, sel, { timeout: ms }).catch(() => {});
  await page.waitForTimeout(300);
}

// Ce que voit la personne : le cadre, le titre, les attributs d'accessibilité, la couleur du voile.
const describe = id => page.evaluate(sel => {
  const overlay = document.querySelector(sel);
  const box = overlay.querySelector('.modal-content');
  const dialog = overlay.querySelector('[role="dialog"]');
  const labelled = dialog && document.getElementById(dialog.getAttribute('aria-labelledby') || '');
  const probe = document.createElement('div');
  probe.style.background = 'var(--pp-scrim)';
  document.body.appendChild(probe);
  const scrim = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const r = box.getBoundingClientRect();
  return {
    box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width },
    dialogIsBox: !!dialog && dialog === box, modal: dialog && dialog.getAttribute('aria-modal'),
    labelledText: labelled ? labelled.textContent.trim() : '', titleText: (box.querySelector('h3') || {}).textContent || '',
    overlayBg: getComputedStyle(overlay).backgroundColor, scrim, position: getComputedStyle(overlay).position,
  };
}, id);
// Éléments à défilement (overflow auto) qui ont vraiment du contenu caché : prouve qu'un scénario a fait déborder la fenêtre. `reach` : de combien il reste à
// défiler pour arriver au bout.
const scrollers = id => page.evaluate(sel => {
  const overlay = document.querySelector(sel);
  return Array.from(overlay.querySelectorAll('*')).filter(e => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1)
    .map(e => ({ name: e.className.toString().split(' ')[0] || e.tagName, hidden: e.scrollHeight - e.clientHeight, reach: e.scrollHeight - e.clientHeight - e.scrollTop }));
}, id);
const boxScroll = id => page.evaluate(sel => document.querySelector(sel + ' .modal-content').scrollTop, id);
const behindScroll = () => page.evaluate(() => ({ doc: document.scrollingElement.scrollTop, editor: document.getElementById('editor-container').scrollTop }));
const activeDescription = () => page.evaluate(() => { const a = document.activeElement; return a ? a.tagName + (a.id ? '#' + a.id : '') + '.' + String(a.className).split(' ')[0] : null; });

// Un parcours au clavier, un appui à la fois (Tab ou Maj+Tab) : où est le focus après chaque appui, dans la fenêtre ou hors d'elle ; s'arrête dès qu'il en
// sort ou qu'il repasse sur un élément déjà visité (le tour est fait). `actions` : la ligne de boutons a-t-elle reçu le focus.
async function walk(id, key, limit = 120) {
  const trail = [];
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press(key);
    const st = await page.evaluate(sel => {
      const a = document.activeElement;
      window.__tabIds = window.__tabIds || new WeakMap();
      window.__tabN = window.__tabN || 0;
      let n = window.__tabIds.get(a);
      const again = n !== undefined;
      if (!again) { n = ++window.__tabN; window.__tabIds.set(a, n); }
      return { inside: document.querySelector(sel).contains(a), again, actions: !!(a && a.closest && a.closest('.modal-actions')), what: a ? a.tagName + '.' + String(a.className).split(' ')[0] : 'null' };
    }, id);
    trail.push(st);
    if (!st.inside || st.again) break;
  }
  return { presses: trail.length, left: trail.some(s => !s.inside), wrapped: trail.length > 0 && trail[trail.length - 1].again && trail[trail.length - 1].inside, actions: trail.some(s => s.actions), last: trail[trail.length - 1] };
}
const forgetTabs = () => page.evaluate(() => { window.__tabIds = new WeakMap(); });
const insideNow = id => page.evaluate(sel => document.querySelector(sel).contains(document.activeElement), id);
const blurFocus = () => page.evaluate(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); return document.activeElement === document.body; });

// Ferme tout ce qui est ouvert, du dessus vers le dessous, par le bouton qui ferme chaque fenêtre : un scénario qui a échoué ne pollue pas le suivant.
const CLOSERS = [
  ['#pp-dialog-modal', '#pp-dialog-modal .modal-actions button:first-of-type'],
  ['#link-config-modal', '#link-config-cancel'],
  ['#template-preview-modal', '#tpl-preview-close'],
  ['#template-gallery-modal', '#tpl-gallery-close'],
  ['#macro-editor-modal', '#macro-editor-cancel'],
  ['#template-organize-modal', '#template-organize-close'],
  ['#settings-modal', '#settings-close'],
  ['#link-rules-modal', '#link-rules-close'],
];
async function closeEverything() {
  for (const [win, button] of CLOSERS) {
    if (await displayed(win)) {
      await page.evaluate(sel => document.querySelector(sel).click(), button);
      await page.waitForTimeout(150);
    }
  }
  await page.mouse.move(2, 2);
  await page.waitForTimeout(120);
}
const openWindows = () => page.evaluate(() => ['#settings-modal', '#link-rules-modal', '#link-config-modal', '#macro-editor-modal', '#template-organize-modal', '#template-gallery-modal', '#template-preview-modal', '#pp-dialog-modal']
  .filter(s => { const e = document.querySelector(s); return e && getComputedStyle(e).display !== 'none'; }));

// Les sept fenêtres : comment on les ouvre (à la vraie souris), ce qui doit rester en place quand le contenu défile, comment on les fait déborder, et le bouton
// à qui le focus revient à la fermeture quand c'est un vrai bouton de la barre (`back` ; le menu au survol n'est pas atteignable au clavier).
const openFlyout = async row => { await realHover('#v2-new-template-group #btn-new'); await realClick(row, 0); };
const WINDOWS = [
  {
    key: 'settings', label: 'Réglages', id: '#settings-modal', width: 480, back: 'v2-btn-settings', scrolls: true,
    fixed: ['#settings-modal h3', '#settings-tabs', '#settings-close'],
    open: async () => { await realClick('#v2-btn-settings', 0); },
    grow: async () => { await realClick('#settings-modal .settings-tab[data-settings-tab="access"]', 250); },
  },
  {
    key: 'linkRules', label: 'Tables liées', id: '#link-rules-modal', width: 400, back: 'btn-link-rules', scrolls: true,
    fixed: ['#link-rules-modal h3', '#link-rules-close'],
    open: async () => { await realClick('#btn-link-rules', 0); },
  },
  {
    key: 'linkConfig', label: 'Clé de correspondance', id: '#link-config-modal', width: 400, scrolls: false,
    fixed: ['#link-config-modal h3', '#link-config-cancel', '#link-config-confirm'],
    // Ouverte par le crayon d'une règle de Tables liées (elle s'ouvre PAR-DESSUS) ; le focus revient à ce crayon.
    open: async () => { await realClick('#btn-link-rules', 400); await realClick('#link-rules-list .link-rule-btn-edit', 0); },
    backSelector: '#link-rules-list .link-rule-btn-edit',
  },
  {
    key: 'macro', label: 'Macro-modèle', id: '#macro-editor-modal', width: 480, scrolls: true,
    fixed: ['#macro-editor-modal h3', '#macro-editor-cancel', '#macro-editor-save'],
    open: async () => { await openFlyout('#v2-btn-new-macro'); },
    grow: async () => {
      for (let i = 0; i < 2; i++) {
        const add = await reveal('#macro-editor-add-slot', '#macro-editor-modal .modal-content');
        await page.mouse.click(add.x, add.y);
        await page.waitForTimeout(250);
      }
    },
  },
  {
    // « Organiser » est dans l'en-tête de la liste des modèles (depuis le 2026-10-01) : on ouvre la liste au vrai clic, puis le bouton ; le focus revient au déclencheur de la liste.
    key: 'organize', label: 'Organiser mes modèles', id: '#template-organize-modal', width: 480, backSelector: '.tts-trigger', scrolls: true,
    fixed: ['#template-organize-modal h3', '#template-organize-search', '#template-organize-new-folder', '#template-organize-close'],
    open: async () => { await realClick('.tts-trigger', 250); await realClick('#btn-organize-templates', 0); },
  },
  {
    key: 'gallery', label: 'Galerie', id: '#template-gallery-modal', width: 'large', scrolls: true,
    fixed: ['#template-gallery-modal h3', '#tpl-gallery-search', '#tpl-gallery-close'],
    open: async () => {
      await openFlyout('#v2-btn-new-from-template');
      await page.waitForSelector('#tpl-gallery-grid .tpl-gallery-card', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(400);
    },
  },
  {
    key: 'preview', label: 'Aperçu', id: '#template-preview-modal', width: 'large', scrolls: true,
    // Le document montré garde sa largeur (une facture, une image de 288 px) : à 360 px il se fait défiler de côté, comme avant ; le cadre, lui, reste dans le panneau.
    horizontalOk: '#tpl-preview-body',
    fixed: ['#template-preview-modal h3', '#tpl-preview-use-empty', '#tpl-preview-back', '#tpl-preview-close'],
    open: async () => {
      await openFlyout('#v2-btn-new-from-template');
      await page.waitForSelector('#tpl-gallery-grid .tpl-gallery-card', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(300);
      await realClick('#tpl-gallery-grid .tpl-gallery-card', 0);
      await page.waitForFunction(() => document.getElementById('tpl-preview-tiptap').children.length > 0, null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(400);
    },
  },
];
const LARGE = Math.min(960, WIDTH - 24);

const widths = {};
const scrims = {};
for (const theme of ['light', 'dark']) {
  await page.evaluate(t => Settings.setTheme(t), theme);
  await page.waitForTimeout(150);
  for (const win of WINDOWS) {
    const T = `${theme}, ${win.label}`;
    const id = win.id;
    await closeEverything();
    await win.open();
    await waitShown(id);
    const isOpen = await displayed(id);
    check(`${T} : s’ouvre à la vraie souris`, isOpen, await openWindows());
    if (!isOpen) { await closeEverything(); continue; }

    // 1) La fenêtre ouverte : dans le panneau, titre et boutons visibles et au premier plan, accessibilité, voile du thème, largeur.
    const d0 = await describe(id);
    const fixedAtOpen = {};
    for (const sel of win.fixed) fixedAtOpen[sel] = await hitTest(sel);
    const hiddenAtOpen = win.fixed.filter(sel => !seen(fixedAtOpen[sel]));
    check(`${T} : ouverte, dans le panneau ${WIDTH}x${HEIGHT}, titre, en-tête et boutons entiers et au premier plan`,
      d0.box.left >= 0 && d0.box.right <= WIDTH && d0.box.top >= 0 && d0.box.bottom <= HEIGHT && hiddenAtOpen.length === 0, { box: d0.box, hiddenAtOpen });
    check(`${T} : role="dialog" aria-modal sur le cadre, nommé par son titre affiché`, d0.dialogIsBox && d0.modal === 'true' && d0.labelledText !== '' && d0.labelledText === d0.titleText.trim(), d0);
    check(`${T} : le voile prend la couleur du thème (--pp-scrim) et couvre le panneau`, d0.overlayBg === d0.scrim && d0.position === 'fixed', { overlay: d0.overlayBg, scrim: d0.scrim, position: d0.position });
    const expectedWidth = win.width === 'large' ? LARGE : win.width;
    check(`${T} : ${expectedWidth} px de large`, Math.abs(d0.box.width - expectedWidth) <= 1, Math.round(d0.box.width));
    widths[`${theme}/${win.key}`] = Math.round(d0.box.width);
    scrims[theme] = d0.scrim;
    await snap(`${theme}-${win.key}-1-ouverte`);

    // 2) Le contenu déborde : seul lui défile. Le titre, l'en-tête et les boutons ne bougent pas, la page derrière non plus.
    if (win.grow) await win.grow();
    const scrolled = await scrollers(id);
    if (win.scrolls) {
      check(`${T} : le contenu dépasse la fenêtre (le scénario la fait bien déborder : un élément à défilement a du contenu caché)`, scrolled.length >= 1, scrolled);
      const behind0 = await behindScroll();
      const over = await hitTest(id + ' .modal-content');
      await page.mouse.move(over.x, over.y);
      await page.mouse.wheel(0, -3000);
      await page.waitForTimeout(150);
      const top = {};
      for (const sel of win.fixed) top[sel] = await hitTest(sel);
      await snap(`${theme}-${win.key}-2-haut`);
      for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(60); }
      await page.waitForTimeout(150);
      const end = {};
      for (const sel of win.fixed) end[sel] = await hitTest(sel);
      const reached = await scrollers(id);
      await snap(`${theme}-${win.key}-3-bas`);
      const moved = win.fixed.filter(sel => !seen(top[sel]) || !seen(end[sel]) || Math.abs(end[sel].top - top[sel].top) > 1);
      check(`${T} : contenu défilé jusqu’au bout à la molette, le titre, l’en-tête et les boutons restent à leur place et visibles`, moved.length === 0, { moved, top: moved.map(s => top[s].top), end: moved.map(s => end[s].top) });
      check(`${T} : ... le contenu a bien défilé jusqu’à son dernier élément`, reached.length >= 1 && reached.every(s => s.reach <= 1), reached);
      check(`${T} : le cadre lui-même ne défile pas (seule la zone de contenu le fait)`, (await boxScroll(id)) === 0, await boxScroll(id));
      for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(40); }
      const behind1 = await behindScroll();
      check(`${T} : au bout du contenu, la molette ne fait défiler ni la page ni l’éditeur derrière le voile`, behind1.doc === behind0.doc && behind1.editor === behind0.editor, { behind0, behind1 });
      const dEnd = await describe(id);
      check(`${T} : la fenêtre remplie tient toujours dans le panneau`, dEnd.box.top >= 0 && dEnd.box.bottom <= HEIGHT && dEnd.box.left >= 0 && dEnd.box.right <= WIDTH, dEnd.box);
      await page.mouse.wheel(0, -3000);
      await page.waitForTimeout(100);
    } else {
      check(`${T} : le contenu tient dans la fenêtre (rien à faire défiler à cette taille)`, scrolled.length === 0, scrolled);
    }

    // 3) Panneau étroit (360 px) : dans le panneau, pas de défilement horizontal.
    await page.setViewportSize({ width: 360, height: HEIGHT });
    await page.waitForTimeout(200);
    const narrow = await page.evaluate(({ sel, ignore }) => {
      const box = document.querySelector(sel + ' .modal-content').getBoundingClientRect();
      const wide = Array.from(document.querySelectorAll(sel + ' .modal-content, ' + sel + ' .modal-content *')).filter(e => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollWidth > e.clientWidth + 1 && !(ignore && e.matches(ignore))).map(e => String(e.className).split(' ')[0]);
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, docOverflow: document.documentElement.scrollWidth - innerWidth, wide };
    }, { sel: id, ignore: win.horizontalOk || '' });
    check(`${T} : à 360 px de large, la fenêtre reste dans le panneau, sans défilement horizontal ni débordement de page`, narrow.left >= 0 && narrow.right <= 360 && narrow.top >= 0 && narrow.bottom <= HEIGHT && narrow.docOverflow <= 0 && narrow.wide.length === 0, narrow);
    await snap(`${theme}-${win.key}-4-360`);
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });
    await page.waitForTimeout(200);

    // 4) Le clic sur le voile ne ferme rien (à dessein), puis Tab rentre dans la fenêtre au lieu de partir dans la page.
    await page.mouse.click(4, 4);
    await page.waitForTimeout(150);
    check(`${T} : un clic sur le voile ne ferme pas la fenêtre`, await displayed(id));
    await page.keyboard.press('Tab');
    check(`${T} : Tab après un clic sur le voile reste dans la fenêtre`, await insideNow(id), await activeDescription());

    // 5) Tab et Maj+Tab tournent dans la fenêtre (un tour complet), sans jamais en sortir.
    await forgetTabs();
    const forward = await walk(id, 'Tab');
    check(`${T} : Tab fait le tour de la fenêtre (${forward.presses} appuis), le focus n’en sort jamais et passe par la ligne de boutons`, !forward.left && forward.wrapped && forward.actions, forward);
    await forgetTabs();
    const backward = await walk(id, 'Shift+Tab');
    check(`${T} : Maj+Tab fait le tour dans l’autre sens (${backward.presses} appuis) sans jamais sortir`, !backward.left && backward.wrapped && backward.actions, backward);

    // 6) Focus tombé sur <body> (un champ redessiné, un bouton retiré) : Tab et Maj+Tab rentrent dans la fenêtre.
    check(`${T} : le focus est bien tombé sur <body> (mise en place du scénario)`, await blurFocus());
    await page.keyboard.press('Tab');
    check(`${T} : Tab depuis <body> rentre dans la fenêtre`, await insideNow(id), await activeDescription());
    await blurFocus();
    await page.keyboard.press('Shift+Tab');
    check(`${T} : Maj+Tab depuis <body> rentre dans la fenêtre`, await insideNow(id), await activeDescription());

    // 7) Échap ferme la fenêtre où que soit le focus (ici : sur <body>), et rend le focus à l’élément qui l’avait ouverte quand c'est un vrai bouton.
    await blurFocus();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const closedFromBody = !(await displayed(id));
    check(`${T} : Échap avec le focus sur <body> ferme la fenêtre`, closedFromBody, await openWindows());
    if (closedFromBody && (win.back || win.backSelector)) {
      const wanted = win.back ? '#' + win.back : win.backSelector;
      const focusBack = await page.evaluate(sel => { const e = document.querySelector(sel); return !!e && document.activeElement === e; }, wanted);
      check(`${T} : ... et le focus revient au bouton qui l’a ouverte`, focusBack, await activeDescription());
    }
    if (win.key === 'linkConfig') check(`${T} : ... Tables liées, en dessous, reste ouverte`, await displayed('#link-rules-modal'));
    await closeEverything();

    // 8) Échap après neuf appuis sur Tab (le focus était déjà parti dans la page derrière le voile avant la base commune) ferme la fenêtre.
    await win.open();
    await waitShown(id);
    if (win.grow) await win.grow();
    for (let i = 0; i < 9; i++) await page.keyboard.press('Tab');
    const insideAfterNine = await insideNow(id);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const closedAfterNine = !(await displayed(id));
    check(`${T} : après neuf appuis sur Tab le focus est encore dans la fenêtre, et Échap la ferme`, insideAfterNine && closedAfterNine, { insideAfterNine, closedAfterNine });
    await closeEverything();
  }

  // --- Parcours qui ont cassé ---

  // Tables liées : « Supprimer » ouvre la confirmation ; une fois la règle supprimée la liste est redessinée (le bouton cliqué disparaît, le focus tombe sur <body>) :
  // Échap doit quand même fermer Tables liées.
  {
    const T = `${theme}, Tables liées`;
    await closeEverything();
    await realClick('#btn-link-rules', 400);
    const rowsBefore = await page.evaluate(() => document.querySelectorAll('#link-rules-list .link-rule-row').length);
    await realClick('#link-rules-list .link-rule-btn-delete', 500);
    const dialog = await hitTest('#pp-dialog-modal .modal-content');
    check(`${T} : « Supprimer » ouvre la confirmation par-dessus, au premier plan`, (await displayed('#pp-dialog-modal')) && seen(dialog), dialog);
    await realClick('#pp-dialog-modal .var-modal-primary', 900);
    const rowsAfter = await page.evaluate(() => document.querySelectorAll('#link-rules-list .link-rule-row').length);
    check(`${T} : la règle est supprimée et la liste redessinée (${rowsBefore} puis ${rowsAfter} lignes), la fenêtre reste ouverte`, rowsAfter === rowsBefore - 1 && !(await displayed('#pp-dialog-modal')) && await displayed('#link-rules-modal'), { rowsBefore, rowsAfter });
    const focusLost = await activeDescription();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check(`${T} : Échap ferme Tables liées après la suppression, même si la liste redessinée a fait perdre le focus`, !(await displayed('#link-rules-modal')), { focus: focusLost, open: await openWindows() });
    check(`${T} : ... et le focus revient à « Tables liées » de la barre`, await page.evaluate(() => document.activeElement && document.activeElement.id === 'btn-link-rules'), await activeDescription());
    await closeEverything();
  }

  // Tables liées puis Clé de correspondance (le crayon d'une règle) : la clé s'ouvre par-dessus, garde le clavier ; un premier Échap la ferme SEULE et rend le
  // focus au crayon, le second ferme Tables liées.
  {
    const T = `${theme}, Clé de correspondance`;
    await closeEverything();
    await realClick('#btn-link-rules', 400);
    await realClick('#link-rules-list .link-rule-btn-edit', 700);
    const key = await hitTest('#link-config-modal .modal-content');
    check(`${T} : le crayon d’une règle l’ouvre par-dessus Tables liées, au premier plan`, (await displayed('#link-config-modal')) && (await displayed('#link-rules-modal')) && seen(key), key);
    await snap(`${theme}-cle-par-dessus`);
    let left = false;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      if (!(await insideNow('#link-config-modal'))) left = true;
    }
    check(`${T} : douze appuis sur Tab restent dans la clé (le clavier est à la fenêtre du dessus)`, !left);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const afterFirst = { key: await displayed('#link-config-modal'), rules: await displayed('#link-rules-modal') };
    check(`${T} : un premier Échap ferme la clé SEULE, Tables liées reste ouverte`, !afterFirst.key && afterFirst.rules, afterFirst);
    check(`${T} : ... et le focus revient au crayon qui l’a ouverte`, await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('link-rule-btn-edit')), await activeDescription());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check(`${T} : le second Échap ferme Tables liées`, !(await displayed('#link-rules-modal')), await openWindows());
    await closeEverything();
  }

  // Galerie -> Aperçu -> « Retour à la galerie » : le bouton cliqué vient d'être caché, le clavier doit rester dans la galerie ; Échap ferme tout.
  {
    const T = `${theme}, Galerie et Aperçu`;
    await closeEverything();
    await openFlyout('#v2-btn-new-from-template');
    await page.waitForSelector('#tpl-gallery-grid .tpl-gallery-card', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    await realClick('#tpl-gallery-grid .tpl-gallery-card', 0);
    await page.waitForFunction(() => document.getElementById('tpl-preview-tiptap').children.length > 0, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    const swapped = { gallery: await displayed('#template-gallery-modal'), preview: await displayed('#template-preview-modal') };
    check(`${T} : une carte de la galerie ouvre l’aperçu à sa place`, !swapped.gallery && swapped.preview, swapped);
    check(`${T} : le focus est dans l’aperçu`, await insideNow('#template-preview-modal'), await activeDescription());
    await realClick('#tpl-preview-back', 400);
    const back = { gallery: await displayed('#template-gallery-modal'), preview: await displayed('#template-preview-modal') };
    check(`${T} : « Retour à la galerie » rouvre la galerie et ferme l’aperçu`, back.gallery && !back.preview, back);
    check(`${T} : ... et le clavier est dans la galerie (le bouton cliqué vient d’être caché)`, await insideNow('#template-gallery-modal'), await activeDescription());
    await page.keyboard.press('Tab');
    check(`${T} : ... Tab y reste`, await insideNow('#template-gallery-modal'), await activeDescription());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check(`${T} : Échap ferme la galerie, aucune fenêtre ne reste ouverte`, (await openWindows()).length === 0, await openWindows());
    // Depuis l'aperçu, Échap ferme tout (comme « Fermer »).
    await openFlyout('#v2-btn-new-from-template');
    await page.waitForSelector('#tpl-gallery-grid .tpl-gallery-card', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    await realClick('#tpl-gallery-grid .tpl-gallery-card', 500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check(`${T} : Échap depuis l’aperçu ferme l’aperçu et la galerie`, (await openWindows()).length === 0, await openWindows());
    await closeEverything();
  }
}

// Trois largeurs pour les sept fenêtres (elles en avaient six : 380, 400, 420, 480, 520, 960), en clair comme en sombre, et le voile change avec le thème.
const bySize = { 400: ['linkRules', 'linkConfig'], 480: ['settings', 'macro', 'organize'], large: ['gallery', 'preview'] };
for (const [size, keys] of Object.entries(bySize)) {
  const seenWidths = Array.from(new Set(['light', 'dark'].flatMap(theme => keys.map(k => widths[`${theme}/${k}`]))));
  check(`les fenêtres de largeur ${size} (${keys.join(', ')}) ont toutes la même largeur, en clair comme en sombre`, seenWidths.length === 1, seenWidths);
}
check('le voile est plus foncé en sombre qu’en clair (le thème est bien appliqué)', !!scrims.light && !!scrims.dark && scrims.light !== scrims.dark, scrims);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
