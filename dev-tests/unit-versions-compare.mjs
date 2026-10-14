#!/usr/bin/env node
// Tests purs (sans navigateur ni ProseMirror) de la comparaison d'une version et de la version actuelle d'un modèle : js/versions-compare.js (le haut du module : diffKeys, tokenize,
// similarity, alignBlocks, inlineGroups, compareText, compareLines) - cf. dev-tests/unit-harness.mjs pour le contexte général. Le bas du module (compareDocs, compareHtml : les marques
// posées dans le vrai document de l'éditeur) se joue dans la page : groupe `versions` (dev-tests/scenarios-versions.js, cas `versions_compare_*`).
//  1) diffKeys : la plus longue suite commune de deux suites de clés, au plus juste (comparée à une recherche exhaustive sur des suites au hasard), des plages qui se recollent aux deux
//     suites, `null` quand les suites sont trop grandes ;
//  2) tokenize et blockKey : mots, blancs (tous égaux), signes, pastilles ; la clé d'un bloc ne compte ni les blancs de bord ni leur nombre ;
//  3) similarity : le même bloc remanié ressemble (mots changés, mots dans un autre ordre), deux blocs étrangers non ;
//  4) alignBlocks : les blocs identiques d'abord, puis, dans ce qui reste, les blocs qui se ressemblent le plus (pas le premier venu), le reste ajouté ou retiré, dans l'ordre ;
//  5) inlineGroups : les groupes de différences d'un bloc, deux changements séparés par des blancs seuls n'en faisant qu'un ;
//  6) compareText (l'objet d'un e-mail, ses destinataires) et compareLines (la composition d'un macro-modèle).
// Lancer : node dev-tests/unit-versions-compare.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const context = createContext({});
loadScript(context, 'js/versions-compare.js');
const VC = evalIn(context, 'VersionsCompare');
const json = (value) => JSON.stringify(value);

// Un petit générateur au hasard qui se rejoue (même graine, mêmes suites).
function random(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

// La longueur de la plus longue suite commune, par la définition (programmation dynamique sans astuce).
function lcsLength(a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  return table[0][0];
}

// Ce que les plages disent de a et de b : si on recolle les parties « eq » et « del » on retrouve a, les parties « eq » et « ins », b.
function rebuilds(runs, a, b) {
  const fromA = [];
  const fromB = [];
  let eqSame = true;
  runs.forEach(run => {
    if (run.type !== 'ins') fromA.push(...a.slice(run.a[0], run.a[1]));
    if (run.type !== 'del') fromB.push(...b.slice(run.b[0], run.b[1]));
    if (run.type === 'eq') for (let k = 0; k < run.a[1] - run.a[0]; k++) if (a[run.a[0] + k] !== b[run.b[0] + k]) eqSame = false;
  });
  return json(fromA) === json(a) && json(fromB) === json(b) && eqSame;
}

const block = (text) => { const tokens = VC.tokenize(text); return { tokens, key: VC.blockKey(tokens), size: text.length }; };
const keys = (list) => list.map(item => item.key);

// === 1. diffKeys ===
{
  const same = VC.diffKeys(['a', 'b', 'c'], ['a', 'b', 'c']);
  check('diffKeys : deux suites identiques ne font qu\'une plage commune', json(same) === json([{ type: 'eq', a: [0, 3], b: [0, 3] }]), json(same));
  check('diffKeys : deux suites vides ne font aucune plage', json(VC.diffKeys([], [])) === '[]');
  check('diffKeys : contre une suite vide, tout est retiré ou ajouté', json(VC.diffKeys(['a', 'b'], [])) === json([{ type: 'del', a: [0, 2], b: [0, 0] }]) && json(VC.diffKeys([], ['a'])) === json([{ type: 'ins', a: [0, 0], b: [0, 1] }]));
  const middle = VC.diffKeys(['a', 'b', 'c'], ['a', 'x', 'c']);
  check('diffKeys : un élément remplacé au milieu = « del » puis « ins » entre deux plages communes',
    json(middle.map(r => r.type)) === json(['eq', 'del', 'ins', 'eq']) && rebuilds(middle, ['a', 'b', 'c'], ['a', 'x', 'c']), json(middle));
  const insertion = VC.diffKeys(['a', 'c'], ['a', 'b', 'c']);
  check('diffKeys : un élément inséré', json(insertion.map(r => r.type)) === json(['eq', 'ins', 'eq']) && insertion[1].b[0] === 1 && insertion[1].b[1] === 2);
  const deletion = VC.diffKeys(['a', 'b', 'c'], ['a', 'c']);
  check('diffKeys : un élément retiré', json(deletion.map(r => r.type)) === json(['eq', 'del', 'eq']) && deletion[1].a[0] === 1 && deletion[1].a[1] === 2);
  const rng = random(7);
  const alphabet = ['a', 'b', 'c', 'd', 'e'];
  let exact = 0;
  let rebuilt = 0;
  const total = 400;
  for (let i = 0; i < total; i++) {
    const a = Array.from({ length: Math.floor(rng() * 12) }, () => alphabet[Math.floor(rng() * alphabet.length)]);
    const b = Array.from({ length: Math.floor(rng() * 12) }, () => alphabet[Math.floor(rng() * alphabet.length)]);
    const runs = VC.diffKeys(a, b);
    const common = runs.filter(r => r.type === 'eq').reduce((n, r) => n + r.a[1] - r.a[0], 0);
    if (common === lcsLength(a, b)) exact++;
    if (rebuilds(runs, a, b)) rebuilt++;
  }
  check(`diffKeys : sur ${total} paires de suites au hasard, la suite commune est toujours la plus longue possible`, exact === total, exact + '/' + total);
  check(`diffKeys : sur ${total} paires de suites au hasard, les plages recollent exactement les deux suites`, rebuilt === total, rebuilt + '/' + total);
  const bigA = Array.from({ length: 2600 }, (_, i) => 'a' + i);
  const bigB = Array.from({ length: 2600 }, (_, i) => 'b' + i);
  check('diffKeys : deux suites trop grandes pour la recherche rendent null (le bloc sera donné pour remplacé en entier)', VC.diffKeys(bigA, bigB) === null);
  const bigSame = VC.diffKeys(bigA.concat(['x']), bigA.concat(['y']));
  check('diffKeys : le début et la fin communs ne comptent pas dans la taille : deux longues suites qui ne diffèrent que d\'un élément se comparent', bigSame !== null && json(bigSame.map(r => r.type)) === json(['eq', 'del', 'ins']));
}

// === 2. tokenize et blockKey ===
{
  const tokens = VC.tokenize('Bonjour,  Marie 3 €');
  check('tokenize : mots, signes et blancs', json(tokens.map(t => t.key)) === json(['Bonjour', ',', ' ', 'Marie', ' ', '3', ' ', '€']), json(tokens.map(t => t.key)));
  check('tokenize : deux blancs de suite font un seul « mot » blanc, et chaque mot garde sa place dans le texte', tokens[2].space && tokens[2].from === 8 && tokens[2].to === 10 && tokens[3].from === 10 && tokens[3].to === 15);
  check('tokenize : un espace insécable, une tabulation, un saut de ligne sont des blancs comme les autres', json(VC.tokenize('a b\tc\nd').map(t => t.key)) === json(['a', ' ', 'b', ' ', 'c', ' ', 'd']));
  const withLeaf = VC.tokenize('Cher ￼,', index => 'variable:Nom@' + index);
  check('tokenize : une pastille ou une image est un mot qui porte son identité', withLeaf.some(t => t.key === '￼variable:Nom@5') && withLeaf.filter(t => !t.space).length === 3, json(withLeaf.map(t => t.key)));
  check('tokenize : deux pastilles de réglages différents ne sont pas le même mot', VC.tokenize('￼', () => 'variable:A')[0].key !== VC.tokenize('￼', () => 'variable:B')[0].key);
  check('tokenize : la fermeture d\'un nœud en ligne est un mot de plus', VC.tokenize('￼texte').map(t => t.key).join('|') === '￼|texte|');
  check('tokenize : des lettres accentuées, des chiffres et un tiret bas restent dans le même mot', json(VC.tokenize('échéance_2 été').filter(t => !t.space).map(t => t.key)) === json(['échéance_2', 'été']));
  check('blockKey : les blancs du début et de la fin et leur nombre ne comptent pas', VC.blockKey(VC.tokenize('  un   deux ')) === VC.blockKey(VC.tokenize('un deux')));
  check('blockKey : deux textes aux mots différents ont des clés différentes', VC.blockKey(VC.tokenize('un deux')) !== VC.blockKey(VC.tokenize('un trois')));
  check('blockKey : « ab » et « a b » ne sont pas le même bloc', VC.blockKey(VC.tokenize('ab')) !== VC.blockKey(VC.tokenize('a b')));
}

// === 3. similarity ===
{
  const sim = (a, b) => VC.similarity(block(a), block(b));
  check('similarity : deux blocs identiques = 1', sim('Le contrat est signé', 'Le contrat est signé') === 1);
  check('similarity : un seul mot change sur six, ils se ressemblent encore nettement', sim('Le contrat est signé par Marie', 'Le contrat est signé par Paul') > 0.75);
  check('similarity : les mêmes mots dans un autre ordre, c\'est encore le même bloc', sim('Bonjour facture', 'facture Bonjour') >= 0.75);
  check('similarity : aucun mot commun = 0', sim('Alpha beta', 'Gamma delta') === 0);
  check('similarity : un mot commun sur deux de chaque côté = 0,5', sim('contrat facture', 'facture Bonjour') === 0.5 || Math.abs(sim('contrat facture', 'facture Bonjour') - 0.5) < 1e-9);
  check('similarity : un bloc vide ne ressemble à rien', sim('', 'Alpha') === 0 && sim('', '') === 0);
  check('similarity : la ponctuation et les blancs ne comptent pas comme des mots', sim('Alpha, beta.', 'Alpha beta') === 1);
}

// === 4. alignBlocks ===
{
  const align = (a, b) => VC.alignBlocks(a.map(block), b.map(block)).map(([i, j]) => (i === null ? '+' + j : (j === null ? '-' + i : i + '=' + j)));
  check('alignBlocks : des blocs identiques s\'apparient un à un', json(align(['Un', 'Deux', 'Trois'], ['Un', 'Deux', 'Trois'])) === json(['0=0', '1=1', '2=2']));
  check('alignBlocks : un bloc ajouté dans la version', json(align(['Un', 'Trois'], ['Un', 'Deux', 'Trois'])) === json(['0=0', '+1', '1=2']));
  check('alignBlocks : un bloc retiré de la version', json(align(['Un', 'Deux', 'Trois'], ['Un', 'Trois'])) === json(['0=0', '-1', '2=1']));
  check('alignBlocks : un bloc dont on a changé un mot s\'apparie à son ancien état', json(align(['Un', 'Le chat noir dort ici', 'Trois'], ['Un', 'Le chien noir dort ici', 'Trois'])) === json(['0=0', '1=1', '2=2']));
  check('alignBlocks : deux blocs sans rapport ne s\'apparient pas (l\'un est retiré, l\'autre ajouté)', json(align(['Alpha beta'], ['Gamma delta'])) === json(['-0', '+0']));
  check('alignBlocks : deux phrases qui n\'ont que « le » en commun ne sont pas le même bloc modifié', json(align(['le contrat est signé par les deux parties'], ['le vendeur paie la facture demain matin'])) === json(['-0', '+0']));
  check('alignBlocks : une phrase dont plus de la moitié des mots restent est le même bloc modifié', json(align(['le contrat est signé par les deux parties demain'], ['le contrat est signé par les trois parties demain'])) === json(['0=0']));
  check('alignBlocks : le bloc qui ressemble le plus gagne (pas le premier qui ressemble un peu)', json(align(['contrat facture', 'Bonjour facture', 'fin'], ['facture Bonjour', 'fin'])) === json(['-0', '1=0', '2=1']), json(align(['contrat facture', 'Bonjour facture', 'fin'], ['facture Bonjour', 'fin'])));
  const pairs = align(['a1 a1 a1', 'b2 b2 b2', 'c3 c3 c3'], ['c3 c3 x', 'a1 a1 x']);
  check('alignBlocks : les paires gardent l\'ordre des deux documents (jamais de croisement)', (() => {
    const matched = pairs.filter(p => p.includes('=')).map(p => p.split('=').map(Number));
    return matched.every((m, k) => k === 0 || (m[0] > matched[k - 1][0] && m[1] > matched[k - 1][1]));
  })(), json(pairs));
  const sizes = VC.alignBlocks([block('Un'), block('Deux')], [block('Un'), block('Trois'), block('Quatre')]);
  check('alignBlocks : chaque bloc des deux côtés figure une fois et une seule', sizes.filter(p => p[0] !== null).map(p => p[0]).sort().join() === '0,1' && sizes.filter(p => p[1] !== null).map(p => p[1]).sort().join() === '0,1,2', json(sizes));
  check('alignBlocks : deux documents vides', json(VC.alignBlocks([], [])) === '[]' && json(VC.alignBlocks([block('Un')], [])) === json([[0, null]]) && json(VC.alignBlocks([], [block('Un')])) === json([[null, 0]]));
  // Des blocs qui se ressemblent tous (un mot de plus) : trop nombreux pour chercher les ressemblances (90 x 90 cases), ils sont donnés pour remplacés ; peu nombreux (20 x 20), ils s'apparient un à un.
  const many = Array.from({ length: 90 }, (_, i) => block('mot' + i + ' autre fin'));
  const other = Array.from({ length: 90 }, (_, i) => block('mot' + i + ' autre fin encore'));
  const wide = VC.alignBlocks(many, other);
  check('alignBlocks : une plage trop grande pour chercher les ressemblances est donnée pour remplacée (rien d\'apparié, rien d\'oublié)',
    wide.length === 180 && wide.every(p => p[0] === null || p[1] === null) && wide.filter(p => p[0] !== null).length === 90 && wide.filter(p => p[1] !== null).length === 90);
  const small = VC.alignBlocks(many.slice(0, 20), other.slice(0, 20));
  check('alignBlocks : les mêmes blocs, en plus petit nombre, s\'apparient un à un (c\'est bien la taille de la plage qui les laisse remplacés)', small.length === 20 && small.every((p, i) => p[0] === i && p[1] === i), json(small.slice(0, 3)));
  // Deux documents tout autres et très longs : la plus longue suite de blocs identiques n'est pas cherchée, mais aucun bloc n'est oublié, d'un côté comme de l'autre.
  const longA = Array.from({ length: 2600 }, (_, i) => block('avant' + i));
  const longB = Array.from({ length: 2600 }, (_, i) => block('apres' + i));
  const huge = VC.alignBlocks(longA, longB);
  check('alignBlocks : deux documents trop longs pour la recherche donnent chaque bloc, une fois, ajouté ou retiré',
    huge.length === 5200 && huge.filter(p => p[0] !== null && p[1] === null).length === 2600 && huge.filter(p => p[1] !== null && p[0] === null).length === 2600
    && new Set(huge.filter(p => p[0] !== null).map(p => p[0])).size === 2600 && new Set(huge.filter(p => p[1] !== null).map(p => p[1])).size === 2600);
  check('alignBlocks : la clé d\'un bloc identique ne dépend pas des blancs', json(keys([block(' un  deux ')])) === json(keys([block('un deux')])));
}

// === 5. inlineGroups ===
{
  const groups = (a, b) => VC.inlineGroups(block(a), block(b));
  const g1 = groups('Bonjour Marie, voici votre contrat.', 'Bonjour Paul, voici votre contrat.');
  check('inlineGroups : un mot remplacé = un groupe, avec ses positions dans chaque texte',
    g1.length === 1 && 'Bonjour Marie, voici votre contrat.'.slice(g1[0].a[0], g1[0].a[1]) === 'Marie' && 'Bonjour Paul, voici votre contrat.'.slice(g1[0].b[0], g1[0].b[1]) === 'Paul', json(g1));
  const g2 = groups('Le chat noir dort sur le canapé rouge.', 'Le chien noir dort sur le fauteuil rouge.');
  check('inlineGroups : deux mots remplacés loin l\'un de l\'autre = deux groupes', g2.length === 2, json(g2));
  const g3 = groups('Un deux trois', 'Un quatre cinq trois');
  check('inlineGroups : deux mots changés qui se suivent, séparés par un blanc = un seul groupe',
    g3.length === 1 && 'Un deux trois'.slice(g3[0].a[0], g3[0].a[1]) === 'deux' && 'Un quatre cinq trois'.slice(g3[0].b[0], g3[0].b[1]) === 'quatre cinq', json(g3));
  const g3b = groups('Un deux trois', 'Un quatre cinq');
  check('inlineGroups : deux mots remplacés qui se suivent, ne laissant entre eux qu\'un blanc commun = un seul groupe',
    g3b.length === 1 && 'Un deux trois'.slice(g3b[0].a[0], g3b[0].a[1]) === 'deux trois' && 'Un quatre cinq'.slice(g3b[0].b[0], g3b[0].b[1]) === 'quatre cinq', json(g3b));
  const g3c = groups('Un deux et trois', 'Un quatre et cinq');
  check('inlineGroups : deux mots remplacés séparés par un mot commun = deux groupes (seul un blanc relie)', g3c.length === 2, json(g3c));
  const g4 = groups('Un deux', 'Un trois deux');
  check('inlineGroups : un mot inséré = un groupe vide à gauche, le mot à droite', g4.length === 1 && g4[0].a[0] === g4[0].a[1] && 'Un trois deux'.slice(g4[0].b[0], g4[0].b[1]).trim() === 'trois', json(g4));
  const g5 = groups('Un trois deux', 'Un deux');
  check('inlineGroups : un mot retiré = le mot à gauche, un groupe vide à droite', g5.length === 1 && g5[0].b[0] === g5[0].b[1] && 'Un trois deux'.slice(g5[0].a[0], g5[0].a[1]).trim() === 'trois', json(g5));
  check('inlineGroups : deux textes identiques n\'ont aucun groupe', groups('Même texte', 'Même texte').length === 0 && groups('Même  texte', 'Même texte').length === 0);
  const g6 = groups('Début', 'Début, suite');
  check('inlineGroups : du texte ajouté à la fin', g6.length === 1 && g6[0].a[0] === 5 && g6[0].a[1] === 5 && g6[0].b[0] === 5 && g6[0].b[1] === 12, json(g6));
  const big = (word) => Array.from({ length: 2700 }, (_, i) => word + i).join(' ');
  const whole = VC.inlineGroups(block(big('a')), block(big('b')));
  check('inlineGroups : deux textes trop longs pour la recherche = un seul groupe qui les couvre en entier', whole.length === 1 && whole[0].a[0] === 0 && whole[0].b[0] === 0 && whole[0].a[1] === block(big('a')).size && whole[0].b[1] === block(big('b')).size);
}

// === 6. compareText et compareLines ===
{
  const text = (a, b) => VC.compareText(a, b);
  check('compareText : deux textes identiques', json(text('Contrat', 'Contrat')) === json([{ kind: 'same', text: 'Contrat' }]) && json(text('', '')) === '[]');
  check('compareText : un mot remplacé, le retiré (l\'actuel) avant l\'ajouté (la version)', json(text('Objet : contrat Marie', 'Objet : contrat Paul')) === json([{ kind: 'same', text: 'Objet : contrat ' }, { kind: 'removed', text: 'Marie' }, { kind: 'added', text: 'Paul' }]), json(text('Objet : contrat Marie', 'Objet : contrat Paul')));
  check('compareText : la version n\'avait rien, l\'actuel a un texte = tout retiré', json(text('Nouvel objet', '')) === json([{ kind: 'removed', text: 'Nouvel objet' }]));
  check('compareText : l\'actuel n\'a rien, la version avait un texte = tout ajouté', json(text('', 'Ancien objet')) === json([{ kind: 'added', text: 'Ancien objet' }]));
  check('compareText : des adresses (destinataires) comparées mot à mot', text('a@exemple.fr, b@exemple.fr', 'a@exemple.fr, c@exemple.fr').some(s => s.kind === 'removed' && /b/.test(s.text)) && text('a@exemple.fr, b@exemple.fr', 'a@exemple.fr, c@exemple.fr').some(s => s.kind === 'added' && /c/.test(s.text)));
  check('compareText : ce qui est « same » + « added » redonne la version, « same » + « removed » l\'actuel', (() => {
    const a = 'Le chat noir dort sur le canapé rouge.';
    const b = 'Le chien noir dort sur le fauteuil rouge.';
    const parts = text(a, b);
    return parts.filter(p => p.kind !== 'removed').map(p => p.text).join('') === b && parts.filter(p => p.kind !== 'added').map(p => p.text).join('') === a;
  })());
  check('compareText : null et undefined valent « vide »', json(text(null, 'x')) === json([{ kind: 'added', text: 'x' }]) && json(text('x', undefined)) === json([{ kind: 'removed', text: 'x' }]));
  const lines = (a, b) => VC.compareLines(a, b).map(l => l.kind[0] + ':' + l.text);
  check('compareLines : des listes identiques', json(lines(['A', 'B'], ['A', 'B'])) === json(['s:A', 's:B']));
  check('compareLines : une ligne en plus dans la version', json(lines(['A', 'C'], ['A', 'B', 'C'])) === json(['s:A', 'a:B', 's:C']));
  check('compareLines : une ligne que la version n\'a pas, remise à sa place', json(lines(['A', 'B', 'C'], ['A', 'C'])) === json(['s:A', 'r:B', 's:C']));
  check('compareLines : une ligne remplacée = la retirée puis l\'ajoutée', json(lines(['Page de garde : X'], ['Page de garde : Y'])) === json(['r:Page de garde : X', 'a:Page de garde : Y']));
  check('compareLines : des listes vides', json(lines([], [])) === '[]' && json(lines([], ['A'])) === json(['a:A']) && json(lines(['A'], [])) === json(['r:A']));
}

summarizeAndExit();
