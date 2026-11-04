#!/usr/bin/env node
// Tests purs (sans navigateur) de l'ancre d'un commentaire de PDF : extensions/lecture-pdf/pdf-anchor.js (consigne GFS 045, « Commenter un PDF dans ton mode Lecture ») - cf. dev-tests/unit-harness.mjs pour le
// contexte général. Les attendus sont ceux de la personne qui commente un PDF, le rouvre, puis le remplace par une nouvelle version :
//  1) le texte d'une page est le MÊME quand on écrit l'ancre et quand on la retrouve : une fin de ligne et une suite de blancs (espaces, insécables, fines) valent UNE espace, rien au début ni à la fin, et chaque signe dit
//     de quel morceau de la page il vient (c'est ce qui relie une sélection à la souris au texte) ;
//  2) une sélection se lit en positions dans ce texte : sans les espaces des deux bouts, avec 24 signes avant et après (moins au bord de la page), rien quand il n'y a que des blancs ;
//  3) le passage se retrouve là où il était ; sinon par sa citation (la bonne parmi plusieurs, grâce à son entourage) ; disparu, il n'est nulle part ;
//  4) dans tout le PDF : la page d'origine d'abord, puis les plus proches ; la recherche s'arrête dès qu'elle est sûre, ne bloque jamais le navigateur, s'arrête quand on le lui dit, saute une page illisible ;
//  5) sur des milliers de pages fabriquées au hasard (graine fixe) : les invariants tiennent, un point de la couche de texte retombe sur le bon signe, et un passage unique se retrouve après une insertion avant lui.
// Lancer : node dev-tests/unit-pdf-anchor.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'extensions/lecture-pdf/pdf-anchor.js';
const ctx = createContext({ setTimeout });
loadScript(ctx, SOURCE);
const call = (name, ...args) => { ctx.__ARGS = args; return evalIn(ctx, `PdfAnchor.${name}(...__ARGS)`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pageText = items => call('pageText', items);
const lineItems = lines => lines.map(str => ({ str, hasEOL: true }));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const show = value => (typeof value === 'string' ? JSON.stringify(value) : String(value));

check('le moteur ne touche à aucun élément de la page ni à la console (il ne connaît que les morceaux de texte de pdf.js)', !/\b(document|window|navigator|console)\b/.test(readFileSync(join(ROOT, SOURCE), 'utf8').replace(/\/\/.*$/gm, '')));
check('l\'entourage gardé est de 24 signes', evalIn(ctx, 'PdfAnchor.CONTEXT') === 24);

// 1. Le texte d'une page.
const LINES = ['Facture n° 2026-117', 'Client : Dupont SA', 'Garantie 12 mois sur tout le matériel', 'Total HT : 1 000 €', 'Total TTC : 1 200 €'];
const PAGE = lineItems(LINES);
const TEXT = LINES.join(' ');
check('une fin de ligne devient une espace, la dernière n\'en laisse aucune', pageText(PAGE).text === TEXT, pageText(PAGE).text);
check('sans fin de ligne, les morceaux se collent : « Bon » + « jour » = « Bonjour »', pageText([{ str: 'Bon' }, { str: 'jour' }]).text === 'Bonjour');
check('une espace au bout d\'un morceau, ou au début du suivant, garde les mots séparés', pageText([{ str: 'Bonjour ' }, { str: 'le monde' }]).text === 'Bonjour le monde' && pageText([{ str: 'Bonjour' }, { str: ' le monde' }]).text === 'Bonjour le monde');
check('une suite de blancs vaut UNE espace : espaces, insécable, fines (U+2009 et U+202F), espace de chiffre, tabulation, retour',
  pageText([{ str: 'Total :   1 250 €\t\nTTC  ok' }]).text === 'Total : 1 250 € TTC ok', pageText([{ str: 'Total :   1 250 €\t\nTTC  ok' }]).text);
check('une espace de bout de morceau suivie d\'une fin de ligne et d\'une espace n\'en fait qu\'une', pageText([{ str: 'a ', hasEOL: true }, { str: ' b' }]).text === 'a b');
check('rien au début ni à la fin : «   Bonjour \\n » devient « Bonjour »', pageText([{ str: '   Bonjour \n', hasEOL: true }]).text === 'Bonjour');
for (const [name, items] of [['une page vide', []], ['pas de liste (null)', null], ['pas de liste (rien)', undefined], ['un texte à la place de la liste', 'abc'], ['un objet à la place de la liste', {}], ['seulement des blancs', [{ str: '   ', hasEOL: true }, { str: '  ' }]], ['seulement des morceaux vides', [{ str: '', hasEOL: true }, { str: '' }]]]) {
  const source = pageText(items);
  check(`${name} : un texte vide, de longueur 0, et ni point ni ancre`, source.text === '' && source.length === 0 && call('pointOf', source, 0, 0) === null && call('anchorFromRange', 1, source, 0, 10) === null);
}
check('ce qui n\'est pas un morceau de texte est ignoré (null, nombre, texte, `str` qui n\'est pas un texte)', pageText([null, 3, 'x', { str: 4 }, { str: 'a' }, undefined]).text === 'a');

// 2. D'où vient chaque signe.
{
  const source = pageText(PAGE);
  const g = TEXT.indexOf('Garantie');
  check('la longueur du texte est dite', source.length === TEXT.length);
  check('le premier signe d\'un morceau vient de ce morceau, à la place 0', source.item(g) === 2 && source.offset(g) === 0 && source.item(0) === 0 && source.offset(0) === 0);
  check('l\'espace d\'une fin de ligne vient de la fin du morceau qui finit la ligne', source.item(g - 1) === 1 && source.offset(g - 1) === LINES[1].length);
  check('tout signe qui n\'est pas une espace est le même signe de son morceau', [...Array(source.length).keys()].every(k => source.text[k] === ' ' || LINES[source.item(k)][source.offset(k)] === source.text[k]));
}
{
  const source = pageText([{ str: 'a   b' }]);
  check('une suite d\'espaces réduite à une seule vient de la première : a   b -> « a b », l\'espace à la place 1, « b » à la place 4', source.text === 'a b' && source.item(1) === 0 && source.offset(1) === 1 && source.offset(2) === 4);
}
{
  const source = pageText([{ str: 'a ' }, { str: ' b' }]);
  check('une suite d\'espaces à cheval sur deux morceaux vient du premier', source.text === 'a b' && source.item(1) === 0 && source.offset(1) === 1 && source.item(2) === 1 && source.offset(2) === 1);
}
{
  const source = pageText([{ str: 'a ', hasEOL: true }, { str: 'b' }]);
  check('une fin de ligne après une espace n\'en ajoute pas : l\'espace est celle du morceau', source.text === 'a b' && source.item(1) === 0 && source.offset(1) === 1);
}
{
  // pdf.js : TextLayer.textDivs suit les morceaux qui ont un `str` (même vide) ; les repères de contenu balisé n'en ont pas et ne comptent pas.
  const source = pageText([{ str: 'a' }, { type: 'beginMarkedContent', id: 'p1' }, { str: '', hasEOL: true }, { str: 'b' }, { type: 'endMarkedContent' }]);
  check('les repères de contenu balisé ne comptent pas dans les numéros de morceaux, un morceau vide si : a, vide (fin de ligne), b = 0, 1, 2', source.text === 'a b' && source.item(0) === 0 && source.item(1) === 1 && source.offset(1) === 0 && source.item(2) === 2, JSON.stringify([source.text, source.item(0), source.item(1), source.item(2)]));
}
{
  const source = pageText([{ str: 'a😀b' }]);
  check('les places sont celles des unités UTF-16, comme celles d\'une sélection du navigateur : a😀b a 4 places', source.length === 4 && source.offset(1) === 1 && source.offset(2) === 2 && source.offset(3) === 3);
}

// 3. Le point de la couche de texte -> la place dans le texte.
{
  const source = pageText(PAGE);
  const g = TEXT.indexOf('Garantie');
  check('chaque signe se retrouve par sa provenance : le point (morceau, place) d\'un signe tombe sur lui', [...Array(source.length).keys()].every(k => call('pointOf', source, source.item(k), source.offset(k)) === k));
  check('le début de la page est la place 0', call('pointOf', source, 0, 0) === 0);
  check('le début d\'un morceau est la place de son premier signe', call('pointOf', source, 2, 0) === g);
  check('la fin d\'un morceau qui finit une ligne est la place de l\'espace de fin de ligne (la fin, exclue, du passage)', call('pointOf', source, 1, LINES[1].length) === g - 1);
  check('au-delà du dernier morceau : la longueur du texte ; avant le premier : 0', call('pointOf', source, 99, 0) === source.length && call('pointOf', source, -1, 0) === 0);
  const run = pageText([{ str: 'a   b' }]);
  check('au milieu d\'une suite d\'espaces réduite à une seule, le point tombe sur l\'espace ou juste après, jamais sur un signe perdu : 1 -> 1, 2 -> 2, 3 -> 2, 4 -> 2, 5 -> 3',
    [1, 2, 3, 4, 5].map(offset => call('pointOf', run, 0, offset)).join() === '1,2,2,2,3', [1, 2, 3, 4, 5].map(offset => call('pointOf', run, 0, offset)).join());
}

// 4. L'ancre d'une sélection.
const CITATION = 'Garantie 12 mois';
const SOURCE_PAGE = pageText(PAGE);
const AT = TEXT.indexOf(CITATION);
const ANCHOR = call('anchorFromRange', 3, SOURCE_PAGE, AT, AT + CITATION.length);
check('l\'ancre dit la page, les deux positions, la citation, et 24 signes avant et après', same(ANCHOR, { page: 3, debut: AT, fin: AT + CITATION.length, citation: CITATION, avant: TEXT.slice(AT - 24, AT), apres: TEXT.slice(AT + CITATION.length, AT + CITATION.length + 24) }), JSON.stringify(ANCHOR));
check('l\'entourage est de 24 signes de chaque côté dans le texte du milieu', ANCHOR.avant.length === 24 && ANCHOR.apres.length === 24);
check('les espaces des deux bouts de la sélection ne sont pas dans l\'ancre', same(call('anchorFromRange', 3, SOURCE_PAGE, AT - 1, AT + CITATION.length + 1), ANCHOR) && same(call('anchorFromRange', 3, SOURCE_PAGE, AT - 1, AT + CITATION.length + 1), ANCHOR));
{
  const first = call('anchorFromRange', 1, SOURCE_PAGE, 0, 7);
  check('au début de la page, rien avant : « Facture » avec un entourage vide devant', first.citation === 'Facture' && first.avant === '' && first.debut === 0 && first.apres === TEXT.slice(7, 31));
  const lastAt = TEXT.lastIndexOf('1 200 €');
  const last = call('anchorFromRange', 1, SOURCE_PAGE, lastAt, TEXT.length + 40);
  check('à la fin de la page, rien après, et la fin est ramenée à la page : « 1 200 € »', last.citation === '1 200 €' && last.apres === '' && last.fin === TEXT.length && last.avant === TEXT.slice(lastAt - 24, lastAt));
  const near = call('anchorFromRange', 1, SOURCE_PAGE, 20, 26);
  check('près du bord, l\'entourage est plus court (moins de 24 signes devant)', near.citation === 'Client' && near.avant === TEXT.slice(0, 20) && near.avant.length === 20);
  check('un début négatif est ramené à 0, des bornes décimales sont arrondies vers le bas', call('anchorFromRange', 1, SOURCE_PAGE, -50, 7).debut === 0 && call('anchorFromRange', 1, SOURCE_PAGE, 2.9, 7.2).debut === 2 && call('anchorFromRange', 1, SOURCE_PAGE, 2.9, 7.2).fin === 7);
}
for (const [name, start, end] of [['une sélection vide', AT, AT], ['une fin avant le début', AT + 5, AT], ['seulement l\'espace d\'une fin de ligne', AT - 1, AT], ['une sélection hors de la page', 5000, 6000], ['une borne qui n\'est pas un nombre', NaN, 10], ['une borne absente', 3, undefined]]) {
  check(`${name} : pas d\'ancre`, call('anchorFromRange', 1, SOURCE_PAGE, start, end) === null);
}

// 5. Retrouver le passage dans le texte d'une page.
const locate = (text, anchor) => call('locate', text, anchor);
check('rien n\'a changé : le passage est là où il était, avec tout son entourage (48 signes)', same(locate(TEXT, ANCHOR), { debut: AT, fin: AT + CITATION.length, score: 48 }), JSON.stringify(locate(TEXT, ANCHOR)));
{
  const moved = ['Devis valable 30 jours'].concat(LINES).join(' ');
  const found = locate(moved, ANCHOR);
  check('une ligne ajoutée avant : le passage est retrouvé par sa citation, à sa nouvelle place, entourage entier', found && found.debut === moved.indexOf(CITATION) && found.fin === found.debut + CITATION.length && found.score === 48, JSON.stringify(found));
  check('le passage a disparu : nulle part', locate(moved.replace(CITATION, 'Garantie de 24 mois'), ANCHOR) === null);
}
{
  const DUP = ['Devis 2026-004', 'Total : 1 250 €', 'Remise de fidélité 5 %', 'Total : 1 250 €', 'Merci de votre confiance'];
  const text = DUP.join(' ');
  const second = text.lastIndexOf('Total : 1 250 €');
  const anchor = call('anchorFromRange', 2, pageText(lineItems(DUP)), second, second + 'Total : 1 250 €'.length);
  const shifted = ['Page de garde', 'Conditions générales'].concat(DUP).join(' ');
  const found = locate(shifted, anchor);
  check('deux passages identiques : celui dont l\'entourage est resté le même (le second), pas le premier', found && found.debut === shifted.lastIndexOf('Total : 1 250 €') && found.score === anchor.avant.length + anchor.apres.length, JSON.stringify(found));
  const half = ['Page de garde'].concat(DUP).join(' ').replace('Merci de votre confiance', 'Bonne journée');
  const kept = locate(half, anchor);
  check('deux passages identiques, l\'entourage d\'après changé : le second garde l\'entourage de devant et l\'emporte', kept && kept.debut === half.lastIndexOf('Total : 1 250 €') && kept.score < anchor.avant.length + anchor.apres.length, JSON.stringify(kept));
  const bare = { citation: 'Total', debut: 50, avant: '', apres: '' };
  const tie = locate('x'.repeat(10) + 'Total' + 'y'.repeat(30) + 'Total' + 'y'.repeat(10) + 'Total' + 'z'.repeat(10), bare);
  check('à entourage égal, la place la plus proche de l\'ancienne (50) : « Total » en 45, pas en 10 ni en 60', tie && tie.debut === 45 && tie.score === 0, JSON.stringify(tie));
  const stays = locate('xx Total : 1 250 € yy' + text.slice(text.indexOf('Remise') - 1, second) + 'Total : 1 250 € Merci de votre confiance', { citation: 'Total : 1 250 €', debut: 3, avant: anchor.avant, apres: anchor.apres });
  check('la citation encore là où elle était l\'emporte, même si un autre endroit a un meilleur entourage', stays && stays.debut === 3 && stays.score < 5, JSON.stringify(stays));
}
for (const [name, anchor] of [['pas d\'ancre', null], ['une ancre vide', {}], ['une citation vide', { citation: '', debut: 0 }], ['une citation qui n\'est pas un texte', { citation: 5, debut: 0 }]]) {
  check(`${name} : rien n'est trouvé et rien ne casse`, locate(TEXT, anchor) === null);
}
check('un texte de page qui n\'est pas un texte : rien n\'est trouvé', locate(null, ANCHOR) === null && locate(5, ANCHOR) === null && locate(undefined, ANCHOR) === null);
for (const debut of [null, undefined, '', 'abc', -5, 3.5, 1e9, NaN]) {
  const found = locate(TEXT, Object.assign({}, ANCHOR, { debut }));
  check(`une place enregistrée ${show(debut)} : le passage se retrouve par sa citation`, found && found.debut === AT, JSON.stringify(found));
}
{
  const twice = 'Total : 1 250 € ' + 'x'.repeat(30) + ' Remise de fidélité 5 % Total : 1 250 € Merci de votre confiance';
  const second = twice.lastIndexOf('Total : 1 250 €');
  const stored = { citation: 'Total : 1 250 €', avant: twice.slice(second - 24, second), apres: twice.slice(second + 15, second + 15 + 24) };
  for (const debut of [null, undefined, '']) {
    const found = locate(twice, Object.assign({ debut }, stored));
    check(`une place enregistrée vide (${show(debut)}) n'est pas la place 0 : même avec la citation en 0, le passage est celui dont l'entourage convient`, found && found.debut === second, JSON.stringify(found));
  }
}
check('une place enregistrée en texte (« 39 », comme Grist peut la rendre) se lit comme un nombre', (() => { const found = locate(TEXT, Object.assign({}, ANCHOR, { debut: String(AT) })); return found && found.debut === AT && found.score === 48; })());

// 6. Retrouver le passage dans tout le PDF.
const FULL_TEXT = 'Total!';
const BASE = { page: 3, debut: 100, fin: 106, citation: FULL_TEXT, avant: 'abcdefgh', apres: 'ijklmnop' };   // un entourage entier vaut 16
const pageWith = (before, after) => [{ str: before + FULL_TEXT + after }];
const noise = n => [{ str: `Page ${n} : du texte sans rapport` }];
const buildPdf = (count, special) => Array.from({ length: count }, (_, k) => special[k + 1] || noise(k + 1));
function reader(pages, extra) {
  const calls = [];
  const textOf = (n) => { calls.push(n); if (extra && extra.onRead) extra.onRead(n, calls); if (extra && extra.fail && extra.fail.includes(n)) return Promise.reject(new Error('page illisible')); return Promise.resolve(pageText(pages[n - 1])); };
  return { calls, textOf };
}
// Une panne de la recherche (elle ne doit jamais en lever) est rendue comme un résultat, pour que la vérification qui l'attend échoue au lieu d'arrêter toute la suite.
const relocate = async (anchor, count, textOf, options) => { try { ctx.__RELOC = [anchor, count, textOf, options]; return await evalIn(ctx, 'PdfAnchor.relocate(...__RELOC)'); } catch (error) { return { panne: String(error && error.message) }; } };

{
  const { calls, textOf } = reader(buildPdf(7, { 3: pageWith('abcdefgh', 'ijklmnop') }));
  const found = await relocate(BASE, 7, textOf);
  check('rien n\'a changé : page 3, une seule page lue', found && found.page === 3 && calls.join() === '3', JSON.stringify([found, calls]));
  check('le résultat ne dit que la page, le début et la fin', same(Object.keys(found), ['page', 'debut', 'fin']) && found.fin - found.debut === FULL_TEXT.length);
}
{
  const { calls, textOf } = reader(buildPdf(7, { 4: pageWith('abcdefgh', 'ijklmnop') }));
  const found = await relocate(BASE, 7, textOf);
  check('passé à la page suivante avec tout son entourage : lues 3, 2 puis 4, et la recherche s\'arrête', found && found.page === 4 && calls.join() === '3,2,4', JSON.stringify([found, calls]));
}
{
  const { calls, textOf } = reader(buildPdf(7, {}));
  const found = await relocate(BASE, 7, textOf);
  check('introuvable : null, et les pages sont lues de la plus proche à la plus lointaine : 3, 2, 4, 1, 5, 6, 7', found === null && calls.join() === '3,2,4,1,5,6,7', JSON.stringify([found, calls]));
}
{
  const { calls, textOf } = reader(buildPdf(7, { 3: pageWith('zzzzzzzz', 'zzzzzzzz'), 4: pageWith('abcdefgh', 'ijklmnop') }));
  const found = await relocate(BASE, 7, textOf);
  check('sur la page d\'origine, la citation suffit même à moitié reconnue : le passage reste page 3, rien d\'autre n\'est lu', found && found.page === 3 && calls.join() === '3', JSON.stringify([found, calls]));
}
{
  const special = { 2: pageWith('xxxxxxgh', 'ixxxxxxx'), 4: pageWith('xxxxxfgh', 'ijkxxxxx'), 6: pageWith('xxxdefgh', 'ijklxxxx') };
  const { calls, textOf } = reader(buildPdf(7, special));
  const found = await relocate(BASE, 7, textOf);
  check('ailleurs qu\'à la page d\'origine, un entourage à moitié reconnu ne suffit pas : toutes les pages sont lues, la meilleure gagne (page 6)', found && found.page === 6 && calls.length === 7, JSON.stringify([found, calls]));
}
{
  const special = { 2: pageWith('xxxxxxgh', 'ixxxxxxx'), 4: pageWith('xxxxxxgh', 'ixxxxxxx') };
  const { textOf } = reader(buildPdf(7, special));
  const found = await relocate(BASE, 7, textOf);
  check('à entourage égal, la page la plus proche de l\'ancienne, la première lue (page 2 avant page 4)', found && found.page === 2, JSON.stringify(found));
}
{
  // Le PDF remplacé est plus court : la page 10 n'existe plus, la recherche part de la dernière (4) sans la prendre pour la page d'origine.
  const anchor = Object.assign({}, BASE, { page: 10 });
  let reading = reader(buildPdf(4, { 4: pageWith('xxxxxxgh', 'ixxxxxxx'), 2: pageWith('abcdefgh', 'ijklmnxx') }));
  let found = await relocate(anchor, 4, reading.textOf);
  check('PDF raccourci : la recherche part de la dernière page (4, 3, 2, 1) et une page 4 à moitié reconnue ne l\'arrête pas : page 2', found && found.page === 2 && reading.calls.join() === '4,3,2,1', JSON.stringify([found, reading.calls]));
  reading = reader(buildPdf(4, { 4: pageWith('abcdefgh', 'ijklmnop') }));
  found = await relocate(anchor, 4, reading.textOf);
  check('PDF raccourci : avec tout son entourage sur la dernière page, la recherche s\'arrête là', found && found.page === 4 && reading.calls.join() === '4', JSON.stringify([found, reading.calls]));
  for (const page of [0, -3, undefined, null, 'x', NaN]) {
    reading = reader(buildPdf(4, { 1: pageWith('xxxxxxgh', 'ixxxxxxx'), 3: pageWith('abcdefgh', 'ijklmnxx') }));
    found = await relocate(Object.assign({}, BASE, { page }), 4, reading.textOf);
    check(`page enregistrée ${show(page)} : la recherche part de la page 1 sans la prendre pour la page d'origine (page 3 gagne)`, found && found.page === 3 && reading.calls.join() === '1,2,3,4', JSON.stringify([found, reading.calls]));
  }
  reading = reader(buildPdf(5, { 3: pageWith('abcdefgh', 'ijklmnop') }));
  found = await relocate(Object.assign({}, BASE, { page: '3' }), '5', reading.textOf);
  check('une page et un nombre de pages en texte (« 3 », « 5 ») se lisent comme des nombres', found && found.page === 3 && reading.calls.join() === '3', JSON.stringify([found, reading.calls]));
}
{
  const reading = reader(buildPdf(7, { 4: pageWith('abcdefgh', 'ijklmnop') }), { fail: [2] });
  const found = await relocate(BASE, 7, reading.textOf);
  check('une page illisible est sautée, la recherche continue : page 4', found && found.page === 4 && reading.calls.join() === '3,2,4', JSON.stringify([found, reading.calls]));
  let count = 0;
  const odd = n => { count++; if (n === 3) throw new Error('lecture impossible'); if (n === 2) return Promise.resolve(null); if (n === 4) return Promise.resolve({}); if (n === 1) return Promise.resolve({ text: '' }); return Promise.resolve(pageText(pageWith('abcdefgh', 'ijklmnop'))); };
  const oddFound = await relocate(BASE, 7, odd);
  check('une page qui lève une erreur, rend rien, un objet sans texte ou un texte vide est sautée : page 5', oddFound && oddFound.page === 5 && count === 5, JSON.stringify([oddFound, count]));
}
{
  let cancelled = false;
  const reading = reader(buildPdf(7, {}), { onRead: (n, calls) => { if (calls.length === 2) cancelled = true; } });
  const found = await relocate(BASE, 7, reading.textOf, { cancelled: () => cancelled });
  await sleep(30);
  check('la recherche s\'arrête quand on le lui dit : null, et plus aucune page lue ensuite', found === null && reading.calls.join() === '3,2', JSON.stringify([found, reading.calls]));
  const never = reader(buildPdf(7, {}));
  const direct = await relocate(BASE, 7, never.textOf, { cancelled: () => true });
  check('déjà annulée avant de commencer : aucune page lue', direct === null && never.calls.length === 0);
  // Annulée pendant la lecture de la page qui a justement le passage : la personne a déjà changé de PDF, rien n'est rendu.
  let stop = false;
  const late = reader(buildPdf(7, { 2: pageWith('abcdefgh', 'ijklmnop') }), { onRead: (n) => { if (n === 2) stop = true; } });
  const lateFound = await relocate(BASE, 7, late.textOf, { cancelled: () => stop });
  check('annulée pendant la lecture de la page qui a le passage, la recherche ne rend rien', lateFound === null && late.calls.join() === '3,2', JSON.stringify([lateFound, late.calls]));
}
{
  const never = reader(buildPdf(3, {}));
  let all = true;
  for (const [anchor, count] of [[BASE, 0], [BASE, NaN], [BASE, undefined], [BASE, -3], [BASE, 0.5], [null, 3], [{}, 3], [{ citation: '' }, 3], [{ citation: 4 }, 3]]) {
    if (await relocate(anchor, count, never.textOf) !== null) all = false;
  }
  check('un nombre de pages nul, absent ou négatif, pas d\'ancre, pas de citation : null', all);
  check('... et aucune page n\'est lue pour rien', never.calls.length === 0);
  check('sans fonction pour lire les pages : null', await relocate(BASE, 3, undefined) === null && await relocate(BASE, 3, 'x') === null);
  const decimal = reader(buildPdf(7, {}));
  await relocate(BASE, 5.7, decimal.textOf);
  check('un nombre de pages décimal est arrondi vers le bas : 5,7 pages = 5 pages lues', decimal.calls.join() === '3,2,4,1,5', decimal.calls.join());
}
{
  // La recherche rend la main au navigateur entre deux pages : un minuteur posé avant elle se déclenche avant la fin, sur un PDF de quarante pages sans le passage.
  let timerFired = false;
  setTimeout(() => { timerFired = true; }, 0);
  const seen = [];
  const reading = reader(buildPdf(40, {}), { onRead: () => seen.push(timerFired) });
  const found = await relocate(BASE, 40, reading.textOf);
  check('la lecture n\'est jamais bloquée : le navigateur reprend la main entre deux pages (un minuteur posé avant a tourné dès la 2e page lue)', found === null && reading.calls.length === 40 && seen[0] === false && seen[1] === true && seen.slice(1).every(Boolean), JSON.stringify(seen.slice(0, 6)));
}

// 7. Des milliers de pages fabriquées au hasard.
{
  let seed = 20261104;
  const next = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = list => list[Math.floor(next() * list.length)];
  const WORDS = ['Facture', 'Devis', 'n°', '2026-117', 'Total', 'Garantie', '12', 'mois', 'matériel', '€', ':', 'Dupont', 'SA', '😀', 'élément', 'à'];
  const BLANKS = [' ', '  ', ' ', ' ', ' ', '\t', '\n', '   ', ' '];
  const randomItems = () => {
    const items = [];
    for (let i = 0, count = 1 + Math.floor(next() * 14); i < count; i++) {
      const roll = next();
      if (roll < 0.08) { items.push({ type: 'beginMarkedContent', id: 'm' + i }); continue; }
      if (roll < 0.14) { items.push({ str: '', hasEOL: next() < 0.7 }); continue; }
      let str = '';
      for (let w = 0, words = Math.floor(next() * 4); w < words; w++) str += (next() < 0.5 ? pick(BLANKS) : '') + pick(WORDS) + (next() < 0.3 ? pick(BLANKS) : '');
      items.push({ str, hasEOL: next() < 0.4 });
    }
    return items;
  };
  const bad = { text: [], letters: [], origin: [], steps: [], point: [], scan: [], anchor: [], same: [], shifted: [] };
  const note = (kind, items, extra) => { if (bad[kind].length < 2) bad[kind].push(JSON.stringify(items) + (extra === undefined ? '' : ' -> ' + extra)); };
  let pages = 0;
  let withText = 0;
  let anchors = 0;
  let shifts = 0;
  for (let round = 0; round < 3000; round++) {
    const items = randomItems();
    const strs = items.filter(entry => typeof entry.str === 'string');
    const source = pageText(items);
    const text = source.text;
    pages++;
    if (/\s{2}/.test(text) || text !== text.trim() || /[^\S ]/.test(text)) note('text', items, JSON.stringify(text));
    if (text.replace(/ /g, '') !== strs.map(entry => entry.str).join('').replace(/\s/g, '')) note('letters', items, JSON.stringify(text));
    if (source.length !== text.length) note('text', items, 'length');
    let previous = null;
    for (let k = 0; k < text.length; k++) {
      const rank = source.item(k);
      const place = source.offset(k);
      const owner = strs[rank];
      const fine = owner !== undefined && (text[k] === ' '
        ? ((place < owner.str.length && /\s/.test(owner.str[place])) || (place === owner.str.length && owner.hasEOL === true))
        : owner.str[place] === text[k]);
      if (!fine) { note('origin', items, `${k} ${JSON.stringify(text[k])} <- ${rank}/${place}`); break; }
      if (previous && !(rank > previous[0] || (rank === previous[0] && place > previous[1]))) { note('steps', items, `${k}`); break; }
      previous = [rank, place];
      if (call('pointOf', source, rank, place) !== k) { note('point', items, `${k}`); break; }
    }
    if (!text.length) continue;
    withText++;
    for (let probe = 0; probe < 6; probe++) {
      const rank = Math.floor(next() * (strs.length + 3)) - 1;
      const place = Math.floor(next() * 14);
      let linear = text.length;
      for (let k = 0; k < text.length; k++) {
        if (!(source.item(k) < rank || (source.item(k) === rank && source.offset(k) < place))) { linear = k; break; }
      }
      if (call('pointOf', source, rank, place) !== linear) { note('scan', items, `${rank}/${place}`); break; }
    }
    for (let probe = 0; probe < 4; probe++) {
      const start = Math.floor(next() * (text.length + 6)) - 3;
      const end = start + Math.floor(next() * (text.length + 3));
      const anchor = call('anchorFromRange', 1 + Math.floor(next() * 5), source, start, end);
      const lo = Math.max(0, start);
      const hi = Math.max(0, Math.min(text.length, end));
      if (anchor === null) {
        if (text.slice(lo, hi).trim() !== '') note('anchor', items, `${start}..${end} devrait donner une ancre`);
        continue;
      }
      anchors++;
      const okAnchor = anchor.citation === text.slice(anchor.debut, anchor.fin) && anchor.citation === anchor.citation.trim() && anchor.debut >= lo && anchor.fin <= hi
        && anchor.avant === text.slice(Math.max(0, anchor.debut - 24), anchor.debut) && anchor.apres === text.slice(anchor.fin, anchor.fin + 24)
        && text.slice(lo, anchor.debut).trim() === '' && text.slice(anchor.fin, hi).trim() === '';
      if (!okAnchor) { note('anchor', items, JSON.stringify(anchor)); continue; }
      const back = locate(text, anchor);
      if (!back || back.debut !== anchor.debut || back.fin !== anchor.fin || back.score !== anchor.avant.length + anchor.apres.length) note('same', items, JSON.stringify([anchor, back]));
      const once = text.indexOf(anchor.citation) === anchor.debut && text.indexOf(anchor.citation, anchor.debut + 1) === -1;
      const junk = 'qwxyz '.repeat(1 + Math.floor(next() * 5)).slice(0, 1 + Math.floor(next() * 25));
      const shifted = junk + text;
      if (once && shifted.split(anchor.citation).length === 2) {
        shifts++;
        const moved = locate(shifted, anchor);
        if (!moved || moved.debut !== anchor.debut + junk.length || moved.fin !== anchor.fin + junk.length) note('shifted', items, JSON.stringify([anchor, junk, moved]));
      }
    }
  }
  check(`${pages} pages au hasard (${withText} avec du texte) : jamais deux blancs de suite, ni blanc au bord, ni autre blanc qu'une espace`, bad.text.length === 0, bad.text.join(' | '));
  check('... les signes qui ne sont pas des blancs sont exactement ceux des morceaux, dans l\'ordre', bad.letters.length === 0, bad.letters.join(' | '));
  check('... chaque signe vient d\'un morceau de la page, du même signe ou d\'un blanc (ou d\'une fin de ligne)', bad.origin.length === 0, bad.origin.join(' | '));
  check('... la provenance avance toujours : jamais deux signes à la même place', bad.steps.length === 0, bad.steps.join(' | '));
  check('... le point de la couche de texte de chaque signe retombe sur lui', bad.point.length === 0, bad.point.join(' | '));
  check('... la recherche par moitiés donne la même place qu\'un balayage, y compris pour des morceaux hors de la page', bad.scan.length === 0, bad.scan.join(' | '));
  check(`... ${anchors} ancres tirées de sélections au hasard : citation = le texte entre les bornes, sans blanc aux bords, entourage de 24, bornes ramenées dans la page ; pas d'ancre seulement quand il n'y a que des blancs`, anchors > 3000 && bad.anchor.length === 0, bad.anchor.join(' | '));
  check('... chaque ancre se retrouve là où elle est, avec tout son entourage', bad.same.length === 0, bad.same.join(' | '));
  check(`... ${shifts} passages uniques se retrouvent à leur nouvelle place après une insertion avant eux`, shifts > 1000 && bad.shifted.length === 0, bad.shifted.join(' | '));
}

summarizeAndExit();
