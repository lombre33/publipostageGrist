#!/usr/bin/env node
// La pastille « @ » dans les champs texte du mode Email (Objet, À, Cc, Cci : js/field-editor.js, js/mention.js, js/floating-toolbars.js:attachMentionToolbar), demande d'Antoine du 17/11
// (« dans le champ "à" d'un email je n'arrive pas à saisir des genre avec "@" » puis « moi je parle bien du @ pour une fiche » et « bien s'assurer que l'on puisse échap et sortir si jamais ça ouvre
// si on tape un email avec l'arobase avant le nom de domaine ») à 700x400 (le panneau d'Antoine), à la VRAIE souris (page.mouse) et au vrai clavier (page.keyboard). Un nouvel email créé par le menu « + » ;
// une adresse tapée caractère par caractère dans À et dans Cc (« contact@exemple.fr », « a@x.fr; b@y.fr ») n'ouvre JAMAIS la liste des fiches (la boîte n'existe même pas) et reste du texte brut ;
// puis « , @Mar » dans À ouvre la liste (dans le panneau, devant tout), Échap la ferme et le texte tapé reste tel quel, la lettre suivante ne la rouvre pas, Tab fait sortir du champ ; « @Mar »,
// Flèche bas et Entrée posent la pastille « Marie Martin » ; un clic dessus ouvre sa barre (dans le panneau, « Mise en forme conditionnelle » grisée), « Autres colonnes de la même fiche » (la
// fenêtre tient dans le panneau) puis « Remplacer » par Courriel font lire l'adresse de la personne ; dans l'Objet « Bonjour @Jea » et un clic sur la ligne « Jean Dupont » de la liste posent la pastille ;
// une liste sans fiche (« @zzz ») le dit et Échap la ferme. Puis le résultat : « Créer l'email » ouvre le lien mailto: capté avec l'adresse de la fiche et l'objet résolu, la Lecture écrit les mêmes valeurs
// sans pastille ni barre et rend les pastilles au retour, la pastille se lit en clair comme en sombre (4,5:1) et la page ne défile jamais de côté. En français clair puis en anglais sombre.
// Lancé par run-headless.mjs (groupe Node "mentionFieldsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-mention-fields-mouse.mjs
// MENTION_FIELDS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.MENTION_FIELDS_MOUSE_PORT || 9510);
const SHOTS = process.env.MENTION_FIELDS_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-field-editor-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-email-drafts-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
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

// Centre d'un élément (amené dans la vue), vrai déplacement puis vrai clic.
async function centerOf(selector) {
  return page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return null;
    e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = e.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, onTop: !!top && (top === e || e.contains(top)) };
  }, selector);
}
async function realClick(selector, wait = 300) {
  const c = await centerOf(selector);
  if (!c) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(wait);
  return c;
}
async function realHover(selector) {
  const c = await centerOf(selector);
  if (!c) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 30, c.y + 5, { steps: 3 });
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.waitForTimeout(450);
}
const statusText = () => page.evaluate(() => document.getElementById('status-msg').textContent.trim());

// Les liens mailto: que la page ouvre : captés au clic de l'ancre (phase de capture, avant tout traitement), jamais suivis. À reposer après chaque rechargement de la page.
const installCapture = () => page.evaluate(() => {
  window.__mailtos = [];
  document.addEventListener('click', e => {
    const a = e.target && e.target.closest && e.target.closest('a[href^="mailto:"]');
    if (a) { window.__mailtos.push(a.getAttribute('href')); (window.__mailtoTargets = window.__mailtoTargets || []).push(a.getAttribute('target')); e.preventDefault(); }
  }, true);
});
await installCapture();

// Ce que lit un logiciel de messagerie : « mailto:à?cc=…&subject=…&body=… », chaque valeur décodée.
function readMailto(url) {
  const [head, query = ''] = url.split('?');
  const params = {};
  query.split('&').filter(Boolean).forEach(pair => { const i = pair.indexOf('='); params[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1)); });
  return { to: decodeURIComponent(head.replace(/^mailto:/, '')), cc: params.cc, bcc: params.bcc, subject: params.subject, body: params.body, keys: Object.keys(params) };
}




const SHOT = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };
const tr = (key, vars) => page.evaluate(({ key, vars }) => I18n.t(key, vars), { key, vars });
const contrastOf = (fg, bg) => {
  const lum = css => { const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const EQUIPE = [
  { id: 1, Nom: 'Jean Dupont', Courriel: 'jean.dupont@exemple.fr' },
  { id: 2, Nom: 'Marie Martin', Courriel: 'marie.martin@exemple.fr' },
  { id: 3, Nom: 'Marc Armand', Courriel: 'marc.armand@exemple.fr' },
];
const CONTACTS = [
  { id: 1, Prenom: 'Alice', Responsable: 2, gristHelper_Display: 'Marie Martin' },
  { id: 2, Prenom: 'Bruno', Responsable: 1, gristHelper_Display: 'Jean Dupont' },
];

const boxState = () => page.evaluate(() => {
  const box = document.getElementById('mention-box');
  if (!box) return { exists: false, shown: false };
  const shown = box.style.display !== 'none' && box.getClientRects().length > 0;
  const r = box.getBoundingClientRect();
  const top = shown ? document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20)) : null;
  return {
    exists: true, shown, rows: Array.from(box.querySelectorAll('.ex-item .mention-name')).map(e => e.textContent), status: (box.querySelector('.ex-status') || {}).textContent || '',
    inViewport: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && box.contains(top),
  };
});
const fieldState = id => page.evaluate(fieldId => {
  const host = document.getElementById(fieldId);
  const chips = Array.from(host.querySelectorAll('.mention-chip'));
  // La zone de saisie : la ligne du champ, ou - champ ouvert, texte trop long pour la ligne - son cadre sous la ligne (js/field-editor.js : `unfold`).
  const hr = (host.querySelector('.pp-field-text') || host).getBoundingClientRect();
  return {
    value: host.value, chips: chips.map(c => c.textContent), focused: host.contains(document.activeElement),
    chipsInField: chips.every(c => { const r = c.getBoundingClientRect(); return r.width > 0 && r.left >= hr.left - 0.5 && r.right <= hr.right + 0.5; }),
    // Une pastille plus longue que le champ (une adresse) est coupée par son bord comme tout texte d'une ligne : son début se voit.
    chipsStartInField: chips.every(c => { const r = c.getBoundingClientRect(); return r.width > 0 && r.left >= hr.left - 0.5 && r.left < hr.right - 20; }),
    sideScroll: document.documentElement.scrollWidth > innerWidth + 0.5,
  };
}, id);
const mailtos = () => page.evaluate(() => window.__mailtos.slice());
const pressKey = async (key, wait = 200) => { await page.keyboard.press(key); await page.waitForTimeout(wait); };
const typeSlow = async text => { await page.keyboard.type(text, { delay: 30 }); await page.waitForTimeout(250); };
const clearField = async id => { await realClick('#' + id, 120); await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace'); await page.waitForTimeout(150); };
const barState = () => page.evaluate(() => {
  const bar = Array.from(document.querySelectorAll('.v2-mention-toolbar.visible'))[0];
  if (!bar) return null;
  const r = bar.getBoundingClientRect();
  const linked = bar.querySelector('button[data-action="mention-linked"]');
  const style = bar.querySelector('button[data-action="mention-style"]');
  return {
    inViewport: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, buttons: Array.from(bar.querySelectorAll('button')).filter(b => b.getClientRects().length > 0).length,
    linkedOn: linked.getAttribute('aria-disabled') !== 'true', styleOff: style.getAttribute('aria-disabled') === 'true', styleTitle: style.title,
  };
});

async function run(theme, lang) {
  const T = `${theme}/${lang}`;
  await page.evaluate(async ({ equipe, contacts }) => {
    const stub = window.__gristStub;
    stub.setVariables('Equipe', { Nom: 'Text', Courriel: 'Text' });
    stub.setRows('Equipe', equipe);
    stub.setVariables('Contacts', { Prenom: 'Text', Responsable: 'Ref:Equipe', gristHelper_Display: 'Text' }, null, { Responsable: 'gristHelper_Display' }, { Responsable: 'Nom' });
    stub.setRows('Contacts', contacts);
    await GristAPI.refreshSchema();
    Mention.reset();
    stub.fireRecord(contacts[0], 'Contacts');
  }, { equipe: EQUIPE, contacts: CONTACTS });
  await page.waitForTimeout(300);

  // 1) Un nouvel email à la souris.
  await realHover('#v2-new-template-group #btn-new');
  await realClick('#v2-btn-new-email', 900);
  await page.mouse.move(WIDTH - 20, HEIGHT - 20, { steps: 4 });
  await page.waitForTimeout(400);

  // 2) Une adresse tapée au vrai clavier, caractère par caractère : jamais de liste (la boîte n'existe même pas), du texte brut.
  if (T === 'light/fr') {
    await realClick('#v2-email-to', 150);
    await typeSlow('contact@exemple.fr');
    const to = await fieldState('v2-email-to');
    const never = await boxState();
    check(`${T}, « contact@exemple.fr » tapé dans À : aucune liste (la boîte n’a jamais été créée), texte brut tel quel, aucune pastille`, !never.exists && to.value === 'contact@exemple.fr' && to.chips.length === 0, { never, to });
    await realClick('#v2-email-cc', 150);
    await typeSlow('a@x.fr; b.c@y.fr');
    const cc = await fieldState('v2-email-cc');
    const afterAddresses = await boxState();
    check(`${T}, deux adresses tapées dans Cc (« a@x.fr; b.c@y.fr ») : aucune liste, texte brut tel quel`, !afterAddresses.exists && cc.chips.length === 0 && cc.value === 'a@x.fr; b.c@y.fr', { afterAddresses, cc });
    await typeSlow(', @');
    const lone = await boxState();
    check(`${T}, un « @ » en début de mot (après « , ») est le déclencheur : la liste propose toutes les fiches ; Échap la ferme et le « @ » reste du texte`, lone.shown && lone.rows.length === 5 && lone.inViewport, lone);
    await pressKey('Escape', 250);
    const loneClosed = await fieldState('v2-email-cc');
    check(`${T}, après Échap, « a@x.fr; b.c@y.fr, @ » est intact, sans pastille, liste fermée, focus gardé`, !(await boxState()).shown && loneClosed.value === 'a@x.fr; b.c@y.fr, @' && loneClosed.chips.length === 0 && loneClosed.focused, loneClosed);
    await clearField('v2-email-cc');
  }

  // 3) Un « @ » en début de mot : la liste, dans le panneau, devant tout ; Échap la ferme, le texte reste.
  await realClick('#v2-email-to', 150);
  await pressKey('End', 80);
  await typeSlow(T === 'light/fr' ? ', @Mar' : 'contact@exemple.fr, @Mar');
  const opened = await boxState();
  check(`${T}, « , @Mar » dans À ouvre la liste des fiches (Marc Armand, Marie Martin), toute dans le panneau et devant le reste`, opened.shown && opened.rows.join() === 'Marc Armand,Marie Martin' && opened.inViewport && opened.onTop, opened);
  await SHOT(`${theme}-${lang}-1-liste`);
  await pressKey('Escape', 250);
  const closed = await boxState();
  const kept = await fieldState('v2-email-to');
  check(`${T}, Échap ferme la liste : le texte tapé reste « contact@exemple.fr, @Mar », en texte brut, sans pastille, et le focus reste dans le champ`,
    !closed.shown && kept.value === 'contact@exemple.fr, @Mar' && kept.chips.length === 0 && kept.focused, { closed, kept });
  await typeSlow('ie');
  const still = await boxState();
  check(`${T}, la lettre suivante ne rouvre pas la liste (le texte devient « @Marie »)`, !still.shown && (await fieldState('v2-email-to')).value === 'contact@exemple.fr, @Marie', still);
  await pressKey('Tab', 250);
  const left = await fieldState('v2-email-to');
  check(`${T}, Tab fait sortir du champ (rien n’est resté pris par une liste fermée)`, !left.focused && left.value === 'contact@exemple.fr, @Marie', left);

  // 4) @Mar, flèche bas, Entrée : la pastille de Marie Martin.
  await clearField('v2-email-to');
  await typeSlow('@Mar');
  await pressKey('ArrowDown', 120);
  await pressKey('Enter', 300);
  const chipField = await fieldState('v2-email-to');
  check(`${T}, « @Mar », flèche bas et Entrée posent la pastille « Marie Martin » (entière dans le champ), la liste se ferme et Entrée n’a pas validé le champ`,
    chipField.chips.join() === 'Marie Martin' && chipField.chipsInField && !(await boxState()).shown && chipField.focused && !chipField.sideScroll, chipField);
  const look = await page.evaluate(() => {
    const chip = document.querySelector('#v2-email-to .mention-chip');
    const cs = getComputedStyle(chip);
    const host = document.getElementById('v2-email-to');
    return { color: cs.color, bg: cs.backgroundColor, bgHost: getComputedStyle(host).backgroundColor, before: getComputedStyle(chip, '::before').content };
  });
  check(`${T}, la pastille est violette, précédée de « @ » (dessiné par le CSS), lisible : contraste ${contrastOf(look.color, look.bg).toFixed(2)}`, look.before === '"@"' && contrastOf(look.color, look.bg) >= 4.5, look);
  await SHOT(`${theme}-${lang}-2-pastille`);

  // 5) Un clic sur la pastille : sa barre ; « Autres colonnes de la même fiche » ; « Remplacer » par Courriel.
  await realClick('#v2-email-to .mention-chip', 300);
  const bar = await barState();
  check(`${T}, un clic sur la pastille ouvre sa barre, toute dans le panneau : « Autres colonnes de la même fiche » actif, « Mise en forme conditionnelle » grisé avec la raison d’un champ`,
    !!bar && bar.inViewport && bar.buttons === 2 && bar.linkedOn && bar.styleOff && bar.styleTitle === await tr('varToolbar.styleInField'), bar);
  await SHOT(`${theme}-${lang}-3-barre`);
  await realClick('.v2-mention-toolbar.visible button[data-action="mention-linked"]', 500);
  const win = await page.evaluate(() => {
    const modal = document.getElementById('var-linked-modal');
    if (!modal || modal.style.display === 'none') return null;
    const box = modal.querySelector('.var-modal-box') || modal.firstElementChild;
    const r = box.getBoundingClientRect();
    const row = modal.querySelector('.var-linked-row[data-col="Courriel"]');
    return { inViewport: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, courriel: row ? row.dataset.value : null, replace: !!modal.querySelector('button.var-linked-replace') };
  });
  check(`${T}, la fenêtre « Autres colonnes de la même fiche » tient dans le panneau et lit la ligne de LA fiche (Marie Martin), pas celle de la page`, !!win && win.inViewport && win.courriel === 'marie.martin@exemple.fr' && win.replace, win);
  await realClick('#var-linked-modal .var-linked-row[data-col="Courriel"]', 250);
  await realClick('#var-linked-modal button.var-linked-replace', 500);
  const replaced = await fieldState('v2-email-to');
  await SHOT(`${theme}-${lang}-3b-courriel`);
  check(`${T}, « Remplacer » par Courriel : la pastille lit « marie.martin@exemple.fr » et le champ s’enregistre avec la colonne Courriel`,
    replaced.chips.join() === 'marie.martin@exemple.fr' && /data-mention-column="Courriel"/.test(replaced.value) && replaced.chipsStartInField && !replaced.sideScroll, replaced);

  // 6) L'objet : « Bonjour @Jea » et un clic de souris sur la ligne de la liste.
  await realClick('#v2-email-subject', 150);
  await typeSlow('Bonjour @Jea');
  const subjectList = await boxState();
  check(`${T}, « Bonjour @Jea » dans l’Objet : la liste propose Jean Dupont (avec la table à droite), dans le panneau`, subjectList.shown && subjectList.rows.join() === 'Jean Dupont' && subjectList.inViewport && subjectList.onTop, subjectList);
  await realClick('#mention-box .ex-item', 350);
  await typeSlow(' !');
  const subject = await fieldState('v2-email-subject');
  check(`${T}, un clic sur « Jean Dupont » pose la pastille ; le texte tapé autour reste (« Bonjour », « ! »)`, subject.chips.join() === 'Jean Dupont' && /^<p class="pp-field">Bonjour <span class="mention-chip"/.test(subject.value) && /<\/span> !<\/p>$/.test(subject.value) && !(await boxState()).shown, subject);

  // 7) Une liste sans fiche le dit, Échap la ferme.
  await realClick('#v2-email-cci', 150).catch(() => {});
  await realClick('#v2-email-cc', 150);
  await typeSlow('@zzz');
  const none = await boxState();
  check(`${T}, « @zzz » : la liste dit « ${none.status} » sans ligne, dans le panneau`, none.shown && none.rows.length === 0 && none.status === await tr('mention.none') && none.inViewport, none);
  await pressKey('Escape', 250);
  check(`${T}, Échap ferme cette liste sans ligne, le texte « @zzz » reste`, !(await boxState()).shown && (await fieldState('v2-email-cc')).value === '@zzz');
  await clearField('v2-email-cc');

  // 8) Le résultat : « Créer l'email », puis la Lecture.
  await page.evaluate(() => Editor.setHTML('<p>Bonjour tout le monde</p>'));
  await page.waitForTimeout(500);
  const before = (await mailtos()).length;
  await realClick('#btn-create-email', 900);
  const links = await mailtos();
  const mail = readMailto(links[before] || 'mailto:');
  check(`${T}, « Créer l’email » ouvre le lien mailto: avec l’adresse de la fiche (À) et l’objet « Bonjour Jean Dupont ! »`, links.length === before + 1 && mail.to === 'marie.martin@exemple.fr' && mail.subject === 'Bonjour Jean Dupont !', { links: links.slice(before), mail });
  await realClick('#btn-mode-read', 800);
  const reading = await page.evaluate(() => ({
    to: document.getElementById('v2-email-to').value, subject: document.getElementById('v2-email-subject').value,
    chips: document.querySelectorAll('#v2-email-to .mention-chip, #v2-email-subject .mention-chip').length, bar: document.querySelectorAll('.v2-mention-toolbar.visible').length,
  }));
  check(`${T}, la Lecture écrit « ${reading.to} » et « ${reading.subject} » sans pastille ni barre`, reading.to === 'marie.martin@exemple.fr' && reading.subject === 'Bonjour Jean Dupont !' && reading.chips === 0 && reading.bar === 0, reading);
  await SHOT(`${theme}-${lang}-4-lecture`);
  await realClick('#btn-mode-edit', 800);
  const back = await page.evaluate(() => ({ chips: document.querySelectorAll('#v2-email-to .mention-chip').length + document.querySelectorAll('#v2-email-subject .mention-chip').length }));
  check(`${T}, de retour en édition les deux pastilles sont là`, back.chips === 2, back);
}

async function restartIn(lang) {
  await page.evaluate(next => I18n.storeLang(next), lang);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  await installCapture();
}

await run('light', 'fr');
await restartIn('en');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(250);
await run('dark', 'en');

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
