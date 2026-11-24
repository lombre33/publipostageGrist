#!/usr/bin/env node
// L'OUVERTURE DU DOCUMENT SEUL (js/early-open.js, js/templates.js seedPartial ; 24/11, Antoine : « ça ne sera pas tenable de tout lire en mémoire dès que GFS aura des centaines de dossiers... quand on lance PP
// sur un document, ne lire que celui-là, de la manière la plus efficace possible »). La table des modèles porte noms ET contenus (42 Mo chez une personne) et sa lecture tenait le démarrage 4,6 s sur 7,3 :
// quand GFS désigne un document, sa seule ligne (et celle des réglages du document) est lue par l'interface REST de Grist, le document s'ouvre depuis elle, et la table entière se lit ENSUITE, en fond.
// Ce que les cas vérifient :
//  1. (le cœur) la lecture de la table dure 6 s : le document est ouvert, éditable et le widget prêt BIEN avant, avec le texte de SA LIGNE (REST), et la table entière ne part qu'à la fin du démarrage (le rapport de
//     fluidité l'ordonne : document seul, widget prêt, table reçue, liste complète) ;
//  2. tant que la liste n'est pas lue : l'arbre le dit (« La liste des autres documents se charge… »), le ★ et l'e-mail lié sont grisés avec leur raison, les réglages du document sont déjà là, et RIEN n'est écrit
//     (un Enregistrer et une frappe attendent la liste entière) ;
//  3. la liste arrive : le cache est complet (6 documents), le document ouvert reste sélectionné et garde le texte de l'écran (rien ne le recharge), l'arbre n'a plus sa ligne d'attente, le ★ se rallume, et l'écriture
//     qui attendait part (un seul document modifié, aucune ligne en plus) ;
//  4. un appel `ouvrir` de GFS pour un AUTRE document, reçu pendant la lecture, attend la liste puis l'ouvre ;
//  5. la table entière n'est lue qu'UNE fois (les gestes qui la demandent pendant ce temps partagent la même lecture) ;
//  6. au moindre doute, le démarrage est celui d'avant (la table entière se lit tout de suite, le document vient d'elle) : un texte lié à un autre modèle, une présentation désignée, une ligne refusée (403),
//     des réglages illisibles, une table sans les colonnes d'aujourd'hui, un rechargement qui rouvre un modèle (`#pp-open=`), pas de fichier désigné, un import, une app seule (hors GFS) ;
//  7. une lecture entière qui échoue laisse le document ouvert (le cache partiel n'est pas vidé).
// Lancé par run-headless.mjs (groupe Node « earlyOpen », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-early-open.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-early-open', port: Number(process.env.EARLY_OPEN_PORT || 9224) });
const { check } = t;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const BASE = 'http://grist.test/api/docs/DOC1';
const ROW_TEXT = 'Texte lu par la seule ligne';
const SETTINGS = { marqueur: 'reglages-lus-par-rest' };

// Les lignes que « Grist » sert par REST : le document désigné (numéro 2, « Départ B ») avec un texte qui n'est pas celui de la table (« Contenu B »), pour qu'on voie d'où il vient, une présentation, et la ligne des
// réglages du document.
const rowsOf = (extra = {}) => [
  { id: 2, fields: Object.assign({ Name: 'Départ B', TemplateType: 'document', Margins: '', HeaderFooter: '', IsDefault: false, ModifiedAt: 1790000000, Content: '<h1>' + ROW_TEXT + '</h1><p>Un paragraphe</p>' }, extra) },
  { id: 6, fields: { Name: 'Futur', TemplateType: 'presentation', Content: '<p>PRESENTATION LOURDE</p>' } },
  { id: 9, fields: { Name: 'Réglages du document', TemplateType: 'reglages', Content: JSON.stringify(SETTINGS) } },
];
const opening = (id = 2, type = 'document', raison = 'explorateur') => ({ contextDelayMs: 300, ouverture: { fichier: { id, type }, type, dossier: '', raison } });

async function openIt({ stub = opening(), rows = rowsOf(), status = 200, settingsStatus = 200, slowMs = 6000, ready = true, hosted = true, hash = '', seed = '' } = {}) {
  const seen = [];
  const opened = await t.openPage({
    hosted, stub: hosted ? stub : null, lang: 'fr', colorScheme: 'light', ready, hash,
    seed: seedModels() + `\nstub.state.tokenBaseUrl = ${JSON.stringify(BASE)}; stub.state.slowTable = 'Publipostage_Modeles'; stub.state.slowMs = ${slowMs};` + seed,
    before: async (p) => {
      await p.route('http://grist.test/**', async (route) => {
        const request = route.request();
        const asked = new URL(request.url());
        seen.push({ method: request.method(), url: request.url(), at: Date.now() });
        const cors = { 'Access-Control-Allow-Origin': '*' };
        const filter = asked.searchParams.has('filter') ? JSON.parse(asked.searchParams.get('filter')) : {};
        const wantsSettings = !!filter.TemplateType && filter.TemplateType.includes('reglages');
        if (status !== 200 || (wantsSettings && settingsStatus !== 200)) return route.fulfill({ status: wantsSettings && settingsStatus !== 200 ? settingsStatus : status, headers: cors, contentType: 'application/json', body: '{"error":"refusé"}' });
        if (/\/tables\/[^/]+\/records$/.test(asked.pathname)) {
          const found = rows.filter(row => (!filter.id || filter.id.includes(row.id)) && (!filter.TemplateType || filter.TemplateType.includes(row.fields.TemplateType)));
          return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ records: found }) });
        }
        return route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{}' });
      });
    },
  });
  return Object.assign(opened, { seen, app: opened.app || opened.page, startedAt: Date.now() });
}
const isReady = (app, timeout = 20000) => app.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready|ouvert|opened|non enregistré|not saved/i.test(el.textContent || ''); }, null, { timeout });
const isComplete = (app, timeout = 20000) => app.waitForFunction(() => Templates.isComplete(), null, { timeout });
const look = app => app.evaluate(() => {
  const editor = EditorCore.getEditor && EditorCore.getEditor();
  const star = document.getElementById('btn-set-default-template');
  const email = document.getElementById('btn-linked-email');
  return {
    complete: Templates.isComplete(), hasLoaded: Templates.hasLoaded(), plan: EarlyOpen.plan(), text: editor ? editor.getText() : null, editable: editor ? editor.isEditable : null,
    currentId: Templates.getCurrentId(), cached: Templates.getCached().length, options: document.getElementById('template-select').options.length, selected: document.getElementById('template-select').value,
    starLocked: star ? (star.disabled || star.hasAttribute('data-pp-lock-soft')) : null, starTip: star ? [star.getAttribute('aria-label'), star.title, star.getAttribute('data-pp-lock-reason')].filter(Boolean).join(' | ') : '', emailLocked: email ? (email.disabled || email.hasAttribute('data-pp-lock-soft')) : null, settings: Templates.getDocumentSettings(), defaultId: Templates.getDefaultId(),
    loadingLine: !!document.querySelector('.tts-loading'), status: (document.getElementById('status-msg') || {}).textContent,
    order: window.__gristStub.state.callOrder.slice(), modelsRows: window.__gristStub.state.rows.Publipostage_Modeles.id.length,
    savedB: window.__gristStub.state.rows.Publipostage_Modeles.Contenu[1],
  };
});
const modelReads = order => order.filter(call => /^fetchTable Publipostage_Modeles/.test(call)).length;

// --- 1 à 3. Le cœur : la table lente (6 s), le document déjà ouvert ---
const slow = await openIt({ ready: false });
const app = slow.app;
await isReady(app);
const readyAfter = Date.now() - slow.startedAt;
const atReady = await look(app);
check('le widget est prêt BIEN avant la fin de la lecture de la table des modèles (6 s) : le document est ouvert depuis sa seule ligne', readyAfter < 5000 && atReady.complete === false && atReady.hasLoaded === false, { readyAfter, atReady: { complete: atReady.complete, plan: atReady.plan } });
check('le plan est « document seul » et l\'éditeur porte le texte de SA LIGNE (REST), pas celui de la table (« Contenu B »)', atReady.plan === 'partial' && /Texte lu par la seule ligne/.test(atReady.text || '') && !/Contenu B/.test(atReady.text || ''), atReady);
check('le document est éditable, courant (numéro 2) et sélectionné dans la liste, qui n\'a que lui (le cache est partiel)', atReady.editable === true && atReady.currentId === 2 && atReady.cached === 1 && String(atReady.selected) === '2' && atReady.options === 2, atReady);
check('les réglages du document sont déjà là (lus avec la ligne)', JSON.stringify(atReady.settings) === JSON.stringify(SETTINGS), atReady.settings);
check('le ★ est grisé tant que la liste n\'est pas lue (le ★ se retire des autres documents)', atReady.starLocked === true, atReady.starLocked);
const starReason = await app.evaluate(() => { const star = document.getElementById('btn-set-default-template'); return LockReasons.text ? LockReasons.text(star) : (star.title || ''); }).catch(() => '');
check('il dit pourquoi : « la liste des documents est en train de se charger » (info-bulle du grisé)', /liste des documents/i.test(starReason) || /liste des documents/i.test(atReady.starTip), { starReason, tip: atReady.starTip });
// L'arbre dit que la liste arrive.
await app.click('.tts-trigger');
await sleep(200);
const treeText = await app.evaluate(() => { const loading = document.querySelector('.tts-loading'); return loading ? loading.textContent : ''; });
check('l\'arbre des documents le dit : « La liste des autres documents se charge… »', /La liste des autres documents se charge/.test(treeText), treeText);
await app.keyboard.press('Escape');
// La table entière ne part qu'à la fin du démarrage, jamais avant.
const report = await app.evaluate(() => PerfTrace.report());
const at = label => report.indexOf(label);
check('le rapport de fluidité ordonne : document seul, widget prêt, liste lue en entier (la table ne part qu\'à la fin du démarrage)', at('ouverture : le document seul') !== -1 && at('modèles : cache partiel') !== -1 && at('ouverture : le document seul') < at('démarrage : widget prêt'), report.split('\n').filter(line => /ouverture|modèles|widget prêt/.test(line)).join(' / '));
const firstModelRead = atReady.order.findIndex(call => /^fetchTable Publipostage_Modeles/.test(call));
const lastStartupCall = Math.max(...atReady.order.map((call, at) => (/^fetchTable (Publipostage_LiensTables|PpDepart)$/.test(call) ? at : -1)));
check('la table des modèles est demandée APRÈS les lectures du démarrage (Grist, schéma, règles de liaison : elles ne font pas la queue derrière elle)', firstModelRead === -1 || firstModelRead > lastStartupCall, atReady.order);

// Une frappe + Enregistrer pendant la lecture : rien ne s'écrit avant la liste entière.
await app.evaluate(() => { const editor = EditorCore.getEditor(); editor.commands.focus('end'); editor.commands.insertContent(' MODIFIE'); });
await app.keyboard.press('Control+s');
await sleep(1500);
const during = await look(app);
check('une frappe puis Enregistrer pendant la lecture : rien n\'est écrit tant que la liste n\'est pas lue (le nom pris, le ★ et la date se lisent dans la table entière)', during.complete === false && during.savedB === '<p>Contenu B</p>', { complete: during.complete, saved: during.savedB });
const readsWhileWaiting = modelReads(during.order);
await isComplete(app);
await sleep(2500);
const done = await look(app);
check('la liste arrive : le cache est complet (6 documents), la liste les montre tous, le document ouvert reste sélectionné', done.complete === true && done.hasLoaded === true && done.cached === 6 && done.options === 7 && String(done.selected) === '2' && done.currentId === 2, done);
check('le document garde le texte de l\'écran : la liste complète ne le recharge pas', /Texte lu par la seule ligne/.test(done.text || '') && /MODIFIE/.test(done.text || ''), done.text);
check('le ★ se rallume, l\'arbre n\'a plus sa ligne d\'attente, le document par défaut est celui de la table (numéro 1)', done.starLocked === false && done.loadingLine === false && done.defaultId === 1, done);
check('l\'écriture qui attendait part une fois la liste lue : le document 2 porte le texte modifié, aucune ligne en plus', /MODIFIE/.test(done.savedB || '') && done.modelsRows === 6, { saved: done.savedB, rows: done.modelsRows });
check('une seule lecture de la table entière est partie pendant que l\'Enregistrer, l\'enregistrement automatique et le démarrage attendaient (ils ont partagé la même ; chaque lecture est faite deux fois comme avant : la table, puis ses colonnes migrées)', readsWhileWaiting >= 1 && readsWhileWaiting <= 2, { readsWhileWaiting });
const report2 = await app.evaluate(() => PerfTrace.report());
check('le rapport dit « modèles : liste complète » après « modèles : table reçue »', report2.indexOf('modèles : liste complète') > report2.indexOf('modèles : table reçue') && report2.indexOf('modèles : table reçue') > report2.indexOf('démarrage : widget prêt'), report2.split('\n').filter(line => /modèles|widget prêt/.test(line)).join(' / '));
await slow.context.close();

// --- 4. Un appel `ouvrir` pour un autre document pendant la lecture attend la liste ---
const another = await openIt({ ready: false });
await isReady(another.app);
const answer = another.app.evaluate(() => Promise.race([window.__gfsStub.call('ouvrir', { fichier: { id: 3, type: 'document' }, type: 'document', dossier: '', raison: 'explorateur' }), new Promise(resolve => setTimeout(() => resolve({ type: 'sans-reponse' }), 15000))]));
await sleep(1200);
const waiting = await look(another.app);
check('GFS demande un AUTRE document (numéro 3) pendant la lecture : il n\'est pas encore ouvert (la liste n\'est pas lue), l\'appel attend', waiting.complete === false && waiting.currentId === 2, waiting);
const reply = await answer;
await sleep(500);
const afterOpen = await look(another.app);
check('la liste arrivée, l\'appel est exécuté : « Départ C » est ouvert et GFS reçoit { ouvert: true }', afterOpen.currentId === 3 && /Contenu C/.test(afterOpen.text || '') && reply && reply.data && reply.data.ouvert === true, { reply, afterOpen: { id: afterOpen.currentId, text: afterOpen.text } });
await another.context.close();

// --- 6. Au moindre doute : le démarrage est celui d'avant (la table se lit tout de suite, le document vient d'elle) ---
async function asBefore(label, options, extra) {
  const run = await openIt(Object.assign({ slowMs: 0 }, options));
  await isReady(run.app);
  const view = await look(run.app);
  const rows = run.seen.filter(entry => /\/tables\//.test(entry.url)).length;
  check(label, view.plan === 'full' && view.complete === true && view.hasLoaded === true && view.cached === 6 && (extra ? extra(view, rows) : true), { plan: view.plan, complete: view.complete, cached: view.cached, text: view.text, rows });
  await run.context.close();
  return view;
}
const bContent = view => /Contenu B/.test(view.text || '');
await asBefore('un texte lié à un autre modèle (diapositive liée) : la table entière se lit, le document vient d\'elle', { rows: rowsOf({ Content: '<p data-link-mode="push">liée</p>' }) }, bContent);
await asBefore('un tableau lié à une grille (`data-linked-template`) : de même', { rows: rowsOf({ Content: '<table data-linked-template="3"><tr><td>x</td></tr></table>' }) }, bContent);
await asBefore('une copie de diapositive (`data-slide-source`) : de même', { rows: rowsOf({ Content: '<p><img data-slide-source="{}" src="x"></p>' }) }, bContent);
await asBefore('GFS désigne une présentation : la table entière se lit', { stub: opening(6, 'presentation') });
await asBefore('Grist refuse la ligne (HTTP 403) : la table entière se lit', { status: 403 }, bContent);
await asBefore('les réglages du document ne se lisent pas (HTTP 500) : la table entière se lit', { settingsStatus: 500 }, bContent);
await asBefore('une table sans le texte (colonnes d\'avant les noms anglais) : la table entière se lit', { rows: rowsOf({ Content: undefined }) }, bContent);
await asBefore('aucun fichier désigné (ouverture sans fichier) : la table entière se lit', { stub: { contextDelayMs: 300, ouverture: { fichier: null, type: 'document', dossier: '', raison: 'nouveau' } } });
await asBefore('GFS demande un import : la table entière se lit', { stub: opening(2, 'document', 'importer') });
await asBefore('l\'app seule, hors GFS : la table entière se lit', { hosted: false });
const reopened = await asBefore('un rechargement qui rouvre un modèle (`#pp-open=3`) : la table entière se lit, et c\'est « Départ C » qui s\'ouvre, pas le document désigné', { hash: '#pp-open=3' }, view => /Contenu C/.test(view.text || '') && view.currentId === 3);
void reopened;

// --- 7. Une lecture entière qui échoue laisse le document ouvert ; la suivante la complète ---
const failing = await openIt({ ready: false, slowMs: 0, seed: '\nstub.state.failModelsFetches = true;' });
await isReady(failing.app);
await sleep(2500);
const afterFailure = await look(failing.app);
check('la lecture entière échoue (réseau coupé) : le document reste ouvert avec son texte, le cache partiel n\'est pas vidé, la liste n\'est pas dite complète', afterFailure.currentId === 2 && /Texte lu par la seule ligne/.test(afterFailure.text || '') && afterFailure.cached === 1 && afterFailure.complete === false, { currentId: afterFailure.currentId, cached: afterFailure.cached, complete: afterFailure.complete });
await failing.app.evaluate(() => { window.__gristStub.state.failModelsFetches = false; return Templates.loadAll(); });
await isComplete(failing.app);
const afterRetry = await look(failing.app);
check('la lecture suivante réussit : la liste est complète (6 documents) et le document ouvert est resté celui de l\'écran', afterRetry.complete === true && afterRetry.cached === 6 && afterRetry.currentId === 2 && String(afterRetry.selected) === '2', afterRetry);
await failing.context.close();

t.finish();
