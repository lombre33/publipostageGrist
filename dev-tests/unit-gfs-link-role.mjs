// Le rôle que GFS donne au lien de l'app (js/gfs-link.js : `role()`) - consigne 104 de GFS (contrats 5.2 point 8 : `contexte.role = { proprietaire: true | false | null, responsableDe: [] }`). GFS prouve par `GET /webhooks` de l'API
// REST de Grist (200 : propriétaire, 403 « No owner access » : non) et rend `null` quand il ne sait pas (le cas de départ, pas de jeton, pas de réponse) ; il le relit à CHAQUE appel `contexte`, et le rôle n'a PAS d'événement.
// L'app n'en lit que `proprietaire`, et seulement un booléen : la fenêtre de mise à jour des noms (js/names-update.js) ne s'ouvre que pour `true`.
//
// Node seul, sans navigateur (dev-tests/unit-harness.mjs) : le VRAI js/gfs-link.js, lu dans un contexte `vm` dont `window` est un faux cadre (un parent qui note les messages et un écouteur qu'on joue).
//  1. seule (pas de `gfs=` dans l'adresse) : `role()` rend { owner: null }, rien ne part, rien n'écoute ;
//  2. hébergée : { owner: null } avant le contexte ; le contexte qui porte `proprietaire` vrai, faux ou nul le donne ; `responsableDe` n'est pas lu ; une copie (changer ce qu'on a reçu ne change rien) ; rien n'est envoyé à GFS pour le savoir ;
//  3. la forme : seul un booléen compte ; la clé absente, `role` nul, un texte, un nombre, un tableau, un objet vide, `proprietaire` en texte (« true », « oui »), en nombre (1, 0) : { owner: null } (on ne croit pas une forme inconnue) ;
//  4. pas d'événement : un événement `role`, `extensions`, `langue`, `identite`... ne change rien (GFS le relit au contexte) ; l'événement `extensions`, qui n'a pas de rôle, ne l'efface pas non plus ;
//     un message d'un autre cadre ou d'un autre contrat est ignoré ;
//  5. le lien d'avant la consigne (sans `role`) : la vérification échoue - ce que cet essai doit prouver (GFS_LINK_FILE=… pour l'essayer sur un autre état du lien).
// L'app n'appelle `contexte` qu'une fois, au démarrage : le rôle qu'elle garde est celui de ce contexte (la fenêtre de mise à jour des noms le lit une fois, au premier besoin).
//
// Lancer : node dev-tests/unit-gfs-link-role.mjs
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
  const parent = { postMessage: (message, origin) => { sent.push({ message: JSON.parse(JSON.stringify(message)), origin }); } };
  const window = { location: { search }, parent, addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); } };
  const context = createContext({ window, console: { ...console, warn() {} }, setTimeout: () => 0, clearTimeout: () => {}, URLSearchParams, Blob, File });
  vm.runInContext(SOURCE, context, { filename: FILE });
  const deliver = (data, { source = parent, origin = GFS } = {}) => listeners.forEach(fn => fn({ data, source, origin }));
  return { sent, listeners, deliver, parent, GfsLink: vm.runInContext('GfsLink', context) };
}
const roleOf = link => (typeof link.GfsLink.role === 'function' ? link.GfsLink.role() : 'PAS DE role()');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Un lien hébergé dont le contexte est arrivé avec `data`.
async function hostedWith(data) {
  const link = load();
  link.deliver({ gfs: 0, type: 'reponse', id: link.sent[0].message.id, data });
  await link.GfsLink.ready;
  return link;
}
const context = (extra = {}) => Object.assign({ langue: 'fr', stockage: {} }, extra);

// 1. Seule.
{
  const link = load('');
  check('seule : role() existe et rend { owner: null }', same(roleOf(link), { owner: null }), JSON.stringify(roleOf(link)));
  check('seule : rien ne part, rien n\'écoute', link.sent.length === 0 && link.listeners.length === 0);
}

// 2. Hébergée : le contexte.
{
  const link = load();
  check('hébergée, avant le contexte : { owner: null } (la fenêtre ne s\'ouvre pas sur une preuve qui n\'est pas là)', same(roleOf(link), { owner: null }), JSON.stringify(roleOf(link)));
  link.deliver({ gfs: 0, type: 'reponse', id: link.sent[0].message.id, data: context({ role: { proprietaire: true, responsableDe: ['a', 'b'] } }) });
  await link.GfsLink.ready;
  check('le contexte dit « propriétaire » : { owner: true }, et rien d\'autre n\'est lu (responsableDe)', same(roleOf(link), { owner: true }), JSON.stringify(roleOf(link)));
  const copy = roleOf(link);
  if (copy && typeof copy === 'object') copy.owner = false;
  check('c\'est une copie : changer ce qu\'on a reçu ne change rien', !!roleOf(link) && roleOf(link).owner === true);
  check('le rôle que GFS donne n\'envoie rien à GFS', link.sent.length === 1, link.sent.length);

  const refused = await hostedWith(context({ role: { proprietaire: false, responsableDe: [] } }));
  check('le contexte dit « pas propriétaire » : { owner: false }', same(roleOf(refused), { owner: false }), JSON.stringify(roleOf(refused)));
  const unknown = await hostedWith(context({ role: { proprietaire: null, responsableDe: [] } }));
  check('le contexte dit « GFS ne sait pas » (nul) : { owner: null }', same(roleOf(unknown), { owner: null }), JSON.stringify(roleOf(unknown)));
  const none = await hostedWith(context());
  check('le contexte sans la clé `role` (un GFS d\'avant la consigne) : { owner: null }', same(roleOf(none), { owner: null }), JSON.stringify(roleOf(none)));
}

// 3. La forme : seul un booléen compte.
{
  const unbelieved = [null, 'proprietaire', 42, true, ['proprietaire'], {}, { responsableDe: [] }, { proprietaire: 'true' }, { proprietaire: 'oui' }, { proprietaire: 1 }, { proprietaire: 0 }, { proprietaire: [] }, { proprietaire: {} }, { proprietaire: undefined }];
  for (const raw of unbelieved) {
    const link = await hostedWith(context({ role: raw }));
    check('forme refusée ({ owner: null }) : ' + JSON.stringify(raw === undefined ? 'undefined' : raw), same(roleOf(link), { owner: null }), JSON.stringify(roleOf(link)));
  }
}

// 4. Pas d'événement.
{
  const link = await hostedWith(context({ role: { proprietaire: true, responsableDe: [] } }));
  link.deliver({ gfs: 0, type: 'evenement', nom: 'role', data: { role: { proprietaire: false, responsableDe: [] } } });
  link.deliver({ gfs: 0, type: 'evenement', nom: 'identite', data: { identite: { email: 'ada@exemple.fr' } } });
  check('un événement `role` ou `identite` ne change rien : GFS relit le rôle au contexte, il ne le pousse pas', same(roleOf(link), { owner: true }), JSON.stringify(roleOf(link)));
  link.deliver({ gfs: 0, type: 'evenement', nom: 'extensions', data: { extensions: [] } });
  link.deliver({ gfs: 0, type: 'evenement', nom: 'langue', data: { langue: 'en' } });
  link.deliver({ gfs: 0, type: 'evenement', nom: 'barre', data: { barre: null } });
  link.deliver({ gfs: 0, type: 'evenement', nom: 'reglages', data: { enregistres: true } });
  check('les événements extensions, langue, barre, reglages (sans rôle) ne l\'effacent pas', same(roleOf(link), { owner: true }), JSON.stringify(roleOf(link)));

  const other = await hostedWith(context({ role: { proprietaire: true, responsableDe: [] } }));
  other.deliver({ gfs: 0, type: 'evenement', nom: 'role', data: { role: { proprietaire: false, responsableDe: [] } } }, { source: { postMessage() {} } });
  other.deliver({ gfs: 7, type: 'evenement', nom: 'role', data: { role: { proprietaire: false, responsableDe: [] } } });
  check('un message d\'un autre cadre ou d\'un autre contrat est ignoré', same(roleOf(other), { owner: true }), JSON.stringify(roleOf(other)));
  other.deliver({ gfs: 0, type: 'reponse', id: 99, data: { role: { proprietaire: false, responsableDe: [] } } });
  check('une réponse à un appel qui n\'existe pas ne change rien', same(roleOf(other), { owner: true }));
}

summarizeAndExit();
