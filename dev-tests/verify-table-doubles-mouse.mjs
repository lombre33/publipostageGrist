#!/usr/bin/env node
// Deux tables pour les mêmes données (js/table-doubles.js) à l'OUVERTURE RÉELLE du widget (Node/Playwright), à la taille du panneau d'Antoine (~700x400), à la vraie souris. Le document est semé AVANT le
// démarrage (window.__preSeedGristStub) comme celui d'Antoine le 20/11 : le rangement dans DEUX tables, l'ancienne (« Publipostage_PreferencesModeles », ce que GFS lit) et l'anglaise
// (« Publipostage_TemplatePreferences », ce que le widget lit), qui ne portent pas les mêmes dossiers. Parcours :
//  1. français, thème clair : la fenêtre « Deux tables pour les mêmes données » s'ouvre une fois le document affiché, nomme les deux tables, tient dans le panneau ; « Réunir » reprend les dossiers de
//     l'ancienne dans la table que le widget lit sans toucher à ses lignes, la liste des documents les montre ; « La garder » laisse l'ancienne table ; rouvert, plus aucune question ;
//  2. anglais, thème sombre : « Merge » puis « Delete » : l'ancienne table disparaît (et elle seule), les dossiers sont tous dans la table en service, le coin d'état le dit ;
//  3. français, « Plus tard » : rien n'est écrit, rien n'est supprimé, le coin d'état dit de rouvrir le widget ;
//  4. un document sans deux tables : aucune fenêtre ;
//  5. le stockage du navigateur REFUSÉ (cadre isolé de GFS, widget intégré dans un autre document : localStorage lève une SecurityError) : « La garder » est retenue dans le document (réglage `doublesKept`
//     de la ligne des réglages), la page rechargée ne repose pas la question ; sans ce réglage la question revient, ce qui prouve que c'est lui qui la fait taire (23/11, « cette pop-up n'arrête pas d'apparaître »).
// Lancé par run-headless.mjs (groupe Node "tableDoublesMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-table-doubles-mouse.mjs
// `DOUBLES_SHOTS=<dossier>` : garde une capture de chaque fenêtre (avant/après), pour la montrer.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TABLE_DOUBLES_PORT || 8955);
const SHOTS = process.env.DOUBLES_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-var-toolbar-mouse.mjs.
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-table-doubles-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Le document d'Antoine, en petit : cinq documents ; le rangement du widget (table anglaise) a le dossier « Contrats » (document 1) et « Notifications » (document 5) ; GFS, lui, a rangé dans l'ancienne table
// le même « Contrats », « Contrats/Avenants » (document 3), « Litiges » (document 4) et l'état replié du dossier « Litiges ». Trois lignes de l'ancienne sont à reprendre.
// `phase` : « doubled » (le document tel que trouvé), « merged » (la table en service a déjà tout repris, l'ancienne est restée), « single » (une seule table).
const seed = (phase, settings) => `
  window.__preSeedGristStub = (stub) => {
    stub.setDocId('e2e-doubles'); // le même document d'une ouverture à l'autre : la réponse « La garder » est retenue par document
    const t = stub.state.rows.Publipostage_Templates;
    const add = (id, name) => { t.id.push(id); t.Name.push(name); t.Content.push('<p>' + name + '</p>'); t.PdfFileName.push(''); t.HeaderFooter.push(''); t.ModifiedAt.push(1790000000); t.Margins.push(''); t.IsDefault.push(id === 2); };
    add(1, 'Bail habitation'); add(2, 'Contrat de vente'); add(3, 'Avenant loyer'); add(4, 'Mise en demeure'); add(5, 'Quittance');
    stub.state.nextRowId.Publipostage_Templates = 6;
    // Les réglages du document, tels que Grist les garde : la ligne réservée (TemplateType « reglages ») de la table des modèles, leur JSON dans Content.
    if (${JSON.stringify(settings || null)} !== null) {
      t.id.push(6); t.Name.push('Réglages du document'); t.Content.push(${JSON.stringify(settings || '')}); t.PdfFileName.push(''); t.HeaderFooter.push(''); t.ModifiedAt.push(1790000000); t.Margins.push(''); t.IsDefault.push(false);
      t.TemplateType = ['', '', '', '', '', 'reglages'];
      stub.state.nextRowId.Publipostage_Templates = 7;
    }
    const keptRows = [
      { User: '', TemplateId: 1, Pinned: false, Folder: 'Contrats', Collapsed: false },
      { User: '', TemplateId: 5, Pinned: false, Folder: 'Notifications', Collapsed: false },
    ];
    if (${JSON.stringify(phase)} === 'merged') keptRows.push(
      { User: '', TemplateId: 3, Pinned: false, Folder: 'Contrats/Avenants', Collapsed: false },
      { User: '', TemplateId: 4, Pinned: false, Folder: 'Litiges', Collapsed: false },
      { User: '', TemplateId: 0, Pinned: false, Folder: 'Litiges', Collapsed: true });
    stub.state.tables.push('Publipostage_TemplatePreferences');
    stub.state.rows.Publipostage_TemplatePreferences = {
      id: keptRows.map((_, i) => i + 1), User: keptRows.map(r => r.User), TemplateId: keptRows.map(r => r.TemplateId), Pinned: keptRows.map(r => r.Pinned),
      Folder: keptRows.map(r => r.Folder), Collapsed: keptRows.map(r => r.Collapsed),
    };
    stub.state.nextRowId.Publipostage_TemplatePreferences = keptRows.length + 1;
    if (${JSON.stringify(phase)} === 'single') return;
    const oldRows = [
      { m: 1, f: 'Contrats', r: false }, { m: 3, f: 'Contrats/Avenants', r: false }, { m: 4, f: 'Litiges', r: false }, { m: 0, f: 'Litiges', r: true },
    ];
    stub.state.tables.push('Publipostage_PreferencesModeles');
    stub.state.rows.Publipostage_PreferencesModeles = {
      id: oldRows.map((_, i) => i + 1), Utilisateur: oldRows.map(() => ''), ModeleId: oldRows.map(r => r.m), Epingle: oldRows.map(() => false),
      Dossier: oldRows.map(r => r.f), Replie: oldRows.map(r => r.r),
    };
    stub.state.nextRowId.Publipostage_PreferencesModeles = oldRows.length + 1;
  };
`;

// `noStorage` : le navigateur refuse son stockage (localStorage et sessionStorage lèvent une SecurityError, comme dans le cadre isolé de GFS) ; `settings` : le JSON des réglages du document déjà écrits.
async function openPage({ phase, lang, theme, context: existing, noStorage, settings }) {
  const context = existing || await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, locale: lang === 'en' ? 'en-US' : 'fr-FR' });
  const page = await context.newPage();
  if (noStorage) {
    await page.addInitScript(() => {
      const deny = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
      Object.defineProperty(window, 'localStorage', { configurable: true, get: deny });
      Object.defineProperty(window, 'sessionStorage', { configurable: true, get: deny });
    });
  }
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
  await page.addInitScript(`window.__schemaNames = 'english'; try { localStorage.setItem('pp_lang', ${JSON.stringify(lang)}); localStorage.setItem('pp_theme', ${JSON.stringify(theme)}); } catch (e) {}`);
  await page.addInitScript(seed(phase, settings));
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  return page;
}

const dialogOf = page => page.evaluate(() => {
  const overlay = document.getElementById('pp-dialog-modal');
  if (!overlay || getComputedStyle(overlay).display === 'none') return null;
  const box = overlay.querySelector('.pp-modal-box').getBoundingClientRect();
  const body = overlay.querySelector('.pp-modal-body');
  const actions = overlay.querySelector('.pp-modal-actions');
  const buttons = Array.from(actions.querySelectorAll('button')).filter(b => b.getBoundingClientRect().width > 0).map(b => {
    const r = b.getBoundingClientRect();
    return { text: b.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, top: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b };
  });
  return {
    title: overlay.querySelector('h3').textContent, message: document.getElementById('pp-dialog-message').textContent, buttons,
    fits: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight, box: { l: Math.round(box.left), r: Math.round(box.right), t: Math.round(box.top), b: Math.round(box.bottom) },
    focus: document.activeElement ? document.activeElement.textContent : '', scrolls: body.scrollHeight > body.clientHeight + 1, theme: document.documentElement.getAttribute('data-theme'),
  };
});
async function waitDialog(page, titleRe, timeout = 20000) {
  await page.waitForFunction(re => {
    const overlay = document.getElementById('pp-dialog-modal');
    return !!overlay && getComputedStyle(overlay).display !== 'none' && new RegExp(re).test(overlay.querySelector('h3').textContent);
  }, titleRe.source, { timeout }).catch(() => {});
  await page.waitForTimeout(150);
  return dialogOf(page);
}
async function clickButton(page, dialog, label) {
  const b = dialog && dialog.buttons.find(x => x.text === label);
  if (!b) return false;
  await page.mouse.move(b.x, b.y); await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(250);
  return true;
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };
const stubState = page => page.evaluate(() => {
  const s = window.__gristStub; const t = s.state.rows.Publipostage_TemplatePreferences; const o = s.state.rows.Publipostage_PreferencesModeles;
  return {
    tables: s.state.tables.filter(n => /Preferences/.test(n)),
    kept: t.id.map((id, i) => ({ id, m: t.TemplateId[i], f: t.Folder[i], r: !!(t.Collapsed && t.Collapsed[i]) })),
    old: o ? o.id.length : null,
    oldRowsKnown: !!o,
    writes: s.getActionLog().filter(a => /Preferences/.test(a[1])).map(a => a[0] + ':' + a[1]),
    status: document.getElementById('status-msg').textContent,
    error: document.getElementById('status-msg').classList.contains('is-error'),
  };
});
const folderPaths = async page => {
  const trigger = await page.evaluate(() => { const r = document.querySelector('.tts-trigger').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(trigger.x, trigger.y); await page.waitForTimeout(300);
  const paths = await page.evaluate(() => Array.from(document.querySelectorAll('.tts-popup .tts-row-folder')).map(r => r.dataset.folderPath).sort());
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  return paths;
};
const noDialog = async page => { await page.waitForTimeout(1500); return (await dialogOf(page)) === null; };
const ready = page => page.waitForFunction(() => /prêt|ready/i.test((document.getElementById('status-msg') || {}).textContent || ''), null, { timeout: 90000 });

// 1) Français, clair : « Réunir » puis « La garder ».
console.log('1. français, clair : réunir, garder l\'ancienne table');
{
  const page = await openPage({ phase: 'doubled', lang: 'fr', theme: 'light' });
  let dialog = await waitDialog(page, /Deux tables/);
  check('1. la fenêtre s\'ouvre, titre et message en français', !!dialog && dialog.title === 'Deux tables pour les mêmes données' && /Publipostage_PreferencesModeles/.test(dialog.message) && /Publipostage_TemplatePreferences/.test(dialog.message) && /4 lignes/.test(dialog.message), dialog && dialog.message);
  check('1. la fenêtre tient dans le panneau (700x400), boutons visibles et cliquables', !!dialog && dialog.fits && dialog.buttons.length === 2 && dialog.buttons.every(b => b.inside && b.top), dialog);
  check('1. thème clair', !!dialog && dialog.theme === 'light', dialog && dialog.theme);
  check('1. deux boutons : « Plus tard » et « Réunir »', !!dialog && dialog.buttons.map(b => b.text).join() === 'Plus tard,Réunir', dialog && dialog.buttons.map(b => b.text));
  let before = await stubState(page);
  check('1. avant : rien n\'est écrit, l\'ancienne table (4 lignes) et celle en service (2 lignes) sont là', before.tables.length === 2 && before.old === 4 && before.kept.length === 2 && before.writes.length === 0, before);
  await shot(page, 'doubles-fr-clair-1-question');
  await clickButton(page, dialog, 'Réunir');
  dialog = await waitDialog(page, /Supprimer/);
  check('1. la question de suppression nomme l\'ancienne table, le focus sur « La garder »', !!dialog && /Supprimer « Publipostage_PreferencesModeles » \?/.test(dialog.title) && dialog.buttons.map(b => b.text).join() === 'La garder,Supprimer' && dialog.fits && dialog.focus === 'La garder', dialog);
  const merged = await stubState(page);
  check('1. réunis : 3 lignes reprises, les 2 d\'origine intactes, l\'ancienne table encore là', merged.kept.length === 5 && merged.old === 4
    && merged.kept.slice(0, 2).every((row, i) => row.m === [1, 5][i] && row.f === ['Contrats', 'Notifications'][i]) && merged.kept.some(r => r.m === 0 && r.f === 'Litiges' && r.r === true), merged);
  await shot(page, 'doubles-fr-clair-2-supprimer');
  await clickButton(page, dialog, 'La garder');
  const kept = await stubState(page);
  check('1. « La garder » : l\'ancienne table reste, rien d\'autre n\'est écrit, le coin d\'état dit qu\'elle est gardée', kept.old === 4 && kept.tables.length === 2 && /Tables réunies/.test(kept.status) && /gardée/.test(kept.status) && !kept.error && !/RemoveTable/.test(kept.writes.join()), kept);
  check('1. la liste des documents montre maintenant les dossiers de l\'ancienne table', JSON.stringify(await folderPaths(page)) === JSON.stringify(['Contrats', 'Contrats/Avenants', 'Litiges', 'Notifications']), await folderPaths(page));
  await page.context().close();

  // Rouvert (le document tel que la réunion l'a laissé) : la réponse est retenue, plus aucune question.
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
  await context.addInitScript(() => { try { if (!localStorage.getItem('e2e_keep')) localStorage.setItem('e2e_keep', '1'); } catch (e) {} });
  const first = await openPage({ phase: 'doubled', lang: 'fr', theme: 'light', context });
  const q = await waitDialog(first, /Deux tables/);
  await clickButton(first, q, 'Réunir');
  const r = await waitDialog(first, /Supprimer/);
  await clickButton(first, r, 'La garder');
  await first.close();
  const second = await openPage({ phase: 'merged', lang: 'fr', theme: 'light', context });
  await ready(second);
  check('1. rouvert après « La garder » : aucune question, rien n\'est écrit', await noDialog(second) && (await stubState(second)).writes.length === 0, await stubState(second));
  await context.close();
}

// 2) Anglais, sombre : « Merge » puis « Delete ».
console.log('2. anglais, sombre : merge, delete');
{
  const page = await openPage({ phase: 'doubled', lang: 'en', theme: 'dark' });
  let dialog = await waitDialog(page, /Two tables/);
  check('2. fenêtre en anglais, thème sombre, tient dans le panneau', !!dialog && dialog.title === 'Two tables for the same data' && dialog.theme === 'dark' && dialog.fits && dialog.buttons.map(b => b.text).join() === 'Later,Merge' && dialog.buttons.every(b => b.inside && b.top), dialog);
  check('2. le message nomme les deux tables et dit « 4 rows »', !!dialog && /Publipostage_PreferencesModeles/.test(dialog.message) && /4 rows/.test(dialog.message), dialog && dialog.message);
  await shot(page, 'doubles-en-sombre-1-question');
  await clickButton(page, dialog, 'Merge');
  dialog = await waitDialog(page, /Delete/);
  check('2. question de suppression en anglais, le focus sur « Keep it » (un Entrée distrait ne supprime rien)', !!dialog && dialog.title === 'Delete “Publipostage_PreferencesModeles”?' && dialog.buttons.map(b => b.text).join() === 'Keep it,Delete' && dialog.fits && dialog.focus === 'Keep it', dialog);
  await shot(page, 'doubles-en-sombre-2-supprimer');
  await clickButton(page, dialog, 'Delete');
  await page.waitForTimeout(400);
  const done = await stubState(page);
  check('2. l\'ancienne table est supprimée, et elle seule ; celle en service porte les 5 lignes', done.tables.join() === 'Publipostage_TemplatePreferences' && !done.oldRowsKnown && done.kept.length === 5 && done.writes.filter(w => /RemoveTable/.test(w)).length === 1, done);
  check('2. le coin d\'état dit « Tables merged, old table deleted. », en entier dans le panneau', done.status === 'Tables merged, old table deleted.' && !done.error, done.status);
  check('2. la liste des documents montre tous les dossiers', JSON.stringify(await folderPaths(page)) === JSON.stringify(['Contrats', 'Contrats/Avenants', 'Litiges', 'Notifications']), await folderPaths(page));
  check('2. plus aucune paire à l\'exécution (detect)', await page.evaluate(async () => (await TableDoubles.detect()).length) === 0);
  await page.context().close();
}

// 3) « Plus tard » : rien n'est écrit, rien n'est supprimé.
console.log('3. français : plus tard');
{
  const page = await openPage({ phase: 'doubled', lang: 'fr', theme: 'light' });
  const dialog = await waitDialog(page, /Deux tables/);
  await clickButton(page, dialog, 'Plus tard');
  await page.waitForTimeout(300);
  const state = await stubState(page);
  check('3. « Plus tard » : aucune écriture dans les deux tables, aucune suppression', state.writes.length === 0 && state.old === 4 && state.kept.length === 2, state);
  check('3. le coin d\'état dit de rouvrir le widget, sans déborder du panneau', /Deux tables pour les mêmes données : rouvrez le widget/.test(state.status), state.status);
  check('3. la fenêtre est fermée', (await dialogOf(page)) === null);
  await page.context().close();
}

// 4) Une seule table : aucune fenêtre.
console.log('4. une seule table');
{
  const page = await openPage({ phase: 'single', lang: 'fr', theme: 'light' });
  await ready(page);
  check('4. un document sans deux tables : aucune fenêtre', await noDialog(page));
  await page.context().close();
}

// 5) Le stockage du navigateur est refusé : « La garder » tient quand même, par le document.
console.log('5. stockage du navigateur refusé : la réponse est gardée dans le document');
{
  const settingsOf = page => page.evaluate(() => {
    const stub = window.__gristStub;
    const t = stub.state.rows.Publipostage_Templates;
    const rows = t && t.TemplateType ? t.id.filter((id, i) => t.TemplateType[i] === 'reglages').map(id => stub.getRow('Publipostage_Templates', id)) : [];
    return rows.length ? rows[0].Content : null;
  });
  const first = await openPage({ phase: 'doubled', lang: 'fr', theme: 'light', noStorage: true });
  check('5. le stockage est bien refusé dans cette page', await first.evaluate(() => { try { localStorage.getItem('x'); return false; } catch (e) { return e.name === 'SecurityError'; } }));
  const q = await waitDialog(first, /Deux tables/);
  await clickButton(first, q, 'Réunir');
  const r = await waitDialog(first, /Supprimer/);
  check('5. la question de suppression s\'ouvre', !!r && /Supprimer « Publipostage_PreferencesModeles » \?/.test(r.title), r && r.title);
  await clickButton(first, r, 'La garder');
  await first.waitForTimeout(600);
  const written = await settingsOf(first);
  let parsed = null;
  try { parsed = JSON.parse(written); } catch (e) { parsed = null; }
  check('5. « La garder » est écrite dans les réglages du document : doublesKept nomme l\'ancienne table', !!parsed && JSON.stringify(parsed.doublesKept) === '["Publipostage_PreferencesModeles"]', written);
  await first.context().close();

  // Rechargé (le document tel que la réunion l'a laissé, avec les réglages que Grist a gardés), le navigateur refusant toujours son stockage : aucune question.
  const second = await openPage({ phase: 'merged', lang: 'fr', theme: 'light', noStorage: true, settings: written });
  await ready(second);
  check('5. rechargé, stockage toujours refusé : aucune question, rien n\'est écrit dans les tables', await noDialog(second) && (await stubState(second)).writes.length === 0, await stubState(second));
  await second.context().close();

  // Sans le réglage du document (ce que faisait le widget avant), la question reviendrait : c'est bien lui qui la fait taire.
  const control = await openPage({ phase: 'merged', lang: 'fr', theme: 'light', noStorage: true });
  const again = await waitDialog(control, /Supprimer/);
  check('5. témoin : sans le réglage du document, la question de suppression revient', !!again && /Supprimer « Publipostage_PreferencesModeles » \?/.test(again.title), again && again.title);
  await control.context().close();
}

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
