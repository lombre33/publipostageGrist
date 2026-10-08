#!/usr/bin/env node
// Tests purs (sans navigateur) de js/condition-rules.js : la comparaison « colonne opérateur valeur » des macro-modèles et des variables conditionnelles.
// Les attendus sont ceux de la règle saisie (« = Oui », « = 26/09/2026 »...), pas ceux de la fonction.
// Lancer : node dev-tests/unit-condition-rules.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const ctx = createContext({});
loadScript(ctx, 'js/condition-rules.js');

// Les dates sont créées dans le contexte du module : `instanceof Date` doit y voir la même classe.
const DATE_AT = `(y, m, d, h, mi) => new Date(Date.UTC(y, m - 1, d, h || 0, mi || 0))`;
const compare = (actual, operator, expected, type) => {
  ctx.__A = actual; ctx.__E = expected;
  return evalIn(ctx, `ConditionRules.compareValues(__A, ${JSON.stringify(operator)}, __E, ${JSON.stringify(type)})`);
};
const dateAt = (y, m, d, h, mi) => evalIn(ctx, `(${DATE_AT})(${y}, ${m}, ${d}, ${h || 0}, ${mi || 0})`);
const seconds = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h || 0, mi || 0) / 1000;

// 1. Vide et non vide : seuls null, undefined et '' sont vides (0 et false sont des valeurs).
{
  check('vide : null, undefined et chaîne vide', [null, undefined, ''].every(v => compare(v, 'vide', '', 'Text') === true));
  check('vide : 0, false et du texte sont des valeurs', [0, false, 'a', ' '].every(v => compare(v, 'vide', '', 'Text') === false));
  check('non vide est l\'inverse de vide', [null, '', 0, false, 'a'].every(v => compare(v, 'non vide', '', 'Text') === !compare(v, 'vide', '', 'Text')));
}

// 2. Une liste (choix multiples, liste de références) : « = » veut dire « contient ce choix », « ≠ » « ne le contient pas ».
{
  const liste = ['Projet', 'Urgent'];
  check('liste : « = Projet » retient une ligne Projet + Urgent', compare(liste, '=', 'Projet', 'ChoiceList') === true);
  check('liste : « ≠ Projet » l\'écarte', compare(liste, '≠', 'Projet', 'ChoiceList') === false);
  check('liste : « = Autre » ne la retient pas, « ≠ Autre » si', compare(liste, '=', 'Autre', 'ChoiceList') === false && compare(liste, '≠', 'Autre', 'ChoiceList') === true);
  check('liste vide : ne contient rien', compare([], '=', 'Projet', 'ChoiceList') === false && compare([], '≠', 'Projet', 'ChoiceList') === true);
  check('liste : « contient » lit la forme texte « Projet,Urgent »', compare(liste, 'contient', 'jet', 'ChoiceList') === true && compare(liste, 'contient', 'xyz', 'ChoiceList') === false);
  check('liste de nombres : l\'élément est comparé en nombre', compare([12, 7], '=', '12.0', 'ChoiceList') === true);
}

// 3. Colonne Oui / Non : Grist renvoie un booléen, la règle porte un mot (oui, vrai, true, 1, yes / non, faux, false, 0, no), seuls ces mots comptent.
{
  check('Oui / Non : true = « Oui », « vrai », « 1 », « YES »', ['Oui', 'vrai', '1', 'YES', ' true '].every(w => compare(true, '=', w, 'Bool') === true));
  check('Oui / Non : false = « non », « faux », « 0 »', ['non', 'faux', '0', 'No'].every(w => compare(false, '=', w, 'Bool') === true));
  check('Oui / Non : true ≠ « non » est vrai, true ≠ « oui » est faux', compare(true, '≠', 'non', 'Bool') === true && compare(true, '≠', 'oui', 'Bool') === false);
  check('Oui / Non : un autre mot ne correspond à rien (« = » faux, « ≠ » vrai)', compare(true, '=', 'peut-être', 'Bool') === false && compare(true, '≠', 'peut-être', 'Bool') === true);
  check('un booléen n\'est pas le nombre 1 hors colonne Oui / Non, il l\'est par le mot « 1 » dans une colonne Oui / Non', compare(true, '=', '1', 'Any') === false && compare(true, '=', '1', 'Bool') === true);
  check('Oui / Non : une valeur qui n\'est pas un booléen (le nombre 1 ou 0 d\'un export) se compare comme un nombre', compare(1, '=', '1', 'Bool') === true && compare(0, '=', '0', 'Bool') === true && compare(1, '=', 'oui', 'Bool') === false);
  check('parseBoolExpected : vrai, faux, ou null pour un autre mot', evalIn(ctx, `[ConditionRules.parseBoolExpected(' Oui '), ConditionRules.parseBoolExpected('NON'), ConditionRules.parseBoolExpected('bof'), ConditionRules.parseBoolExpected(null)].join()`) === 'true,false,,');
}

// 4. Nombres : comparés en nombres quand les deux côtés en sont, sinon en texte (rogné).
{
  check('nombre : 12 = « 12.0 » et « 012 » (valeur, pas écriture)', compare(12, '=', '12.0', 'Numeric') === true && compare(12, '=', '012', 'Numeric') === true);
  check('nombre : « 12 » > « 9 » (nombre, pas ordre alphabétique)', compare('12', '>', '9', 'Text') === true);
  check('nombre : les six opérateurs', compare(5, '<', 6, 'Int') && compare(5, '≤', 5, 'Int') && compare(5, '≥', 5, 'Int') && compare(5, '≠', 6, 'Int') && !compare(5, '>', 5, 'Int') && !compare(5, '<', 5, 'Int'));
  check('nombre : 0 n\'est pas vide, 0 ≠ « »', compare(0, '=', '', 'Numeric') === false && compare(0, '=', '0', 'Numeric') === true);
  check('texte : comparé rogné, la casse compte', compare(' b ', '=', 'b', 'Text') === true && compare('Abc', '=', 'abc', 'Text') === false);
  check('texte : ordre alphabétique', compare('abc', '<', 'abd', 'Text') === true && compare('abc', '>', 'abd', 'Text') === false);
  check('opérateur inconnu : jamais vrai', ['foo', '', undefined, 'constructor', '__proto__'].every(o => compare(1, o, 1, 'Numeric') === false));
}

// 5. « contient » : sans tenir compte de la casse.
{
  check('contient : « Bonjour » contient « JOUR »', compare('Bonjour', 'contient', 'JOUR', 'Text') === true);
  check('contient : une valeur absente ne contient rien d\'autre que le vide', compare(null, 'contient', 'a', 'Text') === false && compare(null, 'contient', '', 'Text') === true);
  check('contient : un nombre se lit en texte', compare(1250, 'contient', '25', 'Numeric') === true);
}

// 6. Dates : le jour calendaire, jamais l'heure locale du navigateur ; la valeur saisie se lit « 26/09/2026 » (jour/mois) ou « 2026-09-26 ».
{
  const jour = dateAt(2026, 9, 26, 12);
  check('date : « = 26/09/2026 » et « = 2026-09-26 »', compare(jour, '=', '26/09/2026', 'Date') === true && compare(jour, '=', '2026-09-26', 'Date') === true);
  check('date : avant, après', compare(jour, '>', '25/09/2026', 'Date') === true && compare(jour, '<', '27/09/2026', 'Date') === true && compare(jour, '<', '26/09/2026', 'Date') === false);
  check('date : une saisie « 9/6/2026 » est le 9 juin', compare(dateAt(2026, 6, 9), '=', '9/6/2026', 'Date') === true && compare(dateAt(2026, 9, 6), '=', '9/6/2026', 'Date') === false);
  check('date : une saisie hors bornes ne correspond jamais (ni « = » ni « ≠ »)', ['31/02/2026', '09/26/2026', '00/01/2026', 'demain'].every(v => compare(jour, '=', v, 'Date') === false && compare(jour, '≠', v, 'Date') === false));
  check('date : un instant en secondes (export en lot) vaut la même date', compare(seconds(2026, 9, 26, 12), '=', '26/09/2026', 'Date') === true);
  check('date : « contient » cherche dans « AAAA-MM-JJ »', compare(jour, 'contient', '09-26', 'Date') === true && compare(jour, 'contient', '2027', 'Date') === false);
  check('date : « contient » sans valeur attendue (vide, null ou absente) : toute date la contient', [null, undefined, ''].every(v => compare(jour, 'contient', v, 'Date') === true));
  check('date : une date illisible retombe sur la comparaison générale', compare(new (evalIn(ctx, 'Date'))(NaN), '=', '26/09/2026', 'Date') === false);
}

// 7. DateTime : le jour DANS le fuseau de la colonne (le soir à Paris est déjà le lendemain en UTC).
{
  const soir = dateAt(2026, 9, 26, 22, 30); // 26/09 22h30 UTC = 27/09 00h30 à Paris, 26/09 18h30 à New York
  check('DateTime:Europe/Paris : 22h30 UTC est le 27/09', compare(soir, '=', '27/09/2026', 'DateTime:Europe/Paris') === true && compare(soir, '=', '26/09/2026', 'DateTime:Europe/Paris') === false);
  check('DateTime:America/New_York : 22h30 UTC est encore le 26/09', compare(soir, '=', '26/09/2026', 'DateTime:America/New_York') === true);
  check('DateTime:Asia/Kolkata (décalage d\'une demi-heure) : 22h30 UTC est le 27/09', compare(soir, '=', '27/09/2026', 'DateTime:Asia/Kolkata') === true);
  check('DateTime sans fuseau, UTC et fuseau inconnu : le jour UTC', ['DateTime', 'DateTime:UTC', 'DateTime:', 'DateTime:Pas/Un_Fuseau'].every(t => compare(soir, '=', '26/09/2026', t) === true));
  check('DateTime : un instant en secondes suit le même fuseau', compare(seconds(2026, 9, 26, 22, 30), '=', '27/09/2026', 'DateTime:Europe/Paris') === true);
  check('DateTime : un instant hors des dates représentables ne lève pas', ['DateTime:Europe/Paris', 'DateTime'].every(t => { try { compare(1e20, '=', '26/09/2026', t); return true; } catch (e) { return false; } }));
  check('sans type de colonne, une date se lit comme un texte (pas de jour calendaire)', compare(dateAt(2026, 9, 26, 12), '=', '26/09/2026', undefined) === false);
}

// 8. Coût : un formateur Intl par fuseau, jamais un par appel (construire coûte ~60 µs, formater moins d'1 µs ; une règle est évaluée à chaque ligne d'un envoi).
// Contexte neuf : le cache de fuseaux du contexte précédent est déjà rempli.
{
  const built = { n: 0 };
  class CountingFormat extends Intl.DateTimeFormat { constructor(...args) { built.n++; super(...args); } }
  const fresh = createContext({ Intl: Object.assign({}, Intl, { DateTimeFormat: CountingFormat }) });
  loadScript(fresh, 'js/condition-rules.js');
  fresh.__SOIR = evalIn(fresh, `new Date(Date.UTC(2026, 8, 26, 22, 30))`);
  for (let i = 0; i < 300; i++) {
    for (const t of ['DateTime:Europe/Paris', 'DateTime:Asia/Tokyo', 'DateTime:Pas/Un_Fuseau']) evalIn(fresh, `ConditionRules.compareValues(__SOIR, '=', '27/09/2026', ${JSON.stringify(t)})`);
  }
  check('900 comparaisons sur trois fuseaux (dont un inconnu) : trois formateurs construits', built.n === 3, 'construits : ' + built.n);
}

// 9. Colonne d'une règle et condition d'une bulle.
{
  check('parseColumnRef : colonne nue = table courante', evalIn(ctx, `JSON.stringify(ConditionRules.parseColumnRef('Nom', 'Factures'))`) === '{"table":"Factures","column":"Nom"}');
  check('parseColumnRef : « Table.Colonne » coupe au premier point', evalIn(ctx, `JSON.stringify(ConditionRules.parseColumnRef('Clients.Nom.complet', 'Factures'))`) === '{"table":"Clients","column":"Nom.complet"}');
  check('normalizeCondition : sans règle complète, pas de condition', evalIn(ctx, `[ConditionRules.normalizeCondition(null), ConditionRules.normalizeCondition({ rules: [] }), ConditionRules.normalizeCondition({ rules: [{ column: '' }, null] })].every(c => c === null)`));
  check('normalizeCondition : ignore les lignes vides, « any » ou « all » seulement',
    evalIn(ctx, `(() => { const c = ConditionRules.normalizeCondition({ mode: 'any', rules: [{ column: 'A' }, { column: '' }, { column: 'B' }] }); const d = ConditionRules.normalizeCondition({ mode: 'bof', rules: [{ column: 'A' }] }); return c.mode === 'any' && c.rules.length === 2 && d.mode === 'all'; })()`));
  check('OPERATORS : les neuf opérateurs, dans l\'ordre des listes', evalIn(ctx, 'ConditionRules.OPERATORS.join("|")') === '=|≠|>|<|≥|≤|contient|vide|non vide');
}

// 10. Le jour calendaire ne dépend jamais du fuseau du navigateur : une date de Grist est un jour, pas un instant local.
{
  const before = process.env.TZ;
  for (const tz of ['Pacific/Auckland', 'America/Los_Angeles']) {
    process.env.TZ = tz;
    const minuit = dateAt(2026, 9, 26, 0, 0), midi = dateAt(2026, 9, 26, 12, 0);
    check(`navigateur en ${tz} : 00h00 et 12h00 UTC sont le 26/09`, compare(minuit, '=', '26/09/2026', 'Date') === true && compare(midi, '=', '26/09/2026', 'Date') === true);
    check(`navigateur en ${tz} : la saisie « 26/09/2026 » s'ordonne sur la même date`, compare(minuit, '<', '27/09/2026', 'Date') === true && compare(minuit, '>', '25/09/2026', 'Date') === true);
  }
  if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
}

// 11. La condition d'un élément du modèle (bloc, valeur, case ou bulle conditionnels) : lue dans data-condition, évaluée avec la ligne du tour d'une zone répétée.
// Les modules voisins (Variables, GristAPI, LoopRules) sont remplacés par de petits faux : seule la lecture de l'attribut est en jeu ici.
{
  const logged = [];
  const evaluated = [];
  const stubCtx = createContext({
    console: { log: console.log, warn: console.warn, error: (...args) => logged.push(args) },
    Variables: {
      resolveRawValue: async (table, column, tableId, record, opts) => {
        evaluated.push({ table, column, opts });
        if (column === 'Boum') throw new Error('lecture impossible');
        return { value: record[column] };
      },
    },
    GristAPI: { getColumnType: () => 'Text' },
    LoopRules: { bindingOf: el => el.binding || null },
  });
  loadScript(stubCtx, 'js/condition-rules.js');
  const DUPONT = { Nom: 'Dupont', Statut: 'Actif' };
  const rule = (column, value) => ({ column, operator: '=', value });
  const condition = (mode, ...rules) => JSON.stringify({ mode, rules });
  const holds = (raw, whenNone, options = {}) => {
    stubCtx.__EL = { binding: options.binding, getAttribute: name => (name === 'data-condition' ? raw : null) };
    stubCtx.__REC = options.record || DUPONT;
    return evalIn(stubCtx, `ConditionRules.elementHolds(__EL, 'T', __REC, ${whenNone})`);
  };
  const both = async (raw, options) => [await holds(raw, true, options), await holds(raw, false, options)];

  check('élément sans condition (attribut absent ou vide) : le verdict `whenNone`',
    JSON.stringify([...await both(null), ...await both('')]) === '[true,false,true,false]');
  check('condition sans règle complète (null, aucune règle, règle sans colonne, pas de liste de règles) : le verdict `whenNone`, même attribut présent',
    (await Promise.all(['null', '{"rules":[]}', '{"rules":[{"column":""}]}', '{"mode":"any"}'].map(raw => both(raw)))).every(r => r[0] === true && r[1] === false));
  logged.length = 0;
  check('condition illisible : faux, quel que soit `whenNone`, et l\'erreur est écrite dans la console', JSON.stringify(await both('pas du json')) === '[false,false]' && logged.length === 2, 'journal : ' + logged.length);
  check('condition remplie : vrai, quel que soit `whenNone`', JSON.stringify(await both(condition('all', rule('Nom', 'Dupont')))) === '[true,true]');
  check('condition non remplie : faux, quel que soit `whenNone`', JSON.stringify(await both(condition('all', rule('Nom', 'Martin')))) === '[false,false]');
  check('deux règles : « all » veut toutes, « any » au moins une',
    await holds(condition('all', rule('Nom', 'Martin'), rule('Statut', 'Actif')), true) === false && await holds(condition('any', rule('Nom', 'Martin'), rule('Statut', 'Actif')), true) === true);
  check('une règle dont la colonne ne se lit pas ne laisse rien passer : faux, sans lever', await holds(condition('all', rule('Boum', 'x')), true) === false);
  logged.length = 0;
  const hostile = new Proxy({}, { has() { throw new Error('ligne illisible'); } }); // `column in record` lève : l'évaluation de la condition échoue
  check('évaluation qui échoue : faux, sans lever, et l\'erreur est écrite dans la console', await holds(condition('all', rule('Absente', 'x')), true, { record: hostile }) === false && logged.length === 1, 'journal : ' + logged.length);
  evaluated.length = 0;
  await holds(condition('all', rule('Nom', 'Dupont')), true, { binding: { row: 3 } });
  check('dans une zone répétée, la règle lit la ligne du tour : la liaison de l\'élément est transmise telle quelle', evaluated.length === 1 && JSON.stringify(evaluated[0].opts) === '{"loop":{"row":3}}', JSON.stringify(evaluated));
  evaluated.length = 0;
  await holds(condition('all', rule('Nom', 'Dupont')), true);
  check('hors zone répétée, aucune option n\'est transmise', evaluated.length === 1 && evaluated[0].opts === undefined, JSON.stringify(evaluated));

  // resolveElements : l'enchaînement commun aux blocs, valeurs et cases conditionnels (verdicts lus d'abord, HTML transformé ensuite). Une fausse racine
  // suffit : `querySelectorAll` rend les éléments, `contains` dit lesquels n'ont pas été sortis de la racine par une transformation.
  const fakeEl = (name, raw) => ({ name, getAttribute: attr => (attr === 'data-condition' ? raw : null) });
  const fakeRoot = elements => { const gone = new Set(); return { gone, querySelectorAll: () => elements, contains: element => !gone.has(element) }; };
  const resolveAll = (root, whenNone, apply) => {
    stubCtx.__ROOT = root; stubCtx.__APPLY = apply; stubCtx.__REC = DUPONT;
    return evalIn(stubCtx, `ConditionRules.resolveElements(__ROOT, 'x', 'T', __REC, ${whenNone}, __APPLY)`);
  };
  {
    const [a, b, c] = [fakeEl('a', condition('all', rule('Nom', 'Dupont'))), fakeEl('b', condition('all', rule('Nom', 'Martin'))), fakeEl('c', null)];
    const seen = [];
    evaluated.length = 0;
    await resolveAll(fakeRoot([a, b, c]), false, (element, holds) => seen.push([element.name, holds, evaluated.length]));
    check('resolveElements : chaque élément reçoit son verdict dans l\'ordre du document, `whenNone` pour celui sans condition',
      JSON.stringify(seen.map(s => s.slice(0, 2))) === '[["a",true],["b",false],["c",false]]', JSON.stringify(seen));
    check('resolveElements : tous les verdicts sont lus avant la première transformation', seen.every(s => s[2] === 2), JSON.stringify(seen));
    seen.length = 0;
    await resolveAll(fakeRoot([a, c]), true, (element, holds) => seen.push([element.name, holds]));
    check('resolveElements : `whenNone` vrai pour l\'élément sans condition', JSON.stringify(seen) === '[["a",true],["c",true]]', JSON.stringify(seen));
    seen.length = 0;
    const outer = fakeRoot([a, b]);
    await resolveAll(outer, true, element => { seen.push(element.name); if (element === a) outer.gone.add(b); });
    check('resolveElements : un élément sorti de la racine par la transformation précédente n\'est plus traité', JSON.stringify(seen) === '["a"]', JSON.stringify(seen));
    seen.length = 0;
    await resolveAll(null, true, () => seen.push('x'));
    await resolveAll(fakeRoot([]), true, () => seen.push('x'));
    check('resolveElements : sans racine ni élément, rien n\'est transformé', seen.length === 0);
  }
}

// 12. Une colonne contre une autre (compareOperands) : la même comparaison que contre une valeur saisie (nombres, dates au jour près, Oui / Non, « contient »),
// avec en plus deux règles que la valeur saisie n'a pas : les cellules vides et les listes.
{
  const operands = (actual, operator, other, type, otherType) => {
    ctx.__A = actual; ctx.__O = other;
    try { return evalIn(ctx, `ConditionRules.compareOperands(__A, ${JSON.stringify(operator)}, __O, ${JSON.stringify(type)}, ${JSON.stringify(otherType)})`); }
    catch (e) { return 'erreur : ' + e.message; }
  };
  const TEXT = ['Text', 'Text'], NUM = ['Numeric', 'Numeric'], BOOL = ['Bool', 'Bool'], DATE = ['Date', 'Date'], LIST = ['ChoiceList', 'ChoiceList'];
  const run = (actual, operator, other, [type, otherType]) => operands(actual, operator, other, type, otherType);
  const jour = dateAt(2026, 9, 26, 12);

  check('texte : « = » compare rogné, la casse compte, « ≠ » est l\'inverse',
    run(' Dupont ', '=', 'Dupont', TEXT) === true && run('dupont', '=', 'Dupont', TEXT) === false && run('Dupont', '≠', 'Martin', TEXT) === true && run('Dupont', '≠', 'Dupont', TEXT) === false);
  check('texte : ordre alphabétique', run('abc', '<', 'abd', TEXT) === true && run('abc', '>', 'abd', TEXT) === false && run('abc', '≤', 'abc', TEXT) === true);
  check('texte : « contient » cherche la seconde colonne dans la première, sans tenir compte de la casse, jamais l\'inverse',
    run('Bonjour à tous', 'contient', 'JOUR', TEXT) === true && run('jour', 'contient', 'Bonjour à tous', TEXT) === false);
  check('nombres : comparés en nombres, qu\'ils viennent d\'une colonne numérique ou d\'un texte',
    run(12, '=', '12.0', ['Numeric', 'Text']) === true && run('12', '>', 9, ['Text', 'Numeric']) === true && run(5, '<', 6, ['Int', 'Numeric']) === true && run(5, '≥', 6, NUM) === false);
  check('zéro est une valeur : 0 = 0 est vrai, 0 et une cellule vide ne sont pas égaux', run(0, '=', 0, NUM) === true && run(0, '=', null, NUM) === false && run(0, '≠', '', NUM) === true);
  check('Oui / Non : deux colonnes Oui / Non, ou une colonne Oui / Non et un mot',
    run(true, '=', true, BOOL) === true && run(true, '=', false, BOOL) === false && run(true, '≠', false, BOOL) === true && run(false, '=', false, BOOL) === true
    && run(true, '=', 'Oui', ['Bool', 'Text']) === true && run(false, '=', 'oui', ['Bool', 'Text']) === false);
  check('dates : le jour calendaire, l\'heure ne compte pas',
    run(jour, '=', dateAt(2026, 9, 26, 0), DATE) === true && run(jour, '<', dateAt(2026, 10, 1), DATE) === true && run(jour, '>', dateAt(2026, 10, 1), DATE) === false
    && run(jour, '≥', dateAt(2026, 9, 26, 23), DATE) === true && run(jour, '<', dateAt(2026, 9, 26, 23), DATE) === false);
  check('dates : un instant en secondes (export en lot) vaut la même date qu\'un objet Date', run(seconds(2026, 9, 26, 12), '=', jour, DATE) === true && run(jour, '=', seconds(2026, 9, 26, 3), DATE) === true);
  check('dates : une colonne Date contre un texte « 26/09/2026 » ou « 2026-09-26 »', run(jour, '=', '26/09/2026', ['Date', 'Text']) === true && run(jour, '=', '2026-09-26', ['Date', 'Text']) === true && run(jour, '=', '27/09/2026', ['Date', 'Text']) === false);
  const soir = dateAt(2026, 9, 26, 22, 30); // 26/09 22h30 UTC = 27/09 00h30 à Paris, 26/09 18h30 à New York
  check('dates : chaque colonne est lue dans son fuseau (22h30 UTC est le 27/09 à Paris, le 26/09 en UTC et à New York)',
    run(soir, '=', dateAt(2026, 9, 27), ['DateTime:Europe/Paris', 'Date']) === true && run(soir, '=', dateAt(2026, 9, 27), ['DateTime:UTC', 'Date']) === false
    && run(soir, '>', soir, ['DateTime:Europe/Paris', 'DateTime:America/New_York']) === true && run(soir, '=', soir, ['DateTime:Europe/Paris', 'DateTime:America/New_York']) === false
    && run(soir, '=', soir, ['DateTime:America/New_York', 'DateTime:America/New_York']) === true);
  check('cellules vides : deux vides sont égales, une seule vide les distingue',
    run('', '=', null, TEXT) === true && run(undefined, '=', '', TEXT) === true && run(null, '≠', '', TEXT) === false
    && run('x', '=', '', TEXT) === false && run('', '=', 'x', TEXT) === false && run('x', '≠', '', TEXT) === true && run('', '≠', 'x', TEXT) === true);
  check('cellules vides : ni plus petit, ni plus grand, ni « contient » (une date de fin non remplie n\'est pas « avant » la date de début)',
    ['>', '<', '≥', '≤', 'contient'].every(op => run('', op, 'x', TEXT) === false && run('x', op, '', TEXT) === false && run('', op, '', TEXT) === false)
    && run(null, '<', dateAt(2026, 9, 26), DATE) === false && run(dateAt(2026, 9, 26), '>', null, DATE) === false);
  check('une liste sans élément est une cellule vide', run([], '=', '', ['ChoiceList', 'Text']) === true && run(['A'], '=', [], LIST) === false && run(['A'], '≠', [], LIST) === true && run([], '≠', ['A'], LIST) === true);
  check('« vide » et « non vide » ne lisent pas l\'autre colonne',
    run('', 'vide', 'x', TEXT) === true && run('a', 'vide', 'a', TEXT) === false && run('a', 'non vide', '', TEXT) === true && run('', 'non vide', 'x', TEXT) === false);
  check('deux listes : égales quand elles ont les mêmes éléments, dans n\'importe quel ordre',
    run(['A', 'B'], '=', ['B', 'A'], LIST) === true && run(['A', 'B'], '=', ['A'], LIST) === false && run(['A', 'B'], '≠', ['A'], LIST) === true && run(['A'], '≠', ['A'], LIST) === false);
  check('deux listes : les éléments se comparent par leur écriture, espaces rognées (1 et « 1 »)', run([1, 2], '=', ['2', ' 1 '], LIST) === true && run([1, 2], '=', ['2', '3'], LIST) === false);
  check('une liste contre une valeur seule : « = » veut dire « contient », dans les deux sens, « ≠ » l\'inverse',
    run(['A', 'B'], '=', 'A', ['ChoiceList', 'Choice']) === true && run(['A', 'B'], '≠', 'A', ['ChoiceList', 'Choice']) === false
    && run('B', '=', ['A', 'B'], ['Choice', 'ChoiceList']) === true && run('C', '=', ['A', 'B'], ['Choice', 'ChoiceList']) === false && run('C', '≠', ['A', 'B'], ['Choice', 'ChoiceList']) === true);
}

// 13. La règle qui compare à une autre colonne : { column, operator, valueColumn }. Le mode « autre colonne » est dit par la présence de `valueColumn` (chaîne), une règle
// sans cette clé est lue comme avant et s'enregistre à l'identique.
{
  const json = (expr, input) => { ctx.__X = input; return evalIn(ctx, `JSON.stringify(${expr})`); };
  const plain = c => json('ConditionRules.plainCondition(__X)', c);
  const normal = c => json('ConditionRules.normalizeCondition(__X)', c);

  check('une règle sans valueColumn s\'enregistre comme avant, sans cette clé (une condition déjà posée reste identique octet pour octet)',
    plain({ mode: 'all', rules: [{ column: 'Montant', operator: '=', value: 'x' }, { column: 'Nom', value: 3 }] })
      === '{"mode":"all","rules":[{"column":"Montant","operator":"=","value":"x"},{"column":"Nom","operator":"=","value":"3"}]}');
  check('une règle qui compare à une colonne garde valueColumn et n\'enregistre aucune valeur (la valeur laissée en brouillon ne part pas)',
    plain({ mode: 'any', rules: [{ column: 'Montant', operator: '≥', value: 'brouillon', valueColumn: 'Paye' }, { column: 'Clients.Nom', operator: '=', valueColumn: 'Clients.Prenom' }] })
      === '{"mode":"any","rules":[{"column":"Montant","operator":"≥","value":"","valueColumn":"Paye"},{"column":"Clients.Nom","operator":"=","value":"","valueColumn":"Clients.Prenom"}]}');
  check('mode « autre colonne » dont la colonne n\'est pas encore choisie : règle incomplète, ignorée comme une règle sans colonne',
    plain({ rules: [{ column: 'Montant', operator: '=', valueColumn: '' }] }) === 'null' && normal({ rules: [{ column: 'Montant', operator: '=', valueColumn: '' }] }) === 'null'
    && plain({ mode: 'all', rules: [{ column: 'A', operator: '=', valueColumn: '' }, { column: 'B', operator: '=', value: 'x' }, { column: 'C', operator: '<', valueColumn: 'D' }] })
      === '{"mode":"all","rules":[{"column":"B","operator":"=","value":"x"},{"column":"C","operator":"<","value":"","valueColumn":"D"}]}');
  check('« vide » / « non vide » n\'ont pas besoin de l\'autre colonne : la règle reste complète sans elle et n\'enregistre pas un valueColumn vide',
    plain({ rules: [{ column: 'Montant', operator: 'vide', value: 'zzz', valueColumn: '' }] }) === '{"mode":"all","rules":[{"column":"Montant","operator":"vide","value":"zzz"}]}'
    && plain({ rules: [{ column: 'Montant', operator: 'non vide', valueColumn: 'Paye' }] }) === '{"mode":"all","rules":[{"column":"Montant","operator":"non vide","value":"","valueColumn":"Paye"}]}');
  check('plainCondition rend une copie : changer la copie ne touche pas les règles que la fenêtre modifie en place',
    evalIn(ctx, `(() => { const src = { mode: 'all', rules: [{ column: 'A', operator: '=', value: 'x', valueColumn: 'B' }] }; const out = ConditionRules.plainCondition(src); out.rules[0].valueColumn = 'Z'; out.rules[0].column = 'Y'; return src.rules[0].valueColumn + src.rules[0].column; })()`) === 'BA');
  check('inColumnMode : une chaîne (même vide) ; absente, undefined, null ou autre chose : mode valeur',
    evalIn(ctx, `JSON.stringify([{ valueColumn: '' }, { valueColumn: 'B' }, {}, { valueColumn: undefined }, { valueColumn: null }, { valueColumn: 5 }, null, undefined].map(r => ConditionRules.inColumnMode(r)))`)
      === '[true,true,false,false,false,false,false,false]');
  check('comparesColumn : seulement avec une colonne choisie ET un opérateur qui lit une valeur',
    evalIn(ctx, `JSON.stringify([
      { column: 'A', operator: '=', valueColumn: 'B' }, { column: 'A', operator: 'contient', valueColumn: 'B' }, { column: 'A', operator: '=', valueColumn: '' },
      { column: 'A', operator: '=' }, { column: 'A', operator: 'vide', valueColumn: 'B' }, { column: 'A', operator: 'non vide', valueColumn: 'B' }, null,
    ].map(r => ConditionRules.comparesColumn(r)))`) === '[true,true,false,false,false,false,false]');
  check('VALUELESS_OPERATORS : « vide » et « non vide », deux des neuf opérateurs', evalIn(ctx, 'ConditionRules.VALUELESS_OPERATORS.join("|")') === 'vide|non vide'
    && evalIn(ctx, 'ConditionRules.VALUELESS_OPERATORS.every(o => ConditionRules.OPERATORS.indexOf(o) !== -1)') === true);
}

// 14. Évaluer une règle qui compare deux colonnes (matches, conditionHolds, elementHolds) : les deux colonnes sont lues par le même chemin que la colonne d'une règle
// (Variables.resolveRawValue, remplacé ici par un petit faux : une colonne de la table courante vient de la ligne, les autres de `cells`).
{
  const logged = [];
  const warned = [];
  const reads = [];
  const cells = {};
  const types = {};
  const sctx = createContext({
    console: { log: console.log, warn: (...args) => warned.push(args), error: (...args) => logged.push(args) },
    Variables: {
      resolveRawValue: async (table, column, tableId, record, opts) => {
        reads.push({ key: table + '.' + column, opts });
        const found = cells[table + '.' + column];
        if (found && found.throws) throw new Error(found.throws);
        return found || { value: record[column] };
      },
    },
    GristAPI: { getColumnType: (table, column) => types[table + '.' + column] || 'Text' },
    LoopRules: { bindingOf: () => null },
  });
  loadScript(sctx, 'js/condition-rules.js');
  Object.assign(types, { 'T.Montant': 'Numeric', 'T.Paye': 'Numeric', 'T.Reste': 'Numeric', 'T.Debut': 'Date', 'T.Fin': 'DateTime:Europe/Paris', 'T.Tags': 'ChoiceList', 'T.Etiquettes': 'ChoiceList' });
  const rec = {
    Montant: 120, Paye: 120, Reste: 30, Nom: 'Dupont', Prenom: 'Martin', Statut: 'Actif', Vide: '', Tags: ['A', 'B'], Etiquettes: ['B', 'A'],
    Debut: evalIn(sctx, 'new Date(Date.UTC(2026, 8, 26))'), Fin: evalIn(sctx, 'new Date(Date.UTC(2026, 8, 26, 22, 30))'), // 26/09 22h30 UTC = 27/09 à Paris
  };
  const holds = (rule, record, opts) => { sctx.__RULE = rule; sctx.__REC = record || rec; sctx.__OPTS = opts; reads.length = 0; return evalIn(sctx, 'ConditionRules.matches(__RULE, "T", __REC, __OPTS)'); };
  const rule = (column, operator, valueColumn) => ({ column, operator, value: '', valueColumn });

  check('deux colonnes de la ligne : égales, différentes, plus grande (en nombres : 120 > 30, pas « 120 » < « 30 »)',
    await holds(rule('Montant', '=', 'Paye')) === true && await holds(rule('Montant', '=', 'Reste')) === false && await holds(rule('Montant', '≠', 'Reste')) === true
    && await holds(rule('Montant', '>', 'Reste')) === true && await holds(rule('Reste', '>', 'Montant')) === false);
  check('chaque colonne est lue avec son type : Debut (Date) contre Fin (DateTime à Paris) - le même jour calendaire dans son fuseau',
    await holds(rule('Debut', '<', 'Fin')) === true && await holds(rule('Debut', '=', 'Fin')) === false && await holds(rule('Fin', '>', 'Debut')) === true);
  check('deux listes de choix multiples : mêmes éléments dans un autre ordre', await holds(rule('Tags', '=', 'Etiquettes')) === true && await holds(rule('Tags', '≠', 'Etiquettes')) === false);
  check('une colonne contre elle-même est égale', await holds(rule('Nom', '=', 'Nom')) === true && await holds(rule('Nom', '≠', 'Nom')) === false);
  check('une cellule vide contre une cellule remplie : « = » faux, « ≠ » vrai ; deux vides sont égales', await holds(rule('Nom', '=', 'Vide')) === false && await holds(rule('Nom', '≠', 'Vide')) === true && await holds(rule('Vide', '=', 'Vide')) === true);
  check('la règle lit ses deux colonnes, une règle à valeur saisie n\'en lit qu\'une',
    await holds(rule('Montant', '=', 'Paye')) === true && JSON.stringify(reads.map(r => r.key)) === '["T.Montant","T.Paye"]'
    && await holds({ column: 'Nom', operator: '=', value: 'Dupont' }) === true && JSON.stringify(reads.map(r => r.key)) === '["T.Nom"]');
  check('« vide » / « non vide » ne lisent pas l\'autre colonne, même choisie',
    await holds(rule('Nom', 'vide', 'Prenom')) === false && JSON.stringify(reads.map(r => r.key)) === '["T.Nom"]' && await holds(rule('Nom', 'non vide', 'Prenom')) === true && reads.length === 1);
  const forwarded = { fetchRows: () => [], loop: { row: 3 } };
  await holds(rule('Montant', '=', 'Paye'), rec, forwarded);
  check('les options de lecture (lignes déjà lues, ligne du tour d\'une zone répétée) vont aux deux lectures', reads.length === 2 && reads.every(r => r.opts === forwarded), String(reads.length));
  cells['Clients.Nom'] = { value: 'Dupont' };
  cells['Clients.Prenom'] = { value: 'Anne' };
  check('l\'autre colonne peut venir d\'une autre table : « Table.Colonne », comme la colonne de la règle',
    await holds(rule('Nom', '=', 'Clients.Nom')) === true && await holds(rule('Nom', '=', 'Clients.Prenom')) === false && await holds(rule('Clients.Nom', '=', 'Nom')) === true
    && await holds(rule('Clients.Nom', '≠', 'Clients.Prenom')) === true);
  warned.length = 0;
  check('une colonne absente de la ligne avertit comme avant, pour l\'une et l\'autre colonne de la règle, et la règle n\'est pas remplie',
    await holds(rule('Montant', '=', 'Disparue')) === false && warned.length === 1 && String(warned[0][0]).indexOf('"Disparue"') !== -1
    && await holds(rule('Disparue', '=', 'Montant')) === false && warned.length === 2 && String(warned[1][0]).indexOf('"Disparue"') !== -1);
  logged.length = 0;
  cells['Clients.Boum'] = { throws: 'lecture impossible' };
  cells['Clients.Erreur'] = { error: 'table non liée' };
  check('une des deux colonnes qui ne se lit pas : la règle n\'est pas remplie, sans lever, et l\'erreur est écrite dans la console',
    await holds(rule('Montant', '≠', 'Clients.Boum')) === false && logged.length === 1 && await holds(rule('Clients.Erreur', '≠', 'Montant')) === false && logged.length === 2
    && await holds(rule('Clients.Boum', '≠', 'Clients.Erreur')) === false && logged.length >= 3, String(logged.length));

  // Une table liée par correspondance donne une valeur par ligne liée (`multi`).
  Object.assign(types, { 'Annuaire.Ville': 'Text', 'Annuaire.Naissance': 'Text', 'Annuaire.Naissance2': 'Text', 'Clients.Ville': 'Text' });
  cells['Annuaire.Ville'] = { value: ['Paris', 'Lyon'], multi: true };
  cells['Annuaire.Naissance'] = { value: ['Lyon', 'Paris'], multi: true };
  cells['Annuaire.Naissance2'] = { value: ['Nice', 'Lyon'], multi: true };
  check('deux colonnes de la MÊME table liée se lisent fiche par fiche, jamais en croisant les fiches (Paris / Lyon contre Lyon / Paris : jamais égales)',
    await holds(rule('Annuaire.Ville', '=', 'Annuaire.Naissance')) === false && await holds(rule('Annuaire.Ville', '≠', 'Annuaire.Naissance')) === true
    && await holds(rule('Annuaire.Ville', '=', 'Annuaire.Naissance2')) === true && await holds(rule('Annuaire.Ville', '=', 'Annuaire.Ville')) === true);
  cells['Clients.Ville'] = { value: ['Lyon'], multi: true };
  check('deux tables liées différentes n\'ont pas de ligne commune : une paire qui convient suffit',
    await holds(rule('Annuaire.Ville', '=', 'Clients.Ville')) === true && await holds(rule('Annuaire.Ville', '≠', 'Clients.Ville')) === true);
  cells['Clients.Ville'] = { value: ['Nice'], multi: true };
  check('... et aucune paire ne convient : faux', await holds(rule('Annuaire.Ville', '=', 'Clients.Ville')) === false);
  check('une colonne liée à plusieurs lignes contre une colonne de la ligne : vraie si UNE ligne liée la remplit, dans les deux sens',
    await holds(rule('Annuaire.Ville', '=', 'Statut'), { Statut: 'Lyon' }) === true && await holds(rule('Annuaire.Ville', '=', 'Statut'), { Statut: 'Nice' }) === false
    && await holds(rule('Statut', '=', 'Annuaire.Ville'), { Statut: 'Paris' }) === true && await holds(rule('Statut', '=', 'Annuaire.Ville'), { Statut: 'Nice' }) === false);
  cells['Annuaire.Ville'] = { value: [], multi: true };
  check('aucune ligne liée vaut une valeur vide', await holds(rule('Annuaire.Ville', '=', 'Vide')) === true && await holds(rule('Annuaire.Ville', '≠', 'Nom')) === true && await holds(rule('Annuaire.Ville', '=', 'Nom')) === false);
  delete cells['Annuaire.Ville'];

  // conditionHolds : les règles à colonne se mêlent aux règles à valeur, « all » / « any » comme avant.
  const conditionHolds = condition => { sctx.__COND = condition; return evalIn(sctx, 'ConditionRules.conditionHolds(__COND, "T", __REC)'); };
  sctx.__REC = rec;
  const both = [rule('Montant', '=', 'Paye'), { column: 'Nom', operator: '=', value: 'Dupont' }];
  check('une condition mêle règle à colonne et règle à valeur : « all » veut les deux, « any » une',
    await conditionHolds({ mode: 'all', rules: both }) === true
    && await conditionHolds({ mode: 'all', rules: [rule('Montant', '=', 'Reste'), both[1]] }) === false
    && await conditionHolds({ mode: 'any', rules: [rule('Montant', '=', 'Reste'), both[1]] }) === true
    && await conditionHolds({ mode: 'any', rules: [rule('Montant', '=', 'Reste'), { column: 'Nom', operator: '=', value: 'Martin' }] }) === false);
  check('une règle à colonne pas encore choisie est ignorée : elle ne fait pas échouer « all », et seule, elle laisse la variable s\'afficher',
    await conditionHolds({ mode: 'all', rules: [{ column: 'Nom', operator: '=', value: 'Dupont' }, { column: 'Montant', operator: '=', value: '', valueColumn: '' }] }) === true
    && await conditionHolds({ mode: 'all', rules: [{ column: 'Montant', operator: '=', value: '', valueColumn: '' }] }) === true);

  // elementHolds : la condition d'un bloc, d'une valeur, d'une case ou d'une bulle est lue dans data-condition.
  const element = condition => ({ getAttribute: name => (name === 'data-condition' ? JSON.stringify(condition) : null) });
  const verdict = (condition, whenNone) => { sctx.__EL = element(condition); return evalIn(sctx, `ConditionRules.elementHolds(__EL, 'T', __REC, ${whenNone})`); };
  check('data-condition avec valueColumn : le verdict suit les deux colonnes, quel que soit `whenNone`',
    JSON.stringify([await verdict({ mode: 'all', rules: [rule('Montant', '=', 'Paye')] }, false), await verdict({ mode: 'all', rules: [rule('Montant', '=', 'Reste')] }, true)]) === '[true,false]');
  check('data-condition dont la seule règle n\'a pas choisi sa colonne : pas de condition, le verdict `whenNone`',
    JSON.stringify([await verdict({ mode: 'all', rules: [{ column: 'Montant', operator: '=', value: '', valueColumn: '' }] }, true), await verdict({ mode: 'all', rules: [{ column: 'Montant', operator: '=', value: '', valueColumn: '' }] }, false)]) === '[true,false]');
}

summarizeAndExit();
