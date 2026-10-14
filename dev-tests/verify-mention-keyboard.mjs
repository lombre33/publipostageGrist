#!/usr/bin/env node
// Pastille « @ » (js/mention.js, js/suggestion-list.js, css/mention.css) : le panneau de 700x400 d'Antoine, au VRAI clavier (page.keyboard : frappe, flèches, Entrée, Tab, Échap, Retour
// arrière) et à la vraie souris (page.mouse), en clair, en sombre et en anglais. Ce que dev-tests/scenarios-mention.js ne peut pas voir depuis la page : une frappe réelle passe par les
// évènements du navigateur (keydown, beforeinput) et l'ordre des plugins ProseMirror, qu'un execCommand('insertText') ne rejoue pas.
//  - « @ » ouvre la liste de toutes les tables sous le curseur (ou au-dessus quand le bas manque), dans le panneau et au premier plan ; elle se filtre à la frappe, ne clignote pas ;
//  - flèches (la liste boucle), Entrée et Tab posent la fiche choisie, Échap referme sans rien écrire, Maj+Entrée garde son sens, un clic sur une ligne la pose ;
//  - « @ » ne s'ouvre ni dans une adresse e-mail, ni double, ni dans un bloc de code, ni suivi d'une espace ; une liste sans réponse dit pourquoi sans voler Entrée ;
//  - dans une liste à puces, une case de tableau et une case de grille, ↑ ↓ Tab et Entrée appartiennent à la liste ouverte ;
//  - la pastille : forme, sélection au clic, Retour arrière d'un seul geste, suivi des modifications, Lecture ;
//  - la touche cédée à « # » (Réglages > Déclencheur) ; plus de 50 fiches ; un nom très long.
// Lancé par run-headless.mjs (groupe Node "mentionKeyboard", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-mention-keyboard.mjs
// MENTION_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.MENTION_KEYBOARD_PORT || 9051);
const SHOTS = process.env.MENTION_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-text-expansion-keyboard.mjs.
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
if (!OFFLINE) console.log('[verify-mention-keyboard] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.getElementById('status-msg');
  return !!el && /prêt|ready/i.test(el.textContent || '');
}, null, { timeout: 90000 });

const nativeDialogs = [];
page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });

async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const html = () => page.evaluate(() => Editor.getHTML());
// Texte brut du document (les retours à la ligne internes d'un paragraphe sont écrits « ⏎ », le « @ » d'une pastille est dessiné par la feuille de style : il n'est pas dans le texte).
const plain = () => page.evaluate(() => {
  const clone = document.createElement('div');
  clone.innerHTML = Editor.getHTML();
  clone.querySelectorAll('br').forEach(b => b.replaceWith('⏎'));
  return clone.textContent;
});
// Les pastilles du document : [table, ligne, colonne, nom].
const chips = () => page.evaluate(() => Array.from(new DOMParser().parseFromString(Editor.getHTML(), 'text/html').querySelectorAll('.mention-chip'))
  .map(c => [c.getAttribute('data-mention-table'), c.getAttribute('data-mention-row'), c.getAttribute('data-mention-column'), c.textContent]));
const BOX = '#mention-box';
const boxState = () => page.evaluate(() => {
  const box = document.getElementById('mention-box');
  if (!box || box.style.display === 'none') return { open: false };
  const r = box.getBoundingClientRect();
  const items = Array.from(box.querySelectorAll('.ex-item')).map(i => ({ name: i.querySelector('.mention-name').textContent, table: (i.querySelector('.mention-table') || {}).textContent || '', selected: i.classList.contains('selected') }));
  const status = box.querySelector('.ex-status');
  const at = (x, y) => { const top = document.elementFromPoint(x, y); return !!top && box.contains(top); };
  // Le curseur : la ligne qu'il occupe ne doit pas être recouverte par la liste.
  const ed = EditorCore.getEditor();
  const caret = ed.view.coordsAtPos(ed.state.selection.head);
  return {
    open: true, items, status: status ? status.textContent : null,
    inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
    onTop: at(r.left + 10, r.top + 6) && at(r.left + r.width / 2, r.top + r.height / 2),
    clearOfCaret: r.top >= caret.bottom - 1 || r.bottom <= caret.top + 1, above: r.bottom <= caret.top + 1,
    noSideScroll: box.scrollWidth <= box.clientWidth + 1, l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
  };
});
const names = state => state.items.map(i => i.name).join(',');
const selectedName = state => (state.items.find(i => i.selected) || {}).name;
async function setDoc(doc) {
  await page.evaluate(d => { Editor.setHTML(d); }, doc);
  await page.waitForTimeout(250);
}
// Pointe un texte de l'éditeur (milieu par défaut) pour y cliquer pour de vrai.
const pointOf = (text, at = 0.5) => page.evaluate(({ text, at }) => {
  const walker = document.createTreeWalker(document.querySelector('.tiptap'), NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const i = n.textContent.indexOf(text);
    if (i < 0) continue;
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width * at, y: b.top + b.height / 2 };
  }
  return null;
}, { text, at });
// Curseur à la fin du dernier bloc, par un vrai clic au milieu de ce bloc puis Ctrl+Fin (voir verify-text-expansion-keyboard.mjs : pas dans la bande de l'en-tête de la feuille).
async function focusEnd() {
  const box = await page.evaluate(() => {
    const root = document.querySelector('.tiptap');
    const blocks = Array.from(root.children).filter(el => el.getBoundingClientRect().height > 0 && !el.classList.contains('ProseMirror-widget') && !el.classList.contains('ProseMirror-gapcursor'));
    const last = blocks[blocks.length - 1] || root;
    last.scrollIntoView({ block: 'nearest' });
    const r = last.getBoundingClientRect();
    return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(80);
  const inDocument = await page.evaluate(() => {
    const el = document.activeElement;
    return !!el && !!el.closest && !!el.closest('.tiptap') && !HeaderFooterPreview.isEditingHeaderFooter();
  });
  if (!inDocument) throw new Error('focusEnd : après le clic, le clavier n\'est pas dans le document (en-tête ou pied ouvert ?)');
}
// La case (ligne et colonne depuis 1) qui porte le curseur.
const cellAt = () => page.evaluate(() => {
  const ed = EditorCore.getEditor();
  const node = ed.view.domAtPos(ed.state.selection.$head.pos).node;
  const el = node && node.nodeType === 1 ? node : node && node.parentElement;
  const td = el && el.closest('td, th');
  if (!td) return null;
  const tr = td.parentElement;
  return { row: Array.from(tr.parentElement.children).indexOf(tr) + 1, col: Array.from(tr.children).indexOf(td) + 1, text: td.textContent };
});

// Trois tables dans le document : MnPersonnes (nom = NomComplet), MnLieux (Ville), MnDossiers (la table de la page ; Responsable désigne une personne par son NomComplet).
async function seed(extra) {
  await page.evaluate(async (more) => {
    const s = window.__gristStub;
    s.state.tables.filter(t => /^Mn[A-Z]/.test(t)).forEach(t => s.dropTable(t));
    s.setVariables('MnPersonnes', { Email: 'Text', NomComplet: 'Text', Poste: 'Text' });
    s.setRows('MnPersonnes', [
      { id: 1, Email: 'jean.dupont@example.fr', NomComplet: 'Jean Dupont', Poste: 'Maire' },
      { id: 2, Email: 'marie.martin@example.fr', NomComplet: 'Marie Martin', Poste: 'Adjointe' },
      { id: 3, Email: 'marc.armand@example.fr', NomComplet: 'Marc Armand', Poste: 'Trésorier' },
      { id: 4, Email: 'zoe.durand@example.fr', NomComplet: 'Zoé Durand', Poste: 'Secrétaire' },
    ]);
    s.setVariables('MnLieux', { Ville: 'Text' });
    s.setRows('MnLieux', [{ id: 1, Ville: 'Marseille' }, { id: 2, Ville: 'Marmande' }, { id: 3, Ville: 'Lyon' }]);
    s.setVariables('MnDossiers', { Titre: 'Text', Responsable: 'Ref:MnPersonnes', gristHelper_Display: 'Text' }, null, { Responsable: 'gristHelper_Display' }, { Responsable: 'NomComplet' });
    s.setRows('MnDossiers', [
      { id: 1, Titre: 'Dossier Alpha', Responsable: 2, gristHelper_Display: 'Marie Martin' },
      { id: 2, Titre: 'Dossier Bêta', Responsable: 1, gristHelper_Display: 'Jean Dupont' },
    ].concat((more && more.files) || []));
    if (more && more.empty) { s.setRows('MnPersonnes', []); s.setRows('MnLieux', []); s.setRows('MnDossiers', []); }
    if (more && more.many) {
      s.setVariables('MnFiches', { Nom: 'Text' });
      s.setRows('MnFiches', Array.from({ length: more.many }, (_, i) => ({ id: i + 1, Nom: 'Fiche ' + String(i + 1).padStart(2, '0') })));
    }
    await GristAPI.refreshSchema();
    s.fireRecord({ id: 1, Titre: 'Dossier Alpha', Responsable: 2 }, 'MnDossiers');
    Mention.reset();
  }, extra || null);
  await page.waitForTimeout(150);
}
const unseed = () => page.evaluate(() => { window.__gristStub.state.tables.filter(t => /^Mn[A-Z]/.test(t)).forEach(t => window.__gristStub.dropTable(t)); Mention.reset(); });

const FICHES = 'Dossier Alpha,Dossier Bêta,Jean Dupont,Marc Armand,Marie Martin,Zoé Durand,Lyon,Marmande,Marseille';
const PEOPLE_NAMED = 'Marc Armand,Marie Martin,Marmande,Marseille';

// Plus de 50 fiches répondent à la saisie : la liste en garde 50 et dit « Encore N résultats : précisez la recherche. » sur une ligne collée au bas de la liste, lisible dès
// l'ouverture, que la flèche haut (la liste boucle vers la cinquantième) ne recouvre pas.
const beyondFifty = () => page.evaluate(() => {
  const box = document.getElementById('mention-box');
  if (!box || box.style.display === 'none') return { open: false };
  const b = box.getBoundingClientRect();
  const more = box.querySelector('.ex-more');
  const m = more && more.getBoundingClientRect();
  const items = Array.from(box.querySelectorAll('.ex-item'));
  const selected = box.querySelector('.ex-item.selected');
  const s = selected && selected.getBoundingClientRect();
  const inBox = r => !!r && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5;
  return {
    open: true, items: items.length, more: more ? more.textContent : null, moreVisible: inBox(m), selectedIndex: items.indexOf(selected),
    selectedClear: !!s && (!m || s.bottom <= m.top + 0.5) && s.top >= b.top - 0.5,
    inPanel: b.left >= -0.5 && b.top >= -0.5 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5, last: box.lastElementChild ? box.lastElementChild.className : '',
  };
});

async function run(T) {
  await seed();

  // === La liste à la frappe ====================================================================================================================================
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('@');
  await page.waitForTimeout(200);
  let state = await boxState();
  check(`${T} : « @ » seul ouvre la liste des fiches de toutes les tables, la table de la page d'abord`, state.open && names(state) === FICHES, state);
  check(`${T} : chaque ligne dit sa table (le document en a trois à fiches)`, state.open && state.items.every(i => i.table !== '') && state.items[0].table === 'MnDossiers' && state.items[8].table === 'MnLieux', state);
  check(`${T} : la liste est dans le panneau de ${WIDTH}x${HEIGHT}, au premier plan, sans recouvrir la ligne du curseur ni défiler de côté`, state.open && state.inPanel && state.onTop && state.clearOfCaret && state.noSideScroll, state);
  check(`${T} : la première ligne est choisie`, state.open && state.items[0].selected && state.items.filter(i => i.selected).length === 1, state);
  await snap(`${T}-1-liste`);

  await page.keyboard.type('mar');
  await page.waitForTimeout(200);
  state = await boxState();
  check(`${T} : « @mar » ne garde que les fiches dont un mot commence par « mar », les noms qui commencent par la saisie d'abord`, state.open && names(state) === PEOPLE_NAMED, state);

  await page.keyboard.press('ArrowDown');
  state = await boxState();
  check(`${T} : la flèche bas descend la sélection`, state.open && selectedName(state) === 'Marie Martin', state);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  state = await boxState();
  check(`${T} : la flèche haut la remonte, et du haut de la liste elle boucle vers la dernière ligne`, state.open && selectedName(state) === 'Marseille', state);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  state = await boxState();
  check(`${T} : et la flèche bas de la dernière ligne revient à la première, sans que le curseur change de ligne dans le texte`, state.open && selectedName(state) === 'Marie Martin' && (await plain()) === '@mar', { state, text: await plain() });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check(`${T} : Entrée remplace « @mar » par la pastille de la ligne choisie, sans retour à la ligne ni espace ajoutée`, (await plain()) === 'Marie Martin' && JSON.stringify(await chips()) === JSON.stringify([['MnPersonnes', '2', 'NomComplet', 'Marie Martin']]), { text: await plain(), chips: await chips() });
  state = await boxState();
  check(`${T} : la liste se referme après le choix`, !state.open, state);
  await page.keyboard.type(' !');
  check(`${T} : le curseur est juste après la pastille, la frappe continue`, (await plain()) === 'Marie Martin !', await plain());
  const html1 = await html();
  check(`${T} : le HTML enregistré porte la table, la ligne, la colonne et le nom, la pastille n'est pas modifiable`, /<span class="mention-chip"[^>]*contenteditable="false"[^>]*data-mention-table="MnPersonnes"[^>]*data-mention-row="2"[^>]*data-mention-column="NomComplet"[^>]*>Marie Martin<\/span>/.test(html1), html1);

  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('Pour @marm');
  await page.waitForTimeout(200);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  check(`${T} : Tab pose aussi la ligne choisie (ici une ville : la pastille garde sa table)`, (await plain()) === 'Pour Marmande' && JSON.stringify(await chips()) === JSON.stringify([['MnLieux', '2', 'Ville', 'Marmande']]), { text: await plain(), chips: await chips() });

  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('@mar');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  state = await boxState();
  check(`${T} : Échap referme la liste et laisse la saisie « @mar » en place`, !state.open && (await plain()) === '@mar' && (await chips()).length === 0, { state, text: await plain() });
  await page.keyboard.type(' bonjour');
  await page.waitForTimeout(100);
  check(`${T} : après Échap, la frappe continue comme du texte et la liste ne se rouvre ni à l'espace ni à la lettre suivante`, (await plain()) === '@mar bonjour' && !(await boxState()).open, { text: await plain(), state: await boxState() });
  await page.keyboard.type(' puis @marm');
  await page.waitForTimeout(250);
  state = await boxState();
  check(`${T} : un nouveau « @ » dans le même paragraphe rouvre la liste`, state.open && names(state) === 'Marmande', state);
  await page.keyboard.press('Escape');

  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('@mar');
  await page.waitForTimeout(200);
  await page.keyboard.press('Shift+Enter');
  await page.waitForTimeout(150);
  check(`${T} : Maj+Entrée garde son sens (saut de ligne), aucune fiche n'est posée`, (await plain()) === '@mar⏎' && (await chips()).length === 0 && !(await boxState()).open, { text: await plain(), chips: await chips() });

  // Une saisie qui ne correspond à rien : un message, et Entrée garde son sens.
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('Voir @zzz');
  await page.waitForTimeout(200);
  state = await boxState();
  check(`${T} : une saisie sans réponse montre « Aucune fiche ne correspond. » au lieu de se fermer`, state.open && state.items.length === 0 && state.status === 'Aucune fiche ne correspond.' && state.inPanel && state.onTop, state);
  await snap(`${T}-2-aucune-fiche`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const split = await html();
  check(`${T} : Entrée sur ce message coupe le paragraphe comme partout ailleurs, la liste se referme`, /<p>Voir @zzz<\/p><p><\/p>/.test(split) && !(await boxState()).open, split);

  // La souris : survol, clic.
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('@');
  await page.waitForTimeout(200);
  const row = await page.evaluate(() => { const r = document.querySelectorAll('#mention-box .ex-item')[3].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(row.x, row.y, { steps: 3 });
  state = await boxState();
  check(`${T} : le survol d'une ligne la choisit`, state.open && state.items[3].selected && state.items.filter(i => i.selected).length === 1, state);
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(200);
  check(`${T} : un clic sur « Marc Armand » pose sa pastille`, (await plain()) === 'Marc Armand' && JSON.stringify(await chips()) === JSON.stringify([['MnPersonnes', '3', 'NomComplet', 'Marc Armand']]), { text: await plain(), chips: await chips() });
  check(`${T} : l'éditeur garde le focus après le clic`, await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.tiptap')));

  // === Là où « @ » ne doit rien faire =============================================================================================================================
  const stays = async (label, typed, prepare) => {
    await setDoc('<p></p>');
    if (prepare) await prepare(); else await focusEnd();
    await page.keyboard.type(typed);
    await page.waitForTimeout(200);
    const s = await boxState();
    check(`${T} : ${label}`, !s.open && (await chips()).length === 0, { s, text: await plain() });
  };
  await stays('dans une adresse e-mail (« marie@exemple.fr »), aucune liste ne s\'ouvre', 'marie@exemple.fr');
  await stays('« @@ » n\'ouvre rien', '@@');
  await stays('« @ » suivi d\'une espace ferme la liste', '@ ');
  await stays('collé à un chiffre (« 12@ ») rien ne s\'ouvre', '12@');
  await setDoc('<pre><code>x </code></pre>');
  const codePoint = await pointOf('x');
  await page.mouse.click(codePoint.x + 20, codePoint.y);
  await page.keyboard.press('End');
  await page.keyboard.type('@mar');
  await page.waitForTimeout(200);
  state = await boxState();
  check(`${T} : dans un bloc de code, « @mar » reste du texte et aucune liste ne s'ouvre`, !state.open && (await plain()).includes('@mar'), { state, text: await plain() });

  // Un « # » plus haut dans le paragraphe ne gêne pas.
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('Voir #zz puis @mar');
  await page.waitForTimeout(250);
  state = await boxState();
  check(`${T} : un « # » tapé plus tôt dans le paragraphe n'empêche pas la liste des fiches`, state.open && names(state) === PEOPLE_NAMED, state);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check(`${T} : Entrée pose la fiche (la liste des variables, silencieuse, ne prend pas la touche)`, (await chips()).length === 1 && (await plain()) === 'Voir #zz puis Marc Armand', { text: await plain(), chips: await chips() });

  // === Les touches dans une liste à puces, un tableau et une grille ===============================================================================================
  await setDoc('<ul><li><p>un</p></li><li><p>deux</p></li></ul>');
  await focusEnd();
  await page.keyboard.type(' @marm');
  await page.waitForTimeout(200);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  const listHtml = await html();
  check(`${T} : dans une liste à puces, Tab pose la fiche sans descendre l'élément d'un cran`, (await plain()) === 'undeux Marmande' && !/<ul>.*<ul>/.test(listHtml.replace(/\n/g, '')), listHtml);

  await setDoc('<table><tbody><tr><td><p>un</p></td><td><p>deux</p></td></tr><tr><td><p>trois</p></td><td><p>quatre</p></td></tr></tbody></table>');
  const unPoint = await pointOf('un', 1);
  await page.mouse.click(unPoint.x, unPoint.y);
  await page.keyboard.press('End');
  await page.keyboard.type(' @mar');
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(80);
  state = await boxState();
  let cell = await cellAt();
  check(`${T} : dans une case de tableau, la flèche bas descend dans la liste ouverte, pas dans la case du dessous`, state.open && selectedName(state) === 'Marie Martin' && cell && cell.row === 1 && cell.col === 1, { state, cell });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  cell = await cellAt();
  check(`${T} : Tab pose la fiche dans la même case, pas dans la case suivante`, cell && cell.row === 1 && cell.col === 1 && cell.text === 'un Marie Martin' && (await chips()).length === 1, { cell, chips: await chips() });

  await page.evaluate(() => { GridEditor.setActive(false); });
  await setDoc(gridHtml([110, 110, 110], [28, 28, 28], (r, c) => `${r}${c}`));
  await page.evaluate(() => { GridEditor.setActive(true); });
  await page.waitForTimeout(500);
  const gp = await page.evaluate(() => {
    const colEl = document.querySelectorAll('.tiptap table > colgroup > col')[1];
    const rowEl = document.querySelectorAll('.tiptap table > tbody > tr')[1];
    const a = colEl.getBoundingClientRect(), b = rowEl.getBoundingClientRect();
    return { x: a.left + a.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.move(gp.x, gp.y, { steps: 2 });
  await page.mouse.click(gp.x, gp.y);
  await page.waitForTimeout(120);
  await page.keyboard.press('End');
  await page.keyboard.type(' @mar');
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(80);
  state = await boxState();
  cell = await cellAt();
  check(`${T} : dans une case de grille, la flèche bas descend dans la liste ouverte, pas dans la case du dessous`, state.open && selectedName(state) === 'Marie Martin' && cell && cell.row === 2 && cell.col === 2, { state, cell });
  await snap(`${T}-3-grille`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  cell = await cellAt();
  check(`${T} : Entrée pose la fiche dans la case (elle ne descend pas d'une ligne)`, cell && cell.row === 2 && cell.col === 2 && /Marie Martin/.test(cell.text) && (await chips()).length === 1, { cell, chips: await chips() });
  await page.evaluate(() => { GridEditor.setActive(false); });

  // === Le bas de l'écran : la liste passe au-dessus ======================================================================================================================
  await setDoc(Array.from({ length: 40 }, (_, i) => `<p>Ligne ${i + 1}</p>`).join(''));
  await focusEnd();
  await page.keyboard.type(' @');
  await page.waitForTimeout(250);
  state = await boxState();
  check(`${T} : le curseur en bas du panneau, la liste passe au-dessus de lui et reste dans le panneau, au premier plan`, state.open && state.above && state.inPanel && state.onTop && state.clearOfCaret, state);
  await snap(`${T}-4-liste-au-dessus`);
  await page.keyboard.press('Escape');

  // === La pastille ====================================================================================================================================================
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('Pour @marie');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await page.keyboard.type(' et Jean');
  const look = await page.evaluate(() => {
    const chip = document.querySelector('.tiptap .mention-chip');
    if (!chip) return null;
    const cs = getComputedStyle(chip);
    const r = chip.getBoundingClientRect();
    const p = chip.closest('p').getBoundingClientRect();
    return { text: chip.textContent, at: getComputedStyle(chip, '::before').content, display: cs.display, h: Math.round(r.height), inLine: r.top >= p.top - 1 && r.bottom <= p.bottom + 1, title: chip.title, editable: chip.getAttribute('contenteditable') };
  });
  check(`${T} : la pastille s'écrit « @ » + le nom (le « @ » est dessiné, pas du texte), tient dans la ligne, avec la table de la fiche en info-bulle`, !!look && look.text === 'Marie Martin' && look.at === '"@"' && look.display === 'inline-block' && look.h >= 14 && look.h <= 30 && look.inLine && look.title === 'Fiche de la table « MnPersonnes »' && look.editable === 'false', look);
  await snap(`${T}-5-pastille`);
  const chipPoint = await page.evaluate(() => { const r = document.querySelector('.tiptap .mention-chip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(chipPoint.x, chipPoint.y);
  await page.waitForTimeout(120);
  check(`${T} : un clic sur la pastille la sélectionne en entier`, await page.evaluate(() => document.querySelector('.tiptap .mention-chip').classList.contains('ProseMirror-selectednode')));
  await snap(`${T}-6-pastille-selectionnee`);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(120);
  check(`${T} : Retour arrière efface la pastille d'un seul geste`, (await chips()).length === 0 && (await plain()) === 'Pour  et Jean', { text: await plain(), chips: await chips() });
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('Pour @marie');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(120);
  check(`${T} : Retour arrière juste derrière la pastille l'efface d'un seul geste aussi, le texte d'avant reste`, (await chips()).length === 0 && (await plain()) === 'Pour ', { text: await plain(), chips: await chips() });

  // === Le suivi des modifications ==================================================================================================================================
  await setDoc('<p>Début</p>');
  await page.click('#v2-btn-track-changes');
  await page.waitForTimeout(250);
  await focusEnd();
  await page.keyboard.type(' @marie');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const tracked = await html();
  check(`${T} : suivi des modifications actif, la fiche posée est une seule insertion et « @marie » ne laisse rien derrière`, (await chips()).length === 1 && !/@marie|<del/.test(tracked) && (tracked.match(/<ins\b/g) || []).length >= 1 && /<ins[^>]*>[^<]*<span class="mention-chip"/.test(tracked), tracked);
  await page.click('#v2-btn-track-changes');
  await page.waitForTimeout(250);

  // === La Lecture ===================================================================================================================================================
  await setDoc('<p>Rédigé par</p>');
  await focusEnd();
  await page.keyboard.type(' @marie');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await page.keyboard.type(' le ');
  await page.click('#btn-mode-read');
  await page.waitForTimeout(700);
  const reader = await page.evaluate(() => {
    const box = document.getElementById('reader-container');
    return { text: box.textContent.replace(/\s+/g, ' ').trim(), chips: box.querySelectorAll('.mention-chip').length, resolved: Array.from(box.querySelectorAll('.resolved-var')).map(e => [e.textContent, e.classList.contains('error-msg')]) };
  });
  check(`${T} : en Lecture, la pastille devient le nom de la fiche, sans « @ » ni rouge`, reader.text.includes('Rédigé par Marie Martin') && reader.chips === 0 && JSON.stringify(reader.resolved) === JSON.stringify([['Marie Martin', false]]), reader);
  await snap(`${T}-7-lecture`);
  await page.click('#btn-mode-edit');
  await page.waitForTimeout(500);
  check(`${T} : de retour en édition, la pastille est là`, (await chips()).length === 1, await chips());

  // Une fiche renommée dans Grist : la Lecture écrit le nom d'aujourd'hui.
  await page.evaluate(() => {
    const s = window.__gristStub;
    s.setRows('MnPersonnes', [
      { id: 1, Email: '', NomComplet: 'Jean Dupont', Poste: '' }, { id: 2, Email: '', NomComplet: 'Marie Martin-Lefèvre', Poste: '' },
      { id: 3, Email: '', NomComplet: 'Marc Armand', Poste: '' }, { id: 4, Email: '', NomComplet: 'Zoé Durand', Poste: '' },
    ]);
    Mention.reset();
  });
  await page.click('#btn-mode-read');
  await page.waitForTimeout(700);
  const renamed = await page.evaluate(() => document.getElementById('reader-container').textContent.replace(/\s+/g, ' ').trim());
  check(`${T} : la fiche renommée dans Grist est renommée dans la Lecture`, renamed.includes('Rédigé par Marie Martin-Lefèvre'), renamed);
  await page.click('#btn-mode-edit');
  await page.waitForTimeout(500);
  await seed();

  // === La touche cédée à « # » =======================================================================================================================================
  await page.evaluate(() => { localStorage.setItem('pp_trigger_char', '@'); });
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('@');
  await page.waitForTimeout(250);
  state = await boxState();
  check(`${T} : quand Réglages donne « @ » au panneau des variables, la liste des fiches s'efface devant lui`, !state.open && (await plain()) === '@', { state, text: await plain() });
  await page.keyboard.press('Escape');
  await page.evaluate(() => { localStorage.removeItem('pp_trigger_char'); });
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('@');
  await page.waitForTimeout(250);
  check(`${T} : le réglage rétabli, « @ » ouvre de nouveau la liste des fiches`, (await boxState()).open, await boxState());
  await page.keyboard.press('Escape');

  // === Un nom très long ====================================================================================================================================================
  const LONG = 'Dossier avec un intitulé vraiment très très long qui dépasse largement la largeur de la liste affichée dans un panneau de sept cents pixels de large Zzz';
  await seed({ files: [{ id: 3, Titre: LONG, Responsable: 1, gristHelper_Display: 'Jean Dupont' }] });
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('@vraiment');
  await page.waitForTimeout(250);
  const longState = await page.evaluate(() => {
    const box = document.getElementById('mention-box');
    if (!box || box.style.display === 'none') return { open: false };
    const b = box.getBoundingClientRect();
    const row = box.querySelector('.ex-item');
    const name = row.querySelector('.mention-name');
    const hint = row.querySelector('.mention-table');
    const h = hint && hint.getBoundingClientRect();
    return { open: true, rows: box.querySelectorAll('.ex-item').length, inPanel: b.left >= -0.5 && b.right <= innerWidth + 0.5, noSideScroll: box.scrollWidth <= box.clientWidth + 1, cut: name.scrollWidth > name.clientWidth, hintVisible: !!h && h.width > 20 && h.right <= b.right + 0.5 && h.left >= b.left - 0.5, ellipsis: getComputedStyle(name).textOverflow };
  });
  check(`${T} : un nom plus long que la liste est coupé par une ellipse, la table reste lisible à sa droite, rien ne déborde du panneau`, longState.open && longState.rows === 1 && longState.inPanel && longState.noSideScroll && longState.cut && longState.hintVisible && longState.ellipsis === 'ellipsis', longState);
  await snap(`${T}-8-nom-long`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check(`${T} : le nom long est posé en entier dans la pastille`, JSON.stringify(await chips()) === JSON.stringify([['MnDossiers', '3', 'Titre', LONG]]), await chips());

  // === Plus de 50 fiches ======================================================================================================================================================
  await seed({ many: 60 });
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('@fiche');
  await page.waitForTimeout(300);
  let g = await beyondFifty();
  const more10 = 'Encore 10 résultats : précisez la recherche.';
  check(`${T} : « @fiche » (60 fiches) montre 50 lignes et « ${more10} » au bas de la liste, dans le panneau`, g.open && g.items === 50 && g.more === more10 && g.moreVisible && g.inPanel && g.last === 'ex-more', g);
  await snap(`${T}-9-plus-de-50`);
  let lost = null;
  for (let i = 1; i <= 30 && !lost; i++) {
    await page.keyboard.press('ArrowDown');
    const step = await beyondFifty();
    if (step.selectedIndex !== i || !step.selectedClear || !step.moreVisible) lost = { down: i, step };
  }
  check(`${T} : trente fois flèche bas, la ligne choisie reste visible dans la liste, jamais sous la ligne « Encore »`, lost === null, lost);
  for (let i = 0; i < 31; i++) await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(120);
  g = await beyondFifty();
  check(`${T} : la flèche haut de la première ligne choisit la cinquantième (la liste boucle), que la ligne « Encore » ne recouvre pas`, g.selectedIndex === 49 && g.selectedClear && g.moreVisible, g);
  await page.keyboard.press('Escape');
  await unseed();
}

// Une grille aux dimensions connues : `widths` (px, par colonne), `heights` (px, par ligne), `text(r, c)` le texte de chaque case.
function gridHtml(widths, heights, text) {
  return `<table style="width: ${widths.reduce((s, w) => s + w, 0)}px;"><colgroup>${widths.map(w => `<col style="width: ${w}px;">`).join('')}</colgroup><tbody>`
    + heights.map((h, r) => `<tr data-row-height="${h}" style="height: ${h}px">${widths.map((w, c) => `<td colwidth="${w}"><p>${text(r + 1, c + 1)}</p></td>`).join('')}</tr>`).join('') + '</tbody></table>';
}

// Aucun clignotement : pendant la frappe d'une recherche déjà lue, la liste n'est jamais cachée un instant (chaque image affichée la montre).
async function noFlickerPart(T) {
  await seed();
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('@');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__mentionFrames = [];
    window.__mentionSampling = true;
    const sample = () => {
      const box = document.getElementById('mention-box');
      window.__mentionFrames.push(!!box && getComputedStyle(box).display !== 'none' && box.querySelectorAll('.ex-item, .ex-status').length > 0);
      if (window.__mentionSampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.keyboard.type('marie', { delay: 70 });
  await page.waitForTimeout(250);
  const frames = await page.evaluate(() => { window.__mentionSampling = false; return window.__mentionFrames; });
  check(`${T} : en tapant « @marie », la liste reste affichée à chaque image (aucun clignotement entre deux lettres)`, frames.length > 10 && frames.every(Boolean), { frames: frames.length, hidden: frames.filter(f => !f).length });
  await page.keyboard.press('Escape');
  await unseed();
}

async function runEnglish() {
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  await seed();
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('@marm');
  await page.waitForTimeout(250);
  let state = await boxState();
  check('anglais : la liste marche comme en français', state.open && names(state) === 'Marmande' && state.items[0].table === 'MnLieux', state);
  check('anglais : la liste s\'appelle « Records to mention » pour un lecteur d\'écran', (await page.evaluate(() => document.getElementById('mention-box').getAttribute('aria-label'))) === 'Records to mention');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check('anglais : Entrée pose la fiche', JSON.stringify(await chips()) === JSON.stringify([['MnLieux', '2', 'Ville', 'Marmande']]), await chips());
  check('anglais : l\'info-bulle de la pastille est « Record from table “MnLieux” »', (await page.evaluate(() => document.querySelector('.tiptap .mention-chip').title)) === 'Record from table “MnLieux”');
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('Voir @zzz');
  await page.waitForTimeout(250);
  state = await boxState();
  check('anglais : « No record matches. » quand rien ne répond', state.open && state.status === 'No record matches.', state);
  await page.keyboard.press('Escape');
  await seed({ many: 60 });
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('@fiche');
  await page.waitForTimeout(300);
  const g = await beyondFifty();
  check('anglais : « @fiche » (60 fiches) dit « 10 more results: refine your search. » au bas de la liste', g.open && g.items === 50 && g.more === '10 more results: refine your search.' && g.moreVisible && g.inPanel, g);
  await page.keyboard.press('Escape');
  await seed({ empty: true });
  await setDoc('<p></p>');
  await focusEnd();
  await page.keyboard.type('@');
  await page.waitForTimeout(250);
  state = await boxState();
  check('anglais : sans aucune fiche dans le document, la liste le dit', state.open && state.status === 'Nothing to mention: the document’s tables are empty.', state);
  await page.keyboard.press('Escape');
  await unseed();
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(250);
}

await run('clair');
await noFlickerPart('clair');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(250);
await run('sombre');
await page.evaluate(() => Settings.setTheme('light'));
await page.waitForTimeout(250);
await runEnglish();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
