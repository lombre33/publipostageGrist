#!/usr/bin/env node
// La SONDE de la LECTURE LÉGÈRE (js/grist-api.js:lightQuery, js/perf-trace.js:probeLight ; 23/11, lot « lecture allégée » : la table des modèles se lit en entier, contenus compris, au démarrage ; lire seulement ses noms,
// ses dates et ses longueurs par l'interface SQL du document coûterait bien moins, si elle répond chez la personne). Elle ne change rien à l'écran et ne part que quand on enregistre le rapport de fluidité
// (Ctrl + Alt + Maj + L). Ce que les cas vérifient :
//  1. avant tout rapport, aucune requête SQL n'est partie, et le rapport dit « pas encore sondée » ;
//  2. la sonde est UNE demande GET simple (ni corps ni en-tête qui appelle une pré-requête CORS), vers l'adresse du jeton en lecture seule, avec la requête SQL attendue (id, dates, longueurs : jamais le texte) ;
//  3. quand l'interface répond, le rapport dit le temps, le nombre de lignes, et compare dates et longueurs à celles du cache (« N sur N ») ;
//  4. quand elle refuse (HTTP 403), n'aboutit pas (réseau coupé), répond autre chose que du SQL ou tarde, le rapport dit pourquoi, et rien d'autre ne casse (l'erreur n'est jamais levée jusqu'à la page) ;
//  5. le geste Ctrl + Alt + Maj + L sonde avant d'écrire le rapport ;
//  6. la sonde n'écrit rien : seul un jeton en lecture seule a été demandé.
// L'interface SQL de Grist n'est PAS jouée ici (le faux Grist ne la connaît pas : le cas lui fait répondre ce que la documentation de Grist décrit, `{ statement, records: [{ fields }] }`) ; que le vrai Grist, celui de
// la personne, réponde ainsi est ce que le rapport d'Antoine dira.
// Lancé par run-headless.mjs (groupe Node « lightProbe », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-light-probe.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-light-probe', port: Number(process.env.LIGHT_PROBE_PORT || 9219) });
const { check } = t;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Ce que la route répond, réglé par le cas ; `sqlRows` : les lignes que « Grist » rend (posées depuis le cache de la page).
const mode = { kind: 'ok', delay: 0 };
let sqlRows = [];
const seen = [];
const BASE = 'http://grist.test/api/docs/DOC1';

const { page } = await t.openPage({
  hosted: true, stub: { extensions: [] }, lang: 'fr', colorScheme: 'light',
  seed: seedModels() + `\nstub.state.tokenBaseUrl = ${JSON.stringify(BASE)};`,
  before: async (p) => {
    await p.route('http://grist.test/**', async (route) => {
      const request = route.request();
      seen.push({ method: request.method(), url: request.url(), headers: request.headers() });
      if (mode.delay) await sleep(mode.delay);
      const cors = { 'Access-Control-Allow-Origin': '*' };
      if (mode.kind === 'abort') return route.abort('failed');
      if (mode.kind === 'http403') return route.fulfill({ status: 403, headers: cors, contentType: 'application/json', body: '{"error":"Forbidden"}' });
      if (mode.kind === 'html') return route.fulfill({ status: 200, headers: cors, contentType: 'text/html', body: '<html>pas du SQL</html>' });
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ statement: 'SELECT', records: sqlRows.map(fields => ({ fields })) }) });
    });
  },
});
await page.waitForFunction(() => typeof PerfTrace !== 'undefined' && typeof Templates !== 'undefined' && Templates.getCached().length > 0, null, { timeout: 30000 });
await sleep(800);

// --- 1. Rien ne part tant que personne ne le demande ---
const before = await page.evaluate(() => PerfTrace.report());
check('avant tout rapport, aucune requête SQL n\'est partie', seen.length === 0, seen);
check('le rapport dit que la lecture légère n\'est pas encore sondée', /Lecture légère \(SQL\) : pas encore sondée/.test(before), before.split('\n').filter(l => /Lecture légère/.test(l)));

// Les lignes que le faux Grist rend : celles du cache, à la façon de SQLite (dates en secondes, longueur en points de code).
sqlRows = await page.evaluate(() => Templates.getCached().map(template => ({
  id: template.id, ModifiedAt: template.dateModif, taille: Array.from(String(template.contenu || '')).length,
})));

// --- 2 et 3. La sonde qui répond ---
const ok = await page.evaluate(async () => ({ result: await PerfTrace.probeLight(), report: PerfTrace.report(), cached: Templates.getCached().length, tokens: window.__gristStub.state.tokenCalls.slice() }));
check('la sonde rend « ok » avec une ligne par modèle du cache, des dates et des longueurs qui s\'égalent toutes', ok.result.state === 'ok' && ok.result.rows === ok.cached && ok.result.seen === ok.cached && ok.result.sameDates === ok.cached && ok.result.sameLengths === ok.cached && ok.cached > 0, ok.result);
check('le rapport dit le temps de la lecture légère, ses lignes, et la comparaison avec le cache (N sur N)', /Lecture légère \(SQL\) : répond en \d+ ms \(\d+ lignes, /.test(ok.report) && new RegExp('dates qui s’égalent à celles du cache : ' + ok.cached + ' sur ' + ok.cached + ' ; longueurs qui s’égalent : ' + ok.cached + ' sur ' + ok.cached).test(ok.report), ok.report.split('\n').filter(l => /Lecture légère|dates qui/.test(l)));
check('la lecture complète de la table des modèles est dite à côté (le démarrage l\'a faite), pour comparer', /la lecture complète de la table des modèles : \d+ ms au plus long/.test(ok.report), ok.report.split('\n').filter(l => /Lecture légère/.test(l)));
const first = seen[0];
const url = first ? new URL(first.url) : null;
check('la demande est un GET simple vers l\'adresse du jeton, avec le jeton en lecture seule dans `auth` (pas d\'en-tête Authorization, pas de corps)', !!first && first.method === 'GET' && url.pathname === '/api/docs/DOC1/sql' && url.searchParams.get('auth') === 'stub-token' && !first.headers.authorization && !first.headers['content-type'], first);
const asked = url ? url.searchParams.get('q') : '';
const names = await page.evaluate(() => ({ date: SchemaColumns.whereIs(Templates.TABLE_NAME, 'ModifiedAt'), content: SchemaColumns.whereIs(Templates.TABLE_NAME, 'Content') }));
check('la requête SQL ne lit que id, la date et la longueur du texte : jamais le texte des modèles, et rien qui écrive', /^SELECT id, "[A-Za-z]+" AS ModifiedAt, length\("[A-Za-z]+"\) AS taille FROM "[A-Za-z_]+"$/.test(asked), asked);
check('elle porte les noms que le DOCUMENT a (ses anciens noms français quand il les garde), pas ceux du code', asked === `SELECT id, "${names.date.column}" AS ModifiedAt, length("${names.content.column}") AS taille FROM "${names.date.table}"`, { asked, names });
check('seul un jeton en lecture seule a été demandé (la sonde n\'écrit rien)', ok.tokens.length >= 1 && ok.tokens.every(call => call.readOnly === true), ok.tokens);

// --- 4. Ce qui ne marche pas ---
async function probeWith(kind, delay) {
  mode.kind = kind; mode.delay = delay || 0;
  return page.evaluate(async () => ({ result: await PerfTrace.probeLight(), report: PerfTrace.report() }));
}
const refused = await probeWith('http403');
check('un refus d\'Grist (HTTP 403) est dit avec son code, sans lever d\'erreur dans la page', refused.result.state === 'refused' && refused.result.reason === 'http' && refused.result.status === 403 && /Lecture légère \(SQL\) : refusée après \d+ ms - Grist a refusé \(HTTP 403\)/.test(refused.report), refused.report.split('\n').filter(l => /Lecture légère/.test(l)));
const down = await probeWith('abort');
check('une demande qui n\'aboutit pas (réseau coupé, politique du site) est dite « n\'a pas abouti »', down.result.state === 'refused' && down.result.reason === 'réseau' && /n’a pas abouti/.test(down.report), down.result);
const html = await probeWith('html');
check('une réponse qui n\'est pas du SQL est dite « réponse que je ne sais pas lire »', html.result.state === 'refused' && html.result.reason === 'forme' && /réponse que je ne sais pas lire/.test(html.report), html.result);
mode.kind = 'ok'; mode.delay = 700;
const slowReason = await page.evaluate(async () => { try { await GristAPI.lightQuery('SELECT 1', 200); return 'rendu'; } catch (error) { return error.reason; } });
check('une réponse qui tarde plus que le délai donné est dite « délai »', slowReason === 'délai', { slowReason });
mode.delay = 0;

// --- 5. Le geste du rapport sonde avant d'écrire ---
mode.kind = 'ok';
const requestsBefore = seen.length;
const download = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
await page.keyboard.press('Control+Alt+Shift+L');
const file = await download;
check('Ctrl + Alt + Maj + L enregistre le rapport APRÈS avoir sondé (une demande SQL de plus, et le fichier porte la lecture légère)', seen.length === requestsBefore + 1 && !!file, { requests: seen.length - requestsBefore, file: !!file });
await page.waitForSelector('.dialog-overlay, .modal-overlay, [role="dialog"], dialog', { timeout: 5000 }).catch(() => {});
await page.keyboard.press('Escape');

await t.finish();
