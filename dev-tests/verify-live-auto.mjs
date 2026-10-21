#!/usr/bin/env node
// L'ENTRÉE AUTOMATIQUE dans l'écriture en direct (js/live-entry.js, extensions/edition/ ; demande du 19/10) : quand une personne allume l'écriture en direct d'un modèle, celles qui l'ont ouvert -
// déjà là ou arrivées ensuite - la rejoignent toutes seules, sans la question « Rejoindre ? ». Des pages du widget dans un vrai navigateur qui partagent UNE table du direct
// (dev-tests/live-test-kit.mjs : un faux Grist par page, un GFS simulé qui donne le fichier assemblé `edition-live`), l'entrée automatique allumée (`liveAuto: true`).
//   0) sans salon vivant rien ne s'allume et rien n'est chargé (ni le code de l'extension ni le fichier de GFS), la table du direct n'existant pas encore ;
//   1) Alice allume : Bob et Carole, qui avaient le modèle ouvert, rejoignent toutes seules (aucune question), le texte voyage dans les deux sens ;
//   2) arriver plus tard : une page ouverte ensuite, un autre modèle rouvert sur celui-ci, le cadre isolé de GFS (sous la vraie politique de sécurité du contenu) rejoignent aussi ;
//      un modèle sans salon n'allume rien ;
//   3) quitter : la personne qui arrête le direct n'y est pas ramenée tant qu'elle n'a pas rouvert le modèle, puis elle y revient ; refuser la question n'y ramène pas non plus ;
//   4) rien n'est perdu : du texte tapé et pas enregistré n'est jamais remplacé ; du texte enregistré ici depuis l'arrivée n'est remplacé que par un salon qui en descend (le repère « d » du
//      salon) ; la Lecture n'est pas interrompue ;
//   5) un salon que plus personne n'occupe (une page fermée, une présence vieillie) n'attire personne et ne charge rien ; une table qui ne porte que des restes se relit lentement, mais une
//      ligne toute fraîche - un salon en train de naître - garde le rythme de 3 s ;
//   6) le widget seul, ou sans l'extension de GFS, ne lit même pas la table du direct ;
//   7) un fichier de GFS qui ne charge pas : un essai, sans fenêtre ni reprise en boucle, la ligne du menu dit pourquoi ;
//   8) gardes : ni erreur de page, ni message de la console, ni boîte native.
// Lancé par run-headless.mjs (groupe Node "liveAuto", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-live-auto.mjs (le fichier assemblé : bash dev-tests/offline-deps.sh)
import { startKit, liveFileExists, liveDebug, editorText, until, dialogShown, startLive, stopLive, converge, typeAt, LIVE_PATH } from './live-test-kit.mjs';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const finish = () => { console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0); };

if (!liveFileExists) {
  check('le fichier assemblé « edition-live » du miroir hors-ligne est là (bash dev-tests/offline-deps.sh)', false);
  finish();
}

const templates = [
  { id: 1, nom: 'Rapport', contenu: '<p>Bonjour</p><p>Seconde ligne</p>', def: true, type: 'document' },
  { id: 2, nom: 'Note', contenu: '<p>Une note</p>', def: false, type: 'document' },
  { id: 3, nom: 'Adresse', contenu: '<p>Voir la suite.</p>', def: false, type: 'document' },
  { id: 4, nom: 'Lettre', contenu: '<p>Cher ami</p>', def: false, type: 'document' },
];

const kit = await startKit({ port: Number(process.env.LIVE_AUTO_PORT || 8942) });
const table = kit.newTable();
table.exists = false;   // comme un vrai Grist où personne n'a encore allumé l'écriture en direct : la table du direct n'existe pas
const consoleProblems = [];
const expectedConsole = [];   // ce que la console dit d'une page dont le fichier de GFS est refusé exprès
const everyone = [];
// `liveAuto: true` par défaut ici (le kit la coupe sauf demande) ; `expectConsole` : les erreurs et avertissements de cette page sont attendus.
const person = async (name, options = {}) => {
  const { expectConsole = false, ...rest } = options;
  const opened = await kit.openPage(Object.assign({ table, templates, liveAuto: true, identity: { name, email: name.toLowerCase() + '@example.com' } }, rest));
  opened.page.on('console', (message) => { if (/^(error|warning)$/.test(message.type())) (expectConsole ? expectedConsole : consoleProblems).push(`${name} ${message.type()} : ${message.text().slice(0, 240)}`); });
  opened.name = name;
  everyone.push(opened);
  return opened;
};

// ---- Les gestes ---------------------------------------------------------------------------------------------------------------------------------

const sleep = ms => new Promise(done => setTimeout(done, ms));
const becomesLive = (view, ms = 25000) => view.waitForFunction(() => LiveEntry.isLive(), null, { timeout: ms }).then(() => true, () => false);
// Laisse passer assez de temps pour au moins deux relectures de l'entrée automatique (toutes les 3 s), puis dit si la page est restée hors du direct - et ne l'a pas été un instant non plus :
// un « démarrage » qui n'aboutit pas serait déjà le code de l'extension demandé pour rien.
async function staysOut(view, ms = 8000) {
  await view.evaluate(() => { window.__neverLeftOff = true; LiveEntry.onChange(() => { if (LiveEntry.state() !== 'off') window.__neverLeftOff = false; }); });
  await sleep(ms);
  return view.evaluate(() => window.__neverLeftOff && LiveEntry.state() === 'off');
}
async function openTemplate(view, id) {
  // Des frappes qui attendent d'être enregistrées font poser la question « Enregistrer / Abandonner / Annuler » (js/main.js:askBeforeLeaving) : ce sont celles d'un essai, on abandonne.
  const unsaved = await view.evaluate(() => LiveEntry.hasUnsavedEdits());
  await view.evaluate((wanted) => { const select = document.getElementById('template-select'); select.value = String(wanted); select.dispatchEvent(new Event('change')); }, id);
  if (unsaved) {
    await view.waitForFunction(dialogShown, null, { timeout: 5000 });
    await view.evaluate(() => { const b = Array.from(document.querySelectorAll('#pp-dialog-modal .var-modal-actions button')).find(x => x.offsetParent !== null && /Ne pas enregistrer/.test(x.textContent)); if (b) b.click(); });
  }
  await until(view, wanted => Templates.getCurrentId() != null && String(Templates.getCurrentId()) === String(wanted), id);
  await sleep(400);
}
const entered = view => liveDebug(view).then(d => (d ? { role: d.role, automatic: d.automatic, phase: d.phase } : null));
const asked = view => view.evaluate(dialogShown);
const barOf = view => view.evaluate(() => {
  const bar = document.getElementById('live-bar');
  return bar ? { state: bar.dataset.state, text: bar.querySelector('.live-bar-text').textContent, chips: Array.from(bar.querySelectorAll('.live-chip-name')).map(c => c.textContent) } : null;
});
const loaded = view => view.evaluate(() => ({ extension: Extensions.isLoaded('edition'), live: typeof LiveControl !== 'undefined', library: !!(globalThis.GfsPaquets && globalThis.GfsPaquets['edition-live']) }));
const model = (view, id) => view.evaluate((wanted) => {
  const m = window.__gristStub.state.rows.Publipostage_Modeles; const at = m.id.indexOf(wanted);
  return at < 0 ? null : { contenu: m.Contenu[at], dateModif: m.DateModif[at] };
}, id);
const ofDoc = (doc, kind) => table.of(doc, kind);
// Une ligne de présence telle que la bibliothèque la fabrique (y-protocols), calculée dans une page où elle est chargée : `state` null est une personne partie.
const realPresence = (view, state) => view.evaluate((wanted) => {
  const given = GfsPaquets['edition-live'].modules;
  const doc = new given['yjs'].Doc();
  const awareness = new given['y-protocols/awareness'].Awareness(doc);
  awareness.setLocalState(wanted);
  const bytes = given['y-protocols/awareness'].encodeAwarenessUpdate(awareness, [doc.clientID]);
  awareness.destroy();
  doc.destroy();
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return btoa(text);
}, state);
let nextRow = 1000;
const plant = (into, doc, kind, data, ageMs) => into.rows.push({ id: nextRow++, Doc: String(doc), Client: '99', Kind: kind, Seq: 1, Data: data, T: Date.now() - ageMs });
// Compte les lectures de la table du direct d'une page (le pont du kit, enveloppé avant que la page ne démarre).
const counter = 'const bridge = window.__liveBridge; window.__directReads = 0; window.__liveBridge = (...args) => { if (args[0] === \'fetchTable\') window.__directReads++; return bridge(...args); };';
const readsOf = view => view.evaluate(() => window.__directReads);

// ---- 0) Sans salon vivant, rien ----------------------------------------------------------------------------------------------------------------

console.log('\n== 0) Sans salon vivant, rien ne s\'allume et rien n\'est chargé ==');
const A = await person('Alice');
const B = await person('Bob');
const C = await person('Carole');
const quiet = await Promise.all([A, B, C].map(async p => ({ out: await staysOut(p.view, 6000), loaded: await loaded(p.view) })));
check('la table du direct n\'existe pas encore : les trois pages restent hors du direct', quiet.every(q => q.out), quiet);
check('… et ni le code de l\'extension, ni son moteur, ni le fichier de GFS n\'ont été demandés (« rien ne se charge sans salon »)', quiet.every(q => !q.loaded.extension && !q.loaded.live && !q.loaded.library) && [A, B, C].every(p => !p.requests.some(url => /extensions\/edition\/|edition-live/.test(url))), quiet);

// ---- 1) Alice allume, Bob et Carole rejoignent toutes seules ------------------------------------------------------------------------------------

console.log('\n== 1) Alice allume : les personnes qui avaient le modèle ouvert rejoignent toutes seules ==');
const startedAt = Date.now();
const first = await startLive(A.view);
check('Alice démarre seule, sans question : la table du direct est créée', first.started === true && table.exists === true && ofDoc(1, 's').length === 1, { exists: table.exists, kinds: table.rows.map(r => r.Kind).join('') });
const [bobIn, caroleIn] = await Promise.all([becomesLive(B.view), becomesLive(C.view)]);
const joinMs = Date.now() - startedAt;
check('Bob et Carole, qui avaient le même modèle ouvert, sont dans le direct sans avoir rien fait', bobIn && caroleIn, { bobIn, caroleIn });
console.log(`       (délai mesuré entre le clic d'Alice et l'entrée des deux autres : ${(joinMs / 1000).toFixed(1)} s ; relecture toutes les 3 s, plus le chargement de l'extension)`);
check('… sans AUCUNE question « Rejoindre ? » : ni fenêtre ouverte, ni boîte native', !(await asked(B.view)) && !(await asked(C.view)) && B.natives.length === 0 && C.natives.length === 0);
const [roleA, roleB, roleC] = await Promise.all([entered(A.view), entered(B.view), entered(C.view)]);
check('Alice a fondé le salon, Bob et Carole l\'ont rejoint (entrée automatique, pas un clic)', roleA.role === 'founder' && roleA.automatic === false && roleB.role === 'joiner' && roleB.automatic === true && roleC.role === 'joiner' && roleC.automatic === true, { roleA, roleB, roleC });
await until(A.view, () => document.querySelectorAll('#live-bar .live-chip').length === 3);
const barA = await barOf(A.view), barB = await barOf(B.view);
check('la barre dit « 2 autres personnes » chez Alice, avec leurs noms ; Bob voit Alice et Carole', barA.state === 'together' && /2 autres personnes/.test(barA.text) && barA.chips.includes('Bob') && barA.chips.includes('Carole') && barB.chips.includes('Alice') && barB.chips.includes('Carole'), { barA, barB });
check('le texte de Bob et de Carole est celui d\'Alice', (await converge([A.view, B.view, C.view])) !== null && (await editorText(B.view)) === 'BonjourSeconde ligne');
await typeAt(B.page, 'end', ' Bob-1', B.view);
check('ce que Bob tape arrive chez Alice et chez Carole', (await converge([A.view, B.view, C.view])) !== null && (await editorText(C.view)).includes('Bob-1'), await editorText(C.view));
check('les trois pages n\'ont qu\'un salon : un instantané et trois présences dans la table', ofDoc(1, 's').length === 1 && ofDoc(1, 'p').length === 3, { s: ofDoc(1, 's').length, p: ofDoc(1, 'p').length });

// ---- 2) Arriver plus tard -----------------------------------------------------------------------------------------------------------------------

console.log('\n== 2) Arriver plus tard : une page ouverte ensuite, un modèle rouvert, le cadre isolé de GFS ==');
const D = await person('Dora');
check('Dora ouvre le widget après coup : le modèle s\'ouvre et elle est dans le direct sans rien faire', await becomesLive(D.view), await entered(D.view));
const dora = await entered(D.view);
check('… par l\'entrée automatique, sans question', dora && dora.role === 'joiner' && dora.automatic === true && !(await asked(D.view)), dora);
const E = await person('Eve', { liveAuto: false });
await openTemplate(E.view, 2);
await E.view.evaluate(() => LiveEntry.setAutomatic(true));
check('Eve est sur un AUTRE modèle (« Note ») : il n\'y a pas de salon pour lui, elle reste hors du direct', await staysOut(E.view, 6000), await entered(E.view));
await openTemplate(E.view, 1);
check('Eve ouvre le modèle « Rapport » : elle rejoint le salon toute seule', await becomesLive(E.view), await entered(E.view));
check('le texte d\'Eve est celui du groupe, dans les cinq pages', (await converge([A.view, B.view, C.view, D.view, E.view])) !== null && (await editorText(E.view)).includes('Bob-1'));
await until(A.view, () => /4 autres personnes/.test(document.querySelector('#live-bar .live-bar-text').textContent));
check('Alice voit les quatre autres personnes dans sa barre (Bob, Carole, Dora, Eve)', /4 autres personnes/.test((await barOf(A.view)).text), await barOf(A.view));
const F = await person('Frida', { framed: true, bypassCSP: false });
const origin = await F.view.evaluate(() => window.origin);
check('Frida ouvre le widget dans un cadre isolé de GFS (origine opaque, vraie politique de sécurité du contenu) : elle rejoint toute seule', origin === 'null' && await becomesLive(F.view), { origin, entered: await entered(F.view) });
const frame = await F.view.evaluate(() => ({ violations: window.__cspViolations.slice(), role: LiveControl.debug().role, automatic: LiveControl.debug().automatic }));
check('… le fichier de GFS n\'est demandé qu\'une fois, la politique ne refuse rien, la console ne dit rien', frame.role === 'joiner' && frame.automatic === true && frame.violations.length === 0 && F.requests.filter(url => url.endsWith(LIVE_PATH)).length === 1 && consoleProblems.length === 0, { frame, requests: F.requests.filter(url => /edition-live/.test(url)), consoleProblems });
await typeAt(F.page, 'end', ' Frida-1', F.view);
check('ce que Frida tape dans son cadre arrive chez Alice', (await converge([A.view, F.view])) !== null && (await editorText(A.view)).includes('Frida-1'), await editorText(A.view));

// ---- 3) Quitter ---------------------------------------------------------------------------------------------------------------------------------

console.log('\n== 3) Quitter le direct : on n\'y est pas ramené, tant qu\'on n\'a pas rouvert le modèle ==');
await B.view.evaluate(() => document.querySelector('#live-bar .live-bar-stop').click());
await A.view.evaluate(() => LiveEntry.stop());
await Promise.all([B.view, A.view].map(v => v.waitForFunction(() => LiveEntry.state() === 'off', null, { timeout: 15000 })));
check('Bob (le bouton « Arrêter » de la barre) et Alice (la ligne du menu) sont sortis du direct', true);
const stillOut = await Promise.all([staysOut(B.view, 9000), A.view.evaluate(() => LiveEntry.state() === 'off')]);
check('neuf secondes plus tard, ni Bob ni Alice ne sont revenus dans le direct, alors que le salon vit toujours (Carole, Dora, Eve, Frida)', stillOut[0] && stillOut[1] && ofDoc(1, 's').length === 1, stillOut);
await openTemplate(B.view, 2);
await openTemplate(B.view, 1);
check('Bob rouvre le modèle : il est ramené dans le direct (arriver, c\'est rejoindre)', await becomesLive(B.view), await entered(B.view));
check('Alice, qui n\'a rien rouvert, reste dehors', await A.view.evaluate(() => LiveEntry.state() === 'off'));
const R = await person('Rita', { liveAuto: false });
check('Rita (entrée automatique coupée) a le même modèle ouvert et un salon vit : elle est hors du direct', await R.view.evaluate(() => LiveEntry.state() === 'off'));
const refused = await startLive(R.view, { ask: true, answer: 'Annuler' });
await R.view.evaluate(() => LiveEntry.setAutomatic(true));
check('Rita demande le direct, la question vient, elle refuse', refused.started === false && !!refused.asked && /Rejoindre/.test(refused.asked.title), refused);
check('… et l\'entrée automatique, rallumée, ne la ramène pas dans son dos (neuf secondes plus tard, elle est toujours dehors)', await staysOut(R.view, 9000));
await R.context.close();

// ---- 4) Rien n'est perdu ------------------------------------------------------------------------------------------------------------------------

console.log('\n== 4) Du texte tapé et pas enregistré n\'est jamais remplacé ==');
await openTemplate(C.view, 2);
await C.view.evaluate(() => localStorage.setItem('pp_autosave_enabled', 'false'));
await typeAt(C.page, 'end', ' brouillon de Carole', C.view);
check('Carole, sur « Note », a tapé et n\'a rien enregistré (l\'enregistrement automatique est coupé chez elle)', (await C.view.evaluate(() => LiveEntry.hasUnsavedEdits())) && (await editorText(C.view)).includes('brouillon'));
await openTemplate(A.view, 2);
const second = await startLive(A.view);
check('Alice ouvre « Note » et allume le direct', second.started === true && ofDoc(2, 's').length === 1, { s: ofDoc(2, 's').length });
const draftKept = await staysOut(C.view, 9000);
check('Carole a du texte non enregistré : neuf secondes plus tard, elle est hors du direct et son texte est intact', draftKept && (await editorText(C.view)).includes('brouillon de Carole'), { out: draftKept, text: await editorText(C.view) });
check('… elle n\'a rien écrit dans la table du direct (une seule présence : celle d\'Alice)', ofDoc(2, 'p').length === 1, ofDoc(2, 'p').length);
await openTemplate(C.view, 3);
await openTemplate(C.view, 2);
check('Carole abandonne son brouillon et rouvre « Note » : le texte est celui du groupe et elle rejoint toute seule', await becomesLive(C.view) && !(await editorText(C.view)).includes('brouillon'), await editorText(C.view));
await C.view.evaluate(() => localStorage.removeItem('pp_autosave_enabled'));

console.log('\n== 4b) Du texte enregistré ici depuis l\'arrivée n\'est remplacé que par un salon qui en descend ==');
await openTemplate(A.view, 4);
await openTemplate(B.view, 4);
await typeAt(B.page, 'end', ' ajout de Bob', B.view);
await B.view.evaluate(() => document.getElementById('btn-save').click());
await B.view.waitForFunction(() => !LiveEntry.hasUnsavedEdits(), null, { timeout: 30000 });
const saved = await model(B.view, 4);
check('Bob, sur « Lettre », a ajouté du texte et l\'a enregistré : Grist a une nouvelle date pour ce modèle', /ajout de Bob/.test(saved.contenu) && saved.dateModif > 1790000000, saved);
const stale = await startLive(A.view);
const marker = ofDoc(4, 'd')[0];
check('Alice, qui a ouvert « Lettre » avant cet ajout, allume le direct de son texte : le salon garde la date d\'avant l\'ajout de Bob (son repère « d »)', stale.started === true && !(await editorText(A.view)).includes('ajout de Bob') && !!marker && JSON.parse(marker.Data).modified === '1790000000', { text: await editorText(A.view), marker: marker && marker.Data });
const keptOut = await staysOut(B.view, 9000);
check('Bob a enregistré du texte que ce salon n\'a pas : neuf secondes plus tard, il est hors du direct et son ajout est intact', keptOut && (await editorText(B.view)).includes('ajout de Bob'), { out: keptOut, text: await editorText(B.view) });
await stopLive(A.view);
await A.view.evaluate(() => Templates.loadAll());
await openTemplate(A.view, 3);
await openTemplate(A.view, 4);
check('Alice rouvre « Lettre » : elle a maintenant le texte enregistré par Bob', (await editorText(A.view)).includes('ajout de Bob'), await editorText(A.view));
const fresh = await startLive(A.view);
check('Alice allume le direct de ce texte : Bob, dont l\'enregistrement est celui d\'où le salon est parti, le rejoint tout seul', fresh.started === true && await becomesLive(B.view) && (await editorText(B.view)).includes('ajout de Bob'), { role: await entered(B.view), text: await editorText(B.view) });

console.log('\n== 4c) La Lecture n\'est pas interrompue ==');
const L = await person('Léa', { liveAuto: false });
await L.view.evaluate(() => document.getElementById('btn-mode-read').click());
await L.view.evaluate(() => LiveEntry.setAutomatic(true));
check('Léa lit le modèle « Rapport » (mode Lecture) alors qu\'un salon y vit : neuf secondes plus tard, elle est hors du direct', await L.view.evaluate(() => !document.getElementById('btn-mode-edit').classList.contains('active')) && await staysOut(L.view, 9000), await entered(L.view));
await L.view.evaluate(() => document.getElementById('btn-mode-edit').click());
check('elle repasse en Édition : elle rejoint le salon toute seule', await becomesLive(L.view), await entered(L.view));
await L.context.close();

// ---- 5) Un salon que plus personne n'occupe ------------------------------------------------------------------------------------------------------

console.log('\n== 5) Un salon que plus personne n\'occupe n\'attire personne ==');
// Deux tables à part, chacune d'un seul modèle (« Adresse ») : les restes d'un salon (un instantané, la présence - telle que la bibliothèque l'écrit - d'une page fermée, celle d'une page tombée
// sans prévenir), vieux de plusieurs minutes d'un côté, tout frais de l'autre (un salon en train de naître : l'instantané précède la présence de quelques instants).
const closedPage = await realPresence(A.view, null);
const fallenPage = await realPresence(A.view, { user: { name: 'Zoé', color: '#c2255c' }, visible: true });
const leftovers = kit.newTable();
const newborn = kit.newTable();
const G = await person('Gaël', { table: leftovers, liveAuto: false, extraInit: counter });
const H = await person('Hélène', { table: newborn, liveAuto: false, extraInit: counter });
await Promise.all([openTemplate(G.view, 3), openTemplate(H.view, 3)]);
// Les restes sont posés une fois les pages prêtes : leur âge compte depuis cet instant.
plant(leftovers, 3, 's', 'AA==', 300000);
plant(leftovers, 3, 'p', closedPage, 200000);
plant(leftovers, 3, 'p', fallenPage, 120000);
plant(newborn, 3, 's', 'AA==', 1000);
plant(newborn, 3, 'p', closedPage, 1000);
const leftoversBefore = JSON.stringify(leftovers.rows);
const newbornBefore = JSON.stringify(newborn.rows);
await Promise.all([G, H].map(p => p.view.evaluate(() => LiveEntry.setAutomatic(true))));
const [gStart, hStart] = await Promise.all([readsOf(G.view), readsOf(H.view)]);
const [ghost, young] = await Promise.all([staysOut(G.view, 12000), staysOut(H.view, 12000)]);
const [gReads, hReads] = await Promise.all([readsOf(G.view), readsOf(H.view)]);
check('Gaël ouvre « Adresse », dont le salon n\'a plus que la trace d\'une page fermée et d\'une présence vieillie : il reste hors du direct', ghost, await entered(G.view));
check('Hélène ouvre « Adresse », dont le salon vient de naître sans présence encore (celle d\'une page qui vient de se fermer) : elle reste hors du direct', young, await entered(H.view));
check('… ni l\'une ni l\'autre ne charge le code de l\'extension ni le fichier de GFS, et rien ne s\'écrit dans les tables du direct', JSON.stringify(leftovers.rows) === leftoversBefore && JSON.stringify(newborn.rows) === newbornBefore && !(await loaded(G.view)).extension && !(await loaded(H.view)).extension && [G, H].every(p => !p.requests.some(url => /extensions\/edition\/|edition-live/.test(url))), { g: await loaded(G.view), h: await loaded(H.view) });
check('une table qui ne porte que des restes se relit lentement : au plus trois lectures en douze secondes (une toutes les 10 s)', gReads - gStart >= 1 && gReads - gStart <= 3, { reads: gReads - gStart });
check('mais une ligne toute fraîche garde le rythme de 3 s : au moins trois lectures en douze secondes (un salon peut naître d\'une seconde à l\'autre)', hReads - hStart >= 3, { reads: hReads - hStart });
await Promise.all([G.context.close(), H.context.close()]);

// ---- 6) Le widget seul, ou sans l'extension -----------------------------------------------------------------------------------------------------

console.log('\n== 6) Le widget seul, ou sans l\'extension de GFS, ne lit pas la table du direct ==');
const U = await person('Hugo', { extensions: [], extraInit: counter });
const V = await person('Inès', { hosted: false, extraInit: counter });
await sleep(8000);
const calls = await Promise.all([U, V].map(p => p.view.evaluate(() => ({ reads: window.__directReads, live: LiveEntry.state() }))));
check('Hugo (l\'extension n\'est pas active dans GFS) et Inès (le widget seul), qui ont le modèle « Rapport » ouvert alors qu\'un salon y vit, ne lisent pas une fois la table du direct et restent hors du direct', calls.every(c => c.reads === 0 && c.live === 'off'), calls);
await Promise.all([U.context.close(), V.context.close()]);

// ---- 7) Un fichier de GFS qui ne charge pas -----------------------------------------------------------------------------------------------------

console.log('\n== 7) Un fichier de GFS qui ne charge pas : un essai, en silence ==');
const J = await person('Jade', { editionLive: 'badIntegrity', expectConsole: true });
await sleep(9000);
const jade = await J.view.evaluate(() => ({ live: LiveEntry.state(), reason: LiveEntry.reason(), kind: (LiveEntry.unavailable() || {}).kind || null, failure: Extensions.failureOf('edition') }));
jade.dialog = await asked(J.view);
check('Jade a le modèle ouvert alors qu\'un salon y vit, et GFS donne une empreinte fausse : elle reste hors du direct, sans fenêtre, et la ligne du menu dit pourquoi', jade.live === 'off' && !jade.dialog && jade.kind === 'load' && jade.failure !== '' && jade.reason !== '', jade);
check('… un seul essai de charger le fichier : l\'entrée automatique ne reprend pas en boucle (le clic sur la ligne est la reprise)', J.requests.filter(url => /edition-live/.test(url)).length === 1 && J.natives.length === 0, J.requests.filter(url => /edition-live/.test(url)));
await J.context.close();

// ---- 8) Gardes ----------------------------------------------------------------------------------------------------------------------------------

console.log('\n== 8) Gardes ==');
check('aucune erreur de page', kit.pageErrors.length === 0, kit.pageErrors);
check('aucun message d\'erreur ni d\'avertissement de la console (hors la page au fichier de GFS refusé exprès)', consoleProblems.length === 0, consoleProblems.slice(0, 5));
check('la page au fichier refusé n\'a dit que ce qu\'on attend d\'elle : le refus du fichier et l\'avertissement de l\'entrée automatique', expectedConsole.length > 0 && expectedConsole.every(line => /integrity|digest|edition-live|entrée automatique|Failed to load|net::/i.test(line)), expectedConsole);
check('aucune boîte native (alert, confirm, prompt)', everyone.every(p => p.natives.length === 0), everyone.map(p => p.natives));

await kit.close();
finish();
