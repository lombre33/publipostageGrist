#!/usr/bin/env node
// L'onglet « Commentaires » du volet (js/track-changes-pane.js, js/comments-list.js, Comments.listThreads / revealThread / setThreadResolved) à la vraie souris et au vrai clavier, à la taille du panneau
// Grist (~700x400), en clair, en sombre puis en anglais. Les cas de dev-tests/scenarios-comments.js (comment_list_...) et de scenarios-track-changes.js (trackchanges_comment_pane_...) tournent DANS la page ;
// ce script-ci prouve :
//   1) la ligne « Liste des commentaires » du menu « Édition collaborative » (vrai clic) ouvre le volet sur l'onglet « Commentaires », à droite, tout entier dans le panneau ; le texte lui laisse sa place ;
//   2) un commentaire par ligne, dans l'ordre du texte, avec qui, quand, le passage cité (coupé à un mot près), le dernier mot (avec le nom de son auteur quand il y a des réponses), les réponses et « Résolu » ;
//      par défaut les commentaires ouverts, le choix « Ouverts / Résolus / Tous » avec le nombre de chacun ; au moins deux lignes se voient sans défiler ;
//   3) un clic sur une ligne amène le curseur au passage, le texte défile jusque-là et la fenêtre du fil s'ouvre ; « Suivant » et « Précédent » (souris puis clavier) font le tour et reprennent ;
//   4) « Résoudre » (vrai clic) résout le fil de la ligne : elle quitte « Ouverts », le focus passe à la ligne qui prend sa place, la marque du texte est résolue ; « Rouvrir » (dans « Résolus ») le rouvre ;
//   5) les deux onglets (souris, puis flèches du clavier) : chacun son contenu, la ligne du menu de l'onglet montré est allumée ; Échap ferme le volet et rend la place au texte ;
//   6) le texte du volet se lit (4,5:1 au moins) dans les deux thèmes ; le volet reste utilisable (au moins une ligne entière à la vue) ; aucune ligne ne déborde.
// Lancé par run-headless.mjs (groupe Node "commentPaneMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-comment-pane-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.COMMENT_PANE_MOUSE_PORT || 8935);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-menu-click-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-comment-pane-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const SHOTS = process.env.COMMENT_PANE_SHOTS || mkdtempSync(join(tmpdir(), 'comment-pane-'));
mkdirSync(SHOTS, { recursive: true });

// Une page neuve par thème : même panneau ~700x400, mêmes routes hors-ligne.
async function openPage(dark) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme: dark ? 'dark' : 'light' });
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
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  await loadDoc(page);
  return page;
}



const FILLER = Array.from({ length: 24 }, (_, i) => `<p>Un paragraphe de remplissage, le numéro ${i + 1}, pour que le texte dépasse la fenêtre.</p>`).join('');
const DOC = '<p>Premier paragraphe avec un <span class="comment-mark" data-comment-id="c1" data-resolved="false">passage commenté en premier</span>, puis la suite du texte.</p>'
  + '<p>Deuxième paragraphe : <span class="comment-mark" data-comment-id="c2" data-resolved="false">ce passage a deux réponses, et son texte cité est volontairement assez long pour être coupé à un mot près par le volet des commentaires</span> fin.</p>'
  + '<p>Troisième paragraphe avec <span class="comment-mark" data-comment-id="c3" data-resolved="true">un passage déjà résolu</span>.</p>'
  + FILLER
  + '<p>Dernier paragraphe, tout en bas : <span class="comment-mark" data-comment-id="c4" data-resolved="false">le passage du bas</span>.</p>';
const THREADS = [
  { id: 'c1', messages: [{ auteur: 'jean.dupont@example.org', texte: 'Peut-on reformuler cette phrase ?', creeLe: '2026-11-03T09:00:00.000Z' }] },
  { id: 'c2', messages: [
    { auteur: 'paul.martin@example.org', texte: 'Je ne suis pas sûr de ce passage.', creeLe: '2026-11-04T10:00:00.000Z' },
    { auteur: 'jean.dupont@example.org', texte: 'Moi non plus.', creeLe: '2026-11-04T10:05:00.000Z' },
    { auteur: 'paul.martin@example.org', texte: 'Alors je le réécris demain matin, avec les chiffres à jour et une phrase de plus pour que ce dernier mot soit long et passe sur plusieurs lignes du volet.', creeLe: '2026-11-04T10:09:00.000Z' }] },
  { id: 'c3', messages: [{ auteur: 'jean.dupont@example.org', texte: 'Corrigé.', creeLe: '2026-11-02T08:00:00.000Z' }] },
  { id: 'c4', messages: [{ auteur: 'paul.martin@example.org', texte: 'Pensez à vérifier la date du bas de page.', creeLe: '2026-11-05T11:00:00.000Z' }] },
];
async function loadDoc(page) {
  await page.evaluate(([html, threads]) => { Editor.setTrackChanges(false); Editor.setHTML(html); Comments.stageImported(threads); }, [DOC, THREADS]);
  await page.waitForTimeout(400);
}
const rectOf = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, onTop: !!top && (top === e || e.contains(top)) };
}, sel);
async function hover(page, sel) {
  const c = await rectOf(page, sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 14, c.y - 6, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(150);
  return c;
}
async function toRow(page, rowSel) {
  const btn = await hover(page, '#v2-btn-collab');
  const row = await rectOf(page, rowSel);
  await page.mouse.move(btn.x, row.y, { steps: 10 });
  await page.mouse.move(row.x, row.y, { steps: 4 });
  await page.waitForTimeout(120);
  return row;
}
async function clickRow(page, rowSel, wait = 300) {
  const row = await toRow(page, rowSel);
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(wait);
  return row;
}
const away = async (page) => { await page.mouse.move(120, 392, { steps: 6 }); await page.waitForTimeout(250); };
async function clickAt(page, sel, wait = 350) {
  await away(page);
  const c = await rectOf(page, sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(wait);
  return c;
}
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
const contrast = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };


const paneState = (page) => page.evaluate(() => {
  const pane = document.getElementById('pp-track-pane');
  const box = document.getElementById('editor-container');
  const panel = document.getElementById('pp-track-panel-comments');
  const items = panel ? Array.from(panel.querySelectorAll('.pp-trackpane-thread')) : [];
  const ed = EditorCore.getEditor();
  const r = pane ? pane.getBoundingClientRect() : null;
  const c = box.getBoundingClientRect();
  const popup = document.getElementById('v2-comment-popup');
  const text = sel => item => { const e = item.querySelector(sel); return e ? e.textContent : null; };
  const list = panel ? panel.querySelector('.pp-trackpane-threads') : null;
  const lr = list ? list.getBoundingClientRect() : null;
  return {
    shown: !!pane && !pane.hidden && !!r && r.width > 0, pane: r && [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
    container: [Math.round(c.left), Math.round(c.top), Math.round(c.right), Math.round(c.bottom)],
    tab: pane ? (pane.querySelector('.pp-trackpane-tab.is-active') || {}).textContent : '', panelHidden: panel ? panel.hidden : null,
    changesHidden: pane ? document.getElementById('pp-track-panel-changes').hidden : null,
    rows: items.map(item => ({
      id: item.dataset.id, who: text('.pp-trackpane-who')(item), when: text('.pp-trackpane-when')(item), quote: text('.pp-trackpane-quote')(item), excerpt: text('.pp-trackpane-excerpt')(item),
      meta: text('.pp-trackpane-meta')(item), current: item.classList.contains('is-current'), resolved: item.classList.contains('is-resolved'), btn: (item.querySelector('.pp-trackpane-resolve') || {}).title,
      clipped: Array.from(item.querySelectorAll('.pp-trackpane-go, .pp-trackpane-actions')).some(e => e.getBoundingClientRect().right > r.right + 0.5),
    })),
    count: pane ? pane.querySelector('.pp-trackpane-count').textContent : '', filter: panel ? panel.querySelector('.pp-trackpane-threadfilter').value : '',
    filterOptions: panel ? Array.from(panel.querySelectorAll('.pp-trackpane-threadfilter option')).map(o => o.textContent) : [],
    empty: panel && !panel.querySelector('.pp-trackpane-empty').hidden ? panel.querySelector('.pp-trackpane-empty').textContent : '',
    rowPressed: document.getElementById('v2-btn-comment-pane').getAttribute('aria-pressed'), rowLit: document.getElementById('v2-btn-comment-pane').classList.contains('is-active'),
    changesRowLit: document.getElementById('v2-btn-track-pane').classList.contains('is-active'),
    selFrom: ed.state.selection.from, focus: document.activeElement && (document.activeElement.className || document.activeElement.id),
    inEditor: !!document.activeElement && !!document.activeElement.closest && !!document.activeElement.closest('.ProseMirror'),
    listHeight: lr ? lr.height : 0, popup: !!popup && popup.style.display !== 'none' ? popup.textContent : '',
    marks: Array.from(document.querySelectorAll('.tiptap .comment-mark')).map(m => [m.getAttribute('data-comment-id'), m.getAttribute('data-resolved')].join(':')),
  };
});
const threadFrom = (page, id) => page.evaluate((i) => Comments.listThreads().find(t => t.id === i).from, id);

for (const mode of ['clair', 'sombre', 'anglais']) {
  const dark = mode === 'sombre';
  const en = mode === 'anglais';
  console.log(`\n== Panneau ${WIDTH}x${HEIGHT}, ${mode} ==`);
  const page = await openPage(dark);
  if (en) {
    await page.evaluate(() => I18n.storeLang('en'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
    await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
    await loadDoc(page);
  }
  const T = en
    ? { tab: 'Comments', changes: 'Changes', count3: '3 comments', pos2: '2 of 3', pos3: '3 of 3', pos1: '1 of 3', count2: '2 comments', opts: ['Open (3)', 'Resolved (1)', 'All (4)'], opts2: ['Open (2)', 'Resolved (2)', 'All (4)'], replies: '2 replies', resolved: 'Resolved', reopen: 'Reopen jean.dupont@example.org\'s comment', resolve: 'Resolve jean.dupont@example.org\'s comment', emptyResolved: 'No resolved comments.', note: 'The text is read only: the “No markup” display is changed in the Changes tab.' }
    : { tab: 'Commentaires', changes: 'Modifications', count3: '3 commentaires', pos2: '2 sur 3', pos3: '3 sur 3', pos1: '1 sur 3', count2: '2 commentaires', opts: ['Ouverts (3)', 'Résolus (1)', 'Tous (4)'], opts2: ['Ouverts (2)', 'Résolus (2)', 'Tous (4)'], replies: '2 réponses', resolved: 'Résolu', reopen: 'Rouvrir le commentaire de jean.dupont@example.org', resolve: 'Résoudre le commentaire de jean.dupont@example.org', emptyResolved: 'Aucun commentaire résolu.', note: 'Le texte est en lecture seule : l\'affichage « Sans marque » se change dans l\'onglet Modifications.' };

  // 1) la ligne du menu ouvre le volet sur l'onglet « Commentaires »
  const before = await paneState(page).catch(() => null);
  await clickRow(page, '#v2-btn-comment-pane');
  await away(page);
  const s1 = await paneState(page);
  await page.screenshot({ path: `${SHOTS}/commentaires-${mode}.png` });
  check(`${mode} : un vrai clic sur « Liste des commentaires » ouvre le volet sur l'onglet « ${T.tab} » (ligne enfoncée et allumée, pas celle des modifications)`,
    s1.shown && s1.tab === T.tab && s1.panelHidden === false && s1.changesHidden === true && s1.rowPressed === 'true' && s1.rowLit && !s1.changesRowLit, s1);
  check(`${mode} : le volet est à droite, tout entier dans le panneau, et le texte lui laisse sa place`, !!s1.pane && s1.pane[2] === WIDTH && s1.pane[0] >= WIDTH / 3 && s1.pane[3] <= HEIGHT && s1.container[2] === s1.pane[0], { pane: s1.pane, container: s1.container });

  // 2) un commentaire par ligne, dans l'ordre du texte
  const r = s1.rows;
  check(`${mode} : les commentaires ouverts, un par ligne, dans l'ordre du texte (le résolu n'y est pas), le compte dit « ${T.count3} »`, r.map(x => x.id).join() === 'c1,c2,c4' && s1.count === T.count3 && s1.filter === 'open', { ids: r.map(x => x.id), count: s1.count, filter: s1.filter });
  check(`${mode} : le choix des commentaires donne le nombre de chacun (${T.opts.join(', ')})`, s1.filterOptions.join() === T.opts.join(), s1.filterOptions);
  check(`${mode} : chaque ligne nomme la personne qui a ouvert le fil et donne une date`, r.length === 3 && r[0].who === 'jean.dupont@example.org' && r[1].who === 'paul.martin@example.org' && r.every(x => x.when && /\d/.test(x.when)), r.map(x => [x.who, x.when]));
  check(`${mode} : chaque ligne cite le passage (le long est coupé à un mot près et fini par « … »)`, r.length === 3 && r[0].quote === 'passage commenté en premier' && /^ce passage a deux réponses/.test(r[1].quote) && r[1].quote.endsWith('…') && r[1].quote.length <= 81 && r[2].quote === 'le passage du bas', r.map(x => x.quote));
  check(`${mode} : le dernier mot est écrit (avec le nom de son auteur quand le fil a des réponses) ; les réponses se comptent (« ${T.replies} »)`,
    r.length === 3 && r[0].excerpt === 'Peut-on reformuler cette phrase ?' && r[0].meta === null && /^paul\.martin@example\.org : Alors je le réécris/.test(r[1].excerpt) && r[1].meta === T.replies, r.map(x => [x.excerpt, x.meta]));
  check(`${mode} : au moins deux lignes se voient sans défiler (liste d'au moins 100 px de haut), aucune ne déborde du volet`, s1.listHeight >= 100 && r.every(x => !x.clipped), { h: s1.listHeight, clipped: r.map(x => x.clipped) });

  // 3) un clic sur une ligne : le curseur au passage, le texte défilé, la fenêtre du fil ouverte
  const c2from = await threadFrom(page, 'c2');
  await clickAt(page, '.pp-trackpane-thread:nth-child(2) .pp-trackpane-go', 600);
  const s3 = await paneState(page);
  const c2to = await page.evaluate(() => Comments.listThreads().find(t => t.id === 'c2').to);
  check(`${mode} : un clic sur la 2e ligne amène le curseur au passage, la ligne devient la courante (« ${T.pos2} ») et la fenêtre du fil s'ouvre avec ses messages`,
    s3.selFrom >= c2from && s3.selFrom <= c2to && s3.rows[1].current && !s3.rows[0].current && s3.count === T.pos2 && /Je ne suis pas sûr/.test(s3.popup) && /Moi non plus/.test(s3.popup), { sel: s3.selFrom, c2from, c2to, count: s3.count, popup: s3.popup.slice(0, 80) });
  const popupBox = await page.evaluate(() => { const p = document.getElementById('v2-comment-popup'); const q = document.getElementById('pp-track-pane'); if (!p || p.style.display === 'none') return null; const a = p.getBoundingClientRect(), b = q.getBoundingClientRect(); return { popup: [Math.round(a.left), Math.round(a.top), Math.round(a.right), Math.round(a.bottom)], pane: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)], overlaps: a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom }; });
  check(`${mode} : la fenêtre du fil ne recouvre pas le volet (les boutons du volet restent atteignables)`, !!popupBox && !popupBox.overlaps, popupBox);
  await clickAt(page, '.pp-trackpane-next');
  const s4 = await paneState(page);
  const bottomMark = await page.evaluate(() => { const m = document.querySelector('.tiptap .comment-mark[data-comment-id="c4"]'); const r = m.getBoundingClientRect(); const c = document.getElementById('editor-container').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), visible: r.bottom > c.top && r.top < c.bottom }; });
  check(`${mode} : « Suivant » passe au 3e commentaire (« ${T.pos3} »), tout en bas : le texte défile et le passage est à la vue`, s4.rows[2].current && s4.count === T.pos3 && bottomMark.visible && /Pensez à vérifier/.test(s4.popup), { count: s4.count, mark: bottomMark });
  await clickAt(page, '.pp-trackpane-next');
  const s5 = await paneState(page);
  check(`${mode} : « Suivant » reprend par le premier au bout de la liste (« ${T.pos1} »)`, s5.rows[0].current && s5.count === T.pos1, { count: s5.count });
  await clickAt(page, '.pp-trackpane-prev');
  const s6 = await paneState(page);
  check(`${mode} : « Précédent » depuis le premier reprend par le dernier`, s6.rows[2].current && s6.count === T.pos3, { count: s6.count });
  await page.focus('.pp-trackpane-next');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  const s7 = await paneState(page);
  check(`${mode} : au clavier, Entrée sur « Suivant » avance sans quitter le bouton`, s7.rows[0].current && /pp-trackpane-next/.test(String(s7.focus)), { count: s7.count, focus: s7.focus });

  // 4) Résoudre, Rouvrir
  await clickAt(page, '.pp-trackpane-thread:nth-child(1) .pp-trackpane-resolve', 500);
  const s8 = await paneState(page);
  check(`${mode} : « Résoudre » (vrai clic) résout le fil : la ligne quitte « Ouverts », la marque du texte est résolue, le focus passe à la ligne qui prend sa place (${T.count2})`,
    s8.rows.map(x => x.id).join() === 'c2,c4' && s8.marks.includes('c1:true') && s8.count === T.count2 && s8.filterOptions.join() === T.opts2.join() && /pp-trackpane-go/.test(String(s8.focus)), { rows: s8.rows.map(x => x.id), marks: s8.marks, count: s8.count, opts: s8.filterOptions, focus: s8.focus });
  await page.selectOption('.pp-trackpane-threadfilter', 'resolved');
  await page.waitForTimeout(250);
  const s9 = await paneState(page);
  check(`${mode} : « Résolus » ne montre que les fils résolus, dans l'ordre du texte, chacun marqué « ${T.resolved} », avec le bouton « ${T.reopen} »`,
    s9.rows.map(x => x.id).join() === 'c1,c3' && s9.rows.every(x => x.resolved && x.meta && x.meta.includes(T.resolved)) && s9.rows[0].btn === T.reopen, { rows: s9.rows.map(x => [x.id, x.resolved, x.meta, x.btn]) });
  await clickAt(page, '.pp-trackpane-thread:nth-child(1) .pp-trackpane-resolve', 500);
  const s10 = await paneState(page);
  check(`${mode} : « Rouvrir » (vrai clic) rouvre le fil : la ligne quitte « Résolus » et la marque du texte n'est plus résolue`, s10.rows.map(x => x.id).join() === 'c3' && s10.marks.includes('c1:false'), { rows: s10.rows.map(x => x.id), marks: s10.marks });
  await clickAt(page, '.pp-trackpane-thread:nth-child(1) .pp-trackpane-resolve', 500);
  const s11 = await paneState(page);
  check(`${mode} : sans commentaire résolu, « Résolus » le dit (« ${T.emptyResolved} »)`, s11.rows.length === 0 && s11.empty === T.emptyResolved, { rows: s11.rows.length, empty: s11.empty });
  await page.selectOption('.pp-trackpane-threadfilter', 'all');
  await page.waitForTimeout(250);
  const s12 = await paneState(page);
  check(`${mode} : « Tous » montre les quatre fils dans l'ordre du texte, et la ligne de c1 propose « ${T.resolve} »`, s12.rows.map(x => x.id).join() === 'c1,c2,c3,c4' && s12.rows[0].btn === T.resolve && s12.rows.every(x => !x.resolved), { rows: s12.rows.map(x => [x.id, x.btn]) });

  // 5) les deux onglets
  await clickAt(page, '#pp-track-tab-changes');
  const s13 = await paneState(page);
  check(`${mode} : un clic sur l'onglet « ${T.changes} » montre ses modifications, cache les commentaires et allume l'autre ligne du menu`, s13.tab === T.changes && s13.panelHidden === true && s13.changesHidden === false && s13.changesRowLit && !s13.rowLit && s13.rowPressed === 'false', { tab: s13.tab, lit: s13.changesRowLit, comment: s13.rowLit });
  await page.focus('#pp-track-tab-changes');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const s14 = await paneState(page);
  check(`${mode} : au clavier, la flèche droite passe à l'onglet « ${T.tab} » et le focus le suit (le seul dans l'ordre de tabulation)`, s14.tab === T.tab && s14.focus === 'pp-trackpane-tab is-active' && (await page.evaluate(() => document.getElementById('pp-track-tab-changes').tabIndex)) === -1, { tab: s14.tab, focus: s14.focus });
  await page.keyboard.press('Home');
  await page.waitForTimeout(150);
  const s15 = await paneState(page);
  await page.keyboard.press('End');
  await page.waitForTimeout(150);
  const s16 = await paneState(page);
  check(`${mode} : Début va au premier onglet, Fin au dernier`, s15.tab === T.changes && s16.tab === T.tab, { home: s15.tab, end: s16.tab });
  await clickRow(page, '#v2-btn-track-pane');
  await away(page);
  const s17 = await paneState(page);
  check(`${mode} : « Liste des modifications » du menu, volet ouvert sur les commentaires, passe à l'onglet des modifications sans fermer le volet`, s17.shown && s17.tab === T.changes && s17.changesRowLit && !s17.rowLit, { tab: s17.tab, shown: s17.shown });
  await clickRow(page, '#v2-btn-comment-pane');
  await away(page);
  const s18 = await paneState(page);
  await clickRow(page, '#v2-btn-comment-pane');
  await away(page);
  const s19 = await paneState(page);
  check(`${mode} : « Liste des commentaires » passe à l'onglet des commentaires, puis un second clic ferme le volet (ligne relevée) et rend sa place au texte`, s18.shown && s18.tab === T.tab && s18.rowLit && !s19.shown && s19.rowPressed === 'false' && s19.container[2] === WIDTH, { s18: s18.tab, shown19: s19.shown });

  // un affichage en lecture seule se rappelle dans l'onglet des commentaires
  await clickRow(page, '#v2-btn-track-pane');
  await away(page);
  await page.selectOption('.pp-trackpane-view', 'final');
  await page.waitForTimeout(250);
  await clickAt(page, '#pp-track-tab-comments');
  const note = await page.evaluate(() => { const n = document.querySelector('.pp-trackpane-threadnote'); return { hidden: n.hidden, text: n.textContent }; });
  check(`${mode} : l'affichage « Sans marque » étant choisi, l'onglet des commentaires rappelle que le texte est en lecture seule`, note.hidden === false && note.text === T.note, note);
  await clickAt(page, '#pp-track-tab-changes');
  await page.selectOption('.pp-trackpane-view', 'all');
  await page.waitForTimeout(250);
  await clickAt(page, '#pp-track-tab-comments');
  const note2 = await page.evaluate(() => document.querySelector('.pp-trackpane-threadnote').hidden);
  check(`${mode} : « Toutes les marques » retire le rappel`, note2 === true);

  // Échap ferme, le focus revient au texte
  await page.focus('.pp-trackpane-next');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const s20 = await paneState(page);
  check(`${mode} : Échap ferme le volet, rend le focus au texte et la place au conteneur`, !s20.shown && s20.inEditor && s20.container[2] === WIDTH, { shown: s20.shown, inEditor: s20.inEditor, container: s20.container });

  // 6) lisibilité
  await clickRow(page, '#v2-btn-comment-pane');
  await away(page);
  await page.selectOption('.pp-trackpane-threadfilter', 'all');
  await page.evaluate(() => Comments.setThreadResolved('c3', true));
  await page.waitForTimeout(400);
  const colors = await page.evaluate(() => {
    const pane = document.getElementById('pp-track-pane');
    const bg = getComputedStyle(pane).backgroundColor;
    const pick = (sel) => { const e = pane.querySelector(sel); return e ? { sel, color: getComputedStyle(e).color, bg } : { sel, missing: true }; };
    return ['.pp-trackpane-tab.is-active', '.pp-trackpane-tab:not(.is-active)', '.pp-trackpane-count', '.pp-trackpane-thread:not(.is-resolved) .pp-trackpane-who', '.pp-trackpane-when', '.pp-trackpane-quote', '.pp-trackpane-excerpt', '.pp-trackpane-meta', '.pp-trackpane-thread.is-resolved .pp-trackpane-who', '.pp-trackpane-thread.is-resolved .pp-trackpane-excerpt'].map(pick);
  });
  const ratios = colors.map(c => c.missing ? c : { sel: c.sel, ratio: Math.round(contrast(c.color, c.bg) * 100) / 100 });
  check(`${mode} : le texte de l'onglet des commentaires (résolus compris) se lit sur son fond (4,5:1 au moins)`, ratios.every(x => !x.missing && x.ratio >= 4.5), ratios);
  await page.screenshot({ path: `${SHOTS}/commentaires-tous-${mode}.png` });
  await page.focus('.pp-trackpane-next');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await page.context().close();
}

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await browser.close(); server.close();
console.log(`\ncaptures : ${SHOTS}`);
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
