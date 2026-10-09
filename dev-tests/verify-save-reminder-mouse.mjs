#!/usr/bin/env node
// Rappel « Enregistrer » des Réglages Vue et Accès (js/save-reminder.js, css/save-reminder.css) à la VRAIE souris (page.mouse, Node/Playwright) et à la taille
// du panneau Grist d'Antoine (~700x400), en clair et en sombre, en français et en anglais - choix du 2026-10-09 (« Oui, rappel visible »).
// dev-tests/scenarios-save-reminder.js vérifie le suivi du brouillon et la ligne DANS la page ; ici, ce qui se mesure aux PIXELS : la ligne dans la zone des
// boutons, à gauche de « Fermer » qui ne bouge pas, entière dans le panneau, sur deux lignes au plus, sans que le titre ni les onglets bougent, « Fermer »
// toujours à l'écran, le contraste du texte, et le geste réel : choisir le modèle de la vue (onglet Vue) ou une table des droits puis sa colonne « Lecture
// seule » (onglet Accès, listes avec recherche) fait apparaître la ligne ; « Retour » de Grist (simulé : son bouton est hors du cadre du widget) la retire ;
// « Enregistrer » de Grist ne dit rien au widget (mesuré dans un vrai Grist) : la ligne reste jusqu'à la fermeture des Réglages, qui repartent de zéro.
// Lancé par run-headless.mjs (groupe Node "saveReminderMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-save-reminder-mouse.mjs
// (SAVE_REMINDER_SHOTS=<dossier> y range une capture par étape, à regarder - aucune vérification n'en dépend).
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.SAVE_REMINDER_MOUSE_PORT || 8935);
const SHOTS = process.env.SAVE_REMINDER_SHOTS || '';
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-save-reminder-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const FR_TEXT = 'Pour partager vos changements, cliquez sur «\u00a0Enregistrer\u00a0» en haut du widget, dans Grist.';
const EN_TEXT = 'To share your changes, click “Save” at the top of the widget, in Grist.';

async function openWidget(colorScheme, lang) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
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
  // Semé avant le démarrage : un modèle « Contrat » enregistré et ouvert par défaut, une table des droits (la personne n'y est pas : elle garde tous les droits,
  // les Réglages restent modifiables), aucune option du widget, le faux Grist qui ne rappelle que les vrais changements comme le vrai.
  await page.addInitScript((language) => {
    try { localStorage.setItem('pp_lang', language); } catch (e) { /* stockage indisponible */ }
    window.__preSeedGristStub = (stub) => {
      stub.state.echoOnlyChanges = true;
      stub.setVariables('Clients', { Nom: 'Text' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
      stub.setVariables('Droits', { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
      stub.setRows('Droits', [{ id: 1, Email: 'autre@exemple.fr', LectureSeule: true, Export: false, Commentaires: false }]);
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      m.Contenu.push('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>, voici le contrat de location.</p>');
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  }, lang);
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
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width,
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}
// Molette réelle sur la fenêtre jusqu'à ce que l'élément soit entièrement dans le panneau ET au premier plan.
async function reveal(page, selector) {
  for (let i = 0; i < 10; i++) {
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
  await page.waitForTimeout(180);
  return box;
}
const listRows = page => page.evaluate(() => {
  const panel = document.querySelector('#settings-modal .ss-panel:not([hidden])');
  if (!panel) return null;
  const r = panel.getBoundingClientRect();
  return { rows: Array.from(panel.querySelectorAll('.ss-option')).map(row => row.querySelector('.ss-name').textContent), inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 };
});
const rowCenter = (page, text) => page.evaluate(wanted => {
  const found = Array.from(document.querySelectorAll('#settings-modal .ss-panel:not([hidden]) .ss-option')).find(row => row.querySelector('.ss-name').textContent === wanted);
  if (!found) return null;
  const r = found.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: !!top && found.contains(top), inViewport: r.top >= 0 && r.bottom <= innerHeight };
}, text);

// La fenêtre telle que l'écran la montre : la ligne, le titre, les onglets, le contenu, la zone des boutons et « Fermer ».
const layout = page => page.evaluate(() => {
  const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const box = document.getElementById('settings-save-reminder');
  const shown = !!box && !box.hidden && box.getClientRects().length > 0;
  const body = document.querySelector('#settings-modal .settings-body');
  const cs = box ? getComputedStyle(box) : null;
  return {
    shown,
    text: box ? box.textContent : null,
    reminder: shown ? rect(box) : null,
    title: rect(document.getElementById('settings-title')),
    tabs: rect(document.getElementById('settings-tabs')),
    header: rect(document.querySelector('#settings-modal .pp-modal-header')),
    modal: rect(document.querySelector('#settings-modal .pp-modal-box')),
    body: rect(body), bodyScrollable: body.scrollHeight - body.clientHeight, bodyScrollTop: body.scrollTop,
    footer: rect(document.querySelector('#settings-modal .pp-modal-actions')),
    close: rect(document.getElementById('settings-close')),
    lineHeight: cs ? parseFloat(cs.lineHeight) : null,
    color: cs ? cs.color : null, background: cs ? cs.backgroundColor : null,
    viewport: { w: innerWidth, h: innerHeight },
    activeTab: (document.querySelector('#settings-tabs .settings-tab.active') || {}).dataset ? document.querySelector('#settings-tabs .settings-tab.active').dataset.settingsTab : null,
  };
});
const waitReminder = (page, on) => page.waitForFunction(v => { const b = document.getElementById('settings-save-reminder'); return (!!b && !b.hidden && b.getClientRects().length > 0) === v; }, on, { timeout: 4000 }).then(() => page.waitForTimeout(200)).catch(() => page.waitForTimeout(200));

// Le rappel est entier dans le panneau, dans la zone des boutons, à gauche de « Fermer » sans le recouvrir, sur deux lignes au plus ; la fenêtre garde
// titre, onglets et « Fermer » à l'écran.
function geometryOk(l, expectedText) {
  if (!l.shown || !l.reminder) return { ok: false, why: 'ligne absente', l };
  const r = l.reminder, m = l.modal, vp = l.viewport;
  const inViewport = r.left >= 0 && r.top >= 0 && r.right <= vp.w + 0.5 && r.bottom <= vp.h + 0.5;
  const inFooter = r.left >= l.footer.left - 0.5 && r.right <= l.footer.right + 0.5 && r.top >= l.footer.top - 0.5 && r.bottom <= l.footer.bottom + 0.5;
  const leftOfClose = r.right <= l.close.left - 4 && r.width >= 120;
  const lines = Math.round((r.height - 8) / l.lineHeight); // 3 px de marge intérieure en haut et en bas, 1 px de bordure de chaque côté
  const windowOk = m.top >= 0 && m.bottom <= vp.h + 0.5 && l.close.bottom <= vp.h + 0.5 && l.close.top >= l.body.bottom - 0.5 && l.tabs.top >= l.title.bottom - 0.5;
  const textOk = l.text === expectedText;
  const ratio = contrast(parseRgb(l.color), parseRgb(l.background));
  return { ok: inViewport && inFooter && leftOfClose && lines <= 2 && windowOk && textOk && ratio >= 4.5, inViewport, inFooter, leftOfClose, lines, windowOk, textOk, ratio: Math.round(ratio * 100) / 100, r, footer: l.footer, close: l.close };
}

// Une passe complète : un thème, une langue.
async function pass(colorScheme, lang) {
  const tag = `${colorScheme}/${lang}`;
  const expected = lang === 'fr' ? FR_TEXT : EN_TEXT;
  const { context, page } = await openWidget(colorScheme, lang);
  const base = await page.evaluate(() => ({ unsaved: SaveReminder.isUnsaved(), lang: I18n.getLang() }));
  check(`${tag} : au départ rien n'est à enregistrer, la langue est celle choisie`, base.unsaved === false && base.lang === lang, base);

  // Réglages ouverts à la vraie souris, onglet Vue : la ligne est cachée et ne prend aucune place.
  await clickCenter(page, '#v2-btn-settings');
  await page.waitForTimeout(300);
  await clickCenter(page, '#settings-modal .settings-tab[data-settings-tab="rowTemplate"]');
  const before = await layout(page);
  check(`${tag} : onglet Vue ouvert, la ligne est cachée (aucune place prise au titre)`, before.shown === false && before.reminder === null && before.activeTab === 'rowTemplate', before);
  await shot(page, `${colorScheme}-${lang}-1-vue-avant`);

  // Choisir le modèle de la vue à la vraie souris : le réglage s'écrit, la ligne apparaît.
  const useBtn = await clickCenter(page, '#settings-viewtemplate-set');
  await waitReminder(page, true);
  const afterView = await layout(page);
  const g1 = geometryOk(afterView, expected);
  check(`${tag} : « Utiliser … pour cette vue » (vrai clic, ${useBtn.found ? 'bouton atteint' : 'bouton introuvable'}) : la ligne apparaît à gauche de « Fermer », entière, texte et contraste justes`, g1.ok, g1);
  const stays = (x, y) => Math.abs(x - y) <= 1;
  check(`${tag} : la fenêtre ne perd rien : titre, onglets et « Fermer » ne bougent pas de gauche à droite, « Fermer » reste à l'écran (zone des boutons ${Math.round(before.footer.height)} px avant, ${Math.round(afterView.footer.height)} après ; contenu ${Math.round(before.body.height)} px avant, ${Math.round(afterView.body.height)} après)`,
    stays(afterView.title.top, before.title.top) && stays(afterView.title.left, before.title.left) && stays(afterView.tabs.top, before.tabs.top) && stays(afterView.tabs.height, before.tabs.height)
      && stays(afterView.close.left, before.close.left) && stays(afterView.close.right, before.close.right) && afterView.close.bottom <= afterView.viewport.h + 0.5
      && afterView.footer.height - before.footer.height <= 9 && before.body.height - afterView.body.height <= 9,
    { before: { title: before.title, tabs: before.tabs, close: before.close, footer: before.footer, body: before.body }, after: { title: afterView.title, tabs: afterView.tabs, close: afterView.close, footer: afterView.footer, body: afterView.body } });
  await shot(page, `${colorScheme}-${lang}-2-vue-apres`);

  // Les onglets : Accès la garde, Langue la cache, Vue la rend.
  await clickCenter(page, '#settings-modal .settings-tab[data-settings-tab="access"]');
  const onAccess = await layout(page);
  check(`${tag} : onglet Accès, la ligne est toujours là (même réglage non enregistré)`, geometryOk(onAccess, expected).ok, geometryOk(onAccess, expected));
  await clickCenter(page, '#settings-modal .settings-tab[data-settings-tab="language"]');
  const onLanguage = await layout(page);
  check(`${tag} : onglet Langue, la ligne est cachée`, onLanguage.shown === false && onLanguage.reminder === null, onLanguage);
  await clickCenter(page, '#settings-modal .settings-tab[data-settings-tab="rowTemplate"]');
  const backOnView = await layout(page);
  check(`${tag} : retour sur l'onglet Vue, la ligne revient`, backOnView.shown === true, backOnView);

  // « Enregistrer » de Grist (hors du cadre du widget : simulé) ne dit rien au widget : la ligne reste (une consigne, vraie aussi après le clic).
  await page.evaluate(() => window.__gristStub.saveOptions());
  await page.waitForTimeout(400);
  const afterSave = await layout(page);
  check(`${tag} : après « Enregistrer » de Grist (aucun message au widget) la ligne reste, texte et place inchangés`, afterSave.shown === true && afterSave.text === expected && Math.abs(afterSave.footer.height - afterView.footer.height) <= 1, { shown: afterSave.shown, text: afterSave.text, footer: afterSave.footer, before: afterView.footer });
  // Fermer à la vraie souris puis rouvrir : les Réglages repartent de zéro, la ligne n'est plus là et ne laisse pas de place.
  await clickCenter(page, '#settings-close');
  await page.waitForTimeout(300);
  await clickCenter(page, '#v2-btn-settings');
  await page.waitForTimeout(300);
  await clickCenter(page, '#settings-modal .settings-tab[data-settings-tab="rowTemplate"]');
  const reopenedAfterSave = await layout(page);
  check(`${tag} : fermés puis rouverts, les Réglages repartent de zéro : la ligne est cachée et ne laisse pas de place`, reopenedAfterSave.shown === false && reopenedAfterSave.reminder === null && Math.abs(reopenedAfterSave.footer.height - before.footer.height) <= 1 && Math.abs(reopenedAfterSave.body.height - before.body.height) <= 1, { shown: reopenedAfterSave.shown, footer: reopenedAfterSave.footer, body: reopenedAfterSave.body, before: { footer: before.footer, body: before.body } });

  // Onglet Accès, listes avec recherche à la vraie souris : la table des droits, puis sa colonne « Lecture seule ».
  await clickCenter(page, '#settings-modal .settings-tab[data-settings-tab="access"]');
  const accessBefore = await layout(page);
  check(`${tag} : onglet Accès après la réouverture, la ligne est cachée`, accessBefore.shown === false, accessBefore);
  const tableField = await reveal(page, '#settings-modal #settings-access-table + .ss-wrap .ss-trigger');
  await page.mouse.click(tableField.x, tableField.y);
  await page.waitForTimeout(200);
  const tables = await listRows(page);
  check(`${tag} : la liste des tables s'ouvre dans le panneau`, !!tables && tables.inside && tables.rows.indexOf('Droits') !== -1, tables);
  await page.keyboard.type('Dro');
  await page.waitForTimeout(120);
  const droitsRow = await rowCenter(page, 'Droits');
  if (droitsRow) await page.mouse.click(droitsRow.x, droitsRow.y);
  await page.waitForTimeout(500);
  const afterTable = await layout(page);
  check(`${tag} : choisir la table seule (réglage incomplet, retiré par le widget) n'appelle aucun rappel`, afterTable.shown === false, afterTable);
  const roField = await reveal(page, '#settings-modal #settings-access-readonly + .ss-wrap .ss-trigger');
  await page.mouse.click(roField.x, roField.y);
  await page.waitForTimeout(200);
  await page.keyboard.type('lect');
  await page.waitForTimeout(120);
  const roRow = await rowCenter(page, 'LectureSeule');
  if (roRow) await page.mouse.click(roRow.x, roRow.y);
  await waitReminder(page, true);
  const afterColumn = await layout(page);
  const g2 = geometryOk(afterColumn, expected);
  check(`${tag} : choisir la colonne « Lecture seule » (vrais clics) : la ligne apparaît sur l'onglet Accès, entière, texte et contraste justes`, g2.ok, g2);
  const optionState = await page.evaluate(() => ({ stored: window.__gristStub.state.options && window.__gristStub.state.options.droitsAcces, unsaved: SaveReminder.isUnsaved() }));
  check(`${tag} : le réglage est dans le brouillon du widget et le rappel le sait`, !!optionState.stored && optionState.stored.readOnlyColumn === 'LectureSeule' && optionState.unsaved === true, optionState);
  const firstField = await hitTest(page, '#settings-modal #settings-access-table + .ss-wrap .ss-trigger');
  await shot(page, `${colorScheme}-${lang}-3-acces-apres`);
  check(`${tag} : le haut du contenu de l'onglet Accès reste sous les onglets (rien n'est poussé sous l'en-tête)`, firstField.found && firstField.top >= afterColumn.body.top - 0.5 || afterColumn.bodyScrollTop > 0, { firstField, body: afterColumn.body, scrollTop: afterColumn.bodyScrollTop });

  // « Retour » de Grist : le brouillon est rendu, la ligne s'en va.
  await page.evaluate(() => window.__gristStub.revertOptions());
  await waitReminder(page, false);
  const afterRevert = await layout(page);
  check(`${tag} : après « Retour » de Grist la ligne disparaît`, afterRevert.shown === false, afterRevert);

  // Après « Retour », le modèle enregistré de la vue est de nouveau celui de la vue (« Utiliser » est grisé) : « Retirer » (vrai clic) le change, la ligne
  // revient ; fermés puis rouverts, les Réglages repartent de zéro.
  await clickCenter(page, '#settings-modal .settings-tab[data-settings-tab="rowTemplate"]');
  await clickCenter(page, '#settings-viewtemplate-clear');
  await waitReminder(page, true);
  const beforeClose = await layout(page);
  check(`${tag} : « Retirer » (vrai clic) après « Retour » : le réglage change de nouveau, la ligne revient`, geometryOk(beforeClose, expected).ok, geometryOk(beforeClose, expected));
  await clickCenter(page, '#settings-close');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => ({ modalHidden: getComputedStyle(document.getElementById('settings-modal')).display === 'none', unsaved: SaveReminder.isUnsaved(), stored: JSON.stringify(window.__gristStub.state.options) }));
  check(`${tag} : « Fermer » (vrai clic) ferme les Réglages, le réglage reste dans le brouillon du widget`, closed.modalHidden === true && !/modeleDeLaVue":"/.test(closed.stored), closed);
  await clickCenter(page, '#v2-btn-settings');
  await page.waitForTimeout(300);
  const reopened = await layout(page);
  check(`${tag} : rouverts, la ligne n'est plus là (rien n'est affirmé sur un réglage laissé derrière soi)`, reopened.shown === false && reopened.reminder === null && reopened.activeTab === 'rowTemplate', { shown: reopened.shown, activeTab: reopened.activeTab });
  await shot(page, `${colorScheme}-${lang}-4-rouvert`);
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
