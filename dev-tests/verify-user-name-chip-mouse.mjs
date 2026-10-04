#!/usr/bin/env node
// Puce « Nom de l’utilisateur » (demande d'Antoine du 2026-10-04 : « une puce intelligente [...] pour récupérer son nom », sur le modèle de celle de l'email) à la VRAIE souris
// (page.mouse / page.keyboard, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en français puis en anglais. dev-tests/scenarios-chips.js vérifie la
// résolution DANS la page (Lecture, aperçu des exports, PDF, Word) et dev-tests/unit-user-identity.mjs la lecture du nom dans Grist ; ici, ce que seule une vraie souris prouve :
//  - la liste « # », son onglet Chips : neuf lignes, « Nom de l’utilisateur » JUSTE après « Email de l’utilisateur », entière dans le panneau et au premier plan ; « Calcul », en
//    dernier, reste atteignable ;
//  - UN clic sur la ligne pose la puce à la place du « # », la liste se ferme, la puce tient sur une ligne et la frappe suivante s'écrit après elle ;
//  - en Lecture, le nom de la personne remplace la puce (« Bonjour Ada Lovelace. »), à côté de la puce Email lue dans la même passe : une seule table-sonde, une seule colonne ajoutée ;
//  - un compte sans nom : « [Nom indisponible] » à la place du nom, comme l'email sans adresse (« [Name unavailable] » en anglais) ;
//  - en anglais : « User’s name » dans la liste, juste après « User’s email », sur une ligne qui ne coupe rien.
// Lancé par run-headless.mjs (groupe Node "userNameChipMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-user-name-chip-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.USER_NAME_CHIP_MOUSE_PORT || 8964);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-cond-checkbox-mouse.mjs.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-user-name-chip-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

// USER_NAME_CHIP_SHOTS=<dossier> : enregistre des captures aux moments clés, à relire à l'œil.
const SHOTS = process.env.USER_NAME_CHIP_SHOTS || '';
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];

// Le widget d'une personne qui a choisi sa langue dans Réglages : elle est lue dans le stockage local avant tout autre script.
async function openWidget(lang) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, bypassCSP: true });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => { pageErrors.push('boîte inattendue : ' + d.message()); d.accept().catch(() => {}); });
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
  await page.addInitScript(l => { try { localStorage.setItem('pp_lang', l); } catch (e) { /* stockage indisponible */ } }, lang);
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  // Aperçu A4, le réglage d'Antoine (page réduite dans le panneau).
  await page.evaluate(() => { document.getElementById('editor-container').classList.add('a4-preview'); });
  return { context, page };
}

// Centre d'un élément, entièrement dans le panneau ?, au premier plan (un contrôle recouvert par autre chose ne recevrait pas le clic) ? et son texte tient-il dans sa boîte ?
async function hitTest(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height,
      inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}
// Une ligne de liste retrouvée par son texte exact (la liste « # » n'a pas d'identifiant par ligne).
async function hitByText(page, selector, text) {
  return page.evaluate(({ selector, text }) => {
    const el = Array.from(document.querySelectorAll(selector)).find(e => e.textContent.trim() === text);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
      // Le texte de la ligne tient : rien n'est rogné à droite.
      fits: el.scrollWidth <= el.clientWidth + 0.5,
    };
  }, { selector, text });
}
// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, box) {
  await page.mouse.move(box.x - 6, box.y, { steps: 2 });
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
}
// Garer la souris au bord droit de la feuille, à la hauteur visée : sur son chemin vers le texte, elle ne survole plus la barre du haut, dont un menu au survol (style de
// paragraphe, …) s'ouvrirait sous le pointeur et recevrait le clic à la place du paragraphe.
const park = (page, y) => page.mouse.move(WIDTH - 4, y);

const ROWS = {
  fr: { footnote: 'Note de bas de page', date: 'Date du jour', time: 'Heure actuelle', email: 'Email de l’utilisateur', name: 'Nom de l’utilisateur', calc: 'Calcul' },
  en: { footnote: 'Footnote', date: 'Today’s date', time: 'Current time', email: 'User’s email', name: 'User’s name', calc: 'Calculation' },
};
const UNAVAILABLE = { fr: '[Nom indisponible]', en: '[Name unavailable]' };

// Pose une puce comme une personne : un vrai clic dans le paragraphe (par son propre rectangle, jamais à un décalage fixe du haut de la page), la frappe du texte qui la précède,
// le bouton « Insérer une variable », l'onglet Chips, puis un clic sur la ligne. `measure` : mesure la liste (neuf lignes, ordre, lignes atteignables) avant de choisir.
async function placeChip(page, label, { lang, paragraph, before, entry, measure }) {
  const target = await page.evaluate(i => {
    const p = document.querySelectorAll('.tiptap > p')[i];
    p.scrollIntoView({ block: 'center' });
    const r = p.getBoundingClientRect();
    return { x: r.left + 40, y: r.top + r.height / 2 };
  }, paragraph);
  await park(page, target.y);
  await realClick(page, target);
  await page.keyboard.type(before);
  const insertButton = await hitTest(page, '#v2-btn-insert-variable');
  check(`${label} - le bouton « Insérer une variable » est dans le panneau et au premier plan`, insertButton.found && insertButton.inViewport && insertButton.onTop, insertButton);
  await realClick(page, insertButton);
  await page.waitForTimeout(250);
  const panel = await hitTest(page, '#autocomplete-box');
  check(`${label} - la liste « # » s'ouvre entièrement dans le panneau`, panel.found && panel.inViewport, panel);
  const chipsTab = await hitTest(page, '#autocomplete-box .ac-tab[data-tab="chips"]');
  check(`${label} - l'onglet Chips est atteignable à la vraie souris`, chipsTab.found && chipsTab.inViewport && chipsTab.onTop, chipsTab);
  await realClick(page, chipsTab);
  await page.waitForTimeout(150);
  const wanted = await hitByText(page, '#autocomplete-box .ac-item', entry);
  check(`${label} - la ligne « ${entry} » est dans l'onglet Chips, entière dans le panneau, au premier plan, texte non rogné`, wanted.found && wanted.inViewport && wanted.onTop && wanted.fits, wanted);
  if (measure) {
    const items = await page.evaluate(() => Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).map(i => i.textContent.trim()));
    const R = ROWS[lang];
    check(`${label} - neuf lignes, « ${R.name} » juste après « ${R.email} », « ${R.calc} » en dernier`,
      items.length === 9 && items.indexOf(R.name) === items.indexOf(R.email) + 1 && items.indexOf(R.email) === 3 && items[8] === R.calc && items[0] === R.footnote, items);
    await shot(page, `${lang}-liste-chips`);
    // La liste a son propre défilement (hauteur limitée à la place libre autour du curseur) : « Calcul », la dernière ligne, doit rester atteignable à la molette posée sur elle.
    const reach = async name => {
      let found = await hitByText(page, '#autocomplete-box .ac-item', name);
      let wheels = 0;
      while (found.found && !(found.inViewport && found.onTop) && wheels < 6) {
        const list = await hitTest(page, '#autocomplete-box .ac-items');
        await page.mouse.move(list.x, list.y);
        await page.mouse.wheel(0, 60);
        await page.waitForTimeout(120);
        found = await hitByText(page, '#autocomplete-box .ac-item', name);
        wheels++;
      }
      return { found, wheels };
    };
    const last = await reach(R.calc);
    check(`${label} - « ${R.calc} », dernière ligne, reste atteignable à la molette posée sur la liste`, last.found.found && last.found.inViewport && last.found.onTop, last);
    // La molette a fait défiler la liste : on ramène la ligne cherchée sous la souris avant de cliquer.
    const back = await reach(entry);
    check(`${label} - « ${entry} » se retrouve à la molette, entière et au premier plan`, back.found.found && back.found.inViewport && back.found.onTop, back);
  }
  const row = await hitByText(page, '#autocomplete-box .ac-item', entry);
  if (row.found) await realClick(page, row);
  await page.waitForTimeout(350);
  return row;
}

// Un document Grist avec une ligne sélectionnée : sans elle, la Lecture n'affiche que « Aucune ligne sélectionnée ».
const TABLE = 'NcDossiers';
async function seedPage(page, html) {
  await page.evaluate(async ({ table, html }) => {
    const stub = window.__gristStub;
    stub.setVariables(table, { Titre: 'Text' });
    stub.setRows(table, [{ id: 1, Titre: 'Dossier A' }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Titre: 'Dossier A' }, table);
    Editor.setHTML(html);
  }, { table: TABLE, html });
  await page.waitForTimeout(400);
}

const chipsInEditor = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap .smart-chip')).map(c => {
  const r = c.getBoundingClientRect();
  return { kind: c.getAttribute('data-chip-kind'), label: c.textContent.trim(), lines: c.getClientRects().length, inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 };
}));
const paragraphText = (page, i) => page.evaluate(n => document.querySelectorAll('.tiptap > p')[n].textContent, i);

async function runCase({ lang, name, email, title }) {
  const R = ROWS[lang];
  console.log(`\n=== ${title}, ${WIDTH}x${HEIGHT}, interface ${lang === 'en' ? 'anglaise' : 'française'} ===`);
  const { context, page } = await openWidget(lang);
  const label = lang === 'en' ? 'anglais' : 'français';
  check(`${label} - l'interface est bien en ${lang === 'en' ? 'anglais' : 'français'}`, await page.evaluate(l => I18n.getLang() === l && document.documentElement.lang === l, lang));
  // Ce que Grist répond à la formule déclenchée de la table-sonde : le nom (ou rien, pour un compte sans nom) et l'adresse de la personne qui ouvre le document.
  await page.evaluate(({ name, email }) => {
    window.__gristStub.setUserName(name);
    window.__gristStub.setUserEmail(email);
  }, { name, email });
  await seedPage(page, '<p></p><p></p>');

  // 1) La pose : un clic sur la ligne, la puce remplace « # », la liste se ferme, la frappe suivante s'écrit après la puce.
  await placeChip(page, label, { lang, paragraph: 0, before: lang === 'en' ? 'Hello ' : 'Bonjour ', entry: R.name, measure: true });
  const listClosed = !(await hitTest(page, '#autocomplete-box')).inViewport;
  let chips = await chipsInEditor(page);
  check(`${label} - un clic sur la ligne : une seule puce « ${R.name} » remplace « # », sur une ligne, dans le panneau, et la liste se ferme`,
    chips.length === 1 && chips[0].kind === 'name' && chips[0].label === R.name && chips[0].lines === 1 && chips[0].inViewport && listClosed, { chips, listClosed });
  const html = await page.evaluate(() => EditorCore.getEditor().getHTML());
  check(`${label} - le HTML enregistré garde la puce (data-chip-kind="name") et pas de « # »`, html.indexOf('data-chip-kind="name"') !== -1 && html.indexOf('#') === -1, html);
  await page.keyboard.type('.');
  check(`${label} - le curseur est après la puce : la frappe suivante s'écrit derrière elle`, (await paragraphText(page, 0)).endsWith(R.name + '.'), await paragraphText(page, 0));
  await shot(page, `${lang}-puce-posee`);

  // 2) La puce Email dans le même document : les deux se lisent dans la même passe.
  if (email) {
    await placeChip(page, label, { lang, paragraph: 1, before: lang === 'en' ? 'Mail: ' : 'Courriel : ', entry: R.email, measure: false });
    chips = await chipsInEditor(page);
    check(`${label} - la puce « ${R.email} » se pose à côté : deux puces, ${R.name} puis ${R.email}`, chips.length === 2 && chips[0].kind === 'name' && chips[1].kind === 'email', chips);
  }

  // 3) La Lecture : le nom de la personne remplace la puce ; sans nom, le message d'indisponibilité de la langue, en rouge.
  await realClick(page, await hitTest(page, '#btn-mode-read'));
  await page.waitForTimeout(900);
  const reading = () => page.evaluate(() => {
    const reader = document.getElementById('reader-container');
    const shown = Array.from(reader.querySelectorAll('.resolved-var')).map(el => {
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { text: el.textContent, flagged: el.classList.contains('error-msg'), color: getComputedStyle(el).color, inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 };
    });
    const stub = window.__gristStub;
    return {
      shown: reader.style.display === 'block', text: reader.textContent.replace(/\s+/g, ' ').trim(), values: shown, chipsLeft: reader.querySelectorAll('.smart-chip').length,
      overflowX: reader.scrollWidth - reader.clientWidth,
      probeTables: Object.keys(stub.state.rows).filter(t => /^Publipostage_UserProbe/.test(t)),
      addColumns: stub.countActions('AddColumn', 'Publipostage_UserProbe'),
    };
  });
  let read = await reading();
  await page.waitForTimeout(200);
  read = await reading();
  const nameValue = read.values[0];
  if (name) {
    check(`${label} - Lecture : « ${name} » remplace la puce, en texte normal, dans le panneau, et la feuille ne déborde pas`,
      read.shown && read.chipsLeft === 0 && !!nameValue && nameValue.text === name && !nameValue.flagged && nameValue.inViewport && read.overflowX <= 1 && new RegExp((lang === 'en' ? 'Hello ' : 'Bonjour ') + name + '\\.').test(read.text), read);
  } else {
    // Comme l'email sans adresse : le repli est du texte ordinaire, marqué en erreur par sa classe seulement (la Lecture ne le colore pas).
    check(`${label} - Lecture : « ${UNAVAILABLE[lang]} » remplace la puce, dans le panneau, marqué en erreur comme l'email sans adresse, et la feuille ne déborde pas`,
      read.shown && read.chipsLeft === 0 && !!nameValue && nameValue.text === UNAVAILABLE[lang] && nameValue.flagged && nameValue.inViewport && read.overflowX <= 1
      && new RegExp((lang === 'en' ? 'Hello ' : 'Bonjour ') + UNAVAILABLE[lang].replace(/[[\]]/g, '\\$&') + '\\.').test(read.text), read);
  }
  if (email) {
    const emailValue = read.values[1];
    check(`${label} - Lecture : l'adresse de la même personne s'affiche à côté, lue dans la même passe (une seule table-sonde, une seule colonne Name ajoutée)`,
      !!emailValue && emailValue.text === email && !emailValue.flagged && read.probeTables.length === 1 && read.addColumns <= 1, read);
  }
  await shot(page, `${lang}-lecture`);

  // 4) Retour à l'édition : la puce est toujours là (la Lecture ne l'a pas remplacée dans le modèle).
  await realClick(page, await hitTest(page, '#btn-mode-edit'));
  await page.waitForTimeout(500);
  chips = await chipsInEditor(page);
  check(`${label} - retour à l'édition : la puce « ${R.name} » est toujours dans le modèle`, chips.length >= 1 && chips[0].kind === 'name' && chips[0].label === R.name, chips);

  await context.close();
}

try {
  await runCase({ lang: 'fr', name: 'Ada Lovelace', email: 'ada@example.org', title: 'Puce « Nom de l’utilisateur », compte nommé' });
  await runCase({ lang: 'fr', name: null, email: null, title: 'Puce « Nom de l’utilisateur », compte sans nom' });
  await runCase({ lang: 'en', name: null, email: null, title: 'User’s name chip, nameless account' });
} finally {
  check('aucune erreur de page ni boîte inattendue', pageErrors.length === 0, pageErrors);
  await browser.close();
  server.close();
}
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
