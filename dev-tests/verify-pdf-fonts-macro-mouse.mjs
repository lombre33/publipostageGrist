#!/usr/bin/env node
// Retour d'Antoine du 26/11 : « je travaille sur les modèles depuis plusieurs semaines et je n'avais jamais eu de warning dans l'éditeur [pour une police que le PDF ne peut pas écrire] ». Le bandeau et la pastille de
// « Police » (js/pdf-font-notice.js, consigne 090 de GFS) lisent le texte de l'éditeur ; celui d'un MACRO-MODÈLE est vide, son résumé prend la place du texte, et rien ne lisait les modèles qu'il assemble. Le résumé
// (js/macro-editor.js : paintFonts) dit maintenant leurs polices : une ligne sous le résumé, une étiquette « 2 polices » sur chaque modèle concerné. Les cas de dev-tests/scenarios-pdf-fonts-editor.js (groupe
// pdfFontsEditor) tournent DANS la page (relevé, œil, extension, lecture légère, langues) ; ici, à la taille du panneau Grist d'Antoine (~700x400), la vraie souris et le vrai clavier :
//   1) le résumé : la ligne est entière dans la largeur (aucun défilement horizontal), au-dessus de la liste, avec son point orange ; l'étiquette est dans la ligne de son modèle, avant le stylo, et le stylo et
//      l'œil restent au premier plan et d'au moins 24 px ; le modèle en Arial n'a ni étiquette ni mot dans la ligne ;
//   2) un vrai clic sur l'œil du modèle concerné : la ligne et l'étiquette partent ; un second clic les rend ;
//   3) un vrai clic sur son stylo : le modèle s'ouvre, le bandeau nomme les mêmes polices (au premier plan, dans la largeur), « Revenir au macro-modèle » ramène le résumé et sa ligne ;
//   4) clair, sombre (texte de la ligne 4,5:1, point orange 3:1 sur le fond) et anglais (ligne, étiquette, infobulle sans clé brute) ;
//   5) le collage (carte du 26/11, « Rouvrir le bandeau ») : dans un modèle ordinaire dont le bandeau a été fermé au vrai clic, un collage (l'événement `paste` du presse-papiers, au curseur) d'une police non exportable
//      rouvre le bandeau - au premier plan, dans la largeur - et il la nomme ; coller de nouveau la même police ne le rouvre pas.
// Lancé par run-headless.mjs (groupe Node "pdfFontsMacroMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-pdf-fonts-macro-mouse.mjs
// PDF_FONTS_MACRO_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.PDF_FONTS_MACRO_MOUSE_PORT || 9703);
const SHOTS = process.env.PDF_FONTS_MACRO_SHOTS || '';
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

const OFFLINE = existsSync(join(CACHE, 'umd'));
const UMD_ROUTES = OFFLINE ? [
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/vfs_fonts\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@[\d.]+\/dist\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-pdf-fonts-macro-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

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



const NOTE = '#macro-summary-fonts';
const PENCIL = id => `#macro-summary-parts .macro-summary-edit[data-template-id="${id}"]`;
const EYE = id => `#macro-summary-parts .macro-summary-eye[data-template-id="${id}"]`;
const para = (font, text) => `<p><span style="font-family: ${font}">${text}</span></p>`;
const MAC = para('TimesNewRomanPS-BoldItalicMT', 'Titre') + para('MS Gothic', '☐ Case');

const noteState = () => page.evaluate((sel) => {
  const note = document.querySelector(sel), box = document.querySelector('.macro-summary-box'), list = document.getElementById('macro-summary-parts');
  if (!note) return null;
  const r = note.getBoundingClientRect(), l = list.getBoundingClientRect(), b = box.getBoundingClientRect();
  const dot = getComputedStyle(note, '::before');
  return {
    hidden: note.hidden || r.height === 0, text: note.textContent.replace(/\s+/g, ' ').trim(), top: r.top, bottom: r.bottom, left: r.left, right: r.right, listTop: l.top,
    fitsWidth: note.scrollWidth <= note.clientWidth + 1 && r.right <= window.innerWidth + 0.5 && document.documentElement.scrollWidth <= window.innerWidth + 1,
    dotColor: dot.backgroundColor, dotSize: dot.width, textColor: getComputedStyle(note).color, boxLeft: b.left, boxRight: b.right,
  };
}, NOTE);
const tagState = id => page.evaluate((i) => {
  const edit = document.querySelector('#macro-summary-parts .macro-summary-edit[data-template-id="' + i + '"]');
  if (!edit) return null;
  const row = edit.closest('.macro-summary-model'), tag = row.querySelector('.macro-summary-model-tag[data-tag="fonts"]');
  const eye = row.querySelector('.macro-summary-eye');
  const box = e => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { l: r.left, r: r.right, w: r.width, h: r.height, onTop: !!hit && (hit === e || e.contains(hit)) }; };
  const rowBox = row.getBoundingClientRect();
  return {
    row: { l: rowBox.left, r: rowBox.right },
    tag: tag ? Object.assign({ text: tag.textContent, title: tag.title, beforePencil: tag.nextElementSibling === edit, dot: getComputedStyle(tag, '::before').backgroundColor }, box(tag)) : null,
    pencil: box(edit), eye: box(eye), inRow: tag ? tag.getBoundingClientRect().right <= rowBox.right + 0.5 : true,
  };
}, id);
const barState = () => page.evaluate(() => {
  const bar = document.getElementById('pdf-fonts-bar'); const r = bar.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { shown: !bar.hidden && r.height > 0, text: bar.querySelector('.pp-fonts-bar-text').textContent.replace(/\s+/g, ' ').trim(), onTop: !!hit && (hit === bar || bar.contains(hit)), l: r.left, r: r.right, w: window.innerWidth };
});


// Un macro-modèle réel : deux modèles (l'un en Times New Roman PS et MS Gothic, l'autre en Arial), par la vraie fenêtre de composition puis la composition écrite dans sa ligne.
const macro = await page.evaluate(async (html) => {
  const garde = await Templates.save(null, 'Garde polices', html.mac, '', null, null, 'document', null);
  const annexe = await Templates.save(null, 'Annexe Arial', html.arial, '', null, null, 'document', null);
  await Templates.loadAll();
  MacroEditor.openModal(null);
  document.getElementById('macro-editor-name').value = 'Macro polices souris';
  const select = document.querySelector('#macro-editor-slots .macro-doc-model');
  select.value = String(garde.id);
  select.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('macro-editor-save').click();
  await new Promise(r => setTimeout(r, 700));
  const id = Templates.getCurrentId();
  window.__gristStub.remoteWrite('Publipostage_Modeles', id, { Contenu: JSON.stringify({ slots: [{ type: 'fixed', modeleId: garde.id }, { type: 'fixed', modeleId: annexe.id }] }) });
  await Templates.loadAll();
  const list = document.getElementById('template-select');
  list.value = String(id);
  list.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 900));
  return { id, garde: garde.id, annexe: annexe.id };
}, { mac: MAC, arial: para('Arial', 'Annexe en Arial') });
await sleep(300);
await shot('1-resume');

// --- 1) Le résumé ---
const first = await noteState();
check('1 la ligne des polices est montrée, sous le résumé et avant la liste', !!first && !first.hidden && first.bottom <= first.listTop + 1, first);
check('1 elle dit les deux polices, ce que le PDF écrit et le modèle', !!first && first.text.indexOf('Dans le PDF, 2 polices seront remplacées :') === 0
  && first.text.indexOf('TimesNewRomanPS-BoldItalicMT → Tinos (proche de Times New Roman), dans « Garde polices »') !== -1
  && first.text.indexOf('MS Gothic → Roboto, dans « Garde polices »') !== -1 && first.text.indexOf('Annexe Arial') === -1
  && first.text.indexOf('Pour les remplacer, ouvrez le modèle concerné avec son crayon.') !== -1, first && first.text);
check('1 entière dans la largeur du panneau : ni débordement, ni défilement horizontal de la page', !!first && first.fitsWidth, first);
check('1 son point est orange (jeton --warn-dot), de 8 px', !!first && first.dotSize === '8px' && first.dotColor !== 'rgba(0, 0, 0, 0)', first && [first.dotSize, first.dotColor]);
const tagA = await tagState(macro.garde), tagB = await tagState(macro.annexe);
check('1 l\u2019étiquette « 2 polices » est dans la ligne du modèle concerné, avant son stylo, avec l\u2019infobulle de la phrase', !!tagA && !!tagA.tag && tagA.tag.text === '2 polices' && tagA.tag.beforePencil && tagA.inRow
  && tagA.tag.title.indexOf('Dans le PDF, 2 polices seront remplacées : TimesNewRomanPS-BoldItalicMT → Tinos') === 0, tagA);
check('1 le stylo et l\u2019œil du modèle concerné restent au premier plan, d\u2019au moins 24 px', !!tagA && tagA.pencil.onTop && tagA.eye.onTop && tagA.pencil.w >= 24 && tagA.pencil.h >= 24 && tagA.eye.w >= 24 && tagA.eye.h >= 24, tagA);
check('1 le modèle en Arial n\u2019a ni étiquette ni mot dans la ligne', !!tagB && !tagB.tag, tagB);

// --- 2) L'œil, au vrai clic ---
await realClick(EYE(macro.garde), 500);
const hiddenNote = await noteState();
const hiddenTag = await tagState(macro.garde);
check('2 un vrai clic sur l\u2019œil du modèle concerné : la ligne et l\u2019étiquette partent', !!hiddenNote && hiddenNote.hidden && hiddenNote.text === '' && !!hiddenTag && !hiddenTag.tag, [hiddenNote && hiddenNote.text, hiddenTag && hiddenTag.tag]);
await realClick(EYE(macro.garde), 500);
const backNote = await noteState();
check('2 un second clic les rend', !!backNote && !backNote.hidden && backNote.text.indexOf('Dans le PDF, 2 polices seront remplacées :') === 0 && !!(await tagState(macro.garde)).tag, backNote && backNote.text);
await away();

// --- 3) Le stylo, au vrai clic ---
await realClick(PENCIL(macro.garde), 900);
const opened = await page.evaluate(() => ({ summary: getComputedStyle(document.getElementById('macro-summary-container')).display !== 'none', current: String(Templates.getCurrentId()) }));
await page.waitForFunction(() => !document.getElementById('pdf-fonts-bar').hidden, null, { timeout: 6000 }).catch(() => {});
const bar = await barState();
await shot('2-modele-ouvert');
check('3 un vrai clic sur le stylo ouvre le modèle (le résumé s\u2019efface)', !opened.summary && opened.current === String(macro.garde), opened);
check('3 le bandeau y nomme les mêmes polices, au premier plan et dans la largeur', bar.shown && bar.onTop && bar.l >= 0 && bar.r <= bar.w + 0.5
  && bar.text.indexOf('TimesNewRomanPS-BoldItalicMT → Tinos (proche de Times New Roman)') !== -1 && bar.text.indexOf('MS Gothic → Roboto') !== -1, bar);
await realClick('#btn-macro-return', 900);
const returned = await noteState();
check('3 « Revenir au macro-modèle » ramène le résumé et sa ligne', !!returned && !returned.hidden && returned.text.indexOf('Dans le PDF, 2 polices seront remplacées :') === 0, returned && returned.text);
await away();

// --- 4) Clair, sombre, anglais ---
for (const theme of ['light', 'dark']) {
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
  await sleep(250);
  const paint = await page.evaluate((sel) => {
    const note = document.querySelector(sel);
    // Le fond réel : le premier ancêtre qui en a un.
    let bgEl = note, bg = 'rgba(0, 0, 0, 0)';
    while (bgEl) { bg = getComputedStyle(bgEl).backgroundColor; if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') break; bgEl = bgEl.parentElement; }
    return { text: getComputedStyle(note).color, bg, dot: getComputedStyle(note, '::before').backgroundColor, tagDot: getComputedStyle(document.querySelector('.macro-summary-model-tag[data-tag="fonts"]'), '::before').backgroundColor };
  }, NOTE);
  await shot('3-' + theme);
  check('4 ' + theme + ' : le texte de la ligne a 4,5:1 sur son fond', ratio(paint.text, paint.bg) >= 4.5, [paint, ratio(paint.text, paint.bg)]);
  check('4 ' + theme + ' : le point orange a 3:1 sur son fond (ligne et étiquette)', ratio(paint.dot, paint.bg) >= 3 && ratio(paint.tagDot, paint.bg) >= 3, [paint, ratio(paint.dot, paint.bg), ratio(paint.tagDot, paint.bg)]);
}
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await page.evaluate(() => I18n.setLang('en'));
await page.evaluate(() => MacroEditor.showSummary(Templates.byId(Templates.getCurrentId())));
await sleep(300);
const en = await noteState();
const enTag = await tagState(macro.garde);
check('4 en anglais : la ligne, l\u2019étiquette et l\u2019infobulle, sans clé brute, dans la largeur', !!en && en.text.indexOf('In the PDF, 2 fonts will be replaced:') === 0 && en.text.indexOf('in “Garde polices”') !== -1
  && en.text.indexOf('To replace them, open the template concerned with its pencil.') !== -1 && !/pdfFonts\./.test(en.text) && en.fitsWidth
  && !!enTag && !!enTag.tag && enTag.tag.text === '2 fonts' && enTag.tag.title.indexOf('In the PDF, 2 fonts will be replaced:') === 0, [en && en.text, enTag && enTag.tag]);
await shot('4-anglais');
await page.evaluate(() => I18n.setLang('fr'));

// --- 5) Le collage, dans un modèle ordinaire (ouvert par un vrai clic sur sa ligne de la liste) ---
const ordinaryId = await makeTemplate('Texte ordinaire', para('Cambria', 'Texte en Cambria'));
check('5 la liste ouvre le modèle ordinaire', await pickTemplate('Texte ordinaire', ordinaryId), ordinaryId);
await page.waitForFunction(() => !document.getElementById('pdf-fonts-bar').hidden && document.getElementById('pdf-fonts-bar').textContent.indexOf('Cambria') !== -1, null, { timeout: 6000 }).catch(() => {});
const before = await barState();
check('5 le modèle ordinaire en Cambria montre le bandeau à l\u2019ouverture', before.shown && before.text.indexOf('Cambria → Tinos') !== -1, before);
await realClick('.pp-fonts-bar-close', 500);
const closed = await barState();
check('5 un vrai clic sur « Fermer » retire le bandeau', !closed.shown, closed);
const pasteFont = font => page.evaluate(async (f) => {
  const view = EditorCore.getEditor().view;
  view.focus();
  const data = new DataTransfer();
  data.setData('text/html', '<span style="font-family: ' + f + '">collé</span>');
  data.setData('text/plain', 'collé');
  view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 900));
}, font);
await pasteFont('Verdana');
const reopened = await barState();
await shot('5-collage');
check('5 un collage en Verdana rouvre le bandeau, au premier plan et dans la largeur, et le nomme', reopened.shown && reopened.onTop && reopened.l >= 0 && reopened.r <= reopened.w + 0.5
  && reopened.text.indexOf('2 polices seront remplacées') !== -1 && reopened.text.indexOf('Verdana → Roboto') !== -1, reopened);
await realClick('.pp-fonts-bar-close', 500);
await pasteFont('Verdana');
const again = await barState();
check('5 coller de nouveau la même police ne le rouvre pas', !again.shown, again);

check('aucune erreur de page, aucune boîte native', pageErrors.length === 0 && nativeDialogs.length === 0, { pageErrors, nativeDialogs });
await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
