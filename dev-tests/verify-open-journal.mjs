#!/usr/bin/env node
// Le JOURNAL D'OUVERTURE du rapport de fluidité (js/perf-trace.js : Ctrl+Alt+Maj+L ; 23/11, « explorer des pistes pour que l'ouverture soit encore plus rapide, quitte à prévoir un journal de diag que je te drop ici » :
// tous les documents, le démarrage du widget et le changement de document par le menu). Il ne change rien à l'écran ; ce que les cas vérifient :
//  1. chaque appel à Grist (`grist.docApi`) est compté par « appel table » avec sa durée et ce qu'il porte, et le rapport le dit : le démarrage lit la table des modèles (de quoi voir ce que lit chaque
//     passage de l'enregistrement automatique) ; un appel lent ou lourd a sa ligne dans la chronologie ;
//  2. la surveillance est TRANSPARENTE : le résultat (le même objet), la promesse rejetée (la même raison) et l'exception (la même) passent tels quels, une fonction surveillée deux fois n'est comptée qu'une fois,
//     et une écriture compte ce qu'elle envoie ;
//  3. un document choisi dans le menu laisse `menu : document choisi` puis `document ouvert` (id, type, Ko, temps de la fonction, `depuisLeMenuMs`) ; l'ouverture du départ, qui ne vient pas du menu, n'a pas `depuisLeMenuMs` ;
//  4. le rapport dit les fichiers du chargement : le compte, ceux servis sans transfert, le dernier fichier reçu de chaque site, les plus lents.
// Lancé par run-headless.mjs (groupe Node « openJournal », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-open-journal.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-open-journal', port: Number(process.env.OPEN_JOURNAL_PORT || 9216) });
const { check } = t;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const { page } = await t.openPage({ hosted: true, stub: { extensions: [] }, seed: seedModels(), lang: 'fr', colorScheme: 'light' });
await page.waitForFunction(() => typeof PerfTrace !== 'undefined' && typeof Editor !== 'undefined' && !!EditorCore.getEditor(), null, { timeout: 30000 });
await sleep(1500);

// --- 1. Les appels à Grist du démarrage, dans le rapport ---
const start1 = await page.evaluate(() => ({ report: PerfTrace.report(), calls: PerfTrace.gristCalls(), opened: PerfTrace.events().filter(e => e.kind === 'mark' && e.label === 'document ouvert') }));
const modelsRead = start1.calls.find(call => call.label === 'fetchTable Publipostage_Modeles');
check('le démarrage a lu la table des modèles, et le journal l\'a compté (au moins une lecture, avec ses signes)', !!modelsRead && modelsRead.n >= 1 && modelsRead.chars > 100, { modelsRead });
check('le rapport a sa section « Appels à Grist » avec la ligne de la table des modèles, ses lectures, sa durée et ses signes', /Appels à Grist : \d+ en tout/.test(start1.report) && /fetchTable Publipostage_Modeles : \d+ fois?, [\d.,]+ ?(?:ms|s) en tout, le plus long [\d.,]+ ?(?:ms|s), [\d.,]+ (?:Ko|Mo) de signes/.test(start1.report), { head: start1.report.split('\n').filter(line => /Grist|fetchTable/.test(line)).slice(0, 6) });
check('le rapport dit aussi les fichiers du chargement : le compte, ceux sans transfert, le dernier de chaque site, les plus lents', /Fichiers : \d+ lus, dont \d+ sur \d+ de la page sans transfert/.test(start1.report) && /par site : .*\(le dernier reçu à \d+ ms\)/.test(start1.report) && /les plus lents : .* ms \(début à \d+ ms\)/.test(start1.report), { files: start1.report.split('\n').filter(line => /Fichiers|par site|plus lents/.test(line)) });
check('l\'ouverture du départ laisse « document ouvert » (id, type, Ko, temps de la fonction), sans `depuisLeMenuMs` : elle ne vient pas du menu', start1.opened.length >= 1 && typeof start1.opened[0].ms === 'number' && typeof start1.opened[0].Ko === 'number' && !!start1.opened[0].type && start1.opened[0].depuisLeMenuMs === undefined, { opened: start1.opened });

// --- 2. La surveillance est transparente ---
const transparent = await page.evaluate(async () => {
  const same = {};
  const boom = new Error('boum');
  const rejection = new Error('refusé');
  const api = {
    syncValue: () => same,
    asyncValue: async () => same,
    rejects: async () => { throw rejection; },
    throws: () => { throw boom; },
    notAFunction: 12,
  };
  const before = PerfTrace.gristCalls().length;
  const watched = PerfTrace.watchGrist(api);
  const again = PerfTrace.watchGrist(api);
  const out = { watched, again, syncSame: api.syncValue() === same, asyncSame: (await api.asyncValue()) === same };
  try { await api.rejects(); out.rejectSame = false; } catch (error) { out.rejectSame = error === rejection; }
  try { api.throws(); out.throwSame = false; } catch (error) { out.throwSame = error === boom; }
  out.untouched = api.notAFunction === 12;
  await new Promise(resolve => setTimeout(resolve, 20));
  const calls = PerfTrace.gristCalls().filter(call => ['syncValue', 'asyncValue', 'rejects', 'throws'].includes(call.label));
  out.counts = Object.fromEntries(calls.map(call => [call.label, call.n]));
  out.before = before;
  return out;
});
check('les fonctions de l\'API sont surveillées une fois (4 fonctions, la seconde passe n\'en reprend aucune), ce qui n\'est pas une fonction reste tel quel', transparent.watched === 4 && transparent.again === 0 && transparent.untouched === true, transparent);
check('le résultat, la valeur d\'une promesse, la raison d\'un rejet et l\'exception sont ceux d\'origine (le même objet, la même erreur)', transparent.syncSame && transparent.asyncSame && transparent.rejectSame && transparent.throwSame, transparent);
check('chaque appel est compté une fois, réussi, rejeté ou levé', transparent.counts.syncValue === 1 && transparent.counts.asyncValue === 1 && transparent.counts.rejects === 1 && transparent.counts.throws === 1, transparent.counts);

// --- 3. Un appel lourd a sa ligne, une écriture compte ce qu'elle envoie ---
const heavy = await page.evaluate(async () => {
  const big = 'x'.repeat(300 * 1024);
  const api = {
    fetchTable: async () => ({ id: [1], Contenu: [big] }),
    applyUserActions: async () => ({ retValues: [] }),
  };
  PerfTrace.watchGrist(api);
  await api.fetchTable('Table_Lourde');
  await api.applyUserActions([['UpdateRecord', 'Table_Lourde', 1, { Contenu: big }], ['UpdateRecord', 'Table_Lourde', 2, { Contenu: 'a' }]]);
  await new Promise(resolve => setTimeout(resolve, 20));
  const events = PerfTrace.events().filter(e => e.kind === 'grist');
  const calls = PerfTrace.gristCalls();
  return { events: events.map(e => ({ label: e.label, chars: e.chars })), read: calls.find(c => c.label === 'fetchTable Table_Lourde'), write: calls.find(c => c.label.indexOf('applyUserActions 2 actions UpdateRecord Table_Lourde') === 0), report: PerfTrace.report() };
});
check('une table lue de 300 Ko a sa ligne dans la chronologie, avec ses signes', heavy.events.some(e => e.label === 'fetchTable Table_Lourde' && e.chars >= 300 * 1024) && /Grist fetchTable Table_Lourde : \d+ ms, 3\d\d Ko/.test(heavy.report), heavy);
check('une écriture de deux actions compte ce qu\'elle envoie (au moins 300 Ko) et son nom dit les actions et la table', !!heavy.write && heavy.write.chars >= 300 * 1024, heavy.write);

// --- 4. Un document choisi dans le menu ---
const picked = await page.evaluate(async () => {
  const before = PerfTrace.events().length;
  const select = document.getElementById('template-select');
  const target = Array.from(select.options).find(option => option.value && option.value !== select.value);
  select.value = target.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 600));
  const fresh = PerfTrace.events().slice(before).filter(e => e.kind === 'mark');
  return { fresh: fresh.map(e => ({ label: e.label, id: e.id, type: e.type, Ko: e.Ko, ms: e.ms, depuisLeMenuMs: e.depuisLeMenuMs })), picked: target.value };
});
const choose = picked.fresh.find(e => e.label === 'menu : document choisi');
const opened = picked.fresh.find(e => e.label === 'document ouvert');
check('choisir un document dans le menu laisse « menu : document choisi » (son id) puis « document ouvert » (id, type, Ko, temps de la fonction)', !!choose && String(choose.id) === String(picked.picked) && !!opened && String(opened.id) === String(picked.picked) && typeof opened.Ko === 'number' && typeof opened.ms === 'number' && !!opened.type, picked);
check('et « document ouvert » dit le temps écoulé depuis le choix dans le menu', !!opened && typeof opened.depuisLeMenuMs === 'number' && opened.depuisLeMenuMs >= 0 && opened.depuisLeMenuMs < 5000, opened);
const secondOpen = await page.evaluate(async () => {
  const before = PerfTrace.events().length;
  const select = document.getElementById('template-select');
  const target = Array.from(select.options).find(option => option.value && option.value !== select.value);
  select.value = target.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 600));
  return PerfTrace.events().slice(before).filter(e => e.kind === 'mark' && e.label === 'document ouvert').map(e => e.depuisLeMenuMs);
});
check('un second choix a son propre temps (le premier n\'est pas repris)', secondOpen.length === 1 && typeof secondOpen[0] === 'number', secondOpen);

await t.finish();
