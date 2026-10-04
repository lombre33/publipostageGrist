#!/usr/bin/env node
// Tests purs (sans navigateur) de js/formula.js, le moteur des bulles « Calcul » (variables calculées, demande d'Antoine du 2026-10-01) - cf. dev-tests/unit-harness.mjs.
// Lancer : node dev-tests/unit-formula.mjs
import { readFileSync } from 'node:fs';
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const ctx = createContext({});
loadScript(ctx, 'js/formula.js');

// Évalue un calcul enregistré sur `values` ; retourne { value } ou { error: code } (l'erreur réduite à son code, plus lisible dans un test).
function run(stored, values) {
  ctx.__STORED = stored;
  ctx.__VALUES = values || {};
  const out = JSON.parse(evalIn(ctx, `(() => {
    const parsed = Formula.parse(__STORED);
    if (parsed.error) return JSON.stringify({ error: parsed.error });
    const result = Formula.evaluate(parsed.ast, __VALUES);
    return JSON.stringify(result);
  })()`));
  return out.error ? { error: out.error.code, detail: out.error } : { value: out.value };
}
const value = (stored, values) => { const r = run(stored, values); return r.error ? 'ERR:' + r.error : r.value; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1. Les quatre opérations, priorités, parenthèses, signe, pourcentage.
check('1 + 2 * 3 = 7 (la multiplication passe avant)', value('1+2*3') === 7, value('1+2*3'));
check('(1 + 2) * 3 = 9', value('(1+2)*3') === 9);
check('10 - 4 - 3 = 3 (de gauche à droite)', value('10-4-3') === 3);
check('100 / 5 / 2 = 10', value('100/5/2') === 10);
check('10 / 4 = 2,5', value('10/4') === 2.5);
check('signe : -2 * 3 = -6, 2 * -3 = -6, 5 - -2 = 7, +4 = 4', value('-2*3') === -6 && value('2*-3') === -6 && value('5--2') === 7 && value('+4') === 4);
check('pourcentage : 20% = 0,2 ; 200 * 20% = 40 ; 100 + 20% = 100,2', value('20%') === 0.2 && value('200*20%') === 40 && value('100+20%') === 100.2);
check('espaces et sauts de ligne ignorés', value(' 1 +\n 2  * 3 ') === 7);
check('0,1 + 0,2 = 0,3 (pas de bruit de virgule flottante)', value('0.1+0.2') === 0.3, value('0.1+0.2'));
check('1.1 + 2.2 = 3.3', value('1.1+2.2') === 3.3);
check('un résultat nul s\'écrit 0, jamais -0', Object.is(value('0*-5'), 0) && Object.is(value('-0'), 0));
check('décimale sans partie entière : .5 + .25 = 0,75', value('.5+.25') === 0.75);

// 2. Variables.
check('deux variables : {Facture.SousTotal} + {Facture.TVA}', value('{Facture.SousTotal}+{Facture.TVA}', { 'Facture.SousTotal': 100, 'Facture.TVA': 20 }) === 120);
check('une variable de chemin (Projet.Accompagnateur.Taux) est une clé comme une autre', value('{Projet.Accompagnateur.Taux}*2', { 'Projet.Accompagnateur.Taux': 4 }) === 8);
check('la TVA : {HT} * 20% + {HT}', value('{F.HT}*20%+{F.HT}', { 'F.HT': 50 }) === 60);
check('une cellule vide compte pour 0 dans une opération', value('{F.A}+{F.B}', { 'F.A': 5, 'F.B': null }) === 5 && value('{F.A}*{F.B}', { 'F.A': 5, 'F.B': null }) === 0);
check('une variable vide seule ne montre rien (null), pas 0', same(run('{F.A}', { 'F.A': null }), { value: null }));
check('deux variables vides : 0 (l\'écriture du zéro est réglée par la bulle)', value('{F.A}+{F.B}', { 'F.A': null, 'F.B': null }) === 0);
check('variable absente de la lecture : erreur unknownVariable', run('{F.A}+1', {}).error === 'unknownVariable');
check('variable en erreur : le message de la lecture est repris tel quel', (() => { const r = run('{F.A}+1', { 'F.A': { error: '[ERREUR: ligne introuvable dans F]' } }); return r.error === 'variable' && r.detail.message === '[ERREUR: ligne introuvable dans F]'; })());

// 3. Division par zéro et résultats impossibles.
check('division par zéro : erreur divZero', run('1/0').error === 'divZero' && run('{A.B}/{A.C}', { 'A.B': 1, 'A.C': 0 }).error === 'divZero');
check('division par une cellule vide : divZero aussi', run('1/{A.B}', { 'A.B': null }).error === 'divZero');
check('résultat trop grand pour un nombre : erreur badResult', run('{A.B}*{A.B}', { 'A.B': 1e200 }).error === 'badResult');

// 4. Fonctions sur des nombres et sur des listes.
check('SUM de nombres : SUM(1;2;3) = 6', value('SUM(1;2;3)') === 6);
check('SUM d\'une liste : SUM({L.Montant}) = 60', value('SUM({L.Montant})', { 'L.Montant': [10, 20, 30] }) === 60);
check('SUM ignore les cellules vides et accepte liste + nombre : SUM({L.M};5)', value('SUM({L.M};5)', { 'L.M': [10, null, 30] }) === 45);
check('SUM d\'une liste vide (aucune ligne liée) = 0', value('SUM({L.M})', { 'L.M': [] }) === 0);
check('AVERAGE ignore les cellules vides : (10 + 30) / 2 = 20', value('AVERAGE({L.M})', { 'L.M': [10, null, 30] }) === 20);
check('AVERAGE de rien : null', same(run('AVERAGE({L.M})', { 'L.M': [] }), { value: null }) && same(run('AVERAGE({L.M})', { 'L.M': [null] }), { value: null }));
check('MIN et MAX d\'une liste et d\'un nombre', value('MIN({L.M};1)', { 'L.M': [10, 20] }) === 1 && value('MAX({L.M};1)', { 'L.M': [10, 20] }) === 20);
check('MIN de rien : null', same(run('MIN({L.M})', { 'L.M': [] }), { value: null }));
check('COUNT compte les cellules non vides : 2', value('COUNT({L.M})', { 'L.M': [10, null, 30] }) === 2);
check('COUNT d\'une liste vide = 0', value('COUNT({L.M})', { 'L.M': [] }) === 0);
check('ROUND(1,005 ; 2) = 1,01 (décalage de l\'écriture, pas de n * 100)', value('ROUND(1.005;2)') === 1.01, value('ROUND(1.005;2)'));
check('ROUND : la moitié s\'éloigne de zéro (2,5 -> 3 ; -2,5 -> -3 ; 2,675 à 2 décimales -> 2,68)', value('ROUND(2.5)') === 3 && value('ROUND(-2.5)') === -3 && value('ROUND(2.675;2)') === 2.68);
check('ROUND sans second argument = entier le plus proche ; décimales négatives : ROUND(1234;-2) = 1200', value('ROUND(7.4)') === 7 && value('ROUND(1234;-2)') === 1200);
check('ROUND(x;n) refuse n non entier, trop grand ou en liste : badRound', run('ROUND(1;1.5)').error === 'badRound' && run('ROUND(1;11)').error === 'badRound' && run('ROUND(1;{L.M})', { 'L.M': [1, 2] }).error === 'badRound');
check('ROUND sur chaque ligne d\'une liste, puis SUM : 1,26 + 2,35 = 3,61', value('SUM(ROUND({L.M};2))', { 'L.M': [1.255, 2.345] }) === 3.61, value('SUM(ROUND({L.M};2))', { 'L.M': [1.255, 2.345] }));
check('noms de fonction en minuscules acceptés à la lecture enregistrée (sum, round)', value('sum(1;2)') === 3 && value('round(1.4)') === 1);

// 5. Listes : opérations ligne à ligne.
check('total de lignes : SUM({L.PU} * {L.Qte}) = 10*2 + 5*3 = 35', value('SUM({L.PU}*{L.Qte})', { 'L.PU': [10, 5], 'L.Qte': [2, 3] }) === 35);
check('un nombre seul vaut pour chaque ligne : SUM({L.PU} * 2) = 30', value('SUM({L.PU}*2)', { 'L.PU': [10, 5] }) === 30);
check('une variable seule avec une liste : SUM({L.PU} + {F.Port}) = (10+4) + (5+4)', value('SUM({L.PU}+{F.Port})', { 'L.PU': [10, 5], 'F.Port': 4 }) === 23);
check('deux listes de longueurs différentes : lengthMismatch', run('SUM({L.PU}*{M.Qte})', { 'L.PU': [10, 5], 'M.Qte': [1, 2, 3] }).error === 'lengthMismatch');
check('une cellule vide dans une liste vaut 0 dans le produit : SUM(10*2 + 5*0)', value('SUM({L.PU}*{L.Qte})', { 'L.PU': [10, 5], 'L.Qte': [2, null] }) === 20);
check('le total d\'une facture avec TVA : SUM(...) * 120%', value('SUM({L.PU}*{L.Qte})*(1+20%)', { 'L.PU': [10, 5], 'L.Qte': [2, 3] }) === 42);
check('liste de plusieurs lignes hors fonction : manyValues', run('{L.PU}*2', { 'L.PU': [10, 5] }).error === 'manyValues' && run('{L.PU}*2', { 'L.PU': [10, 5] }).detail.count === 2);
check('liste d\'une seule ligne hors fonction : son nombre', value('{L.PU}*2', { 'L.PU': [10] }) === 20);
check('liste vide hors fonction : rien à montrer (null)', same(run('{L.PU}*2', { 'L.PU': [] }), { value: null }));
check('moins devant une liste : SUM(-{L.PU}) = -15', value('SUM(-{L.PU})', { 'L.PU': [10, 5] }) === -15);
check('pourcentage d\'une liste : SUM({L.PU}%) = 0,15', value('SUM({L.PU}%)', { 'L.PU': [10, 5] }) === 0.15);

// 6. Fautes de syntaxe : le code dit laquelle.
check('texte vide : empty', run('').error === 'empty' && run('   ').error === 'empty');
check('opérateur sans valeur : 1 + -> unexpectedEnd', run('1+').error === 'unexpectedEnd');
check('deux opérateurs : 1 * / 2 -> unexpected', run('1*/2').error === 'unexpected' && run('1*/2').detail.token === '/');
check('deux valeurs de suite : 1 2 -> unexpected', run('1 2').error === 'unexpected');
check('parenthèse non fermée : (1+2 -> unclosedParen', run('(1+2').error === 'unclosedParen');
check('parenthèse fermante en trop : 1+2) -> unexpected', run('1+2)').error === 'unexpected');
check('parenthèses vides : () -> unexpected', run('()').error === 'unexpected');
check('mot seul : abc -> unknownName', run('abc').error === 'unknownName' && run('abc').detail.name === 'abc');
check('fonction inconnue : FOO(1) -> unknownFunction', run('FOO(1)').error === 'unknownFunction' && run('FOO(1)').detail.name === 'FOO');
check('fonction sans valeur : SUM() -> badArgs', run('SUM()').error === 'badArgs');
check('ROUND(1;2;3) : badArgs, ROUND() : badArgs', run('ROUND(1;2;3)').error === 'badArgs' && run('ROUND()').error === 'badArgs');
check('fonction non fermée : SUM(1;2 -> unclosedParen', run('SUM(1;2').error === 'unclosedParen');
check('virgule entre deux valeurs d\'une fonction : SUM(1,2 ...) lu comme décimale à la saisie, mais « {A.B},{A.C} » -> comma', run('SUM({A.B},{A.C})').error === 'comma');
check('caractère étranger : 1 $ 2 -> badChar', run('1$2').error === 'badChar' && run('1$2').detail.char === '$');
check('accolade non fermée : {A.B -> unclosedBrace', run('{A.B+1').error === 'unclosedBrace');
check('clé de variable invalide : {Facture} (sans colonne) et {A. B} -> badKey', run('{Facture}').error === 'badKey' && run('{1A.B}').error === 'badKey');
check('imbrication trop profonde : tooDeep (50 parenthèses)', run('('.repeat(50) + '1' + ')'.repeat(50)).error === 'tooDeep');
check('imbrication raisonnable : 20 parenthèses', value('('.repeat(20) + '1' + ')'.repeat(20)) === 1);
check('parenthèse refermée trop tard ou au mauvais endroit : (1+2 3) et SUM(1;2 3) citent le « 3 » ; (1+2 et SUM(1;2 restent non fermées', run('(1+2 3)').error === 'unexpected' && run('(1+2 3)').detail.token === '3' && run('SUM(1;2 3)').error === 'unexpected' && run('SUM(1;2 3)').detail.token === '3' && run('(1+2').error === 'unclosedParen' && run('SUM(1;2').error === 'unclosedParen');
check('« inattendu » cite le jeton comme il s\'écrit : un nombre, une variable {…}, un mot, un opérateur, avec sa place', (() => {
  const at = stored => run(stored).detail;
  return at('1 2').token === '2' && at('1 2').pos === 2 && at('1 {A.B}').token === '{A.B}' && at('1 {A.B}').pos === 2 && at('1 abc').token === 'abc' && at('1 abc').pos === 2 && at('1*/2').token === '/' && at('1*/2').pos === 2 && at('SUM(1;;2)').token === ';';
})(), JSON.stringify(run('1 abc')));
check('mot seul dans une fonction ou après un opérateur : SUM(abc) et 1+abc -> unknownName avec sa place', run('SUM(abc)').error === 'unknownName' && run('SUM(abc)').detail.pos === 4 && run('1+abc').error === 'unknownName' && run('1+abc').detail.pos === 2);
check('fonctions emboîtées et variées : ROUND(AVERAGE(1;2;4) ; 1) = 2,3 ; MAX(MIN(5;3);(2+1)) = 3 ; SUM(1;(2);ROUND(2.5))', value('ROUND(AVERAGE(1;2;4);1)') === 2.3 && value('MAX(MIN(5;3);(2+1))') === 3 && value('SUM(1;(2);ROUND(2.5))') === 6);
check('aucune injection : un texte de code n\'est jamais exécuté (badChar / unknownName)', run('alert(1)').error === 'unknownFunction' && run('1;alert(1)').error === 'unexpected' && run('constructor').error === 'unknownName');

// 7. toNumber : ce qu'une cellule peut valoir.
function toNumber(raw) { ctx.__RAW = raw; return JSON.parse(evalIn(ctx, 'JSON.stringify(Formula.toNumber(__RAW))')); }
check('toNumber : nombre, vide, null', toNumber(12.5).value === 12.5 && toNumber(null).value === null && toNumber('').value === null && toNumber(undefined).value === null);
check('toNumber : texte nombre simple (« 12,5 », « 1 234,56 », « -3 », « −3 », « 4. »)', toNumber('12,5').value === 12.5 && toNumber('1 234,56').value === 1234.56 && toNumber('-3').value === -3 && toNumber('−3').value === -3 && toNumber('4.').value === 4);
check('toNumber : texte espaces seuls = vide', toNumber('    ').value === null);
check('toNumber : booléen 1 / 0', toNumber(true).value === 1 && toNumber(false).value === 0);
check('toNumber : « 12 EUR », « 1.234,56 », « abc », objet, NaN, Infinity -> notNumber avec le texte', toNumber('12 EUR').error.code === 'notNumber' && toNumber('12 EUR').error.text === '12 EUR' && toNumber('1.234,56').error.code === 'notNumber' && toNumber('abc').error.code === 'notNumber' && toNumber({ id: 3 }).error.code === 'notNumber' && toNumber(NaN).error.code === 'notNumber' && toNumber(Infinity).error.code === 'notNumber');

// 8. variablesOf : chaque variable une fois, dans l'ordre.
function variablesOf(stored) { ctx.__STORED = stored; return JSON.parse(evalIn(ctx, 'JSON.stringify(Formula.variablesOf(Formula.parse(__STORED).ast))')); }
check('variablesOf : deux variables, une répétée', same(variablesOf('{F.A}+{F.B}*{F.A}').map(v => v.key), ['F.A', 'F.B']));
check('variablesOf : table, colonne simple et chemin', (() => { const v = variablesOf('{F.A}+{Projet.Accompagnateur.Email}'); return v[0].table === 'F' && v[0].column === 'A' && v[1].table === 'Projet' && v[1].column === 'Accompagnateur.Email'; })());
check('variablesOf : dans les fonctions, parenthèses, signe, pourcentage', same(variablesOf('SUM(-({L.A}%);{M.B})').map(v => v.key), ['L.A', 'M.B']));
check('variablesOf : aucune variable', variablesOf('1+2').length === 0);

// 9. De la saisie à l'écriture enregistrée, et retour.
function fromDisplay(text, spans, lang) { ctx.__TEXT = text; ctx.__SPANS = spans || []; ctx.__LANG = lang; return evalIn(ctx, 'Formula.fromDisplay(__TEXT, __SPANS, { lang: __LANG })'); }
function toDisplay(stored, opts) { ctx.__STORED = stored; ctx.__OPTS = opts || {}; return evalIn(ctx, 'Formula.toDisplay(__STORED, __OPTS)'); }
const span = (text, key) => { const start = text.indexOf('#' + key); const dot = key.indexOf('.'); return { start, end: start + 1 + key.length, table: key.slice(0, dot), column: key.slice(dot + 1) }; };
{
  const text = '#Facture.HT × 0,2 + somme(#Lignes.Prix ; 10)';
  const stored = fromDisplay(text, [span(text, 'Facture.HT'), span(text, 'Lignes.Prix')]);
  check('saisie FR -> enregistré : variables entre accolades, × -> *, 0,2 -> 0.2, somme -> SUM', stored === '{Facture.HT} * 0.2 + SUM({Lignes.Prix} ; 10)', stored);
  check('le calcul enregistré se lit et s\'évalue', value(stored, { 'Facture.HT': 100, 'Lignes.Prix': [1, 2, 3] }) === 36);
}
{
  const text = '#A.B ÷ 4 − 1,5 + moyenne(#A.C;2)';
  const stored = fromDisplay(text, [span(text, 'A.B'), span(text, 'A.C')]);
  check('÷ -> /, − -> -, moyenne -> AVERAGE', stored === '{A.B} / 4 - 1.5 + AVERAGE({A.C};2)', stored);
}
check('saisie : « ,5 » en tête de nombre devient .5 ; « 1,5,3 » garde sa virgule en trop', fromDisplay(',5+1') === '.5+1' && fromDisplay('1,5,3') === '1.5,3');
check('saisie : la touche de déclenchement ne change rien à l\'écriture enregistrée (variables posées par leurs positions)', (() => { const text = '§A.B+1'; return fromDisplay(text, [{ start: 0, end: 4, table: 'A', column: 'B' }]) === '{A.B}+1'; })());
check('saisie : une faute n\'est pas corrigée mais parse() la nomme (virgule entre deux valeurs, mot inconnu)', run(fromDisplay('somme(2 ,3)')).error === 'comma' && run(fromDisplay('somme(2 ; foo)')).error === 'unknownName' && run(fromDisplay('sommme(2)')).error === 'unknownFunction');
check('saisie EN : la virgule n\'est pas une décimale (« 1,000 » n\'est pas lu 1.000) : le moteur la refuse', fromDisplay('1,000 + 2', [], 'en') === '1,000 + 2' && run(fromDisplay('1,000 + 2', [], 'en')).error === 'comma' && fromDisplay('1,5', [], 'fr') === '1.5' && fromDisplay('1,5') === '1.5');
check('saisie EN : un point décimal et les noms de fonction anglais se lisent', value(fromDisplay('sum(1.5; 2.5) * 2', [], 'en')) === 8, fromDisplay('sum(1.5; 2.5) * 2', [], 'en'));
{
  const stored = '{Facture.HT}*0.2+SUM({Lignes.Prix};10)-ROUND(1.255;2)';
  const fr = toDisplay(stored, { trigger: '#', lang: 'fr' });
  check('enregistré -> saisie FR : #Facture.HT * 0,2 + SOMME(#Lignes.Prix; 10) - ARRONDI(1,255; 2)', fr === '#Facture.HT * 0,2 + SOMME(#Lignes.Prix; 10) - ARRONDI(1,255; 2)', fr);
  const en = toDisplay(stored, { trigger: '#', lang: 'en' });
  check('enregistré -> saisie EN : décimales au point, SUM et ROUND', en === '#Facture.HT * 0.2 + SUM(#Lignes.Prix; 10) - ROUND(1.255; 2)', en);
  const pretty = toDisplay(stored, { trigger: '#', lang: 'fr', pretty: true });
  check('enregistré -> texte de bulle : × et − typographiques', pretty === '#Facture.HT × 0,2 + SOMME(#Lignes.Prix; 10) − ARRONDI(1,255; 2)', pretty);
  check('touche de déclenchement : « § » à la place de « # »', toDisplay('{A.B}+1', { trigger: '§' }) === '§A.B + 1');
  check('aller-retour : saisie -> enregistré -> saisie rend le même texte', (() => {
    const text = '#A.B * (1 + 20%) / 3';
    const stored2 = fromDisplay(text, [span(text, 'A.B')]);
    return toDisplay(stored2, { trigger: '#', lang: 'fr' }) === text;
  })());
  check('signes : -{A.B}, 5 - -2, +3 ne prennent pas d\'espace de trop', toDisplay('-{A.B}+5--2') === '-#A.B + 5 - -2' && toDisplay('+3') === '+3', toDisplay('-{A.B}+5--2'));
  check('toDisplay d\'un texte illisible : rendu tel quel', toDisplay('{A.B') === '{A.B' && toDisplay('1 $ 2') === '1 $ 2');
  check('toDisplay d\'un nom inconnu : gardé tel quel', toDisplay('FOO(1)') === 'FOO(1)');
  const all = 'SUM({L.M};-2)*3%+(4-1)/2-ROUND(.5;0)+-{A.B}%';
  check('toDisplay : chaque sorte de jeton, FR, EN, texte de bulle et touche « § »', toDisplay(all, { trigger: '#', lang: 'fr' }) === 'SOMME(#L.M; -2) * 3% + (4 - 1) / 2 - ARRONDI(0,5; 0) + -#A.B%'
    && toDisplay(all, { trigger: '#', lang: 'en' }) === 'SUM(#L.M; -2) * 3% + (4 - 1) / 2 - ROUND(0.5; 0) + -#A.B%'
    && toDisplay(all, { trigger: '§', lang: 'fr', pretty: true }) === 'SOMME(§L.M; −2) × 3% + (4 − 1) ÷ 2 − ARRONDI(0,5; 0) + −§A.B%'
    && toDisplay(all) === 'SOMME(#L.M; -2) * 3% + (4 - 1) / 2 - ARRONDI(0,5; 0) + -#A.B%', toDisplay(all, { lang: 'fr', pretty: true }));
  check('toDisplay : un signe après une parenthèse ouvrante, un point-virgule ou un opérateur est un signe, après une valeur ou « ) » une opération', toDisplay('(-1)+(+2)-(-3)') === '(-1) + (+2) - (-3)' && toDisplay('SUM(-1;+2)') === 'SOMME(-1; +2)' && toDisplay('2*-3/+4') === '2 * -3 / +4' && toDisplay('{A.B}-1') === '#A.B - 1' && toDisplay('50%-1') === '50% - 1');
  check('toDisplay : null et indéfini rendent un texte vide', toDisplay(null) === '' && toDisplay(undefined) === '');
}

// 10. functionNames et errorMessage.
check('functionNames : français puis anglais', same(JSON.parse(evalIn(ctx, 'JSON.stringify(Formula.functionNames("fr"))')), ['SOMME', 'MOYENNE', 'MIN', 'MAX', 'NB', 'ARRONDI']) && same(JSON.parse(evalIn(ctx, 'JSON.stringify(Formula.functionNames("en"))')), ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'ROUND']));
{
  ctx.__T = (key, params) => key + (params ? '|' + Object.keys(params).filter(k => ['name', 'list', 'token', 'char', 'key', 'text', 'a', 'b', 'count', 'trigger'].includes(k)).sort().map(k => k + '=' + params[k]).join(',') : '');
  const msg = error => evalIn(ctx, `Formula.errorMessage(${JSON.stringify(error)}, __T, { lang: 'fr', trigger: '#' })`);
  check('errorMessage : variable -> le message de la lecture tel quel', msg({ code: 'variable', message: 'MSG' }) === 'MSG');
  check('errorMessage : fonction inconnue cite le mot et la liste de la langue', msg({ code: 'unknownFunction', name: 'FOO' }) === 'formula.error.unknownFunction|list=SOMME, MOYENNE, MIN, MAX, NB, ARRONDI,name=FOO', msg({ code: 'unknownFunction', name: 'FOO' }));
  check('errorMessage : mot inconnu cite la touche de déclenchement', msg({ code: 'unknownName', name: 'abc' }) === 'formula.error.unknownName|name=abc,trigger=#');
  const msgOf = stored => evalIn(ctx, `Formula.errorMessage(Formula.parse(${JSON.stringify(stored)}).error, __T, { lang: 'fr', trigger: '#' })`);
  check('errorMessage : badArgs, « au moins une valeur » (SOMME) et « une ou deux » (ARRONDI), nom dans la langue', msgOf('SUM()') === 'formula.error.badArgsMin|name=SOMME' && msgOf('ROUND(1;2;3)') === 'formula.error.badArgsRound|name=ARRONDI', msgOf('SUM()') + ' / ' + msgOf('ROUND(1;2;3)'));
  check('errorMessage : accolade ou clé illisible disent la touche de déclenchement', msg({ code: 'unclosedBrace' }) === 'formula.error.unclosedBrace|trigger=#' && msg({ code: 'badKey', key: 'x' }) === 'formula.error.badKey|key=x,trigger=#', msg({ code: 'badKey', key: 'x' }));
  check('errorMessage : « inattendu » écrit une variable avec sa touche de déclenchement, un nombre tel quel', msg({ code: 'unexpected', token: '{A.B}' }) === 'formula.error.unexpected|token=#A.B' && msg({ code: 'unexpected', token: ')' }) === 'formula.error.unexpected|token=)', msg({ code: 'unexpected', token: '{A.B}' }));
  check('errorMessage : une faute réelle de saisie (variable posée à la place d\'un opérateur) cite la touche', msgOf('1 {A.B}') === 'formula.error.unexpected|token=#A.B', msgOf('1 {A.B}'));
  check('errorMessage : un code sans paramètre', msg({ code: 'divZero' }).indexOf('formula.error.divZero') === 0 && msg({ code: 'unclosedParen' }).indexOf('formula.error.unclosedParen') === 0);
  check('errorMessage : caractère étranger, nombre illisible, variable inconnue, listes de longueurs différentes, plusieurs valeurs',
    msg({ code: 'badChar', char: '$' }) === 'formula.error.badChar|char=$' && msg({ code: 'notNumber', key: 'F.A', text: '12 EUR' }) === 'formula.error.notNumber|key=F.A,text=12 EUR'
    && msg({ code: 'unknownVariable', key: 'F.A' }) === 'formula.error.unknownVariable|key=F.A' && msg({ code: 'lengthMismatch', a: 2, b: 3 }) === 'formula.error.lengthMismatch|a=2,b=3'
    && msg({ code: 'manyValues', count: 4 }) === 'formula.error.manyValues|count=4', msg({ code: 'manyValues', count: 4 }));
  check('errorMessage : un code inconnu, ou pas d\'erreur du tout, retombe sur « résultat impossible » ; ses paramètres suivent', msg({ code: 'zzz', key: 'k' }) === 'formula.error.zzz|key=k' && msg({}) === 'formula.error.badResult|' && evalIn(ctx, 'Formula.errorMessage(undefined, __T)') === 'formula.error.badResult|' && evalIn(ctx, 'Formula.errorMessage(null, __T, {})') === 'formula.error.badResult|');
  check('errorMessage : sans options, la langue est le français et la touche « # » ; en anglais les noms de fonction passent en anglais', evalIn(ctx, `Formula.errorMessage({ code: 'unknownName', name: 'x' }, __T)`) === 'formula.error.unknownName|name=x,trigger=#'
    && evalIn(ctx, `Formula.errorMessage({ code: 'badArgs', name: 'SUM', max: Infinity }, __T)`) === 'formula.error.badArgsMin|name=SOMME'
    && evalIn(ctx, `Formula.errorMessage({ code: 'badArgs', name: 'SUM', max: Infinity }, __T, { lang: 'en' })`) === 'formula.error.badArgsMin|name=SUM'
    && evalIn(ctx, `Formula.errorMessage({ code: 'unknownFunction', name: 'X' }, __T, { lang: 'en' })`) === 'formula.error.unknownFunction|list=SUM, AVERAGE, MIN, MAX, COUNT, ROUND,name=X'
    && evalIn(ctx, `Formula.errorMessage({ code: 'unclosedBrace' }, __T, { trigger: '§' })`) === 'formula.error.unclosedBrace|trigger=§');
  check('errorMessage : badArgs d\'un nom que le moteur ne connaît pas garde le nom reçu', msg({ code: 'badArgs', name: 'FOO', max: 2 }) === 'formula.error.badArgsRound|name=FOO', msg({ code: 'badArgs', name: 'FOO', max: 2 }));
}

// 11. Le moteur n'exécute jamais de code : ni eval, ni Function, ni setTimeout de chaîne.
{
  const source = readFileSync(new URL('../js/formula.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  check('js/formula.js : aucun eval(), new Function(), Function(…) ni import dynamique', !/\beval\s*\(|\bFunction\s*\(|new\s+Function|\bimport\s*\(/.test(source));
}

summarizeAndExit();
