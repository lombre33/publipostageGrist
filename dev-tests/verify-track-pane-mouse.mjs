#!/usr/bin/env node
// Le volet « Modifications » (js/track-changes-pane.js ; choix de la mise en page : colonne à droite du texte) à la vraie souris et au vrai clavier, à la taille du panneau Grist (~700x400), en clair,
// en sombre puis en anglais. Les scénarios de dev-tests/scenarios-track-changes.js (trackchanges_pane_...) tournent DANS la page ; ce script-ci prouve :
//   1) la ligne « Liste des modifications » du menu « Édition collaborative » (vrai clic) ouvre le volet, tout entier dans le panneau, à droite ; le texte lui laisse sa place et la page garde sa largeur ;
//   2) trois modifications de deux personnes : trois lignes dans l'ordre du texte, avec le nom, la date, ce qui est fait (Ajout, Suppression, Remplacement) et l'extrait ; au moins deux se voient sans défiler ;
//   3) un clic sur une ligne amène le curseur au début de la modification (la ligne devient la courante, « 2 sur 3 ») ; « Suivant » et « Précédent » (souris, puis clavier) font le tour et reprennent au bout ;
//   4) « Accepter » et « Refuser » d'une ligne (vrai clic) ne résolvent que celle-là ; le focus passe à la ligne qui prend sa place ;
//   5) une frappe en suivi ajoute une ligne sans rien rouvrir ; Échap ferme le volet, rend le focus au texte et la place à la page ;
//   6) le texte du volet se lit (4,5:1 au moins) dans les deux thèmes ; le clavier ouvre le volet depuis le menu (Tab, Entrée) et le focus arrive sur « Modification suivante » ;
//   7) à partir de deux personnes : un point de couleur par ligne (3:1 au moins sur le fond du volet), le choix de la personne ne garde que ses lignes, « Suivant » n'en sort pas, et « Refuser »
//      (vrai clic) ne résout que les siennes ; le volet reste utilisable (au moins une ligne entière à la vue) avec le choix et les deux boutons ;
//   8) les quatre affichages (liste déroulante « Affichage », au clavier) : « Sans marque » cache le supprimé et ôte la teinte de l'inséré, « Marques simples » y met un trait à gauche, « Original » cache
//      l'inséré et lit le supprimé en texte ordinaire ; hors « Toutes les marques » une frappe au vrai clavier ne change rien ; « Suivant » va jusqu'à une suppression cachée ; fermer le volet rend la frappe.
// Lancé par run-headless.mjs (groupe Node "trackPaneMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-track-pane-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TRACK_PANE_MOUSE_PORT || 8934);
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
if (!OFFLINE) console.log('[verify-track-pane-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const SHOTS = process.env.TRACK_PANE_SHOTS || mkdtempSync(join(tmpdir(), 'track-pane-'));
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


const DOC = '<p>Alpha <ins data-id="3">ajouté</ins> bêta <del data-id="1">retiré</del> gamma <del data-id="2">ancien</del><ins data-id="2">nouveau</ins> fin.</p><p>Un deuxième paragraphe, pour que le texte ait de la place.</p>';
const META = {
  1: { author: 'jean.dupont@example.org', authorName: 'Jean Dupont', createdAt: '2026-11-03T09:00:00.000Z' },
  2: { author: 'paul.martin@example.org', createdAt: '2026-11-04T10:00:00.000Z' },
  3: { author: 'jean.dupont@example.org', authorName: 'Jean Dupont', createdAt: '2026-11-03T09:05:00.000Z' },
};
async function loadDoc(page) {
  await page.evaluate(([html, meta]) => { Editor.setTrackChanges(false); Editor.setHTML(html, meta); }, [DOC, META]);
  await page.waitForTimeout(350);
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
  const items = pane ? Array.from(pane.querySelectorAll('.pp-trackpane-item')) : [];
  const ed = EditorCore.getEditor();
  const r = pane ? pane.getBoundingClientRect() : null;
  const c = box.getBoundingClientRect();
  // Le texte garde ses retours à la ligne : la page se réduit avec la fenêtre (zoom « Ajuster »), elle ne se recoupe pas. Les lignes du 2e paragraphe, comptées à leur hauteur.
  const range = document.createRange();
  range.selectNodeContents(document.querySelectorAll('.tiptap p')[1]);
  const lines = new Set(Array.from(range.getClientRects()).map(rect => Math.round(rect.top))).size;
  return {
    shown: !!pane && !pane.hidden && !!r && r.width > 0, pane: r && [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
    container: [Math.round(c.left), Math.round(c.top), Math.round(c.right), Math.round(c.bottom)], lines,
    rows: items.map(item => ({
      who: item.querySelector('.pp-trackpane-who').textContent, what: item.querySelector('.pp-trackpane-what').textContent, when: item.querySelector('.pp-trackpane-when').textContent,
      extracts: Array.from(item.querySelectorAll('.pp-trackpane-extract')).map(e => e.textContent), current: item.classList.contains('is-current'),
    })),
    count: pane ? pane.querySelector('.pp-trackpane-count').textContent : '', title: pane ? pane.querySelector('.pp-trackpane-tab.is-active').textContent : '',
    rowPressed: document.getElementById('v2-btn-track-pane').getAttribute('aria-pressed'), rowLit: document.getElementById('v2-btn-track-pane').classList.contains('is-active'),
    selFrom: ed.state.selection.from, html: Editor.getHTML(), focus: document.activeElement && (document.activeElement.className || document.activeElement.id),
    inEditor: !!document.activeElement && !!document.activeElement.closest && !!document.activeElement.closest('.ProseMirror'),
    listHeight: pane ? pane.querySelector('.pp-trackpane-list').getBoundingClientRect().height : 0,
  };
});
const startOf = (page, id) => page.evaluate((i) => Editor.getSuggestionEntries().find(e => e.id === i).from, id);

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
  const T = en ? { title: 'Changes', add: 'Addition', del: 'Deletion', rep: 'Replacement', count: '3 changes', second: '2 of 3', now: 'Just now' } : { title: 'Modifications', add: 'Ajout', del: 'Suppression', rep: 'Remplacement', count: '3 modifications', second: '2 sur 3', now: "À l'instant" };

  // 1) le clic sur la ligne du menu ouvre le volet, à droite, tout entier dans le panneau ; la page garde sa largeur
  const before = await paneState(page);
  await clickRow(page, '#v2-btn-track-pane');
  await away(page);
  const s1 = await paneState(page);
  await page.screenshot({ path: `${SHOTS}/volet-${mode}.png` });
  check(`${mode} : un vrai clic sur « Liste des modifications » ouvre le volet (ligne enfoncée), titré « ${T.title} »`, s1.shown && s1.rowPressed === 'true' && s1.rowLit && s1.title === T.title, s1);
  check(`${mode} : le volet est à droite, tout entier dans le panneau, sous la barre d'outils`, !!s1.pane && s1.pane[2] === WIDTH && s1.pane[0] >= WIDTH / 3 && s1.pane[1] >= 100 && s1.pane[3] <= HEIGHT, s1.pane);
  check(`${mode} : le texte lui laisse sa place (le conteneur s'arrête où le volet commence) et le document ne change pas (mêmes retours à la ligne)`, s1.container[2] === s1.pane[0] && s1.lines === before.lines && s1.lines >= 1, { pane: s1.pane, container: s1.container, avant: before.lines, apres: s1.lines });

  // 2) trois lignes dans l'ordre du texte, avec nom, date, action, extrait
  const r = s1.rows;
  check(`${mode} : trois lignes dans l'ordre du texte (Ajout, Suppression, Remplacement), le compte dit « ${T.count} »`, r.length === 3 && r[0].what === T.add && r[1].what === T.del && r[2].what === T.rep && s1.count === T.count, { rows: r, count: s1.count });
  check(`${mode} : chaque ligne nomme la personne (le nom, l'adresse à défaut de nom) et donne une date`, r.length === 3 && r[0].who === 'Jean Dupont' && r[1].who === 'Jean Dupont' && r[2].who === 'paul.martin@example.org' && r.every(x => /\d/.test(x.when)), r);
  check(`${mode} : chaque ligne montre l'extrait (+ ajouté, − retiré, − ancien et + nouveau)`, r.length === 3 && r[0].extracts.join() === '+ajouté' && r[1].extracts.join() === '−retiré' && r[2].extracts.join() === '−ancien,+nouveau', r.map(x => x.extracts));
  check(`${mode} : au moins deux lignes se voient sans défiler (liste d'au moins 100 px de haut)`, s1.listHeight >= 100, s1.listHeight);

  // 3) un clic sur une ligne amène le curseur ; Suivant, Précédent
  const second = await startOf(page, '1');
  await clickAt(page, '.pp-trackpane-item:nth-child(2) .pp-trackpane-go');
  const s3 = await paneState(page);
  check(`${mode} : un clic sur la 2e ligne amène le curseur au début de la modification, la ligne devient la courante (« ${T.second} »)`, s3.selFrom === second && s3.rows[1].current && !s3.rows[0].current && s3.count === T.second, { selFrom: s3.selFrom, attendu: second, count: s3.count });
  await clickAt(page, '.pp-trackpane-next');
  const s4 = await paneState(page);
  await clickAt(page, '.pp-trackpane-next');
  const s5 = await paneState(page);
  check(`${mode} : « Suivant » passe à la ligne d'après, puis reprend par la première au bout de la liste`, s4.rows[2].current && s4.count.startsWith('3') && s5.rows[0].current && s5.count.startsWith('1'), { s4: s4.count, s5: s5.count });
  await clickAt(page, '.pp-trackpane-prev');
  const s6 = await paneState(page);
  check(`${mode} : « Précédent » depuis la première reprend par la dernière`, s6.rows[2].current && s6.selFrom === (await startOf(page, '2')), { count: s6.count, selFrom: s6.selFrom });
  await page.focus('.pp-trackpane-next');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const s7 = await paneState(page);
  check(`${mode} : au clavier, Entrée sur « Suivant » avance de ligne en ligne sans quitter le bouton`, s7.rows[1].current && /pp-trackpane-next/.test(String(s7.focus)), { count: s7.count, focus: s7.focus });

  // 4) Accepter / Refuser d'une ligne
  await clickAt(page, '.pp-trackpane-item:nth-child(1) .pp-trackpane-accept');
  const s8 = await paneState(page);
  check(`${mode} : « Accepter » de la 1re ligne ne résout que celle-là (« ajouté » reste sans marque, les deux autres restent), le focus passe à la ligne suivante`,
    s8.rows.length === 2 && /Alpha ajouté bêta/.test(s8.html) && /<del data-id="1">retiré<\/del>/.test(s8.html) && /pp-trackpane-go/.test(String(s8.focus)), { rows: s8.rows.length, focus: s8.focus, html: s8.html });
  await clickAt(page, '.pp-trackpane-item:nth-child(1) .pp-trackpane-reject');
  const s9 = await paneState(page);
  check(`${mode} : « Refuser » de la ligne suivante rend le texte d'avant (« retiré » est de nouveau écrit sans barré) ; il reste une ligne`, s9.rows.length === 1 && /bêta retiré gamma/.test(s9.html), { rows: s9.rows.length, html: s9.html });

  // 5) une frappe en suivi ajoute une ligne ; Échap ferme
  await page.evaluate(() => { document.getElementById('v2-btn-track-changes').click(); });
  await page.waitForTimeout(250);
  const para = await rectOf(page, '.ProseMirror p');
  await page.mouse.click(para.l + 30, para.y);
  await page.keyboard.press('End');
  await page.keyboard.type(' neuf');
  await page.waitForTimeout(700);
  const s10 = await paneState(page);
  check(`${mode} : une frappe avec le suivi allumé ajoute une ligne au volet, sans le rouvrir (« ${T.now} »)`, s10.shown && s10.rows.length === 2 && s10.rows.some(x => x.extracts.join() === '+ neuf' || x.extracts.join() === '+neuf') && s10.rows.some(x => x.when === T.now), s10.rows);
  await page.focus('.pp-trackpane-next');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const s11 = await paneState(page);
  check(`${mode} : Échap ferme le volet (ligne relevée), rend le focus au texte et la place au conteneur`, !s11.shown && s11.rowPressed === 'false' && !s11.rowLit && s11.inEditor && s11.container[2] === WIDTH, s11);

  // 6) lisibilité et clavier
  await page.evaluate(() => { Editor.setTrackChanges(false); });
  await loadDoc(page);
  await clickRow(page, '#v2-btn-track-pane');
  await away(page);
  const colors = await page.evaluate(() => {
    const pane = document.getElementById('pp-track-pane');
    const bg = getComputedStyle(pane).backgroundColor;
    const pick = (sel) => { const e = pane.querySelector(sel); return e ? { sel, color: getComputedStyle(e).color, bg } : null; };
    return ['.pp-trackpane-tab.is-active', '.pp-trackpane-tab:not(.is-active)', '.pp-trackpane-count', '.pp-trackpane-who', '.pp-trackpane-when', '.pp-trackpane-what', '.pp-trackpane-text'].map(pick);
  });
  const ratios = colors.map(c => c && ({ sel: c.sel, ratio: Math.round(contrast(c.color, c.bg) * 100) / 100 }));
  check(`${mode} : le texte du volet se lit sur son fond (4,5:1 au moins)`, ratios.every(x => x && x.ratio >= 4.5), ratios);
  await clickAt(page, '.pp-trackpane-close');
  const s12 = await paneState(page);
  check(`${mode} : le bouton de fermeture ferme le volet`, !s12.shown && s12.container[2] === WIDTH, s12);
  await page.focus('#v2-btn-find');
  await page.keyboard.press('Tab');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  const k1 = await page.evaluate(() => document.activeElement.id);
  check(`${mode} : au clavier, Tab depuis la loupe arrive sur « Liste des modifications » (cinquième ligne du menu)`, k1 === 'v2-btn-track-pane', k1);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  const k2 = await paneState(page);
  check(`${mode} : Entrée ouvre le volet et le focus arrive sur « Modification suivante »`, k2.shown && /pp-trackpane-next/.test(String(k2.focus)), { shown: k2.shown, focus: k2.focus });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 7) couleur et choix de la personne
  await page.evaluate(([html, meta]) => { Editor.setTrackChanges(false); Editor.setHTML(html, meta); }, [DOC.replace('fin.</p>', 'fin <ins data-id="4">encore</ins>.</p>'), { ...META, 4: { author: 'zoe.bernard@example.org', authorName: 'Zoé Bernard', createdAt: '2026-11-05T08:00:00.000Z' } }]);
  await page.waitForTimeout(350);
  await clickRow(page, '#v2-btn-track-pane');
  await away(page);
  const people = () => page.evaluate(() => {
    const pane = document.getElementById('pp-track-pane');
    const bg = getComputedStyle(pane).backgroundColor;
    const filterRow = pane.querySelector('.pp-trackpane-filterrow');
    const filter = pane.querySelector('.pp-trackpane-filter');
    const bulk = pane.querySelector('.pp-trackpane-bulk');
    const box = el => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
    const rows = Array.from(pane.querySelectorAll('.pp-trackpane-item'));
    const list = pane.querySelector('.pp-trackpane-list');
    const lr = list.getBoundingClientRect();
    return {
      bg, filterShown: !filterRow.hidden && filterRow.getBoundingClientRect().height > 0, filterBox: box(filter), pane: box(pane), bulkShown: !bulk.hidden, bulkBox: !bulk.hidden ? box(bulk) : null,
      options: Array.from(filter.options).map(o => o.textContent), value: filter.value,
      rows: rows.map(r => ({ who: r.querySelector('.pp-trackpane-who').textContent, dot: getComputedStyle(r.querySelector('.pp-trackpane-dot')).backgroundColor, ring: r.querySelector('.pp-trackpane-dot').classList.contains('is-unknown') })),
      listHeight: lr.height, firstRowFits: rows.length ? rows[0].getBoundingClientRect().bottom <= lr.bottom + 0.5 : true,
      bulkLabels: Array.from(pane.querySelectorAll('.pp-trackpane-bulkbtn')).map(b => b.textContent), bulkClipped: Array.from(pane.querySelectorAll('.pp-trackpane-bulkbtn')).some(b => b.scrollWidth > b.clientWidth), count: pane.querySelector('.pp-trackpane-count').textContent,
      html: Editor.getHTML(), selFrom: EditorCore.getEditor().state.selection.from,
    };
  });
  const p1 = await people();
  const F = en ? { all: 'Everyone', jean: 'Jean Dupont (2)', rej: 'Reject (2)' } : { all: 'Toutes les personnes', jean: 'Jean Dupont (2)', rej: 'Refuser (2)' };
  check(`${mode} : à quatre modifications de trois personnes, le choix de la personne paraît sous l'en-tête, dans le panneau, et propose « ${F.all} » puis chaque personne avec son nombre`, p1.filterShown && p1.filterBox[2] <= WIDTH && p1.filterBox[0] >= p1.pane[0] && p1.options[0] === F.all && p1.options.includes(F.jean) && p1.options.length === 4 && !p1.bulkShown, { options: p1.options, filterBox: p1.filterBox, bulk: p1.bulkShown });
  check(`${mode} : chaque ligne porte un point de couleur, le même pour la même personne, deux personnes n'ont pas le même, et il se voit sur le fond du volet (3:1 au moins)`,
    p1.rows.length === 4 && p1.rows[0].dot === p1.rows[1].dot && new Set(p1.rows.map(r => r.dot)).size === 3 && p1.rows.every(r => contrast(r.dot, p1.bg) >= 3), { rows: p1.rows, bg: p1.bg });
  // Le choix se fait au clavier sur la liste déroulante (le menu natif d'un <select> n'est pas atteignable à la souris en test) : le focus y arrive par Tab depuis le bouton de fermeture, après « Précédent » et « Suivant » (la ligne du haut est celle de la phrase et de ces deux boutons).
  await page.focus('.pp-trackpane-close');
  await page.keyboard.press('Tab');
  const onPrev = await page.evaluate(() => document.activeElement.className);
  await page.keyboard.press('Tab');
  const onNext = await page.evaluate(() => document.activeElement.className);
  await page.keyboard.press('Tab');
  const onView = await page.evaluate(() => document.activeElement.className);
  await page.keyboard.press('Tab');
  const onSelect = await page.evaluate(() => document.activeElement.className);
  check(`${mode} : au clavier, Tab depuis « Fermer » arrive sur « Précédent », « Suivant », l'affichage, puis sur le choix de la personne`, /pp-trackpane-prev/.test(onPrev) && /pp-trackpane-next/.test(onNext) && /pp-trackpane-view/.test(onView) && /pp-trackpane-filter/.test(onSelect), { onPrev, onNext, onView, onSelect });
  await page.selectOption('.pp-trackpane-filter', 'jean.dupont@example.org');
  await page.waitForTimeout(300);
  const p2 = await people();
  await page.screenshot({ path: `${SHOTS}/volet-personne-${mode}.png` });
  check(`${mode} : choisir « ${F.jean} » ne garde que ses deux lignes (compte filtré) et montre « ${F.rej} » ; au moins une ligne entière reste à la vue`, p2.rows.length === 2 && p2.rows.every(r => r.who === 'Jean Dupont') && p2.bulkShown && p2.bulkLabels[1] === F.rej && p2.firstRowFits && p2.listHeight >= 40 && /2/.test(p2.count), { rows: p2.rows.length, bulk: p2.bulkLabels, list: p2.listHeight, fits: p2.firstRowFits, count: p2.count });
  check(`${mode} : les deux boutons du bas sont dans le panneau et leur texte n'est pas coupé`, !p2.bulkClipped && !!p2.bulkBox && p2.bulkBox[3] <= HEIGHT && p2.bulkBox[2] <= WIDTH && p2.bulkBox[0] >= p2.pane[0], p2.bulkBox);
  await clickAt(page, '.pp-trackpane-next');
  const p3 = await people();
  await clickAt(page, '.pp-trackpane-next');
  const p4 = await people();
  const startsOfJean = [await startOf(page, '3'), await startOf(page, '1')];
  check(`${mode} : « Suivant » ne sort pas de ses modifications (le curseur n'est que sur l'une des deux)`, startsOfJean.includes(p3.selFrom) && startsOfJean.includes(p4.selFrom) && p3.selFrom !== p4.selFrom, { p3: p3.selFrom, p4: p4.selFrom, debuts: startsOfJean });
  await clickAt(page, '.pp-trackpane-bulkbtn:nth-child(2)');
  const p5 = await people();
  check(`${mode} : « ${F.rej} » (vrai clic) ne résout que ses deux modifications ; les autres restent en attente et le choix retombe sur tout le monde`, !/data-id="[13]"/.test(p5.html) && /<del data-id="2">ancien<\/del>/.test(p5.html) && /<ins data-id="4">encore<\/ins>/.test(p5.html) && p5.value === '' && p5.rows.length === 2 && !p5.bulkShown, { html: p5.html, value: p5.value, rows: p5.rows.length });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 8) les quatre affichages
  await page.evaluate(([html, meta]) => { Editor.setTrackChanges(false); Editor.setHTML(html, meta); }, [DOC, META]);
  await page.waitForTimeout(350);
  await clickRow(page, '#v2-btn-track-pane');
  await away(page);
  const look = () => page.evaluate(() => {
    const dom = EditorCore.getEditor().view.dom;
    const pane = document.getElementById('pp-track-pane');
    const ins = dom.querySelector('ins[data-id="3"]');
    const del = dom.querySelector('del[data-id="1"]');
    const para = dom.querySelector('p');
    const boxOf = el => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
    const note = pane.querySelector('.pp-trackpane-viewnote');
    const view = pane.querySelector('.pp-trackpane-view');
    const list = pane.querySelector('.pp-trackpane-list');
    const rows = Array.from(pane.querySelectorAll('.pp-trackpane-item'));
    return {
      attr: dom.dataset.trackView || '', editable: EditorCore.getEditor().isEditable, contenteditable: dom.getAttribute('contenteditable'),
      insShown: ins.getClientRects().length > 0, delShown: del.getClientRects().length > 0,
      insFill: getComputedStyle(ins).backgroundColor, delLine: getComputedStyle(del).textDecorationLine, delColor: getComputedStyle(del).color, paraColor: getComputedStyle(para).color, bar: getComputedStyle(para).boxShadow,
      noteShown: !note.hidden && note.getBoundingClientRect().height > 0, noteText: note.textContent, noteBox: boxOf(note), viewBox: boxOf(view), pane: boxOf(pane),
      listHeight: list.getBoundingClientRect().height, firstRowFits: rows.length ? rows[0].getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 0.5 : true,
      html: Editor.getHTML(), selFrom: EditorCore.getEditor().state.selection.from, selTo: EditorCore.getEditor().state.selection.to,
      noteColor: getComputedStyle(note).color, paneBg: getComputedStyle(pane).backgroundColor,
    };
  });
  const V = en
    ? { options: 'All markup|Simple markup|No markup|Original', simple: 'Simple markup', final: 'No markup', original: 'Original' }
    : { options: 'Toutes les marques|Marques simples|Sans marque|Original', simple: 'Marques simples', final: 'Sans marque', original: 'Original' };
  const v0 = await look();
  const options = await page.evaluate(() => Array.from(document.querySelector('.pp-trackpane-view').options).map(o => o.textContent).join('|'));
  check(`${mode} : « Toutes les marques » est l'affichage de départ (liste : ${V.options}) : inséré teinté, supprimé barré, texte modifiable, aucune note`, options === V.options && v0.attr === '' && v0.editable && v0.insFill === 'rgb(229, 246, 238)' && v0.delLine === 'line-through' && !v0.noteShown, { options, v0 });
  await page.focus('.pp-trackpane-view');
  await page.selectOption('.pp-trackpane-view', 'final');
  await page.waitForTimeout(250);
  const v1 = await look();
  check(`${mode} : « ${V.final} » : le supprimé disparaît, l'inséré perd sa teinte, aucun trait, le texte n'est plus modifiable, la note le dit dans le volet`, v1.attr === 'final' && !v1.delShown && v1.insShown && v1.insFill === 'rgba(0, 0, 0, 0)' && v1.bar === 'none' && !v1.editable && v1.contenteditable === 'false' && v1.noteShown && v1.noteBox[2] <= v1.pane[2] && v1.noteBox[0] >= v1.pane[0], v1);
  check(`${mode} : le texte de la note se lit sur le fond du volet (4,5:1 au moins) et la liste garde une ligne entière à la vue (au moins 40 px)`, contrast(v1.noteColor, v1.paneBg) >= 4.5 && v1.listHeight >= 40 && v1.firstRowFits, { ratio: contrast(v1.noteColor, v1.paneBg), list: v1.listHeight, fits: v1.firstRowFits });
  check(`${mode} : la note tient sur une ligne (le volet garde sa place pour la liste)`, v1.noteBox[3] - v1.noteBox[1] <= 16, v1.noteBox);
  await page.selectOption('.pp-trackpane-filter', 'jean.dupont@example.org');
  await page.waitForTimeout(250);
  const crowded = await look();
  await page.screenshot({ path: `${SHOTS}/volet-sans-marque-${mode}.png` });
  check(`${mode} : au plus serré (affichage hors « Toutes les marques », une personne choisie, ses deux boutons) la liste garde une ligne entière à la vue (au moins 40 px)`, crowded.listHeight >= 40 && crowded.firstRowFits, { list: crowded.listHeight, fits: crowded.firstRowFits });
  await page.selectOption('.pp-trackpane-filter', '');
  await page.waitForTimeout(200);
  const firstPara = await rectOf(page, '.ProseMirror p');
  await page.mouse.click(firstPara.l + 40, firstPara.y);
  await page.keyboard.type('ZZZ');
  await page.waitForTimeout(300);
  const typed = await look();
  check(`${mode} : au vrai clavier, une frappe dans le texte ne change rien dans cet affichage`, typed.html === v1.html && !/ZZZ/.test(typed.html), { html: typed.html });
  await page.selectOption('.pp-trackpane-view', 'simple');
  await page.waitForTimeout(250);
  const v2 = await look();
  await page.screenshot({ path: `${SHOTS}/volet-marques-simples-${mode}.png` });
  check(`${mode} : « ${V.simple} » : comme le résultat final, avec un trait à gauche du paragraphe où quelque chose a changé`, v2.attr === 'simple' && !v2.delShown && v2.insFill === 'rgba(0, 0, 0, 0)' && v2.bar !== 'none' && !v2.editable, { attr: v2.attr, bar: v2.bar });
  await page.selectOption('.pp-trackpane-view', 'original');
  await page.waitForTimeout(250);
  const v3 = await look();
  await page.screenshot({ path: `${SHOTS}/volet-original-${mode}.png` });
  check(`${mode} : « ${V.original} » : l'inséré disparaît, le supprimé se lit comme du texte ordinaire (ni barré, ni coloré), le document est inchangé`, v3.attr === 'original' && !v3.insShown && v3.delShown && v3.delLine === 'none' && v3.delColor === v3.paraColor && v3.html === v1.html && !v3.editable, v3);
  // Un long texte, la suppression tout en bas : en « Sans marque » elle est cachée, la ligne du volet doit tout de même y amener la vue.
  const LONG = Array.from({ length: 40 }, (_, i) => `<p>Paragraphe numéro ${i + 1} du texte.</p>`).join('') + '<p>Fin <del data-id="1">retirée</del> du texte.</p>';
  await page.evaluate(([html, meta]) => { Editor.setHTML(html, meta); }, [LONG, META]);
  await page.waitForTimeout(500);
  await page.selectOption('.pp-trackpane-view', 'final');
  await page.waitForTimeout(250);
  await page.evaluate(() => { document.getElementById('editor-container').scrollTop = 0; });
  await clickAt(page, '.pp-trackpane-item:nth-child(1) .pp-trackpane-go', 600);
  const hidden = await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    const last = ed.view.dom.querySelector('p:last-child');
    const r = last.getBoundingClientRect(); const c = document.getElementById('editor-container').getBoundingClientRect();
    return { delShown: ed.view.dom.querySelector('del[data-id="1"]').getClientRects().length > 0, scrolled: document.getElementById('editor-container').scrollTop, visible: r.top >= c.top - 1 && r.bottom <= c.bottom + 1, selFrom: ed.state.selection.from, from: Editor.getSuggestionEntries()[0].from };
  });
  check(`${mode} : « Sans marque » : un clic sur la ligne d'une suppression cachée tout en bas du texte pose le curseur à sa place et fait défiler jusqu'au paragraphe qui l'entoure`, !hidden.delShown && hidden.selFrom === hidden.from && hidden.scrolled > 0 && hidden.visible, hidden);
  await page.evaluate(([html, meta]) => { Editor.setHTML(html, meta); }, [DOC, META]);
  await page.waitForTimeout(500);
  await page.selectOption('.pp-trackpane-view', 'all');
  await page.waitForTimeout(250);
  const v5 = await look();
  check(`${mode} : retour à « Toutes les marques » : texte modifiable, teintes revenues, note retirée`, v5.attr === '' && v5.editable && v5.contenteditable === 'true' && v5.delShown && v5.insFill === 'rgb(229, 246, 238)' && !v5.noteShown, v5);
  await page.selectOption('.pp-trackpane-view', 'original');
  await page.waitForTimeout(200);
  await page.focus('.pp-trackpane-next');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const v6 = await look();
  await page.keyboard.type('Q');
  await page.waitForTimeout(250);
  const v7 = await look();
  check(`${mode} : fermer le volet (Échap) depuis « Original » rend le texte modifiable, ses marques et la frappe`, v6.attr === '' && v6.editable && v6.contenteditable === 'true' && v6.insShown && v6.delShown && v7.html !== v6.html && /Q/.test(v7.html), { attr: v6.attr, editable: v6.editable, avant: v6.html, apres: v7.html });

  await page.context().close();
}

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await browser.close(); server.close();
console.log(`\ncaptures : ${SHOTS}`);
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
