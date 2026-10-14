#!/usr/bin/env node
// Garde « type inconnu » (consigne GFS 002, js/templates.js : isOpenableType) à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre. Un modèle dont TypeModele n'est
// pas un type que le widget sait ouvrir (« presentation » d'une extension de Grist Factory Suite, « hologramme » d'une version plus récente) est préservé :
//  - il n'est ouvert par aucun chemin : ni le modèle choisi pour la vue, ni la règle de ligne, ni la ligne marquée ★ dans la table ne le chargent au démarrage (le vrai ★ s'ouvre) ;
//  - la liste des modèles et « Organiser mes modèles » le montrent grisé, avec la raison sous son nom (deux textes) ; clic et Entrée ne le choisissent pas ; son étoile est grisée ;
//  - rien n'est écrit sur sa ligne, quoi qu'on fasse autour (poser le ★ d'un autre modèle, enregistrer, renommer une colonne) ; Réglages le dit, et la liste des règles ne le propose pas.
// Le faux Grist est semé AVANT l'init (window.__preSeedGristStub, comme dev-tests/verify-template-startup-mouse.mjs) : le démarrage ne se rejoue pas une fois la page prête.
// Lancé par run-headless.mjs (groupe Node "unknownTypeMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-unknown-type-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.UNKNOWN_TYPE_MOUSE_PORT || 8906);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-template-startup-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-unknown-type-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

let total = 0, failures = 0;
let tag = '';
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + tag + name);
  else { failures++; console.log('  FAIL - ' + tag + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];
async function openPage(seed, colorScheme, lang) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
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
  // La langue est lue dans le stockage local avant tout autre script, comme chez une personne qui l'a choisie dans Réglages.
  await page.addInitScript(({ language }) => { try { localStorage.setItem('pp_lang', language); } catch (e) { /* stockage indisponible */ } }, { language: lang });
  await page.addInitScript(`window.__preSeedGristStub = (stub) => { ${seed} };`);
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  return page;
}

// Les modèles : 1 Contrat (document), 2 Présentation 1 (type « presentation », une extension de GFS ; ★ posé dans la table, contenu qui n'est pas du HTML), 3 Fiche (le vrai ★ du document),
// 4 Nouveauté (type « hologramme », que personne ne sait nommer). Le modèle de la vue ET la règle de ligne désignent le 2 ; la ligne reçue dès l'abonnement est « Urgent ».
const SEED = `
  const m = stub.state.rows.Publipostage_Modeles;
  m.TypeModele = [];
  const add = (id, nom, contenu, def, type) => { m.id.push(id); m.Nom.push(nom); m.Contenu.push(contenu); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(def); m.TypeModele.push(type); };
  add(1, 'Contrat', '<p>Contenu contrat</p>', false, 'document');
  add(2, 'Présentation 1', '{"diapositives":[{"titre":"Bonjour"}]}', true, 'presentation');
  add(3, 'Fiche', '<p>Contenu fiche</p>', true, 'document');
  add(4, 'Nouveauté', '{"version":9}', false, 'hologramme');
  stub.state.nextRowId.Publipostage_Modeles = 5;
  stub.setVariables('PpDepart', { Nom: 'Text', Statut: 'Choice' }, { Statut: ['Urgent', 'Autre'] });
  stub.state.options = ${JSON.stringify({ modeleDeLaVue: '2', modeleSelonLigne: { enabled: true, rules: [{ column: 'Statut', operator: '=', value: 'Urgent', modeleId: '2' }], otherwise: 'default' } })};
  const rec = { id: 1, Nom: 'L1', Statut: 'Urgent' };
  stub.state.recordCallbacks = Object.assign([], { push(entry) { Array.prototype.push.call(this, entry); entry.cb(rec, { tableId: 'PpDepart' }); return this.length; } });
`;

const TEXTS = {
  fr: {
    extension: 'Demande l’extension Diapositives (Grist Factory Suite)',
    newer: 'Créé avec une version plus récente de Publipostage+',
    starTip: 'Ce modèle ne s’ouvre pas ici : il ne peut pas être le modèle par défaut du document',
    viewStatus: 'Modèle de cette vue : « Présentation 1 ». Demande l’extension Diapositives (Grist Factory Suite). Il ne s’ouvre pas ici : le modèle par défaut du document s’ouvre à la place.',
  },
  en: {
    extension: 'Needs the Diapositives extension (Grist Factory Suite)',
    newer: 'Created with a newer version of Publipostage+',
    starTip: 'This template cannot be opened here: it cannot be the document’s default template',
    viewStatus: 'Template for this view: “Présentation 1”. Needs the Diapositives extension (Grist Factory Suite). It cannot be opened here: the document’s default template opens instead.',
  },
};

const rgb = css => { const m = /rgba?\(([^)]+)\)/.exec(css || ''); if (!m) return null; const [r, g, b, a] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a: a === undefined ? 1 : a }; };
const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

async function run(lang, colorScheme) {
  tag = `[${lang} ${colorScheme}] `;
  const t = TEXTS[lang];
  const page = await openPage(SEED, colorScheme, lang);
  const state = () => page.evaluate(() => {
    const trigger = document.querySelector('.tts-trigger');
    return { current: Templates.getCurrentId(), list: document.getElementById('template-select').value, name: document.getElementById('template-name').value, text: document.querySelector('.ProseMirror').textContent, trigger: trigger ? trigger.textContent.trim() : null, defaultId: Templates.getDefaultId() };
  });
  // Les actions écrites sur les lignes 2 et 4 depuis le démarrage (le journal du faux Grist), et leur état dans la table.
  const writesOnUnknown = () => page.evaluate(() => window.__gristStub.getActionLog().filter(a => a[1] === 'Publipostage_Modeles' && /Record$/.test(a[0]) && [2, 4].includes(a[2])));
  const rowsSnapshot = () => page.evaluate(() => JSON.stringify([2, 4].map(id => window.__gristStub.getRow('Publipostage_Modeles', id))));
  const centerOf = (selector) => page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
  }, selector);
  const click = async (selector) => { const c = await centerOf(selector); if (c) await page.mouse.click(c.x, c.y); return c; };
  const hover = async (selector) => { const c = await centerOf(selector); if (c) await page.mouse.move(c.x, c.y); return c; };

  // --- Démarrage : le modèle de la vue, la règle de ligne et la ligne marquée ★ dans la table désignent tous le type inconnu ; c'est le vrai ★ qui s'ouvre.
  const started = await state();
  check('au démarrage, ni le modèle de la vue, ni la règle de ligne, ni la ligne ★ d’un type inconnu ne s’ouvrent : le vrai ★ du document s’ouvre',
    started.name === 'Fiche' && String(started.current) === '3' && String(started.list) === '3' && started.text === 'Contenu fiche' && (started.trigger || '').startsWith('Fiche'), started);
  check('le ★ du document est la ligne ordinaire, pas la ligne d’un type inconnu qui le porte aussi dans la table', String(started.defaultId) === '3', started);

  // Une extension qui nomme son type (aujourd'hui aucune n'en déclare) : « Présentation 1 » dit alors l'extension demandée, « Nouveauté » reste « version plus récente ».
  const declared = await page.evaluate(() => { try { Templates.declareExtensionType('presentation', 'Diapositives'); return true; } catch (e) { return String(e && e.message || e); } });
  check('une extension déclare le nom de son type', declared === true, declared);

  // --- La liste des modèles (700x400), à la vraie souris.
  await click('.tts-trigger');
  await page.waitForSelector('.tts-popup.is-open', { timeout: 5000 }).catch(() => {});
  const popup = await page.evaluate((texts) => {
    const pop = document.querySelector('.tts-popup');
    const info = id => {
      const row = pop.querySelector('.tts-row-leaf[data-template-id="' + id + '"]');
      if (!row) return null;
      const label = row.querySelector('.tts-row-label');
      const reason = row.querySelector('.tts-row-reason');
      const star = row.querySelector('.tts-star-btn');
      const rr = row.getBoundingClientRect(), lr = label.getBoundingClientRect(), pr = pop.getBoundingClientRect();
      const rs = reason ? reason.getBoundingClientRect() : null;
      return {
        unavailable: row.classList.contains('is-unavailable'), ariaDisabled: row.getAttribute('aria-disabled'), reason: reason ? reason.textContent : null,
        starDisabled: !!star && star.classList.contains('is-disabled') && star.getAttribute('aria-disabled') === 'true', starTitle: star ? star.title : null,
        reasonBelowLabel: !!rs && rs.top >= lr.bottom - 1, reasonInside: !!rs && rs.left >= pr.left && rs.right <= pr.right + 0.5, rowHeight: Math.round(rr.height),
        labelColor: getComputedStyle(label).color, reasonColor: reason ? getComputedStyle(reason).color : null,
        iconMask: getComputedStyle(row.querySelector('.tts-icon')).webkitMaskImage || getComputedStyle(row.querySelector('.tts-icon')).maskImage,
      };
    };
    const pr = pop.getBoundingClientRect();
    return { p: info(2), n: info(4), doc: info(1), fiche: info(3), popupInside: pr.top >= 0 && pr.bottom <= innerHeight && pr.left >= 0 && pr.right <= innerWidth, popupBg: getComputedStyle(pop).backgroundColor, open: pop.classList.contains('is-open'), texts };
  }, t);
  check('« Présentation 1 » est listée, grisée, avec « Demande l’extension {nom} (Grist Factory Suite) » sous son nom', !!popup.p && popup.p.unavailable && popup.p.ariaDisabled === 'true' && popup.p.reason === t.extension, popup.p);
  check('« Nouveauté » (type que personne ne nomme) est listée, grisée, avec « Créé avec une version plus récente de Publipostage+ »', !!popup.n && popup.n.unavailable && popup.n.ariaDisabled === 'true' && popup.n.reason === t.newer, popup.n);
  check('les modèles ordinaires ne sont pas grisés et n’ont pas de raison', !!popup.doc && !!popup.fiche && !popup.doc.unavailable && !popup.fiche.unavailable && popup.doc.reason === null && popup.fiche.reason === null, { doc: popup.doc, fiche: popup.fiche });
  check('la raison est sous le nom, dans le panneau, et la liste tient dans la fenêtre de 700x400', !!popup.p && !!popup.n && popup.p.reasonBelowLabel && popup.p.reasonInside && popup.n.reasonBelowLabel && popup.n.reasonInside && popup.popupInside, { p: popup.p, n: popup.n, popupInside: popup.popupInside });
  check('leurs étoiles sont grisées (jamais retirées) et l’info-bulle dit pourquoi', !!popup.p && !!popup.n && popup.p.starDisabled && popup.n.starDisabled && popup.p.starTitle === t.starTip && popup.n.starTitle === t.starTip, { p: popup.p, n: popup.n });
  check('leur icône est celle du document (une classe sans tracé serait un carré plein)', !!popup.p && /url/.test(popup.p.iconMask || '') && !!popup.n && /url/.test(popup.n.iconMask || ''), { p: popup.p && popup.p.iconMask, n: popup.n && popup.n.iconMask });
  if (popup.p && popup.n) {
    const bg = rgb(popup.popupBg);
    const ratios = [popup.p.labelColor, popup.p.reasonColor, popup.n.labelColor, popup.n.reasonColor].map(c => bg && rgb(c) ? Math.round(ratio(rgb(c), bg) * 100) / 100 : 0);
    check('nom et raison grisés gardent un contraste d’au moins 4,5:1 sur le fond de la liste', ratios.every(r => r >= 4.5), ratios);
  }

  await page.screenshot({ path: `/tmp/unknown-type-list-${lang}-${colorScheme}.png` }).catch(() => {});
  // Un clic à la vraie souris sur la ligne grisée ne choisit rien ; la liste reste ouverte.
  const before = await rowsSnapshot();
  for (const id of [2, 4]) {
    const row = await centerOf(`.tts-popup .tts-row-leaf[data-template-id="${id}"] .tts-row-label`);
    if (row) await page.mouse.click(row.x, row.y);
    await page.waitForTimeout(200);
    const after = await state();
    const open = await page.evaluate(() => document.querySelector('.tts-popup').classList.contains('is-open'));
    check(`un clic sur la ligne grisée du modèle ${id} n’ouvre rien et laisse la liste ouverte`, String(after.current) === '3' && String(after.list) === '3' && after.text === 'Contenu fiche' && open, { after, open });
  }
  // Au clavier : les flèches atteignent la ligne (lecture d'écran), Entrée et Espace ne la choisissent pas.
  await page.focus('.tts-popup .tts-row-leaf[data-template-id="3"]').catch(() => {});
  await page.keyboard.press('ArrowDown'); // Nouveauté
  const focusN = await page.evaluate(() => document.activeElement && document.activeElement.dataset.templateId);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown'); // Présentation 1
  const focusP = await page.evaluate(() => document.activeElement && document.activeElement.dataset.templateId);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  const afterKeys = await state();
  check('au clavier, les flèches atteignent les lignes grisées, Entrée et Espace ne les ouvrent pas', focusN === '4' && focusP === '2' && String(afterKeys.current) === '3' && afterKeys.text === 'Contenu fiche', { focusN, focusP, afterKeys });
  // L'étoile grisée d'une ligne : un clic à la vraie souris n'écrit rien.
  await hover('.tts-popup .tts-row-leaf[data-template-id="2"]');
  await click('.tts-popup .tts-row-leaf[data-template-id="2"] .tts-star-btn');
  await page.waitForTimeout(300);
  const afterStar = await state();
  check('l’étoile grisée de la ligne d’un type inconnu ne pose pas le ★', String(afterStar.defaultId) === '3' && (await writesOnUnknown()).length === 0, { afterStar, writes: await writesOnUnknown() });

  // --- « Organiser mes modèles » : les mêmes lignes grisées, avec leur raison.
  await click('#btn-organize-templates');
  await page.waitForFunction(() => { const m = document.getElementById('template-organize-modal'); return !!m && m.style.display !== 'none' && m.getBoundingClientRect().height > 0; }, null, { timeout: 5000 }).catch(() => {});
  const organize = await page.evaluate(() => {
    const list = document.getElementById('template-organize-list');
    const box = document.querySelector('#template-organize-modal .pp-modal-box');
    const info = id => {
      const row = list.querySelector('.tts-row-leaf[data-template-id="' + id + '"]');
      if (!row) return null;
      const reason = row.querySelector('.tts-row-reason');
      const star = row.querySelector('.tts-star-btn');
      const rs = reason ? reason.getBoundingClientRect() : null;
      const br = box.getBoundingClientRect();
      const lr = list.getBoundingClientRect();
      let bg = null;
      for (let node = row; node && !bg; node = node.parentElement) { const c = getComputedStyle(node).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) bg = c; }
      return {
        unavailable: row.classList.contains('is-unavailable'), ariaDisabled: row.getAttribute('aria-disabled'), reason: reason ? reason.textContent : null,
        starDisabled: !!star && star.classList.contains('is-disabled') && star.getAttribute('aria-disabled') === 'true', reasonInside: !!rs && rs.right <= br.right + 0.5 && rs.left >= br.left,
        reasonColor: reason ? getComputedStyle(reason).color : null, bg, listWidthOk: lr.right <= br.right + 0.5,
      };
    };
    return { p: info(2), n: info(4), doc: info(1) };
  });
  await page.screenshot({ path: `/tmp/unknown-type-organize-${lang}-${colorScheme}.png` }).catch(() => {});
  check('« Organiser mes modèles » liste « Présentation 1 » grisée avec la raison de l’extension', !!organize.p && organize.p.unavailable && organize.p.ariaDisabled === 'true' && organize.p.reason === t.extension && organize.p.reasonInside, organize.p);
  check('« Organiser mes modèles » liste « Nouveauté » grisée avec la raison de la version plus récente', !!organize.n && organize.n.unavailable && organize.n.ariaDisabled === 'true' && organize.n.reason === t.newer && organize.n.reasonInside, organize.n);
  check('leurs étoiles y sont grisées, celle d’un modèle ordinaire ne l’est pas', !!organize.p && !!organize.n && !!organize.doc && organize.p.starDisabled && organize.n.starDisabled && !organize.doc.starDisabled, organize);
  if (organize.p && rgb(organize.p.reasonColor) && rgb(organize.p.bg)) {
    const r = Math.round(ratio(rgb(organize.p.reasonColor), rgb(organize.p.bg)) * 100) / 100;
    check('la raison garde un contraste d’au moins 4,5:1 dans la fenêtre', r >= 4.5, r);
  }
  // Son étoile grisée n'écrit rien ; poser le ★ d'un modèle ordinaire (« Contrat ») démarque « Fiche », jamais les lignes d'un type inconnu qui portent le drapeau.
  await hover('#template-organize-list .tts-row-leaf[data-template-id="2"]');
  await click('#template-organize-list .tts-row-leaf[data-template-id="2"] .tts-star-btn');
  await page.waitForTimeout(300);
  const writesAfterStarP = await writesOnUnknown();
  await page.evaluate(() => window.__gristStub.clearActionLog());
  await hover('#template-organize-list .tts-row-leaf[data-template-id="1"]');
  await click('#template-organize-list .tts-row-leaf[data-template-id="1"] .tts-star-btn');
  await page.waitForFunction(() => String(Templates.getDefaultId()) === '1', null, { timeout: 5000 }).catch(() => {});
  const log = await page.evaluate(() => window.__gristStub.getActionLog().filter(a => a[1] === 'Publipostage_Modeles' && a[0] === 'UpdateRecord').map(a => [a[2], a[3]]));
  const cacheFlags = await page.evaluate(() => Templates.getCached().filter(x => [2, 4].includes(Number(x.id))).map(x => [x.id, x.estParDefaut]));
  const tableFlag = await page.evaluate(() => window.__gristStub.getRow('Publipostage_Modeles', 2).EstParDefaut);
  check('son étoile grisée n’écrit rien', writesAfterStarP.length === 0, writesAfterStarP);
  check('poser le ★ d’un autre modèle écrit « Fiche » (démarqué) et « Contrat » (marqué), jamais la ligne d’un type inconnu', log.length === 2 && log.every(([id]) => id === 1 || id === 3) && (await writesOnUnknown()).length === 0, { log, cacheFlags });
  check('la ligne du type inconnu garde son drapeau dans la table, comme une autre version ou une extension l’a écrit', tableFlag === true && cacheFlags.some(([id, flag]) => Number(id) === 2 && flag === true), { tableFlag, cacheFlags });
  await click('#template-organize-close');
  await page.waitForTimeout(300);

  // --- Réglages : le modèle de la vue est dit indisponible, et la liste des règles ne propose pas la ligne.
  await click('#v2-btn-settings');
  await page.waitForTimeout(300);
  await click('.settings-tab[data-settings-tab="rowTemplate"]');
  await page.waitForTimeout(400);
  const settings = await page.evaluate(() => {
    const status = document.getElementById('settings-viewtemplate-status');
    const opts = Array.from(document.querySelectorAll('#settings-rowtemplate-rules select.macro-rule-modele option, #settings-rowtemplate-otherwise option')).map(o => [o.value, o.dataset.unavailable || '']);
    return { status: status ? status.textContent : null, opts };
  });
  check('Réglages > Vue dit que le modèle de la vue ne s’ouvre pas ici, avec la raison', settings.status === t.viewStatus, settings.status);
  check('les listes de modèles des règles marquent « Présentation 1 » et « Nouveauté » indisponibles (grisées, jamais choisies)',
    settings.opts.filter(([v, why]) => v === '2' && why === t.extension).length >= 1 && settings.opts.filter(([v, why]) => v === '4' && why === t.newer).length >= 1 && settings.opts.filter(([v, why]) => (v === '1' || v === '3') && why).length === 0, settings.opts);
  await click('#settings-close');
  await page.waitForTimeout(400);

  // --- Rien n'est écrit sur la ligne d'un type inconnu, par aucune porte de l'API.
  const api = await page.evaluate(async () => {
    const out = {};
    const attempt = async (name, fn) => { try { await fn(); out[name] = 'écrit'; } catch (e) { out[name] = 'refusé'; } };
    await attempt('save', () => Templates.save(2, 'Présentation 1', '<p>abîmé</p>', '', null, null, 'document', null));
    await attempt('saveContent', () => Templates.saveContent(2, '<p>abîmé</p>'));
    await attempt('saveAs', () => Templates.save(4, 'Nouveauté', '<p>abîmé</p>', '', null, null, 'document', null));
    await Templates.setDefault(2);
    await Templates.setDefault(4);
    return out;
  });
  check('enregistrer ou marquer ★ une ligne d’un type inconnu est refusé avant toute écriture', api.save === 'refusé' && api.saveContent === 'refusé' && api.saveAs === 'refusé', api);
  const finalWrites = await writesOnUnknown();
  const after = await rowsSnapshot();
  check('à la fin, aucune action n’a touché les lignes d’un type inconnu et leur contenu est celui du départ', finalWrites.length === 0 && after === before, { finalWrites, same: after === before });

  // --- Le reste de la liste marche comme avant : choisir « Contrat » à la vraie souris l'ouvre.
  await click('.tts-trigger');
  await page.waitForSelector('.tts-popup.is-open', { timeout: 5000 }).catch(() => {});
  await click('.tts-popup .tts-row-leaf[data-template-id="1"] .tts-row-label');
  await page.waitForFunction(() => String(Templates.getCurrentId()) === '1', null, { timeout: 5000 }).catch(() => {});
  const opened = await state();
  check('un modèle ordinaire se choisit toujours à la vraie souris', opened.name === 'Contrat' && opened.text === 'Contenu contrat', opened);
  await page.screenshot({ path: `/tmp/unknown-type-${lang}-${colorScheme}.png` }).catch(() => {});
  await page.context().close();
}

await run('fr', 'light');
await run('en', 'dark');

tag = '';
check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
