#!/usr/bin/env node
// L'aide « L'email ne s'ouvre pas ? » (js/mail-help.js, css/mail-help.css) et l'option « Webmail Zimbra » (js/mailto-export.js, Réglages > Email) : demande d'Antoine du 27/11 (des collègues sous Chrome, hors du Windows
// préparé par la DSI, n'ouvrent pas les liens d'email ; leur messagerie est un webmail Zimbra). Dans le vrai widget (faux Grist), à 700x400, à la VRAIE souris (page.mouse) et au VRAI clavier, en clair puis en sombre,
// puis en anglais :
//  1) le « ? » n'existe que dans un modèle email, à droite de « Créer l'email » et avant « Tous les emails… », carré de 28 px, sans faire déborder la barre ;
//  2) un clic l'ouvre : la fenêtre tient dans le panneau, « Fermer » reste en bas, rien d'autre que la question tant qu'elle n'est pas répondue, puis les étapes du cas, la capture de Chrome qui s'agrandit d'un clic ;
//  3) l'encadré Zimbra mène à Réglages > Email ; le champ de l'adresse s'y remplit au clavier et se normalise ; le lien « Voir l'aide » ouvre l'aide PAR-DESSUS Réglages, qui reste ouvert dessous ;
//  4) « Créer l'email » avec « Webmail Zimbra » ouvre le brouillon dans l'onglet du webmail et le coin d'état le dit ;
//  5) la fenêtre « Email trop long » porte le lien « Que faire d'un email trop long ? » : il ouvre l'aide sur son encadré de la longueur, par-dessus la fenêtre, qui reste posée.
// Lancé par run-headless.mjs (groupe Node "mailHelpMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-mail-help-mouse.mjs
// MAIL_HELP_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil), MAIL_HELP_SCALE=2 pour des captures nettes ; sans la première, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.MAIL_HELP_PORT || 9752);
const SHOTS = process.env.MAIL_HELP_SHOTS || '';
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

const OFFLINE = existsSync(join(CACHE, 'umd'));
const UMD_ROUTES = OFFLINE ? [
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/vfs_fonts\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@[\d.]+\/dist\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-mail-help-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: Number(process.env.MAIL_HELP_SCALE || 1) });
const page = await context.newPage();
const pageErrors = [];
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

await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.getElementById('status-msg');
  return !!el && /prêt|ready/i.test(el.textContent || '');
}, null, { timeout: 90000 });

const nativeDialogs = [];
page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });

async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const statusText = () => page.evaluate(() => document.getElementById('status-msg').textContent);
const tr = (key, params) => page.evaluate(({ key, params }) => I18n.t(key, params), { key, params });
const isShown = id => page.evaluate(sel => { const e = document.getElementById(sel); return !!e && e.style.display !== 'none' && getComputedStyle(e).display !== 'none'; }, id);

async function centerOf(selector) {
  return page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return null;
    e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = e.getBoundingClientRect();
    const left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth), top0 = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
    const x = (left + right) / 2, y = (top0 + bottom) / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, onTop: !!top && (top === e || e.contains(top)) };
  }, selector);
}
async function realClick(selector, wait = 300) {
  const c = await centerOf(selector);
  if (!c) throw new Error('introuvable : ' + selector);
  if (!c.onTop) throw new Error('recouvert : ' + selector);
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

// Ce que la fenêtre d'aide montre : titre, tient-elle dans le panneau, « Fermer » dedans, étapes, encadrés, la capture, les deux listes.
const helpState = () => page.evaluate(() => {
  const ov = document.getElementById('pp-mail-help-modal');
  if (!ov || ov.style.display === 'none') return { open: false };
  const box = ov.querySelector('.modal-content').getBoundingClientRect();
  const body = ov.querySelector('.pp-modal-body');
  const close = document.getElementById('pp-mail-help-close').getBoundingClientRect();
  const shot = ov.querySelector('.mail-help-shot img');
  const shotRect = shot ? shot.getBoundingClientRect() : null;
  return {
    open: true,
    title: ov.querySelector('h3').textContent,
    boxInPanel: box.left >= 0 && box.top >= 0 && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5,
    closeInBox: close.top >= box.top && close.bottom <= box.bottom + 0.5 && close.left >= box.left && close.right <= box.right + 0.5,
    closeTop: Math.round(close.top),
    steps: Array.from(ov.querySelectorAll('.mail-help-step')).map(li => li.dataset.step),
    pick: !!ov.querySelector('.mail-help-pick'),
    cards: Array.from(ov.querySelectorAll('.mail-help-card')).map(c => c.id.replace('pp-mail-help-', '')),
    scrolls: body.scrollHeight > body.clientHeight + 1,
    bodyScroll: Math.round(body.scrollTop),
    shot: shot ? { loaded: shot.complete && shot.naturalWidth > 0, natural: shot.naturalWidth, width: Math.round(shotRect.width), src: shot.getAttribute('src') } : null,
    overflowX: body.scrollWidth > body.clientWidth + 1,
  };
});
const settingsOpen = () => page.evaluate(() => document.getElementById('settings-modal').style.display === 'flex');
const activeTab = () => page.evaluate(() => (document.querySelector('#settings-modal .settings-tab.active') || {}).dataset?.settingsTab);
const toolbarGeometry = () => page.evaluate(() => {
  const r = id => { const e = document.getElementById(id); if (!e) return null; const q = e.getBoundingClientRect(); return { shown: e.getClientRects().length > 0, left: Math.round(q.left), right: Math.round(q.right), top: Math.round(q.top), width: Math.round(q.width), height: Math.round(q.height) }; };
  return { create: r('btn-create-email'), help: r('btn-mail-help'), all: r('btn-create-emails'), pageOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
});
// Un clic de la vraie souris sur un élément déjà à l'écran, sans le faire défiler (la fenêtre est celle qui défile).
async function clickInBody(selector, wait = 250) {
  await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center' }), selector);
  await page.waitForTimeout(120);
  return realClick(selector, wait);
}

// Des données à la portée de l'email : une table, une ligne courante.
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('Contacts', { Prenom: 'Text' });
  stub.setRows('Contacts', [{ id: 1, Prenom: 'Marie' }]);
  await GristAPI.refreshSchema();
  stub.fireRecord({ id: 1, Prenom: 'Marie' }, 'Contacts');
});
await page.waitForTimeout(300);

// 1) Un modèle document : pas de « ? ».
const documentGeometry = await toolbarGeometry();
check('un modèle document : ni « Créer l’email » ni le « ? » ne sont montrés', documentGeometry.create && !documentGeometry.create.shown && documentGeometry.help && !documentGeometry.help.shown, documentGeometry);

await realHover('#v2-new-template-group #btn-new');
await realClick('#v2-btn-new-email', 900);
await realClick('#v2-email-subject', 150);
await page.keyboard.type('Relance');
await realClick('#v2-email-to', 150);
await page.keyboard.type('marie.dupont@exemple.fr');
const SHORT = '<p>Bonjour Marie, voici la relance.</p>';
await page.evaluate(html => Editor.setHTML(html), SHORT);
await page.waitForTimeout(700);
// Les liens ne partent nulle part : on compte ceux que le widget ouvrirait, avec leur cible (le vrai openLink tourne, seul le clic de l'ancre est capté).
await page.evaluate(() => {
  window.__opened = [];
  HTMLAnchorElement.prototype.click = function () { window.__opened.push({ href: this.getAttribute('href'), target: this.target, rel: this.rel }); };
});

async function run(T) {
  const geometry = await toolbarGeometry();
  const g = geometry;
  check(`${T}, modèle email : le « ? » est à droite de « Créer l’email » et avant « Tous les emails… », carré de 28 px, tout dans le panneau 700×400, la page ne défile pas de côté`,
    g.help && g.help.shown && g.create.shown && g.all.shown && g.create.right <= g.help.left + 1 && g.help.right <= g.all.left + 1 && g.help.width === 28 && g.help.height === 28 && g.all.right <= 700 && !g.pageOverflow && Math.abs(g.help.top - g.create.top) <= 2, g);
  const label = await page.evaluate(() => { const b = document.getElementById('btn-mail-help'); return { aria: b.getAttribute('aria-label'), tip: b.getAttribute('data-tip') }; });
  check(`${T}, le « ? » a son nom (aria-label) et son info-bulle : « ${await tr('mailHelp.buttonTip')} »`, label.aria === await tr('mailHelp.buttonTip') && label.tip === label.aria, label);
  await snap(`${T}-1-barre`);
  await realHover('#btn-mail-help');
  await snap(`${T}-1-barre-survol`);

  // 2) La fenêtre.
  await page.evaluate(() => { PersonStore.remove('pp_mail_help'); MailHelp.setKind(''); });
  await realClick('#btn-mail-help', 450);
  let s = await helpState();
  check(`${T}, un clic sur le « ? » ouvre l’aide « ${await tr('mailHelp.title')} », entière dans le panneau, « Fermer » dans la fenêtre`, s.open && s.title === await tr('mailHelp.title') && s.boxInPanel && s.closeInBox, s);
  check(`${T}, sans réponse : la question et l’invitation à choisir, aucune étape, les deux encadrés de tous, pas de défilement de côté`, s.pick && s.steps.length === 0 && s.cards.join(',') === 'attachments,length' && !s.overflowX, s);
  await snap(`${T}-2-aide-sans-reponse`);
  await clickInBody('#pp-mail-help-kind-webmail', 300);
  s = await helpState();
  const detected = await page.evaluate(() => MailHelp.detect());
  check(`${T}, un clic sur « webmail » affiche les étapes du poste détecté (${detected.os}, ${detected.browser}) et l’encadré Zimbra`, !s.pick && s.steps.length >= 1 && s.cards.includes('zimbra') && s.steps.join() === (await page.evaluate(() => MailHelp.stepsFor('webmail', MailHelp.detect().os, MailHelp.detect().browser).join())), { s, detected });
  // Le cas de Windows + Chrome, avec la capture : les deux listes se corrigent (choix par le clavier de la liste native).
  await page.selectOption('#pp-mail-help-os', 'windows');
  await page.selectOption('#pp-mail-help-browser', 'chrome');
  await page.waitForTimeout(300);
  s = await helpState();
  check(`${T}, Windows + Chrome : « winMailto » puis « chrome », la capture se charge (${s.shot ? s.shot.natural : '?'} px de large, dans la langue de la page), les repères restent écrits`,
    s.steps.join() === 'winMailto,chrome' && !!s.shot && s.shot.loaded && s.shot.natural === 1414 && new RegExp('-chrome\\.png').test(s.shot.src) && /mail-help\/(fr|en)-chrome/.test(s.shot.src), s);
  await page.evaluate(() => document.querySelector('.mail-help-step[data-step="chrome"] .mail-help-shot').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  await snap(`${T}-2-aide-windows-chrome`);
  const before = (await helpState()).shot.width;
  await realClick('.mail-help-step[data-step="chrome"] .mail-help-shot', 300);
  s = await helpState();
  const zoomed = await page.evaluate(() => document.querySelector('.mail-help-step[data-step="chrome"]').classList.contains('is-zoomed'));
  check(`${T}, un clic sur la capture l’agrandit (${before} px → ${s.shot.width} px, jamais plus large que la fenêtre), un second la rétrécit`, zoomed && s.shot.width > before && !s.overflowX, { before, s });
  await snap(`${T}-2-aide-capture-agrandie`);
  await realClick('.mail-help-step[data-step="chrome"] .mail-help-shot', 250);
  const unzoomed = await page.evaluate(() => !document.querySelector('.mail-help-step[data-step="chrome"]').classList.contains('is-zoomed'));
  check(`${T}, le second clic rétrécit la capture`, unzoomed, unzoomed);
  // Le défilement : « Fermer » ne bouge pas, les encadrés se lisent.
  const closeBefore = (await helpState()).closeTop;
  const bodyBox = await page.evaluate(() => { const r = document.querySelector('#pp-mail-help-modal .pp-modal-body').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(30, r.height / 2) }; });
  await page.mouse.move(bodyBox.x, bodyBox.y, { steps: 3 });
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);
  s = await helpState();
  const lastCard = await page.evaluate(() => { const c = document.getElementById('pp-mail-help-length'); const b = document.querySelector('#pp-mail-help-modal .pp-modal-body').getBoundingClientRect(); const r = c.getBoundingClientRect(); return { inside: r.bottom <= b.bottom + 1 && r.top >= b.top }; });
  check(`${T}, la molette fait défiler le contenu jusqu’au dernier encadré, « Fermer » ne bouge pas (${closeBefore} → ${s.closeTop})`, s.scrolls && s.bodyScroll > 0 && lastCard.inside && s.closeTop === closeBefore, { s, lastCard });
  await snap(`${T}-2-aide-en-bas`);
  // « logiciel » : ni encadré Zimbra, ni la capture de Chrome (étapes d'un logiciel installé).
  await page.evaluate(() => document.querySelector('#pp-mail-help-modal .pp-modal-body').scrollTo(0, 0));
  await clickInBody('#pp-mail-help-kind-software', 300);
  s = await helpState();
  check(`${T}, un clic sur « logiciel » : « winSoftware » puis « browserAsk », plus d’encadré Zimbra`, s.steps.join() === 'winSoftware,browserAsk' && !s.cards.includes('zimbra'), s);
  await snap(`${T}-2-aide-logiciel`);
  await clickInBody('#pp-mail-help-kind-webmail', 300);
  // Échap ferme ; la réponse reste retenue.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check(`${T}, Échap ferme l’aide ; la réponse « webmail » est retenue pour la prochaine fois`, !(await helpState()).open && await page.evaluate(() => MailHelp.getKind() === 'webmail'), await helpState());

  // 3) De l'aide à Réglages > Email : l'encadré Zimbra.
  await realClick('#btn-mail-help', 450);
  await clickInBody('#pp-mail-help-zimbra-button', 450);
  check(`${T}, le bouton de l’encadré Zimbra ferme l’aide et ouvre Réglages sur l’onglet Email`, !(await helpState()).open && await settingsOpen() && await activeTab() === 'mailClient', { help: await helpState(), tab: await activeTab() });
  await page.evaluate(() => { MailtoExport.setMailClient('standard'); MailtoExport.setZimbraUrl(''); });
  await page.evaluate(() => document.querySelector('#settings-modal .settings-tab[data-settings-tab="language"]').click());
  await page.evaluate(() => document.querySelector('#settings-modal .settings-tab[data-settings-tab="mailClient"]').click());
  await page.waitForTimeout(150);
  await clickInBody('input[name="settings-mail-client"][value="zimbraWeb"]', 300);
  const field = await page.evaluate(() => { const i = document.getElementById('settings-zimbra-url'); const r = i.getBoundingClientRect(); const m = document.querySelector('#settings-modal .modal-content').getBoundingClientRect(); return { disabled: i.disabled, focused: document.activeElement === i, inModal: r.left >= m.left && r.right <= m.right, state: document.getElementById('settings-zimbra-url-state').textContent }; });
  check(`${T}, Réglages > Email : « Webmail Zimbra » choisi à la souris : le champ de l’adresse prend le focus, entier dans la fenêtre, avec sa phrase « adresse manquante »`, !field.disabled && field.focused && field.inModal && field.state === await tr('settings.mailClient.zimbraWebUrl.missing'), field);
  await page.keyboard.type('zimbra.exemple.fr/?x=1');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  const typed = await page.evaluate(() => ({ value: document.getElementById('settings-zimbra-url').value, kept: MailtoExport.getZimbraUrl(), stateHidden: document.getElementById('settings-zimbra-url-state').hidden }));
  check(`${T}, l’adresse tapée au clavier est retenue sous sa forme normalisée (« https://zimbra.exemple.fr/ »), plus de phrase d’erreur`, typed.kept === 'https://zimbra.exemple.fr/' && typed.value === typed.kept && typed.stateHidden, typed);
  await page.evaluate(() => document.getElementById('settings-zimbra-url').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  await snap(`${T}-3-reglages-zimbra`);
  // Le lien « Voir l'aide » : l'aide s'ouvre PAR-DESSUS Réglages, qui reste ouvert dessous.
  await clickInBody('#settings-mail-help', 450);
  s = await helpState();
  const onTop = await page.evaluate(() => { const b = document.querySelector('#pp-mail-help-modal .modal-content').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + 20); return !!e && !!e.closest('#pp-mail-help-modal'); });
  check(`${T}, le lien « ${await tr('settings.mailClient.help')} » de Réglages ouvre l’aide par-dessus Réglages, qui reste ouvert dessous`, s.open && onTop && await settingsOpen(), { s, onTop });
  await snap(`${T}-3-aide-par-dessus-reglages`);
  await realClick('#pp-mail-help-close', 300);
  check(`${T}, « Fermer » referme l’aide seule : Réglages est toujours là, le focus est revenu sur le lien d’aide`, !(await helpState()).open && await settingsOpen() && await page.evaluate(() => document.activeElement.id === 'settings-mail-help'), await page.evaluate(() => document.activeElement.id));
  await realClick('#settings-close', 300);

  // 4) « Créer l'email » avec « Webmail Zimbra ».
  await page.evaluate(() => { window.__opened.length = 0; document.getElementById('status-msg').textContent = ''; });
  await realClick('#btn-create-email', 800);
  const opened = await page.evaluate(() => window.__opened.slice());
  check(`${T}, « Créer l’email » avec « Webmail Zimbra » : le brouillon s’ouvre à l’adresse du Zimbra, en rédaction, dans un nouvel onglet`, opened.length === 1 && opened[0].href.startsWith('https://zimbra.exemple.fr/?view=compose&to=mailto%3Amarie.dupont%2540exemple.fr') && opened[0].target === '_blank' && /noopener/.test(opened[0].rel), opened);
  check(`${T}, le coin d’état dit que le webmail s’ouvre dans un nouvel onglet`, await statusText() === await tr('status.emailCreatedWebmail'), await statusText());
  // Sans adresse : le lien s'ouvre comme celui de Zimbra et le coin d'état le dit.
  await page.evaluate(() => { MailtoExport.setZimbraUrl(''); window.__opened.length = 0; });
  await realClick('#btn-create-email', 800);
  const bare = await page.evaluate(() => window.__opened.slice());
  check(`${T}, « Webmail Zimbra » sans adresse : le lien mailto: s’ouvre comme avec « Zimbra », le coin d’état demande l’adresse`, bare.length === 1 && bare[0].href.startsWith('mailto:marie.dupont%40exemple.fr') && await statusText() === await tr('status.emailCreatedWebmailNoUrl'), { bare, status: await statusText() });
  await page.evaluate(() => { MailtoExport.setMailClient('standard'); });

  // 5) La fenêtre « Email trop long » et son lien d'aide.
  await page.evaluate(() => { Editor.setHTML('<p>' + 'texte de l’email '.repeat(160) + '</p>'); MailtoExport.setLengthWarning(true); window.__opened.length = 0; });
  await page.waitForTimeout(900);
  await realClick('#btn-create-email', 700);
  const dialog = await page.evaluate(() => { const ov = document.getElementById('pp-dialog-modal'); const h = document.getElementById('pp-dialog-help'); const b = ov.querySelector('.modal-content').getBoundingClientRect(); const r = h.getBoundingClientRect(); return { open: ov.style.display !== 'none', shown: !h.hidden && r.width > 0, text: h.textContent, inBox: r.left >= b.left && r.right <= b.right && r.top >= b.top && r.bottom <= b.bottom, inPanel: r.right <= innerWidth && r.bottom <= innerHeight }; });
  check(`${T}, la fenêtre « Email trop long » porte le lien « ${await tr('dialog.emailTooLong.help')} », entier dans la fenêtre et le panneau`, dialog.open && dialog.shown && dialog.text === await tr('dialog.emailTooLong.help') && dialog.inBox && dialog.inPanel, dialog);
  await snap(`${T}-5-email-trop-long`);
  await realClick('#pp-dialog-help', 500);
  s = await helpState();
  const lengthInView = await page.evaluate(() => { const c = document.getElementById('pp-mail-help-length'); const b = document.querySelector('#pp-mail-help-modal .pp-modal-body').getBoundingClientRect(); const r = c.getBoundingClientRect(); return { top: Math.round(r.top - b.top), visible: r.top >= b.top - 1 && r.top < b.bottom - 20 }; });
  check(`${T}, le lien ouvre l’aide sur l’encadré « Email trop long », par-dessus la fenêtre qui reste posée`, s.open && lengthInView.visible && await isShown('pp-dialog-modal'), { s, lengthInView });
  await snap(`${T}-5-aide-longueur`);
  await realClick('#pp-mail-help-close', 300);
  const stillAsking = await isShown('pp-dialog-modal');
  check(`${T}, « Fermer » referme l’aide : la question « Email trop long » est toujours posée, rien n’a été ouvert`, stillAsking && (await page.evaluate(() => window.__opened.length)) === 0, { stillAsking });
  await page.evaluate(() => Array.from(document.querySelectorAll('#pp-dialog-modal .pp-modal-actions button')).find(b => !b.hidden && /Annuler|Cancel/.test(b.textContent)).click());
  await page.waitForTimeout(250);
  await page.evaluate(html => Editor.setHTML(html), SHORT);
  // La jauge de la barre se remet à jour avec la messagerie (main-live.js : `pp:mailClientChanged`) ; sans cela elle garderait la mesure du texte long et son avertissement, qui fait passer « Tous les emails… » à la ligne.
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('pp:mailClientChanged')));
  await page.waitForTimeout(900);
}

await run('clair');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(150);
await run('sombre');
await page.evaluate(() => { Settings.setTheme('light'); I18n.setLang('en'); });
await page.waitForTimeout(300);
// En anglais : la fenêtre se construit à l'ouverture (ses textes viennent de I18n.t) ; la barre et Réglages gardent leurs textes statiques (la page ne se traduit qu'au chargement : la suite « mailHelp » joue la page qui démarre en anglais).
await page.evaluate(() => { PersonStore.remove('pp_mail_help'); MailHelp.setKind(''); });
await realClick('#btn-mail-help', 450);
let en = await helpState();
check('anglais, l’aide s’ouvre : « The email does not open? », entière dans le panneau', en.open && en.title === 'The email does not open?' && en.boxInPanel && en.closeInBox, en);
await clickInBody('#pp-mail-help-kind-webmail', 300);
await page.selectOption('#pp-mail-help-os', 'windows');
await page.selectOption('#pp-mail-help-browser', 'chrome');
await page.waitForTimeout(300);
en = await helpState();
check('anglais, Windows + Chrome : les deux étapes et la capture en anglais (en-chrome.png)', en.steps.join() === 'winMailto,chrome' && !!en.shot && en.shot.loaded && /mail-help\/en-chrome\.png/.test(en.shot.src), en);
await page.evaluate(() => document.querySelector('.mail-help-step[data-step="chrome"] .mail-help-shot').scrollIntoView({ block: 'center' }));
await page.waitForTimeout(200);
await snap('en-2-aide-windows-chrome');
const englishText = await page.evaluate(() => document.getElementById('pp-mail-help-modal').textContent);
check('anglais, aucune clé brute ni mot français dans la fenêtre', !/mailHelp\./.test(englishText) && !/Étape|Où lisez|Fermer|ouvrez/.test(englishText), englishText.slice(0, 200));
await realClick('#pp-mail-help-close', 300);
await page.evaluate(() => { I18n.setLang('fr'); PersonStore.remove('pp_mail_help'); MailHelp.setKind(''); });

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
