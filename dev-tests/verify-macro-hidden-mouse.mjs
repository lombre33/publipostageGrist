#!/usr/bin/env node
// Demande d'Antoine du 2026-10-04 : « dans l'interface d'édition du macro-modèle, une icône œil permettant de masquer l'un des modèles : ça permet de ne pas faire apparaître l'un des modèles qui
// s'applique en Lecture et aux exports ». Le résumé du macro-modèle (js/macro-editor.js:renderParts) met un œil après le stylo de chaque modèle ; un clic le masque de la Lecture et de toutes les sorties
// (js/macro-templates.js:pickModeleId), le grise sans le retirer (l'œil est barré et enfoncé) et écrit la composition dans sa ligne. Les cas de dev-tests/scenarios-macro-modeles.js tournent DANS la page
// (sorties, ligne Grist, fenêtre de composition, rafale, échec, langue) ; ici, à la taille du panneau Grist d'Antoine (~700x400), la vraie souris et le vrai clavier :
//   1) le résumé : un œil après chaque stylo (nom accessible, info-bulle, au moins 24 px, au premier plan, dans sa ligne), « Modifier la composition » toujours là, rien d'écrit à l'ouverture ;
//   2) un vrai clic sur l'œil : il se ferme (barré, enfoncé), le nom se grise et reste lisible (4,5:1), le coin d'état le dit en entier, la ligne Grist porte le masquage, la page ne bouge pas ;
//   3) la Lecture, au vrai bouton : le modèle masqué n'y est plus, ni rien à sa place (ni la règle suivante, ni le modèle par défaut) ; un second clic le remet ;
//   4) clavier : Tab visite le stylo puis l'œil de chaque modèle, Espace et Entrée basculent l'œil sans lui retirer le focus, anneau de focus visible (2 px, 3:1) ;
//   5) le macro-modèle quitté puis rouvert par la liste retrouve ses yeux fermés ; un modèle supprimé a un œil grisé qui ne fait rien ; un nom de modèle très long garde ses deux boutons entiers ;
//   6) clair, sombre (contrastes de la charte, F5) et anglais (nom accessible, info-bulle, coin d'état, réécriture en direct au changement de langue, focus gardé).
// Lancé par run-headless.mjs (groupe Node "macroHiddenMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-macro-hidden-mouse.mjs
// MACRO_HIDDEN_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.MACRO_HIDDEN_MOUSE_PORT || 8963);
const SHOTS = process.env.MACRO_HIDDEN_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-macro-images-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-macro-hidden-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const nativeDialogs = [];
page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });
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

const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };

// Contrastes (WCAG) : même calcul que dev-tests/verify-caption-mouse.mjs.
const rgbOf = css => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || ''); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
const lum = ([r, g, b]) => { const f = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const ratio = (fg, bg) => { const a = rgbOf(fg), b = rgbOf(bg); return a && b ? +contrast(a, b).toFixed(2) : 0; };

// Un élément : où il est, est-il au premier plan (le point central lui appartient, rien ne le recouvre ni ne le coupe).
const rectOf = sel => page.evaluate(s => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, onTop: !!hit && (hit === e || e.contains(hit)) };
}, sel);
const hover = async sel => {
  const c = await rectOf(sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 14, c.y - 6, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 4 });
  await sleep(120);
  return c;
};
const realClick = async (sel, wait = 500) => { const c = await hover(sel); await page.mouse.click(c.x, c.y); await sleep(wait); return c; };
const away = async () => { await page.mouse.move(350, 340, { steps: 6 }); await sleep(250); };

// Le modèle courant est celui qu'on attend ; la pause laisse le temps à l'interface de se redessiner.
async function waitCurrent(id) {
  await page.waitForFunction(i => String(Templates.getCurrentId()) === String(i), id, { timeout: 8000 }).catch(() => {});
  await sleep(600);
}

// Un modèle de plus : ligne enregistrée dans le faux Grist + option du vrai <select> (l'arbre des modèles se construit d'après les deux).
async function makeTemplate(name, html, type) {
  return page.evaluate(async ({ name, html, type }) => {
    const r = await Templates.save(null, name, html, '', null, null, type || 'document', null);
    await Templates.loadAll();
    const select = document.getElementById('template-select');
    const option = document.createElement('option'); option.value = String(r.id); option.textContent = name; select.appendChild(option);
    return r.id;
  }, { name, html, type });
}
// La liste des modèles à la vraie souris : ouvrir l'arbre, cliquer la ligne.
async function pickTemplate(name, id) {
  const open = await page.evaluate(() => { const p = document.querySelector('.tts-popup'); return !!p && getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().height > 0; });
  if (!open) await realClick('.tts-trigger', 300);
  const pos = await page.evaluate(n => {
    const row = Array.from(document.querySelectorAll('.tts-popup .tts-row-leaf')).find(e => e.querySelector('.tts-row-label').textContent.replace(' ★', '').trim() === n);
    if (!row) return null;
    row.scrollIntoView({ block: 'nearest' });
    const b = row.getBoundingClientRect();
    return { x: b.left + 60, y: b.top + b.height / 2 };
  }, name);
  if (!pos) return false;
  await page.mouse.move(pos.x - 20, pos.y, { steps: 3 }); await page.mouse.move(pos.x, pos.y, { steps: 3 });
  await page.mouse.click(pos.x, pos.y);
  await waitCurrent(id);
  return true;
}

// Ouvre un menu au survol (Enregistrer) puis descend tout droit sous le bouton avant d'aller à la ligne : le menu reste ouvert tout du long (dev-tests/verify-leave-unsaved-mouse.mjs).
async function clickMenuRow(buttonSel, rowSel, wait = 400) {
  const from = await hover(buttonSel);
  const to = await rectOf(rowSel);
  await page.mouse.move(from.x, to.y, { steps: 12 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await sleep(150);
  await page.mouse.click(to.x, to.y);
  await sleep(wait);
  await away();
}
async function setAutosave(on) {
  const now = await page.evaluate(() => document.getElementById('v2-btn-autosave').getAttribute('aria-checked') === 'true');
  if (now !== on) await clickMenuRow('#btn-save', '#v2-btn-autosave', 300);
  return page.evaluate(() => document.getElementById('v2-btn-autosave').getAttribute('aria-checked') === 'true');
}
const stored = id => page.evaluate(i => { const m = window.__gristStub.state.rows.Publipostage_Modeles; return String(m.Contenu[m.id.indexOf(i)]); }, id);

const paintOf = (sel, bgSel) => page.evaluate(([s, b]) => {
  const e = document.querySelector(s), bg = document.querySelector(b || s), cs = getComputedStyle(e);
  return { color: cs.color, bg: getComputedStyle(bg).backgroundColor, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, borderColor: cs.borderTopColor, opacity: cs.opacity };
}, [sel, bgSel || null]);


const EYE = (slot, id) => `#macro-summary-parts .macro-summary-eye[data-slot="${slot}"][data-template-id="${id}"]`;
const PENCIL = id => `#macro-summary-parts .macro-summary-edit[data-template-id="${id}"]`;
const hiddenOf = id => page.evaluate(i => {
  const m = window.__gristStub.state.rows.Publipostage_Modeles;
  return JSON.parse(m.Contenu[m.id.indexOf(i)]).slots.map(s => (s.hiddenModeleIds || []).map(String));
}, id);
const writesNow = () => page.evaluate(() => window.__gristStub.countActions('UpdateRecord', 'Publipostage_Modeles') + window.__gristStub.countActions('AddRecord', 'Publipostage_Modeles'));
const readingText = () => page.evaluate(() => document.getElementById('reader-container').textContent || '');

// Le résumé : une ligne par page de garde ou annexe, avec ses modèles, leur stylo et leur œil.
const eyesOf = () => page.evaluate(() => {
  const hit = el => { const b = el.getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!top && (top === el || el.contains(top)); };
  const box = document.getElementById('macro-summary-container');
  const c = box.getBoundingClientRect();
  return {
    container: { l: c.left, t: c.top, r: c.right, b: c.bottom }, shown: getComputedStyle(box).display !== 'none' && c.height > 0,
    editButton: (() => { const e = document.getElementById('btn-edit-macro'); const b = e.getBoundingClientRect(); return { onTop: hit(e), t: b.top, b: b.bottom }; })(),
    rows: Array.from(document.querySelectorAll('#macro-summary-parts .macro-summary-part')).map(li => {
      const rb = li.getBoundingClientRect();
      return {
        label: li.querySelector('.macro-summary-part-label').textContent, row: { l: rb.left, r: rb.right, t: rb.top, b: rb.bottom },
        models: Array.from(li.querySelectorAll('.macro-summary-model')).map(m => {
          const eye = m.querySelector('.macro-summary-eye'), pencil = m.querySelector('.macro-summary-edit'), name = m.querySelector('.macro-summary-model-name');
          const b = eye.getBoundingClientRect(), pb = pencil.getBoundingClientRect();
          return {
            name: name.textContent, id: eye.dataset.templateId, slot: eye.dataset.slot, pressed: eye.getAttribute('aria-pressed'), label: eye.getAttribute('aria-label'), title: eye.title,
            disabled: eye.disabled, opacity: getComputedStyle(eye).opacity, crossed: eye.innerHTML.includes('M4 4l16 16'), greyed: m.classList.contains('is-hidden-model'),
            w: b.width, h: b.height, l: b.left, r: b.right, t: b.top, b: b.bottom, onTop: hit(eye), rightOfPencil: b.left >= pb.right - 0.5 && Math.abs((b.top + b.bottom) / 2 - (pb.top + pb.bottom) / 2) < 1,
            pencilOnTop: hit(pencil), nameClipped: name.scrollWidth > name.clientWidth + 1, nameBox: (() => { const n = name.getBoundingClientRect(); return { l: n.left, r: n.right }; })(),
          };
        }),
      };
    }),
  };
});
const screenOf = () => page.evaluate(() => {
  const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  const bar = document.getElementById('macro-return-bar'), a = document.activeElement, st = document.getElementById('status-msg'), sb = st.getBoundingClientRect();
  return {
    current: String(Templates.getCurrentId()), summary: shown(document.getElementById('macro-summary-container')), editor: shown(document.getElementById('editor-container')), bar: !bar.hidden && shown(bar),
    status: st.textContent, statusError: st.className === 'error-msg', statusClipped: st.scrollWidth > st.clientWidth + 1, statusInView: sb.width > 0 && sb.left >= 0 && sb.right <= innerWidth + 0.5 && sb.bottom <= innerHeight + 0.5,
    // Le début du message (avant le nom du modèle, entre guillemets) tient dans la place que le coin d'état a : un nom très long est coupé par « … » à la fin, jamais le verbe.
    statusPrefixVisible: (() => { const node = st.firstChild; if (!node || node.nodeType !== 3) return null; const at = node.textContent.search(/[«“]/); if (at < 0) return null; const r = document.createRange(); r.setStart(node, 0); r.setEnd(node, at); return r.getBoundingClientRect().right <= sb.right + 0.5; })(),
    focus: !a ? null : (a.classList && a.classList.contains('macro-summary-eye') ? 'oeil:' + a.dataset.slot + ':' + a.dataset.templateId : (a.classList && a.classList.contains('macro-summary-edit') ? 'stylo:' + a.dataset.templateId : (a.id || a.className || a.tagName))),
  };
});
const flat = s => s.rows.flatMap(r => r.models);

// === Modèles de la démonstration ===
// La ligne courante : Nom = « a », donc l'annexe 1 du macro-modèle donne « Annexe CDI » dans la Lecture.
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('Clients', { Nom: 'Text' });
  stub.setRows('Clients', [{ id: 1, Nom: 'a' }]);
  await GristAPI.refreshSchema();
  stub.fireRecord({ id: 1, Nom: 'a' }, 'Clients');
});
const idCover = await makeTemplate('Contrat client', '<p>Page de garde du contrat</p>');
const idCdi = await makeTemplate('Annexe CDI', '<p>Texte de l’annexe CDI</p>');
const idCdd = await makeTemplate('Annexe CDD', '<p>Texte de l’annexe CDD</p>');
const idMentions = await makeTemplate('Mentions légales', '<p>Mentions légales du dossier</p>');
const LONG_MODEL = 'Annexe très longue : conditions générales de vente et de livraison de toutes les filiales du groupe, version complète';
const idLongModel = await makeTemplate(LONG_MODEL, '<p>Texte de l’annexe très longue</p>');
const rule = (value, modeleId) => ({ column: 'Nom', operator: '=', value, modeleId });
const MACRO = 'Dossier salarié';
const idMacro = await makeTemplate(MACRO, JSON.stringify({ slots: [
  { type: 'fixed', modeleId: idCover },
  { type: 'conditional', rules: [rule('a', idCdi), rule('b', idCdd)], defaultModeleId: idMentions },
  { type: 'conditional', rules: [rule('c', idMentions)], defaultModeleId: null },
] }), 'macro');
const idLong = await makeTemplate('Dossier au long nom', JSON.stringify({ slots: [
  { type: 'fixed', modeleId: idCover },
  { type: 'conditional', rules: [rule('a', idLongModel)], defaultModeleId: idLongModel },
] }), 'macro');
const GONE = 987654;
const idGone = await makeTemplate('Dossier à trou', JSON.stringify({ slots: [
  { type: 'fixed', modeleId: idCover },
  { type: 'conditional', rules: [rule('a', GONE)], defaultModeleId: idMentions },
] }), 'macro');

// Rien n'écrit tout seul pendant les parcours (le minuteur de l'enregistrement automatique relit la liste) : coupé par le vrai menu. L'œil écrit, lui, sa composition.
const autoOff = await setAutosave(false);
check('enregistrement automatique coupé par le vrai menu', autoOff === false);

async function run(theme) {
  const T = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Œil d'un modèle du macro-modèle, ${WIDTH}x${HEIGHT}, thème ${T} ===`);
  await away();

  // 1) Le résumé : un œil après chaque stylo, rien d'écrit à l'ouverture.
  const w0 = await writesNow();
  check(`${T} - le macro-modèle s'ouvre par la liste`, await pickTemplate(MACRO, idMacro));
  const s0 = await screenOf(), e0 = await eyesOf();
  await shot(`${theme}-1-resume`);
  check(`${T} - le résumé est à l'écran, « Modifier la composition » au premier plan`, s0.summary && !s0.editor && e0.editButton.onTop, { s0, edit: e0.editButton });
  const m0 = flat(e0);
  check(`${T} - un œil par modèle (cinq), ouvert, après son stylo, sur la même ligne`, m0.length === 5 && m0.every(m => m.pressed === 'false' && !m.crossed && !m.greyed && !m.disabled && m.rightOfPencil), m0);
  check(`${T} - chaque œil a son nom accessible « Masquer le modèle « … » » et son info-bulle « Masquer « … » de la Lecture et des exports »`,
    m0.every(m => m.label === `Masquer le modèle « ${m.name} »` && m.title === `Masquer « ${m.name} » de la Lecture et des exports`), m0.map(m => [m.label, m.title]));
  check(`${T} - chaque œil et chaque stylo mesurent 24 px au moins et sont au premier plan, dans leur ligne et dans le panneau`,
    m0.every(m => m.w >= 24 && m.h >= 24 && m.onTop && m.pencilOnTop) && e0.rows.every(r => r.models.every(m => m.r <= r.row.r + 0.5 && m.r <= e0.container.r + 0.5)), m0.map(m => [m.w, m.h, m.onTop, m.pencilOnTop, m.r]));
  check(`${T} - ouvrir le résumé n'écrit rien dans Grist`, await writesNow() === w0, { w0, now: await writesNow() });

  // Contrastes : l'œil ouvert se lit sur sa ligne (4,5:1), comme le stylo.
  const rowBg = (await paintOf('#macro-summary-parts .macro-summary-part')).bg;
  const eyePaint = await paintOf(EYE(0, idCover));
  const pencilPaint = await paintOf(PENCIL(idCover));
  check(`${T} - l'œil ouvert se lit sur sa ligne (4,5:1 au moins), du même gris que le stylo`, ratio(eyePaint.color, rowBg) >= 4.5 && eyePaint.color === pencilPaint.color, { eye: ratio(eyePaint.color, rowBg), color: eyePaint.color, pencil: pencilPaint.color });
  // Survol : l'œil se distingue (fond, bordure), au vrai pointeur.
  const before = await paintOf(EYE(1, idCdd));
  await hover(EYE(1, idCdd));
  const hovered = await paintOf(EYE(1, idCdd));
  check(`${T} - au survol l'œil change de fond et de bordure`, hovered.bg !== before.bg && hovered.borderColor !== before.borderColor, { before: before.bg, hovered: hovered.bg });
  await away();

  // 2) Un vrai clic sur l'œil d'« Annexe CDI » : il se ferme, le nom se grise, le coin d'état le dit, la ligne Grist porte le masquage.
  const nameBefore = await paintOf('#macro-summary-parts .macro-summary-model-name', '#macro-summary-parts .macro-summary-part');
  await realClick(EYE(1, idCdi), 900);
  await away();
  const s1 = await screenOf(), e1 = await eyesOf(), cdi = flat(e1).find(m => m.id === String(idCdi) && m.slot === '1');
  await shot(`${theme}-2-masque`);
  check(`${T} - un clic sur l'œil d'« Annexe CDI » le ferme : barré, enfoncé, nom grisé, info-bulle « … est masqué … : cliquer pour l'afficher »`,
    cdi.pressed === 'true' && cdi.crossed && cdi.greyed && cdi.title === '« Annexe CDI » est masqué de la Lecture et des exports : cliquer pour l’afficher' && cdi.label === 'Masquer le modèle « Annexe CDI »', cdi);
  check(`${T} - les autres yeux restent ouverts, et « Annexe CDI » reste dans le résumé avec son stylo (rien ne disparaît)`,
    flat(e1).filter(m => !(m.id === String(idCdi) && m.slot === '1')).every(m => m.pressed === 'false') && flat(e1).length === 5 && e1.rows.length === 3, flat(e1).map(m => [m.name, m.pressed]));
  check(`${T} - la page ne bouge pas : même macro-modèle, résumé à l'écran, pas de bandeau`, s1.current === String(idMacro) && s1.summary && !s1.editor && !s1.bar, s1);
  check(`${T} - le coin d'état dit « Modèle masqué de la Lecture et des exports : « Annexe CDI » », entier, dans le panneau, sans erreur`,
    s1.status === 'Modèle masqué de la Lecture et des exports : « Annexe CDI »' && !s1.statusError && !s1.statusClipped && s1.statusInView, s1);
  check(`${T} - la ligne Grist porte le masquage dans l'annexe 1, rien ailleurs`, JSON.stringify(await hiddenOf(idMacro)) === JSON.stringify([[], [String(idCdi)], []]), await hiddenOf(idMacro));
  const hiddenName = await paintOf('#macro-summary-parts .macro-summary-model.is-hidden-model .macro-summary-model-name', '#macro-summary-parts .macro-summary-part');
  check(`${T} - le nom grisé change de teinte mais reste lisible (4,5:1 au moins)`, hiddenName.color !== nameBefore.color && ratio(hiddenName.color, hiddenName.bg) >= 4.5, { before: nameBefore.color, hidden: hiddenName.color, ratio: ratio(hiddenName.color, hiddenName.bg) });
  const pressedPaint = await paintOf(EYE(1, idCdi));
  check(`${T} - l'œil fermé est enfoncé (fond et bordure des boutons actifs) et se lit sur son propre fond (4,5:1 au moins)`,
    pressedPaint.bg !== eyePaint.bg && pressedPaint.borderColor !== eyePaint.borderColor && ratio(pressedPaint.color, pressedPaint.bg) >= 4.5, { pressed: pressedPaint, ratio: ratio(pressedPaint.color, pressedPaint.bg) });

  // 3) La Lecture, au vrai bouton : « Annexe CDI » n'y est plus, ni rien à sa place (ni la règle suivante, ni le modèle par défaut).
  await realClick('#btn-mode-read', 1500);
  const reading1 = await readingText();
  await shot(`${theme}-3-lecture`);
  check(`${T} - la Lecture montre la page de garde mais plus « Annexe CDI », ni « Annexe CDD » ni les mentions légales à sa place`,
    reading1.includes('Page de garde du contrat') && !reading1.includes('Texte de l’annexe CDI') && !reading1.includes('Texte de l’annexe CDD') && !reading1.includes('Mentions légales du dossier'), reading1.slice(0, 200));
  await realClick('#btn-mode-edit', 800);
  check(`${T} - de retour en Édition, le résumé garde l'œil fermé`, flat(await eyesOf()).find(m => m.id === String(idCdi) && m.slot === '1').pressed === 'true');
  // Un second clic le remet : la ligne retrouve sa composition d'avant, la Lecture l'annexe.
  await realClick(EYE(1, idCdi), 900);
  await away();
  const s2 = await screenOf(), cdi2 = flat(await eyesOf()).find(m => m.id === String(idCdi) && m.slot === '1');
  check(`${T} - un second clic rouvre l'œil, rend le nom, et le coin d'état dit « Modèle de nouveau dans la Lecture et les exports : « … » »`,
    cdi2.pressed === 'false' && !cdi2.crossed && !cdi2.greyed && s2.status === 'Modèle de nouveau dans la Lecture et les exports : « Annexe CDI »' && !s2.statusClipped, { cdi2, status: s2.status });
  check(`${T} - la ligne Grist n'a plus aucun masquage`, JSON.stringify(await hiddenOf(idMacro)) === JSON.stringify([[], [], []]), await hiddenOf(idMacro));
  await realClick('#btn-mode-read', 1500);
  const reading2 = await readingText();
  check(`${T} - la Lecture montre de nouveau « Annexe CDI »`, reading2.includes('Page de garde du contrat') && reading2.includes('Texte de l’annexe CDI'), reading2.slice(0, 200));
  await realClick('#btn-mode-edit', 800);
  await away();

  // 4) Clavier : Tab visite le stylo puis l'œil de chaque modèle ; Espace et Entrée basculent l'œil, qui garde le focus.
  await page.focus('#macro-summary-parts .macro-summary-edit');
  const order = [(await screenOf()).focus];
  for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); order.push((await screenOf()).focus); }
  check(`${T} - Tab visite le stylo puis l'œil de chacun des cinq modèles, dans l'ordre de lecture, puis « Modifier la composition »`,
    JSON.stringify(order) === JSON.stringify(['stylo:' + idCover, 'oeil:0:' + idCover, 'stylo:' + idCdi, 'oeil:1:' + idCdi, 'stylo:' + idCdd, 'oeil:1:' + idCdd, 'stylo:' + idMentions, 'oeil:1:' + idMentions, 'stylo:' + idMentions, 'oeil:2:' + idMentions, 'btn-edit-macro']), order);
  await page.focus(EYE(1, idCdd));
  const ring = await paintOf(EYE(1, idCdd) + ':focus', '#macro-summary-parts .macro-summary-part');
  check(`${T} - un œil pris au clavier montre son anneau de focus (2 px, plein, 3:1 au moins sur sa ligne)`, ring.outlineStyle === 'solid' && ring.outlineWidth === '2px' && ratio(ring.outlineColor, ring.bg) >= 3, { ring, ratio: ratio(ring.outlineColor, ring.bg) });
  await page.keyboard.press('Space');
  await sleep(700);
  const k1 = await screenOf(), cdd1 = flat(await eyesOf()).find(m => m.id === String(idCdd));
  check(`${T} - Espace sur l'œil d'« Annexe CDD » le ferme et lui laisse le focus`, cdd1.pressed === 'true' && cdd1.crossed && k1.focus === 'oeil:1:' + idCdd && k1.status === 'Modèle masqué de la Lecture et des exports : « Annexe CDD »', { cdd1, k1 });
  await page.keyboard.press('Enter');
  await sleep(700);
  const k2 = await screenOf(), cdd2 = flat(await eyesOf()).find(m => m.id === String(idCdd));
  check(`${T} - Entrée sur le même œil le rouvre, toujours avec le focus`, cdd2.pressed === 'false' && !cdd2.crossed && k2.focus === 'oeil:1:' + idCdd && JSON.stringify(await hiddenOf(idMacro)) === JSON.stringify([[], [], []]), { cdd2, k2 });
  await away();

  // 5) Le même modèle dans deux positions : l'œil de la page de garde ne retire que la page de garde ; relu depuis la liste, il reste fermé.
  await realClick(EYE(0, idCover), 900);
  await away();
  check(`${T} - l'œil de « Contrat client » (page de garde) ne ferme que le sien`, flat(await eyesOf()).filter(m => m.pressed === 'true').map(m => m.slot + ':' + m.id).join() === '0:' + idCover, flat(await eyesOf()).map(m => [m.slot, m.id, m.pressed]));
  await realClick('#btn-mode-read', 1500);
  const reading3 = await readingText();
  check(`${T} - la Lecture n'a plus la page de garde, mais garde « Annexe CDI »`, !reading3.includes('Page de garde du contrat') && reading3.includes('Texte de l’annexe CDI'), reading3.slice(0, 200));
  await realClick('#btn-mode-edit', 800);
  check(`${T} - une autre liste de modèles puis le macro-modèle de nouveau : l'œil de la page de garde est resté fermé`, await pickTemplate('Annexe CDD', idCdd) && await pickTemplate(MACRO, idMacro) && flat(await eyesOf()).find(m => m.slot === '0').pressed === 'true');
  await realClick(EYE(0, idCover), 900);
  await away();
  check(`${T} - le second clic remet la page de garde (aucun œil fermé, ligne Grist sans masquage)`, flat(await eyesOf()).every(m => m.pressed === 'false') && JSON.stringify(await hiddenOf(idMacro)) === JSON.stringify([[], [], []]));
}

await run('light');
await page.evaluate(() => Settings.setTheme('dark'));
await sleep(300);
await run('dark');
await page.evaluate(() => Settings.setTheme('light'));
await sleep(300);

// 6) Cas limites : modèle supprimé, nom de modèle très long.
console.log('\n=== Cas limites : modèle supprimé, nom de modèle très long ===');
check('le macro-modèle dont un modèle a été supprimé s\'ouvre par la liste', await pickTemplate('Dossier à trou', idGone));
const g0 = await eyesOf();
const gone = flat(g0).find(m => m.id === String(GONE));
check('modèle supprimé : son œil est grisé (jamais retiré), sans état, et son nom dit « modèle introuvable »', !!gone && gone.disabled && gone.pressed === null && Number(gone.opacity) < 0.5 && gone.name === 'modèle introuvable' && g0.rows.length === 2, gone);
const writesGone = await writesNow();
const goneBox = await rectOf(`#macro-summary-parts .macro-summary-model.is-missing .macro-summary-eye`);
await page.mouse.move(goneBox.x, goneBox.y, { steps: 3 }); await page.mouse.click(goneBox.x, goneBox.y);
await sleep(700);
check('modèle supprimé : un clic sur son œil grisé ne fait rien (aucune écriture, rien de fermé)', await writesNow() === writesGone && flat(await eyesOf()).every(m => m.pressed !== 'true'), { writesGone, now: await writesNow() });
const okOne = flat(g0).find(m => m.id === String(idMentions));
await realClick(EYE(1, idMentions), 900);
await away();
check('le modèle par défaut de cette annexe se ferme comme les autres, l\'œil grisé du modèle supprimé ne bouge pas', flat(await eyesOf()).find(m => m.id === String(idMentions)).pressed === 'true' && JSON.stringify(await hiddenOf(idGone)) === JSON.stringify([[], [String(idMentions)]]), { okOne, hidden: await hiddenOf(idGone) });
await realClick(EYE(1, idMentions), 900);
await away();

check('le macro-modèle au nom de modèle très long s\'ouvre par la liste', await pickTemplate('Dossier au long nom', idLong));
const l0 = await eyesOf();
const longModels = flat(l0).filter(m => m.id === String(idLongModel));
await shot('nom-tres-long');
check('nom très long : le nom est coupé par « … » sur une ligne, le stylo et l\'œil restent entiers, au premier plan et dans le panneau',
  longModels.length === 1 && longModels.every(m => m.nameClipped && m.onTop && m.pencilOnTop && m.w >= 24 && m.r <= l0.container.r + 0.5 && m.r <= l0.rows[1].row.r + 0.5), longModels);
check('nom très long : l\'info-bulle de l\'œil dit le nom en entier', longModels.every(m => m.title === `Masquer « ${LONG_MODEL} » de la Lecture et des exports`), longModels.map(m => m.title));
await realClick(EYE(1, idLongModel), 900);
await away();
const l1 = await screenOf(), long1 = flat(await eyesOf()).find(m => m.id === String(idLongModel));
await shot('nom-tres-long-masque');
check('nom très long : l\'œil se ferme à la souris, le coin d\'état reste dans le panneau et garde son verbe (« Modèle masqué de la Lecture et des exports : … » : le nom est coupé par « … », jamais le début)', long1.pressed === 'true' && l1.statusInView && l1.statusClipped && l1.statusPrefixVisible === true && /^Modèle masqué de la Lecture et des exports : /.test(l1.status), { long1, l1 });
await realClick(EYE(1, idLongModel), 900);
await away();

// 7) Anglais : nom accessible, info-bulle, coin d'état, réécriture en direct au changement de langue.
console.log('\n=== Anglais ===');
await page.evaluate(() => I18n.setLang('en'));
await sleep(400);
check('en anglais le macro-modèle s\'ouvre par la liste', await pickTemplate(MACRO, idMacro));
const en0 = flat(await eyesOf());
check('anglais : « Hide the template “…” » et « Hide “…” from Reading and exports » sur chaque œil', en0.every(m => m.label === `Hide the template “${m.name}”` && m.title === `Hide “${m.name}” from Reading and exports`), en0.map(m => [m.label, m.title]));
await realClick(EYE(1, idCdi), 900);
await away();
const en1 = await screenOf(), enCdi = flat(await eyesOf()).find(m => m.id === String(idCdi) && m.slot === '1');
await shot('anglais');
check('anglais : l\'œil fermé dit « … is hidden from Reading and exports: click to show it », le coin d\'état « Template hidden from Reading and exports: “…” », entier',
  enCdi.pressed === 'true' && enCdi.title === '“Annexe CDI” is hidden from Reading and exports: click to show it' && en1.status === 'Template hidden from Reading and exports: “Annexe CDI”' && !en1.statusClipped && en1.statusInView, { enCdi, en1 });
await page.focus(EYE(1, idCdi));
await page.evaluate(() => I18n.setLang('fr'));
await sleep(400);
const fr1 = await screenOf(), frCdi = flat(await eyesOf()).find(m => m.id === String(idCdi) && m.slot === '1');
check('changement de langue en route : l\'œil fermé est réécrit en français, reste fermé et garde le focus', frCdi.pressed === 'true' && frCdi.label === 'Masquer le modèle « Annexe CDI »' && frCdi.title === '« Annexe CDI » est masqué de la Lecture et des exports : cliquer pour l’afficher' && fr1.focus === 'oeil:1:' + idCdi, { frCdi, focus: fr1.focus });
await realClick(EYE(1, idCdi), 900);
await away();
check('l\'œil se rouvre, la ligne Grist n\'a plus de masquage', flat(await eyesOf()).every(m => m.pressed !== 'true') && JSON.stringify(await hiddenOf(idMacro)) === JSON.stringify([[], [], []]));

check('aucune boîte native (prompt, confirm, alert) ne s\'est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
