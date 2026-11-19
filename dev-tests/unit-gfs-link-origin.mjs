// L'origine de GFS que retient le lien de l'app (js/gfs-link.js) - consigne 086 de GFS (kit 0.27.0, contrats de GFS 1.2 point 4, faits vérifiés 138). Le tout premier message à GFS, la demande de
// `contexte`, part à « * » : l'app ne sait pas encore d'où elle est cadrée, et son cadre a une origine opaque. Dès le premier message VALIDE de GFS (venu du cadre parent, au contrat de GFS), le lien retient
// `event.origin` - un `http(s)://hôte` sans chemin ; « null », rien ou une adresse avec chemin ne le sont pas - et tout envoi suivant la vise : un cadre parent qui n'est plus à cette origine ne reçoit rien (le
// navigateur jette le message). La première origine retenue reste. GFS est toujours reconnu par `event.source` (jamais par l'origine), et le sens GFS -> app garde « * » (une origine opaque ne se vise pas).
//
// Node seul, sans navigateur (dev-tests/unit-harness.mjs) : le VRAI js/gfs-link.js, lu dans un contexte `vm` dont `window` est un faux cadre - un parent qui note chaque `postMessage` et son second argument.
//  1. le parcours : la demande de `contexte` part à « * » ; GFS répond depuis une origine ; les SIX envois du lien la visent ensuite, un à un : `call` (installer), `reply` (la réponse à un appel inconnu de GFS),
//     `stockage.ecrire`, `barre.masquer`, `lecteur.afficher` et `tell` (securite) ; un message de GFS venu d'une autre origine est lu quand même (la source décide) et ne remplace pas l'origine retenue ;
//     un message d'un autre cadre est ignoré ;
//  2. ce qui ne retient rien : un autre cadre, un autre contrat, un message sans enveloppe, « null », une adresse avec chemin, une barre finale, un autre schéma, aucun hôte, rien, un non-texte ; la première
//     origine valide reste (un message qui vient avant et n'est pas valide ne compte pas) ; une adresse avec port est une origine ; seule (sans `gfs=`), rien ne part et rien n'écoute ;
//  3. la forme du fichier : un seul `postMessage(` dans le code du lien (celui de `sendToHost`), six appels de `sendToHost`, « * » écrit une seule fois ;
//  4. le même parcours rejoué sur des liens ABÎMÉS À LA MAIN : le lien d'avant (tout part à « * »), la source, le contrat ou la forme de l'origine non contrôlés, la première origine remplacée par la suivante,
//     chacun des six envois resté à « * » : chacun doit faire échouer au moins une vérification, sinon le parcours ne prouve rien.
//
// Lancer : node dev-tests/unit-gfs-link-origin.mjs
// Essayer un autre état du lien (par exemple celui d'avant la consigne : `git show a6465c14:js/gfs-link.js > /tmp/avant.js`) : GFS_LINK_FILE=/tmp/avant.js node dev-tests/unit-gfs-link-origin.mjs
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, check, summarizeAndExit } from './unit-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = process.env.GFS_LINK_FILE || join(ROOT, 'js', 'gfs-link.js');
const SOURCE = readFileSync(FILE, 'utf8');
const GFS = 'https://gfs.example';

// Un faux cadre : le parent note chaque message et la cible qu'on lui a donnée ; `deliver` joue un message de GFS (ou d'un autre) devant l'écouteur que le lien a posé.
function frame(search) {
  const sent = [];
  const listeners = [];
  const parent = { postMessage: (message, origin) => { sent.push({ message: JSON.parse(JSON.stringify(message)), origin }); } };
  const window = { location: { search }, parent, addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); } };
  const deliver = (data, { source = parent, origin } = {}) => listeners.forEach(fn => fn(origin === undefined ? { data, source } : { data, source, origin }));
  return { window, sent, listeners, deliver, parent };
}

// Le lien, lu dans un contexte neuf. Les minuteries ne partent jamais (le délai de 5 secondes du contexte ne retient pas le processus) ; le lecteur du kit (`import()`) ne se charge pas ici et le dit à la console.
function load(source, search = '?gfs=0') {
  const fake = frame(search);
  const warnings = [];
  const context = createContext({ window: fake.window, console: { ...console, warn: (...args) => warnings.push(args) }, setTimeout: () => 0, clearTimeout: () => {}, URLSearchParams, Blob, File });
  vm.runInContext(source, context, { filename: FILE });
  return { ...fake, warnings, GfsLink: vm.runInContext('GfsLink', context) };
}

const VALID = { gfs: 0, type: 'evenement', nom: 'langue', data: { langue: 'en' } };   // un message valide de GFS dont le seul effet est la langue
const OTHER_FRAME = { postMessage() {} };

async function scenario(source) {
  const results = [];
  const note = (name, ok, notes) => results.push({ name, ok: Boolean(ok), notes });

  // 1. Le parcours.
  const a = load(source);
  note('départ : la demande de `contexte` est le seul message envoyé et part à « * » (GFS n\'a encore rien dit)', a.sent.length === 1 && a.sent[0].message.nom === 'contexte' && a.sent[0].origin === '*', JSON.stringify(a.sent));
  a.deliver({ gfs: 0, type: 'reponse', id: a.sent[0].message.id, data: { langue: 'fr', stockage: {}, lecteurs: ['youtube'] } }, { origin: GFS });
  await a.GfsLink.ready;
  const next = (act) => { const before = a.sent.length; act(); return a.sent.length === before + 1 ? a.sent[a.sent.length - 1] : null; };
  const aims = (entry, name) => entry !== null && entry.origin === GFS && (name === undefined || entry.message.nom === name);
  note('après le premier message valide de GFS : `call` (ici l\'appel `installer`) vise son origine', aims(next(() => { a.GfsLink.install('une-extension').catch(() => {}); }), 'installer'));
  note('après le premier message valide de GFS : `reply` (la réponse à un appel inconnu de GFS) vise son origine', (() => {
    const entry = next(() => a.deliver({ gfs: 0, type: 'appel', id: 41, nom: 'inconnu' }, { origin: GFS }));
    return aims(entry) && entry.message.id === 41 && entry.message.type === 'erreur' && entry.message.code === 'GFS_INCONNU';
  })());
  note('après le premier message valide de GFS : `stockage.ecrire` vise son origine', aims(next(() => a.GfsLink.storageSet('pp_theme', 'dark')), 'stockage.ecrire'));
  note('après le premier message valide de GFS : `barre.masquer` vise son origine', aims(next(() => a.GfsLink.hideBar(true)), 'barre.masquer'));
  note('après le premier message valide de GFS : `lecteur.afficher` vise son origine', aims(next(() => a.GfsLink.player('afficher', { id: 'v1', fournisseur: 'youtube', video: 'abc', rect: { x: 0, y: 0, width: 10, height: 10 }, zone: { x: 0, y: 0, width: 10, height: 10 } })), 'lecteur.afficher'));
  note('après le premier message valide de GFS : `tell` (l\'appel `securite` du relais) vise son origine', aims(next(() => a.GfsLink.tell('securite', { quoi: 'relais', kit: '0.27.0' })), 'securite'));
  a.deliver(VALID, { origin: 'https://autre.example' });
  note('un message de GFS venu d\'une autre origine est lu quand même (la source décide, pas l\'origine) et ne remplace pas l\'origine retenue', a.GfsLink.language() === 'en' && aims(next(() => a.GfsLink.hideBar(false)), 'barre.masquer'), a.GfsLink.language());
  a.deliver({ ...VALID, data: { langue: 'fr' } }, { source: OTHER_FRAME, origin: GFS });
  note('un message d\'un autre cadre est ignoré, même à l\'origine de GFS', a.GfsLink.language() === 'en', a.GfsLink.language());

  // 2. Ce qui ne retient rien : l'envoi qui suit part encore à « * ».
  const notHeld = [
    ['un autre cadre', VALID, { source: OTHER_FRAME, origin: 'https://autre.example' }],
    ['un autre contrat', { ...VALID, gfs: 1 }, { origin: 'https://mauvais-contrat.example' }],
    ['un message sans enveloppe', 'bonjour', { origin: 'https://sans-enveloppe.example' }],
    ['« null » (une origine opaque)', VALID, { origin: 'null' }],
    ['une adresse avec chemin', VALID, { origin: 'https://gfs.example/avec/chemin' }],
    ['une barre finale', VALID, { origin: 'https://gfs.example/' }],
    ['un autre schéma', VALID, { origin: 'ftp://gfs.example' }],
    ['aucun hôte', VALID, { origin: 'https://' }],
    ['aucune origine (le navigateur ne la dit pas)', VALID, {}],
    ['une origine qui n\'est pas un texte', VALID, { origin: 42 }],
  ];
  for (const [what, message, options] of notHeld) {
    const b = load(source);
    b.deliver(message, options);
    const before = b.sent.length;
    b.GfsLink.hideBar(true);
    note(`l'origine n'est pas retenue sur ${what} : l'envoi suivant part encore à « * »`, b.sent.length === before + 1 && b.sent[b.sent.length - 1].origin === '*', JSON.stringify(b.sent[b.sent.length - 1]));
  }
  for (const origin of ['http://localhost:8897', 'https://gfs.example:8443', 'https://sous.domaine.gfs.example']) {
    const b = load(source);
    b.deliver(VALID, { origin });
    b.GfsLink.hideBar(true);
    note(`l'origine ${origin} (http ou https, un hôte, un port possible, sans chemin) est retenue`, b.sent[b.sent.length - 1].origin === origin, JSON.stringify(b.sent[b.sent.length - 1]));
  }
  const c = load(source);
  c.deliver(VALID, { source: OTHER_FRAME, origin: 'https://avant.example' });
  c.deliver(VALID, { origin: 'https://premier.example' });
  c.deliver(VALID, { origin: 'https://second.example' });
  c.GfsLink.hideBar(true);
  note('la première origine valide reste : celle d\'un message qui vient avant et n\'est pas valide ne compte pas, celle d\'un message qui vient après ne la remplace pas', c.sent[c.sent.length - 1].origin === 'https://premier.example', JSON.stringify(c.sent[c.sent.length - 1]));
  const d = load(source, '');
  note('seule (sans `gfs=` dans l\'adresse) : rien n\'est envoyé, rien n\'écoute, `hideBar` et `tell` rendent faux', d.sent.length === 0 && d.listeners.length === 0 && d.GfsLink.hideBar(true) === false && d.GfsLink.tell('securite', {}) === false && d.sent.length === 0);
  return results;
}

// 3. La forme du fichier lu (les commentaires ne comptent pas) : UNE seule fonction d'envoi.
const code = SOURCE.split('\n').filter(line => !/^\s*\/\//.test(line)).map(line => line.replace(/\s\/\/.*$/, ''));
const posts = code.filter(line => /\bpostMessage\(/.test(line));
check('une seule fonction d\'envoi : un seul `postMessage(` dans le code du lien, celui de `sendToHost`, qui vise l\'origine retenue et sinon « * »', posts.length === 1 && /function sendToHost\(message\) \{ window\.parent\.postMessage\(message, hostOrigin \|\| '\*'\); \}/.test(posts[0]), posts.join(' | '));
const calls = code.filter(line => /\bsendToHost\(/.test(line) && !/function sendToHost\(/.test(line));
check('les six envois de l\'app à GFS passent par `sendToHost` : call, reply, stockage.ecrire, barre.masquer, lecteur.<action> et tell', calls.length === 6, String(calls.length));
const stars = code.filter(line => /'\*'/.test(line));
check('« \'*\' » n\'est écrit qu\'une fois dans le code du lien : le repli de `sendToHost`', stars.length === 1 && /function sendToHost/.test(stars[0]), stars.join(' | '));

for (const result of await scenario(SOURCE)) check(result.name, result.ok, result.notes);

// 4. Les mêmes vérifications sur des liens abîmés à la main : chacun doit en faire échouer au moins une.
const once = (source, from, to) => (source.split(from).length === 2 ? source.replace(from, () => to) : null);
const PATTERN = String.raw`/^https?:\/\/[^/]+$/;`;
const HOLD = '    holdOrigin(event.origin);\n';
const CONTRACT_CHECK = "    if (!message || typeof message !== 'object' || message.gfs !== hostContract) return;\n";
const noHold = source => once(source, HOLD, '');
const sites = (source) => {
  const found = [];
  for (let at = source.indexOf('sendToHost('); at !== -1; at = source.indexOf('sendToHost(', at + 1)) {
    const lineStart = source.lastIndexOf('\n', at) + 1;
    if (source.slice(at - 9, at) !== 'function ' && !/^\s*\/\//.test(source.slice(lineStart, source.indexOf('\n', at)))) found.push(at);
  }
  return found;
};
const revertSend = k => (source) => {
  const at = sites(source)[k];
  return at === undefined ? null : "function sendRaw(message) { window.parent.postMessage(message, '*'); }\n" + source.slice(0, at) + 'sendRaw(' + source.slice(at + 'sendToHost('.length);
};
const MUTANTS = [
  ['le lien d\'avant : tous les envois partent à « * »', source => once(source, "hostOrigin || '*'", "'*'")],
  ['l\'origine est retenue sans contrôler la source (n\'importe quel cadre)', source => { const bare = noHold(source); return bare && once(bare, 'function onMessage(event) {\n', 'function onMessage(event) {\n' + HOLD); }],
  ['l\'origine est retenue sans contrôler le contrat ni l\'enveloppe', source => { const bare = noHold(source); return bare && once(bare, '    const message = event.data;\n' + CONTRACT_CHECK, '    const message = event.data;\n' + HOLD + CONTRACT_CHECK); }],
  ['la forme de l\'origine n\'est pas contrôlée (« null » et les adresses avec chemin sont retenues)', source => once(source, PATTERN, '/^.*$/;')],
  ['une adresse avec chemin est retenue', source => once(source, PATTERN, String.raw`/^https?:\/\/.+$/;`)],
  ['« null » est retenue', source => once(source, PATTERN, String.raw`/^(?:https?:\/\/[^/]+|null)$/;`)],
  ['la première origine retenue est remplacée par la suivante', source => once(source, 'hostOrigin === null && typeof origin', 'typeof origin')],
  ...[1, 2, 3, 4, 5, 6].map(n => [`le ${['premier', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième'][n - 1]} envoi du fichier reste à « * »`, revertSend(n - 1)]),
];
for (const [what, make] of MUTANTS) {
  const mutated = make(SOURCE);
  if (mutated === null) { check(`défaut posé : ${what} (il ne s'applique plus : le texte du lien a changé, mettre ce défaut à jour)`, false); continue; }
  try {
    const failed = (await scenario(mutated)).filter(result => !result.ok).map(result => result.name);
    check(`défaut posé : ${what} - attrapé par ${failed.length} vérification(s)`, failed.length > 0, 'aucune vérification n\'échoue');
  } catch (error) { check(`défaut posé : ${what} (le lien abîmé ne se joue pas)`, false, String(error && error.message)); }
}

summarizeAndExit();
