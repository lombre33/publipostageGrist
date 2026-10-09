#!/usr/bin/env node
// Compte Lecteur de Grist (js/grist-api.js:isDocumentReadOnly, js/access-rights.js : état « viewer ») à la VRAIE souris (page.mouse, Node/Playwright) et à la
// taille du panneau Grist d'Antoine (~700x400) - choix du 2026-10-09 (carte « Ouvrir en lecture seule les comptes Lecteur de Grist ? » : « Oui, lecture seule »).
// dev-tests/scenarios-viewer-account.js passe le faux Grist en Lecteur DANS la page, après le démarrage. Ici la page est OUVERTE comme le cadre d'un vrai Grist le
// serait pour un Lecteur - `readonly=true` dans l'adresse dès le chargement, le faux Grist refusant toute écriture -, et ce qui se mesure en est la conséquence dès
// le premier affichage :
//  - réglage Accès présent (la ligne de la personne dit « modification, sans export, commentaires » : elle ne doit pas compter, un Lecteur n'est pas identifié) ;
//  - le widget s'ouvre en Lecture, le texte résolu, la barre d'édition grisée (pas retirée), Commenter grisé : de vrais clics n'y font rien ;
//  - Exporter en PDF part (l'export est gardé) ; Enregistrer au clavier n'écrit rien ; aucune écriture n'a été refusée de tout le parcours ;
//  - Réglages > Accès dit « Compte Lecteur dans Grist : lecture seule, export, sans commentaires », listes et case verrouillées ; Réglages > Vue verrouillé ;
//  - case « Ouvrir les personnes en lecture seule sur la Lecture épurée » cochée : le widget s'ouvre d'emblée sur le document seul (le comportement que
//    « le mode Lecture épurée n'est pas par défaut quand il est coché » disait manquer), le bouton rond du coin rend la barre, toujours en lecture seule ;
//  - témoin : la même page sans `readonly=true` s'ouvre en Édition, pas en Lecture épurée.
// Lancé par run-headless.mjs (groupe Node "viewerMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-viewer-mouse.mjs
// (VIEWER_SHOTS=<dossier> y range une capture par étape, à regarder - aucune vérification n'en dépend).
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.VIEWER_MOUSE_PORT || 8936);
const SHOTS = process.env.VIEWER_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-access-rights-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-viewer-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const VIEWER_TEXT = 'Compte Lecteur dans Grist : lecture seule, export, sans commentaires.';

// Une page neuve, ouverte comme le cadre du widget : `viewer` ajoute `readonly=true` à l'adresse. Semé avant le démarrage : un modèle « Contrat » enregistré et
// ouvert par défaut, une table des droits dont la ligne de la personne dit « modification, sans export, commentaires » (celle qu'un Lecteur ne doit pas se voir
// appliquer), le réglage Accès du widget avec la case de la Lecture épurée cochée ou non.
async function openWidget({ viewer, clean }) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme: 'light' });
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
  await page.addInitScript((cleanReading) => {
    try { localStorage.setItem('pp_lang', 'fr'); } catch (e) { /* stockage indisponible */ }
    window.__preSeedGristStub = (stub) => {
      stub.setVariables('Clients', { Nom: 'Text' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
      stub.setVariables('Droits', { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
      stub.setRows('Droits', [{ id: 1, Email: 'lecteur@exemple.fr', LectureSeule: false, Export: false, Commentaires: true }]);
      stub.setUserEmail('lecteur@exemple.fr');
      stub.state.options = { droitsAcces: { table: 'Droits', emailColumn: 'Email', readOnlyColumn: 'LectureSeule', exportColumn: 'Export', commentsColumn: 'Commentaires', cleanReading } };
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      m.Contenu.push('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>, voici le contrat de location.</p><p>Second paragraphe du modèle.</p>');
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      // Un document déjà migré, comme celui d'un propriétaire qui utilise le widget : aucune colonne à ajouter au démarrage (un Lecteur ne le pourrait pas).
      ['TypeModele', 'Destinataires', 'Cc', 'Cci', 'Objet', 'SuiviModifications'].forEach(column => { m[column] = ['']; });
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  }, clean);
  await page.goto(`${BASE}/_test-harness.html${viewer ? '?readonly=true' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  // La ligne courante, comme Grist l'envoie : le texte résolu s'affiche dans la Lecture.
  await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients'));
  await page.waitForFunction(() => {
    const c = document.querySelector('#reader-container .reader-content');
    return !!c && (c.textContent || '').indexOf('Dupont') !== -1;
  }, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  return { context, page };
}

async function hitTest(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };
// Un vrai clic : la souris quitte d'abord la commande survolée (le menu au survol d'Exporter recouvre la roue des Réglages, comme pour une vraie personne qui
// vient de l'utiliser), puis la commande doit être entière dans le panneau et non recouverte - sinon le clic n'a pas lieu et le contrôle le dit.
const click = async (page, selector) => {
  await page.mouse.move(350, 392);
  await page.waitForTimeout(250);
  const box = await hitTest(page, selector);
  if (box.found && box.onTop && box.inViewport) await page.mouse.click(box.x, box.y);
  return box;
};
const activeTab = page => page.evaluate(() => { const t = document.querySelector('#settings-tabs .settings-tab.active'); return t ? t.getAttribute('data-settings-tab') : null; });
const modalOpen = page => page.evaluate(() => { const m = document.getElementById('settings-modal'); return getComputedStyle(m).display !== 'none' && m.getClientRects().length > 0; });
const state = page => page.evaluate(() => ({
  status: document.getElementById('status-msg').textContent,
  readerShown: document.getElementById('reader-container').style.display,
  editorShown: document.getElementById('editor-container').style.display,
  clean: document.body.classList.contains('pp-clean-reading'),
  rights: AccessRights.get(),
  state: AccessRights.getStatus().state,
  denied: window.__gristStub.state.deniedWrites.length,
  deniedActions: window.__gristStub.state.deniedWrites.slice(0, 6).map(a => a[0] + ' ' + a[1] + (a[2] != null ? ' #' + a[2] : '') + (a[3] && typeof a[3] === 'object' ? ' ' + Object.keys(a[3]).join(',') : '')),
  readerText: (document.querySelector('#reader-container .reader-content') || {}).textContent || '',
}));

// ---------- 1. Lecteur, case de la Lecture épurée décochée : la Lecture, la barre grisée ----------
{
  const { context, page } = await openWidget({ viewer: true, clean: false });
  const s = await state(page);
  check('Lecteur : adresse `readonly=true` lue, droits « lecture seule, export, sans commentaires », état « viewer » (la ligne de la table, elle, disait autre chose)',
    JSON.stringify(s.rights) === JSON.stringify({ readOnly: true, canExport: true, canComment: false }) && s.state === 'viewer', s);
  check('Lecteur : le widget s\'ouvre en Lecture (éditeur caché), le texte résolu, statut « lecture seule », pas de Lecture épurée case décochée',
    /lecture seule/i.test(s.status) && s.readerShown === 'block' && s.editorShown === 'none' && /Bonjour Dupont/.test(s.readerText) && !s.clean, s);
  await shot(page, '1-lecteur-lecture');

  // Vrais clics sur les commandes grisées : rien ne se passe. La barre d'édition reste là (grisée), jamais retirée.
  const lockedState = await page.evaluate(() => {
    const ids = ['btn-mode-edit', 'v2-save-group', 'v2-btn-comment', 'v2-btn-bold'];
    return ids.map(id => { const e = document.getElementById(id); return { id, there: !!e, locked: !!e && e.classList.contains('pp-access-locked'), opacity: e ? Number(getComputedStyle(e).opacity) : null, shown: !!e && getComputedStyle(e).display !== 'none' }; });
  });
  check('Lecteur : mode Édition, Enregistrer, Commenter et la barre de mise en forme sont là, grisés (pas retirés)',
    lockedState.every(e => e.there && e.shown && e.locked && e.opacity < 0.6), lockedState);
  const editBtn = await click(page, '#btn-mode-edit');
  const commentBtn = await click(page, '#v2-btn-comment');
  await page.waitForTimeout(300);
  const afterLocked = await page.evaluate(() => ({
    readerShown: document.getElementById('reader-container').style.display,
    popup: (() => { const p = document.getElementById('v2-comment-popup'); return !!p && p.style.display !== 'none'; })(),
    marks: document.querySelectorAll('#reader-container .comment-mark').length,
  }));
  check('Lecteur : vrai clic sur Mode édition et sur Commenter (grisés) : toujours la Lecture, pas de fenêtre de commentaire, aucune marque',
    editBtn.found && commentBtn.found && afterLocked.readerShown === 'block' && !afterLocked.popup && afterLocked.marks === 0, { editBtn, commentBtn, afterLocked });

  // L'export est gardé : le vrai clic sur « Exporter en PDF » lance l'export (le moteur est remplacé par un espion, sans fichier).
  await page.evaluate(async () => {
    await ExportEngines.ensure('pdf');
    window.__exportCalls = 0;
    PdfExport.exportCurrentRecord = async () => { window.__exportCalls++; };
  });
  const pdfBtn = await hitTest(page, '#btn-export-pdf');
  if (pdfBtn.found) await page.mouse.click(pdfBtn.x, pdfBtn.y);
  await page.waitForTimeout(500);
  const exportCalls = await page.evaluate(() => window.__exportCalls);
  check('Lecteur : « Exporter en PDF » visible, non recouvert, et le vrai clic lance l\'export', pdfBtn.found && pdfBtn.inViewport && pdfBtn.onTop && exportCalls === 1, { pdfBtn, exportCalls });

  // Ctrl+S au clavier : rien n'est écrit.
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(500);
  check('Lecteur : Ctrl+S n\'écrit rien (aucune écriture tentée, donc aucune refusée par Grist)', (await state(page)).denied === 0, await state(page));

  // Réglages > Accès : la ligne dit pourquoi, les listes et la case sont verrouillées ; l'onglet Vue aussi. Tout se lit sur ce qui est AFFICHÉ (la fenêtre
  // ouverte, l'onglet montré) : un élément d'un onglet caché existe dans la page sans que personne ne le voie.
  const gear = await click(page, '#v2-btn-settings');
  await page.waitForTimeout(400);
  check('Lecteur : le vrai clic sur la roue ouvre les Réglages (à 700x400)', gear.found && gear.onTop && gear.inViewport && await modalOpen(page), gear);
  await click(page, '[data-settings-tab="access"]');
  await page.waitForTimeout(300);
  check('Lecteur : le vrai clic sur l\'onglet Accès l\'affiche', await activeTab(page) === 'access', await activeTab(page));
  const access = await page.evaluate(() => {
    const el = id => document.getElementById(id);
    const shown = e => !!e && !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const visible = id => shown(el(id));
    // Chaque liste est un <select> masqué et son champ avec recherche (le bouton qui le suit) : c'est le champ qu'on voit, grisé, et le <select> aussi.
    const listIds = ['settings-access-table', 'settings-access-email', 'settings-access-readonly', 'settings-access-export', 'settings-access-comments'];
    const field = id => { const next = el(id).nextElementSibling; return next && next.classList.contains('ss-wrap') ? next.querySelector('.ss-trigger') : el(id); };
    const hint = document.querySelector('[data-i18n="settings.access.saveHint"]');
    return {
      status: el('settings-access-status').textContent,
      statusShown: visible('settings-access-status'),
      lockedHint: visible('settings-access-locked'),
      listsShown: listIds.every(id => shown(field(id))),
      lists: listIds.map(id => el(id).disabled && field(id).disabled),
      cleanBox: el('settings-access-clean-reading').disabled,
      cleanBoxShown: visible('settings-access-clean-reading'),
      saveHint: hint ? hint.textContent : '',
      reminder: visible('settings-save-reminder'),
    };
  });
  check('Lecteur, Réglages > Accès : « Compte Lecteur dans Grist : lecture seule, export, sans commentaires », ligne « lecture seule : réglage verrouillé », listes et case grisées, pas de rappel « Enregistrer »',
    access.status === VIEWER_TEXT && access.statusShown && access.lockedHint && access.listsShown && access.lists.every(Boolean) && access.cleanBox && access.cleanBoxShown && !access.reminder, access);
  check('Lecteur, Réglages > Accès : l\'aide dit qu\'un compte Lecteur de Grist ouvre toujours en lecture seule', /un compte Lecteur de Grist ouvre toujours en lecture seule/.test(access.saveHint), access.saveHint);
  const statusBox = await page.evaluate(() => {
    document.getElementById('settings-access-status').scrollIntoView({ block: 'nearest' });
    const r = document.getElementById('settings-access-status').getBoundingClientRect();
    const win = document.querySelector('#settings-modal .pp-modal-box, #settings-modal [role="dialog"], #settings-modal > div > div') || document.getElementById('settings-modal');
    const w = win.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, winTop: w.top, winBottom: w.bottom, winLeft: w.left, winRight: w.right, innerWidth, innerHeight };
  });
  check('Lecteur, Réglages > Accès : la ligne d\'état est lisible - non vide, dans la fenêtre des Réglages et dans le panneau à 700x400',
    statusBox.height > 8 && statusBox.top >= statusBox.winTop - 1 && statusBox.bottom <= statusBox.winBottom + 1 && statusBox.left >= 0 && statusBox.right <= statusBox.innerWidth && statusBox.bottom <= statusBox.innerHeight, statusBox);
  await shot(page, '2-lecteur-reglages-acces');
  await click(page, '[data-settings-tab="rowTemplate"]');
  await page.waitForTimeout(300);
  check('Lecteur : le vrai clic sur l\'onglet Vue l\'affiche', await activeTab(page) === 'rowTemplate', await activeTab(page));
  const vue = await page.evaluate(() => {
    const el = id => document.getElementById(id);
    const visible = id => { const e = el(id); return !!e && !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    return {
      enabledShown: visible('settings-rowtemplate-enabled'), enabled: el('settings-rowtemplate-enabled').disabled,
      set: el('settings-viewtemplate-set').disabled, clear: el('settings-viewtemplate-clear').disabled,
      hintRow: visible('settings-rowtemplate-locked'), hintView: visible('settings-viewtemplate-locked'), reminder: visible('settings-save-reminder'),
    };
  });
  check('Lecteur, Réglages > Vue : case et boutons grisés (là, pas retirés) avec leur ligne « lecture seule », pas de rappel « Enregistrer »',
    vue.enabledShown && vue.enabled && vue.set && vue.clear && vue.hintRow && vue.hintView && !vue.reminder, vue);
  await shot(page, '2b-lecteur-reglages-vue');
  const closeBtn = await click(page, '#settings-close');
  await page.waitForTimeout(400);
  check('Lecteur : « Fermer » visible à 700x400 et le vrai clic ferme les Réglages', closeBtn.found && closeBtn.inViewport && closeBtn.onTop && !(await modalOpen(page)), closeBtn);
  const end = await state(page);
  check('Lecteur : aucune écriture refusée par Grist de tout le parcours (la lecture seule n\'a rien tenté, démarrage compris)', end.denied === 0, end);
  await context.close();
}

// ---------- 2. Lecteur, case de la Lecture épurée cochée : le document seul d'emblée ----------
{
  const { context, page } = await openWidget({ viewer: true, clean: true });
  const s = await state(page);
  const topBar = await page.evaluate(() => { const b = document.getElementById('toolbar-top'); return b ? getComputedStyle(b).display : null; });
  check('Lecteur, case cochée : le widget s\'ouvre d\'emblée sur la Lecture épurée (document seul, sans la barre du haut), en lecture seule',
    s.clean && topBar === 'none' && s.readerShown === 'block' && s.editorShown === 'none' && s.rights.readOnly && s.state === 'viewer' && /Bonjour Dupont/.test(s.readerText), { s, topBar });
  await shot(page, '3-lecteur-lecture-epuree');
  const exitBtn = await hitTest(page, '#btn-exit-clean-reading');
  check('Lecteur, Lecture épurée : le bouton rond du coin est visible, non recouvert, entier dans le panneau', exitBtn.found && exitBtn.inViewport && exitBtn.onTop, exitBtn);
  if (exitBtn.found) await page.mouse.click(exitBtn.x, exitBtn.y);
  await page.waitForTimeout(400);
  const back = await state(page);
  const barBack = await page.evaluate(() => { const b = document.getElementById('toolbar-top'); const r = b ? b.getBoundingClientRect() : null; return { display: b ? getComputedStyle(b).display : null, height: r ? r.height : 0 }; });
  check('Lecteur : le bouton rond rend la barre, toujours en lecture seule (Lecture affichée, éditeur caché, état « viewer »)',
    !back.clean && barBack.display !== 'none' && barBack.height > 20 && back.readerShown === 'block' && back.editorShown === 'none' && back.rights.readOnly && back.state === 'viewer', { back, barBack });
  const commentLocked = await page.evaluate(() => document.getElementById('v2-btn-comment').classList.contains('pp-access-locked'));
  const exportFree = await page.evaluate(() => !document.getElementById('v2-export-pdf-group').classList.contains('pp-access-locked'));
  check('Lecteur, barre rendue : Commenter reste grisé, l\'export libre', commentLocked && exportFree, { commentLocked, exportFree });
  check('Lecteur, Lecture épurée : aucune écriture refusée', back.denied === 0, back);
  await context.close();
}

// ---------- 3. Témoin : la même page sans `readonly=true` ----------
{
  const { context, page } = await openWidget({ viewer: false, clean: true });
  const s = await state(page);
  check('Témoin (même réglage, adresse sans `readonly=true`) : le widget s\'ouvre en Édition, tous les droits, ni Lecture épurée ni état « viewer »',
    s.editorShown === 'block' && s.readerShown !== 'block' && !s.clean && s.rights.readOnly === false && s.state === 'found', s);
  await shot(page, '4-temoin-edition');
  await context.close();
}

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
