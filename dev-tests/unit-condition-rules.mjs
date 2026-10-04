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

summarizeAndExit();
