#!/usr/bin/env node
// « Ne plus afficher » sur la fenêtre « Email trop long » (js/main-export.js:onCreateEmail, Dialogs.confirmWithCheckbox, MailtoExport.getLengthWarning, case de Réglages > Email) :
// demande d'Antoine du 27/11 (« possible d'avoir un "ne plus afficher" sur cette pop-up ? »). Dans le vrai widget (faux Grist), à 700x400, à la VRAIE souris (page.mouse) et au VRAI
// clavier, en clair puis en sombre, puis en anglais :
//  1) la fenêtre porte une case « Ne plus afficher cet avertissement », décochée à l'ouverture, entière dans le panneau, atteignable à Tab (Maj+Tab depuis « Continuer ») et cochable à Espace ;
//  2) cochée puis « Annuler » : rien n'est ouvert et rien n'est retenu (la fenêtre se rouvre, case décochée) ; « Continuer » sans la case : le lien s'ouvre et l'avertissement reste ;
//  3) cochée puis « Continuer » : le lien s'ouvre, le coin d'état dit où le rallumer, la préférence (pp_email_length_warning) est « off » ;
//  4) l'email suivant, toujours trop long, s'ouvre SANS fenêtre ; la jauge de la barre reste rouge ;
//  5) Réglages > Email : la case « Prévenir quand un email est trop long » est décochée ; la cocher rallume l'avertissement, et la fenêtre revient ; Ctrl + Z la défait comme les autres réglages.
// Lancé par run-headless.mjs (groupe Node "emailTooLongMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-email-too-long-mouse.mjs
// EMAIL_TOO_LONG_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil), EMAIL_TOO_LONG_SCALE=2 pour des captures nettes ; sans la première, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.EMAIL_TOO_LONG_PORT || 9751);
const SHOTS = process.env.EMAIL_TOO_LONG_SHOTS || '';
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
if (!OFFLINE) console.log('[verify-email-too-long-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: Number(process.env.EMAIL_TOO_LONG_SCALE || 1) });
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
const KEY = 'pp_email_length_warning';
const statusText = () => page.evaluate(() => document.getElementById('status-msg').textContent);
const tr = (key, params) => page.evaluate(({ key, params }) => I18n.t(key, params), { key, params });
const stored = () => page.evaluate(k => PersonStore.get(k), KEY);
const links = () => page.evaluate(() => window.__links.length);
const isOpen = () => page.evaluate(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && ov.style.display !== 'none'; });
const active = () => page.evaluate(() => { const a = document.activeElement; return { id: a.id || a.tagName, focusVisible: a.matches(':focus-visible') }; });

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
// Un bouton de la fenêtre, repéré par son texte, cliqué à la vraie souris.
async function clickDialogButton(text) {
  const c = await page.evaluate(t => {
    const b = Array.from(document.querySelectorAll('#pp-dialog-modal .pp-modal-actions button')).filter(x => !x.hidden).find(x => x.textContent === t);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, text);
  if (!c) throw new Error('bouton introuvable : ' + text);
  await page.mouse.move(c.x - 10, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 2 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(300);
}
// Ce que la fenêtre montre : titre, message, la case (texte, cochée, entière dans la fenêtre et dans le panneau), boutons, focus.
const dialogState = () => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  const box = ov.querySelector('.modal-content').getBoundingClientRect();
  const row = ov.querySelector('.pp-dialog-check');
  const input = row.querySelector('input');
  const shown = row.getClientRects().length > 0;
  const r = row.getBoundingClientRect();
  const a = document.activeElement;
  return {
    open: ov.style.display !== 'none',
    title: ov.querySelector('h3').textContent,
    check: { shown, text: row.textContent, checked: input.checked, inBox: shown && r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5, inPanel: shown && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight },
    boxInPanel: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
    buttons: Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent),
    focus: a === input ? 'case' : (a && a.closest && a.closest('#pp-dialog-modal') ? a.textContent : 'hors de la fenêtre : ' + (a && (a.id || a.tagName))),
  };
});
const clickCheck = () => realClick('#pp-dialog-modal .pp-dialog-check input', 250);

// Des données à la portée de l'email : une table, une ligne courante, un nouvel email au corps trop long (plus de 2000 caractères une fois le lien encodé).
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('Contacts', { Prenom: 'Text' });
  stub.setRows('Contacts', [{ id: 1, Prenom: 'Marie' }]);
  await GristAPI.refreshSchema();
  stub.fireRecord({ id: 1, Prenom: 'Marie' }, 'Contacts');
});
await page.waitForTimeout(300);
await realHover('#v2-new-template-group #btn-new');
await realClick('#v2-btn-new-email', 900);
await realClick('#v2-email-subject', 150);
await page.keyboard.type('Relance');
await realClick('#v2-email-to', 150);
await page.keyboard.type('marie.dupont@exemple.fr');
await page.evaluate(() => Editor.setHTML('<p>' + 'texte de l’email '.repeat(160) + '</p>'));
await page.waitForTimeout(900);
// Les liens ne partent nulle part : on compte ceux que le widget ouvrirait.
await page.evaluate(() => { window.__links = []; MailtoExport.openLink = url => { window.__links.push(url); }; });
const createEmail = (wait = 700) => realClick('#btn-create-email', wait);
const gaugeOver = () => page.evaluate(() => document.getElementById('v2-email-char-counter').classList.contains('is-over-limit'));
// Réglages > Email : ouverts à la souris, refermés par « Fermer ».
async function openEmailSettings() {
  await realClick('#v2-btn-settings', 400);
  await realClick('.settings-tab[data-settings-tab="mailClient"]', 300);
}
const boxState = () => page.evaluate(() => {
  const b = document.getElementById('settings-email-length-warning');
  const modal = document.querySelector('#settings-modal .modal-content').getBoundingClientRect();
  const r = b.getBoundingClientRect();
  const label = b.closest('label');
  return { checked: b.checked, text: label.textContent.trim(), hint: document.getElementById('settings-email-length-warning-hint').textContent.trim(), shown: r.width > 0, inModal: r.left >= modal.left && r.right <= modal.right, describedBy: b.getAttribute('aria-describedby') };
});

async function run(T) {
  // Départ : l'avertissement est allumé, rien n'est gardé.
  await page.evaluate(k => { MailtoExport.setLengthWarning(true); PersonStore.remove(k); }, KEY);
  await page.evaluate(() => { window.__links.length = 0; document.getElementById('status-msg').textContent = ''; });
  const first = await page.evaluate(() => MailtoExport.getLengthWarning());
  check(`${T}, au départ l’avertissement est allumé`, first === true, first);

  // 1) La fenêtre et sa case.
  await createEmail();
  let s = await dialogState();
  check(`${T}, la fenêtre « Email trop long » s’ouvre avec les boutons Annuler et Continuer, le focus sur Continuer`, s.open && s.title === 'Email trop long' && JSON.stringify(s.buttons) === JSON.stringify(['Annuler', 'Continuer']) && s.focus === 'Continuer', s);
  check(`${T}, elle porte la case « Ne plus afficher cet avertissement », décochée, entière dans la fenêtre et dans le panneau 700×400`, s.check.shown && s.check.text === 'Ne plus afficher cet avertissement' && s.check.checked === false && s.check.inBox && s.check.inPanel && s.boxInPanel, s);
  await snap(`${T}-1-fenetre`);
  // Au clavier : Maj+Tab depuis Continuer passe par Annuler puis la case ; Espace coche, Espace décoche.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  s = await dialogState();
  check(`${T}, au clavier : deux Maj+Tab depuis « Continuer » amènent sur la case`, s.focus === 'case', s.focus);
  await page.keyboard.press('Space');
  const ticked = (await dialogState()).check.checked;
  await page.keyboard.press('Space');
  const unticked = (await dialogState()).check.checked;
  check(`${T}, au clavier : Espace coche la case, Espace de nouveau la décoche`, ticked === true && unticked === false, { ticked, unticked });

  // 2) Cochée puis « Annuler » : rien d'ouvert, rien de retenu.
  await clickCheck();
  s = await dialogState();
  check(`${T}, un clic réel sur la case la coche`, s.check.checked === true && await isOpen(), s);
  await snap(`${T}-2-case-cochee`);
  await clickDialogButton('Annuler');
  check(`${T}, case cochée puis « Annuler » : aucun lien ouvert, le coin d’état est vide, la fenêtre est fermée`, !(await isOpen()) && (await links()) === 0 && (await statusText()) === '', { links: await links(), status: await statusText() });
  check(`${T}, « Annuler » ne retient rien : l’avertissement reste allumé`, (await stored()) !== 'off' && await page.evaluate(() => MailtoExport.getLengthWarning()) === true, await stored());
  // « Continuer » sans la case : le lien s'ouvre, l'avertissement reste.
  await createEmail();
  s = await dialogState();
  check(`${T}, la fenêtre revient pour l’email suivant, la case de nouveau décochée`, s.open && s.check.checked === false, s);
  await clickDialogButton('Continuer');
  check(`${T}, « Continuer » sans la case : le lien s’ouvre (un), le coin d’état dit la création, l’avertissement reste allumé`, (await links()) === 1 && (await statusText()) === await tr('status.emailCreated') && (await stored()) !== 'off', { links: await links(), status: await statusText(), stored: await stored() });

  // 3) Cochée puis « Continuer ».
  await createEmail();
  await clickCheck();
  await clickDialogButton('Continuer');
  check(`${T}, case cochée puis « Continuer » : le lien s’ouvre (deux)`, (await links()) === 2 && !(await isOpen()), await links());
  check(`${T}, le coin d’état dit que l’avertissement ne s’affichera plus et où le rallumer (Réglages > Email)`, (await statusText()) === await tr('status.emailCreatedWarningOff') && /Réglages > Email/.test(await statusText()), await statusText());
  check(`${T}, la préférence est gardée : ${KEY} = off`, (await stored()) === 'off' && await page.evaluate(() => MailtoExport.getLengthWarning()) === false, await stored());
  await snap(`${T}-3-etat-apres`);

  // 4) L'email suivant, toujours trop long : aucune fenêtre ; la jauge reste rouge.
  await createEmail();
  check(`${T}, l’email suivant, toujours trop long, s’ouvre sans fenêtre : un troisième lien, l’état dit « Email créé » seulement`, !(await isOpen()) && (await links()) === 3 && (await statusText()) === await tr('status.emailCreated'), { open: await isOpen(), links: await links(), status: await statusText() });
  check(`${T}, la jauge de la barre reste rouge au-delà de la limite`, await gaugeOver());

  // 5) Réglages > Email : la case est décochée ; la cocher rallume l'avertissement.
  await openEmailSettings();
  let b = await boxState();
  check(`${T}, Réglages > Email : la case « Prévenir quand un email est trop long » est décochée, entière dans la fenêtre, décrite par son explication`, !b.checked && b.shown && b.inModal && b.text === 'Prévenir quand un email est trop long' && /^Quand le lien de l’email dépasse la limite conseillée/.test(b.hint) && b.describedBy === 'settings-email-length-warning-hint', b);
  await page.evaluate(() => document.getElementById('settings-email-length-warning').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  await snap(`${T}-5-reglages`);
  await realClick('#settings-email-length-warning', 300);
  b = await boxState();
  check(`${T}, la cocher rallume l’avertissement : ${KEY} = on, la case reste cochée`, b.checked && (await stored()) === 'on' && await page.evaluate(() => MailtoExport.getLengthWarning()) === true, { b, stored: await stored() });
  await realClick('#settings-close', 300);
  await createEmail();
  s = await dialogState();
  check(`${T}, la fenêtre « Email trop long » revient pour l’email suivant`, s.open && s.title === 'Email trop long' && s.check.checked === false, s);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(`${T}, Échap la ferme sans rien ouvrir ni rien retenir`, !(await isOpen()) && (await links()) === 3 && (await stored()) === 'on', { links: await links(), stored: await stored() });

  // Ctrl + Z défait la case de Réglages comme les autres réglages : éteinte puis défaite, l'avertissement revient.
  await openEmailSettings();
  await realClick('#settings-email-length-warning', 250);
  await realClick('#settings-close', 300);
  check(`${T}, case décochée à la main dans Réglages : l’avertissement est éteint`, (await stored()) === 'off', await stored());
  await page.evaluate(() => document.querySelector('.tiptap').focus());
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const undone = await statusText();
  check(`${T}, Ctrl + Z défait ce réglage : l’avertissement est de nouveau allumé, le coin d’état nomme le réglage et son état`, (await stored()) === 'on' && await page.evaluate(() => MailtoExport.getLengthWarning()) === true && /Email trop long/.test(undone) && /allumé/.test(undone), { stored: await stored(), status: undone });
}

async function runEnglish() {
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(300);
  await page.evaluate(k => { MailtoExport.setLengthWarning(true); PersonStore.remove(k); window.__links.length = 0; }, KEY);
  await createEmail();
  const s = await dialogState();
  check('anglais, la fenêtre « Email too long » porte la case « Don’t show this warning again », entière dans le panneau', s.open && s.title === 'Email too long' && s.check.text === 'Don’t show this warning again' && s.check.inBox && s.check.inPanel && s.boxInPanel, s);
  await snap('en-1-fenetre');
  await clickCheck();
  await clickDialogButton('Continue');
  check('anglais, cochée puis « Continue » : le coin d’état dit où rallumer l’avertissement (Settings > Email)', (await statusText()) === await tr('status.emailCreatedWarningOff') && /Settings > Email/.test(await statusText()) && (await stored()) === 'off', { status: await statusText(), stored: await stored() });
  await openEmailSettings();
  // La page statique ne se traduit qu'au chargement (changer de langue la recharge, js/i18n.js:applyTranslations) : ici la langue n'est posée que pour t(), alors le titre, le libellé et l'explication de la case reçoivent
  // le texte que leur attribut data-i18n désigne - la clé qui existe, dans la langue de l'interface.
  await page.evaluate(() => {
    ['#settings-email-length-warning-hint', 'label[for="settings-email-length-warning"] span', '[data-i18n="settings.emailLength.title"]'].forEach(sel => {
      const el = document.querySelector(sel);
      el.textContent = I18n.t(el.getAttribute('data-i18n'));
    });
  });
  const b = await boxState();
  const heading = await page.evaluate(() => document.querySelector('[data-i18n="settings.emailLength.title"]').textContent);
  check('anglais, Réglages > Email : « Email too long », « Warn when an email is too long », décochée, avec son explication', !b.checked && heading === 'Email too long' && b.text === 'Warn when an email is too long' && /^When the email link goes over the recommended limit/.test(b.hint), { b, heading });
  await page.evaluate(() => document.getElementById('settings-email-length-warning').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  await snap('en-5-reglages');
  await realClick('#settings-close', 300);
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(200);
}

await run('clair');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(150);
await run('sombre');
await runEnglish();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
