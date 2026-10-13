// Tests de l'essai d'édition live (prototypes/edition-live), SANS Grist : deux ou trois pages Chromium sur la table locale de
// démonstration (IndexedDB), qui suit les mêmes règles que celle de Grist. Le canal Grist se vérifie dans un vrai Grist
// (labo-grist-reel/lab-edition-live.mjs, dans les fichiers du projet).
//
// Lancement : node prototypes/edition-live/test-edition-live.mjs   (le proxy du réseau est nécessaire pour joindre esm.sh)
// Sort en code 1 dès qu'un contrôle échoue.

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.argv[2]) || 8852;
const PAGE = `http://127.0.0.1:${PORT}/prototypes/edition-live/index.html`;

const server = createServer(async (req, res) => {
  try {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    const data = await readFile(file);
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch (err) {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve, reject) => { server.on('error', reject); server.listen(PORT, resolve); });

const browser = await chromium.launch({ args: ['--proxy-server=' + process.env.HTTPS_PROXY, '--proxy-bypass-list=localhost;127.0.0.1'] });
const results = [];
const problems = [];   // tout ce que la console de l'une des pages a dit d'inattendu
const yjsLoads = [];

async function check(label, fn) {
  try {
    const detail = await fn();
    if (detail === false) throw new Error('faux');
    results.push({ label, pass: true });
  } catch (err) {
    results.push({ label, pass: false, error: err.message });
  }
}

async function open(context, query = '') {
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') problems.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
  page.on('pageerror', e => problems.push('[pageerror] ' + e.message));
  let yjs = 0;
  page.on('request', r => { if (/yjs@[\d.]+\/es2022\/yjs\.mjs/.test(r.url())) yjs++; });
  await page.goto(`${PAGE}?${query}`, { waitUntil: 'load' });
  await page.waitForSelector('.tiptap', { timeout: 60000 });
  yjsLoads.push(() => yjs);
  return page;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, timeout = 8000, step = 50) {
  const t0 = Date.now();
  for (;;) {
    let value;
    try { value = await fn(); } catch (err) { value = false; }
    if (value) return Date.now() - t0;
    if (Date.now() - t0 > timeout) return -1;
    await sleep(step);
  }
}
const text = page => page.evaluate(() => window.liveLab.editor.getText());
const textIs = (page, expected) => until(async () => (await text(page)) === expected);
const textHas = (page, part) => until(async () => (await text(page)).includes(part));
const peers = page => page.locator('#peers').textContent();
const tableRows = page => page.evaluate(() => window.liveLab.channel.dump());
async function type(page, str, delay = 15) { await page.locator('.tiptap').click(); await page.keyboard.type(str, { delay }); }

// --- la page elle-même -------------------------------------------------------------------------------------------------
const html = await readFile(path.join(ROOT, 'prototypes/edition-live/index.html'), 'utf8');
await check('csp : l\'empreinte de la carte d\'importation est celle de la politique de la page', () => {
  const map = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
  const hash = createHash('sha256').update(map).digest('base64');
  return html.includes(`'sha256-${hash}'`);
});

// --- deux clients ------------------------------------------------------------------------------------------------------
let context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'fr-FR' });
const a = await open(context, 'name=Ana&flush=50');
const b = await open(context, 'name=Bob&flush=50');

await check('page : en français, l\'éditeur est monté, le direct est allumé, la source est la table locale', async () => (
  /Édition live : activée/.test(await a.locator('#live-toggle').textContent()) && /En direct/.test(await a.locator('#status').textContent())
  && /Démonstration locale/.test(await a.locator('#source').textContent())));

await type(a, 'Bonjour');
await check('direct : ce que A tape arrive chez B', async () => (await textIs(b, 'Bonjour')) >= 0);
await type(b, ' le monde');
await check('direct : ce que B tape arrive chez A, à la suite', async () => (await textIs(a, 'Bonjour le monde')) >= 0);

await check('délai : B a mesuré au moins un délai de réception, sous la seconde', async () => {
  const s = await b.evaluate(() => window.liveLab.live.summary());
  return s.n > 0 && s.med < 1000;
});

await check('présence : chacun voit le nom de l\'autre', async () => (
  (await until(async () => /Bob/.test(await peers(a)))) >= 0 && (await until(async () => /Ana/.test(await peers(b)))) >= 0));
await check('curseur : B voit le curseur de A, avec son nom', async () => {
  await a.locator('.tiptap').click();
  await a.keyboard.press('Control+Home');
  return (await until(async () => (await b.locator('.collaboration-carets__label', { hasText: 'Ana' }).count()) > 0)) >= 0;
});

// frappes simultanées, à deux endroits
await a.keyboard.press('Control+Home');
await b.locator('.tiptap').click();
await b.keyboard.press('Control+End');
await Promise.all([a.keyboard.type('AAA ', { delay: 20 }), b.keyboard.type(' BBB', { delay: 20 })]);
await check('simultané : A écrit au début, B à la fin, les deux textes sont identiques et complets', async () => {
  const done = await until(async () => { const [x, y] = [await text(a), await text(b)]; return x === y && x.includes('AAA ') && x.includes(' BBB'); });
  return done >= 0;
});

// annuler : seulement ses propres frappes (Yjs découpe l'historique à sa façon : on appuie jusqu'à ce que les frappes de A aient disparu)
await check('annuler : Ctrl+Z chez A retire les frappes de A, jamais celles de B, et B voit le même texte', async () => {
  await a.locator('.tiptap').click();
  for (let i = 0; i < 6 && (await text(a)).includes('AAA'); i++) { await a.keyboard.press('Control+z'); await sleep(150); }
  const ok = await until(async () => { const [x, y] = [await text(a), await text(b)]; return x === y && x.includes(' BBB') && !x.includes('AAA'); });
  return ok >= 0;
});

// beaucoup de frappes simultanées : aucune ne se perd
await a.locator('.tiptap').click();
await a.keyboard.press('Control+Home');
await b.locator('.tiptap').click();
await b.keyboard.press('Control+End');
await Promise.all([a.keyboard.type('s1 s2 s3 s4 s5 s6 s7 s8 s9 ', { delay: 12 }), b.keyboard.type(' t1 t2 t3 t4 t5 t6 t7 t8 t9', { delay: 12 })]);
await check('rafale : 27 frappes de chaque côté en même temps, les deux textes finissent identiques et complets', async () => {
  const ok = await until(async () => {
    const [x, y] = [await text(a), await text(b)];
    return x === y && x.includes('s1 s2 s3 s4 s5 s6 s7 s8 s9 ') && x.includes(' t1 t2 t3 t4 t5 t6 t7 t8 t9');
  }, 10000);
  return ok >= 0;
});

// direct éteint puis rallumé
await a.locator('#live-toggle').click();
await check('éteint : le bouton le dit et la présence de A disparaît chez B', async () => (
  (await until(async () => /désactivée/.test(await a.locator('#live-toggle').textContent()))) >= 0 && (await until(async () => !/Ana/.test(await peers(b)))) >= 0));
const before = await text(b);
await type(a, ' HORS');
await sleep(600);
await check('éteint : ce que A tape ne part pas', async () => !(await text(b)).includes('HORS'));
await type(b, ' DEPUIS-B');
await sleep(600);
await check('éteint : ce que B tape n\'arrive pas chez A', async () => !(await text(a)).includes('DEPUIS-B'));
await a.locator('#live-toggle').click();
await check('rallumé : les deux textes se rejoignent avec les deux ajouts, sans doublon', async () => {
  const ok = await until(async () => { const [x, y] = [await text(a), await text(b)]; return x === y && x.includes('HORS') && x.includes('DEPUIS-B'); }, 10000);
  const final = await text(a);
  return ok >= 0 && final.split('HORS').length === 2 && final.split('DEPUIS-B').length === 2 && before.length > 0;
});
await check('rallumé : A est de nouveau visible chez B', async () => (await until(async () => /Ana/.test(await peers(b)))) >= 0);

// un troisième client qui arrive plus tard lit tout l'historique
const c = await open(context, 'name=Cléo&flush=50');
await check('arrivée : un client qui ouvre la page plus tard lit le texte déjà écrit', async () => (await textIs(c, await text(a))) >= 0);
await check('arrivée : il n\'a rien ajouté au document (pas de paragraphe vide en plus)', async () => (await text(c)) === (await text(a)));

// la table locale
await check('table : les lignes « u » portent un Client, un numéro et des données', async () => {
  const rows = (await tableRows(a)).filter(r => r.Kind === 'u');
  return rows.length > 0 && rows.every(r => r.Client && r.Seq > 0 && r.Data.length > 0 && r.T >= 0);
});
await check('table : une seule ligne de présence par client', async () => {
  const rows = (await tableRows(a)).filter(r => r.Kind === 'p');
  const clients = new Set(rows.map(r => r.Client));
  return rows.length === clients.size && clients.size >= 3;
});
await context.close();

// compaction : peu de lignes après beaucoup de frappes, et le texte reste complet pour une arrivée tardive
context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'en-US' });
const d = await open(context, 'name=Dan&flush=50&compactAt=6');
const e = await open(context, 'name=Eve&flush=50&compactAt=6');
const sentence = 'La compaction remplace les petites lignes par une seule';
for (const word of sentence.split(' ')) { await type(d, word + ' ', 40); await sleep(120); }
await check('compaction : E a reçu tout le texte', async () => (await textIs(e, await text(d))) >= 0);
await check('compaction : la table est restée petite malgré une quarantaine de lignes écrites', async () => {
  await sleep(3500);
  const rows = (await tableRows(d)).filter(r => r.Kind === 'u');
  const written = await d.evaluate(() => window.liveLab.live.seq);
  return written > 8 && rows.length < written && rows.length <= 8;
});
await check('compaction : un client qui arrive après elle lit le texte complet', async () => {
  const f = await open(context, 'name=Fay&flush=50&compactAt=6');
  return (await textIs(f, await text(d))) >= 0 && (await text(f)).includes('une seule');
});
// lignes supprimées à la main dans la table (ou « Annuler » de Grist) : un client encore ouvert republie son état complet
await check('table vidée à la main : un client resté ouvert republie le texte, un nouvel arrivant le lit', async () => {
  const ids = (await tableRows(d)).map(r => r.id);
  await d.evaluate(list => window.liveLab.channel.write({ removes: list }), ids);
  const republished = await until(async () => (await tableRows(d)).some(r => r.Kind === 'u'), 8000);
  const f = await open(context, 'name=Gil&flush=50&compactAt=6');
  const same = await textIs(f, await text(d));
  return republished >= 0 && same >= 0 && (await text(f)).includes('une seule');
});
await context.close();

// premières frappes en même temps dans un document vide : un seul paragraphe, pas un par client
context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'fr-FR' });
const p1 = await open(context, 'name=Pia&flush=50&delay=400');
const p2 = await open(context, 'name=Max&flush=50&delay=400');
await Promise.all([type(p1, 'xxxx', 10), type(p2, 'yyyy', 10)]);
await check('premières frappes simultanées : les deux textes se rejoignent dans UN seul paragraphe', async () => {
  const ok = await until(async () => { const [x, y] = [await text(p1), await text(p2)]; return x === y && x.includes('xxxx') && x.includes('yyyy'); }, 10000);
  const paragraphs = await p1.evaluate(() => window.liveLab.editor.getJSON().content.length);
  return ok >= 0 && paragraphs === 1 && (await p2.evaluate(() => window.liveLab.editor.getJSON().content.length)) === 1;
});
await context.close();

// latence simulée : la mesure du délai suit bien le temps ajouté
context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'en-US' });
const g = await open(context, 'name=Gus&flush=50&delay=300');
const h = await open(context, 'name=Hal&flush=50&delay=300');
await type(g, 'lent');
await check('latence simulée : 300 ms ajoutées à chaque écriture et à chaque lecture, B mesure plus de 500 ms', async () => {
  await textIs(h, 'lent');
  const s = await h.evaluate(() => window.liveLab.live.summary());
  return s.n > 0 && s.med >= 500 && s.med < 1500;
});
await context.close();

// ce qu'aucune page n'a le droit de dire à la console
await check('console : aucun avertissement ni erreur (Yjs importé une seule fois, aucune violation de la politique)', () => problems.length === 0 || (() => { throw new Error(problems.slice(0, 4).join(' | ')); })());
await check('yjs : le module est demandé une seule fois par page', () => yjsLoads.every(count => count() === 1));

await browser.close();
server.close();

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  process.stdout.write(`${r.pass ? 'ok  ' : 'ÉCHEC'} ${r.label}${r.pass ? '' : '  -> ' + r.error}\n`);
}
process.stdout.write(`\n${results.length - failed}/${results.length} contrôles passent\n`);
process.exit(failed ? 1 : 0);
