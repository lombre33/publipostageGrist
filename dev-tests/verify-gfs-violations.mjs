#!/usr/bin/env node
// Le relais des appels bloqués vers GFS (consigne GFS 084, contrats de GFS 5.4 point 14, guide des apps règle S8, kit 0.25.0) : quand la politique de contenu de la page bloque un appel, l'app le dit à GFS (`securite
// { quoi: 'bloque', directive, cible, source, disposition, fois }`, sans `id`, le nom d'hôte seul) après avoir dit `securite { quoi: 'relais', kit }` au démarrage. 700x400, le vrai widget (index.html servi tel quel,
// politique de contenu RESPECTÉE : `bypassCSP: false`) dans le GFS simulé (dev-tests/gfs-stub.js : l'appel `securite` est noté dans `calls`, sans réponse, comme GFS) avec le vrai module de pose du kit
// (kit/js/violations-pose.js, par la carte d'importation de index.html). La vérité de chaque comparaison est un JUGE INDÉPENDANT du kit, écrit ici d'après le contrat (la forme fermée que GFS garde, celle de
// `readViolation` dans prototype/js/broker/security-relay.js de GFS, et ce qui ne doit jamais partir : le chemin, les paramètres, le fragment) : la page n'est jugée ni par le kit ni par l'app, mais contre ce que GFS lit.
//  1) SEULE (adresse sans `gfs=`) : rien n'est demandé au kit, rien n'est dit à personne, rien dans la console, `GfsLink.tell` rend faux, alors qu'une violation est bien levée dans la page.
//  2) HÉBERGÉE, AU DÉPART : un seul `relais` à la version du kit épinglé, sans `id`, avant tout le reste ; aucun appel bloqué (l'app ne viole pas sa propre politique en démarrant) ; un seul lien avec GFS (un seul
//     `contexte`) ; le module de pose du kit, jamais `violations.js` ni `violations-start.js` (ils démarreraient un second lien) ; js/gfs-violations.js juste après js/gfs-link.js ; rien dans la console ; le modèle s'ouvre.
//  3) UN APPEL BLOQUÉ PAR LA POLITIQUE ACTUELLE : un script d'un autre site, un cadre d'un autre site, un formulaire qui part vers un autre site, du code en ligne, un script de l'app qui en appelle un autre : chacun
//     arrive à GFS, dans la forme fermée du contrat, le nom d'hôte seul (jamais le chemin, `secret`, le jeton ni le fragment), et le code bloqué ne s'exécute pas ; `GfsLink.tell` n'envoie que `securite`.
//  4) UN `fetch` ET UNE IMAGE sous une politique plus stricte (en-tête ajouté par l'essai : la politique de la page n'a ni `connect-src` ni `img-src`) : `connect-src` et `img-src` arrivent à GFS avec `exemple.test`
//     seul, sans `secret` ; la même violation ne repart qu'à la 10e fois ; jamais plus de 50 violations différentes ni de 200 messages.
//  5) CE QUE LA POLITIQUE PERMET NE LÈVE RIEN (la limite dite à GFS) : un `fetch` vers un autre site que la politique de la page ne ferme pas n'est pas bloqué, donc pas relayé.
//  6) UN KIT QUI MANQUE OU QUI ARRIVE EN RETARD : le module de pose (ou son lecteur de message) absent, l'app démarre, GFS n'est pas averti et la console le dit une fois ; un kit lent relaie quand même.
//  7) DANS LE CADRE ISOLÉ de GFS (sans `allow-same-origin`, politique de la page respectée) : `relais` et un appel bloqué traversent le vrai `postMessage`, aucune violation causée par le relais lui-même, cadre jamais rechargé.
// Lancé par run-headless.mjs (groupe Node « gfsViolations », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-gfs-violations.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels, ROOT } from './gfs-page.mjs';

const t = await start({ name: 'verify-gfs-violations', port: Number(process.env.GFS_VIOLATIONS_PORT || 9004) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MODEL_HTML = '<p>Contenu A</p>';
const SEED = seedModels({});
const KIT_VERSION = JSON.parse(readFileSync(join(ROOT, 'kit', 'package.json'), 'utf8')).version;
// Ce que la console dit du relais ou du lien (tout le reste du bruit d'une page, les erreurs de chargement d'un fichier absent comprises, n'est pas l'affaire de cet essai) ; « Kit : … est chargé deux fois » en fait partie.
const OURS = /GfsViolations|GfsLink|violations|securite|Kit :/i;

// ---- Le contrat : ce que GFS garde d'un `securite { quoi: 'bloque' }` (5.4 point 14), écrit sans le kit. L'app est tenue pour non fiable : GFS réduit tout à cette forme fermée, donc l'app doit déjà la dire ainsi.
const DIRECTIVES = new Set(['default-src', 'script-src', 'script-src-elem', 'script-src-attr', 'style-src', 'style-src-elem', 'style-src-attr', 'img-src', 'font-src', 'connect-src', 'media-src', 'object-src', 'frame-src',
  'child-src', 'worker-src', 'manifest-src', 'base-uri', 'form-action', 'frame-ancestors', 'navigate-to']);
const WORDS = new Set(['inline', 'eval', 'data', 'blob', 'self', 'wasm-eval', 'mediastream', 'filesystem']);
const HOST = /^[a-z0-9](?:[a-z0-9.-]{0,98}[a-z0-9])?$/;
const hostOr = (value, fallback) => (typeof value === 'string' && HOST.test(value) ? value : fallback);
const gfsReads = args => ({
  directive: DIRECTIVES.has(args.directive) ? args.directive : 'autre',
  cible: WORDS.has(args.cible) ? args.cible : hostOr(args.cible, 'autre'),
  source: ['app', 'inconnue', 'autre'].includes(args.source) ? args.source : hostOr(args.source, 'autre'),
  disposition: args.disposition === 'report' ? 'report' : 'enforce',
  fois: Number.isInteger(args.fois) ? Math.min(Math.max(args.fois, 1), 99999) : 1,
});
const FIELDS = ['cible', 'directive', 'disposition', 'fois', 'quoi', 'source'];
// Vrai quand l'app a dit EXACTEMENT ce que GFS garde : les six champs, rien de plus, et la lecture de GFS ne change rien à ce qui est dit.
const isClosed = (args) => {
  if (!args || typeof args !== 'object' || Array.isArray(args) || args.quoi !== 'bloque') return false;
  if (JSON.stringify(Object.keys(args).sort()) !== JSON.stringify(FIELDS)) return false;
  const read = gfsReads(args);
  return ['directive', 'cible', 'source', 'disposition', 'fois'].every(key => read[key] === args[key]);
};
// Ce qui ne part jamais : une adresse entière (schéma, chemin, paramètres, fragment, identifiant) ou ce que les sondes y ont mis.
const LEAK = /secret|jeton|frag|biblio|cadre\.html|envoi|https?:|[/?#=@:\s]/i;
const leaks = args => Object.values(args || {}).some(value => typeof value === 'string' && LEAK.test(value));

// ---- Ce que GFS (le stub) a reçu.
const told = page => page.evaluate(() => window.__gfsStub.calls.filter(call => call.nom === 'securite').map(call => ({ args: call.args, id: call.id })));
const blockedOf = async page => (await told(page)).map(call => call.args).filter(args => args && args.quoi === 'bloque');
const callsOf = (page, nom) => page.evaluate(name => window.__gfsStub.calls.filter(call => call.nom === name).length, nom);
async function waitFor(read, ok, timeout = 5000) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await read();
    if (ok(value) || Date.now() > end) return value;
    await sleep(60);
  }
}
// Attend `count` messages `bloque` (au moins), puis laisse un instant pour que ceux qui seraient en trop arrivent ; rend tous les `bloque` reçus.
async function blockedAfter(page, count) {
  await waitFor(() => blockedOf(page), list => list.length >= count);
  await sleep(250);
  return blockedOf(page);
}
const forHost = (list, host) => list.filter(args => args.cible === host);
const until = (app, fn, arg, timeout = 4000) => app.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const htmlOf = app => app.evaluate(() => EditorCore.getEditor().getHTML());
const requestsOf = (opened, pattern) => opened.requests.filter(url => pattern.test(url));
const settle = app => app.evaluate(() => (typeof GfsViolations === 'undefined' ? null : GfsViolations.ready)).catch(() => null);
const activeOf = app => app.evaluate(() => (typeof GfsViolations === 'undefined' ? 'absent' : GfsViolations.active())).catch(() => 'absent');

// ---- Les sondes : ce qu'une bibliothèque piratée tenterait, posé dans la page ; les adresses portent un chemin, des paramètres et un fragment que rien ne doit laisser partir.
const HOSTS = { script: 'sonde-script.exemple.test', frame: 'sonde-cadre.exemple.test', form: 'sonde-formulaire.exemple.test', app: 'sonde-app.exemple.test', fetch: 'sonde-fetch.exemple.test', image: 'sonde-image.exemple.test',
  permitted: 'sonde-permis.exemple.test' };
const probe = {
  script: (app, host) => app.evaluate((h) => { const el = document.createElement('script'); el.src = `https://${h}/p/biblio.js?secret=1&jeton=abc#frag`; document.head.appendChild(el); }, host),
  frame: (app, host) => app.evaluate((h) => { const el = document.createElement('iframe'); el.style.display = 'none'; el.src = `https://${h}/p/cadre.html?secret=1#frag`; document.body.appendChild(el); }, host),
  form: (app, host) => app.evaluate((h) => {
    const target = document.createElement('iframe'); target.name = 'sonde-cible'; target.style.display = 'none'; document.body.appendChild(target);   // la page ne part nulle part si le formulaire n'était pas bloqué
    const form = document.createElement('form'); form.method = 'post'; form.target = 'sonde-cible'; form.action = `https://${h}/p/envoi?secret=1`; form.style.display = 'none';
    document.body.appendChild(form); form.submit();
  }, host),
  inline: app => app.evaluate(() => { const el = document.createElement('script'); el.textContent = 'window.__sondeEnLigne = true;'; document.head.appendChild(el); return window.__sondeEnLigne === true; }),
  // Un script de l'app (même origine) qui en appelle un autre : la violation vient de « app ».
  fromApp: app => app.evaluate(() => { const el = document.createElement('script'); el.src = '/sonde-app.js'; document.head.appendChild(el); }),
  fetch: (app, host, times = 1) => app.evaluate(async ({ h, n }) => {
    const outcomes = [];
    for (let i = 0; i < n; i++) outcomes.push(await fetch(`https://${h}/p/x?secret=1&jeton=abc#frag`).then(() => 'passe', () => 'bloque'));
    return outcomes;
  }, { h: host, n: times }),
  image: (app, host) => app.evaluate((h) => { const el = new Image(); el.src = `https://${h}/p/pixel.png?secret=1#frag`; document.body.appendChild(el); }, host),
};
const APP_PROBE = `const el = document.createElement('script'); el.src = 'https://${HOSTS.app}/p/biblio.js?secret=1'; document.head.appendChild(el);`;
// Une politique plus stricte que celle de la page, posée par l'essai en en-tête de la page de test (la page n'a ni `connect-src` ni `img-src` : un appel vers un autre site y passe) : de quoi voir le relais d'un `fetch` et d'une image.
const STRICT = "connect-src 'self'; img-src 'self' data: blob:";
const withHeader = csp => page => page.route(/\/_test-harness\.html(\?|$)/, async (route) => {
  const response = await route.fetch();
  await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
});

// Ouvre le widget (politique de la page respectée) et garde ce que la console dit d'inquiétant (avertissements et erreurs) : `logs`.
async function open(options = {}) {
  const logs = [];
  const opened = await t.openPage({
    seed: SEED, bypassCSP: false, ...options,
    before: async (page, context) => {
      page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') logs.push(m.text()); });
      await page.route(/\.exemple\.test\//, route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'ok' }));
      await page.route(`${t.base}/sonde-app.js`, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: APP_PROBE }));
      if (options.before) await options.before(page, context);
    },
  });
  return { ...opened, logs };
}
const closeOf = opened => opened.context.close().catch(() => {});

console.log('— 1) seule : rien ne part');
const solo = await open({ hosted: false, init: "window.__violations = []; window.__told = []; document.addEventListener('securitypolicyviolation', e => window.__violations.push(e.effectiveDirective)); window.addEventListener('message', e => { if (e.data && e.data.nom === 'securite') window.__told.push(e.data); });" });
await settle(solo.app);
await probe.script(solo.app, HOSTS.script);
await sleep(400);
const soloSeen = await solo.app.evaluate(() => ({ violations: window.__violations.length, told: window.__told.length, active: GfsViolations.active(), tell: GfsLink.tell('securite', { quoi: 'relais', kit: '0.0.0' }) }));
check('l\'app seule : la page lève bien une violation (script d\'un autre site bloqué), mais le relais est inactif, rien n\'est dit à personne et `GfsLink.tell` rend faux', soloSeen.violations >= 1 && soloSeen.active === false && soloSeen.told === 0 && soloSeen.tell === false, soloSeen);
check('l\'app seule ne demande jamais le kit (ni le module de pose, ni son lecteur de message)', requestsOf(solo, /\/kit\//).length === 0, requestsOf(solo, /\/kit\//));
check('l\'app seule : rien dans la console sur le relais', solo.logs.filter(text => OURS.test(text) && !/exemple\.test|Content Security Policy|Refused/i.test(text)).length === 0, solo.logs);
await closeOf(solo);

console.log('— 2) hébergée, au départ');
const on = await open({ stub: {} });
await settle(on.app);
await sleep(300);
const first = await told(on.page);
check('au départ GFS a reçu UN seul `securite`, un `relais` à la version du kit épinglé, sans `id`', first.length === 1 && first[0].id === undefined && JSON.stringify(first[0].args) === JSON.stringify({ quoi: 'relais', kit: KIT_VERSION }), first);
check('l\'app ne viole pas sa propre politique en démarrant : aucun appel bloqué n\'est parti', (await blockedOf(on.page)).length === 0, await blockedOf(on.page));
check('le relais écoute (hébergée) et le modèle s\'est ouvert comme avant', (await activeOf(on.app)) === true && (await htmlOf(on.app)) === MODEL_HTML, [await activeOf(on.app), await htmlOf(on.app)]);
check('un seul lien avec GFS dans le cadre : un seul `contexte` (un second lien, celui du kit, en demanderait un autre)', (await callsOf(on.page, 'contexte')) === 1, await callsOf(on.page, 'contexte'));
check('le kit n\'a demandé que sa pose et son lecteur de message, jamais `violations.js` ni `violations-start.js` (ils démarreraient un second lien)',
  requestsOf(on, /\/kit\/js\/violations-pose\.js/).length >= 1 && requestsOf(on, /\/kit\/js\/violations-message\.js/).length >= 1 && requestsOf(on, /\/kit\/js\/violations(?:-start)?\.js/).length === 0,
  requestsOf(on, /\/kit\/js\/violations/));
const order = await on.app.evaluate(() => [...document.querySelectorAll('script[src]')].map(el => el.getAttribute('src')).filter(src => /^js\//.test(src)).map(src => src.replace(/\?.*$/, '')));
check('js/gfs-violations.js est le deuxième script de la page, juste après js/gfs-link.js (une violation d\'avant n\'est pas vue)', order[0] === 'js/gfs-link.js' && order[1] === 'js/gfs-violations.js', order.slice(0, 4));
check('rien dans la console (ni avertissement du lien, ni « Kit : … est chargé deux fois »)', on.logs.filter(text => OURS.test(text)).length === 0, on.logs);

console.log('— 3) un appel bloqué par la politique actuelle');
const callsBefore = (await told(on.page)).length;
await probe.script(on.app, HOSTS.script);
await probe.frame(on.app, HOSTS.frame);
await probe.form(on.app, HOSTS.form);
const inlineRan = await probe.inline(on.app);
await probe.fromApp(on.app);
const blocked = await blockedAfter(on.page, 5);
const byHost = host => forHost(blocked, host);
check('un script d\'un autre site arrive à GFS : `script-src-elem` (ou `script-src`), `sonde-script.exemple.test`, la première fois', byHost(HOSTS.script).length === 1 && /^script-src(-elem)?$/.test(byHost(HOSTS.script)[0].directive) && byHost(HOSTS.script)[0].fois === 1 && byHost(HOSTS.script)[0].disposition === 'enforce', byHost(HOSTS.script));
check('un cadre d\'un autre site arrive à GFS : `frame-src` (ou `child-src`), `sonde-cadre.exemple.test`', byHost(HOSTS.frame).length === 1 && /^(frame|child)-src$/.test(byHost(HOSTS.frame)[0].directive), byHost(HOSTS.frame));
// La sonde vise un cadre caché (la page ne part nulle part si le formulaire n'était pas bloqué) : le navigateur lève aussi `frame-src` pour ce cadre ; les deux disent le même hôte.
check('un formulaire qui part vers un autre site arrive à GFS : `form-action`, `sonde-formulaire.exemple.test` (et, pour le cadre caché que la sonde vise, `frame-src`, le même hôte)', byHost(HOSTS.form).filter(args => args.directive === 'form-action').length === 1 && byHost(HOSTS.form).every(args => /^(form-action|frame-src|child-src)$/.test(args.directive) && args.fois === 1), byHost(HOSTS.form));
check('du code en ligne arrive à GFS : le mot « inline » (jamais le code), et il ne s\'est pas exécuté', blocked.filter(args => args.cible === 'inline').length >= 1 && /^script-src(-elem)?$/.test(blocked.find(args => args.cible === 'inline').directive) && inlineRan === false, [inlineRan, blocked.filter(args => args.cible === 'inline')]);
check('un script de l\'app (même origine) qui en appelle un autre : arrive à GFS avec la source « app »', byHost(HOSTS.app).length === 1 && byHost(HOSTS.app)[0].source === 'app', byHost(HOSTS.app));
check('chaque message est dans la forme fermée du contrat (les six champs, rien de plus, et GFS en garde exactement ce que l\'app dit)', blocked.length >= 5 && blocked.every(isClosed), blocked.filter(args => !isClosed(args)));
check('aucun ne laisse partir une adresse entière : ni schéma, ni chemin, ni paramètre, ni fragment, ni ce que les sondes y avaient mis (`secret`, `jeton`)', blocked.length >= 5 && !blocked.some(leaks), blocked.filter(leaks));
check('chaque appel bloqué part une fois, sans `id` (GFS ne répond rien), après le `relais`', (await told(on.page)).length === callsBefore + blocked.length && (await told(on.page)).every(call => call.id === undefined) && (await told(on.page))[0].args.quoi === 'relais', await told(on.page));
const toldBefore = (await told(on.page)).length;
const tells = await on.app.evaluate(() => ({ other: GfsLink.tell('contexte'), unknown: GfsLink.tell('autre.chose', { a: 1 }) }));
check('`GfsLink.tell` n\'envoie que `securite` : tout autre nom rend faux et ne part pas', tells.other === false && tells.unknown === false && (await told(on.page)).length === toldBefore && (await callsOf(on.page, 'autre.chose')) === 0, tells);
check('la page continue : l\'éditeur est là, le relais écoute encore, rien dans la console sur le relais', (await htmlOf(on.app)) === MODEL_HTML && (await activeOf(on.app)) === true && on.logs.filter(text => OURS.test(text) && !/exemple\.test|Content Security Policy|Refused|Failed to load/i.test(text)).length === 0, on.logs);

console.log('— 5) ce que la politique permet ne lève rien');
const policy = await on.app.evaluate(() => (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '');
const closesConnect = policy.split(';').map(part => part.trim().split(/\s+/)[0]).some(name => name === 'connect-src' || name === 'default-src');
const blockedBeforePermitted = (await blockedOf(on.page)).length;
const permitted = await probe.fetch(on.app, HOSTS.permitted, 3);
await sleep(400);
const permittedSeen = forHost(await blockedOf(on.page), HOSTS.permitted);
check(closesConnect
  ? 'la politique de la page ferme `connect-src` : un `fetch` vers un autre site est bloqué et relayé (nom d\'hôte seul)'
  : 'la politique de la page n\'a ni `connect-src` ni `default-src` : un `fetch` vers un autre site PASSE, n\'est pas bloqué, donc n\'est pas relayé (le relais informe, il ne protège pas)',
closesConnect ? permitted.every(o => o === 'bloque') && permittedSeen.length >= 1 : permitted.every(o => o === 'passe') && permittedSeen.length === 0 && (await blockedOf(on.page)).length === blockedBeforePermitted, [permitted, permittedSeen, closesConnect]);
await closeOf(on);

console.log('— 4) un `fetch` et une image sous une politique plus stricte');
const strict = await open({ stub: {}, before: withHeader(STRICT) });
await settle(strict.app);
await sleep(300);
const strictStart = await blockedOf(strict.page);
check('sous la politique plus stricte l\'app démarre quand même, le relais écoute, et rien n\'est bloqué au départ', (await htmlOf(strict.app)) === MODEL_HTML && (await activeOf(strict.app)) === true && strictStart.length === 0, strictStart);
const one = await probe.fetch(strict.app, HOSTS.fetch);
await probe.image(strict.app, HOSTS.image);
const strictBlocked = await blockedAfter(strict.page, 2);
check('`fetch(\'https://sonde-fetch.exemple.test/p/x?secret=1…\')` est bloqué et GFS reçoit `connect-src` avec `sonde-fetch.exemple.test` seul (la mesure demandée par la consigne 084)', one[0] === 'bloque' && forHost(strictBlocked, HOSTS.fetch).length === 1 && forHost(strictBlocked, HOSTS.fetch)[0].directive === 'connect-src' && forHost(strictBlocked, HOSTS.fetch)[0].fois === 1, [one, forHost(strictBlocked, HOSTS.fetch)]);
check('une image d\'un autre site arrive à GFS : `img-src`, `sonde-image.exemple.test`', forHost(strictBlocked, HOSTS.image).length === 1 && forHost(strictBlocked, HOSTS.image)[0].directive === 'img-src', forHost(strictBlocked, HOSTS.image));
check('ces messages sont dans la forme fermée et ne laissent rien partir (ni `secret`, ni chemin, ni fragment)', strictBlocked.length >= 2 && strictBlocked.every(isClosed) && !strictBlocked.some(leaks), strictBlocked);
const twelve = await probe.fetch(strict.app, HOSTS.fetch, 11);   // avec le premier : douze appels bloqués de la même violation
const repeated = await blockedAfter(strict.page, 3);
check('la même violation douze fois : GFS en reçoit deux messages seulement, à la 1re et à la 10e fois (`fois` : 1, 10)', twelve.every(o => o === 'bloque') && JSON.stringify(forHost(repeated, HOSTS.fetch).map(args => args.fois)) === JSON.stringify([1, 10]), forHost(repeated, HOSTS.fetch).map(args => args.fois));
await closeOf(strict);

const flood = await open({ stub: {}, before: withHeader(STRICT) });
await settle(flood.app);
await flood.app.evaluate(async () => {
  for (let i = 0; i < 60; i++) await fetch(`https://flood-${i}.exemple.test/p?secret=1`).then(() => 0, () => 0);
  for (let i = 0; i < 60; i++) { for (let k = 0; k < 10; k++) await fetch(`https://flood-${i}.exemple.test/p?secret=${k}`).then(() => 0, () => 0); }
});
const flooded = await blockedAfter(flood.page, 1);
await sleep(500);
const floodedAll = (await blockedOf(flood.page)).filter(args => /^flood-\d+\.exemple\.test$/.test(args.cible));
const floodHosts = new Set(floodedAll.map(args => args.cible));
check('soixante hôtes différents, chacun appelé onze fois : GFS reçoit au plus 50 violations différentes et jamais plus de 200 messages (un code piraté ne noie pas GFS)', floodHosts.size === 50 && floodedAll.length <= 200 && flooded.length >= 1, [floodHosts.size, floodedAll.length]);
await closeOf(flood);

console.log('— 6) un kit qui manque ou qui arrive en retard');
const noPose = await open({ stub: {}, before: page => page.route(/\/kit\/js\/violations-pose\.js/, route => route.fulfill({ status: 404, body: 'absent' })) });
const noPoseReady = await settle(noPose.app);
check('le module de pose ne se charge pas : l\'app démarre (le modèle est ouvert), le relais se dit inactif, `ready` est résolue, et GFS n\'a reçu aucun `securite`', noPoseReady === undefined && (await htmlOf(noPose.app)) === MODEL_HTML && (await activeOf(noPose.app)) === false && (await told(noPose.page)).length === 0, [await activeOf(noPose.app), await told(noPose.page)]);
check('le module de pose ne se charge pas : la console le dit une fois (`[GfsViolations]`)', noPose.logs.filter(text => /\[GfsViolations\]/.test(text)).length === 1, noPose.logs);
await closeOf(noPose);

const noMessage = await open({ stub: {}, before: page => page.route(/\/kit\/js\/violations-message\.js/, route => route.fulfill({ status: 404, body: 'absent' })) });
await settle(noMessage.app);
check('le lecteur du message de la pose ne se charge pas : même issue, l\'app démarre, le relais est inactif, GFS n\'a rien reçu, la console le dit une fois', (await htmlOf(noMessage.app)) === MODEL_HTML && (await activeOf(noMessage.app)) === false && (await told(noMessage.page)).length === 0 && noMessage.logs.filter(text => /\[GfsViolations\]/.test(text)).length === 1, [await activeOf(noMessage.app), noMessage.logs]);
await closeOf(noMessage);

const slow = await open({ stub: {}, before: page => page.route(/\/kit\/js\/violations-pose\.js/, async (route) => { await sleep(900); await route.continue(); }) });
await settle(slow.app);
await sleep(300);
const slowTold = await told(slow.page);
await probe.script(slow.app, HOSTS.script);
const slowBlocked = await blockedAfter(slow.page, 1);
check('la pose arrive en retard (900 ms) : le relais démarre quand même, dit `relais` une fois, relaie ensuite un appel bloqué, et la console ne dit rien', (await activeOf(slow.app)) === true && slowTold.length === 1 && slowTold[0].args.quoi === 'relais' && forHost(slowBlocked, HOSTS.script).length === 1 && slow.logs.filter(text => OURS.test(text) && !/exemple\.test|Content Security Policy|Refused/i.test(text)).length === 0, [slowTold, slowBlocked, slow.logs]);
await closeOf(slow);

console.log('— 7) dans le cadre isolé de GFS');
const CSP_WATCH = "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));";
const framed = await open({ framed: { csp: "frame-src 'self'" }, stub: {}, init: CSP_WATCH });
await settle(framed.app);
await framed.app.evaluate(() => { window.__token = Math.random(); });
const framedToken = await framed.app.evaluate(() => window.__token);
await sleep(400);
const framedStart = await told(framed.page);
const framedViolationsBefore = await framed.app.evaluate(() => window.__csp.length);
check('cadre isolé (origine « nulle », politique respectée) : au départ le parent a reçu UN `relais` à la version du kit, par le vrai `postMessage`, sans `id`, et aucune violation n\'a été levée', framedStart.length === 1 && framedStart[0].id === undefined && JSON.stringify(framedStart[0].args) === JSON.stringify({ quoi: 'relais', kit: KIT_VERSION }) && framedViolationsBefore === 0, [framedStart, framedViolationsBefore]);
await probe.script(framed.app, HOSTS.script);
const framedBlocked = await blockedAfter(framed.page, 1);
check('cadre isolé : un script d\'un autre site arrive au parent, forme fermée, `sonde-script.exemple.test` seul', framedBlocked.length === 1 && isClosed(framedBlocked[0]) && !leaks(framedBlocked[0]) && framedBlocked[0].cible === HOSTS.script && /^script-src(-elem)?$/.test(framedBlocked[0].directive), framedBlocked);
const framedViolationsAfter = await framed.app.evaluate(() => window.__csp.length);
check('cadre isolé : la seule violation levée est celle de la sonde (le relais n\'en cause aucune), l\'éditeur est là et le cadre n\'a pas été rechargé (il garde son jeton)', framedViolationsAfter === 1 && (await htmlOf(framed.app)) === MODEL_HTML && (await framed.app.evaluate(() => window.__token)) === framedToken, [framedViolationsAfter]);
check('cadre isolé : rien dans la console sur le relais', framed.logs.filter(text => OURS.test(text) && !/exemple\.test|Content Security Policy|Refused/i.test(text)).length === 0, framed.logs);
await closeOf(framed);

await t.finish();
