#!/usr/bin/env node
// Format des dates et des nombres du document (js/format-locale.js, Réglages > Langue, css/row-template.css) à la VRAIE souris (page.mouse, Node/Playwright) et à la taille du panneau Grist
// (~700x400), en clair et en sombre, en français et en anglais - bug du 26/11 (« chez moi la date s'affiche à la française, chez une collègue à l'anglaise »).
// dev-tests/scenarios-format-locale.js vérifie dans la page ce que le document écrit pour chaque région ; ici, ce qui se mesure aux PIXELS et au vrai geste : la section atteignable à la molette
// dans le panneau, entière, sans défilement horizontal, et sa liste (« Automatique », puis dix régions avec ce qu'elles écrivent) assez étroite pour tenir ; un vrai clic et le clavier pour choisir
// « English (United Kingdom) » (la phrase qui dit pourquoi, le réglage écrit dans le document, ce que la Lecture écrit ensuite) ; Ctrl + Z au vrai clavier qui le défait ; un compte Lecteur (la liste
// reste là, grisée et inerte, la phrase de verrou lisible). Les contrastes de la phrase et du verrou sont mesurés (≥ 4,5:1).
// Puis la liste « Région » de la barre d'UNE variable (réponse du 26/11 à la carte « Les deux ») : un vrai clic sur la bulle d'une date l'ouvre, la liste est entière et au premier plan dans la fenêtre,
// sans défilement de côté, et la barre d'un nombre ou d'une date reste sur UNE ligne ; un vrai clic et le clavier choisissent « États-Unis » (la région de la bulle change, la voisine ne bouge pas, la barre dit « 09/12/2026 ») ; Ctrl + Z au vrai
// clavier la remet ; une colonne Texte n'a pas la liste ; le contraste de la liste est mesuré (≥ 4,5:1).
// Lancé par run-headless.mjs (groupe Node "formatLocaleMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-format-locale-mouse.mjs
// (FORMAT_LOCALE_SHOTS=<dossier> y range une capture par étape, à regarder - aucune vérification n'en dépend).
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.FORMAT_LOCALE_MOUSE_PORT || 8941);
const SHOTS = process.env.FORMAT_LOCALE_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-save-reminder-mouse.mjs.
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

const OFFLINE = existsSync(join(CACHE, 'umd'));
const UMD_ROUTES = OFFLINE ? [
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/vfs_fonts\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@[\d.]+\/dist\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdf-lib@[\d.]+\/dist\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-format-locale-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];

// Les colonnes de la table : Nom (Texte), Jour (Date), Montant (Numérique).
const COLUMNS = { Nom: 'Text', Jour: 'Date', Montant: 'Numeric' };
const NAMES = ['Dupont', 'Martin', 'Petit'];
const JOUR = Date.UTC(2026, 8, 12) / 1000;

async function openWidget(colorScheme, lang) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme, });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  if (OFFLINE) {
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
  // Semé avant le démarrage : un modèle « Contrat » enregistré et ouvert par défaut, la table Clients (trois lignes, six colonnes dont une à formule), aucune option du widget,
  // le faux Grist qui ne rappelle que les vrais changements comme le vrai.
  await page.addInitScript(({ language, columns, names }) => {
    try { localStorage.setItem('pp_lang', language); } catch (e) { /* stockage indisponible */ }
    window.__preSeedGristStub = (stub) => {
      stub.state.echoOnlyChanges = true;
      stub.setVariables('Clients', columns);
      stub.setRows('Clients', names.map((Nom, i) => ({ id: i + 1, Nom, Jour: Date.UTC(2026, 8, 12) / 1000, Montant: 1234.5 })));
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      m.Contenu.push('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>, le <span class="var-badge" data-table="Clients" data-column="Jour" data-key="Clients.Jour"></span>, <span class="var-badge" data-table="Clients" data-column="Montant" data-key="Clients.Montant"></span>.</p>');
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  }, { language: lang, columns: COLUMNS, names: NAMES });
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  await page.waitForTimeout(600);
  return { context, page };
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
// Molette réelle sur la fenêtre jusqu'à ce que l'élément soit entièrement dans le panneau ET au premier plan.
async function reveal(page, selector) {
  for (let i = 0; i < 12; i++) {
    const box = await hitTest(page, selector);
    if (box.found && box.inViewport && box.onTop) return box;
    const over = await hitTest(page, '#settings-modal .settings-body');
    await page.mouse.move(over.x, over.y);
    await page.mouse.wheel(0, box.found && box.top < 0 ? -120 : 120);
    await page.waitForTimeout(80);
  }
  return hitTest(page, selector);
}
async function clickCenter(page, selector) {
  const box = await reveal(page, selector);
  if (box.found) await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(220);
  return box;
}
// La liste avec recherche ouverte : une ligne par option, son nom et son indice (le type), et si elle est entière dans le panneau.
const listRows = page => page.evaluate(() => {
  const panel = document.querySelector('#settings-modal .ss-panel:not([hidden])');
  if (!panel) return null;
  const r = panel.getBoundingClientRect();
  return {
    rows: Array.from(panel.querySelectorAll('.ss-option')).map(row => ({ name: (row.querySelector('.ss-name') || {}).textContent || '', hint: (row.querySelector('.ss-hint') || {}).textContent || '' })),
    inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
  };
});
const rowCenter = (page, text) => page.evaluate(wanted => {
  const found = Array.from(document.querySelectorAll('#settings-modal .ss-panel:not([hidden]) .ss-option')).find(row => row.querySelector('.ss-name').textContent === wanted);
  if (!found) return null;
  const r = found.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: !!top && found.contains(top), inViewport: r.top >= 0 && r.bottom <= innerHeight };
}, text);

// La couleur du texte d'un élément contre le fond réel qu'il a derrière lui (le premier fond opaque en remontant).
const textContrast = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
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
}, selector);
const ratioOf = async (page, selector) => { const c = await textContrast(page, selector); return c ? Math.round(contrast(parseRgb(c.color), parseRgb(c.background)) * 100) / 100 : 0; };

// La section telle que l'écran la montre.
const sectionState = page => page.evaluate(() => {
  const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const select = document.getElementById('settings-format-locale');
  const hint = document.getElementById('settings-format-locale-hint');
  const locked = document.getElementById('settings-format-locale-locked');
  const body = document.querySelector('#settings-modal .settings-body');
  return {
    section: rect(document.getElementById('settings-format-locale-section')),
    title: (document.querySelector('#settings-format-locale-section .settings-section-title') || {}).textContent,
    select: rect(select), value: select ? select.value : null, disabled: !!select && select.disabled,
    options: select ? Array.from(select.options).map(o => o.value) : [],
    firstLabel: select && select.options[1] ? select.options[1].textContent : null,
    hintShown: !!hint && hint.getClientRects().length > 0, hintText: hint ? hint.textContent : null,
    lockedShown: !!locked && !locked.hidden && locked.getClientRects().length > 0,
    modal: rect(document.querySelector('#settings-modal .pp-modal-box')),
    bodyOverflowX: body.scrollWidth - body.clientWidth,
    viewport: { w: innerWidth, h: innerHeight },
  };
});
// Ce que le document écrit pour le 12 septembre 2026 et le nombre 1234,5, sans réglage de bulle.
const written = page => page.evaluate(() => ({
  jour: Variables.formatValue(new Date(Date.UTC(2026, 8, 12)), null, 'Clients', 'Jour'),
  mois: Variables.formatValue(new Date(Date.UTC(2026, 8, 12)), { type: 'date', preset: 'd_mmmm_yyyy' }, 'Clients', 'Jour'),
  montant: Variables.formatValue(1234.5, { type: 'number', decimals: 2, currency: '€' }, 'Clients', 'Montant'),
}));
const stored = page => page.evaluate(() => {
  const t = window.__gristStub.state.rows.Publipostage_Modeles;
  const at = t && t.TypeModele ? t.TypeModele.indexOf('reglages') : -1;
  if (at === -1) return null;
  try { return JSON.parse(t.Contenu[at]).formatLocale || null; } catch (e) { return 'illisible'; }
});
const waitStored = async (page, wanted) => { for (let i = 0; i < 40; i++) { if ((await stored(page)) === wanted) return true; await page.waitForTimeout(60); } return false; };
async function openLanguageTab(page) {
  await clickCenter(page, '#v2-btn-settings');
  await page.waitForTimeout(500);
  await clickCenter(page, '#settings-modal .settings-tab[data-settings-tab="language"]');
  await page.waitForTimeout(250);
}
async function closeSettings(page) {
  await clickCenter(page, '#settings-close');
  await page.waitForTimeout(350);
}
// Un vrai clic ouvre la liste native ; les flèches et Entrée choisissent (Chromium sans fenêtre ne dessine pas la liste ouverte : le clavier est ce qui la pilote).
async function chooseByKeyboard(page, steps) {
  const box = await reveal(page, '#settings-format-locale');
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(200);
  for (let i = 0; i < steps; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
}

const TEXTS = {
  fr: { title: 'Format des dates et des nombres du document', hintAuto: /interface/i, hintGb: /English \(United Kingdom\)/, locked: /lecture seule/i },
  en: { title: 'Date and number format of the document', hintAuto: /interface/i, hintGb: /English \(United Kingdom\)/, locked: /read-only/i },
};

async function pass(colorScheme, lang) {
  const tag = `${colorScheme} ${lang}`;
  const T = TEXTS[lang];
  const { context, page } = await openWidget(colorScheme, lang);
  await openLanguageTab(page);
  const start = await sectionState(page);
  const box = await reveal(page, '#settings-format-locale');
  check(`${tag} : la section est dans la fenêtre des Réglages, à la molette, entière et au premier plan, sans défilement de côté`,
    start.title === T.title && box.found && box.inViewport && box.onTop && start.bodyOverflowX <= 1 && start.select.right <= start.modal.right + 0.5 && start.select.left >= start.modal.left - 0.5, { start, box });
  check(`${tag} : la liste a « Automatique » et les neuf régions, choisie sur « Automatique » ; la phrase dit que chacun suit l'interface`,
    start.options.length === 10 && start.options[0] === 'auto' && start.options.includes('en-GB') && start.options.includes('it-IT') && start.value === 'auto' && start.hintShown && T.hintAuto.test(start.hintText), start);
  check(`${tag} : la ligne d'une région montre ce qu'elle écrit (« 12/09/2026 · 1 234,50 »)`, /12\/09\/2026 · 1.234,50$/.test(start.firstLabel || ''), start.firstLabel);
  const ratio = await ratioOf(page, '#settings-format-locale-hint');
  check(`${tag} : la phrase est lisible (contraste ≥ 4,5:1)`, ratio >= 4.5, ratio);
  await shot(page, `${colorScheme}-${lang}-1-section`);

  const before = await written(page);
  await chooseByKeyboard(page, 5); // auto → fr-FR, fr-BE, fr-CH, en-US, en-GB
  const gb = await sectionState(page);
  const stored1 = await waitStored(page, 'en-GB');
  const after = await written(page);
  check(`${tag} : choisir « English (United Kingdom) » (un vrai clic, puis le clavier) : la liste le garde, la phrase le dit et le document le retient`,
    gb.value === 'en-GB' && T.hintGb.test(gb.hintText) && stored1, { value: gb.value, hint: gb.hintText, stored: await stored(page) });
  check(`${tag} : le document écrit alors à la britannique, jour d'abord, devise devant, quelle que soit la langue de l'interface (« 12/09/2026 », « 12 September 2026 », « €1,234.50 »)`,
    after.jour === '12/09/2026' && after.mois === '12 September 2026' && after.montant === '€1,234.50', { before, after });
  await shot(page, `${colorScheme}-${lang}-2-britannique`);

  // Ctrl + Z au vrai clavier : le réglage se défait d'un pas.
  await closeSettings(page);
  const editor = await hitTest(page, '.tiptap');
  await page.mouse.click(editor.x, editor.y);
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+z');
  const undone = await waitStored(page, null);
  await page.waitForTimeout(300);
  const afterUndo = await written(page);
  check(`${tag} : Ctrl + Z (vrai clavier) rend « Automatique » : le document n'a plus de réglage et écrit comme avant`, undone && afterUndo.jour === before.jour && afterUndo.montant === before.montant, { undone, before, afterUndo });
  await page.keyboard.press('Control+y');
  const redone = await waitStored(page, 'en-GB');
  check(`${tag} : Ctrl + Y le rétablit`, redone, await stored(page));

  // Un compte Lecteur : la liste est là, grisée et inerte.
  await page.evaluate(async () => { window.__gristStub.setViewer(true); await AccessRights.refresh(); });
  await page.waitForFunction(() => AccessRights.get().readOnly, null, { timeout: 5000 }).catch(() => {});
  await openLanguageTab(page);
  const viewer = await sectionState(page);
  const lockedBox = await reveal(page, '#settings-format-locale-locked');
  const lockedRatio = await ratioOf(page, '#settings-format-locale-locked');
  const sel = await reveal(page, '#settings-format-locale');
  await page.mouse.click(sel.x, sel.y);
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const viewerAfter = await sectionState(page);
  check(`${tag} : compte Lecteur : la liste reste là, grisée, sur le choix du document, la phrase de verrou se lit (contraste ${lockedRatio})`,
    viewer.disabled && viewer.value === 'en-GB' && viewer.lockedShown && lockedBox.inViewport && lockedBox.onTop && lockedRatio >= 4.5, { viewer, lockedBox, lockedRatio });
  check(`${tag} : compte Lecteur : un vrai clic et le clavier ne changent rien au document`, viewerAfter.value === 'en-GB' && (await stored(page)) === 'en-GB', { value: viewerAfter.value, stored: await stored(page) });
  await shot(page, `${colorScheme}-${lang}-3-lecteur`);
  await context.close();
}

// --- La liste « Région » de la barre d'une variable ---
const badgeBox = (page, column) => hitTest(page, `.tiptap .var-badge[data-column="${column}"]`);
const bubbleLocales = page => page.evaluate(() => { const out = []; EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge') out.push({ column: n.attrs.column, locale: n.attrs.locale || null }); }); return out; });
const regionState = page => page.evaluate(() => {
  const bar = document.querySelector('.v2-varfmt-toolbar.visible');
  if (!bar) return { bar: false };
  const panel = bar.querySelector('[data-var-panel="region"]');
  const select = bar.querySelector('select[data-role="var-region"]');
  const r = select.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const preset = bar.querySelector('select[data-role="date-preset"]');
  return {
    bar: true, shown: !panel.hidden && select.getClientRects().length > 0, value: select.value, title: select.title,
    inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === select || select.contains(top)),
    barHeight: bar.getBoundingClientRect().height, barRight: bar.getBoundingClientRect().right, barLeft: bar.getBoundingClientRect().left, firstDate: preset && !preset.closest('[hidden]') && preset.options[0] ? preset.options[0].textContent : null,
    overflowX: document.documentElement.scrollWidth - innerWidth,
  };
});
async function bubblePass(colorScheme, lang) {
  const tag = `${colorScheme} ${lang} : barre d'une variable`;
  const { context, page } = await openWidget(colorScheme, lang);
  // Le document est réglé sur la France ; les bulles du modèle d'avant n'ont pas gardé de région (elles suivent le document).
  await page.evaluate(() => Templates.updateDocumentSettings({ formatLocale: 'fr-FR' }));
  await page.waitForTimeout(300);
  const date = await badgeBox(page, 'Jour');
  await page.mouse.click(date.x, date.y);
  await page.waitForTimeout(350);
  const open = await regionState(page);
  check(`${tag} : un vrai clic sur la bulle d'une date ouvre la barre avec la liste « Région », entière, au premier plan, sans défilement de côté`,
    open.bar && open.shown && open.inViewport && open.onTop && open.overflowX <= 1 && open.barLeft >= 0 && open.barRight <= 700.5 && open.barHeight < 50, open);
  check(`${tag} : une bulle d'avant (sans région gardée) montre « Document » et l'info-bulle dit qu'elle suit le document`, open.value === '' && /document/i.test(open.title), { value: open.value, title: open.title });
  const ratio = await ratioOf(page, '.v2-varfmt-toolbar.visible select[data-role="var-region"]');
  check(`${tag} : le texte de la liste est lisible (contraste ${ratio} ≥ 4,5:1)`, ratio >= 4.5, ratio);
  await shot(page, `${colorScheme}-${lang}-4-region-liste`);

  // Un vrai clic ouvre la liste, les flèches et Entrée choisissent : « Document », fr-FR, fr-BE, fr-CH, en-US.
  const list = await hitTest(page, '.v2-varfmt-toolbar.visible select[data-role="var-region"]');
  await page.mouse.click(list.x, list.y);
  await page.waitForTimeout(200);
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(450);
  const chosen = await regionState(page);
  const locales = await bubbleLocales(page);
  const jour = locales.filter(b => b.column === 'Jour').map(b => b.locale);
  check(`${tag} : choisir « English (United States) » (clic puis clavier) ne change que cette bulle ; la barre le garde et dit « 09/12/2026 » en tête de ses dates`,
    chosen.value === 'en-US' && jour.length === 1 && jour[0] === 'en-US' && locales.filter(b => b.locale).length === 1 && chosen.firstDate === '09/12/2026', { chosen, locales });
  await shot(page, `${colorScheme}-${lang}-5-region-choisie`);
  // Ctrl + Z au vrai clavier, depuis la liste : la région d'avant revient d'un pas, Ctrl + Y la rechoisit.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const undone = await bubbleLocales(page);
  check(`${tag} : Ctrl + Z (vrai clavier) rend la bulle sans région propre, d'un seul pas`, undone.every(b => !b.locale), undone);
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(400);
  const redone = await bubbleLocales(page);
  check(`${tag} : Ctrl + Y la rechoisit`, redone.filter(b => b.column === 'Jour')[0].locale === 'en-US', redone);

  // Une colonne Texte (« Nom ») : pas de liste ; le nombre (« Montant ») l'a.
  const name = await badgeBox(page, 'Nom');
  await page.mouse.click(name.x, name.y);
  await page.waitForTimeout(350);
  const text = await regionState(page);
  check(`${tag} : la barre d'une colonne Texte n'a pas la liste « Région »`, text.bar && !text.shown, text);
  const amount = await badgeBox(page, 'Montant');
  await page.mouse.click(amount.x, amount.y);
  await page.waitForTimeout(350);
  const number = await regionState(page);
  check(`${tag} : la barre d'un nombre a la liste, entière et au premier plan, et reste sur une seule ligne`, number.bar && number.shown && number.inViewport && number.onTop && number.barHeight < 50, number);
  await context.close();
}

await pass('light', 'fr');
await pass('dark', 'fr');
await pass('light', 'en');
await bubblePass('light', 'fr');
await bubblePass('dark', 'fr');
await bubblePass('light', 'en');

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);
await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
