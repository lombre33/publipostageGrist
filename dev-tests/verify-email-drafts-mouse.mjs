#!/usr/bin/env node
// Les brouillons d'email de toutes les lignes (js/email-drafts.js, bouton « Tous les emails… » du mode Email ; demande d'Antoine du 12/11 : « créer les emails de toute la table d'un coup », choix : ouvrir les
// brouillons par paquets) à 700x400 (le panneau d'Antoine), à la VRAIE souris (page.mouse) et au vrai clavier. Un nouvel email créé par le menu « + », Objet et À avec une bulle (tapés au vrai clavier), un corps
// avec une bulle, une table de 15 lignes dont l'une sans adresse et l'une à l'adresse incorrecte. Le bouton n'existe que dans un modèle email, sur la ligne du bouton « Créer l'email », sans la déborder. Un clic
// prépare les liens (la pastille « Arrêter » est celle de tous les lots) et ouvre la fenêtre « Brouillons d'email » : toute dans le panneau, la liste qui défile sous un titre et des boutons fixes, les deux lignes à
// vérifier en rouge (lisibles : 4,5:1 au moins en clair comme en sombre), « Ouvrir les 10 suivants » qui ouvre dix liens d'un clic - lus comme un logiciel de messagerie les lit : destinataire, objet et corps de CHAQUE
// ligne, la bulle résolue pour cette ligne - puis les trois derniers, « Rien d'autre à ouvrir » et le focus sur « Fermer ». Une ligne à vérifier s'ouvre par son bouton ; « Tout remettre à ouvrir » ; Échap ferme et le
// message d'état dit combien ont été ouverts ; « Créer l'email » (la ligne courante) reste inchangé et le bouton « Tous les emails… » est de nouveau actif. Puis le même parcours en sombre et en anglais.
// Lancé par run-headless.mjs (groupe Node "emailDraftsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-email-drafts-mouse.mjs
// EMAIL_DRAFTS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.EMAIL_DRAFTS_MOUSE_PORT || 9500);
const SHOTS = process.env.EMAIL_DRAFTS_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

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

// 15 lignes : la 3 sans adresse, la 5 à l'adresse incorrecte, la 8 à l'objet très long (il ne doit pas déborder de la fenêtre).
const COUNT = 15;
const rowsFor = () => Array.from({ length: COUNT }, (_, i) => {
  const id = i + 1;
  return { id, Prenom: 'Prénom' + id, Courriel: id === 3 ? '' : id === 5 ? 'marie@' : 'personne' + id + '@exemple.fr' };
});
const FLAGGED = [3, 5];
const OPENABLE = Array.from({ length: COUNT }, (_, i) => i + 1).filter(id => !FLAGGED.includes(id));
const BODY_HTML = '<p>Bonjour ' + `<span class="var-badge" data-table="Contacts" data-column="Prenom" data-key="Contacts.Prenom"></span>` + ',</p><p></p><p>Voici votre relevé.</p><p>Cordialement</p>';
const bodyFor = id => `Bonjour Prénom${id},\n\nVoici votre relevé.\nCordialement`;

// Luminance relative et contraste (WCAG) de deux couleurs « rgb(…) » lues dans la page.
const contrastOf = (fg, bg) => {
  const lum = css => { const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const modalState = () => page.evaluate(() => {
  const modal = document.getElementById('pp-email-drafts-modal');
  if (!modal || modal.style.display === 'none') return null;
  const box = modal.querySelector('.pp-modal-box');
  const body = modal.querySelector('.pp-modal-body');
  const list = modal.querySelector('.pp-email-drafts-list');
  const r = box.getBoundingClientRect();
  const visible = e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.left >= r.left - 0.5 && b.right <= r.right + 0.5 && b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5; };
  const actions = Array.from(modal.querySelectorAll('.var-modal-actions button'));
  const items = Array.from(modal.querySelectorAll('.pp-email-drafts-item'));
  const primary = modal.querySelector('.var-modal-primary');
  return {
    title: document.getElementById('pp-email-drafts-title').textContent,
    inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
    size: [Math.round(r.width), Math.round(r.height)],
    listScrolls: list.scrollHeight > list.clientHeight + 1, listHeight: Math.round(list.clientHeight), headerStays: body.scrollHeight <= body.clientHeight + 1, noSideScroll: body.scrollWidth <= body.clientWidth + 1 && list.scrollWidth <= list.clientWidth + 1,
    actionsInBox: actions.every(visible), openButtonsInBox: Array.from(modal.querySelectorAll('.pp-email-drafts-open')).every(b => { const x = b.getBoundingClientRect(); return x.right <= r.right + 0.5 && x.left >= r.left - 0.5; }),
    intro: modal.querySelector('.pp-email-drafts-intro').textContent, counter: modal.querySelector('.pp-email-drafts-counter').textContent,
    pack: modal.querySelector('.pp-email-drafts-pack-select').value, primary: primary.textContent, primaryDisabled: primary.disabled,
    rows: items.length, flagged: items.filter(li => li.classList.contains('has-issue')).map(li => items.indexOf(li) + 1), opened: items.filter(li => li.classList.contains('is-opened')).length,
    notes: items.map(li => li.querySelector('.pp-email-drafts-note').textContent),
    focusedText: document.activeElement ? document.activeElement.textContent : '',
    issuesNoteShown: !modal.querySelector('.pp-email-drafts-issues').hidden,
  };
});
const waitModal = () => page.waitForFunction(() => { const m = document.getElementById('pp-email-drafts-modal'); return !!m && m.style.display !== 'none'; }, null, { timeout: 30000 });
const mailtos = () => page.evaluate(() => ({ links: window.__mailtos.slice(), targets: (window.__mailtoTargets || []).slice() }));
const tr = (key, vars) => page.evaluate(({ key, vars }) => I18n.t(key, vars), { key, vars });

async function run(theme, lang) {
  const T = `${theme}/${lang}`;
  await page.evaluate(async (rows) => {
    const stub = window.__gristStub;
    stub.setVariables('Contacts', { Prenom: 'Text', Courriel: 'Text' });
    stub.setRows('Contacts', rows);
    await GristAPI.refreshSchema();
    stub.fireRecord(rows[0], 'Contacts');
  }, rowsFor());
  await page.waitForTimeout(300);
  check(`${T}, un modèle qui n’est pas un email : le bouton « Tous les emails… » n’est pas là`, await page.evaluate(() => getComputedStyle(document.getElementById('btn-create-emails')).display === 'none'));

  // 1) Un nouvel email à la souris : le bouton apparaît, sur la ligne de « Créer l'email », dans le panneau.
  await realHover('#v2-new-template-group #btn-new');
  await realClick('#v2-btn-new-email', 900);
  await page.mouse.move(WIDTH - 20, HEIGHT - 20, { steps: 4 });
  await page.waitForTimeout(400);
  const geo = await page.evaluate(() => {
    const one = document.getElementById('btn-create-email').getBoundingClientRect();
    const all = document.getElementById('btn-create-emails');
    const r = all.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { shown: getComputedStyle(all).display !== 'none', text: all.textContent.trim(), aria: all.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height), oneH: Math.round(one.height),
      sameRow: Math.abs(r.top - one.top) < 4 && Math.abs(r.height - one.height) < 3, noOverlap: r.left >= one.right - 0.5 || r.right <= one.left + 0.5, inViewport: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === all || all.contains(top)), scrollW: document.documentElement.scrollWidth <= innerWidth + 0.5, enabled: !all.disabled };
  });
  check(`${T}, nouvel email : « ${geo.text} » est affiché, actif, sur la ligne de « Créer l’email » sans la recouvrir, dans le panneau`, geo.shown && geo.enabled && geo.sameRow && geo.noOverlap && geo.inViewport && geo.onTop && geo.scrollW && geo.text === await tr('email.createAllButton'), geo);
  check(`${T}, le bouton a un nom accessible qui dit « un brouillon par ligne »`, geo.aria === await tr('email.createAllAria'), geo.aria);

  // 2) Objet et destinataire avec une bulle, tapés au vrai clavier ; le corps avec une bulle.
  await realClick('#v2-email-subject', 150);
  await page.keyboard.type('Relevé de ');
  await page.keyboard.type('#Contacts.Pren');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  await realClick('#v2-email-to', 150);
  await page.keyboard.type('#Contacts.Cour');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  await page.evaluate(html => Editor.setHTML(html), BODY_HTML);
  await page.waitForTimeout(900);
  const fields = await page.evaluate(() => ['v2-email-subject', 'v2-email-to'].map(id => document.getElementById(id).querySelectorAll('.var-badge').length));
  check(`${T}, l’Objet et le destinataire portent chacun une bulle (posée au vrai clavier)`, fields.join() === '1,1', fields);

  // 3) Le vrai clic : la fenêtre « Brouillons d'email ».
  await realClick('#btn-create-emails', 200);
  await waitModal();
  await page.waitForTimeout(300);
  const open = await modalState();
  check(`${T}, la fenêtre s’ouvre : « ${open && open.title} », ${COUNT} lignes, toute dans le panneau, boutons dans le cadre, la liste seule défile (au moins deux lignes visibles), rien ne défile de côté`, !!open && open.title === await tr('emailDrafts.title') && open.rows === COUNT && open.inViewport && open.actionsInBox && open.openButtonsInBox && open.listScrolls && open.headerStays && open.listHeight >= 90 && open.noSideScroll, open);
  check(`${T}, la phrase dit ${COUNT} brouillons ; les lignes 3 et 5 sont à vérifier (aucun destinataire, adresse incorrecte), la note rouge est montrée`, !!open && open.intro === await tr('emailDrafts.intro', { n: COUNT }) && JSON.stringify(open.flagged) === JSON.stringify(FLAGGED)
    && open.notes[2] === await tr('emailDrafts.issue.noRecipient') && open.notes[4] === await tr('emailDrafts.issue.badAddress', { address: 'marie@' }) && open.issuesNoteShown, open && { intro: open.intro, flagged: open.flagged, notes: [open.notes[2], open.notes[4]] });
  check(`${T}, 10 brouillons par clic au départ, « ${open && open.primary} », rien d’ouvert encore`, !!open && open.pack === '10' && open.primary === await tr('emailDrafts.next', { n: 10 }) && open.counter === await tr('emailDrafts.counter', { opened: 0, total: COUNT }) && !open.primaryDisabled, open && { pack: open.pack, primary: open.primary, counter: open.counter });
  const colors = await page.evaluate(() => {
    const note = document.querySelectorAll('.pp-email-drafts-item.has-issue .pp-email-drafts-note')[0];
    const muted = document.querySelector('.pp-email-drafts-hint');
    const bg = getComputedStyle(document.querySelector('#pp-email-drafts-modal .pp-modal-box')).backgroundColor;
    return { issue: getComputedStyle(note).color, hint: getComputedStyle(muted).color, subject: getComputedStyle(document.querySelector('.pp-email-drafts-subject')).color, bg };
  });
  const ratios = { issue: contrastOf(colors.issue, colors.bg), hint: contrastOf(colors.hint, colors.bg), subject: contrastOf(colors.subject, colors.bg) };
  check(`${T}, les textes sont lisibles (4,5:1 au moins) : ligne à vérifier ${ratios.issue.toFixed(2)}, aide ${ratios.hint.toFixed(2)}, objet ${ratios.subject.toFixed(2)}`, Object.values(ratios).every(r => r >= 4.5), { colors, ratios });
  await SHOT(`${theme}-${lang}-1-fenetre`);

  // 4) « Ouvrir les 10 suivants » : dix liens, lus comme un logiciel de messagerie les lit, chacun avec SA ligne.
  await realClick('#pp-email-drafts-modal .var-modal-primary', 400);
  const first = await mailtos();
  const firstIds = OPENABLE.slice(0, 10);
  const first10 = first.links.map(readMailto);
  check(`${T}, un clic ouvre dix liens mailto:, un nouvel onglet chacun`, first.links.length === 10 && first.targets.length === 10 && first.targets.every(t => t === '_blank'), { n: first.links.length, targets: first.targets });
  check(`${T}, ce sont les lignes ${firstIds.join(', ')} dans l’ordre (les lignes 3 et 5 sautées) : destinataire, objet et corps de CHAQUE ligne, la bulle résolue pour elle`,
    first10.length === 10 && first10.every((m, i) => m.to === `personne${firstIds[i]}@exemple.fr` && m.subject === `Relevé de Prénom${firstIds[i]}` && (m.body || '').replace(/\r\n/g, '\n') === bodyFor(firstIds[i])), first10.map(m => [m.to, m.subject]));
  const afterFirst = await modalState();
  const rest = OPENABLE.length - 10;
  check(`${T}, le compteur dit 10 ouverts sur ${COUNT}, ces dix lignes sont marquées, le bouton propose les ${rest} suivants`, afterFirst.counter === await tr('emailDrafts.counter', { opened: 10, total: COUNT }) && afterFirst.opened === 10 && afterFirst.primary === await tr('emailDrafts.next', { n: rest }), afterFirst);
  await realClick('#pp-email-drafts-modal .var-modal-primary', 400);
  const second = await mailtos();
  const lastIds = OPENABLE.slice(10);
  check(`${T}, le clic suivant ouvre les ${rest} derniers (lignes ${lastIds.join(', ')}), sans les lignes à vérifier`, second.links.length === 10 + rest && second.links.slice(10).map(readMailto).every((m, i) => m.to === `personne${lastIds[i]}@exemple.fr` && m.subject === `Relevé de Prénom${lastIds[i]}`), second.links.slice(10));
  const done = await modalState();
  check(`${T}, « ${done.primary} » est grisé et le clavier est sur « Fermer »`, done.primaryDisabled && done.primary === await tr('emailDrafts.nextNone') && done.focusedText === await tr('common.close'), { primary: done.primary, focused: done.focusedText });

  // 5) Une ligne à vérifier s'ouvre par son bouton ; « Tout remettre à ouvrir » ; une ligne rouverte.
  await realClick('#pp-email-drafts-modal .pp-email-drafts-item:nth-child(3) .pp-email-drafts-open', 300);
  const third = await mailtos();
  const noRecipient = readMailto(third.links[third.links.length - 1] || 'mailto:');
  check(`${T}, la ligne 3 (sans adresse) s’ouvre par son bouton : un brouillon sans destinataire, l’objet de la ligne`, third.links.length === second.links.length + 1 && noRecipient.to === '' && noRecipient.subject === 'Relevé de Prénom3', noRecipient);
  const allOpened = await modalState();
  check(`${T}, ${COUNT - 1} ouvertes sur ${COUNT} (la ligne 5 reste à vérifier) et son bouton dit « Rouvrir » pour la ligne 3`, allOpened.counter === await tr('emailDrafts.counter', { opened: COUNT - 1, total: COUNT }) && await page.evaluate(() => document.querySelector('#pp-email-drafts-modal .pp-email-drafts-item:nth-child(3) .pp-email-drafts-open').textContent) === await tr('emailDrafts.reopen'), allOpened.counter);
  await SHOT(`${theme}-${lang}-2-tout-ouvert`);
  await realClick('#pp-email-drafts-modal .var-modal-actions button:first-child', 300);
  const reset = await modalState();
  check(`${T}, « Tout remettre à ouvrir » : plus rien de marqué, le bouton propose de nouveau ${Math.min(10, OPENABLE.length)} brouillons`, reset.opened === 0 && reset.counter === await tr('emailDrafts.counter', { opened: 0, total: COUNT }) && !reset.primaryDisabled && reset.primary === await tr('emailDrafts.next', { n: 10 }), reset);

  // 6) Un paquet de 1 : le réglage de la fenêtre (liste déroulante, au clavier), un lien par clic.
  await page.focus('#pp-email-drafts-modal .pp-email-drafts-pack-select');
  await page.keyboard.press('Home');
  await page.waitForTimeout(150);
  const one = await modalState();
  check(`${T}, le réglage passe à 1 au clavier : « ${one.primary} »`, one.pack === '1' && one.primary === await tr('emailDrafts.next', { n: 1 }), { pack: one.pack, primary: one.primary });
  const before = (await mailtos()).links.length;
  await realClick('#pp-email-drafts-modal .var-modal-primary', 300);
  const afterOne = await mailtos();
  check(`${T}, un clic n’ouvre alors qu’un lien (la ligne 1)`, afterOne.links.length === before + 1 && readMailto(afterOne.links[before]).to === 'personne1@exemple.fr', afterOne.links.length - before);
  await SHOT(`${theme}-${lang}-3-un-par-clic`);

  // 7) Échap ferme ; l'état dit combien ; « Créer l'email » et « Tous les emails… » sont de nouveau actifs.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const gone = await modalState();
  const status = await statusText();
  check(`${T}, Échap ferme la fenêtre et le message d’état dit « ${status} »`, gone === null && status === await tr('status.emailDraftsOpened', { opened: 1, total: COUNT }), { gone: gone === null, status });
  check(`${T}, les deux boutons d’email sont de nouveau actifs, et « Créer l’email » écrit toujours la ligne courante`, await page.evaluate(() => !document.getElementById('btn-create-email').disabled && !document.getElementById('btn-create-emails').disabled));
  const keep = (await mailtos()).links.length;
  await realClick('#btn-create-email', 900);
  const single = await mailtos();
  const one1 = readMailto(single.links[keep] || 'mailto:');
  check(`${T}, « Créer l’email » ouvre un seul lien pour la ligne courante (inchangé)`, single.links.length === keep + 1 && one1.to === 'personne1@exemple.fr' && one1.subject === 'Relevé de Prénom1' && (one1.body || '').replace(/\r\n/g, '\n') === bodyFor(1), one1);

  // 8) La progression est gardée : rouvrir « Tous les emails… » retrouve la ligne 1 déjà ouverte.
  await realClick('#btn-create-emails', 200);
  await waitModal();
  await page.waitForTimeout(300);
  const again = await modalState();
  check(`${T}, rouvrir la fenêtre retrouve la ligne déjà ouverte (1 sur ${COUNT}) et le réglage « 1 »`, again.opened === 1 && again.pack === '1' && again.counter === await tr('emailDrafts.counter', { opened: 1, total: COUNT }), again);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
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
const english = await page.evaluate(() => [I18n.t('emailDrafts.title'), I18n.t('email.createAllButton'), I18n.t('emailDrafts.next', { n: 3 }), I18n.t('emailDrafts.intro', { n: 1 })]);
check('anglais : titre, bouton, « Open the next 3 », phrase au singulier', JSON.stringify(english) === JSON.stringify(['Email drafts', 'All emails…', 'Open the next 3', '1 draft is ready, for you to check and send.']), english);

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
