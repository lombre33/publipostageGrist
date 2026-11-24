// La section de GFS que le lien de l'app demande à GFS (js/gfs-link.js : `section()`) - consigne 097 de GFS (contrats 5.4 point 15, guide des apps 1.2 règle 25) : « quelle ligne de `_grist_Views_section` est la tienne ? ».
// Sous GFS toutes les sections de GFS portent l'adresse de GFS : l'app ne peut pas retrouver la sienne par son adresse dès que deux GFS partagent la table sans être liés à la même vue. GFS, lui, le sait : l'appel `section`, sans
// argument, rend `{ id }` (un entier de 1 ou plus) ou `{ id: null, raison }` ; un GFS d'avant la consigne répond `GFS_INCONNU`. L'app le demande UNE fois par vie de son cadre et garde la réponse, null comprise.
//
// Node seul, sans navigateur (dev-tests/unit-harness.mjs) : le VRAI js/gfs-link.js, lu dans un contexte `vm` dont `window` est un faux cadre (un parent qui note les messages et un écouteur qu'on joue), et des minuteries
// que l'essai déclenche lui-même (le délai de l'appel est joué sans attendre).
//  1. seule (pas de `gfs=` dans l'adresse) : `section()` rend null, rien ne part ;
//  2. hébergée : un seul appel `section`, sans argument ; la réponse `{ id }` est rendue (un entier de 1 ou plus) ; les demandes suivantes, et celles qui arrivent pendant l'attente, ne renvoient rien et rendent la même ;
//  3. tout le reste vaut null et ne dit rien : `{ id: null, raison }`, un identifiant qui n'en est pas un (zéro, négatif, à virgule, texte, vrai, NaN), une réponse d'une autre forme ou vide ; la réponse est gardée, null comprise ;
//  4. une erreur de GFS (`GFS_INCONNU` d'un GFS d'avant, un refus) vaut null, jamais un rejet ; un délai (4 secondes) vaut null et une réponse tardive n'y change rien ;
//  5. un message d'un autre cadre ou d'un autre contrat n'est pas une réponse ;
//  6. le lien d'avant la consigne (sans `section`) : la vérification de la forme échoue - ce que cet essai doit prouver (GFS_LINK_FILE=… pour l'essayer sur un autre état du lien).
//
// Lancer : node dev-tests/unit-gfs-link-section.mjs
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, check, summarizeAndExit } from './unit-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = process.env.GFS_LINK_FILE || join(ROOT, 'js', 'gfs-link.js');
const SOURCE = readFileSync(FILE, 'utf8');
const GFS = 'https://gfs.example';

function load(search = '?gfs=0') {
  const sent = [];
  const listeners = [];
  const timers = [];
  const parent = { postMessage: (message, origin) => { sent.push({ message: JSON.parse(JSON.stringify(message)), origin }); } };
  const window = { location: { search }, parent, addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); } };
  const setTimeoutFake = (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length; };
  const clearTimeoutFake = (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; };
  const context = createContext({ window, console: { ...console, warn() {} }, setTimeout: setTimeoutFake, clearTimeout: clearTimeoutFake, URLSearchParams, Blob, File });
  vm.runInContext(SOURCE, context, { filename: FILE });
  const deliver = (data, { source = parent, origin = GFS } = {}) => listeners.forEach(fn => fn({ data, source, origin }));
  // Le délai de l'appel que l'app vient d'envoyer : la minuterie de 4 secondes qui n'a pas été annulée.
  const expire = () => { const timer = timers.find(one => one.ms === 4000 && !one.cleared); if (timer) { timer.cleared = true; timer.fn(); } return !!timer; };
  return { sent, listeners, deliver, parent, expire, GfsLink: vm.runInContext('GfsLink', context) };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sectionCalls = link => link.sent.filter(entry => entry.message.nom === 'section');
const hasSection = link => typeof link.GfsLink.section === 'function';
const asked = link => (hasSection(link) ? link.GfsLink.section() : Promise.resolve('PAS DE section()'));
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

// Un lien hébergé dont le contexte est arrivé.
async function hosted() {
  const link = load();
  link.deliver({ gfs: 0, type: 'reponse', id: link.sent[0].message.id, data: { langue: 'fr', stockage: {} } });
  await link.GfsLink.ready;
  return link;
}
const idOf = call => (call ? call.message.id : -1);   // le lien d'avant ne fait aucun appel : l'essai échoue alors sur ses vérifications, sans s'arrêter
const answer = (link, data) => { link.deliver({ gfs: 0, type: 'reponse', id: idOf(sectionCalls(link).slice(-1)[0]), data }); };

// 1. Seule.
{
  const link = load('');
  const got = await asked(link);
  check('seule : section() existe et rend null', got === null, JSON.stringify(got));
  check('seule : rien ne part, rien n\'écoute', link.sent.length === 0 && link.listeners.length === 0);
}

// 2. Hébergée : un seul appel, sans argument.
{
  const link = await hosted();
  check('hébergée : section() existe, rien n\'est demandé avant qu\'on la lise', hasSection(link) && sectionCalls(link).length === 0);
  const first = asked(link);
  const second = asked(link);
  await settle();
  const calls = sectionCalls(link);
  check('un seul appel `section` part, sans argument ni délai oublié', calls.length === 1 && calls[0].message.type === 'appel' && calls[0].message.gfs === 0 && !('args' in calls[0].message) && Number.isInteger(calls[0].message.id), JSON.stringify(calls));
  check('l\'appel part à l\'origine de GFS retenue', calls.length === 1 && calls[0].origin === GFS, JSON.stringify(calls.map(c => c.origin)));
  check('deux demandes pendant l\'attente reçoivent la même promesse', first === second);
  answer(link, { id: 6 });
  check('{ id: 6 } : l\'identifiant est rendu', (await first) === 6 && (await second) === 6);
  check('une demande de plus ne renvoie rien et rend la même réponse', (await asked(link)) === 6 && sectionCalls(link).length === 1);
  link.deliver({ gfs: 0, type: 'reponse', id: idOf(calls[0]), data: { id: 9 } });
  check('une seconde réponse au même appel ne change rien', (await asked(link)) === 6);
}

// 3. Tout le reste vaut null, et la réponse est gardée.
{
  const refused = [{ id: null, raison: 'inconnue' }, { id: null, raison: 'acces' }, { id: null, raison: 'lecture-seule' }, { id: null }, { id: 0 }, { id: -3 }, { id: 1.5 }, { id: '6' }, { id: NaN }, { id: true }, { id: [6] },
    { id: { id: 6 } }, { raison: 'inconnue' }, {}, null, undefined, 'texte', 42, true, [6], [{ id: 6 }]];
  for (const data of refused) {
    const link = await hosted();
    const first = asked(link);
    await settle();
    answer(link, data);
    const got = await first;
    check('réponse ' + JSON.stringify(data) + ' : null', got === null, JSON.stringify(got));
    const again = await asked(link);
    check('   ... gardée, null comprise : aucune seconde demande', again === null && sectionCalls(link).length === 1, JSON.stringify({ again, appels: sectionCalls(link).length }));
  }
  const accepted = [[{ id: 1 }, 1], [{ id: 6 }, 6], [{ id: 123456 }, 123456], [{ id: 4, raison: 'ignoree' }, 4], [{ id: 4, autre: { x: 1 } }, 4]];
  for (const [data, expected] of accepted) {
    const link = await hosted();
    const first = asked(link);
    await settle();
    answer(link, data);
    check('réponse ' + JSON.stringify(data) + ' : ' + expected, (await first) === expected);
  }
}

// 4. Une erreur ou un délai : null, jamais un rejet.
{
  for (const [code, message] of [['GFS_INCONNU', 'appel inconnu : section'], ['GFS_REFUSE', 'refusé'], ['GFS_ECHEC', 'échec'], ['', 'sans code']]) {
    const link = await hosted();
    const first = asked(link);
    await settle();
    const call = sectionCalls(link)[0];
    link.deliver({ gfs: 0, type: 'erreur', id: idOf(call), code, message });
    let rejected = null; let got;
    try { got = await first; } catch (e) { rejected = e; }
    check('erreur ' + (code || '(sans code)') + ' : null, pas de rejet', rejected === null && got === null, JSON.stringify({ got, rejected: rejected && rejected.message }));
    check('   ... gardée : aucune seconde demande', (await asked(link)) === null && sectionCalls(link).length === 1);
  }
  const link = await hosted();
  const first = asked(link);
  await settle();
  const call = sectionCalls(link)[0];
  const expired = link.expire();
  let rejected = null; let got;
  try { got = await first; } catch (e) { rejected = e; }
  check('le délai de 4 secondes passe : null, pas de rejet', expired && rejected === null && got === null, JSON.stringify({ expired, got, rejected: rejected && rejected.message }));
  link.deliver({ gfs: 0, type: 'reponse', id: idOf(call), data: { id: 6 } });
  check('une réponse tardive n\'y change rien, et aucune seconde demande ne part', (await asked(link)) === null && sectionCalls(link).length === 1);
}

// 5. Un autre cadre, un autre contrat.
{
  const link = await hosted();
  const first = asked(link);
  await settle();
  const call = sectionCalls(link)[0];
  link.deliver({ gfs: 0, type: 'reponse', id: idOf(call), data: { id: 7 } }, { source: { postMessage() {} } });
  link.deliver({ gfs: 7, type: 'reponse', id: idOf(call), data: { id: 7 } });
  const racing = await Promise.race([first.then(() => 'résolue'), settle().then(() => 'en attente')]);
  check('une réponse d\'un autre cadre ou d\'un autre contrat n\'est pas lue : la demande attend', racing === 'en attente', racing);
  answer(link, { id: 5 });
  check('la vraie réponse la résout', (await first) === 5);
}

summarizeAndExit();
