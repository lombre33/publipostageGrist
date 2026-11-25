#!/usr/bin/env node
// LA LECTURE LÉGÈRE DE LA TABLE DES MODÈLES dans la vraie page (consigne 103 de GFS, demande 2 : « rien ne relit la table entière après l'ouverture » ; une présentation de 29 Mo dans la table, 38 millions de signes dans une
// seule ligne, et au-delà de ~500 Mo Grist ou son hôte ne la rendent plus). La table des modèles porte les noms ET les textes : quand elle est lourde, la liste se lit par SQL SANS les longs textes (leur longueur seule) et chaque
// texte se lit ensuite à la demande, ligne par ligne (interface REST, filtre sur le numéro de ligne). Le faux Grist de dev-tests/grist-stub.js n'a ni SQL ni REST : dev-tests/light-server.mjs répond à la page, par un vrai
// moteur SQL (node:sqlite) sur l'état du faux Grist, relu à chaque demande. Sur un document aux deux gros textes (deux fois 700 Ko : un million de signes, le seuil de la lecture légère) :
//  1. (le cœur) la liste se lit par SQL (une demande, avec les longueurs), la table n'est JAMAIS lue en entier (le faux Grist le compte : aucun `fetchTable` de la table des modèles), les deux gros documents sont « pas
//     chargés » dans le cache avec leur poids, le document par défaut (court) est ouvert avec son texte ;
//  2. ouvrir un macro-modèle dont l'emplacement est un gros document : ce document seul est lu, par son numéro (une demande REST, ni les autres ni la table) ;
//  3. choisir un gros document dans la liste : sa ligne seule est lue, son texte arrive dans l'éditeur, et aucun module n'a lu un texte avant qu'il soit chargé (Templates.getUnloadedReads vide) ;
//  4. TÉMOIN : l'interrupteur « off » rend la lecture d'avant (la table entière, aucune demande SQL) : le contrôle du cœur ne serait pas aveugle ;
//  5. Grist refuse le SQL (403 : règles d'accès, instance sans cette interface) : la page s'ouvre par la lecture entière, comme avant, et le dit au rapport de fluidité ;
//  6. Grist interrompt le calcul des longueurs (une seconde, le délai d'une requête SQL) : la liste vient sans longueurs, la table est tenue pour lourde, chaque texte se lit à la demande ;
//  7. l'interface REST est refusée (la liste vient, pas les lignes) : le texte demandé vient alors de la lecture entière, une fois, et le document s'ouvre.
// Lancé par run-headless.mjs (groupe Node « templatesLightOpen », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-templates-light-open.mjs
import { start, seedModels } from './gfs-page.mjs';
import { createLightServer, tablesFromStubState } from './light-server.mjs';

const t = await start({ name: 'verify-templates-light-open', port: Number(process.env.TEMPLATES_LIGHT_PORT || 9225) });
const { check } = t;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const BASE = 'http://grist.test/api/docs/DOC1';

// Deux gros documents de 700 Ko chacun (quarante paragraphes de 17 Ko) : le texte d'un rapport, pas une seule ligne énorme que l'éditeur ne saurait pas montrer.
const heavy = word => Array.from({ length: 40 }, (_, i) => '<p>' + word + ' paragraphe ' + i + ' ' + 'mot '.repeat(4400) + '</p>').join('');
// seedModels : 1 « Départ A défaut » (court, ★), 2 « Départ B », 3 « Départ C », 4 « Départ E » (email), 5 « Départ M » (macro-modèle dont l'emplacement est le 2), 6 « Futur » (présentation).
const SEED = seedModels() + `
  const heavyTexts = { 1: ${JSON.stringify(heavy('RAPPORT-B'))}, 2: ${JSON.stringify(heavy('DOSSIER-C'))} };
  m.Contenu[1] = heavyTexts[1];
  m.Contenu[2] = heavyTexts[2];
  stub.state.tokenBaseUrl = ${JSON.stringify(BASE)};
`;

// Une page : le faux Grist de la page + le faux serveur de lecture légère (dev-tests/light-server.mjs) sur `http://grist.test/**`. `light` : 'auto' (le poids de la table décide, comme en production) ou 'off'.
async function open({ light = 'auto', server: setup = () => {} } = {}) {
  const holder = {};
  const opened = await t.openPage({
    hosted: false, lang: 'fr', colorScheme: 'light', seed: SEED,
    init: `window.__templatesLight = ${JSON.stringify(light)};`,
    before: async (page) => {
      holder.server = createLightServer(async () => tablesFromStubState(await page.evaluate(() => ({ rows: window.__gristStub.state.rows, columns: window.__gristStub.state.columns }))));
      setup(holder.server);
      await page.route('http://grist.test/**', async (route) => {
        let answer;
        try { answer = await holder.server.handle(route.request().url()); } catch (e) { answer = { status: 500, body: JSON.stringify({ error: String(e && e.message || e) }) }; }
        await route.fulfill({ status: answer.status, contentType: answer.noCors ? 'text/html' : 'application/json', headers: answer.noCors ? {} : { 'Access-Control-Allow-Origin': '*' }, body: answer.body });
      });
    },
  });
  return Object.assign(opened, { server: holder.server });
}
const wholeReads = app => app.evaluate(() => window.__gristStub.state.callOrder.filter(call => call === 'fetchTable Publipostage_Modeles').length);
const byKind = (server, kind) => server.log.filter(entry => entry.kind === kind);
const idsAsked = server => byKind(server, 'records').map(entry => (entry.ids || []).join(','));
const text = app => app.evaluate(() => { const editor = EditorCore.getEditor(); return editor ? editor.getText() : ''; });
const waitText = (app, word) => app.waitForFunction(w => { const editor = EditorCore.getEditor(); return !!editor && editor.getText().includes(w); }, word, { timeout: 40000 });
// Le choix d'un document dans la liste : le <select> natif (caché derrière l'arbre, js/template-tree-select.js) change de valeur, comme quand la personne clique une ligne de l'arbre.
const pick = (app, id) => app.evaluate((value) => { const select = document.getElementById('template-select'); select.value = String(value); select.dispatchEvent(new Event('change', { bubbles: true })); }, id);
const cacheOf = app => app.evaluate(() => Templates.getCached().map(entry => ({ id: entry.id, nom: entry.nom, chargee: entry.chargee, poids: entry.poids ? entry.poids.Content : null })));

// --- 1. Le cœur : la liste par SQL, la table jamais lue en entier ---
{
  const { app, server } = await open();
  await sleep(1500);
  const light = await app.evaluate(() => Templates.getLightState());
  const cache = await cacheOf(app);
  const lists = byKind(server, 'sql');
  check('la table est lourde (1,4 Mo de texte) : la page lit la liste des modèles par SQL (état « light »)', light === 'light' && lists.length >= 1, { light, lists: lists.length });
  check('la table des modèles n\'est JAMAIS lue en entier (aucun fetchTable de cette table à l\'ouverture)', (await wholeReads(app)) === 0, await wholeReads(app));
  check('la liste porte les longueurs et ne rend pas les gros textes (poids calculé côté Grist, texte absent de la réponse)', /length\(CAST\(/.test(lists[0] ? lists[0].sql : '') && /iif\(/.test(lists[0] ? lists[0].sql : '') && !/CASE|WHEN/i.test(lists[0] ? lists[0].sql : '') && server.log.every(entry => !entry.firewall), lists[0] && lists[0].sql && lists[0].sql.slice(0, 160));
  const byName = name => cache.find(entry => entry.nom === name) || {};
  check('les deux gros documents sont « pas chargés » dans le cache, avec leur poids (700 Ko)', byName('Départ B').chargee === false && byName('Départ C').chargee === false && byName('Départ B').poids > 650000 && byName('Départ C').poids > 650000, cache);
  check('le document par défaut (court) est chargé avec la liste : aucune ligne n\'a été relue pour l\'ouvrir', byName('Départ A défaut').chargee === true && idsAsked(server).length === 0, { cache: byName('Départ A défaut'), asked: idsAsked(server) });
  check('l\'éditeur porte le texte du document par défaut', (await text(app)).includes('Contenu A'), await text(app));
  check('tous les modèles sont dans la liste du widget (six lignes de la table)', cache.length === 6, cache.map(entry => entry.nom));
  const before = idsAsked(server).length;

  // --- 2. Un macro-modèle dont l'emplacement est un gros document : ce document seul est lu ---
  await pick(app, 5);
  await sleep(2500);
  const afterMacro = idsAsked(server);
  check('ouvrir le macro-modèle lit le document de son emplacement (le numéro 2) par sa seule ligne, rien d\'autre', afterMacro.slice(before).join('|') === '2', afterMacro);
  check('...et la table n\'est toujours pas lue en entier', (await wholeReads(app)) === 0, await wholeReads(app));

  // --- 3. Un gros document choisi dans la liste : sa ligne seule ---
  await pick(app, 3);
  await waitText(app, 'DOSSIER-C paragraphe 39');
  const afterPick = idsAsked(server);
  check('choisir « Départ C » lit sa seule ligne (numéro 3) ; son texte arrive dans l\'éditeur, jusqu\'au dernier paragraphe', afterPick[afterPick.length - 1] === '3' && (await text(app)).includes('DOSSIER-C paragraphe 39'), afterPick);
  const unloaded = await app.evaluate(() => Templates.getUnloadedReads());
  check('aucun module n\'a lu un texte avant qu\'il soit chargé (Templates.getUnloadedReads vide)', unloaded.length === 0, unloaded);
  check('la table n\'est toujours pas lue en entier après deux ouvertures de gros documents', (await wholeReads(app)) === 0, await wholeReads(app));
  const loaded = await cacheOf(app);
  check('les deux documents lus sont chargés dans le cache (le 2 pour le macro-modèle, le 3 pour la liste), et ce sont les seules lignes relues', loaded.find(entry => entry.nom === 'Départ B').chargee === true && loaded.find(entry => entry.nom === 'Départ C').chargee === true && idsAsked(server).join('|') === '2|3', { loaded, asked: idsAsked(server) });
  await app.context().close();
}

// --- 4. TÉMOIN : l'interrupteur « off » rend la lecture d'avant ---
{
  const { app, server } = await open({ light: 'off' });
  await sleep(1500);
  const reads = await wholeReads(app);
  check('TÉMOIN : « off » lit la table en entier (la lecture d\'avant) et ne pose aucune requête SQL', reads >= 1 && byKind(server, 'sql').length === 0 && idsAsked(server).length === 0, { reads, sql: byKind(server, 'sql').length });
  check('TÉMOIN : le document s\'ouvre de la même façon (texte du document par défaut)', (await text(app)).includes('Contenu A'), await text(app));
  await app.context().close();
}

// --- 5. Grist refuse le SQL : la lecture entière, comme avant ---
{
  const { app, server } = await open({ server: (s) => { s.state.refuseSql = 403; } });
  await sleep(1500);
  const state = await app.evaluate(() => Templates.getLightState());
  check('le SQL refusé (403) : la page s\'ouvre par la lecture entière, l\'état est « refusée »', state === 'refused' && (await wholeReads(app)) >= 1 && (await text(app)).includes('Contenu A'), { state, reads: await wholeReads(app) });
  await pick(app, 3);
  await waitText(app, 'DOSSIER-C paragraphe 39');
  check('...et chaque document s\'ouvre depuis cette lecture, sans rien demander par numéro', idsAsked(server).length === 0, idsAsked(server));
  await app.context().close();
}

// --- 6. Grist interrompt le calcul des longueurs : la liste vient sans, chaque texte se lit à la demande ---
{
  const { app, server } = await open({ server: (s) => { s.state.failWeights = true; } });
  await sleep(1500);
  const lists = byKind(server, 'sql');
  check('les longueurs interrompues : la liste est redemandée sans elles, la table reste tenue pour lourde (état « light »)', lists.length >= 2 && !/length\(CAST\(/.test(lists[lists.length - 1].sql) && (await app.evaluate(() => Templates.getLightState())) === 'light', lists.map(entry => entry.status + ' ' + entry.sql.slice(0, 40)));
  check('...sans lire la table entière : le document par défaut s\'ouvre par sa seule ligne', (await wholeReads(app)) === 0 && (await text(app)).includes('Contenu A') && idsAsked(server)[0] === '1', { reads: await wholeReads(app), asked: idsAsked(server) });
  await app.context().close();
}

// --- 7. L'interface REST refusée : le texte vient de la lecture entière, une fois ---
{
  const { app, server } = await open({ server: (s) => { s.state.refuseRecords = 403; } });
  await sleep(1500);
  const before = await wholeReads(app);
  await pick(app, 3);
  await waitText(app, 'DOSSIER-C paragraphe 39');
  check('les lignes refusées (la liste vient) : le document choisi s\'ouvre quand même, d\'une lecture entière de la table', (await wholeReads(app)) === before + 1 && (await app.evaluate(() => Templates.getUnloadedReads())).length === 0, { before, after: await wholeReads(app) });
  const asked = byKind(server, 'records').length;
  await pick(app, 2);
  await waitText(app, 'RAPPORT-B paragraphe 39');
  check('...et cette lecture a rempli tous les textes : le document suivant s\'ouvre sans rien demander de plus (ni ligne, ni table)', byKind(server, 'records').length === asked && (await wholeReads(app)) === before + 1, { asked, now: byKind(server, 'records').length, reads: await wholeReads(app) });
  await app.context().close();
}

await t.finish();
