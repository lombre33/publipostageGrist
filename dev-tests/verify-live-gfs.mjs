#!/usr/bin/env node
// L'écriture en direct et Grist Factory Suite (GFS) : les essais (a) et (c) de la consigne 012 de GFS, SANS contournement de la politique de sécurité du contenu d'index.html (le seul autre
// script qui la subit est dev-tests/verify-csp.mjs). Le fichier assemblé « edition-live » (les six paquets de Yjs en UN module) est celui du miroir hors-ligne (dev-tests/.offline-cache/
// edition-live/, construit par `bash dev-tests/offline-deps.sh`), servi comme GFS le servira : à l'adresse de la page, avec son empreinte, l'en-tête CORS qu'exige un sous-cadre à origine opaque.
//   1) ce que l'app nomme : ni sa carte d'importation, ni sa politique, ni son code ne nomment un des six paquets (le fichier est à GFS, jamais à l'app) ;
//   2) HÉBERGÉ, page de premier niveau : l'extension se charge au premier clic (`<script type="module">`, empreinte, crossorigin="anonymous", UNE demande), le fichier pose
//      `GfsPaquets['edition-live'].modules` avec les cinq clés promises, l'écriture en direct démarre, la politique ne refuse rien ;
//   3) HÉBERGÉ, dans un sous-cadre SANS allow-same-origin comme celui d'une app de GFS (origine opaque) : même chose, et deux personnes - l'une dans ce cadre, l'autre dans une page ordinaire -
//      écrivent le même texte, aussi dans un cadre isolé ;
//   4) l'empreinte fausse : le navigateur refuse le fichier, l'extension ne se charge pas, la ligne reste GRISÉE avec la raison (jamais muette), le clic suivant retente, et la bonne empreinte
//      (l'événement `extensions` de GFS) la rend utilisable ; une bibliothèque absente, donnée sans sa forme « module » ou d'une autre origine : même chose, et rien n'est demandé à l'autre origine ;
//   5) une extension que la personne n'a pas activée dans GFS : le clic appelle `installer` ;
//   6) SEUL (adresse sans `gfs=`) : la ligne reste grisée avec sa raison, son clic ouvre la fenêtre « passez par GFS », et rien d'autre ne change : aucun fichier de l'extension ni de GFS demandé, aucune
//      table créée, le suivi des modifications, l'en-tête et le pied, les tableaux liés et l'historique de l'éditeur sont ceux d'avant.
// Lancé par run-headless.mjs (groupe Node "liveGfs", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-live-gfs.mjs (le fichier assemblé : bash dev-tests/offline-deps.sh)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { startKit, ROOT, LIVE_PATH, liveIntegrity, liveFileExists, editorText, until, dialogShown, dialogGone, dialogInfo, pressDialogButton, startLive, converge, typeAt } from './live-test-kit.mjs';

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

// Les six paquets que le fichier de GFS porte, et les cinq clés de GfsPaquets['edition-live'].modules (consigne 012, point 1.3).
const SIX = ['yjs', 'y-protocols', 'lib0', '@tiptap/y-tiptap', '@tiptap/extension-collaboration', '@tiptap/extension-collaboration-caret'];
const KEYS = ['yjs', 'y-protocols/awareness', '@tiptap/y-tiptap', '@tiptap/extension-collaboration', '@tiptap/extension-collaboration-caret'];

// ---- 1) Ce que l'app nomme ---------------------------------------------------------------------------------------------------------------------

console.log('\n== 1) Ce que l\'app nomme ==');
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const importMap = JSON.parse(/<script type="importmap">\s*([\s\S]*?)<\/script>/.exec(indexHtml)[1]);
const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(indexHtml)[1];
const named = SIX.filter(name => Object.keys(importMap.imports).concat(Object.values(importMap.imports)).some(entry => entry === name || entry.includes('/' + name + '@') || entry.includes('/' + name + '/') || entry.startsWith(name + '/')));
check('la carte d\'importation d\'index.html ne nomme aucun des six paquets (ni leurs sous-chemins)', named.length === 0, named);
check('la politique de sécurité du contenu ne nomme ni GFS, ni un fichier d\'extension : le fichier de GFS passe par \'self\'', !/gfs|edition|vendor|yjs/i.test(policy) && /script-src[^;]*'self'/.test(policy), policy);
check('index.html ne charge rien de plus pour l\'écriture en direct (seul js/live-entry.js, le point d\'entrée du socle)', !/yjs|y-protocols|lib0|y-tiptap|extension-collaboration|edition-live/i.test(indexHtml) && /js\/live-entry\.js/.test(indexHtml));
function sourcesIn(dir, found = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourcesIn(path, found); else if (/\.js$/.test(name)) found.push(path);
  }
  return found;
}
const sources = sourcesIn(join(ROOT, 'js')).concat(sourcesIn(join(ROOT, 'extensions')));
const imports = [];
sources.forEach((file) => {
  const text = readFileSync(file, 'utf8');
  for (const hit of text.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]/g)) imports.push(file.replace(ROOT + '/', '') + ' : ' + hit[1]);
  for (const hit of text.matchAll(/^\s*import\s+[^;]*?from\s+['"]([^'"]+)['"]/gm)) imports.push(file.replace(ROOT + '/', '') + ' : ' + hit[1]);
});
const importsOfSix = imports.filter(entry => SIX.some(name => entry.split(' : ')[1] === name || entry.split(' : ')[1].startsWith(name + '/')));
check('aucun fichier du widget n\'importe un des six paquets (import() ou import ... from) : ils ne viennent que de GfsPaquets', importsOfSix.length === 0, importsOfSix);
const editionFiles = sources.filter(file => /extensions\/edition\//.test(file));
const dynamic = imports.filter(entry => /extensions\/edition\//.test(entry));
check('l\'extension « édition » n\'importe que la bibliothèque de l\'éditeur du widget (prosemirror-state), rien de Yjs', editionFiles.length >= 4 && dynamic.every(entry => /: prosemirror-state$/.test(entry)), dynamic);

// ---- Le banc -----------------------------------------------------------------------------------------------------------------------------------

const kit = await startKit({ port: Number(process.env.LIVE_GFS_PORT || 8944) });
const table = kit.newTable();   // la salle de Frida (cadre isolé) et de Paul (page ordinaire) ; les autres cas ont la leur
const templates = [{ id: 1, nom: 'Rapport', contenu: '<p>Bonjour</p><p>Seconde ligne</p>', def: true, type: 'document' }];
const GOOD = { src: LIVE_PATH, integrite: liveIntegrity, forme: 'module' };
const consoleProblems = [];

// Ouvre une page sous la VRAIE politique de sécurité du contenu (bypassCSP: false) et note ce qu'elle demande au réseau et ce que la console dit.
async function openCase(name, options) {
  const opened = await kit.openPage(Object.assign({ templates, bypassCSP: false, identity: { name, email: name.toLowerCase() + '@example.com' } }, options));
  opened.library = [];
  opened.problems = [];
  opened.page.on('request', (request) => { if (/edition-live|autre\.example/.test(request.url())) opened.library.push({ url: request.url(), request }); });
  opened.page.on('console', (message) => { if (/^(error|warning)$/.test(message.type())) { opened.problems.push(message.text().slice(0, 300)); consoleProblems.push(`${name} : ${message.text().slice(0, 200)}`); } });
  return opened;
}
const rowOf = view => view.evaluate(() => {
  const row = document.getElementById('v2-btn-live');
  return { aria: row.getAttribute('aria-disabled'), explains: row.hasAttribute('data-explains'), grey: row.classList.contains('v2-hover-row-disabled'), title: row.title, label: document.getElementById('v2-btn-live-label').textContent };
});
// Un clic sur la ligne quand il doit en sortir une fenêtre simple (une explication, un échec) : rend ce que la fenêtre dit, et le résultat du clic.
async function clickExpectingNotice(view) {
  const done = view.evaluate(() => LiveEntry.toggle());
  await view.waitForFunction(dialogShown, null, { timeout: 30000 });
  const info = await view.evaluate(dialogInfo);
  await pressDialogButton(view, 'Fermer');
  const result = await done;
  await view.waitForFunction(dialogGone, null, { timeout: 5000 });
  return { info, result };
}
const stateOf = view => view.evaluate(() => ({ live: LiveEntry.state(), loaded: Extensions.isLoaded('edition'), packages: typeof GfsPaquets === 'undefined' ? null : Object.keys(GfsPaquets), violations: window.__cspViolations.slice() }));
const REASON_ROW = /Cliquer pour réessayer/;

// ---- 2) Hébergé, page de premier niveau --------------------------------------------------------------------------------------------------------

console.log('\n== 2) Hébergé par GFS, page de premier niveau ==');
const top = await openCase('Alice', { table: kit.newTable() });
const topBefore = { library: top.library.length, rows: await rowOf(top.page), state: await stateOf(top.page) };
check('avant le premier clic : aucun fichier de la bibliothèque n\'est demandé, la ligne est utilisable', topBefore.library === 0 && topBefore.rows.aria === 'false' && !topBefore.state.loaded && topBefore.state.packages === null, topBefore);
const topStart = await startLive(top.page);
const topState = await stateOf(top.page);
check('le premier clic charge l\'extension et allume le direct, sans question', topStart.started === true && topState.live === 'live' && topState.loaded, topState);
const topPackages = await top.page.evaluate(() => { const given = GfsPaquets['edition-live']; return { version: given.version, keys: Object.keys(given.modules).sort(), yjs: typeof given.modules['yjs'].Doc, awareness: typeof given.modules['y-protocols/awareness'].Awareness, sync: typeof given.modules['@tiptap/y-tiptap'].ySyncPlugin }; });
check('le fichier a posé GfsPaquets[\'edition-live\'] : version 1.0.0 et les cinq modules promis (yjs, y-protocols/awareness, @tiptap/y-tiptap et les deux extensions de TipTap)', topPackages.version === '1.0.0' && JSON.stringify(topPackages.keys) === JSON.stringify(KEYS.slice().sort()) && topPackages.yjs === 'function' && topPackages.awareness === 'function' && topPackages.sync === 'function', topPackages);
check('UNE seule demande du fichier, à l\'adresse exacte que GFS a donnée (pas de ?r=, pas d\'import dynamique)', top.library.length === 1 && top.library[0].url.endsWith(LIVE_PATH), top.library.map(entry => entry.url));
check('la politique de sécurité du contenu ne refuse rien, la console ne dit rien', topState.violations.length === 0 && top.problems.length === 0, { violations: topState.violations, console: top.problems });

// ---- 3) Hébergé, dans un sous-cadre sans allow-same-origin -------------------------------------------------------------------------------------

console.log('\n== 3) Hébergé par GFS, dans un sous-cadre SANS allow-same-origin ==');
const framed = await openCase('Frida', { table, framed: true });
const origins = await framed.view.evaluate(() => ({ document: window.origin, address: location.origin, storage: (() => { try { return typeof window.localStorage; } catch (e) { return 'refusé'; } })() }));
check('le cadre est bien à origine opaque : window.origin vaut « null », location.origin reste celui de l\'adresse (c\'est ce que lit ExportCommon.scriptRefusal)', origins.document === 'null' && origins.address === kit.base, origins);
const framedStart = await startLive(framed.view);
const framedState = await stateOf(framed.view);
check('dans ce cadre, le premier clic charge l\'extension et le fichier de GFS (<script type="module">, empreinte, crossorigin) et allume le direct', framedStart.started === true && framedState.live === 'live' && framedState.loaded, framedState);
const framedKeys = await framed.view.evaluate(() => Object.keys(GfsPaquets['edition-live'].modules).sort());
check('GfsPaquets[\'edition-live\'].modules y porte les cinq clés', JSON.stringify(framedKeys) === JSON.stringify(KEYS.slice().sort()), framedKeys);
const framedHeaders = await Promise.all(framed.library.map(async entry => ({ url: entry.url, origin: (await entry.request.allHeaders())['origin'] || null })));
check('la demande du fichier est une demande CORS venue d\'une origine « null », à l\'adresse exacte, une seule fois', framedHeaders.length === 1 && framedHeaders[0].url.endsWith(LIVE_PATH) && framedHeaders[0].origin === 'null', framedHeaders);
check('la politique ne refuse rien dans le cadre, la console ne dit rien', framedState.violations.length === 0 && framed.problems.length === 0, { violations: framedState.violations, console: framed.problems });

const plain = await openCase('Paul', { table });
const joined = await startLive(plain.view, { ask: true, answer: 'Rejoindre' });
check('une personne d\'une page ordinaire rejoint le groupe de celle du cadre isolé', joined.started === true && (await stateOf(plain.view)).live === 'live', joined);
await typeAt(framed.page, 'end', ' Frida-1', framed.view);
const fromFrame = await converge([framed.view, plain.view]);
check('ce que la personne du cadre isolé tape arrive dans la page ordinaire', fromFrame !== null && (await editorText(plain.view)).includes('Frida-1'));
await typeAt(plain.page, 'start', 'Paul-1 ', plain.view);
const fromPlain = await converge([framed.view, plain.view]);
check('ce que la personne de la page ordinaire tape arrive dans le cadre isolé, avec son curseur', fromPlain !== null && (await editorText(framed.view)).startsWith('Paul-1 ') && await framed.view.evaluate(() => !!document.querySelector('.ProseMirror .pp-live-caret')), await editorText(framed.view));
check('aucun refus de la politique dans le cadre pendant l\'écriture à deux', (await stateOf(framed.view)).violations.length === 0 && framed.problems.length === 0, framed.problems);

// ---- 4) Le fichier de GFS qui ne charge pas -----------------------------------------------------------------------------------------------------

console.log('\n== 4) Le fichier de GFS refusé : la ligne reste grisée avec la raison ==');
const bad = await openCase('Bea', { table: kit.newTable(), framed: true, editionLive: 'badIntegrity' });
const badFirst = await clickExpectingNotice(bad.view);
check('avec une fausse empreinte, le clic dit pourquoi dans une fenêtre simple et rien ne démarre', badFirst.result === false && /Écriture en direct impossible/.test(badFirst.info.title) && /Édition collaborative/.test(badFirst.info.text) && /edition-live/.test(badFirst.info.text) && /empreinte/.test(badFirst.info.text), badFirst);
const badRow = await rowOf(bad.view);
const badState = await stateOf(bad.view);
check('la ligne est grisée, avec la raison et « Cliquer pour réessayer », sans être retirée', badRow.aria === 'true' && badRow.explains && badRow.grey && REASON_ROW.test(badRow.title) && /empreinte/.test(badRow.title) && badRow.label === 'Écriture en direct', badRow);
check('le navigateur a bien refusé le fichier (message d\'empreinte) : l\'extension n\'est pas chargée, le direct est éteint, rien dans GfsPaquets', !badState.loaded && badState.live === 'off' && badState.packages === null && bad.problems.some(text => /integrity|digest|empreinte/i.test(text)), { badState, problems: bad.problems });
const badSecond = await clickExpectingNotice(bad.view);
check('le clic suivant retente (l\'adresse porte alors ?r=1) et échoue de la même façon, sans bloquer', badSecond.result === false && bad.library.length === 2 && /[?&]r=1\b/.test(bad.library[1].url), bad.library.map(entry => entry.url));
await bad.page.evaluate((good) => { window.__gfsStub.editionLive = good; window.__gfsStub.send(); }, GOOD);
await bad.page.waitForTimeout(300);
const badFixed = await startLive(bad.view);
check('GFS donne la bonne empreinte (événement `extensions`) : le clic suivant charge le fichier (à une adresse neuve : le navigateur garde l\'échec de l\'ancienne) et allume le direct', badFixed.started === true && (await stateOf(bad.view)).live === 'live' && (await rowOf(bad.view)).aria === 'false', await stateOf(bad.view));

const odd = await openCase('Odile', { table: kit.newTable(), editionLive: null });
const oddNone = await clickExpectingNotice(odd.page);
check('GFS ne donne pas la bibliothèque : le clic le dit (« GFS ne donne pas edition-live ») et la ligne reste grisée avec la raison', oddNone.result === false && /GFS ne donne pas/.test(oddNone.info.text) && REASON_ROW.test((await rowOf(odd.page)).title), oddNone);
for (const [label, library, wanted, needsRequest] of [
  ['introuvable (404)', { src: LIVE_PATH.replace('1.0.0', '9.9.9'), integrite: liveIntegrity, forme: 'module' }, /n'a pas pu être chargé/, true],
  ['donnée sans sa forme « module » (un GFS d\'avant le 16/10)', { src: LIVE_PATH, integrite: liveIntegrity }, /forme « script », pas en forme « module »/, false],
  ['d\'une autre origine', { src: 'https://autre.example/edition-live.js', integrite: liveIntegrity, forme: 'module' }, /origine non permise/, false],
  ['sans empreinte', { src: LIVE_PATH, integrite: '', forme: 'module' }, /empreinte absente ou illisible/, false],
]) {
  await odd.page.evaluate((given) => { window.__gfsStub.editionLive = given; window.__gfsStub.send(); }, library);
  await odd.page.waitForTimeout(150);
  const before = odd.library.length;
  const result = await clickExpectingNotice(odd.page);
  const row = await rowOf(odd.page);
  const asked = odd.library.slice(before);
  check(`bibliothèque ${label} : la fenêtre dit la raison, la ligne reste grisée avec elle, le direct reste éteint`, result.result === false && wanted.test(result.info.text) && row.aria === 'true' && REASON_ROW.test(row.title) && (await stateOf(odd.page)).live === 'off', { result, row });
  if (label === 'd\'une autre origine') check('rien n\'est demandé à l\'autre origine (le refus précède la balise)', asked.length === 0 && !odd.library.some(entry => /autre\.example/.test(entry.url)), odd.library.map(entry => entry.url));
  if (needsRequest) check('un fichier introuvable est bien demandé (puis refusé), la page ne plante pas', asked.length === 1, asked.map(entry => entry.url));
}
await odd.page.evaluate((good) => { window.__gfsStub.editionLive = good; window.__gfsStub.send(); }, GOOD);
const oddFixed = await startLive(odd.page);
check('GFS donne enfin le bon fichier : le clic suivant allume le direct (après tous ces échecs)', oddFixed.started === true && (await stateOf(odd.page)).live === 'live', await stateOf(odd.page));
check('aucun de ces fichiers refusés n\'est un refus de la politique de sécurité du contenu (le widget refuse avant la balise, ou le navigateur par l\'empreinte)', (await stateOf(odd.page)).violations.length === 0, (await stateOf(odd.page)).violations);

// ---- 5) Une extension que la personne n'a pas activée dans GFS ----------------------------------------------------------------------------------

console.log('\n== 5) L\'extension n\'est pas activée dans GFS ==');
const off = await openCase('Ines', { extensions: [] });
const offRow = await rowOf(off.page);
check('la ligne est grisée avec la raison « Demande l\'extension Édition collaborative (Grist Factory Suite) »', offRow.aria === 'true' && offRow.explains && offRow.title === 'Demande l’extension Édition collaborative (Grist Factory Suite)', offRow);
await off.page.evaluate(() => { document.getElementById('v2-btn-live').click(); });
await until(off.page, () => window.__gfsStub.calls.some(call => call.nom === 'installer'), null, 10000);
const offState = await off.page.evaluate(() => ({ install: window.__gfsStub.calls.filter(call => call.nom === 'installer'), live: LiveEntry.state() }));
check('le clic demande à GFS d\'ouvrir sa fenêtre d\'installation (appel `installer`), sans fenêtre du widget, sans rien charger', offState.install.length === 1 && offState.live === 'off' && off.library.length === 0 && await off.page.evaluate(dialogGone), offState);

// ---- 6) Le widget seul ----------------------------------------------------------------------------------------------------------------------

console.log('\n== 6) Le widget seul (adresse sans gfs=) ==');
const alone = await openCase('Seule', { hosted: false });
const aloneRow = await rowOf(alone.page);
check('la ligne « Écriture en direct » est là, grisée, avec sa raison, jamais retirée', aloneRow.aria === 'true' && aloneRow.explains && aloneRow.grey && aloneRow.title === 'Demande l’extension Édition collaborative (Grist Factory Suite)' && aloneRow.label === 'Écriture en direct', aloneRow);
const aloneClick = await clickExpectingNotice(alone.page);
check('son clic ouvre la fenêtre « Cette fonction demande Grist Factory Suite » (Fermer la referme), le direct ne démarre pas', aloneClick.result === false && aloneClick.info.title === 'Cette fonction demande Grist Factory Suite' && /Écriture en direct/.test(aloneClick.info.text) && /Édition collaborative/.test(aloneClick.info.text) && aloneClick.info.buttons.includes('Fermer'), aloneClick);
const untouched = await alone.page.evaluate(() => {
  const editor = EditorCore.getEditor();
  const keys = editor.state.plugins.map(plugin => String(plugin.key));
  const zone = document.querySelector('.v2-hf-zone');
  return {
    live: LiveEntry.state(), bar: !!document.getElementById('live-bar'), bodyOn: document.body.classList.contains('pp-live-on'), packages: typeof GfsPaquets, loaded: Extensions.isLoaded('edition'),
    tables: Object.keys(window.__gristStub.state.rows).filter(name => /Direct/.test(name)), history: keys.some(key => /^history\$/.test(key)), sync: keys.some(key => /y-(sync|undo|cursor)/.test(key)),
    zoneOpacity: zone ? getComputedStyle(zone).opacity : null, place: LinkedTable.placeBlock(editor), lock: LinkedTable.lockReason(), undo: LiveEntry.undo(), blocks: LiveEntry.blocksAutosave(false),
    trackRows: ['v2-btn-track-changes', 'v2-btn-accept-all', 'v2-btn-reject-all'].map(id => document.getElementById(id).title),
  };
});
check('rien d\'autre ne change : pas de barre, pas de classe sur la page, rien chargé, aucune table du direct, l\'historique de l\'éditeur en place et aucune synchronisation',
  untouched.live === 'off' && !untouched.bar && !untouched.bodyOn && untouched.packages === 'undefined' && !untouched.loaded && untouched.tables.length === 0 && untouched.history && !untouched.sync && untouched.undo === false && untouched.blocks === false, untouched);
check('le suivi des modifications, l\'en-tête et le pied, les tableaux liés ne sont pas touchés : aucune raison, aucun estompage', untouched.trackRows.every(title => title === '') && untouched.zoneOpacity === '1' && untouched.place === null && untouched.lock === null, untouched);
const trackWorks = await alone.page.evaluate(async () => {
  const pause = () => new Promise(done => setTimeout(done, 250));
  document.getElementById('v2-btn-track-changes').click();
  await pause();
  const on = Editor.isTrackChangesOn();
  document.getElementById('v2-btn-track-changes').click();
  await pause();
  return { on, off: !Editor.isTrackChangesOn() };
});
const zoneOpens = await alone.page.evaluate(() => { document.querySelector('.v2-hf-zone').click(); const opened = !!HeaderFooterPreview.getHfMode(); Editor.exitHeaderFooterModeIfActive(); return opened; });
check('le suivi des modifications s\'allume et s\'éteint, un clic sur l\'en-tête l\'ouvre, comme avant', trackWorks.on && trackWorks.off && zoneOpens, { trackWorks, zoneOpens });
check('rien n\'est demandé au réseau pour l\'écriture en direct : ni fichier de l\'extension, ni bibliothèque de GFS', alone.library.length === 0 && !alone.requests.some(url => /\/extensions\/edition\/|edition-live/.test(url)), alone.requests.filter(url => /extensions|edition/.test(url)));
check('aucun refus de la politique de sécurité du contenu', (await stateOf(alone.page)).violations.length === 0, (await stateOf(alone.page)).violations);

// ---- Fin -----------------------------------------------------------------------------------------------------------------------------------

check('aucune erreur de page pendant tout le parcours', kit.pageErrors.length === 0, kit.pageErrors);
const unexpected = consoleProblems.filter(text => !/integrity|digest|autre\.example|404|ERR_|Failed to load resource|CORS|net::|\[LiveEntry\] extension indisponible/i.test(text));
check('la console ne dit rien d\'autre que les refus provoqués exprès (empreinte, adresse inconnue) et l\'avertissement du widget qui les accompagne', unexpected.length === 0, unexpected.slice(0, 6));
check('aucune boîte native (alert, confirm, prompt) n\'a été ouverte', [top, framed, plain, bad, odd, off, alone].every(opened => opened.natives.length === 0), [top, framed, plain, bad, odd, off, alone].map(opened => opened.natives));

await kit.close();
finish();
