#!/usr/bin/env node
// Refait les deux captures du README public sur l'interface du jour : le modèle « Contrat de prestation de services » de la galerie (templates-gallery/), une ligne d'exemple de la
// table Contrat_Prestation (des données fictives), 1400×680 pixels CSS à l'échelle 2 (2800×1360), en thème clair.
//   edition-variables.png : l'Édition, les variables en bulles ;   lecture-resolue.png : la Lecture, les mêmes variables résolues avec la ligne d'exemple.
// Hors Grist : le faux Grist de dev-tests/ (grist-stub.js), et le miroir hors-ligne des bibliothèques (dev-tests/.offline-cache/, voir dev-tests/offline-deps.sh) quand il existe ; sans lui,
// la page va chercher ses bibliothèques sur les CDN. La police de l'interface est fixée sur Roboto, celle que la page embarque pour le document : sur une machine de test sans la police
// habituelle d'un poste de travail, `system-ui` donnerait DejaVu Sans, bien plus large que ce que verrait la personne.
// Usage : node outils/depot-propre/captures-readme.mjs [--sortie <dossier>]      (par défaut outils/depot-propre/public/screenshots/ ; publier.sh les pose dans screenshots/ du dépôt public)
// Écrit aussi _test-harness.html à la racine du dépôt de développement (ignoré par git), comme dev-tests/generate-harness.sh.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ICI = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(ICI, '..', '..');
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const argSortie = process.argv.indexOf('--sortie');
const SORTIE = resolve(argSortie > 0 ? process.argv[argSortie + 1] : join(ICI, 'public', 'screenshots'));
const WIDTH = 1400;
const HEIGHT = 680;
const FONT_UI = "Roboto, 'Helvetica Neue', Arial, sans-serif";
await mkdir(SORTIE, { recursive: true });

// Même régénération du harnais que dev-tests/generate-harness.sh : la page réelle, l'API de Grist remplacée par le stub.
const html = await readFile(join(ROOT, 'index.html'), 'utf8');
await writeFile(join(ROOT, '_test-harness.html'), html.replace('<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>', '<script src="dev-tests/grist-stub.js"></script>'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = createServer(async (req, res) => {
  try {
    const filePath = join(ROOT, normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(target));
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((ok, ko) => server.listen(0, '127.0.0.1', ok).on('error', ko));
const BASE = `http://127.0.0.1:${server.address().port}`;

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }

// Le miroir hors-ligne des bibliothèques de l'éditeur (esm.sh) : les bundles s'importent entre eux en relatif, réécrit en absolu pour que le même module ne soit pas chargé deux fois.
const esmMapPath = join(CACHE, 'esm-map.json');
const OFFLINE = existsSync(esmMapPath);
const esmMap = OFFLINE ? JSON.parse(readFileSync(esmMapPath, 'utf8')) : {};
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

const TEMPLATE = await readFile(join(ROOT, 'templates-gallery', 'contrat-prestation-services', 'template.html'), 'utf8');
const day = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 1000);
const ROW = {
  id: 1,
  PrestataireNom: 'SARL Atelier Nova', PrestataireAdresse: '14 rue des Tanneurs, 69001 Lyon', PrestataireSiret: '812 345 678 00025',
  ClientNom: 'Cabinet Duruflé & Associés', ClientAdresse: '2 place Bellecour, 69002 Lyon', ClientSiret: '498 221 034 00019',
  ObjetPrestation: 'Refonte de l’identité visuelle et du site web',
  DateDebut: day(2026, 10, 1), DateFin: day(2026, 12, 31), MontantPrestation: 12400,
  ModalitesPaiement: 'Virement à 30 jours fin de mois', LieuSignature: 'Lyon', DateSignature: day(2026, 9, 24), TribunalCompetent: 'Lyon',
};

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2, colorScheme: 'light' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror : ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console : ' + m.text()); });
if (OFFLINE) {
  await page.route('**://esm.sh/**', async route => {
    const url = route.request().url();
    const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
    if (chunk) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
    const spec = Object.keys(esmMap).find(k => url === `https://esm.sh/${k}` || url === `https://esm.sh/*${k}` || url.startsWith(`https://esm.sh/${k}@`) || url.startsWith(`https://esm.sh/*${k}@`));
    if (!spec) return route.fulfill({ status: 404, body: `// pas de miroir local pour ${url}` });
    route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(ROOT, esmMap[spec].replace(/^\//, '')), 'utf8')) });
  });
}
// Semé avant le démarrage de la page : la table d'exemple, et le modèle enregistré et ouvert par défaut.
await page.addInitScript(({ template, row }) => {
  window.__preSeedGristStub = (stub) => {
    stub.setVariables('Contrat_Prestation', {
      PrestataireNom: 'Text', PrestataireAdresse: 'Text', PrestataireSiret: 'Text', ClientNom: 'Text', ClientAdresse: 'Text', ClientSiret: 'Text', ObjetPrestation: 'Text',
      DateDebut: 'Date', DateFin: 'Date', MontantPrestation: 'Numeric', ModalitesPaiement: 'Text', LieuSignature: 'Text', DateSignature: 'Date', TribunalCompetent: 'Text',
    });
    stub.setRows('Contrat_Prestation', [row]);
    const m = stub.state.rows.Publipostage_Modeles;
    m.id.push(1); m.Nom.push('Contrat');
    m.Contenu.push(template);
    m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
    stub.state.nextRowId.Publipostage_Modeles = 2;
  };
}, { template: TEMPLATE, row: ROW });

await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
await page.evaluate(f => document.documentElement.style.setProperty('--font-ui', f), FONT_UI);
await page.evaluate(row => window.__gristStub.fireRecord(row, 'Contrat_Prestation'), ROW);
await page.waitForTimeout(1200);

// La souris reste dans la marge grise, à gauche de la feuille : aucun survol (la pastille de zoom reste au repos), aucun menu ouvert.
const MARGE = { x: 100, y: 420 };
// 1. L'Édition, sans curseur dans le texte.
await page.mouse.move(MARGE.x, MARGE.y);
await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
await page.waitForTimeout(500);
await page.screenshot({ path: join(SORTIE, 'edition-variables.png') });
// 2. La Lecture : un vrai clic sur le bouton du mode, puis la souris loin du menu qui s'ouvre au survol.
const b = await page.evaluate(() => { const r = document.getElementById('btn-mode-read').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(b.x - 6, b.y, { steps: 2 });
await page.mouse.move(b.x, b.y, { steps: 3 });
await page.mouse.click(b.x, b.y);
await page.mouse.move(MARGE.x, MARGE.y, { steps: 4 });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(SORTIE, 'lecture-resolue.png') });

await browser.close();
server.close();
if (errors.length) { console.error('Erreurs de la page pendant la capture :\n' + errors.join('\n')); process.exit(1); }
console.log('Captures écrites dans ' + SORTIE + ' : edition-variables.png, lecture-resolue.png');
