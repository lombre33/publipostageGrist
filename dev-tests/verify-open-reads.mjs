#!/usr/bin/env node
// Ce que l'OUVERTURE du widget demande à Grist (consigne 095 de GFS, 24/11 : à l'ouverture, 25 appels à Grist dont 14 différents, `_grist_Tables` ×4, la liste des tables ×4, les colonnes ×3, et la ligne-sonde de l'adresse e-mail :
// une écriture, une lecture, une suppression ; « vise une dizaine d'appels »). Le journal des appels est tenu AU PLUS PRÈS du faux Grist (un script posé avant ceux de la page enveloppe `grist.docApi` à son arrivée), donc ce qu'il compte
// est ce qui part vraiment, après le partage de js/open-reads.js. Sur un document déjà à jour (la photo d'une première ouverture, qui a fait ses migrations) :
//  1. GFS donne l'adresse (`identite` du contexte) : chaque table de métadonnées, la liste des tables et le jeton de lecture ne sont demandés qu'UNE fois, la ligne-sonde n'est ni écrite, ni lue, ni retirée, l'adresse est celle de GFS
//     (la casse gardée), les préférences de rangement se lisent pour elle, et l'ouverture tient en une dizaine d'appels ;
//  2. GFS ne connaît pas encore la personne (`identite` null) ou ne donne rien (une app qui n'a pas la permission, un GFS d'avant) ou l'app est seule : la sonde reprend, UNE ligne ajoutée, lue et retirée, et les lectures restent partagées ;
//  3. l'adresse que GFS apprend plus tard (événement `identite`) est vue sans rien lire ; une adresse tordue (sans « @ ») n'est pas crue ;
//  4. TÉMOIN : le même départ sans js/open-reads.js relit la liste des tables et les métadonnées plusieurs fois (le compte ne serait pas aveugle) ; sur un document qui n'est pas à jour, ses migrations (une colonne ajoutée) vident ce qui
//     est en commun : la lecture qui suit une écriture de structure part toujours à neuf, et le document finit migré, sans erreur de page ;
//  5. le premier geste vrai de la personne ferme l'ouverture : une lecture demandée avant est partagée, la même après part à chaque fois ; le jeton qui peut écrire n'est jamais partagé.
// Lancé par run-headless.mjs (groupe Node « openReads », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-open-reads.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-open-reads', port: Number(process.env.OPEN_READS_PORT || 9223) });
const { check } = t;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Le journal : chaque appel de `grist.docApi`, au plus près du faux Grist (posé AVANT les scripts de la page : js/perf-trace.js puis js/open-reads.js l'enveloppent ensuite).
const recorder = `
(function () {
  window.__calls = [];
  let g;
  function wrapDocApi(api) {
    Object.keys(api).forEach(name => {
      const fn = api[name];
      if (typeof fn !== 'function') return;
      api[name] = function () {
        const args = Array.from(arguments);
        let what = name;
        if (name === 'fetchTable' || name === 'getTable') what += ' ' + args[0];
        if (name === 'applyUserActions') what += ' ' + JSON.stringify((args[0] || []).map(a => a.slice(0, 2)));
        if (name === 'getAccessToken') what += ' ' + JSON.stringify(args[0] || null);
        window.__calls.push(what);
        return fn.apply(this, arguments);
      };
    });
  }
  Object.defineProperty(window, 'grist', { configurable: true, get() { return g; }, set(v) { g = v; try { if (v && v.docApi) wrapDocApi(v.docApi); } catch (e) { /* rien */ } } });
})();
`;

// Les appels comptés par nom, et ce qui touche la sonde.
const tally = calls => { const out = {}; for (const call of calls) out[call] = (out[call] || 0) + 1; return out; };
const PROBE_TABLE = 'Publipostage_UserProbe';
const probeCalls = calls => calls.filter(call => call.indexOf(PROBE_TABLE) !== -1);
const METADATA = ['fetchTable _grist_Tables', 'fetchTable _grist_Tables_column', 'fetchTable _grist_DocInfo', 'listTables', 'getAccessToken {"readOnly":true}'];

async function opening({ stub = {}, seed, hosted = true, before = null, wait = 1500 } = {}) {
  const { page } = await t.openPage({ hosted, stub: hosted ? Object.assign({ extensions: [] }, stub) : null, seed, lang: 'fr', colorScheme: 'light', init: recorder, before });
  await page.waitForFunction(() => typeof Editor !== 'undefined' && !!EditorCore.getEditor(), null, { timeout: 30000 });
  await sleep(wait);
  const calls = await page.evaluate(() => window.__calls.slice());
  return { page, calls, counts: tally(calls) };
}

// Une première ouverture migre le document ; sa photo sert de départ aux suivantes (un document à jour : plus d'écriture de structure à l'ouverture).
const first = await opening({ seed: seedModels() });
const photo = await first.page.evaluate(() => {
  const state = window.__gristStub.state;
  const out = {};
  ['tables', 'columns', 'choices', 'displayCols', 'visibleCols', 'labels', 'formats', 'condRules', 'formulas', 'rows', 'nextRowId'].forEach(key => { out[key] = state[key]; });
  return JSON.stringify(out);
});
// `userEmail` : ce que la formule déclenchée de la sonde rend (le faux Grist ne la calcule que si un essai la fixe) ; GFS, quand il donne l'adresse, passe avant.
const PROBE_EMAIL = 'sonde@exemple.fr';
const upToDate = 'Object.assign(stub.state, ' + photo + '); stub.state.userEmail = ' + JSON.stringify(PROBE_EMAIL) + ';';
check('le document de départ s\'est migré à sa première ouverture (la table des préférences existe maintenant)', JSON.parse(photo).tables.indexOf('Publipostage_PreferencesModeles') !== -1, JSON.parse(photo).tables);
await first.page.context().close();

const GIVEN = 'Ada.Lovelace@Exemple.fr';

// --- 1. GFS donne l'adresse ---
{
  const { page, calls, counts } = await opening({ seed: upToDate, stub: { identite: { email: GIVEN } } });
  METADATA.forEach(name => check('GFS donne l\'adresse : « ' + name + ' » n\'est demandé qu\'une fois à l\'ouverture', counts[name] === 1, counts[name]));
  check('GFS donne l\'adresse : aucun appel ne touche la ligne-sonde (ni écriture, ni lecture, ni retrait)', probeCalls(calls).length === 0, probeCalls(calls));
  check('GFS donne l\'adresse : l\'ouverture tient en une dizaine d\'appels (10 au plus)', calls.length <= 10, calls.length + ' : ' + JSON.stringify(counts));
  check('GFS donne l\'adresse : aucune table n\'est lue deux fois', Object.keys(counts).filter(name => /^fetchTable /.test(name)).every(name => counts[name] === 1), JSON.stringify(counts));
  check('GFS donne l\'adresse : la session la connaît telle que GFS la donne (la casse gardée)', await page.evaluate(() => GristAPI.peekCurrentUser().email) === GIVEN);
  check('GFS donne l\'adresse : les préférences de rangement se sont lues pour elle (la table est lue une fois)', counts['fetchTable Publipostage_PreferencesModeles'] === 1, counts['fetchTable Publipostage_PreferencesModeles']);
  check('GFS donne l\'adresse : l\'état de la lecture partagée est dit (des lectures servies, aucune lecture envoyée de trop)', await page.evaluate(() => { const s = OpenReads.state(); return s.sent >= 5 && s.served >= 3; }));
  // L'adresse reste la même quand quelqu'un la redemande, et rien ne part vers Grist.
  const before = (await page.evaluate(() => window.__calls.length));
  check('GFS donne l\'adresse : la redemander ne lit rien', await page.evaluate(() => GristAPI.getCurrentUserEmail()) === GIVEN && (await page.evaluate(() => window.__calls.length)) === before);
  await page.context().close();
}

// --- 2. GFS ne donne pas l'adresse : la sonde reprend (une ligne ajoutée, lue, retirée), les lectures restent partagées ---
const noIdentity = {
  'GFS ne connaît pas encore la personne (identite null)': { stub: { identite: null }, hosted: true },
  'l\'app n\'a pas la permission (pas de clé identite) ou GFS d\'avant': { stub: {}, hosted: true },
  'l\'app est seule (hors de GFS)': { stub: null, hosted: false },
};
for (const [label, options] of Object.entries(noIdentity)) {
  const { page, calls, counts } = await opening({ seed: upToDate, stub: options.stub || {}, hosted: options.hosted });
  const probe = probeCalls(calls);
  check(label + ' : la sonde ajoute une ligne, la lit, la retire (3 appels, une fois chacun)', probe.length === 3 && probe.filter(call => /AddRecord/.test(call)).length === 1 && probe.filter(call => /RemoveRecord/.test(call)).length === 1 && probe.filter(call => /^fetchTable /.test(call)).length === 1, probe);
  METADATA.forEach(name => check(label + ' : « ' + name + ' » n\'est demandé qu\'une fois', counts[name] === 1, counts[name]));
  check(label + ' : l\'adresse est celle que Grist donne à la sonde', await page.evaluate(() => GristAPI.peekCurrentUser().email) === PROBE_EMAIL);
  await page.context().close();
}

// --- 3. L'événement `identite`, et une adresse tordue ---
{
  const { page } = await opening({ seed: upToDate, stub: { identite: null } });
  check('avant, la session ne connaissait que l\'adresse que la sonde a lue', await page.evaluate(() => GristAPI.peekCurrentUser().email) === PROBE_EMAIL);
  const later = await opening({ seed: 'Object.assign(stub.state, ' + photo + '); stub.state.userEmail = null;', stub: { identite: null } });
  check('sans adresse de GFS ni de la sonde, la session n\'en connaît pas', await later.page.evaluate(() => GristAPI.peekCurrentUser().email) === '');
  await later.page.evaluate(address => window.__gfsStub.setIdentite({ email: address }), GIVEN);
  await sleep(100);
  check('GFS apprend l\'adresse plus tard (événement identite) : la session la voit sans rien lire', await later.page.evaluate(() => GristAPI.peekCurrentUser().email) === GIVEN);
  check('et l\'événement ne fait aucun appel à Grist', (await later.page.evaluate(() => window.__calls.slice())).length === later.calls.length);
  await later.page.evaluate(() => window.__gfsStub.setIdentite({ email: 'pas une adresse' }));
  await sleep(100);
  check('une adresse tordue (sans « @ ») n\'est pas crue', await later.page.evaluate(() => GfsLink.identity()) === null);
  await later.page.context().close();
  await page.context().close();
}

// --- 4. Témoin : sans le partage, le même départ relit plusieurs fois ; document pas à jour : la lecture qui suit une écriture de structure part à neuf ---
{
  const blank = async page => { await page.route('**/js/open-reads.js*', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '// coupé : la mesure témoin' })); };
  const { page, counts } = await opening({ seed: upToDate, stub: { identite: { email: GIVEN } }, before: blank });
  check('TÉMOIN : sans js/open-reads.js, la liste des tables est demandée plusieurs fois', counts.listTables >= 3, counts.listTables);
  check('TÉMOIN : sans js/open-reads.js, les métadonnées sont relues (_grist_Tables, _grist_Tables_column)', counts['fetchTable _grist_Tables'] >= 2 && counts['fetchTable _grist_Tables_column'] >= 2, JSON.stringify(counts));
  check('TÉMOIN : sans js/open-reads.js, le jeton de lecture est demandé deux fois', counts['getAccessToken {"readOnly":true}'] === 2, counts['getAccessToken {"readOnly":true}']);
  await page.context().close();

  const fresh = await opening({ seed: seedModels(), stub: { identite: { email: GIVEN } } });
  const structure = fresh.calls.filter(call => /^applyUserActions .*(AddTable|AddVisibleColumn|AddColumn)/.test(call));
  check('document pas à jour : ses migrations (colonnes et tables ajoutées) ont lieu à l\'ouverture', structure.length >= 2, structure);
  const migrated = await fresh.page.evaluate(() => ({ tables: window.__gristStub.state.tables, columns: Object.keys(window.__gristStub.state.columns.Publipostage_Modeles || {}) }));
  check('document pas à jour : la table des préférences est créée, une seule fois', migrated.tables.filter(name => name === 'Publipostage_PreferencesModeles').length === 1, migrated.tables);
  check('document pas à jour : la lecture qui suit une écriture de structure n\'est jamais servie d\'avant (les métadonnées sont relues après elle)', fresh.counts['fetchTable _grist_Tables_column'] >= 2, fresh.counts['fetchTable _grist_Tables_column']);
  check('document pas à jour : aucune ligne-sonde (GFS donne l\'adresse)', probeCalls(fresh.calls).length === 0, probeCalls(fresh.calls));
  await fresh.page.context().close();
}

// --- 5. Le premier geste vrai ferme l'ouverture ; le jeton qui peut écrire n'est jamais partagé ---
{
  const { page } = await opening({ seed: upToDate, stub: { identite: { email: GIVEN } }, wait: 800 });
  const count = () => page.evaluate(() => window.__calls.length);
  const lists = () => page.evaluate(() => window.__calls.filter(call => call === 'listTables').length);
  check('l\'ouverture est ouverte tant que personne n\'a touché la page', await page.evaluate(() => OpenReads.state().open) === true);
  let base = await lists();
  await page.evaluate(() => Promise.all([grist.docApi.listTables(), grist.docApi.listTables()]));
  check('pendant l\'ouverture, deux listes demandées ensemble n\'envoient qu\'un appel à Grist... au plus (la liste est déjà en commun : aucun)', (await lists()) - base <= 1, (await lists()) - base);
  base = await page.evaluate(() => window.__calls.filter(call => call.indexOf('getAccessToken {"readOnly":false}') === 0).length);
  await page.evaluate(() => Promise.all([grist.docApi.getAccessToken({ readOnly: false }), grist.docApi.getAccessToken({ readOnly: false })]));
  check('le jeton qui peut écrire part à chaque demande, jamais partagé', (await page.evaluate(() => window.__calls.filter(call => call.indexOf('getAccessToken {"readOnly":false}') === 0).length)) - base === 2);
  await page.mouse.click(10, 10);
  await sleep(100);
  check('le premier geste vrai de la personne ferme l\'ouverture', await page.evaluate(() => OpenReads.state().open) === false);
  base = await lists();
  await page.evaluate(() => Promise.all([grist.docApi.listTables(), grist.docApi.listTables()]));
  check('après le geste, chaque lecture part à neuf', (await lists()) - base === 2, (await lists()) - base);
  check('après le geste, une fenêtre qui relit les colonnes les relit vraiment (jamais servie d\'avant)', await (async () => {
    const was = (await page.evaluate(() => window.__calls.filter(call => call === 'fetchTable _grist_Tables_column').length));
    await page.evaluate(() => GristAPI.refreshColumnMeta());
    return (await page.evaluate(() => window.__calls.filter(call => call === 'fetchTable _grist_Tables_column').length)) > was;
  })());
  await page.context().close();
}

await t.finish();
