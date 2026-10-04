#!/usr/bin/env node
// Retour d'Antoine du 2026-10-02 (point 2) : « Dans un macro-modèle, si on veut modifier un sous-modèle en cliquant sur un stylo quelque part le sous-modèle et, si possible, sur un bouton pour revenir au
// macro-modèle ». Le résumé du macro-modèle (js/macro-editor.js:renderParts) liste ses modèles avec un stylo chacun ; le stylo ouvre le modèle dans l'éditeur (js/main.js:openTemplateFromMacro) et un bandeau
// d'une ligne sous la barre d'outils (#macro-return-bar, pas une icône de plus dans la barre gelée) ramène au macro-modèle (returnToMacro). Les cas de dev-tests/scenarios-macro-modeles.js tournent DANS la
// page ; ici, à la taille du panneau Grist d'Antoine (~700x400), la vraie souris, le vrai clavier et la vraie molette :
//   1) le résumé : une ligne par page de garde ou annexe, un stylo par modèle (nom accessible, au moins 24 px, au premier plan), bandeau caché, « Modifier la composition » toujours là ;
//   2) un vrai clic sur un stylo ouvre le modèle : le bandeau nomme le macro-modèle, tient sur une ligne entre la barre d'outils et le texte, son bouton se clique ;
//   3) un vrai clic sur « Revenir au macro-modèle » ramène au résumé, le bandeau part, le focus revient sur le stylo du modèle quitté ; Tab visite les stylos dans l'ordre, anneau de focus visible ; Entrée, Espace ;
//   4) une modification en attente (enregistrement automatique coupé) : la question Enregistrer / Abandonner / Annuler ; Annuler garde le modèle, son texte et le bandeau ; Enregistrer écrit UNE fois et la Lecture du
//      macro-modèle montre le texte ; Abandonner n'écrit rien ;
//   5) enregistrement automatique allumé : la frappe est écrite avant le retour, aucune question ;
//   6) nom de macro-modèle très long (phrase coupée par « … », bouton entier, info-bulle), sept annexes (le résumé défile à la molette, le dernier stylo se clique, le focus le ramène à l'écran), modèle supprimé
//      (stylo grisé, ligne jamais retirée) ;
//   7) clair, sombre (textes et anneau de focus : contrastes de la charte, F5) et anglais.
// Lancé par run-headless.mjs (groupe Node "macroSubmodelMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-macro-submodel-mouse.mjs
// MACRO_SUBMODEL_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.MACRO_SUBMODEL_MOUSE_PORT || 8924);
const SHOTS = process.env.MACRO_SUBMODEL_SHOTS || '';
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/html2pdf\.bundle\.min\.js$/, 'umd/html2pdf.bundle.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-macro-submodel-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const PENCIL = id => `#macro-summary-parts .macro-summary-edit[data-template-id="${id}"]`;
const BAR_BUTTON = '#btn-macro-return';

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
// Une vraie frappe à la fin du premier paragraphe du modèle ouvert.
async function typeAtEnd(text) {
  const para = await rectOf('.ProseMirror p');
  await page.mouse.click(para.r - 3, para.y); await page.keyboard.press('End'); await page.keyboard.type(text);
}
const UNSAVED = /^(Modifications non enregistrées\.|Unsaved changes\.)$/;
const SAVED = /^(Enregistré à |Saved at )/;
const stored = id => page.evaluate(i => { const m = window.__gristStub.state.rows.Publipostage_Modeles; return String(m.Contenu[m.id.indexOf(i)]); }, id);

// L'état de l'écran : quel modèle, quelle zone, quel bandeau, qui a le focus, combien d'écritures dans la table des modèles.
const snap = () => page.evaluate(() => {
  const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  const bar = document.getElementById('macro-return-bar');
  const a = document.activeElement;
  const prose = document.querySelector('.ProseMirror');
  return {
    current: String(Templates.getCurrentId()),
    summaryShown: shown(document.getElementById('macro-summary-container')),
    editorShown: shown(document.getElementById('editor-container')),
    barShown: !bar.hidden && shown(bar),
    barText: document.getElementById('macro-return-text').textContent,
    buttonText: document.getElementById('btn-macro-return').textContent,
    text: prose ? prose.textContent : '',
    status: document.getElementById('status-msg').textContent,
    updates: window.__gristStub.countActions('UpdateRecord', 'Publipostage_Modeles'),
    focus: !a ? null : (a.dataset && a.dataset.templateId ? (a.classList.contains('macro-summary-eye') ? 'oeil:' : 'stylo:') + a.dataset.templateId : (a.id || a.className || a.tagName)),
  };
});
// Le résumé : une ligne par page de garde ou annexe, avec ses modèles et leur stylo.
const summaryOf = () => page.evaluate(() => {
  const box = document.getElementById('macro-summary-container').getBoundingClientRect();
  const hit = el => { const b = el.getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!top && (top === el || el.contains(top)); };
  return {
    container: { l: box.left, t: box.top, r: box.right, b: box.bottom },
    scrollable: document.getElementById('macro-summary-container').scrollHeight > document.getElementById('macro-summary-container').clientHeight + 4,
    sentence: document.getElementById('macro-summary-text').textContent,
    rows: Array.from(document.querySelectorAll('#macro-summary-parts .macro-summary-part')).map(li => ({
      label: li.querySelector('.macro-summary-part-label').textContent,
      models: Array.from(li.querySelectorAll('.macro-summary-model, .macro-summary-models > .macro-summary-model-name')).map(m => {
        const pencil = m.querySelector('.macro-summary-edit');
        const b = pencil ? pencil.getBoundingClientRect() : null;
        return {
          name: (m.querySelector('.macro-summary-model-name') || m).textContent, missing: m.classList.contains('is-missing'),
          id: pencil ? pencil.dataset.templateId : null, disabled: pencil ? pencil.disabled : null, label: pencil ? pencil.getAttribute('aria-label') : null, title: pencil ? pencil.title : null,
          w: b ? b.width : 0, h: b ? b.height : 0, onTop: pencil ? hit(pencil) : false, opacity: pencil ? getComputedStyle(pencil).opacity : null,
        };
      }),
    })),
  };
});
// Le bandeau : où il est, ce qu'il dit, son bouton est-il au premier plan.
const barOf = () => page.evaluate(() => {
  const r = el => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const bar = document.getElementById('macro-return-bar'), text = document.getElementById('macro-return-text'), btn = document.getElementById('btn-macro-return');
  const b = btn.getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  const reader = document.getElementById('reader-container');
  const stage = getComputedStyle(reader).display !== 'none' ? reader : document.getElementById('editor-container');
  return {
    bar: r(bar), text: r(text), btn: r(btn), toolbar: r(document.getElementById('toolbar-top')), stage: r(stage),
    clipped: text.scrollWidth > text.clientWidth + 1, ellipsis: getComputedStyle(text).textOverflow, title: text.title,
    btnOnTop: !!top && (top === btn || btn.contains(top)), btnClipped: btn.scrollWidth > btn.clientWidth + 1,
  };
});
const dialogState = () => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  if (!ov || getComputedStyle(ov).display === 'none') return { open: false };
  const box = ov.querySelector('.modal-content').getBoundingClientRect();
  const rects = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map(b => {
    const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { label: b.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: !!top && (top === b || b.contains(top)), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
  });
  return { open: true, message: ov.querySelector('.pp-dialog-message').textContent, rects, labels: rects.map(r => r.label), box: { l: box.left, t: box.top, r: box.right, b: box.bottom } };
});
async function clickDialog(label, wait = 700) {
  const s = await dialogState();
  const b = s.open && s.rects.find(r => r.label === label);
  if (!b) throw new Error('bouton « ' + label + ' » absent : ' + JSON.stringify(s));
  await page.mouse.move(b.x - 10, b.y, { steps: 2 }); await page.mouse.click(b.x, b.y);
  await sleep(wait);
}
const paintOf = (sel, bgSel) => page.evaluate(([s, b]) => {
  const e = document.querySelector(s), bg = document.querySelector(b || s), cs = getComputedStyle(e);
  return { color: cs.color, bg: getComputedStyle(bg).backgroundColor, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, borderColor: cs.borderTopColor, opacity: cs.opacity };
}, [sel, bgSel || null]);

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
const rule = (value, modeleId) => ({ column: 'Nom', operator: '=', value, modeleId });
const MACRO = 'Dossier salarié';
const idMacro = await makeTemplate(MACRO, JSON.stringify({ slots: [
  { type: 'fixed', modeleId: idCover },
  { type: 'conditional', rules: [rule('a', idCdi), rule('b', idCdd)], defaultModeleId: idMentions },
  { type: 'conditional', rules: [rule('c', idMentions)], defaultModeleId: null },
] }), 'macro');
const LONG = 'Dossier salarié : contrat, avenants, annexes et mentions légales de toutes les filiales du groupe, version complète';
const idLong = await makeTemplate(LONG, JSON.stringify({ slots: [{ type: 'fixed', modeleId: idCover }] }), 'macro');
const avenants = [];
for (let n = 1; n <= 7; n++) avenants.push(await makeTemplate('Avenant ' + n, '<p>Texte de l’avenant ' + n + '</p>'));
const idMany = await makeTemplate('Dossier complet', JSON.stringify({ slots: [
  { type: 'fixed', modeleId: idCover },
  ...avenants.map((id, i) => ({ type: 'conditional', rules: [rule('x' + (i + 1), id)], defaultModeleId: null })),
] }), 'macro');
const GONE = 987654;
const idGone = await makeTemplate('Dossier à trou', JSON.stringify({ slots: [
  { type: 'fixed', modeleId: idCover },
  { type: 'conditional', rules: [rule('a', GONE)], defaultModeleId: idMentions },
] }), 'macro');

// Rien n'écrit tout seul pendant les parcours (le minuteur de l'enregistrement automatique relit la liste) : coupé par le vrai menu, rallumé pour le cas 5.
const autoOff = await setAutosave(false);
check('enregistrement automatique coupé par le vrai menu', autoOff === false);

async function run(theme) {
  const T = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Stylo d'un modèle du macro-modèle et retour, ${WIDTH}x${HEIGHT}, thème ${T} ===`);
  await away();

  // 1) Le résumé : une ligne par page de garde ou annexe, un stylo par modèle.
  check(`${T} - le macro-modèle s'ouvre par la liste`, await pickTemplate(MACRO, idMacro));
  const s0 = await snap(), sum0 = await summaryOf();
  await shot(`${theme}-1-resume`);
  check(`${T} - le résumé est à l'écran, l'éditeur et le bandeau « Revenir au macro-modèle » non`, s0.summaryShown && !s0.editorShown && !s0.barShown, s0);
  check(`${T} - une ligne par page de garde ou annexe : « Page de garde », « Annexe 1 », « Annexe 2 »`, JSON.stringify(sum0.rows.map(r => r.label)) === JSON.stringify(['Page de garde', 'Annexe 1', 'Annexe 2']), sum0.rows.map(r => r.label));
  const names = sum0.rows.map(r => r.models.map(m => m.name));
  check(`${T} - chaque ligne dit ses modèles : la garde, les trois de l'annexe 1 (jamais deux fois le même), celui de l'annexe 2`,
    JSON.stringify(names) === JSON.stringify([['Contrat client'], ['Annexe CDI', 'Annexe CDD', 'Mentions légales'], ['Mentions légales']]), names);
  const pencils = sum0.rows.flatMap(r => r.models);
  check(`${T} - un stylo par modèle (cinq), nom accessible et info-bulle « Modifier le modèle « … » », au moins 24 px, au premier plan`,
    pencils.length === 5 && pencils.every(p => p.label === `Modifier le modèle « ${p.name} »` && p.title === p.label && p.w >= 24 && p.h >= 24 && p.onTop && !p.disabled), pencils);
  const sentence = await paintOf('#macro-summary-text', '#macro-summary-container');
  check(`${T} - la phrase du résumé (« Page de garde : … — 2 annexes conditionnelles. ») se lit sur le fond du panneau (4,5:1 au moins ; en couleur de texte du thème, elle n'avait que 4,39:1 en clair avec le gris atténué)`,
    ratio(sentence.color, sentence.bg) >= 4.5, { sentence: ratio(sentence.color, sentence.bg), color: sentence.color, bg: sentence.bg });

  // Contrastes du résumé : étiquette, nom, nom d'un modèle introuvable, stylo, tous sur le fond de leur ligne.
  const rowBg = (await paintOf('#macro-summary-parts .macro-summary-part')).bg;
  const label = await paintOf('#macro-summary-parts .macro-summary-part-label');
  const name = await paintOf('#macro-summary-parts .macro-summary-model-name');
  const pencilPaint = await paintOf(PENCIL(idCover));
  check(`${T} - étiquette, nom de modèle et stylo se lisent sur leur ligne (4,5:1 au moins)`,
    ratio(label.color, rowBg) >= 4.5 && ratio(name.color, rowBg) >= 4.5 && ratio(pencilPaint.color, rowBg) >= 4.5,
    { label: ratio(label.color, rowBg), name: ratio(name.color, rowBg), pencil: ratio(pencilPaint.color, rowBg) });

  // Survol : le stylo se distingue (fond), au vrai pointeur.
  const before = await paintOf(PENCIL(idCdd));
  await hover(PENCIL(idCdd));
  const hovered = await paintOf(PENCIL(idCdd));
  check(`${T} - au survol le stylo change de fond et de bordure`, hovered.bg !== before.bg && hovered.borderColor !== before.borderColor, { before: before.bg, hovered: hovered.bg });
  await away();

  // 2) Un vrai clic sur le stylo d'« Annexe CDD » : le modèle s'ouvre, le bandeau nomme le macro-modèle.
  await realClick(PENCIL(idCdd), 900);
  await waitCurrent(idCdd);
  const s1 = await snap(), g1 = await barOf();
  await shot(`${theme}-2-modele-ouvert`);
  check(`${T} - un clic sur le stylo ouvre « Annexe CDD » dans l'éditeur, le résumé s'efface`, s1.current === String(idCdd) && s1.editorShown && !s1.summaryShown && s1.text === 'Texte de l’annexe CDD', s1);
  check(`${T} - le bandeau est là, dit le macro-modèle d'où l'on vient et propose « Revenir au macro-modèle »`,
    s1.barShown && s1.barText === `Modèle ouvert depuis le macro-modèle « ${MACRO} ».` && s1.buttonText === 'Revenir au macro-modèle', s1);
  check(`${T} - le bandeau tient dans le panneau, sur une ligne, sous la barre d'outils et au-dessus du texte (rien n'est recouvert)`,
    g1.bar.l >= 0 && g1.bar.r <= WIDTH + 0.5 && g1.bar.h <= 40 && g1.bar.t >= g1.toolbar.b - 0.5 && g1.stage.t >= g1.bar.b - 0.5, g1);
  check(`${T} - le bouton du bandeau est au premier plan, entier dans le panneau, assez grand pour un vrai clic (24 px au moins)`,
    g1.btnOnTop && !g1.btnClipped && g1.btn.r <= WIDTH + 0.5 && g1.btn.w >= 24 && g1.btn.h >= 24, g1);
  const barPaint = await paintOf('#macro-return-text', '#macro-return-bar');
  const btnPaint = await paintOf(BAR_BUTTON);
  check(`${T} - la phrase et le bouton du bandeau se lisent (4,5:1 au moins)`,
    ratio(barPaint.color, barPaint.bg) >= 4.5 && ratio(btnPaint.color, btnPaint.bg) >= 4.5, { phrase: ratio(barPaint.color, barPaint.bg), bouton: ratio(btnPaint.color, btnPaint.bg) });

  // 3) Un vrai clic sur le bouton du bandeau : retour au résumé, focus sur le stylo du modèle quitté.
  await realClick(BAR_BUTTON, 900);
  await waitCurrent(idMacro);
  const s2 = await snap(), p2 = await rectOf(PENCIL(idCdd));
  await shot(`${theme}-3-retour`);
  check(`${T} - « Revenir au macro-modèle » ramène au résumé du macro-modèle, le bandeau part`, s2.current === String(idMacro) && s2.summaryShown && !s2.editorShown && !s2.barShown, s2);
  check(`${T} - le focus revient sur le stylo d'« Annexe CDD » (le bouton a disparu avec le bandeau), à l'écran`, s2.focus === 'stylo:' + idCdd && p2 && p2.onTop, { focus: s2.focus, p2 });

  // Lecture : le bandeau reste tant que le modèle est à l'écran, au-dessus de la Lecture ; son bouton ramène au macro-modèle, lu lui aussi.
  await realClick(PENCIL(idCdd), 900);
  await waitCurrent(idCdd);
  await realClick('#btn-mode-read', 1200);
  const rd = await snap(), rg = await barOf();
  await shot(`${theme}-3b-lecture`);
  check(`${T} - en Lecture le bandeau reste, au-dessus de la Lecture du modèle (rien n'est recouvert), son bouton au premier plan`, rd.barShown && rg.stage.t >= rg.bar.b - 0.5 && rg.btnOnTop, { rd, rg });
  await realClick(BAR_BUTTON, 1200);
  await waitCurrent(idMacro);
  const rb = await snap();
  const rbText = await page.evaluate(() => document.getElementById('reader-container').textContent || '');
  check(`${T} - en Lecture, « Revenir au macro-modèle » montre le macro-modèle lu (page de garde, annexe), sans bandeau`, rb.current === String(idMacro) && !rb.barShown && rbText.includes('Page de garde du contrat') && rbText.includes('Texte de l’annexe CDI'), { rb, rbText: rbText.slice(0, 200) });
  await realClick('#btn-mode-edit', 800);
  const rs = await snap();
  check(`${T} - de retour en Édition, le résumé du macro-modèle est là`, rs.summaryShown && !rs.barShown, rs);
  await away();

  // Clavier : Tab visite, pour chaque modèle, son stylo puis son œil (04/10), dans l'ordre de lecture, puis « Modifier la composition » ; l'anneau du stylo se voit.
  await page.focus('#macro-summary-parts .macro-summary-edit');
  const order = [(await snap()).focus];
  for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); order.push((await snap()).focus); }
  check(`${T} - Tab visite le stylo puis l'œil de chacun des cinq modèles, dans l'ordre de lecture, puis « Modifier la composition »`,
    JSON.stringify(order) === JSON.stringify(['stylo:' + idCover, 'oeil:' + idCover, 'stylo:' + idCdi, 'oeil:' + idCdi, 'stylo:' + idCdd, 'oeil:' + idCdd, 'stylo:' + idMentions, 'oeil:' + idMentions, 'stylo:' + idMentions, 'oeil:' + idMentions, 'btn-edit-macro']), order);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  const ring = await paintOf('#macro-summary-parts .macro-summary-edit:focus', '#macro-summary-parts .macro-summary-part');
  check(`${T} - un stylo pris au clavier montre son anneau de focus (2 px, plein, 3:1 au moins sur sa ligne)`,
    ring.outlineStyle === 'solid' && ring.outlineWidth === '2px' && ratio(ring.outlineColor, ring.bg) >= 3, { ring, ratio: ratio(ring.outlineColor, ring.bg) });

  // Entrée sur un stylo ouvre le modèle ; Entrée puis Espace sur le bouton ramènent.
  await page.focus(PENCIL(idCdi));
  await page.keyboard.press('Enter');
  await waitCurrent(idCdi);
  const k1 = await snap();
  check(`${T} - Entrée sur le stylo d'« Annexe CDI » ouvre le modèle et le bandeau`, k1.current === String(idCdi) && k1.barShown && k1.text.startsWith('Texte de l’annexe CDI'), k1);
  await page.focus(BAR_BUTTON);
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  const ringBar = await paintOf(BAR_BUTTON, '#macro-return-bar');
  check(`${T} - le bouton du bandeau pris au clavier montre son anneau de focus (2 px, plein, 3:1 au moins)`,
    ringBar.outlineStyle === 'solid' && ringBar.outlineWidth === '2px' && ratio(ringBar.outlineColor, ringBar.bg) >= 3, { ringBar, ratio: ratio(ringBar.outlineColor, ringBar.bg) });
  await page.keyboard.press('Enter');
  await waitCurrent(idMacro);
  const k2 = await snap();
  check(`${T} - Entrée sur « Revenir au macro-modèle » ramène au résumé, focus sur le stylo d'« Annexe CDI »`, k2.current === String(idMacro) && k2.summaryShown && !k2.barShown && k2.focus === 'stylo:' + idCdi, k2);
  await page.keyboard.press('Enter');
  await waitCurrent(idCdi);
  await page.focus(BAR_BUTTON);
  await page.keyboard.press('Space');
  await waitCurrent(idMacro);
  const k3 = await snap();
  check(`${T} - Entrée sur le stylo (focus rendu), puis Espace sur le bouton : aller et retour`, k3.current === String(idMacro) && k3.summaryShown && !k3.barShown && k3.focus === 'stylo:' + idCdi, k3);

  // 4) Une modification en attente : la question Enregistrer / Abandonner / Annuler.
  await realClick(PENCIL(idCdi), 900);
  await waitCurrent(idCdi);
  const w0 = (await snap()).updates;
  const base = (await snap()).text; // le passage en clair a déjà enregistré sa frappe : le passage en sombre part de là
  const mark = ` (relu ${T})`;
  await typeAtEnd(mark);
  await sleep(300);
  const d0 = await snap();
  check(`${T} - une frappe dans le modèle ouvert : « Modifications non enregistrées. »`, UNSAVED.test(d0.status) && d0.text === base + mark, d0);
  await realClick(BAR_BUTTON, 600);
  const q = await dialogState();
  await shot(`${theme}-4-question`);
  check(`${T} - « Revenir au macro-modèle » pose la question, rien n'est écrit tant qu'on n'a pas répondu`, q.open && (await snap()).updates === w0 && (await snap()).current === String(idCdi), q);
  check(`${T} - la question tient dans le panneau, ses trois boutons (Annuler, Abandonner, Enregistrer) sont au premier plan`,
    q.open && [...q.labels].sort().join('|') === ['Abandonner', 'Annuler', 'Enregistrer'].sort().join('|') && q.rects.every(r => r.onTop && r.inView) && q.box.l >= 0 && q.box.t >= 0 && q.box.r <= WIDTH && q.box.b <= HEIGHT, q);
  await clickDialog('Annuler');
  const c0 = await snap();
  check(`${T} - Annuler garde le modèle, son texte, le bandeau, et n'écrit rien`, !(await dialogState()).open && c0.current === String(idCdi) && c0.barShown && c0.text === base + mark && c0.updates === w0, c0);
  await realClick(BAR_BUTTON, 600);
  await clickDialog('Enregistrer', 1100);
  await waitCurrent(idMacro);
  const e0 = await snap();
  check(`${T} - Enregistrer écrit le modèle UNE fois puis ramène au macro-modèle`, e0.current === String(idMacro) && e0.summaryShown && !e0.barShown && e0.updates === w0 + 1 && (await stored(idCdi)).includes(mark), { e0, w0 });
  await realClick('#btn-mode-read', 1500);
  const reading = await page.evaluate(() => document.getElementById('reader-container').textContent || '');
  check(`${T} - la Lecture du macro-modèle montre le texte qu'on vient d'enregistrer`, reading.includes(base + mark), reading.slice(0, 200));
  await realClick('#btn-mode-edit', 700);
  await away();

  // « Abandonner » : le macro-modèle revient sans rien écrire, le texte tapé n'est nulle part.
  await realClick(PENCIL(idCdd), 900);
  await waitCurrent(idCdd);
  const w1 = (await snap()).updates;
  await typeAtEnd(' (jeté)');
  await realClick(BAR_BUTTON, 600);
  await clickDialog('Abandonner', 1100);
  await waitCurrent(idMacro);
  const a0 = await snap();
  check(`${T} - Abandonner ramène au macro-modèle sans rien écrire`, a0.current === String(idMacro) && a0.summaryShown && !a0.barShown && a0.updates === w1 && !(await stored(idCdd)).includes('(jeté)'), { a0, w1 });
  await away();
}

await run('light');
await page.evaluate(() => Settings.setTheme('dark'));
await sleep(300);
await run('dark');
await page.evaluate(() => Settings.setTheme('light'));
await sleep(300);

// 5) Enregistrement automatique allumé : la frappe est écrite avant le retour, aucune question.
console.log('\n=== Enregistrement automatique allumé ===');
check('enregistrement automatique rallumé par le vrai menu', await setAutosave(true) === true);
check('le macro-modèle s\'ouvre par la liste', await pickTemplate(MACRO, idMacro));
await realClick(PENCIL(idCdd), 900);
await waitCurrent(idCdd);
const w2 = (await snap()).updates;
await typeAtEnd(' (auto)');
await sleep(3600); // un passage de l'enregistrement automatique : ~2,5 s après la frappe
const auto1 = await snap();
check('la frappe est écrite toute seule dans les secondes qui suivent (une écriture, « Enregistré à… »)', SAVED.test(auto1.status) && auto1.updates === w2 + 1 && (await stored(idCdd)).includes('(auto)'), { auto1, w2 });
await realClick(BAR_BUTTON, 900);
const auto2 = await snap();
check('« Revenir au macro-modèle » ne pose aucune question et ramène au résumé', !(await dialogState()).open && auto2.current === String(idMacro) && auto2.summaryShown && !auto2.barShown, auto2);
check('enregistrement automatique recoupé par le vrai menu', await setAutosave(false) === false);

// 6) Nom de macro-modèle très long, sept annexes, modèle supprimé.
console.log('\n=== Cas limites : nom très long, sept annexes, modèle supprimé ===');
check('le macro-modèle au nom très long s\'ouvre par la liste', await pickTemplate(LONG, idLong));
await realClick(PENCIL(idCover), 900);
await waitCurrent(idCover);
const gl = await barOf(), gn = await snap();
check('nom très long : la phrase est coupée par « … » sur une seule ligne, le bandeau garde sa hauteur', gn.barShown && gl.clipped && gl.ellipsis === 'ellipsis' && gl.bar.h <= 40, { gl, barText: gn.barText });
check('nom très long : le bouton reste entier, au premier plan, dans le panneau', gl.btnOnTop && !gl.btnClipped && gl.btn.r <= WIDTH + 0.5 && gl.btn.l >= gl.text.r - 0.5, gl);
check('nom très long : la phrase entière se lit à l\'info-bulle', gl.title === `Modèle ouvert depuis le macro-modèle « ${LONG} ».`, gl.title);
await shot('long-nom');
await realClick(BAR_BUTTON, 900);
await waitCurrent(idLong);
check('nom très long : le bouton ramène au macro-modèle', (await snap()).current === String(idLong) && (await snap()).summaryShown);

check('le macro-modèle de sept annexes s\'ouvre par la liste', await pickTemplate('Dossier complet', idMany));
const m0 = await summaryOf();
const last = avenants[6];
check('sept annexes : huit lignes, le résumé défile (la liste dépasse le panneau) et le dernier stylo n\'est pas encore atteignable', m0.rows.length === 8 && m0.scrollable && !m0.rows[7].models[0].onTop, { rows: m0.rows.length, scrollable: m0.scrollable, last: m0.rows[7] && m0.rows[7].models[0] });
await page.mouse.move(350, 250);
await page.mouse.wheel(0, 600);
await sleep(400);
const m1 = await summaryOf();
const lastPencil = await rectOf(PENCIL(last));
check('sept annexes : à la molette, le dernier stylo vient sous le pointeur, entier dans le panneau', lastPencil.onTop && lastPencil.b <= m1.container.b + 0.5 && lastPencil.t >= m1.container.t - 0.5, { lastPencil, container: m1.container });
const editBtn = await rectOf('#btn-edit-macro');
check('sept annexes : « Modifier la composition » est atteignable en bas de la liste', editBtn.onTop, editBtn);
await shot('sept-annexes');
await realClick(PENCIL(last), 900);
await waitCurrent(last);
const man = await snap();
check('sept annexes : le clic sur le dernier stylo ouvre « Avenant 7 » avec son bandeau', man.current === String(last) && man.barShown && man.text === 'Texte de l’avenant 7', man);
await realClick(BAR_BUTTON, 900);
await waitCurrent(idMany);
const mback = await snap(), mpencil = await rectOf(PENCIL(last));
check('sept annexes : au retour, le focus est sur le stylo d\'« Avenant 7 » et le résumé l\'a ramené à l\'écran', mback.summaryShown && mback.focus === 'stylo:' + last && mpencil.onTop, { mback, mpencil });

check('le macro-modèle dont un modèle a été supprimé s\'ouvre par la liste', await pickTemplate('Dossier à trou', idGone));
const g0 = await summaryOf();
const missing = g0.rows.flatMap(r => r.models).find(m => m.missing);
check('modèle supprimé : sa ligne reste, dit « modèle introuvable », son stylo est grisé (jamais retiré)', !!missing && missing.name === 'modèle introuvable' && missing.disabled === true && Number(missing.opacity) < 0.5 && g0.rows.length === 2, { missing, rows: g0.rows.length });
const missingPaint = await paintOf('#macro-summary-parts .macro-summary-model.is-missing .macro-summary-model-name', '#macro-summary-parts .macro-summary-part');
check('modèle supprimé : son texte reste lisible (4,5:1 au moins)', ratio(missingPaint.color, missingPaint.bg) >= 4.5, ratio(missingPaint.color, missingPaint.bg));
const greyed = await rectOf('#macro-summary-parts .macro-summary-model.is-missing .macro-summary-edit');
await page.mouse.move(greyed.x, greyed.y, { steps: 3 }); await page.mouse.click(greyed.x, greyed.y);
await sleep(700);
const g1s = await snap();
check('modèle supprimé : un clic sur son stylo grisé ne fait rien (même macro-modèle, pas de bandeau)', g1s.current === String(idGone) && g1s.summaryShown && !g1s.barShown, g1s);
await away();

// 7) Anglais : résumé, info-bulle du stylo, bandeau, et réécriture en direct au changement de langue.
console.log('\n=== Anglais ===');
await page.evaluate(() => I18n.setLang('en'));
await sleep(400);
check('en anglais le macro-modèle s\'ouvre par la liste', await pickTemplate(MACRO, idMacro));
const en0 = await summaryOf();
check('anglais : « Cover page », « Annex 1 », « Annex 2 » et l\'info-bulle « Edit the template “…” » sur chaque stylo',
  JSON.stringify(en0.rows.map(r => r.label)) === JSON.stringify(['Cover page', 'Annex 1', 'Annex 2']) && en0.rows.flatMap(r => r.models).every(m => m.label === `Edit the template “${m.name}”` && m.title === m.label), en0.rows);
await realClick(PENCIL(idCdd), 900);
await waitCurrent(idCdd);
const en1 = await snap(), eg = await barOf();
check('anglais : le bandeau dit « Template opened from the macro template “…”. » et propose « Back to the macro template »',
  en1.barShown && en1.barText === `Template opened from the macro template “${MACRO}”.` && en1.buttonText === 'Back to the macro template', en1);
check('anglais : le bouton du bandeau reste entier, au premier plan, dans le panneau', eg.btnOnTop && !eg.btnClipped && eg.btn.r <= WIDTH + 0.5 && eg.bar.h <= 40, eg);
await shot('anglais');
await page.evaluate(() => I18n.setLang('fr'));
await sleep(400);
const fr1 = await snap();
check('changement de langue en route : la phrase et le bouton du bandeau sont réécrits en français', fr1.barText === `Modèle ouvert depuis le macro-modèle « ${MACRO} ».` && fr1.buttonText === 'Revenir au macro-modèle', fr1);
await realClick(BAR_BUTTON, 900);
await waitCurrent(idMacro);
const fr2 = await snap();
check('le bouton ramène au macro-modèle', fr2.current === String(idMacro) && fr2.summaryShown && !fr2.barShown, fr2);

check('aucune boîte native (prompt, confirm, alert) ne s\'est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
