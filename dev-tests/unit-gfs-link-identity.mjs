// L'adresse de la personne que GFS donne au lien de l'app (js/gfs-link.js : `identity()`) - consigne 095 de GFS (contrats 5.2 point 9, guide 1.2 point 14, kit 0.4.0 : `GfsLink.identity()` et `onIdentity`).
// GFS ne la donne qu'à l'app qui a déclaré `permissions.identite` dans son manifeste : `identite` du contexte, puis l'événement `identite` quand il l'apprend (ou la perd) plus tard ; `{ email }` ou null.
//
// Node seul, sans navigateur (dev-tests/unit-harness.mjs) : le VRAI js/gfs-link.js, lu dans un contexte `vm` dont `window` est un faux cadre (un parent qui note les messages et un écouteur qu'on joue).
//  1. seule (pas de `gfs=` dans l'adresse) : `identity()` rend null, rien ne part, rien n'écoute ;
//  2. hébergée : null avant le contexte ; le contexte qui porte `{ email }` la donne, la casse gardée, en copie (changer ce qu'on a reçu ne change rien) ; le contexte sans la clé ou avec null : null ;
//  3. la forme : une adresse avec espaces autour est rognée ; une adresse sans « @ », avec deux, avec un espace dedans, vide, un autre type ou une valeur qui n'est pas un objet ne sont pas crues (null) ;
//  4. l'événement `identite` : donne l'adresse apprise plus tard, la remplace, la retire (null) ; un événement sans la clé ne change rien ; l'événement `extensions`, `langue`, `barre`... n'y touchent pas ;
//     un message d'un autre cadre ou d'un autre contrat est ignoré ;
//  5. le lien d'avant la consigne (sans `identity`) : la vérification de la forme échoue - ce que cet essai doit prouver (GFS_LINK_FILE=… pour l'essayer sur un autre état du lien).
//
// Lancer : node dev-tests/unit-gfs-link-identity.mjs
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
const identityOf = link => (typeof link.GfsLink.identity === 'function' ? link.GfsLink.identity() : 'PAS DE identity()');
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
  check('seule : identity() existe et rend null', identityOf(link) === null, JSON.stringify(identityOf(link)));
  check('seule : rien ne part, rien n\'écoute', link.sent.length === 0 && link.listeners.length === 0);
}

// 2. Hébergée : le contexte.
{
  const link = load();
  check('hébergée, avant le contexte : null', identityOf(link) === null);
  link.deliver({ gfs: 0, type: 'reponse', id: link.sent[0].message.id, data: context({ identite: { email: 'Ada.Lovelace@Exemple.fr' } }) });
  await link.GfsLink.ready;
  check('le contexte porte { email } : elle est donnée, la casse gardée', same(identityOf(link), { email: 'Ada.Lovelace@Exemple.fr' }), JSON.stringify(identityOf(link)));
  const copy = identityOf(link);
  if (copy && typeof copy === 'object') copy.email = 'modifiee@exemple.fr';
  check('c\'est une copie : changer ce qu\'on a reçu ne change rien', !!identityOf(link) && identityOf(link).email === 'Ada.Lovelace@Exemple.fr');
  check('l\'adresse que GFS donne n\'envoie rien à GFS', link.sent.length === 1, link.sent.length);

  const none = await hostedWith(context());
  check('le contexte sans la clé `identite` (pas la permission, un GFS d\'avant) : null', identityOf(none) === null);
  const unknown = await hostedWith(context({ identite: null }));
  check('le contexte avec `identite: null` (GFS ne connaît pas la personne) : null', identityOf(unknown) === null);
}

// 3. La forme.
{
  const accepted = [[{ email: '  ada@exemple.fr  ' }, 'ada@exemple.fr'], [{ email: 'a@b' }, 'a@b'], [{ email: 'ADA@EXEMPLE.FR', autre: 1 }, 'ADA@EXEMPLE.FR']];
  for (const [raw, expected] of accepted) {
    const link = await hostedWith(context({ identite: raw }));
    check('forme lue : ' + JSON.stringify(raw) + ' → ' + expected, same(identityOf(link), { email: expected }), JSON.stringify(identityOf(link)));
  }
  const refused = [{ email: '' }, { email: '   ' }, { email: 'pas une adresse' }, { email: 'sans-arobase.fr' }, { email: 'a@b@c.fr' }, { email: 'a b@c.fr' }, { email: '@c.fr' }, { email: 'a@' }, { email: 42 }, { email: null },
    { email: ['ada@exemple.fr'] }, {}, 'ada@exemple.fr', 42, true, ['ada@exemple.fr']];
  for (const raw of refused) {
    const link = await hostedWith(context({ identite: raw }));
    check('forme refusée (null) : ' + JSON.stringify(raw), identityOf(link) === null, JSON.stringify(identityOf(link)));
  }
}

// 4. L'événement `identite`.
{
  const link = await hostedWith(context({ identite: null }));
  link.deliver({ gfs: 0, type: 'evenement', nom: 'identite', data: { identite: { email: 'Ada@Exemple.fr' } } });
  check('l\'événement qui apporte l\'adresse apprise plus tard : elle est donnée', same(identityOf(link), { email: 'Ada@Exemple.fr' }), JSON.stringify(identityOf(link)));
  link.deliver({ gfs: 0, type: 'evenement', nom: 'extensions', data: { extensions: [] } });
  link.deliver({ gfs: 0, type: 'evenement', nom: 'langue', data: { langue: 'en' } });
  link.deliver({ gfs: 0, type: 'evenement', nom: 'barre', data: { barre: null } });
  link.deliver({ gfs: 0, type: 'evenement', nom: 'reglages', data: { enregistres: true } });
  check('les événements extensions, langue, barre, reglages ne l\'effacent pas', same(identityOf(link), { email: 'Ada@Exemple.fr' }), JSON.stringify(identityOf(link)));
  link.deliver({ gfs: 0, type: 'evenement', nom: 'identite', data: {} });
  link.deliver({ gfs: 0, type: 'evenement', nom: 'identite' });
  check('un événement identite sans la clé ne change rien', same(identityOf(link), { email: 'Ada@Exemple.fr' }));
  link.deliver({ gfs: 0, type: 'evenement', nom: 'identite', data: { identite: { email: 'Autre@Exemple.fr' } } });
  check('un événement qui change l\'adresse la remplace', same(identityOf(link), { email: 'Autre@Exemple.fr' }));
  link.deliver({ gfs: 0, type: 'evenement', nom: 'identite', data: { identite: { email: 'pas une adresse' } } });
  check('un événement dont l\'adresse n\'en est pas une la retire (on ne croit pas une forme inconnue)', identityOf(link) === null);
  link.deliver({ gfs: 0, type: 'evenement', nom: 'identite', data: { identite: { email: 'Ada@Exemple.fr' } } });
  link.deliver({ gfs: 0, type: 'evenement', nom: 'identite', data: { identite: null } });
  check('un événement `identite: null` (GFS la perd) la retire', identityOf(link) === null);

  const other = await hostedWith(context({ identite: { email: 'ada@exemple.fr' } }));
  other.deliver({ gfs: 0, type: 'evenement', nom: 'identite', data: { identite: { email: 'intrus@exemple.fr' } } }, { source: { postMessage() {} } });
  other.deliver({ gfs: 7, type: 'evenement', nom: 'identite', data: { identite: { email: 'intrus@exemple.fr' } } });
  check('un événement d\'un autre cadre ou d\'un autre contrat est ignoré', same(identityOf(other), { email: 'ada@exemple.fr' }), JSON.stringify(identityOf(other)));
  const known = await hostedWith(context({ identite: { email: 'ada@exemple.fr' } }));
  known.deliver({ gfs: 0, type: 'reponse', id: 99, data: { identite: { email: 'intrus@exemple.fr' } } });
  check('une réponse à un appel qui n\'existe pas ne change rien', same(identityOf(known), { email: 'ada@exemple.fr' }));
}

summarizeAndExit();
