#!/usr/bin/env node
// Saisies et confirmations du widget (js/dialogs.js, css/modal-base.css) : Dialogs.prompt et Dialogs.confirm à 700x400 (le panneau d'Antoine), à la VRAIE souris
// (page.mouse) et au VRAI clavier (frappe, Entrée, Échap, Tab), en clair et en sombre - à la place de window.prompt / window.confirm (choix d'Antoine du
// 2026-09-29). Deux parties : 1) la fenêtre elle-même (run) ; 2) les endroits du widget qui l'appellent (runSites), chacun déclenché par le vrai clic sur
// le vrai bouton : image par adresse, enregistrer sous, supprimer un modèle, email trop long, les trois exports en lot, la table créée depuis la galerie,
// supprimer un fil de commentaires, nouveau dossier / sous-dossier / déplacer vers un dossier (Organiser mes modèles), supprimer une correspondance de tables.
// Le verrou d'export (withExportLock, js/main.js) grise le bouton avant que la fenêtre « Email trop long » s'ouvre : lancé au clavier (vraies touches Tab et Entrée),
// le clavier doit revenir sur « Créer l'email » et sur « Exporter en PDF » à la fermeture ; lancé à la souris, rien ne change (aucun cadre de focus).
// Les scénarios qui tournent dans la page ne voient ni le focus rendu à l'élément d'origine, ni la fenêtre posée AU-DESSUS d'une autre (Organiser mes modèles,
// la galerie, Tables liées : z-index 2000), ni qu'un Tab ou un Échap n'atteint que la fenêtre du dessus.
// Lancé par run-headless.mjs (groupe Node "dialogsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-dialogs-mouse.mjs
// DIALOGS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.DIALOGS_MOUSE_PORT || 8892);
const SHOTS = process.env.DIALOGS_SHOTS || '';
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/html2pdf\.bundle\.min\.js$/, 'umd/html2pdf.bundle.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-dialogs-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
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

// Centre d'un élément et ce qui s'y trouve réellement au premier plan.
async function hitTest(selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width,
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}
const seen = box => box.found && box.inViewport && box.onTop;
async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const isOpen = () => page.evaluate(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && ov.style.display !== 'none'; });
const inPanel = (box, width = WIDTH) => box.l >= 0 && box.t >= 0 && box.r <= width && box.b <= HEIGHT;

// Une demande à la fenêtre, sans attendre sa réponse : elle se lit ensuite par result().
async function ask(kind, opts) {
  await page.evaluate(({ kind, opts }) => {
    window.__dlg = { done: false, value: undefined };
    Dialogs[kind](opts).then(v => { window.__dlg.done = true; window.__dlg.value = v; });
  }, { kind, opts });
  await page.waitForTimeout(250);
}
const result = () => page.evaluate(() => window.__dlg);
const focusOn = id => page.evaluate(id => document.getElementById(id).focus(), id);
const focusIs = id => page.evaluate(id => !!document.activeElement && document.activeElement.id === id, id);
const state = () => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  const box = ov.querySelector('.modal-content');
  const input = ov.querySelector('.pp-dialog-input');
  const message = ov.querySelector('.pp-dialog-message');
  const label = ov.querySelector('.pp-dialog-label');
  const a = document.activeElement;
  const r = box.getBoundingClientRect();
  const shown = e => e.getClientRects().length > 0;
  return {
    open: ov.style.display !== 'none',
    title: ov.querySelector('h3').textContent,
    message: shown(message) ? message.textContent : null, messageHeight: shown(message) ? message.getBoundingClientRect().height : 0,
    whiteSpace: getComputedStyle(message).whiteSpace,
    label: shown(label) ? label.textContent : null, inputShown: shown(input), inputValue: input.value, selection: [input.selectionStart, input.selectionEnd],
    buttons: Array.from(ov.querySelectorAll('.pp-modal-actions button')).map(b => b.textContent),
    primary: ov.querySelector('.var-modal-primary').textContent,
    focus: a === input ? 'input' : (a && a.closest && a.closest('#pp-dialog-modal') ? a.textContent : 'hors de la fenêtre : ' + (a && (a.id || a.tagName))),
    box: { l: r.left, t: r.top, r: r.right, b: r.bottom },
    aria: { role: box.getAttribute('role'), modal: box.getAttribute('aria-modal'), labelledText: (document.getElementById(box.getAttribute('aria-labelledby')) || {}).textContent, describedBy: box.getAttribute('aria-describedby') },
    inputLabelledText: (document.getElementById(input.getAttribute('aria-labelledby')) || {}).textContent,
    bg: getComputedStyle(ov).backgroundColor, z: getComputedStyle(ov).zIndex,
  };
});
const scrimNow = () => page.evaluate(() => { const p = document.createElement('div'); p.style.background = 'var(--pp-scrim)'; document.body.appendChild(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c; });
async function click(selector) { const b = await hitTest(selector); if (b.found) await page.mouse.click(b.x, b.y); await page.waitForTimeout(200); return b; }
const CANCEL = '#pp-dialog-modal .pp-modal-actions button:first-of-type';
const OK = '#pp-dialog-modal .var-modal-primary';
const LONG = 'Cet email dépasse 2000 caractères (limite conseillée : 1900) : certains logiciels de messagerie (Outlook notamment) tronqueront le message. Continuer quand même ?';

async function run(theme) {
  const T = theme;

  // 1) Saisie : ouverte dans le panneau, champ prérempli et sélectionné, la frappe réelle le remplace, Entrée valide, le focus revient au bouton d'origine.
  await focusOn('v2-btn-settings');
  await ask('prompt', { title: 'Nouveau modèle', label: 'Nom du nouveau modèle :', value: 'Sans titre', confirmLabel: 'Créer' });
  let s = await state();
  check(`${T}, saisie : la fenêtre s’ouvre dans le panneau ${WIDTH}x${HEIGHT} avec son titre, son libellé et le champ prérempli`,
    s.open && inPanel(s.box) && s.title === 'Nouveau modèle' && s.label === 'Nom du nouveau modèle :' && s.inputShown && s.inputValue === 'Sans titre' && s.message === null, s);
  check(`${T}, saisie : le focus est dans le champ, texte entier sélectionné`, s.focus === 'input' && s.selection[0] === 0 && s.selection[1] === 'Sans titre'.length, s);
  check(`${T}, saisie : boutons Annuler et Créer, Créer est le bouton principal`, JSON.stringify(s.buttons) === '["Annuler","Créer"]' && s.primary === 'Créer', s);
  check(`${T}, saisie : role="dialog" aria-modal, nommée par son titre, champ nommé par son libellé`, s.aria.role === 'dialog' && s.aria.modal === 'true' && s.aria.labelledText === 'Nouveau modèle' && s.inputLabelledText === 'Nom du nouveau modèle :' && s.aria.describedBy === null, s);
  const expectedScrim = await scrimNow();
  check(`${T}, saisie : le voile prend la couleur du thème (--pp-scrim) et passe au-dessus des fenêtres de 2000`, s.bg === expectedScrim && Number(s.z) > 2000, { bg: s.bg, expectedScrim, z: s.z });
  const t1 = await hitTest('#pp-dialog-modal h3'), o1 = await hitTest(OK), i1 = await hitTest('#pp-dialog-modal .pp-dialog-input');
  check(`${T}, saisie : titre, champ et bouton Créer visibles et au premier plan`, seen(t1) && seen(o1) && seen(i1), { t1, o1, i1 });
  await snap(`${T}-1-saisie`);
  await page.keyboard.type('Contrat A');
  check(`${T}, saisie : la frappe réelle remplace le texte sélectionné`, (await state()).inputValue === 'Contrat A');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  let r = await result();
  check(`${T}, saisie : Entrée valide - la promesse rend le texte tapé et la fenêtre se ferme`, r.done && r.value === 'Contrat A' && !(await isOpen()), r);
  check(`${T}, saisie : le focus revient à l’élément qui l’avait à l’ouverture`, await focusIs('v2-btn-settings'));

  // 2) Annuler : Échap et clic sur Annuler rendent null ; Créer avec un champ vide rend '' (pas null : « aucun dossier » n'est pas « annulé »).
  await ask('prompt', { title: 'Nouveau modèle', label: 'Nom du nouveau modèle :', value: 'x', confirmLabel: 'Créer' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  r = await result();
  check(`${T}, saisie : Échap annule - la promesse rend null, la fenêtre se ferme, le focus revient`, r.done && r.value === null && !(await isOpen()) && await focusIs('v2-btn-settings'), r);
  await ask('prompt', { title: 'Nouveau modèle', label: 'Nom du nouveau modèle :', value: 'x', confirmLabel: 'Créer' });
  const cancel = await click(CANCEL);
  r = await result();
  check(`${T}, saisie : un vrai clic sur Annuler rend null`, seen(cancel) && r.done && r.value === null && !(await isOpen()), { cancel, r });
  await ask('prompt', { title: 'Déplacer vers un dossier', message: 'Dossier (existant ou nouveau). Dossiers existants : Comptabilité, Juridique.\nLaisser vide pour aucun dossier.', label: '', value: '', confirmLabel: 'Déplacer' });
  s = await state();
  check(`${T}, saisie avec message : le message s’affiche sur ses deux lignes (retour à la ligne gardé), le champ n’a pas de libellé et est nommé par le titre`,
    s.message !== null && s.message.includes('\n') && s.whiteSpace === 'pre-line' && s.label === null && s.inputLabelledText === 'Déplacer vers un dossier' && s.aria.describedBy === 'pp-dialog-message' && inPanel(s.box), s);
  await snap(`${T}-2-saisie-message`);
  await click(OK);
  r = await result();
  check(`${T}, saisie : Déplacer avec un champ vide rend '' (et non null)`, r.done && r.value === '' && !(await isOpen()), r);

  // 3) Tab tourne entre le champ et les deux boutons, dans les deux sens.
  await ask('prompt', { title: 'Nouveau dossier', label: 'Nom du nouveau dossier', value: 'A', confirmLabel: 'Créer' });
  const order = [(await state()).focus];
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); order.push((await state()).focus); }
  check(`${T}, saisie : Tab tourne champ, Annuler, Créer, puis revient au champ`, JSON.stringify(order) === '["input","Annuler","Créer","input"]', order);
  const back = [];
  await page.keyboard.press('Shift+Tab'); back.push((await state()).focus);
  await page.keyboard.press('Shift+Tab'); back.push((await state()).focus);
  check(`${T}, saisie : Maj+Tab remonte de Créer à Annuler en repartant du champ`, JSON.stringify(back) === '["Créer","Annuler"]', back);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Tab');
  check(`${T}, saisie : focus tombé sur <body> - Tab rentre dans la fenêtre`, (await state()).focus !== null && !String((await state()).focus).startsWith('hors'), (await state()).focus);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // 4) Confirmation : message long dans le panneau, focus sur Valider, clic réel -> true, Échap -> false.
  await focusOn('v2-btn-settings');
  await ask('confirm', { title: 'Email trop long', message: LONG, confirmLabel: 'Continuer' });
  s = await state();
  check(`${T}, confirmation : ouverte dans le panneau, message en entier, pas de champ, focus sur le bouton principal`,
    s.open && inPanel(s.box) && s.message === LONG && !s.inputShown && s.label === null && s.focus === 'Continuer' && JSON.stringify(s.buttons) === '["Annuler","Continuer"]' && s.aria.describedBy === 'pp-dialog-message', s);
  const msgBox = await hitTest('#pp-dialog-modal .pp-dialog-message');
  check(`${T}, confirmation : le message passe à la ligne dans la fenêtre sans déborder`, seen(msgBox) && s.messageHeight > 30, { msgBox, height: s.messageHeight });
  await snap(`${T}-3-confirmation`);
  await click(OK);
  r = await result();
  check(`${T}, confirmation : un vrai clic sur le bouton principal rend true, le focus revient`, r.done && r.value === true && !(await isOpen()) && await focusIs('v2-btn-settings'), r);
  await ask('confirm', { title: 'Email trop long', message: LONG, confirmLabel: 'Continuer' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  r = await result();
  check(`${T}, confirmation : Échap rend false`, r.done && r.value === false && !(await isOpen()), r);
  await ask('confirm', { title: 'Export', message: 'Générer un PDF pour chacune des 12 lignes ?' });
  s = await state();
  check(`${T}, confirmation : sans libellé passé, les boutons par défaut sont Annuler et Valider`, JSON.stringify(s.buttons) === '["Annuler","Valider"]', s.buttons);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  r = await result();
  check(`${T}, confirmation : Entrée sur le bouton principal (focus d’ouverture) valide`, r.done && r.value === true, r);

  // 5) Confirmation destructrice : le focus arrive sur Annuler (une frappe d'Entrée distraite ne supprime rien) ; Tab puis Entrée confirme.
  await ask('confirm', { title: 'Supprimer le modèle', message: 'Supprimer ce modèle ?', confirmLabel: 'Supprimer', danger: true });
  check(`${T}, confirmation destructrice : le focus arrive sur Annuler`, (await state()).focus === 'Annuler', (await state()).focus);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  r = await result();
  check(`${T}, confirmation destructrice : Entrée d’emblée annule (false)`, r.done && r.value === false, r);
  await ask('confirm', { title: 'Supprimer le modèle', message: 'Supprimer ce modèle ?', confirmLabel: 'Supprimer', danger: true });
  await page.keyboard.press('Tab');
  check(`${T}, confirmation destructrice : Tab amène sur Supprimer`, (await state()).focus === 'Supprimer', (await state()).focus);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  r = await result();
  check(`${T}, confirmation destructrice : Entrée sur Supprimer rend true`, r.done && r.value === true, r);

  // 6) Une demande qui arrive pendant qu'une autre est ouverte annule la première (elle se résout comme Annuler) et prend la place.
  await ask('prompt', { title: 'Première', value: 'a', confirmLabel: 'OK1' });
  await page.evaluate(() => { window.__first = window.__dlg; });
  await page.evaluate(() => { window.__second = { done: false, value: undefined }; Dialogs.confirm({ title: 'Seconde', message: 'm', confirmLabel: 'OK2' }).then(v => { window.__second.done = true; window.__second.value = v; }); });
  await page.waitForTimeout(250);
  const firstDone = await page.evaluate(() => window.__first.done ? window.__first.value : 'en attente');
  s = await state();
  check(`${T}, deux demandes : la première rend null, la seconde est ouverte (une seule fenêtre)`, firstDone === null && s.open && s.title === 'Seconde' && s.primary === 'OK2', { firstDone, s });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 7) AU-DESSUS d'une fenêtre écrite dans index.html (Organiser mes modèles, z-index 2000) : la saisie est au premier plan, Tab et Échap ne touchent qu'elle,
  // Organiser reste ouverte dessous, puis se ferme à son tour au second Échap.
  await page.evaluate(() => TemplateOrganizeModal.open());
  await page.waitForTimeout(400);
  const organizeOpen = () => page.evaluate(() => document.getElementById('template-organize-modal').style.display !== 'none');
  await ask('prompt', { title: 'Nouveau dossier', label: 'Nom du nouveau dossier', value: '', confirmLabel: 'Créer' });
  const above = await hitTest('#pp-dialog-modal .modal-content');
  const aboveOk = await hitTest(OK);
  check(`${T}, au-dessus d’Organiser : la saisie est au premier plan, entièrement dans le panneau, bouton Créer atteignable`, seen(above) && seen(aboveOk) && await organizeOpen(), { above, aboveOk });
  await snap(`${T}-4-au-dessus-organiser`);
  let escaped = false;
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); if (String((await state()).focus).startsWith('hors')) escaped = true; }
  check(`${T}, au-dessus d’Organiser : huit appuis sur Tab restent dans la saisie`, !escaped);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  r = await result();
  check(`${T}, au-dessus d’Organiser : un premier Échap ferme la saisie SEULE (null), Organiser reste ouverte`, r.done && r.value === null && !(await isOpen()) && await organizeOpen(), { r, organize: await organizeOpen() });
  check(`${T}, au-dessus d’Organiser : le focus est revenu dans Organiser`, await page.evaluate(() => document.getElementById('template-organize-modal').contains(document.activeElement)));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(`${T}, au-dessus d’Organiser : le second Échap ferme Organiser`, !(await organizeOpen()));

  // 8) Panneau étroit : la confirmation la plus longue reste dans les 360 px, sans débordement de page.
  await ask('confirm', { title: 'Email trop long', message: LONG, confirmLabel: 'Continuer' });
  await page.setViewportSize({ width: 360, height: HEIGHT });
  await page.waitForTimeout(200);
  s = await state();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`${T}, à 360 px de large : la confirmation reste dans le panneau, sans débordement de page`, inPanel(s.box, 360) && overflow <= 0, { box: s.box, overflow });
  await snap(`${T}-5-360`);
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Partie 2 : les endroits du widget qui appellent la fenêtre, à la vraie souris et au vrai clavier.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
const DATA_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const badge = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;

// Centre d'un élément (amené dans la vue), vrai déplacement puis vrai clic ; rend aussi ce qui se trouve réellement sous le pointeur.
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
// « Organiser mes modèles » est dans l'en-tête de la liste des modèles (depuis le 2026-10-01) : ouvrir la liste au vrai clic, puis le bouton.
async function openOrganize() {
  await realClick('.tts-trigger', 250);
  await realClick('#btn-organize-templates', 700);
}
async function realHover(selector) {
  const c = await centerOf(selector);
  if (!c) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 30, c.y + 5, { steps: 3 });
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.waitForTimeout(450);
}
const statusText = () => page.evaluate(() => document.getElementById('status-msg').textContent);
// L'élément qui a le focus, et s'il porte le cadre de focus du clavier (:focus-visible) ; `outline` : ce que ce cadre dessine réellement.
const active = () => page.evaluate(() => {
  const a = document.activeElement, cs = getComputedStyle(a);
  return { id: a.id || a.tagName, focusVisible: a.matches(':focus-visible'), outline: cs.outlineStyle + ' ' + cs.outlineWidth };
});
// De vrais appuis sur Tab (ou Maj+Tab) depuis un point de départ connu jusqu'à ce que l'élément voulu ait le focus : le cadre de focus est celui d'une navigation au clavier.
async function pressUntil(id, from, key = 'Tab') {
  await page.evaluate(f => document.getElementById(f).focus(), from);
  const path = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(key);
    path.push(await page.evaluate(() => document.activeElement.id || document.activeElement.tagName));
    if (path[path.length - 1] === id) break;
  }
  return path;
}
const tr = (key, params) => page.evaluate(({ key, params }) => I18n.t(key, params), { key, params });
const templateNames = () => page.evaluate(() => Templates.getCached().map(t => t.nom));

// Ce que doit montrer la fenêtre à l'ouverture : dans le panneau, titre, message, libellé, valeur, boutons, focus. `message` : texte, regexp, ou null (aucun).
function expectDialog(name, s, exp) {
  const msgOk = exp.message === undefined ? true : exp.message === null ? s.message === null : exp.message instanceof RegExp ? exp.message.test(s.message || '') : s.message === exp.message;
  const ok = s.open && inPanel(s.box) && s.title === exp.title && msgOk
    && (exp.label === undefined || s.label === exp.label)
    && (exp.value === undefined || s.inputValue === exp.value)
    && JSON.stringify(s.buttons) === JSON.stringify(exp.buttons) && s.focus === exp.focus;
  check(name, ok, s);
}

async function runSites(theme) {
  const T = theme;
  // Des données à la portée des exports, des liens et de l'email : une table de deux lignes, une règle de correspondance, une ligne courante.
  await page.evaluate(async () => {
    const stub = window.__gristStub;
    stub.setVariables('SiAnnuaire', { NomPrenom: 'Text' });
    stub.setVariables('SiDossiers', { Titre: 'Text', Responsable: 'Ref:SiAnnuaire' });
    stub.setRows('SiAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean' }]);
    stub.setRows('SiDossiers', [{ id: 1, Titre: 'Dossier A', Responsable: 7 }, { id: 2, Titre: 'Dossier B', Responsable: 7 }]);
    await GristAPI.refreshSchema();
    await GristAPI.saveLinkRule('SiAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
    stub.fireRecord({ id: 1, Titre: 'Dossier A', Responsable: 'Dupont Jean' }, 'SiDossiers');
  });
  await page.waitForTimeout(300);
  let s, r, c;

  // 1) Insérer une image par son adresse (barre de mise en forme).
  await page.evaluate(() => Editor.setHTML('<p>Texte</p>'));
  const imgCount = () => page.evaluate(() => document.querySelectorAll('.tiptap img.editor-image').length);
  await realClick('#v2-btn-image');
  s = await state();
  expectDialog(`${T}, image : la fenêtre s’ouvre dans le panneau, champ vide, boutons Annuler et Insérer`, s,
    { title: 'Insérer une image', label: 'URL de l’image :', message: null, value: '', buttons: ['Annuler', 'Insérer'], focus: 'input' });
  await snap(`${T}-s1-image`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(`${T}, image : Échap n’insère rien et le focus revient au bouton`, (await imgCount()) === 0 && !(await isOpen()), await imgCount());
  await realClick('#v2-btn-image');
  await page.keyboard.type(DATA_PNG);
  await click(OK);
  await page.waitForTimeout(400);
  check(`${T}, image : « Insérer » (clic réel) met l’image dans le document avec l’adresse tapée`,
    (await imgCount()) === 1 && await page.evaluate(src => document.querySelector('.tiptap img.editor-image').getAttribute('src') === src, DATA_PNG) && !(await isOpen()));

  // 2) Enregistrer sous (copie) : la copie prend le nom tapé, Échap n'en crée pas.
  await page.evaluate(name => { Editor.setHTML('<p>Contrat de test</p>'); document.getElementById('template-name').value = name; }, `Modèle ${T}`);
  await realClick('#btn-save', 800);
  check(`${T}, enregistrer sous : le modèle de départ est enregistré`, (await templateNames()).includes(`Modèle ${T}`), await templateNames());
  const nBefore = (await templateNames()).length;
  await realClick('#btn-save-as');
  s = await state();
  expectDialog(`${T}, enregistrer sous : la fenêtre s’ouvre avec le libellé « Nom du nouveau modèle »`, s,
    { title: 'Enregistrer sous (copie)', label: 'Nom du nouveau modèle :', message: null, value: '', buttons: ['Annuler', 'Enregistrer'], focus: 'input' });
  await snap(`${T}-s2-enregistrer-sous`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(`${T}, enregistrer sous : Échap ne crée aucune copie, le focus revient au bouton`, (await templateNames()).length === nBefore && await focusIs('btn-save-as'), await templateNames());
  await realClick('#btn-save-as');
  await page.keyboard.type(`Copie ${T}`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  check(`${T}, enregistrer sous : Entrée crée la copie sous le nom tapé, l’original reste`, (await templateNames()).includes(`Copie ${T}`) && (await templateNames()).includes(`Modèle ${T}`), await templateNames());

  // 3) Supprimer le modèle courant (la copie) : confirmation destructrice, le focus arrive sur Annuler.
  await realClick('#btn-delete');
  s = await state();
  expectDialog(`${T}, supprimer un modèle : « Supprimer ce modèle ? », focus sur Annuler (confirmation destructrice)`, s,
    { title: 'Supprimer ce modèle ?', message: null, buttons: ['Annuler', 'Supprimer'], focus: 'Annuler' });
  await snap(`${T}-s3-supprimer-modele`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check(`${T}, supprimer un modèle : Entrée d’emblée (Annuler) ne supprime rien`, (await templateNames()).includes(`Copie ${T}`) && !(await isOpen()), await templateNames());
  await realClick('#btn-delete');
  await click(OK);
  await page.waitForTimeout(800);
  check(`${T}, supprimer un modèle : « Supprimer » (clic réel) retire la copie et garde l’original, le statut le dit`,
    !(await templateNames()).includes(`Copie ${T}`) && (await templateNames()).includes(`Modèle ${T}`) && (await statusText()) === await tr('status.templateDeleted'), { names: await templateNames(), status: await statusText() });

  // 4) Créer l'email trop long : confirmation « Continuer », Échap efface le statut sans rien ouvrir.
  await realHover('#v2-new-template-group #btn-new');
  await realClick('#v2-btn-new-email', 900);
  await page.evaluate(() => Editor.setHTML('<p>' + 'texte de l’email '.repeat(160) + '</p>'));
  await page.waitForTimeout(300);
  await realClick('#btn-create-email', 600);
  s = await state();
  expectDialog(`${T}, email trop long : la fenêtre porte le message avec les deux longueurs, bouton Continuer`, s,
    { title: 'Email trop long', message: /^Cet email dépasse \d+ caractères \(limite conseillée : \d+\)/, buttons: ['Annuler', 'Continuer'], focus: 'Continuer' });
  await snap(`${T}-s4-email`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(`${T}, email trop long : Échap laisse le statut vide, la fenêtre est fermée et le bouton est de nouveau actif`, (await statusText()) === '' && !(await isOpen()) && await page.evaluate(() => !document.getElementById('btn-create-email').disabled), await statusText());
  // Lancé à la souris, rien ne change : le bouton grisé a perdu le focus, il ne lui est pas rendu et aucun cadre de focus n'apparaît (le clavier n'était pas en jeu).
  let a = await active();
  check(`${T}, email trop long lancé à la souris : Échap ne fait apparaître aucun cadre de focus, le focus reste sur la page`, a.id === 'BODY' && !a.focusVisible, a);
  await realClick('#btn-create-email', 600);
  await click(OK);
  await page.waitForTimeout(600);
  check(`${T}, email trop long : « Continuer » (clic réel) poursuit la création de l’email`, (await statusText()) === await tr('status.emailCreated'), await statusText());
  a = await active();
  check(`${T}, email trop long lancé à la souris : « Continuer » ne fait apparaître aucun cadre de focus non plus`, a.id === 'BODY' && !a.focusVisible, a);

  // 4 bis) Au clavier : le verrou d'export grise « Créer l'email » avant que la fenêtre s'ouvre, le navigateur en retire le focus, et la fenêtre n'a plus d'élément d'origine à
  // retrouver. À la fermeture (Échap, Annuler ou Continuer) le clavier revient sur le bouton, avec son cadre de focus, au lieu de repartir du début de la page.
  const emailByKeyboard = async () => {
    const path = await pressUntil('btn-create-email', 'btn-export-pdf');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    return { path, dialog: await state(), buttonDisabled: await page.evaluate(() => document.getElementById('btn-create-email').disabled) };
  };
  let k = await emailByKeyboard();
  check(`${T}, email trop long au clavier : Tab amène sur « Créer l’email », Entrée ouvre la fenêtre pendant que le bouton est grisé`,
    k.path[k.path.length - 1] === 'btn-create-email' && k.dialog.open && k.dialog.title === 'Email trop long' && k.buttonDisabled, { path: k.path, open: k.dialog.open, title: k.dialog.title, disabled: k.buttonDisabled });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  a = await active();
  check(`${T}, email trop long au clavier : Échap rend le clavier à « Créer l’email », avec son cadre de focus`, a.id === 'btn-create-email' && a.focusVisible && !(await isOpen()), a);
  await snap(`${T}-s4-email-clavier`);
  await emailByKeyboard();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  a = await active();
  check(`${T}, email trop long au clavier : Annuler (Maj+Tab puis Entrée) rend aussi le clavier au bouton, sans rien créer`, a.id === 'btn-create-email' && a.focusVisible && !(await isOpen()) && (await statusText()) === '', { a, status: await statusText() });
  await emailByKeyboard();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  a = await active();
  check(`${T}, email trop long au clavier : Continuer (Entrée) crée l’email et rend le clavier au bouton`, (await statusText()) === await tr('status.emailCreated') && a.id === 'btn-create-email' && a.focusVisible, { a, status: await statusText() });
  await emailByKeyboard();
  await click(CANCEL);
  a = await active();
  check(`${T}, email trop long lancé au clavier mais fermé à la souris : aucun cadre de focus ne s’affiche`, !(await isOpen()) && !a.focusVisible, a);

  // Les exports lancés au clavier passent par le même verrou : à la fin de l'export le clavier revient sur « Exporter en PDF » ; si le focus est allé ailleurs pendant
  // l'export (clic réel dans le document), il n'est pas ramené au bouton. L'export lui-même est remplacé par une promesse qu'on libère à la main.
  await page.evaluate(() => {
    window.__realExportCurrent = PdfExport.exportCurrentRecord;
    PdfExport.exportCurrentRecord = () => new Promise(done => { window.__releaseExport = done; });
    document.getElementById('status-msg').textContent = '';
  });
  const pdfByKeyboard = async () => {
    const path = await pressUntil('btn-export-pdf', 'btn-toggle-pdf-filename', 'Shift+Tab');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    return { path, buttonDisabled: await page.evaluate(() => document.getElementById('btn-export-pdf').disabled) };
  };
  k = await pdfByKeyboard();
  check(`${T}, export PDF au clavier : Maj+Tab amène sur « Exporter en PDF », Entrée lance l’export et grise le bouton`, k.path[k.path.length - 1] === 'btn-export-pdf' && k.buttonDisabled, k);
  await page.evaluate(() => window.__releaseExport());
  await page.waitForTimeout(500);
  a = await active();
  check(`${T}, export PDF au clavier : à la fin de l’export le clavier revient sur « Exporter en PDF », avec son cadre de focus`,
    (await statusText()) === await tr('status.pdfGenerated') && a.id === 'btn-export-pdf' && a.focusVisible, { a, status: await statusText() });
  await pdfByKeyboard();
  await realClick('.tiptap p', 300);
  await page.evaluate(() => window.__releaseExport());
  await page.waitForTimeout(500);
  a = await active();
  check(`${T}, export PDF au clavier : si le focus est allé dans le document pendant l’export, il n’est pas ramené au bouton`, a.id !== 'btn-export-pdf' && await page.evaluate(() => !!document.activeElement.closest('.tiptap')), a);
  await page.evaluate(() => { PdfExport.exportCurrentRecord = window.__realExportCurrent; });

  // 5) Les trois exports en lot : même fenêtre, message propre à chacun, « Générer » ; Annuler n'exporte rien, « Générer » lance le chargement.
  const exportsCases = [
    { name: 'PDF (ZIP)', hover: '#btn-export-pdf', row: '#v2-btn-export-pdf-batch', message: 'Générer un PDF pour chacune des 2 lignes de « SiDossiers » et les regrouper dans une archive ZIP ?' },
    { name: 'PDF unique', hover: '#btn-export-pdf', row: '#v2-btn-export-pdf-merged', message: 'Générer un PDF pour chacune des 2 lignes de « SiDossiers » et les réunir dans un seul fichier PDF, chaque ligne commençant sur une nouvelle page ?' },
    { name: 'DOCX (ZIP)', hover: '#v2-btn-quality', row: '#v2-btn-export-docx-batch', message: 'Générer un DOCX pour chacune des 2 lignes de « SiDossiers » et les regrouper dans une archive ZIP ?' },
  ];
  // Chaque export déclare ses bibliothèques (loadLibs, js/main.js) : le lot PDF pour les deux PDF, JSZip seul pour le DOCX en ZIP - les deux échouent ici.
  await page.evaluate(() => {
    window.__realEnsure = PdfExport.ensurePdfLibsLoaded; PdfExport.ensurePdfLibsLoaded = async () => { throw new Error('bibliothèques non chargées par ce test'); };
    window.__realJsZip = ExportCommon.ensureJsZipLoaded; ExportCommon.ensureJsZipLoaded = async () => { throw new Error('JSZip non chargé par ce test'); };
  });
  for (const e of exportsCases) {
    await page.evaluate(() => { document.getElementById('status-msg').textContent = ''; });
    await realHover(e.hover);
    await realClick(e.row, 500);
    s = await state();
    expectDialog(`${T}, export en lot ${e.name} : titre « Exporter toutes les lignes », le message de cet export, bouton Générer`, s,
      { title: 'Exporter toutes les lignes', message: e.message, buttons: ['Annuler', 'Générer'], focus: 'Générer' });
    if (e.name === 'PDF (ZIP)') await snap(`${T}-s5-export`);
    await click(CANCEL);
    check(`${T}, export en lot ${e.name} : Annuler ne lance rien (statut vide)`, (await statusText()) === '' && !(await isOpen()), await statusText());
    await realHover(e.hover);
    await realClick(e.row, 500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    check(`${T}, export en lot ${e.name} : Générer (Entrée) lance le chargement des bibliothèques (et son échec est annoncé)`, /Échec de chargement des bibliothèques/.test(await statusText()) && !(await isOpen()), await statusText());
  }
  await page.evaluate(() => { PdfExport.ensurePdfLibsLoaded = window.__realEnsure; ExportCommon.ensureJsZipLoaded = window.__realJsZip; });

  // 6) Galerie : « Utiliser avec une nouvelle table de données » demande le nom de la table, par-dessus l'aperçu (fenêtre de 2000).
  await realHover('#v2-new-template-group #btn-new');
  await realClick('#v2-btn-new-from-template', 1200);
  const card = await page.evaluate(() => { const rc = document.querySelector('.tpl-gallery-card').getBoundingClientRect(); return { x: rc.x + rc.width / 2, y: rc.top + 40 }; });
  await page.mouse.click(card.x, card.y);
  await page.waitForTimeout(900);
  await realClick('#tpl-preview-use-data', 500);
  s = await state();
  expectDialog(`${T}, galerie : « Nouvelle table Grist », le nom proposé est celui du schéma, sélectionné`, s,
    { title: 'Nouvelle table Grist', label: 'Nom de la nouvelle table Grist :', message: null, buttons: ['Annuler', 'Créer'], focus: 'input' });
  check(`${T}, galerie : le nom proposé n’est pas vide et la fenêtre est au-dessus de l’aperçu`, s.inputValue.length > 0 && (await hitTest('#pp-dialog-modal .modal-content')).onTop, s.inputValue);
  await snap(`${T}-s6-galerie`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(`${T}, galerie : Échap annule - l’aperçu reste ouvert, aucune table créée, le focus revient au bouton de l’aperçu`,
    await page.evaluate(() => document.getElementById('template-preview-modal').style.display !== 'none' && document.activeElement.id === 'tpl-preview-use-data')
    && await page.evaluate(() => !window.__gristStub.getActionLog().some(a => a[0] === 'AddTable' && a[1] === `Table galerie`)));
  await realClick('#tpl-preview-use-data', 500);
  await page.keyboard.type(`Table galerie ${T}`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  check(`${T}, galerie : Entrée crée la table sous le nom tapé et ferme la galerie`,
    await page.evaluate(name => window.__gristStub.getActionLog().some(a => a[0] === 'AddTable' && a[1] === name), `Table galerie ${T}`)
    && await page.evaluate(() => document.getElementById('template-preview-modal').style.display === 'none' && document.getElementById('template-gallery-modal').style.display === 'none'));

  // 7) Supprimer un fil de commentaires : la confirmation s'ouvre au clic et y RESTE (le bouton du fil réagit à l'appui, la fenêtre apparaît sous le pointeur).
  await page.evaluate(name => { Editor.setHTML('<p>Un paragraphe à commenter</p>'); document.getElementById('template-name').value = name; }, `Commentaires ${T}`);
  await realClick('#btn-save', 800);
  const para = await centerOf('.tiptap p');
  await page.mouse.click(para.x, para.y, { clickCount: 3 });
  await page.waitForTimeout(150);
  await realClick('#v2-btn-comment', 500);
  await realClick('.v2-comment-popup-reply', 200);
  await page.keyboard.type('Un premier message');
  await realClick('.v2-comment-popup-post', 600);
  const threadRows = () => page.evaluate(() => { const t = window.__gristStub.state.rows.Publipostage_Commentaires; return t ? t.id.length : 0; });
  check(`${T}, commentaire : le fil est posé (une ligne Grist, le bouton « Supprimer le fil » présent)`, (await threadRows()) === 1 && !!(await centerOf('.v2-comment-popup-delete')), await threadRows());
  await realClick('.v2-comment-popup-delete', 400);
  s = await state();
  expectDialog(`${T}, commentaire : « Supprimer ce fil de commentaires ? », le clic réel a ouvert la confirmation et elle est restée ouverte`, s,
    { title: 'Supprimer ce fil de commentaires ?', message: null, buttons: ['Annuler', 'Supprimer'], focus: 'Annuler' });
  await snap(`${T}-s7-commentaire`);
  await click(CANCEL);
  check(`${T}, commentaire : Annuler garde le fil et sa marque`, (await threadRows()) === 1 && !!(await centerOf('.tiptap .comment-mark')), await threadRows());
  await realClick('.v2-comment-popup-delete', 400);
  await click(OK);
  await page.waitForTimeout(700);
  check(`${T}, commentaire : « Supprimer » (clic réel) retire le fil, sa marque et ses lignes`, (await threadRows()) === 0 && !(await centerOf('.tiptap .comment-mark')), await threadRows());

  // 8) Organiser mes modèles : nouveau dossier, sous-dossier, déplacer vers un dossier - la saisie est AU-DESSUS de la fenêtre (Échap ne ferme qu'elle).
  await page.evaluate(async name => {
    Editor.setHTML('<p>Modèle à ranger</p>'); document.getElementById('template-name').value = name;
    document.getElementById('btn-save').click();
  }, `Rangé ${T}`);
  await page.waitForTimeout(900);
  const tplId = await page.evaluate(() => Templates.getCurrentId());
  await page.evaluate(async ({ id, folder }) => { await TemplatePreferences.setFolder(id, folder); }, { id: tplId, folder: `Litiges ${T}` });
  await openOrganize();
  const organizeOpen = () => page.evaluate(() => document.getElementById('template-organize-modal').style.display !== 'none');
  const pending = () => page.evaluate(() => Array.from(document.querySelectorAll('#template-organize-list .tom-pending-folder')).map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  await realClick('#template-organize-new-folder', 300);
  s = await state();
  expectDialog(`${T}, nouveau dossier : « Nouveau dossier » au-dessus d’Organiser, champ vide, bouton Créer`, s,
    { title: 'Nouveau dossier', label: 'Nom du nouveau dossier', message: null, value: '', buttons: ['Annuler', 'Créer'], focus: 'input' });
  check(`${T}, nouveau dossier : Organiser reste ouverte dessous`, await organizeOpen());
  await snap(`${T}-s8-nouveau-dossier`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check(`${T}, nouveau dossier : Échap ferme la saisie SEULE, aucun dossier en attente, Organiser reste ouverte`, !(await isOpen()) && await organizeOpen() && (await pending()).length === 0, await pending());
  await realClick('#template-organize-new-folder', 300);
  await page.keyboard.type(`Archives ${T}`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  check(`${T}, nouveau dossier : Entrée crée le dossier en attente sous le nom tapé`, (await pending()).some(t => t.includes(`Archives ${T}`)), await pending());
  // Sous-dossier : le « + » de la ligne du dossier réel.
  const plusSel = `#template-organize-list .tts-row-folder .tom-add-subfolder-btn`;
  check(`${T}, sous-dossier : le bouton « + » d’un dossier est atteignable dans la fenêtre`, !!(await centerOf(plusSel)) && (await centerOf(plusSel)).onTop);
  await realClick(plusSel, 300);
  s = await state();
  expectDialog(`${T}, sous-dossier : la même fenêtre « Nouveau dossier »`, s, { title: 'Nouveau dossier', label: 'Nom du nouveau dossier', message: null, value: '', buttons: ['Annuler', 'Créer'], focus: 'input' });
  await page.keyboard.type('Sous');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  check(`${T}, sous-dossier : Entrée crée le sous-dossier sous son parent`, (await pending()).some(t => t.includes('/Sous') || t.includes('Sous')), await pending());
  // Déplacer vers…
  const moveSel = `#template-organize-list .tts-row-leaf .tom-move-btn`;
  await realClick(moveSel, 300);
  s = await state();
  expectDialog(`${T}, déplacer vers un dossier : le message donne les dossiers existants, le champ porte le dossier actuel`, s,
    { title: 'Déplacer vers un dossier', message: /^Dossier \(existant ou nouveau\)\. Dossiers existants : .*Litiges/, value: `Litiges ${T}`, buttons: ['Annuler', 'Déplacer'], focus: 'input' });
  await snap(`${T}-s8-deplacer`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const folderOf = () => page.evaluate(id => TemplatePreferences.getFolder(id), tplId);
  check(`${T}, déplacer vers un dossier : Échap ne change rien`, (await folderOf()) === `Litiges ${T}` && await organizeOpen(), await folderOf());
  await realClick(moveSel, 300);
  await page.keyboard.type(`Contrats ${T}`);
  await click(OK);
  await page.waitForTimeout(600);
  check(`${T}, déplacer vers un dossier : « Déplacer » (clic réel) range le modèle dans le dossier tapé`, (await folderOf()) === `Contrats ${T}`, await folderOf());
  await realClick(moveSel, 300);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await click(OK);
  await page.waitForTimeout(600);
  check(`${T}, déplacer vers un dossier : champ vidé puis « Déplacer » sort le modèle de tout dossier ('' et non « annulé »)`, !(await folderOf()), await folderOf());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // 9) Tables liées : supprimer une correspondance - le titre est la question, le message dit les modèles touchés.
  await page.evaluate(async ({ html, name }) => { Editor.setHTML(html); document.getElementById('template-name').value = name; document.getElementById('btn-save').click(); }, { html: `<p>${badge('SiAnnuaire', 'NomPrenom')}</p>`, name: `Lettre ${T}` });
  await page.waitForTimeout(900);
  await realClick('#btn-link-rules', 600);
  const rulesCount = () => page.evaluate(() => GristAPI.getAllLinkRules().length);
  const rulesBefore = await rulesCount();
  await realClick('#link-rules-list .link-rule-btn-delete', 300);
  s = await state();
  expectDialog(`${T}, correspondance : la question est le titre, le message nomme le modèle touché, sur deux lignes`, s,
    { title: 'Supprimer la correspondance configurée pour « SiAnnuaire » ?', message: new RegExp(`^Utilisée dans : .*Lettre ${T}.*\\nLes #Variable de ce modèle ne pourront plus`), buttons: ['Annuler', 'Supprimer'], focus: 'Annuler' });
  await snap(`${T}-s9-correspondance`);
  await click(CANCEL);
  check(`${T}, correspondance : Annuler garde la règle, la fenêtre Tables liées reste ouverte`, (await rulesCount()) === rulesBefore && await page.evaluate(() => document.getElementById('link-rules-modal').style.display !== 'none'), await rulesCount());
  await realClick('#link-rules-list .link-rule-btn-delete', 300);
  await click(OK);
  await page.waitForTimeout(700);
  check(`${T}, correspondance : « Supprimer » (clic réel) retire la règle`, (await rulesCount()) === rulesBefore - 1, await rulesCount());
  await realClick('#link-rules-close', 300);
}

// Interface en anglais : les mêmes fenêtres, les textes de l'autre langue (titres, libellés, verbes des boutons, message d'un export avec ses nombres).
async function runEnglish() {
  const T = 'anglais';
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(200);
  await page.evaluate(() => Editor.setHTML('<p>Text</p>'));
  await realClick('#v2-btn-image');
  let s = await state();
  expectDialog(`${T}, image : titre, libellé et boutons dans la langue de l’interface`, s, { title: 'Insert an image', label: 'Image URL:', message: null, value: '', buttons: ['Cancel', 'Insert'], focus: 'input' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate(() => { Editor.setHTML('<p>Contract</p>'); document.getElementById('template-name').value = 'Template EN'; });
  await realClick('#btn-save', 800);
  await realClick('#btn-save-as');
  s = await state();
  expectDialog(`${T}, enregistrer sous : « Save as (copy) », « Save »`, s, { title: 'Save as (copy)', label: 'Name of the new template:', message: null, value: '', buttons: ['Cancel', 'Save'], focus: 'input' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await realClick('#btn-delete');
  s = await state();
  expectDialog(`${T}, supprimer un modèle : « Delete this template? », focus sur Cancel`, s, { title: 'Delete this template?', message: null, buttons: ['Cancel', 'Delete'], focus: 'Cancel' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await realHover('#v2-btn-quality');
  await realClick('#v2-btn-export-docx-batch', 500);
  s = await state();
  expectDialog(`${T}, export DOCX en lot : le message garde ses nombres et le nom de la table`, s,
    { title: 'Export all rows', message: 'Generate a DOCX for each of the 2 rows in “SiDossiers” and bundle them into a ZIP archive?', buttons: ['Cancel', 'Generate'], focus: 'Generate' });
  await click(CANCEL);
  await openOrganize();
  await realClick('#template-organize-new-folder', 300);
  s = await state();
  expectDialog(`${T}, nouveau dossier : « New folder », « Create »`, s, { title: 'New folder', label: 'New folder name', message: null, value: '', buttons: ['Cancel', 'Create'], focus: 'input' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await realClick('#template-organize-list .tts-row-leaf .tom-move-btn', 300);
  s = await state();
  // Plus aucun dossier à ce stade (le modèle a été sorti du sien plus haut) : c'est le message des « aucun dossier existant ».
  expectDialog(`${T}, déplacer vers un dossier : « Move to a folder », le message est en anglais`, s,
    { title: 'Move to a folder', message: 'Folder (new name). Leave empty for no folder.', buttons: ['Cancel', 'Move'], focus: 'input' });
  await snap('anglais-deplacer');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(200);
}

await run('light');
await runSites('light');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(150);
await run('dark');
await runSites('dark');
await runEnglish();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
